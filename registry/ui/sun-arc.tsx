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
import {
  project,
  rubberband,
  useDrag,
  type DragInfo,
} from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SunArcClock = "12" | "24";

export type SunArcProps = {
  /** Sunrise, in minutes after local midnight (06:14 is 374). */
  sunrise: number;
  /** Sunset, in minutes after local midnight. */
  sunset: number;
  /** First light, in minutes after midnight. @default sunrise − 30 */
  dawn?: number;
  /** Last light, in minutes after midnight. @default sunset + 30 */
  dusk?: number;
  /** The live moment the sun follows while the value is null. Pass it, with `timeZone`, to render on the server. */
  now?: Date | number;
  /** The IANA time zone `now` is read in, e.g. "UTC". @default the runtime's own */
  timeZone?: string;
  /** Controlled time shown, in minutes after midnight; null follows `now`. */
  value?: number | null;
  /** Initial time shown when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the drag, tap, key or Now press that changed it. */
  onValueChange?: (value: number | null) => void;
  /** Minutes per arrow key, and the grid a scrub lands on. @default 5 */
  step?: number;
  /** Times in 24-hour or 12-hour form. @default "24" */
  clock?: SunArcClock;
  /** Paint the sky, the ground and the stars with the hour. Off: a quiet panel on the card. @default true */
  sky?: boolean;
  /** The dawn and dusk marks, and a dot on the arc for every whole hour. @default true */
  marks?: boolean;
  /** The widget's name, shown over the reading when there is room. @default "Daylight" */
  label?: string;
  /** Tick once per hour the visitor scrubs past. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The panel's drawing box. Time runs left to right from first to last light. */
const W = 600;
const H = 176;
/** The horizon, and how high the arc climbs above it at noon. */
const HY = 132;
const AMP = 100;
const X0 = 28;
const X1 = 572;
const SUN = 13;
const DEEPEST = H - 18;
const HY_PCT = Number(((HY / H) * 100).toFixed(3));
const EDGE_PCT = Number(((X0 / W) * 100).toFixed(3));

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Day = {
  dawn: number;
  rise: number;
  set: number;
  dusk: number;
  /** The golden hour's length at either end of the day, in minutes. */
  golden: number;
};

function dayOf(
  sunrise: number,
  sunset: number,
  dawn?: number,
  dusk?: number,
): Day {
  const rise = clamp(sunrise, 0, 1380);
  const set = clamp(sunset, rise + 30, 1440);
  return {
    rise,
    set,
    dawn: Math.min(dawn ?? rise - 30, rise - 1),
    dusk: Math.max(dusk ?? set + 30, set + 1),
    golden: Math.min(75, (set - rise) / 4),
  };
}

const xOf = (d: Day, t: number) =>
  X0 + ((t - d.dawn) / (d.dusk - d.dawn)) * (X1 - X0);

/** The sun's altitude as a share of noon's: 0 at sunrise and sunset, below 0 in twilight. */
function altOf(d: Day, t: number) {
  const s = Math.sin((Math.PI * (t - d.rise)) / (d.set - d.rise));
  return t < d.rise || t > d.set ? -Math.abs(s) : s;
}

const yOf = (d: Day, t: number) => Math.min(DEEPEST, HY - AMP * altOf(d, t));

const pad = (n: number) => String(n).padStart(2, "0");

/** A clock time; minutes past midnight wrap into the day. */
function clockText(m: number, clock: SunArcClock) {
  const w = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(w / 60);
  const mm = w % 60;
  if (clock === "24") return `${pad(h)}:${pad(mm)}`;
  return `${h % 12 || 12}:${pad(mm)} ${h < 12 ? "am" : "pm"}`;
}

/** "4 h 12 m" — minutes padded so the reading holds its width. */
function spanText(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} m`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} m`;
}

function spoken(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m === 0) return "less than a minute";
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hours = h > 0 ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = r > 0 ? `${r} ${r === 1 ? "minute" : "minutes"}` : "";
  return [hours, mins].filter(Boolean).join(" ");
}

type Reading = { big: string; caption: string; said: string };

function readingOf(d: Day, t: number, clock: SunArcClock): Reading {
  if (t < d.rise) {
    return {
      big: spanText(d.rise - t),
      caption: "until sunrise",
      said: `${spoken(d.rise - t)} until sunrise`,
    };
  }
  if (t < d.set) {
    return {
      big: spanText(d.set - t),
      caption: "of daylight left",
      said: `${spoken(d.set - t)} of daylight left`,
    };
  }
  if (t < d.dusk) {
    return {
      big: spanText(d.dusk - t),
      caption: "until dark",
      said: `${spoken(d.dusk - t)} until dark`,
    };
  }
  const since = clockText(d.dusk, clock);
  return {
    big: "Dark",
    caption: `since ${since}`,
    said: `dark since ${since}`,
  };
}

type Phase = "night" | "dawn" | "day" | "dusk" | "dark";

const phaseOf = (d: Day, t: number): Phase =>
  t < d.dawn
    ? "night"
    : t < d.rise
      ? "dawn"
      : t < d.set
        ? "day"
        : t < d.dusk
          ? "dusk"
          : "dark";

/*
 * The sky is a picture, not a surface: each colour is a token's hue at a
 * fixed lightness, so it is the same sky in a light or a dark theme. Between
 * two keyframes the panel mixes the neighbours in oklab, which keeps the hue
 * when a colour heads toward dark.
 */
type Tint = { top: string; horizon: string; ground: string };

const SKY: Record<"night" | "dawn" | "rise" | "day" | "set" | "dusk", Tint> = {
  night: {
    top: "oklch(from var(--accent) 0.2 0.05 h)",
    horizon: "oklch(from var(--accent) 0.3 0.07 h)",
    ground: "oklch(from var(--accent) 0.17 0.03 h)",
  },
  dawn: {
    top: "oklch(from var(--accent) 0.34 0.09 h)",
    horizon: "oklch(from var(--danger) 0.68 0.1 h)",
    ground: "oklch(from var(--accent) 0.23 0.04 h)",
  },
  rise: {
    top: "oklch(from var(--accent-bright) 0.6 0.1 calc(h - 16))",
    horizon: "oklch(from var(--warn) 0.85 0.11 h)",
    ground: "oklch(from var(--success) 0.34 0.045 h)",
  },
  day: {
    top: "oklch(from var(--accent-bright) 0.7 0.11 calc(h - 22))",
    horizon: "oklch(from var(--accent-bright) 0.9 0.035 calc(h - 30))",
    ground: "oklch(from var(--success) 0.43 0.055 h)",
  },
  set: {
    top: "oklch(from var(--accent) 0.48 0.12 h)",
    horizon: "oklch(from var(--danger) 0.74 0.14 calc(h + 24))",
    ground: "oklch(from var(--success) 0.3 0.045 h)",
  },
  dusk: {
    top: "oklch(from var(--accent) 0.3 0.1 calc(h + 28))",
    horizon: "oklch(from var(--danger) 0.52 0.13 h)",
    ground: "oklch(from var(--accent) 0.21 0.04 h)",
  },
};

/** The sun high (almost white) and low (deep orange): warn's hue, turned. */
const SUN_HIGH = "oklch(from var(--warn) 0.96 0.07 calc(h + 16))";
const SUN_LOW = "oklch(from var(--warn) 0.76 0.17 calc(h - 28))";
const DAYLIGHT = "oklch(from var(--warn) 0.82 0.14 h)";
const TWILIGHT = "oklch(from var(--danger) 0.7 0.1 h)";

type Key = { t: number; c: Tint };

const skyKeys = (d: Day): Key[] => [
  { t: d.dawn - 40, c: SKY.night },
  { t: d.dawn, c: SKY.dawn },
  { t: d.rise, c: SKY.rise },
  { t: d.rise + d.golden, c: SKY.day },
  { t: d.set - d.golden, c: SKY.day },
  { t: d.set, c: SKY.set },
  { t: d.dusk, c: SKY.dusk },
  { t: d.dusk + 40, c: SKY.night },
];

const mix = (a: string, b: string, f: number) =>
  f < 0.01
    ? a
    : f > 0.99
      ? b
      : `color-mix(in oklab, ${a} ${Math.round((1 - f) * 100)}%, ${b})`;

function tintAt(keys: Key[], t: number): Tint {
  const first = keys[0];
  if (!first || t <= first.t) return SKY.night;
  for (let i = 1; i < keys.length; i += 1) {
    const a = keys[i - 1];
    const b = keys[i];
    if (!a || !b || t > b.t) continue;
    const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
    return {
      top: mix(a.c.top, b.c.top, f),
      horizon: mix(a.c.horizon, b.c.horizon, f),
      ground: mix(a.c.ground, b.c.ground, f),
    };
  }
  return SKY.night;
}

/** How dark the sky is, 0 by day to 1 at night: the stars' opacity. */
function nightOf(d: Day, t: number) {
  if (t <= d.dawn - 40 || t >= d.dusk + 40) return 1;
  if (t < d.rise) return 1 - (t - (d.dawn - 40)) / (d.rise - d.dawn + 40);
  if (t > d.set) return (t - d.set) / (d.dusk + 40 - d.set);
  return 0;
}

/** The glow the low sun throws on the horizon, 0 to 1. */
function glowOf(d: Day, t: number) {
  if (t < d.dawn - 20 || t > d.dusk + 20) return 0;
  const a = altOf(d, clamp(t, d.dawn, d.dusk));
  return a >= 0 ? clamp(1 - a / 0.4, 0, 1) : clamp(1 + a / 0.2, 0, 1);
}

function archPath(d: Day) {
  const out: string[] = [];
  const n = 150;
  for (let i = 0; i <= n; i += 1) {
    const t = d.dawn + ((d.dusk - d.dawn) * i) / n;
    out.push(`${r2(xOf(d, t))} ${r2(yOf(d, t))}`);
  }
  return `M ${out.join(" L ")}`;
}

/** A seeded field of stars, the same on the server and in every browser. */
const STARS = (() => {
  let s = 0x2545_f491;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: 26 }, () => ({
    x: r2(14 + rand() * (W - 28)),
    y: r2(8 + rand() * (HY - 46)),
    r: r2(0.7 + rand() * 1.1),
    o: r2(0.4 + rand() * 0.6),
  }));
})();

/*
 * Minutes after midnight for a moment, read in a named zone. The formatter is
 * made once per zone; with a zone given, Node and the browser agree exactly.
 */
const FORMATS = new Map<string, Intl.DateTimeFormat>();
function minutesOf(ms: number, timeZone?: string) {
  const key = timeZone ?? "";
  let f = FORMATS.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    FORMATS.set(key, f);
  }
  let h = 0;
  let m = 0;
  let s = 0;
  for (const part of f.formatToParts(ms)) {
    if (part.type === "hour") h = Number(part.value);
    else if (part.type === "minute") m = Number(part.value);
    else if (part.type === "second") s = Number(part.value);
  }
  return h * 60 + m + Math.round(s / 6) / 10;
}

// Without a `now` prop the widget keeps its own clock, read only after
// hydration (the server snapshot is null) and paused while the page is hidden.
const CLOCK_STEP = 15_000;
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

function HorizonGlyph({ rising }: { rising: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0 text-ink-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12.5h12" />
      <path d="M4.5 12.5a3.5 3.5 0 0 1 7 0" />
      <path
        d={
          rising
            ? "M8 2v4.5M6.2 3.8 8 2l1.8 1.8"
            : "M8 2v4.5M6.2 4.7 8 6.5l1.8-1.8"
        }
      />
    </svg>
  );
}

type Api = {
  glideTo: (t: number, velocity?: number) => void;
  halt: () => void;
  onMinute: (t: number) => void;
};

/**
 * A daylight widget. The sun rides a sine arch over the horizon — time runs
 * left to right from first to last light and the height is the sun's
 * altitude — and the sky behind it takes the hour's colours, from night
 * through dawn, the day's blue and the golden hours to dusk. Beside it, the
 * daylight left.
 *
 * Press anywhere in the sky and the sun comes to the finger on the flick
 * spring, then follows it 1:1 along the arch; past first or last light it
 * rubber-bands. A release projects the throw and the sun glides to the
 * landing on the glide spring with the release velocity. The rail under the
 * panel lines up with the arch and is a real slider: arrow keys step, Page
 * keys move an hour, Home and End go to first and last light, and Escape (or
 * the Now pill) returns to the present. Scrubbing ticks once per hour.
 *
 * Under reduced motion the sun never glides — it lands where it is let go or
 * where a key puts it — while the sky, the reading and the stars still change,
 * because they are the information.
 */
export function SunArc({
  sunrise,
  sunset,
  dawn,
  dusk,
  now,
  timeZone,
  value,
  defaultValue = null,
  onValueChange,
  step = 5,
  clock = "24",
  sky = true,
  marks = true,
  label = "Daylight",
  sound = false,
  disabled = false,
  className,
}: SunArcProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const upId = `sun-up-${uid}`;
  const downId = `sun-down-${uid}`;
  const hazeId = `sun-haze-${uid}`;
  const hintId = `sun-hint-${uid}`;

  const day = React.useMemo(
    () => dayOf(sunrise, sunset, dawn, dusk),
    [sunrise, sunset, dawn, dusk],
  );
  const span = day.dusk - day.dawn;
  const unit = Math.max(1, step);
  const keys = React.useMemo(() => skyKeys(day), [day]);
  const arch = React.useMemo(() => archPath(day), [day]);
  const hourDots = React.useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let h = Math.ceil(day.dawn / 60); h * 60 <= day.dusk; h += 1) {
      const x = xOf(day, h * 60);
      if (x < X0 + 10 || x > X1 - 10) continue;
      out.push({ x: r2(x), y: r2(yOf(day, h * 60)) });
    }
    return out;
  }, [day]);

  const clockMs = React.useSyncExternalStore(
    now === undefined ? subscribeClock : subscribeNothing,
    now === undefined ? readClock : readNothing,
    readNothing,
  );
  const ready = now !== undefined || clockMs !== null;
  const liveAt =
    now !== undefined
      ? minutesOf(typeof now === "number" ? now : now.getTime(), timeZone)
      : clockMs !== null
        ? minutesOf(clockMs, timeZone)
        : (day.rise + day.set) / 2;

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const [check, setCheck] = React.useState(0);
  const controlled = value !== undefined;
  const picked = controlled ? value : own;
  const inRange = (t: number) => clamp(t, day.dawn, day.dusk);
  const quantize = (t: number) => inRange(Math.round(t / unit) * unit);
  const shownPick = picked === null ? null : inRange(picked);
  const target = shownPick ?? liveAt;

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  // While the widget is live, the moments that matter are spoken as the
  // clock reaches them — sunrise, sunset, last light — once each.
  const livePhase = phaseOf(day, liveAt);
  const [seen, setSeen] = React.useState({ phase: livePhase, ready });
  if (seen.phase !== livePhase || seen.ready !== ready) {
    setSeen({ phase: livePhase, ready });
    if (seen.ready && picked === null) {
      const text =
        livePhase === "dawn"
          ? `First light, ${clockText(day.dawn, clock)}.`
          : livePhase === "day"
            ? `Sunrise, ${clockText(day.rise, clock)}.`
            : livePhase === "dusk"
              ? `Sunset, ${clockText(day.set, clock)}.`
              : livePhase === "dark"
                ? `Last light, ${clockText(day.dusk, clock)}.`
                : "";
      if (text) setSaid({ n: said.n + 1, text });
    }
  }

  const minute = useMotionValue(target);
  const heading = React.useRef(target);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const catching = React.useRef(false);
  const handed = React.useRef(false);
  const lastMinute = React.useRef<number | null>(target);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const api = React.useRef<Api | null>(null);

  const halt = () => {
    anim.current?.stop();
    anim.current = null;
  };

  const glideTo = (t: number, velocity = 0) => {
    halt();
    if (!motionSafe) {
      minute.set(r3(t));
      return;
    }
    const controls = animate(minute, t, {
      ...springs.glide,
      velocity,
      onComplete: () => {
        if (anim.current === controls) anim.current = null;
      },
    });
    anim.current = controls;
  };

  /** A tick per whole hour the visitor's scrub crosses, and at sunrise and sunset. */
  const onMinute = (t: number) => {
    const prev = lastMinute.current;
    lastMinute.current = t;
    if (!handed.current || prev === null) return;
    const a = inRange(prev);
    const b = inRange(t);
    const x = xOf(day, b);
    const pan = r2(((x / W) * 2 - 1) * 0.6);
    const crossed = (edge: number) => (a - edge) * (b - edge) < 0;
    if (crossed(day.rise) || crossed(day.set)) {
      audio.play("tick", { pitch: 1.4, gain: 0.6, pan });
    } else if (Math.floor(a / 60) !== Math.floor(b / 60)) {
      const lift = Math.max(0, altOf(day, b));
      audio.play("tick", { pitch: r2(0.72 + 0.5 * lift), gain: 0.45, pan });
    }
  };

  React.useEffect(() => {
    api.current = { glideTo, halt, onMinute };
  });

  React.useEffect(
    () => minute.on("change", (t) => api.current?.onMinute(t)),
    [minute],
  );

  // Where the host or the clock says the sun is. The visitor's own commits
  // have already set off toward their landing; this catches the rest — a
  // clock step (moved directly, it is a hair), the first real reading or a
  // host's own value (glided), and a controlled host that refused a scrub.
  React.useEffect(() => {
    if (dragging.current) return;
    if (Math.abs(heading.current - target) < 1e-3) return;
    heading.current = target;
    const visitorGliding = handed.current && anim.current !== null;
    if (!visitorGliding) handed.current = false;
    if (Math.abs(minute.get() - target) < 2) {
      api.current?.halt();
      minute.set(r3(target));
      return;
    }
    api.current?.glideTo(target);
  }, [target, check, minute]);

  React.useEffect(() => () => anim.current?.stop(), []);

  const announce = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const commit = (next: number, via: "pointer" | "key", velocity = 0) => {
    handed.current = true;
    heading.current = next;
    glideTo(next, velocity);
    if (next !== picked) {
      if (!controlled) setOwn(next);
      onValueChange?.(next);
      // A controlled host answers on its own schedule; once it has had its
      // turn, a host that refused gets its own value back.
      if (controlled) React.startTransition(() => setCheck((c) => c + 1));
    }
    if (via === "pointer") {
      announce(
        `${clockText(next, clock)}: ${readingOf(day, next, clock).said}.`,
      );
    }
  };

  const goLive = (via: "pointer" | "key") => {
    if (picked === null) return;
    handed.current = true;
    heading.current = liveAt;
    glideTo(liveAt);
    if (!controlled) setOwn(null);
    onValueChange?.(null);
    if (controlled) React.startTransition(() => setCheck((c) => c + 1));
    if (via === "pointer") {
      announce(
        `Back to now, ${clockText(liveAt, clock)}: ${readingOf(day, liveAt, clock).said}.`,
      );
    }
  };

  const timeAt = (clientX: number, kind: "panel" | "rail") => {
    const el = kind === "panel" ? panelRef.current : railRef.current;
    const rect = el?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return heading.current;
    const u =
      kind === "panel"
        ? (((clientX - rect.left) / rect.width) * W - X0) / (X1 - X0)
        : (clientX - rect.left) / rect.width;
    return day.dawn + u * span;
  };

  const minutesPerPx = (kind: "panel" | "rail") => {
    const el = kind === "panel" ? panelRef.current : railRef.current;
    const width = el?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return 0;
    return kind === "panel" ? (span * W) / ((X1 - X0) * width) : span / width;
  };

  /** The sun under the finger: set directly, or caught up on flick first. */
  const follow = (raw: number) => {
    const t =
      raw < day.dawn
        ? day.dawn + rubberband(raw - day.dawn, span * 0.1)
        : raw > day.dusk
          ? day.dusk + rubberband(raw - day.dusk, span * 0.1)
          : raw;
    if (catching.current) {
      if (Math.abs(minute.get() - t) > span * 0.006) {
        anim.current?.stop();
        anim.current = animate(minute, t, springs.flick);
        return;
      }
      catching.current = false;
    }
    halt();
    minute.set(r3(t));
  };

  const dragStart = (kind: "panel" | "rail", { point }: DragInfo) => {
    dragging.current = true;
    handed.current = true;
    halt();
    const t = timeAt(point.x, kind);
    const gap = Math.abs(
      xOf(day, inRange(t)) - xOf(day, inRange(minute.get())),
    );
    catching.current = motionSafe && gap > 14;
    follow(t);
  };

  const dragEnd = (kind: "panel" | "rail", { velocity }: DragInfo) => {
    dragging.current = false;
    catching.current = false;
    // The release velocity in px/s (it includes the release itself, so a
    // pause before letting go reads as still), turned into minutes per second.
    const v = velocity.x * minutesPerPx(kind);
    const from = minute.get();
    // A heavy surface: the sun coasts a little past a flick, not far.
    const landing = quantize(motionSafe ? project(from, v, 0.99) : from);
    commit(landing, "pointer", motionSafe ? v : 0);
  };

  const dragCancel = () => {
    dragging.current = false;
    catching.current = false;
    glideTo(heading.current);
  };

  const panelDrag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: (info) => dragStart("panel", info),
    onMove: ({ point }) => follow(timeAt(point.x, "panel")),
    onEnd: (info) => dragEnd("panel", info),
    onCancel: dragCancel,
    onTap: (event) =>
      commit(quantize(timeAt(event.clientX, "panel")), "pointer"),
  });
  const railDrag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: (info) => dragStart("rail", info),
    onMove: ({ point }) => follow(timeAt(point.x, "rail")),
    onEnd: (info) => dragEnd("rail", info),
    onCancel: dragCancel,
    onTap: (event) =>
      commit(quantize(timeAt(event.clientX, "rail")), "pointer"),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const base = shownPick ?? quantize(liveAt);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = quantize(base + unit);
        if (next <= base) next = inRange(base + unit);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = quantize(base - unit);
        if (next >= base) next = inRange(base - unit);
        break;
      case "PageUp":
        next = quantize(base + 60);
        break;
      case "PageDown":
        next = quantize(base - 60);
        break;
      case "Home":
        next = day.dawn;
        break;
      case "End":
        next = day.dusk;
        break;
      case "Escape":
        // Handled only when there is somewhere to go back to; otherwise the
        // Escape belongs to whatever holds the widget.
        if (picked !== null) {
          event.preventDefault();
          goLive("key");
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    if (Math.abs(next - base) < 0.01) return;
    commit(next, "key");
  };

  const inRangeOf = (m: number) => clamp(m, day.dawn, day.dusk);
  const sunX = useTransform(minute, (m) => r2(xOf(day, inRangeOf(m))));
  const sunY = useTransform(minute, (m) => r2(yOf(day, inRangeOf(m))));
  const sunFill = useTransform(minute, (m) =>
    mix(SUN_LOW, SUN_HIGH, clamp(altOf(day, inRangeOf(m)) / 0.6, 0, 1)),
  );
  // Below the horizon the sun is only an outline, so it can still be found.
  const ringOpacity = useTransform(minute, (m) =>
    r2(clamp((0.14 - altOf(day, inRangeOf(m))) / 0.14, 0, 1) * 0.75),
  );
  const haloOpacity = useTransform(minute, (m) =>
    sky ? r2(0.14 + 0.14 * clamp(altOf(day, inRangeOf(m)), 0, 1)) : 0.1,
  );
  const tint = useTransform(minute, (m) => tintAt(keys, m));
  const ground = useTransform(tint, (t) => t.ground);
  const skyPaint = useTransform(minute, (m) => {
    const t = tintAt(keys, m);
    const line = `linear-gradient(to bottom, ${t.top}, ${t.horizon} ${HY_PCT}%)`;
    const g = glowOf(day, m);
    if (g < 0.02) return line;
    const gx = r2((xOf(day, inRangeOf(m)) / W) * 100);
    return `radial-gradient(ellipse 34% 46% at ${gx}% ${HY_PCT}%, color-mix(in oklab, ${SUN_LOW} ${Math.round(g * 70)}%, transparent), transparent), ${line}`;
  });
  const starOpacity = useTransform(minute, (m) =>
    r2(Math.pow(nightOf(day, m), 1.5)),
  );
  const pillText = useTransform(minute, (m) => clockText(m, clock));
  const reading = useTransform(minute, (m) => readingOf(day, m, clock));
  const bigText = useTransform(reading, (r) => r.big);
  const captionText = useTransform(reading, (r) => r.caption);
  const thumbLeft = useTransform(
    minute,
    (m) => `${r3(((inRangeOf(m) - day.dawn) / span) * 100)}%`,
  );

  const shownNow = shownPick ?? liveAt;
  const valueText = `${clockText(shownNow, clock)}${picked === null ? ", now" : ""}: ${readingOf(day, shownNow, clock).said}`;
  const pct = (t: number) => r3(((inRange(t) - day.dawn) / span) * 100);
  const nowX = r2(xOf(day, inRange(liveAt)));
  const nowY = r2(yOf(day, inRange(liveAt)));
  const trace = sky ? "stroke-white/60" : "stroke-ink-3";
  const faint = sky ? "fill-white/55" : "fill-ink-3/70";
  const tagTone = sky ? "text-white/80" : "text-ink-3";

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "@container w-full rounded-4 border border-hairline bg-card p-3 text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div
            ref={panelRef}
            {...panelDrag}
            className={cn(
              "relative touch-pan-y overflow-clip rounded-3 border border-hairline select-none [-webkit-touch-callout:none]",
              sky ? "bg-surface-2" : "bg-surface-1",
              disabled
                ? "cursor-not-allowed"
                : "cursor-grab active:cursor-grabbing",
            )}
          >
            {sky ? (
              <motion.div
                aria-hidden
                className="absolute inset-0"
                style={{ background: skyPaint }}
              />
            ) : null}
            <svg
              aria-hidden
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              className="relative block h-auto w-full"
            >
              <defs>
                <clipPath id={upId}>
                  <rect x={0} y={0} width={W} height={HY} />
                </clipPath>
                <clipPath id={downId}>
                  <rect x={0} y={HY} width={W} height={H - HY} />
                </clipPath>
                <linearGradient id={hazeId} x1={0} y1={0} x2={0} y2={1}>
                  <stop offset={0} stopColor="white" stopOpacity={0.18} />
                  <stop offset={1} stopColor="white" stopOpacity={0} />
                </linearGradient>
              </defs>

              {sky ? (
                <motion.g
                  className="fill-white"
                  style={{ opacity: starOpacity }}
                >
                  {STARS.map((s) => (
                    <circle
                      key={`${s.x}-${s.y}`}
                      cx={s.x}
                      cy={s.y}
                      r={s.r}
                      opacity={s.o}
                    />
                  ))}
                </motion.g>
              ) : null}

              {sky ? (
                <>
                  <motion.rect
                    x={0}
                    y={HY}
                    width={W}
                    height={H - HY}
                    style={{ fill: ground }}
                  />
                  <rect
                    x={0}
                    y={HY}
                    width={W}
                    height={H - HY}
                    fill={`url(#${hazeId})`}
                  />
                </>
              ) : (
                <rect
                  x={0}
                  y={HY}
                  width={W}
                  height={H - HY}
                  className="fill-surface-2"
                />
              )}
              <line
                x1={0}
                x2={W}
                y1={HY}
                y2={HY}
                strokeWidth={1.5}
                className={sky ? "stroke-white/35" : "stroke-hairline-strong"}
              />

              <path
                d={arch}
                clipPath={`url(#${upId})`}
                fill="none"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeDasharray="0.1 7"
                className={trace}
              />
              <path
                d={arch}
                clipPath={`url(#${downId})`}
                fill="none"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeDasharray="0.1 7"
                opacity={0.55}
                className={trace}
              />

              {marks ? (
                <g>
                  {hourDots.map((p) => (
                    <circle
                      key={p.x}
                      cx={p.x}
                      cy={p.y}
                      r={2.6}
                      className={faint}
                    />
                  ))}
                  {[day.dawn, day.dusk].map((t) => (
                    <line
                      key={t}
                      x1={r2(xOf(day, t))}
                      x2={r2(xOf(day, t))}
                      y1={HY}
                      y2={r2(yOf(day, t) + 7)}
                      strokeWidth={2}
                      strokeLinecap="round"
                      className={trace}
                    />
                  ))}
                </g>
              ) : null}

              {picked !== null ? (
                <circle
                  cx={nowX}
                  cy={nowY}
                  r={6.5}
                  fill="none"
                  strokeWidth={2}
                  className={sky ? "stroke-white/80" : "stroke-ink-2"}
                />
              ) : null}

              <motion.circle
                cx={sunX}
                cy={sunY}
                r={SUN * 2}
                clipPath={`url(#${upId})`}
                style={{ fill: sunFill, opacity: haloOpacity }}
              />
              <motion.circle
                cx={sunX}
                cy={sunY}
                r={SUN}
                clipPath={`url(#${upId})`}
                style={{ fill: sunFill }}
              />
              <motion.circle
                cx={sunX}
                cy={sunY}
                r={SUN - 1}
                fill="none"
                strokeWidth={2}
                strokeDasharray="3 3"
                style={{ stroke: sunFill, opacity: ringOpacity }}
              />
            </svg>

            <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
              <span
                aria-hidden
                className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-popover/90 px-2 font-mono text-[11px] text-foreground tabular-nums"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    picked === null ? "bg-signal" : "border border-ink-3",
                  )}
                />
                <motion.span>{pillText}</motion.span>
              </span>
              <AnimatePresence initial={false}>
                {picked !== null ? (
                  <motion.button
                    key="now"
                    type="button"
                    disabled={disabled}
                    aria-label={`Back to now, ${clockText(liveAt, clock)}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => goLive("pointer")}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                    className={cn(
                      "pointer-events-auto inline-flex h-6 shrink-0 cursor-pointer items-center rounded-full border border-hairline bg-popover/90 px-2.5 text-[11px] font-medium text-foreground transition-colors outline-none",
                      "hover:bg-popover",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    )}
                  >
                    Now
                  </motion.button>
                ) : null}
              </AnimatePresence>
            </div>

            {marks ? (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute bottom-1 font-mono text-[10px] leading-none",
                    tagTone,
                  )}
                  style={{ left: `calc(${EDGE_PCT}% + 8px)` }}
                >
                  dawn {clockText(day.dawn, clock)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute bottom-1 font-mono text-[10px] leading-none",
                    tagTone,
                  )}
                  style={{ right: `calc(${EDGE_PCT}% + 8px)` }}
                >
                  dusk {clockText(day.dusk, clock)}
                </span>
              </>
            ) : null}
          </div>

          <div
            ref={railRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={`${label}, time shown`}
            aria-describedby={hintId}
            aria-valuemin={Math.round(day.dawn)}
            aria-valuemax={Math.round(day.dusk)}
            aria-valuenow={Math.round(inRange(shownNow))}
            aria-valuetext={valueText}
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            {...railDrag}
            style={{ marginInline: `${EDGE_PCT}%` }}
            className={cn(
              "relative flex h-5 touch-pan-y items-center rounded-full outline-none select-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 h-1 rounded-full bg-hairline-strong"
            />
            <span
              aria-hidden
              className="absolute h-1 rounded-full"
              style={{
                left: `${pct(day.dawn)}%`,
                width: `${r3(pct(day.rise) - pct(day.dawn))}%`,
                background: TWILIGHT,
                opacity: 0.7,
              }}
            />
            <span
              aria-hidden
              className="absolute h-1 rounded-full"
              style={{
                left: `${pct(day.set)}%`,
                width: `${r3(pct(day.dusk) - pct(day.set))}%`,
                background: TWILIGHT,
                opacity: 0.7,
              }}
            />
            <span
              aria-hidden
              className="absolute h-1 rounded-full"
              style={{
                left: `${pct(day.rise)}%`,
                width: `${r3(pct(day.set) - pct(day.rise))}%`,
                background: DAYLIGHT,
              }}
            />
            <motion.span
              aria-hidden
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground"
              style={{ left: thumbLeft }}
            />
          </div>
        </div>

        <div className="flex min-w-0 items-end justify-between gap-3 @lg:w-40 @lg:shrink-0 @lg:flex-col @lg:items-stretch @lg:justify-center">
          <div className="min-w-0">
            <p
              className="hidden truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @lg:mb-1 @lg:block"
              title={label}
            >
              {label}
            </p>
            <motion.p className="font-mono text-xl leading-tight text-foreground tabular-nums">
              {bigText}
            </motion.p>
            <motion.p className="truncate text-xs text-ink-3">
              {captionText}
            </motion.p>
          </div>
          <div className="flex shrink-0 flex-col gap-1 text-xs @lg:border-t @lg:border-hairline @lg:pt-3">
            <p className="flex items-center gap-1.5">
              <HorizonGlyph rising />
              <span className="sr-only @lg:not-sr-only @lg:flex-1 @lg:text-ink-3">
                Sunrise
              </span>
              <span className="font-mono text-foreground tabular-nums">
                {clockText(day.rise, clock)}
              </span>
            </p>
            <p className="flex items-center gap-1.5">
              <HorizonGlyph rising={false} />
              <span className="sr-only @lg:not-sr-only @lg:flex-1 @lg:text-ink-3">
                Sunset
              </span>
              <span className="font-mono text-foreground tabular-nums">
                {clockText(day.set, clock)}
              </span>
            </p>
          </div>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Drag the sun, or this rail, to see another time. Arrow keys step {unit}{" "}
        minutes, Page Up and Page Down an hour, and Escape returns to now.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
