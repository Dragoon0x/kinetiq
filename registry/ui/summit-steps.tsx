"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SummitTerrain = "alpine" | "desert" | "coast";

export type SummitStepsProps = {
  /** Steps counted in each hour of the day so far, midnight first. */
  hours: number[];
  /** The moment the day has reached. Pass it, with `timeZone`, to render on the server. */
  now?: Date | number;
  /** The IANA time zone `now` is read in, e.g. "UTC". @default the runtime's own */
  timeZone?: string;
  /** Controlled whole hour shown — the steps taken by that hour — or null for now. */
  value?: number | null;
  /** Initial hour shown when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the drag, tap, key or Now press that changed it. */
  onValueChange?: (hour: number | null) => void;
  /** The day's goal in steps: the whole trail, valley to summit. @default 10000 */
  goal?: number;
  /** The landscape and the trail up it. @default "alpine" */
  terrain?: SummitTerrain;
  /** The widget's name, over the picture. @default "Today" */
  label?: string;
  /** Tick for each hour and camp a scrub passes, chime on the summit. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The picture's drawing box. */
const W = 300;
const H = 150;
/** Trail px per radian of leg swing: a full stride is about 20 px. */
const STRIDE = 3.2;
/** A walker's pace when the day's count grows, in px of trail per second. */
const PACE = 70;
/** Camps at a quarter, a half and three quarters of the goal. */
const CAMPS = [0.25, 0.5, 0.75] as const;

type Pt = readonly [number, number];

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/*
 * The trail is sampled once per terrain: a centripetal Catmull-Rom curve
 * through hand-placed switchback corners (centripetal, so a sharp hairpin
 * never loops back on itself), cut into points about 4 px apart, with the
 * running length at each. Everything that rides the trail — the walker, the
 * trodden line, the camps, the hour dots — is a lookup into this table.
 */
type Trail = {
  pts: Pt[];
  len: number[];
  total: number;
  /** Which way the trail heads at each point, left (-1) or right (1). */
  face: number[];
  d: string;
};

function sampleTrail(ctrl: readonly Pt[]): Pt[] {
  const n = ctrl.length;
  const get = (i: number): Pt => {
    if (i < 0) {
      const a = ctrl[0] as Pt;
      const b = ctrl[1] as Pt;
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    if (i > n - 1) {
      const a = ctrl[n - 1] as Pt;
      const b = ctrl[n - 2] as Pt;
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    return ctrl[i] as Pt;
  };
  const out: Pt[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const t0 = 0;
    const t1 = t0 + Math.max(1e-3, Math.sqrt(dist(p0, p1)));
    const t2 = t1 + Math.max(1e-3, Math.sqrt(dist(p1, p2)));
    const t3 = t2 + Math.max(1e-3, Math.sqrt(dist(p2, p3)));
    const steps = Math.max(4, Math.ceil(dist(p1, p2) / 4));
    for (let s = 0; s < steps; s += 1) {
      const t = t1 + ((t2 - t1) * s) / steps;
      const mix = (a: Pt, b: Pt, ta: number, tb: number): Pt => {
        const u = (tb - t) / (tb - ta);
        const v = (t - ta) / (tb - ta);
        return [a[0] * u + b[0] * v, a[1] * u + b[1] * v];
      };
      const a1 = mix(p0, p1, t0, t1);
      const a2 = mix(p1, p2, t1, t2);
      const a3 = mix(p2, p3, t2, t3);
      const b1 = mix(a1, a2, t0, t2);
      const b2 = mix(a2, a3, t1, t3);
      const c = mix(b1, b2, t1, t2);
      out.push([r2(c[0]), r2(c[1])]);
    }
  }
  const last = ctrl[n - 1] as Pt;
  out.push([r2(last[0]), r2(last[1])]);
  return out;
}

function buildTrail(ctrl: readonly Pt[]): Trail {
  const pts = sampleTrail(ctrl);
  const len = [0];
  for (let i = 1; i < pts.length; i += 1) {
    len.push((len[i - 1] as number) + dist(pts[i - 1] as Pt, pts[i] as Pt));
  }
  // Facing reads the trail a few points either side, so a near-vertical
  // stretch does not flip the walker back and forth.
  const face: number[] = [];
  let last = 1;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[Math.max(0, i - 3)] as Pt;
    const b = pts[Math.min(pts.length - 1, i + 3)] as Pt;
    const dx = b[0] - a[0];
    if (Math.abs(dx) > 0.5) last = Math.sign(dx);
    face.push(last);
  }
  return {
    pts,
    len,
    total: len[len.length - 1] as number,
    face,
    d: `M ${pts.map(([x, y]) => `${x} ${y}`).join(" L ")}`,
  };
}

/** The point `s` px along the trail, and the index of the point before it. */
function pointAt(trail: Trail, s: number) {
  const at = clamp(s, 0, trail.total);
  let lo = 0;
  let hi = trail.len.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((trail.len[mid] as number) <= at) lo = mid;
    else hi = mid;
  }
  const a = trail.pts[lo] as Pt;
  const b = trail.pts[hi] as Pt;
  const la = trail.len[lo] as number;
  const lb = trail.len[hi] as number;
  const f = lb > la ? (at - la) / (lb - la) : 0;
  return {
    x: a[0] + (b[0] - a[0]) * f,
    y: a[1] + (b[1] - a[1]) * f,
    i: lo,
  };
}

/** The trodden part of the trail, as a path. */
function walkedPath(trail: Trail, s: number): string {
  if (s <= 0.2) return "";
  const p = pointAt(trail, s);
  const out: string[] = [];
  for (let i = 0; i <= p.i; i += 1) {
    const q = trail.pts[i] as Pt;
    out.push(`${q[0]} ${q[1]}`);
  }
  out.push(`${r2(p.x)} ${r2(p.y)}`);
  return `M ${out.join(" L ")}`;
}

/**
 * Where on the trail a pointer means. The nearest point wins, but every px of
 * trail between it and where the walker is costs a little, so on switchbacks
 * the walker keeps to the leg it is on until the pointer is clearly on
 * another one.
 */
function nearestOnTrail(
  trail: Trail,
  px: number,
  py: number,
  from: number,
  penalty: number,
): number {
  let best = from;
  let score = Infinity;
  for (let i = 0; i < trail.pts.length - 1; i += 1) {
    const a = trail.pts[i] as Pt;
    const b = trail.pts[i + 1] as Pt;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t =
      l2 > 0 ? clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1) : 0;
    const s =
      (trail.len[i] as number) +
      t * ((trail.len[i + 1] as number) - (trail.len[i] as number));
    const d =
      Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t)) +
      penalty * Math.abs(s - from);
    if (d < score) {
      score = d;
      best = s;
    }
  }
  return best;
}

/*
 * Colours. The picture is a picture: rock, sand, grass and sea are token
 * hues at fixed lightness, so the hills look the same in either theme; only
 * the sky leans a little toward the card, so the tile sits in its page.
 * Mixes toward the card are in oklab.
 */
const sky = (pigment: string) =>
  `color-mix(in oklab, var(--card) 22%, ${pigment})`;
const SNOW = "oklch(from var(--ink) 0.97 0.008 h)";
const PALE = "oklch(from var(--ink) 0.98 0.005 h / 0.72)";
const FIGURE = "oklch(from var(--ink) 0.27 0.02 h)";
const JACKET = "oklch(from var(--accent-bright) 0.56 0.17 calc(h - 8))";
const PACK = "oklch(from var(--warn) 0.72 0.13 calc(h - 18))";
const SKIN = "oklch(from var(--warn) 0.82 0.06 calc(h - 25))";
const FLAG = "oklch(from var(--danger) 0.62 0.2 h)";
const TENT = "oklch(from var(--warn) 0.74 0.15 calc(h - 28))";
const TENT_DOOR = "oklch(from var(--warn) 0.42 0.1 calc(h - 28))";

type Scene = {
  skyTop: string;
  skyLow: string;
  trodden: string;
  trail: Trail;
};

/** Control points as "x y, x y, …": hairpin corners, valley to summit. */
const corners = (text: string): Pt[] =>
  text.split(",").map((pair) => {
    const [x = 0, y = 0] = pair.trim().split(/\s+/).map(Number);
    return [x, y] as const;
  });

const SCENES: Record<SummitTerrain, Scene> = {
  alpine: {
    skyTop: sky("oklch(from var(--accent-bright) 0.78 0.08 calc(h - 30))"),
    skyLow: sky("oklch(from var(--accent-bright) 0.94 0.025 calc(h - 40))"),
    trodden: "oklch(from var(--warn) 0.88 0.14 h)",
    trail: buildTrail(
      corners(
        "20 144, 70 138, 140 132, 212 124, 246 114, 232 105, 176 99, 124 92, 108 86, 128 79, 184 72, 232 63, 242 56, 222 49, 192 44, 182 38, 193 31, 205 21",
      ),
    ),
  },
  desert: {
    skyTop: sky("oklch(from var(--accent-bright) 0.8 0.06 calc(h - 45))"),
    skyLow: sky("oklch(from var(--warn) 0.93 0.05 h)"),
    trodden: "oklch(from var(--ink) 0.98 0.01 h)",
    trail: buildTrail(
      corners(
        "16 145, 60 140, 92 133, 110 124, 170 118, 240 112, 268 104, 244 94, 186 88, 148 82, 162 74, 214 68, 258 62, 262 56, 234 50, 196 46, 178 40, 188 33, 212 26",
      ),
    ),
  },
  coast: {
    skyTop: sky("oklch(from var(--accent-bright) 0.8 0.07 calc(h - 55))"),
    skyLow: sky("oklch(from var(--accent-bright) 0.94 0.025 calc(h - 60))"),
    trodden: "oklch(from var(--warn) 0.88 0.14 h)",
    trail: buildTrail(
      corners(
        "10 146, 44 140, 84 131, 72 122, 108 114, 146 103, 132 94, 164 83, 200 66, 190 59, 218 47, 248 34",
      ),
    ),
  },
};

function pine(x: number, base: number, h: number) {
  const w = h * 0.34;
  return `M ${x - w} ${base} L ${x} ${r2(base - h * 0.62)} L ${x + w} ${base} Z M ${r2(x - w * 0.78)} ${r2(base - h * 0.38)} L ${x} ${base - h} L ${r2(x + w * 0.78)} ${r2(base - h * 0.38)} Z`;
}

function Scenery({
  terrain,
  clipId,
}: {
  terrain: SummitTerrain;
  clipId: string;
}) {
  if (terrain === "desert") {
    const butte =
      "M58 150 L74 128 L96 124 L102 106 L124 102 L132 80 L148 74 L156 48 L166 42 L172 26 L252 26 L258 42 L270 48 L278 74 L292 80 L300 100 V150 Z";
    return (
      <>
        <circle
          cx={104}
          cy={32}
          r={22}
          opacity={0.35}
          style={{ fill: "oklch(from var(--warn) 0.95 0.08 h)" }}
        />
        <circle
          cx={104}
          cy={32}
          r={13}
          style={{ fill: "oklch(from var(--warn) 0.93 0.11 calc(h + 4))" }}
        />
        <path
          d="M0 112 L10 112 L16 100 L44 100 L50 112 L78 112 L84 105 L102 105 L106 112 L300 112 V150 H0 Z"
          style={{ fill: "oklch(from var(--danger) 0.76 0.07 calc(h + 32))" }}
        />
        <defs>
          <clipPath id={clipId}>
            <path d={butte} />
          </clipPath>
        </defs>
        <path
          d={butte}
          style={{ fill: "oklch(from var(--danger) 0.62 0.12 calc(h + 24))" }}
        />
        <path
          d="M240 26 L252 26 L258 42 L270 48 L278 74 L292 80 L300 100 V150 H262 L256 100 L250 60 Z"
          style={{ fill: "oklch(from var(--danger) 0.52 0.11 calc(h + 20))" }}
        />
        <g
          clipPath={`url(#${clipId})`}
          strokeWidth={1.2}
          opacity={0.55}
          style={{ stroke: "oklch(from var(--danger) 0.5 0.1 calc(h + 16))" }}
        >
          {[38, 58, 90, 114, 136].map((y) => (
            <line key={y} x1={0} x2={W} y1={y} y2={y} />
          ))}
        </g>
        <path
          d="M0 134 Q44 120 96 132 Q148 144 196 130 Q248 118 300 132 V150 H0 Z"
          style={{ fill: "oklch(from var(--warn) 0.8 0.1 calc(h - 12))" }}
        />
        <g
          fill="none"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ stroke: "oklch(from var(--success) 0.5 0.09 calc(h - 15))" }}
        >
          <path d="M30 138 V119 M30 128 H25 V122 M30 125 H34.5 V118" />
          <path d="M282 140 V125 M282 133 H278 V128 M282 130 H285.5 V124" />
        </g>
      </>
    );
  }
  if (terrain === "coast") {
    return (
      <>
        <rect
          x={0}
          y={98}
          width={W}
          height={H - 98}
          style={{ fill: "oklch(from var(--accent) 0.56 0.09 calc(h - 50))" }}
        />
        <rect
          x={0}
          y={98}
          width={W}
          height={6}
          style={{ fill: "oklch(from var(--accent) 0.68 0.07 calc(h - 55))" }}
        />
        <g
          fill="none"
          strokeWidth={1}
          strokeLinecap="round"
          style={{ stroke: PALE }}
        >
          {[
            [214, 116, 10],
            [244, 126, 14],
            [280, 112, 8],
            [226, 140, 12],
            [284, 134, 10],
          ].map(([x = 0, y = 0, w = 0]) => (
            <path
              key={`${x}-${y}`}
              d={`M ${x} ${y} q ${w / 4} -2 ${w / 2} 0 t ${w / 2} 0`}
            />
          ))}
        </g>
        <path
          d="M0 150 V124 Q36 118 72 108 Q114 94 150 74 Q188 52 222 40 L250 31 L264 34 L276 150 Z"
          style={{ fill: "oklch(from var(--success) 0.6 0.1 calc(h - 20))" }}
        />
        <path
          d="M250 31 L264 34 L276 150 H254 Q260 100 250 58 Z"
          style={{ fill: "oklch(from var(--warn) 0.9 0.03 calc(h + 10))" }}
        />
        <path
          d="M258 60 L262 84 M266 96 L264 120"
          fill="none"
          strokeWidth={0.8}
          style={{ stroke: "oklch(from var(--warn) 0.66 0.04 calc(h + 10))" }}
        />
        <path
          d="M0 136 Q30 130 64 136 Q90 140 112 150 H0 Z"
          style={{ fill: "oklch(from var(--warn) 0.86 0.07 h)" }}
        />
        <path
          d="M96 34 q3 -3 6 0 q3 -3 6 0 M122 22 q2.5 -2.5 5 0 q2.5 -2.5 5 0"
          fill="none"
          strokeWidth={1.1}
          strokeLinecap="round"
          style={{ stroke: FIGURE }}
        />
      </>
    );
  }
  return (
    <>
      <path
        d="M0 98 L18 84 L34 90 L58 66 L78 80 L98 70 L120 86 L300 86 V150 H0 Z M226 86 L258 52 L276 64 L300 56 V150 H226 Z"
        style={{
          fill: "oklch(from var(--accent-bright) 0.74 0.05 calc(h - 22))",
        }}
      />
      <path
        d="M0 150 L0 128 L30 116 L62 102 L94 84 L122 68 L148 52 L172 38 L192 26 L206 18 L220 27 L240 40 L262 56 L284 72 L300 80 V150 Z"
        style={{ fill: "oklch(from var(--accent) 0.52 0.04 calc(h - 12))" }}
      />
      <path
        d="M206 18 L220 27 L240 40 L262 56 L284 72 L300 80 V150 H236 L226 104 L216 62 L210 34 Z"
        style={{ fill: "oklch(from var(--accent) 0.43 0.04 calc(h - 12))" }}
      />
      <path
        d="M206 18 L192 26 L184 32 L191 31 L197 35 L203 30 L208 36 L214 31 L220 34 L226 31 L220 27 Z"
        style={{ fill: SNOW }}
      />
      <path
        d="M0 136 Q48 126 104 134 T214 134 Q262 128 300 134 V150 H0 Z"
        style={{ fill: "oklch(from var(--success) 0.62 0.1 calc(h - 25))" }}
      />
      <path
        d={[
          pine(14, 138, 13),
          pine(26, 141, 16),
          pine(40, 137, 12),
          pine(252, 138, 14),
          pine(266, 141, 17),
          pine(282, 137, 12),
        ].join(" ")}
        style={{ fill: "oklch(from var(--success) 0.4 0.07 calc(h - 10))" }}
      />
    </>
  );
}

/*
 * Hours: a day is the hourly counts up to now. `cum[h]` is the steps taken
 * by h:00; within an hour the steps are spread evenly, and the hour now
 * running ends at now.
 */
type Day = { cum: number[]; total: number; nowH: number; started: number };

function dayOf(hours: readonly number[], nowH: number): Day {
  const started = clamp(Math.ceil(nowH), 0, 24);
  const cum = [0];
  for (let h = 0; h < started; h += 1) {
    const n = Math.max(0, Number(hours[h]) || 0);
    cum.push((cum[h] as number) + Math.round(n));
  }
  return { cum, total: cum[started] as number, nowH, started };
}

const stepsBy = (day: Day, hour: number) =>
  day.cum[clamp(Math.round(hour), 0, day.started)] as number;

/** When the day's count reached `steps`, in hours after midnight. */
function timeOf(day: Day, steps: number): number {
  if (steps <= 0) return 0;
  for (let h = 0; h < day.started; h += 1) {
    const a = day.cum[h] as number;
    const b = day.cum[h + 1] as number;
    if (steps <= b && b > a) {
      const end = Math.min(h + 1, day.nowH);
      return h + ((steps - a) / (b - a)) * (end - h);
    }
  }
  return day.nowH;
}

const unpitched = (c: number) => r2(clamp(1 - c, 0, 1));

const pad = (n: number) => String(n).padStart(2, "0");
const clockText = (hours: number) => {
  const m = clamp(Math.round(hours * 60), 0, 1439);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
/** A scrub's time, to the nearest ten minutes. */
const roughText = (hours: number) =>
  clockText(Math.round(clamp(hours, 0, 23.99) * 6) / 6);
const NUMBER = new Intl.NumberFormat("en-US");
const fmt = (n: number) => NUMBER.format(Math.max(0, Math.round(n)));
const stepWord = (n: number) =>
  `${fmt(n)} ${Math.round(n) === 1 ? "step" : "steps"}`;

/*
 * Hours after midnight for a moment, read in a named zone. The formatter is
 * made once per zone; with a zone given, Node and the browser agree.
 */
const FORMATS = new Map<string, Intl.DateTimeFormat>();
function hoursOf(ms: number, timeZone?: string) {
  const key = timeZone ?? "";
  let f = FORMATS.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    FORMATS.set(key, f);
  }
  let h = 0;
  let m = 0;
  for (const part of f.formatToParts(ms)) {
    if (part.type === "hour") h = Number(part.value);
    else if (part.type === "minute") m = Number(part.value);
  }
  return h + m / 60;
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

type Api = {
  onFrac: (f: number) => void;
  walkTo: (steps: number) => void;
  glideTo: (steps: number, velocity?: number) => void;
  halt: () => void;
};

/**
 * A step count drawn as a climb. The trail up the mountain is the day's
 * goal; a small walker stands on it at the share walked so far, the trodden
 * trail drawn solid behind them, with a dot where they were at each whole
 * hour. Their legs swing from the distance they cover, not the clock, so they
 * walk while they move and stand still when they stop. Camps pop up on the
 * recoil spring as they pass a quarter, a half and three quarters of the
 * goal, and at the summit the flag is hoisted on glide and waves itself out.
 *
 * Dragging along the trail scrubs back through the day: the walker follows
 * the finger 1:1 along the trail, the time shown follows them, and letting go
 * lands on the nearest whole hour on the glide spring with the release
 * velocity; past now it rubber-bands, and let go there it is now again. The
 * picture is a real slider: arrow keys step an hour, Page keys three, Home
 * goes to midnight, End and Escape (and the Now button) to now. When the
 * host's count grows the walker walks up at a walking pace.
 *
 * Under reduced motion the walker never walks or glides — it stands where
 * the drag, key or count puts it — the camps and flag appear and leave on
 * opacity, and the flag does not wave; the count, the trodden trail and the
 * time still change, because they are the reading.
 */
export function SummitSteps({
  hours,
  now,
  timeZone,
  value,
  defaultValue = null,
  onValueChange,
  goal = 10000,
  terrain = "alpine",
  label = "Today",
  sound = false,
  disabled = false,
  className,
}: SummitStepsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const skyId = `summit-sky-${uid}`;
  const clipId = `summit-clip-${uid}`;
  const hintId = `summit-hint-${uid}`;

  const scene = SCENES[terrain] ?? SCENES.alpine;
  const trail = scene.trail;
  const target = Math.max(100, Math.round(goal));

  const clockMs = React.useSyncExternalStore(
    now === undefined ? subscribeClock : subscribeNothing,
    now === undefined ? readClock : readNothing,
    readNothing,
  );
  const nowH =
    now !== undefined
      ? hoursOf(typeof now === "number" ? now : now.getTime(), timeZone)
      : clockMs !== null
        ? hoursOf(clockMs, timeZone)
        : Math.min(24, hours.length);
  const day = React.useMemo(() => dayOf(hours, nowH), [hours, nowH]);
  const lastHour = Math.floor(day.nowH);

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const [check, setCheck] = React.useState(0);
  const controlled = value !== undefined;
  const picked = controlled ? value : own;
  const shownHour =
    picked === null || !Number.isFinite(picked)
      ? null
      : Math.round(picked) >= day.nowH
        ? null
        : clamp(Math.round(picked), 0, lastHour);
  const shownSteps = shownHour === null ? day.total : stepsBy(day, shownHour);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const announce = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // Camps and the summit reached by the live count are spoken once each.
  const [seen, setSeen] = React.useState({ total: day.total, goal: target });
  if (seen.total !== day.total || seen.goal !== target) {
    setSeen({ total: day.total, goal: target });
    if (seen.goal === target && picked === null && day.total > seen.total) {
      const before = seen.total / target;
      const after = day.total / target;
      if (before < 1 && after >= 1) {
        setSaid({
          n: said.n + 1,
          text: `Summit: the ${fmt(target)}-step goal is reached.`,
        });
      } else {
        const camp = CAMPS.findLastIndex((c) => before < c && after >= c);
        if (camp !== -1) {
          setSaid({
            n: said.n + 1,
            text: `Camp ${camp + 1}: ${stepWord(target * (CAMPS[camp] ?? 0))}.`,
          });
        }
      }
    }
  }

  const initialFrac = clamp(shownSteps / target, 0, 1);
  const steps = useMotionValue(shownSteps);
  const goalNow = useMotionValue(target);
  const facing = useMotionValue(
    trail.face[pointAt(trail, initialFrac * trail.total).i] ?? 1,
  );
  const camp0 = useMotionValue(initialFrac >= CAMPS[0] ? 1 : 0);
  const camp1 = useMotionValue(initialFrac >= CAMPS[1] ? 1 : 0);
  const camp2 = useMotionValue(initialFrac >= CAMPS[2] ? 1 : 0);
  const hoist = useMotionValue(initialFrac >= 1 ? 1 : 0);
  const flagShow = useMotionValue(1);
  const wave = useMotionValue(0);
  const waveAmp = useMotionValue(0.14);
  const pillText = useMotionValue(
    shownHour === null ? clockText(day.nowH) : clockText(shownHour),
  );

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const heading = React.useRef(shownSteps);
  const dragging = React.useRef(false);
  const catching = React.useRef(false);
  const handed = React.useRef(false);
  const campOn = React.useRef(CAMPS.map((c) => initialFrac >= c));
  const flagOn = React.useRef(initialFrac >= 1);
  const lastFrac = React.useRef(initialFrac);
  const lastSteps = React.useRef(shownSteps);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const halt = () => {
    anims.current.get("steps")?.stop();
    anims.current.delete("steps");
  };

  const frac = useTransform(
    [steps, goalNow] as MotionValue<number>[],
    ([v = 0, g = 1]: number[]) => clamp(v / Math.max(1, g), 0, 1),
  );
  const fracVelocity = useVelocity(frac);

  const glideTo = (to: number, velocity = 0) => {
    halt();
    if (!motionSafe) {
      steps.set(to);
      return;
    }
    const controls = animate(steps, to, {
      ...springs.glide,
      velocity,
      onComplete: () => {
        if (anims.current.get("steps") === controls) {
          anims.current.delete("steps");
        }
      },
    });
    anims.current.set("steps", controls);
  };

  /** The host's count grew: a walker covers ground at a pace, not on a spring. */
  const walkTo = (to: number) => {
    halt();
    if (!motionSafe) {
      steps.set(to);
      return;
    }
    const from = steps.get();
    const g = goalNow.get();
    const px =
      Math.abs(clamp(to / g, 0, 1) - clamp(from / g, 0, 1)) * trail.total;
    const duration = px < 2 ? durations.slow : clamp(px / PACE, 0.35, 1.8);
    const controls = animate(steps, to, {
      duration,
      ease: easings.move,
      onComplete: () => {
        if (anims.current.get("steps") === controls) {
          anims.current.delete("steps");
        }
      },
    });
    anims.current.set("steps", controls);
  };

  /** Camps, the flag, the walker's facing and the visitor's sounds. */
  const onFrac = (f: number) => {
    const prevF = lastFrac.current;
    lastFrac.current = f;
    const v = steps.get();
    const prevV = lastSteps.current;
    lastSteps.current = v;

    const ds = (f - prevF) * trail.total;
    if (Math.abs(ds) > 0.05) {
      const at = pointAt(trail, f * trail.total);
      const next = Math.sign(ds) * (trail.face[at.i] ?? 1);
      if (next !== facing.get()) facing.set(next);
    }

    const camps = [camp0, camp1, camp2];
    CAMPS.forEach((c, k) => {
      const on = f >= c - 1e-6;
      if (on === campOn.current[k]) return;
      campOn.current[k] = on;
      const mv = camps[k];
      if (!mv) return;
      run(
        `camp${k}`,
        animate(
          mv,
          on ? 1 : 0,
          motionSafe && on
            ? springs.recoil
            : {
                duration: on ? durations.base : durations.fast,
                ease: on ? easings.enter : easings.exit,
              },
        ),
      );
    });

    const top = f >= 1 - 1e-6;
    if (top !== flagOn.current) {
      flagOn.current = top;
      if (top) {
        if (motionSafe) {
          flagShow.set(1);
          run("hoist", animate(hoist, 1, springs.glide));
          waveAmp.set(1);
          run(
            "waveAmp",
            animate(waveAmp, 0.14, { duration: 2.6, ease: easings.enter }),
          );
          run(
            "wave",
            animate(wave, wave.get() + 24, {
              duration: 2.6,
              ease: easings.linear,
            }),
          );
        } else {
          hoist.set(1);
          run(
            "flag",
            animate(flagShow, 1, {
              duration: durations.base,
              ease: easings.enter,
            }),
          );
        }
      } else if (motionSafe) {
        run(
          "hoist",
          animate(hoist, 0, { duration: durations.base, ease: easings.exit }),
        );
      } else {
        run(
          "flag",
          animate(flagShow, 0, {
            duration: durations.fast,
            ease: easings.exit,
          }),
        );
      }
    }

    if (!handed.current) return;
    const at = pointAt(trail, f * trail.total);
    const pan = r2(((at.x / W) * 2 - 1) * 0.6);
    const lift = r2(1 - at.y / H);
    if (prevF < 1 - 1e-6 && top) {
      audio.play("chime", { pitch: 1, gain: 0.5, pan });
      return;
    }
    if (f > prevF && CAMPS.some((c) => prevF < c && f >= c)) {
      audio.play("tick", { pitch: 1.6, gain: 0.55, pan });
      return;
    }
    if (Math.floor(timeOf(day, prevV)) !== Math.floor(timeOf(day, v))) {
      audio.play("tick", { pitch: r2(0.8 + 0.6 * lift), gain: 0.4, pan });
    }
  };

  React.useEffect(() => {
    api.current = { onFrac, walkTo, glideTo, halt };
  });

  React.useEffect(
    () => frac.on("change", (f) => api.current?.onFrac(f)),
    [frac],
  );

  // A new goal moves every reading along the trail; it glides there.
  React.useEffect(() => {
    if (Math.abs(goalNow.get() - target) < 0.5) return;
    handed.current = false;
    const running = anims.current;
    running.get("goal")?.stop();
    if (!motionSafe) {
      goalNow.set(target);
      return;
    }
    running.set("goal", animate(goalNow, target, springs.glide));
  }, [target, goalNow, motionSafe]);

  // A new terrain is a new trail: the walker faces the way it now runs.
  React.useEffect(() => {
    const at = pointAt(trail, frac.get() * trail.total);
    facing.set(trail.face[at.i] ?? 1);
  }, [trail, frac, facing]);

  // Reduced motion shows the flag raised or not; full motion hoists it.
  React.useEffect(() => {
    if (motionSafe) {
      hoist.set(flagOn.current ? 1 : 0);
      flagShow.set(1);
    } else {
      hoist.set(1);
      flagShow.set(flagOn.current ? 1 : 0);
      waveAmp.set(0.14);
    }
  }, [motionSafe, hoist, flagShow, waveAmp]);

  // Where the host says the walker is. The visitor's own commits have
  // already set off; this catches the count growing, a host's own value,
  // and a controlled host that refused a scrub.
  React.useEffect(() => {
    if (dragging.current) return;
    if (Math.abs(heading.current - shownSteps) < 0.5) return;
    heading.current = shownSteps;
    const visitorMoving = handed.current && anims.current.has("steps");
    if (!visitorMoving) handed.current = false;
    api.current?.walkTo(shownSteps);
  }, [shownSteps, check]);

  const timeLabel =
    shownHour === null ? clockText(day.nowH) : clockText(shownHour);
  React.useEffect(() => {
    if (!dragging.current) pillText.set(timeLabel);
  }, [timeLabel, pillText]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const pctOf = (n: number) => Math.round((n / target) * 100);
  const readingOf = (hour: number | null, n: number) =>
    `${hour === null ? `Now, ${clockText(day.nowH)}` : clockText(hour)}: ${stepWord(n)}, ${pctOf(n)}% of the ${fmt(target)} goal`;

  const commit = (
    next: number | null,
    via: "pointer" | "key",
    velocity = 0,
  ) => {
    const to = next === null ? day.total : stepsBy(day, next);
    handed.current = true;
    heading.current = to;
    glideTo(to, velocity);
    pillText.set(next === null ? clockText(day.nowH) : clockText(next));
    if (next !== picked) {
      if (!controlled) setOwn(next);
      onValueChange?.(next);
      // A controlled host answers on its own schedule; once it has had its
      // turn, a host that refused gets its own value back.
      if (controlled) React.startTransition(() => setCheck((c) => c + 1));
    }
    if (via === "pointer") announce(`${readingOf(next, to)}.`);
  };

  /** Pointer to the picture's own units. */
  const local = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  };

  const along = () => clamp(steps.get() / target, 0, 1) * trail.total;
  const nowAlong = () => clamp(day.total / target, 0, 1) * trail.total;

  /** The walker under the finger: set directly, or caught up on flick first. */
  const follow = (raw: number) => {
    const limit = nowAlong();
    const give = trail.total * 0.08;
    const s =
      raw > limit
        ? limit + rubberband(raw - limit, give)
        : raw < 0
          ? rubberband(raw, give)
          : raw;
    const v = (s / trail.total) * target;
    pillText.set(s >= limit - 0.5 ? "Now" : roughText(timeOf(day, v)));
    if (catching.current) {
      if (Math.abs(steps.get() - v) > target * 0.04) {
        run("steps", animate(steps, v, springs.flick));
        return;
      }
      catching.current = false;
    }
    halt();
    steps.set(v);
  };

  /** Where a scrub ends: the nearest whole hour, or now. */
  const landing = (v: number): number | null => {
    if (v >= day.total - 0.5) return null;
    const hour = Math.round(timeOf(day, Math.max(0, v)));
    return hour >= day.nowH ? null : clamp(hour, 0, lastHour);
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      dragging.current = true;
      handed.current = true;
      halt();
      const p = local(point.x, point.y);
      if (!p) return;
      const s = nearestOnTrail(trail, p.x, p.y, along(), 0.12);
      catching.current = motionSafe && Math.abs(s - along()) > 20;
      follow(s);
    },
    onMove: ({ point }) => {
      const p = local(point.x, point.y);
      if (!p) return;
      follow(nearestOnTrail(trail, p.x, p.y, along(), 0.12));
    },
    onEnd: () => {
      dragging.current = false;
      catching.current = false;
      const v = steps.get();
      const velocity = steps.getVelocity();
      // A heavy surface: a flick carries the walker a little further.
      const land = motionSafe ? project(v, velocity, 0.99) : v;
      commit(
        landing(clamp(land, 0, day.total)),
        "pointer",
        motionSafe ? velocity : 0,
      );
    },
    onCancel: () => {
      dragging.current = false;
      catching.current = false;
      glideTo(heading.current);
      pillText.set(timeLabel);
    },
    onTap: (event) => {
      const p = local(event.clientX, event.clientY);
      if (!p) return;
      const s = nearestOnTrail(trail, p.x, p.y, along(), 0);
      commit(
        landing(Math.min((s / trail.total) * target, day.total)),
        "pointer",
      );
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const base = shownHour ?? day.nowH;
    const back = (n: number) => {
      const from = Number.isInteger(base) ? base : Math.floor(base) + 1;
      return Math.max(0, from - n);
    };
    const ahead = (n: number) => {
      if (shownHour === null) return null;
      const next = shownHour + n;
      return next >= day.nowH ? null : next;
    };
    let next: number | null;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = back(1);
        break;
      case "PageDown":
        next = back(3);
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = ahead(1);
        break;
      case "PageUp":
        next = ahead(3);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = null;
        break;
      case "Escape":
        // Handled only when there is somewhere to go back to; otherwise the
        // Escape belongs to whatever holds the widget.
        if (shownHour === null) return;
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next === shownHour) return;
    commit(next, "key");
  };

  // The walker: legs and an arm swing with the distance covered, scaled by
  // how fast it is being covered, so a walker at rest stands feet together.
  const figure = useTransform(
    [frac, fracVelocity, facing] as MotionValue<number>[],
    ([f = 0, fv = 0, side = 1]: number[]) => {
      const s = f * trail.total;
      const p = pointAt(trail, s);
      const speed = f > 0 && f < 1 ? Math.abs(fv) * trail.total : 0;
      const amp = motionSafe ? clamp(speed / 28, 0, 1) : 0;
      const a = amp * 0.55 * Math.sin(s / STRIDE);
      const leg = 6.4;
      const hipY = p.y - leg * Math.cos(a);
      const hip = `${r2(p.x)} ${r2(hipY)}`;
      const sx = p.x + 1.05 * side;
      const sy = hipY - 6;
      const hand = `${r2(sx - side * 4.7 * Math.sin(a * 0.9))} ${r2(sy + 4.7 * Math.cos(a * 0.9))}`;
      const back = (dx: number, dy: number) =>
        `${r2(p.x - side * dx * 1.15)} ${r2(hipY - dy * 1.15)}`;
      return {
        legs: `M ${hip} L ${r2(p.x + side * leg * Math.sin(a))} ${r2(p.y)} M ${hip} L ${r2(p.x - side * leg * Math.sin(a))} ${r2(p.y)}`,
        body: `M ${hip} L ${r2(sx)} ${r2(sy)}`,
        arm: `M ${r2(sx)} ${r2(sy + 0.6)} L ${hand}`,
        pack: `M ${back(0.4, 1.4)} L ${back(3.1, 1.9)} L ${back(3.3, 5.6)} L ${back(0.3, 6)} Z`,
        hx: r2(p.x + 1.5 * side),
        hy: r2(hipY - 9.3),
      };
    },
  );
  const legs = useTransform(figure, (w) => w.legs);
  const body = useTransform(figure, (w) => w.body);
  const arm = useTransform(figure, (w) => w.arm);
  const pack = useTransform(figure, (w) => w.pack);
  const headX = useTransform(figure, (w) => w.hx);
  const headY = useTransform(figure, (w) => w.hy);
  const trodden = useTransform(frac, (f) => walkedPath(trail, f * trail.total));

  const summit = trail.pts[trail.pts.length - 1] as Pt;
  const poleX = r2(summit[0] + 3);
  const poleTop = r2(summit[1] - 16);
  const cloth = useTransform(
    [hoist, wave, waveAmp] as MotionValue<number>[],
    ([h = 0, ph = 0, amp = 0]: number[]) => {
      const y0 = poleTop + 0.5 + (1 - h) * 10;
      const width = 3 + 8 * h;
      const top: string[] = [];
      const low: string[] = [];
      for (let i = 0; i <= 5; i += 1) {
        const u = i / 5;
        const dy = amp * 2 * u * Math.sin(4.2 * u - ph);
        const x =
          poleX +
          u * width * (1 - 0.06 * amp * Math.abs(Math.sin(4.2 * u - ph)));
        top.push(`${r2(x)} ${r2(y0 + dy)}`);
        low.unshift(`${r2(x)} ${r2(y0 + 6 + dy * 1.1)}`);
      }
      return `M ${top.join(" L ")} L ${low.join(" L ")} Z`;
    },
  );
  const furled = useTransform(flagShow, (v) => (motionSafe ? 0 : r2(1 - v)));
  const furledD = `M ${poleX} ${r2(poleTop + 10.5)} L ${r2(poleX + 3)} ${r2(poleTop + 11)} L ${r2(poleX + 3)} ${r2(poleTop + 16.5)} L ${poleX} ${r2(poleTop + 16.5)} Z`;

  const countText = useTransform(steps, (v) => fmt(v));
  const captionText = useTransform(steps, (v) =>
    v >= target
      ? `goal ${fmt(target)} · +${fmt(v - target)}`
      : `of ${fmt(target)} · ${pctOf(Math.max(0, v))}%`,
  );

  // An empty pitch shows until its tent is up.
  const pitches = [
    useTransform(camp0, unpitched),
    useTransform(camp1, unpitched),
    useTransform(camp2, unpitched),
  ];
  const campSites = [camp0, camp1, camp2].map((mv, k) => {
    const p = pointAt(trail, (CAMPS[k] ?? 0) * trail.total);
    return {
      mv,
      pitch: pitches[k] ?? mv,
      x: r2(p.x),
      y: r2(p.y - 6.5),
    };
  });

  const dots: { x: number; y: number; h: number }[] = [];
  let lastDot = -10;
  for (let h = 1; h <= lastHour; h += 1) {
    const n = day.cum[h] as number;
    if (n >= target) break;
    const s = (n / target) * trail.total;
    if (s < 1.5 || s - lastDot < 3) continue;
    lastDot = s;
    const p = pointAt(trail, s);
    dots.push({ x: r2(p.x), y: r2(p.y), h });
  }

  const live = shownHour === null;
  const valueText = readingOf(shownHour, shownSteps);

  return (
    <div
      role="group"
      aria-label={`${label} steps`}
      className={cn(
        "w-full max-w-[300px] overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label} steps, time shown`}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={Math.round(day.nowH * 60)}
        aria-valuenow={Math.round((shownHour ?? day.nowH) * 60)}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "relative block touch-none rounded-t-[15px] outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <svg
          ref={svgRef}
          aria-hidden
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
        >
          <defs>
            <linearGradient id={skyId} x1={0} y1={0} x2={0} y2={1}>
              <stop offset={0} style={{ stopColor: scene.skyTop }} />
              <stop offset={1} style={{ stopColor: scene.skyLow }} />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={W} height={H} fill={`url(#${skyId})`} />
          <Scenery terrain={terrain} clipId={clipId} />

          <path
            d={trail.d}
            fill="none"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeDasharray="2.4 3"
            style={{ stroke: PALE }}
          />
          <motion.path
            d={trodden}
            fill="none"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: scene.trodden }}
          />
          <g style={{ fill: PALE }}>
            {dots.map((d) => (
              <circle key={d.h} cx={d.x} cy={d.y} r={1.6} />
            ))}
          </g>

          {campSites.map((c, k) => (
            <g key={k} transform={`translate(${c.x} ${c.y})`}>
              <motion.circle
                cx={0}
                cy={-1.5}
                r={1.9}
                fill="none"
                strokeWidth={1}
                style={{ stroke: PALE, opacity: c.pitch }}
              />
              <motion.g
                style={{
                  scale: motionSafe ? c.mv : 1,
                  opacity: motionSafe ? 1 : c.mv,
                  originX: 0.5,
                  originY: 1,
                }}
              >
                <path d="M -5 0 L 0 -7 L 5 0 Z" style={{ fill: TENT }} />
                <path
                  d="M 0 -7 L -1.4 0 L 1.4 0 Z"
                  style={{ fill: TENT_DOOR }}
                />
              </motion.g>
            </g>
          ))}

          <line
            x1={poleX}
            x2={poleX}
            y1={poleTop}
            y2={summit[1]}
            strokeWidth={1}
            strokeLinecap="round"
            style={{ stroke: FIGURE }}
          />
          <motion.path d={furledD} style={{ fill: FLAG, opacity: furled }} />
          <motion.path d={cloth} style={{ fill: FLAG, opacity: flagShow }} />

          <motion.path d={pack} style={{ fill: PACK }} />
          <motion.path
            d={legs}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{ stroke: FIGURE }}
          />
          <motion.path
            d={body}
            fill="none"
            strokeWidth={2.6}
            strokeLinecap="round"
            style={{ stroke: JACKET }}
          />
          <motion.path
            d={arm}
            fill="none"
            strokeWidth={1.3}
            strokeLinecap="round"
            style={{ stroke: JACKET }}
          />
          <motion.circle cx={headX} cy={headY} r={2.4} style={{ fill: SKIN }} />
        </svg>
        <span
          aria-hidden
          className="pointer-events-none absolute top-2 left-2 inline-flex h-5 items-center rounded-full bg-popover/85 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
        >
          {label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-lg leading-tight text-foreground tabular-nums">
            <motion.span>{countText}</motion.span>
          </p>
          <p className="truncate text-xs text-ink-3">
            <motion.span>{captionText}</motion.span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            aria-hidden
            className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] text-foreground tabular-nums"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                live ? "bg-signal" : "border border-ink-3",
              )}
            />
            <motion.span>{pillText}</motion.span>
          </span>
          {live ? null : (
            <motion.button
              type="button"
              disabled={disabled}
              aria-label={`Back to now, ${clockText(day.nowH)}`}
              onClick={() => commit(null, "pointer")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className={cn(
                "inline-flex h-6 shrink-0 cursor-pointer items-center rounded-full border border-hairline px-2.5 text-[11px] font-medium text-foreground transition-colors outline-none",
                "hover:bg-surface-2",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed",
              )}
            >
              Now
            </motion.button>
          )}
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Drag along the trail, or use the arrow keys, to see the steps taken by
        each hour. Escape returns to now.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
