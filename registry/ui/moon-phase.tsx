"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MoonPhaseHemisphere = "north" | "south";

export type MoonPhaseProps = {
  /** Tonight: the moment the scrub counts from. Pass it, with `timeZone`, to render on the server. */
  now?: Date | number;
  /** The IANA time zone the dates are written in, e.g. "UTC". @default the runtime's own */
  timeZone?: string;
  /** Controlled night shown, in whole days from `now` (0 is tonight). */
  value?: number;
  /** Initial night shown when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, key or button that changed the night shown. */
  onValueChange?: (value: number) => void;
  /** How far the scrub reaches each way, in days. @default 60 */
  range?: number;
  /** Which way up the moon is seen; south turns it over and flips the drag. @default "north" */
  hemisphere?: MoonPhaseHemisphere;
  /** Draw the seas, the craters and the limb's shading. Off: a flat, graphic moon. @default true */
  detail?: boolean;
  /** The halo's size and strength, 0 to 1; it also follows how much is lit. @default 0.5 */
  glow?: number;
  /** The widget's name. @default "Moon" */
  label?: string;
  /** Tick once per night the visitor scrubs past. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const DAY = 86_400_000;
const RAD = Math.PI / 180;
const SYNODIC = 29.530588853;
/** The mean rate the elongation grows, in degrees a day. */
const RATE = 360 / SYNODIC;
/** Before the first clock reading, a fixed night: the server and the browser agree. */
const PLACEHOLDER = Date.UTC(2026, 0, 1, 21);

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * The Moon's elongation from the Sun, 0 to 360°: 0 is new, 180 full. The
 * mean elongation corrected by the six largest periodic terms (the Moon's and
 * the Sun's anomalies), which holds the phase to a few hours.
 */
function elongationAt(ms: number) {
  const jd = ms / DAY + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const D =
    297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T * T * T) / 545868;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
  const Mp =
    134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T * T * T) / 69699;
  const s = (deg: number) => Math.sin(deg * RAD);
  const e =
    D +
    6.289 * s(Mp) -
    2.1 * s(M) +
    1.274 * s(2 * D - Mp) +
    0.658 * s(2 * D) +
    0.214 * s(2 * Mp) +
    0.11 * s(D);
  return ((e % 360) + 360) % 360;
}

const litOf = (e: number) => (1 - Math.cos(e * RAD)) / 2;

/** The next moment after `ms` the elongation reaches `angle` (180 full, 0 new). */
function nextAt(ms: number, angle: number) {
  let gap = (((angle - elongationAt(ms)) % 360) + 360) % 360;
  if (gap < 1) gap += 360;
  let t = ms + (gap / RATE) * DAY;
  // Newton on the true elongation, with the mean rate as the slope: the real
  // rate stays within a quarter of it, so three steps land within minutes.
  for (let i = 0; i < 3; i += 1) {
    const off = ((((elongationAt(t) - angle) % 360) + 540) % 360) - 180;
    t -= (off / RATE) * DAY;
  }
  return t;
}

const NAMES: [number, string][] = [
  [7, "New moon"],
  [83, "Waxing crescent"],
  [97, "First quarter"],
  [173, "Waxing gibbous"],
  [187, "Full moon"],
  [263, "Waning gibbous"],
  [277, "Last quarter"],
  [353, "Waning crescent"],
  [361, "New moon"],
];

const nameOf = (e: number) =>
  NAMES.find(([upTo]) => e < upTo)?.[1] ?? "New moon";

/*
 * The drawing, in a 120-unit tile: the moon's centre and radius. The lit part
 * is one path — the bright limb as a half circle, closed by the terminator,
 * a half ellipse whose horizontal radius is R·|cos E| — so it is exact at
 * every phase and cheap to rebuild each frame.
 */
const C = 60;
const R = 40;

function litPath(e: number) {
  const k = Math.cos(e * RAD);
  const rx = r2(Math.max(0.01, Math.abs(k) * R));
  const top = `${C} ${C - R}`;
  const bottom = `${C} ${C + R}`;
  // Waxing, the limb is on the right (seen from the north) and the
  // terminator bulges toward it while crescent, away from it while gibbous.
  if (e < 180) {
    return `M ${top} A ${R} ${R} 0 0 1 ${bottom} A ${rx} ${R} 0 0 ${k > 0 ? 0 : 1} ${top} Z`;
  }
  return `M ${top} A ${R} ${R} 0 0 0 ${bottom} A ${rx} ${R} 0 0 ${k > 0 ? 1 : 0} ${top} Z`;
}

/** The near side's seas, as seen from the north: centre and radii, in moon radii. */
const SEAS = [
  { x: -0.28, y: -0.42, rx: 0.3, ry: 0.24 },
  { x: -0.6, y: -0.04, rx: 0.24, ry: 0.44 },
  { x: 0.12, y: -0.38, rx: 0.17, ry: 0.16 },
  { x: 0.3, y: -0.08, rx: 0.21, ry: 0.17 },
  { x: 0.66, y: -0.3, rx: 0.11, ry: 0.09 },
  { x: 0.55, y: 0.18, rx: 0.13, ry: 0.16 },
  { x: 0.35, y: 0.31, rx: 0.09, ry: 0.09 },
  { x: -0.2, y: 0.36, rx: 0.17, ry: 0.12 },
  { x: -0.48, y: 0.35, rx: 0.09, ry: 0.09 },
  { x: -0.05, y: -0.72, rx: 0.34, ry: 0.06 },
  { x: -0.02, y: -0.12, rx: 0.07, ry: 0.07 },
].map((m) => ({
  x: r2(C + m.x * R),
  y: r2(C + m.y * R),
  rx: r2(m.rx * R),
  ry: r2(m.ry * R),
}));

/** A few craters: two bright young ones and a dark floor. */
const CRATERS: { x: number; y: number; r: number; bright: boolean }[] = [
  { x: -0.14, y: 0.72, r: 0.045, bright: true },
  { x: -0.3, y: -0.12, r: 0.04, bright: true },
  { x: -0.56, y: -0.13, r: 0.025, bright: true },
  { x: -0.1, y: -0.7, r: 0.04, bright: false },
  { x: 0.42, y: 0.56, r: 0.035, bright: false },
].map((c) => ({
  x: r2(C + c.x * R),
  y: r2(C + c.y * R),
  r: r2(c.r * R),
  bright: c.bright,
}));

/** Faint rays thrown out from the bright southern crater. */
const RAYS = [200, 248, 292, 330, 22, 64, 128].map((deg, i) => {
  const a = deg * RAD;
  const from = 0.08 * R;
  const to = (0.28 + (i % 3) * 0.12) * R;
  const ox = C - 0.14 * R;
  const oy = C + 0.72 * R;
  return `M ${r2(ox + from * Math.cos(a))} ${r2(oy + from * Math.sin(a))} L ${r2(ox + to * Math.cos(a))} ${r2(oy + to * Math.sin(a))}`;
});

/** Seeded stars in the tile's corners, clear of the moon and its halo. */
const STARS = (() => {
  let s = 0x6c07_8965;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: { x: number; y: number; r: number; o: number }[] = [];
  while (out.length < 11) {
    const x = 6 + rand() * 108;
    const y = 6 + rand() * 108;
    const r = 0.5 + rand() * 0.7;
    const o = 0.35 + rand() * 0.55;
    if (Math.hypot(x - C, y - C) < R + 12) continue;
    out.push({ x: r2(x), y: r2(y), r: r2(r), o: r2(o) });
  }
  return out;
})();

/*
 * Pigments: the moon is a lit object, so its colours are hues at fixed
 * lightness and read the same in either theme, on a night tile that is the
 * same night in either theme.
 */
const LIT = "oklch(from var(--warn) 0.93 0.035 h)";
const SEA = "oklch(from var(--warn) 0.74 0.03 h)";
const BRIGHT = "oklch(from var(--warn) 0.98 0.02 h)";
const SHADOW = "oklch(from var(--accent) 0.32 0.03 h)";
const SHADOW_SEA = "oklch(from var(--accent) 0.27 0.03 h)";
const TILE =
  "radial-gradient(circle at 50% 42%, oklch(from var(--accent) 0.28 0.06 h), oklch(from var(--accent) 0.17 0.04 h))";

const FORMATS = new Map<string, Intl.DateTimeFormat>();
function dateText(ms: number, timeZone: string | undefined, long: boolean) {
  const key = `${timeZone ?? ""}|${long ? "l" : "s"}`;
  let f = FORMATS.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      weekday: long ? "long" : "short",
      day: "numeric",
      month: long ? "long" : "short",
      timeZone,
    });
    FORMATS.set(key, f);
  }
  return f.format(ms).replace(",", "");
}

const inDays = (n: number) =>
  n === 0 ? "tonight" : n === 1 ? "tomorrow" : `in ${n} days`;

const relative = (n: number) =>
  n === 0
    ? "tonight"
    : n === 1
      ? "tomorrow"
      : n === -1
        ? "yesterday"
        : n > 0
          ? `in ${n} days`
          : `${-n} days ago`;

/** The moon on a given moment: its phase's name, the share lit, and whether it is growing. */
export function moonOn(date: Date | number) {
  const e = elongationAt(typeof date === "number" ? date : date.getTime());
  return { phase: nameOf(e), lit: r3(litOf(e)), waxing: e < 180 };
}

type Next = { night: number; date: string; when: string; said: string };

/** The next full (180) or new (0) moon after a night, as the night it falls on. */
function nextNight(
  nowMs: number,
  night: number,
  angle: number,
  timeZone: string | undefined,
): Next {
  let at = nextAt(nowMs + night * DAY, angle);
  let n = Math.round((at - nowMs) / DAY);
  if (n <= night) {
    at = nextAt(at + DAY, angle);
    n = Math.round((at - nowMs) / DAY);
  }
  const ms = nowMs + n * DAY;
  const when = inDays(n - night);
  return {
    night: n,
    date: dateText(ms, timeZone, false),
    when,
    said: `${angle === 180 ? "Full moon" : "New moon"} on ${dateText(ms, timeZone, true)}, ${when}`,
  };
}

// Without a `now` prop the widget keeps its own clock, read only after
// hydration (the server snapshot is null) and paused while the page is hidden.
const CLOCK_STEP = 60_000;
const subscribeClock = (onChange: () => void) => {
  let timer = 0;
  const start = () => {
    if (!timer) timer = window.setInterval(onChange, CLOCK_STEP);
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else {
      onChange();
      start();
    }
  };
  if (!document.hidden) start();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
};
const readClock = () => Math.floor(Date.now() / CLOCK_STEP) * CLOCK_STEP;
const subscribeNothing = () => () => {};
const readNothing = () => null;

function PhaseGlyph({ full }: { full: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0">
      <circle
        cx={6}
        cy={6}
        r={5}
        strokeWidth={1.2}
        className={full ? "stroke-ink-3" : "fill-none stroke-ink-3"}
        style={full ? { fill: LIT } : undefined}
      />
      {full ? null : <circle cx={6} cy={6} r={3.2} className="fill-ink-3/40" />}
    </svg>
  );
}

type Api = {
  glideTo: (n: number, velocity?: number) => void;
  halt: () => void;
  onOffset: (o: number) => void;
};

/**
 * A moon widget. The night tile shows the moon as it is on a given night —
 * the phase computed from the date, the lit part drawn as the bright limb
 * closed by the terminator's half ellipse — and beside it the phase's name,
 * how much is lit, and the next full and new moon.
 *
 * Drag across the moon to move through the nights: its own width is a week,
 * and the drag runs the way the shadow does (right to left through the month
 * seen from the north), so the terminator travels with the finger. A release
 * projects the throw and the nights glide to the nearest whole one on the
 * glide spring with the release velocity, ticking once per night. The Full
 * and New rows are buttons that glide the moon to that night; Tonight comes
 * back. The tile is a slider: arrow keys step a night, Page keys a week, and
 * Escape returns to tonight.
 *
 * Seen from the south the whole moon turns over on the glide spring. Under
 * reduced motion nothing glides or turns — a key, a throw or a row swaps
 * straight to its night — while the lit part, its share and the dates still
 * follow the drag, because they are the information.
 */
export function MoonPhase({
  now,
  timeZone,
  value,
  defaultValue = 0,
  onValueChange,
  range = 60,
  hemisphere = "north",
  detail = true,
  glow = 0.5,
  label = "Moon",
  sound = false,
  disabled = false,
  className,
}: MoonPhaseProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const litId = `moon-lit-${uid}`;
  const diskId = `moon-disk-${uid}`;
  const haloId = `moon-halo-${uid}`;
  const limbId = `moon-limb-${uid}`;
  const seaId = `moon-sea-${uid}`;
  const darkSeaId = `moon-dark-sea-${uid}`;
  const hintId = `moon-hint-${uid}`;
  const reach = Math.max(1, Math.round(range));
  const lowest = -reach;
  const bloom = clamp(glow, 0, 1);
  const south = hemisphere === "south";
  // The shadow crosses the face right to left through the month seen from
  // the north, left to right from the south: the drag runs with it.
  const dir = south ? 1 : -1;

  const clockMs = React.useSyncExternalStore(
    now === undefined ? subscribeClock : subscribeNothing,
    now === undefined ? readClock : readNothing,
    readNothing,
  );
  const nowMs =
    now !== undefined
      ? typeof now === "number"
        ? now
        : now.getTime()
      : (clockMs ?? PLACEHOLDER);

  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), -reach, reach),
  );
  const [check, setCheck] = React.useState(0);
  const controlled = value !== undefined;
  const night = clamp(Math.round(controlled ? value : own), -reach, reach);

  const offset = useMotionValue(night);
  const turn = useMotionValue(south ? 180 : 0);
  const heading = React.useRef(night);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const turning = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const handed = React.useRef(false);
  const start = React.useRef(0);
  const lastNight = React.useRef<number | null>(night);
  const tileRef = React.useRef<HTMLDivElement | null>(null);
  const api = React.useRef<Api | null>(null);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const announce = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const halt = () => {
    anim.current?.stop();
    anim.current = null;
  };

  const glideTo = (n: number, velocity = 0) => {
    halt();
    if (!motionSafe) {
      offset.set(n);
      return;
    }
    const controls = animate(offset, n, {
      ...springs.glide,
      velocity,
      onComplete: () => {
        if (anim.current === controls) anim.current = null;
      },
    });
    anim.current = controls;
  };

  /** A tick per night the visitor's scrub crosses; brighter at full and new. */
  const onOffset = (o: number) => {
    const n = Math.round(o);
    const prev = lastNight.current;
    lastNight.current = n;
    if (!handed.current || prev === null || prev === n) return;
    const e = elongationAt(nowMs + n * DAY);
    const rect = tileRef.current?.getBoundingClientRect();
    const pan = rect ? panFrom(rect.left + rect.width / 2, null) : 0;
    const name = nameOf(e);
    if (name === "Full moon") {
      audio.play("tick", { pitch: 1.6, gain: 0.6, pan });
    } else if (name === "New moon") {
      audio.play("tick", { pitch: 0.62, gain: 0.6, pan });
    } else {
      audio.play("tick", { pitch: r2(0.8 + 0.6 * litOf(e)), gain: 0.42, pan });
    }
  };

  React.useEffect(() => {
    api.current = { glideTo, halt, onOffset };
  });

  React.useEffect(
    () => offset.on("change", (o) => api.current?.onOffset(o)),
    [offset],
  );

  // What the host says the night is: its own changes glide silently, and a
  // host that refused a scrub gets its own night back once it has answered.
  React.useEffect(() => {
    if (dragging.current) return;
    if (heading.current === night) return;
    heading.current = night;
    if (!(handed.current && anim.current !== null)) handed.current = false;
    api.current?.glideTo(night);
  }, [night, check]);

  // Seen from the other hemisphere, the moon turns over.
  React.useEffect(() => {
    const to = south ? 180 : 0;
    turning.current?.stop();
    if (!motionSafe || turn.get() === to) {
      turn.set(to);
      return;
    }
    turning.current = animate(turn, to, springs.glide);
  }, [south, motionSafe, turn]);

  React.useEffect(
    () => () => {
      anim.current?.stop();
      turning.current?.stop();
    },
    [],
  );

  const sentence = (n: number) => {
    const ms = nowMs + n * DAY;
    const e = elongationAt(ms);
    return `${dateText(ms, timeZone, true)}: ${nameOf(e).toLowerCase()}, ${Math.round(litOf(e) * 100)}% lit`;
  };

  const commit = (
    next: number,
    via: "pointer" | "key" | "button",
    velocity = 0,
  ) => {
    const n = clamp(Math.round(next), -reach, reach);
    handed.current = true;
    heading.current = n;
    glideTo(n, velocity);
    if (n !== night) {
      if (!controlled) setOwn(n);
      onValueChange?.(n);
      if (controlled) React.startTransition(() => setCheck((c) => c + 1));
    }
    if (via !== "key") announce(`${sentence(n)}.`);
  };

  const pxPerDay = () => {
    const width = tileRef.current?.getBoundingClientRect().width ?? 0;
    // The moon's own diameter is a week.
    return Math.max(1, (width * ((2 * R) / 120)) / 7);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      handed.current = true;
      halt();
      start.current = offset.get();
    },
    onMove: ({ offset: o }) => {
      const raw = start.current + (dir * o.x) / pxPerDay();
      const shown =
        raw < -reach
          ? -reach + rubberband(raw + reach, 7)
          : raw > reach
            ? reach + rubberband(raw - reach, 7)
            : raw;
      offset.set(r3(shown));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const v = (dir * velocity.x) / pxPerDay();
      const from = offset.get();
      const landing = motionSafe ? project(from, v, 0.99) : from;
      commit(landing, "pointer", motionSafe ? v : 0);
    },
    onCancel: () => {
      dragging.current = false;
      glideTo(heading.current);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = night + 1;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = night - 1;
        break;
      case "PageUp":
        next = night + 7;
        break;
      case "PageDown":
        next = night - 7;
        break;
      case "Home":
        next = -reach;
        break;
      case "End":
        next = reach;
        break;
      case "Escape":
        // Only when there is a tonight to go back to; otherwise the Escape
        // belongs to whatever holds the widget.
        if (night !== 0) {
          event.preventDefault();
          commit(0, "key");
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    if (clamp(next, -reach, reach) === night) return;
    commit(next, "key");
  };

  const view = useTransform(offset, (o) => {
    const e = elongationAt(nowMs + o * DAY);
    return { e, k: litOf(e) };
  });
  const lit = useTransform(view, (v) => litPath(v.e));
  const haloOpacity = useTransform(view, (v) =>
    r2(bloom * (0.25 + 0.75 * v.k)),
  );
  const percent = useTransform(view, (v) => `${Math.round(v.k * 100)}%`);
  const phase = useTransform(view, (v) => nameOf(v.e));
  const whole = useTransform(offset, (o) => Math.round(o));
  const header = useTransform(whole, (n) =>
    n === 0
      ? `Tonight · ${dateText(nowMs, timeZone, false)}`
      : `${dateText(nowMs + n * DAY, timeZone, false)} · ${relative(n)}`,
  );
  const nextFull = useTransform(whole, (n) =>
    nextNight(nowMs, n, 180, timeZone),
  );
  const nextNew = useTransform(whole, (n) => nextNight(nowMs, n, 0, timeZone));
  const fullDate = useTransform(nextFull, (x) => x.date);
  const fullWhen = useTransform(nextFull, (x) => x.when);
  const newDate = useTransform(nextNew, (x) => x.date);
  const newWhen = useTransform(nextNew, (x) => x.when);

  const committedFull = nextNight(nowMs, night, 180, timeZone);
  const committedNew = nextNight(nowMs, night, 0, timeZone);
  const haloR = r2(R * (1 + 0.42 * bloom));

  const rows: { key: string; full: boolean; next: Next }[] = [
    { key: "full", full: true, next: committedFull },
    { key: "new", full: false, next: committedNew },
  ];

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "w-full max-w-80 rounded-4 border border-hairline bg-card p-3 text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="mb-3 flex h-6 items-center justify-between gap-2">
        <motion.p
          aria-hidden
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {header}
        </motion.p>
        <AnimatePresence initial={false}>
          {night !== 0 ? (
            <motion.button
              key="tonight"
              type="button"
              disabled={disabled}
              onClick={() => commit(0, "button")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className={cn(
                "inline-flex h-6 shrink-0 cursor-pointer items-center rounded-full border border-hairline px-2.5 text-[11px] font-medium text-ink-2 transition-colors outline-none",
                "hover:bg-surface-2 hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              Tonight
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-4">
        <div
          ref={tileRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={`${label}, night shown`}
          aria-describedby={hintId}
          aria-valuemin={lowest}
          aria-valuemax={reach}
          aria-valuenow={night}
          aria-valuetext={sentence(night)}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          {...drag}
          style={{ background: TILE }}
          className={cn(
            "relative size-29 shrink-0 touch-pan-y overflow-clip rounded-3 border border-hairline outline-none select-none [-webkit-touch-callout:none]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-not-allowed" : "cursor-ew-resize",
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 120 120"
            className="absolute inset-0 block size-full"
          >
            <defs>
              <clipPath id={litId}>
                <motion.path d={lit} />
              </clipPath>
              <clipPath id={diskId}>
                <circle cx={C} cy={C} r={R} />
              </clipPath>
              <radialGradient id={haloId}>
                <stop
                  offset={r3(R / haloR)}
                  style={{ stopColor: LIT, stopOpacity: 0.55 }}
                />
                <stop offset={1} style={{ stopColor: LIT, stopOpacity: 0 }} />
              </radialGradient>
              <radialGradient id={seaId}>
                <stop
                  offset={0}
                  style={{ stopColor: SEA, stopOpacity: 0.85 }}
                />
                <stop
                  offset={0.6}
                  style={{ stopColor: SEA, stopOpacity: 0.7 }}
                />
                <stop offset={1} style={{ stopColor: SEA, stopOpacity: 0 }} />
              </radialGradient>
              <radialGradient id={darkSeaId}>
                <stop
                  offset={0.6}
                  style={{ stopColor: SHADOW_SEA, stopOpacity: 1 }}
                />
                <stop
                  offset={1}
                  style={{ stopColor: SHADOW_SEA, stopOpacity: 0 }}
                />
              </radialGradient>
              <radialGradient id={limbId}>
                <stop offset={0.55} stopColor="black" stopOpacity={0} />
                <stop offset={1} stopColor="black" stopOpacity={0.24} />
              </radialGradient>
            </defs>

            <g className="fill-white">
              {STARS.map((s) => (
                <circle
                  key={`${s.x}-${s.y}`}
                  cx={s.x}
                  cy={s.y}
                  r={s.r}
                  opacity={s.o}
                />
              ))}
            </g>

            <motion.g style={{ rotate: turn, originX: 0.5, originY: 0.5 }}>
              <motion.circle
                cx={C}
                cy={C}
                r={haloR}
                fill={`url(#${haloId})`}
                style={{ opacity: haloOpacity }}
              />
              <circle cx={C} cy={C} r={R} style={{ fill: SHADOW }} />
              {detail ? (
                <g clipPath={`url(#${diskId})`} fill={`url(#${darkSeaId})`}>
                  {SEAS.map((m) => (
                    <ellipse
                      key={`${m.x}-${m.y}`}
                      cx={m.x}
                      cy={m.y}
                      rx={m.rx}
                      ry={m.ry}
                    />
                  ))}
                </g>
              ) : null}
              <motion.path d={lit} style={{ fill: LIT }} />
              {detail ? (
                <g clipPath={`url(#${litId})`}>
                  <g fill={`url(#${seaId})`}>
                    {SEAS.map((m) => (
                      <ellipse
                        key={`${m.x}-${m.y}`}
                        cx={m.x}
                        cy={m.y}
                        rx={m.rx}
                        ry={m.ry}
                      />
                    ))}
                  </g>
                  <g
                    strokeWidth={0.6}
                    strokeLinecap="round"
                    opacity={0.4}
                    style={{ stroke: BRIGHT }}
                  >
                    {RAYS.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </g>
                  {CRATERS.map((c) => (
                    <circle
                      key={`${c.x}-${c.y}`}
                      cx={c.x}
                      cy={c.y}
                      r={c.r}
                      style={{ fill: c.bright ? BRIGHT : SEA }}
                    />
                  ))}
                  <circle cx={C} cy={C} r={R} fill={`url(#${limbId})`} />
                </g>
              ) : null}
            </motion.g>
          </svg>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div aria-hidden className="min-w-0">
            <motion.p className="truncate text-sm font-medium text-foreground">
              {phase}
            </motion.p>
            <p className="flex items-baseline gap-1.5">
              <motion.span className="font-mono text-2xl leading-tight text-foreground tabular-nums">
                {percent}
              </motion.span>
              <span className="text-xs text-ink-3">lit</span>
            </p>
          </div>
          <div className="flex flex-col border-t border-hairline pt-1.5">
            {rows.map(({ key, full, next }) => {
              const beyond = Math.abs(next.night) > reach;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled || beyond}
                  aria-label={next.said}
                  onClick={() => commit(next.night, "button")}
                  className={cn(
                    "-mx-1.5 flex flex-col gap-0.5 rounded-2 px-1.5 py-1 text-left transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
                    "enabled:cursor-pointer enabled:hover:bg-surface-2 disabled:cursor-not-allowed",
                  )}
                >
                  <span className="flex w-full items-center gap-1.5 text-xs">
                    <PhaseGlyph full={full} />
                    <span className="font-medium text-foreground">
                      {full ? "Full moon" : "New moon"}
                    </span>
                    <motion.span className="ml-auto truncate text-ink-3">
                      {full ? fullWhen : newWhen}
                    </motion.span>
                  </span>
                  <motion.span className="pl-4.5 font-mono text-[11px] text-ink-2 tabular-nums">
                    {full ? fullDate : newDate}
                  </motion.span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Drag across the moon, or use the arrow keys, to move through the nights.
        Page Up and Page Down move a week; Escape returns to tonight.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
