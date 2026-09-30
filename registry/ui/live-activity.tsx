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

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
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
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LiveActivityMode = "courier" | "ride" | "flight";

export type LiveActivityNotice = {
  id: string;
  title: string;
  body?: string;
  /** A danger tone is announced assertively. @default "info" */
  tone?: "info" | "success" | "warn" | "danger";
  /** The last reported position along the route, 0 to 1. */
  progress: number;
  /** When it is due, in ms since the epoch. With `now`, this is the ETA. */
  arrival?: number;
};

export type LiveActivityProps = {
  /** The activities. The first is in front; the rest wait as pills. */
  notices: LiveActivityNotice[];
  /** Fires from the dismiss button or Delete on the front card. */
  onDismiss?: (id: string) => void;
  /** The current time, so the ETA renders the same on the server. Advance it to count down. */
  now?: number | Date;
  /** How many stops the route has, 3 to 5. @default 4 */
  stages?: number;
  /** What is travelling: a van on streets, a car, or a plane on an arc. @default "courier" */
  mode?: LiveActivityMode;
  /** Whether the map strip is open. A tap toggles it; changing this moves it there. @default false */
  expand?: boolean;
  /** Fires from the tap or key that opened or closed the map. */
  onExpandChange?: (open: boolean) => void;
  /** Names for the stops, first to last. @default the mode's own */
  labels?: string[];
  /** The region's accessible name. @default "Live activity" */
  label?: string;
  /** Tick on opening the map and chime its passed stops. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const STAGES: Record<LiveActivityMode, string[]> = {
  courier: ["Ordered", "Packed", "Picked up", "Nearby", "Delivered"],
  ride: ["Requested", "Matched", "Arriving", "On trip", "Dropped off"],
  flight: ["Checked in", "Boarding", "Departed", "Descending", "Landed"],
};

/** Which of five names a route of n stops keeps. */
const SAMPLE: Record<number, number[]> = {
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
};

const TONES = {
  info: "var(--accent)",
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
} as const;

/** The tone as pigment: filled discs and the travelled line, same in both themes. */
const PIGMENT = "oklch(from var(--tone) 0.62 calc(c * 0.95) h)";

const MAP_H = 64;
const MAP_PAD = 26;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const toMs = (t: number | Date | undefined) =>
  t === undefined ? undefined : typeof t === "number" ? t : t.getTime();

function etaParts(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { h, m, s };
}

const minutesSpoken = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1
    ? "under a minute left"
    : `about ${m} ${m === 1 ? "minute" : "minutes"} left`;
};

/** The vehicle's strokes, drawn in a 16-unit box. */
function VehicleShape({ mode }: { mode: LiveActivityMode }) {
  if (mode === "flight") {
    return (
      <path
        fill="currentColor"
        stroke="none"
        d="M14.6 8c0-.55-.45-1-1-1H9.9L6.7 2.4H5.2L6.9 7H4.3L3.1 5.4H2l.75 2.6L2 10.6h1.1L4.3 9h2.6l-1.7 4.6h1.5L9.9 9h3.7c.55 0 1-.45 1-1Z"
      />
    );
  }
  if (mode === "ride") {
    return (
      <>
        <path d="M2.5 10.8V8.6l1.7-3.3h7.6l1.7 3.3v2.2Z" />
        <circle cx={5} cy={11.4} r={1.2} />
        <circle cx={11} cy={11.4} r={1.2} />
      </>
    );
  }
  return (
    <>
      <path d="M1.8 4.8h7.6v6.4H1.8Z" />
      <path d="M9.4 7.2h2.9l1.9 2.1v1.9H9.4" />
      <circle cx={4.6} cy={11.8} r={1.3} />
      <circle cx={11.6} cy={11.8} r={1.3} />
    </>
  );
}

function Vehicle({
  mode,
  className,
}: {
  mode: LiveActivityMode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <VehicleShape mode={mode} />
    </svg>
  );
}

type Pt = [number, number];

type Route = {
  stops: Pt[];
  /** Each leg's points, from one stop to the next. */
  legs: Pt[][];
  /** Each leg's cumulative lengths, parallel to its points. */
  lengths: number[][];
};

/** The route through n stops across a strip `w` wide, seeded by the activity. */
function buildRoute(
  mode: LiveActivityMode,
  n: number,
  w: number,
  seed: number,
): Route {
  const rand = lcg(seed);
  const span = Math.max(1, w - 2 * MAP_PAD);
  const rows = [16, 32, 48];
  const stops: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = MAP_PAD + (span * i) / (n - 1);
    let y: number;
    if (mode === "flight") {
      // A great-circle arc seen flat: highest in the middle of the journey.
      const u = i / (n - 1);
      y = 52 - 34 * Math.sin(Math.PI * u);
    } else {
      y = rows[Math.floor(rand() * rows.length) % rows.length] ?? 32;
    }
    stops.push([r2(x), r2(y)]);
  }
  const legs: Pt[][] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = stops[i] as Pt;
    const b = stops[i + 1] as Pt;
    const pts: Pt[] = [];
    if (mode === "courier") {
      // Streets: along the row, down the cross street, along the next row.
      const mx = r2(a[0] + (b[0] - a[0]) * (0.35 + rand() * 0.3));
      pts.push(a, [mx, a[1]], [mx, b[1]], b);
    } else {
      for (let k = 0; k <= 16; k += 1) {
        const t = k / 16;
        const x = a[0] + (b[0] - a[0]) * t;
        let y: number;
        if (mode === "flight") {
          const u = (i + t) / (n - 1);
          y = 52 - 34 * Math.sin(Math.PI * u);
        } else {
          // A ride eases round its corners.
          y = a[1] + (b[1] - a[1]) * ((1 - Math.cos(Math.PI * t)) / 2);
        }
        pts.push([r2(x), r2(y)]);
      }
    }
    legs.push(pts);
  }
  const lengths = legs.map((pts) => {
    const out = [0];
    for (let k = 1; k < pts.length; k += 1) {
      const p = pts[k - 1] as Pt;
      const q = pts[k] as Pt;
      out.push((out[k - 1] ?? 0) + Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    return out;
  });
  return { stops, legs, lengths };
}

/** Where along the route a progress is, the heading there, and the path up to it. */
function travel(route: Route, p: number) {
  const n = route.stops.length;
  const f = clamp01(p) * (n - 1);
  const leg = Math.min(n - 2, Math.floor(f));
  const t = f - leg;
  const d: string[] = [];
  for (let i = 0; i < leg; i += 1) {
    for (const [x, y] of route.legs[i] ?? []) d.push(`${x} ${y}`);
  }
  const pts = route.legs[leg] ?? [];
  const lens = route.lengths[leg] ?? [0];
  const total = lens[lens.length - 1] ?? 0;
  const at = total * t;
  let k = 1;
  while (k < pts.length - 1 && (lens[k] ?? 0) < at) k += 1;
  const a = pts[k - 1] ?? route.stops[0] ?? [0, 0];
  const b = pts[k] ?? a;
  const l0 = lens[k - 1] ?? 0;
  const l1 = lens[k] ?? l0;
  const u = l1 > l0 ? (at - l0) / (l1 - l0) : 0;
  const x = r2(a[0] + (b[0] - a[0]) * u);
  const y = r2(a[1] + (b[1] - a[1]) * u);
  for (let i = 0; i < k; i += 1) {
    const q = pts[i];
    if (q) d.push(`${q[0]} ${q[1]}`);
  }
  d.push(`${x} ${y}`);
  const heading = Math.round(
    (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
  );
  return { x, y, heading, d: d.length > 1 ? `M ${d.join(" L ")}` : "" };
}

function MapStop({
  x,
  y,
  at,
  drawn,
}: {
  x: number;
  y: number;
  at: number;
  drawn: MotionValue<number>;
}) {
  const lit = useTransform(drawn, (v) => (v >= at - 0.001 ? 1 : 0));
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={4.5}
        className="fill-popover stroke-hairline-strong"
        strokeWidth={1.5}
      />
      <motion.circle
        cx={x}
        cy={y}
        r={4.5}
        style={{ fill: PIGMENT, opacity: lit }}
      />
    </g>
  );
}

function RouteMap({
  notice,
  mode,
  stages,
  pos,
  drawn,
}: {
  notice: LiveActivityNotice;
  mode: LiveActivityMode;
  stages: number;
  pos: MotionValue<number>;
  drawn: MotionValue<number>;
}) {
  const [w, setW] = React.useState(640);
  const bind = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const next = Math.round(node.clientWidth);
      if (next > 0) setW((prev) => (prev === next ? prev : next));
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const seed = hash(notice.id);
  const route = React.useMemo(
    () => buildRoute(mode, stages, w, seed),
    [mode, stages, w, seed],
  );
  const full = React.useMemo(() => travel(route, 1).d, [route]);
  const shown = useTransform(
    [pos, drawn] as MotionValue<number>[],
    ([p = 0, d = 0]: number[]) => travel(route, p * d),
  );
  const pathD = useTransform(shown, (s) => s.d);
  const vx = useTransform(shown, (s) => s.x);
  const vy = useTransform(shown, (s) => s.y);
  const heading = useTransform(shown, (s) =>
    mode === "flight" ? s.heading : 0,
  );
  const markerOpacity = useTransform(drawn, (d) => r2(clamp01(d * 4)));
  const reach = useTransform(
    [pos, drawn] as MotionValue<number>[],
    ([p = 0, d = 0]: number[]) => p * d,
  );

  // The map itself: seeded streets and blocks, or a coast and a sea.
  const scenery = React.useMemo(() => {
    const rand = lcg(seed ^ 0x9e3779b9);
    const blocks: {
      x: number;
      y: number;
      w: number;
      h: number;
      park: boolean;
    }[] = [];
    const streets: number[] = [];
    for (
      let x = 6 + Math.round(rand() * 14);
      x < w - 6;
      x += 44 + Math.round(rand() * 26)
    ) {
      streets.push(x);
    }
    const bands: [number, number][] = [
      [2, 12],
      [20, 28],
      [36, 44],
      [52, 62],
    ];
    for (let i = 0; i + 1 < streets.length; i += 1) {
      const x0 = (streets[i] ?? 0) + 4;
      const x1 = (streets[i + 1] ?? 0) - 4;
      for (const [y0, y1] of bands) {
        if (x1 - x0 < 6) continue;
        blocks.push({
          x: x0,
          y: y0,
          w: x1 - x0,
          h: y1 - y0,
          park: rand() < 0.08,
        });
      }
    }
    const shore = (from: number, to: number, side: 1 | -1) => {
      const pts: string[] = [];
      const edge = side === 1 ? 0 : w;
      pts.push(`${edge} 0`);
      for (let y = 0; y <= MAP_H; y += 8) {
        const x =
          side === 1
            ? from + rand() * (to - from)
            : w - (from + rand() * (to - from));
        pts.push(`${r2(x)} ${y}`);
      }
      pts.push(`${edge} ${MAP_H}`);
      return `M ${pts.join(" L ")} Z`;
    };
    return {
      streets,
      blocks,
      west: shore(34, 58, 1),
      east: shore(34, 58, -1),
      river: `M 0 ${r2(26 + rand() * 12)} C ${r2(w * 0.3)} ${r2(8 + rand() * 20)}, ${r2(w * 0.6)} ${r2(44 + rand() * 16)}, ${w} ${r2(24 + rand() * 16)}`,
    };
  }, [seed, w]);

  return (
    <div ref={bind} className="relative w-full">
      <svg
        aria-hidden
        width={w}
        height={MAP_H}
        viewBox={`0 0 ${w} ${MAP_H}`}
        className="block h-16 w-full rounded-2"
      >
        <rect
          width={w}
          height={MAP_H}
          className={mode === "flight" ? "fill-cobalt-wash" : "fill-surface-1"}
        />
        {mode === "flight" ? (
          <>
            <path
              d={scenery.west}
              className="fill-surface-2 stroke-hairline-strong"
              strokeWidth={1}
            />
            <path
              d={scenery.east}
              className="fill-surface-2 stroke-hairline-strong"
              strokeWidth={1}
            />
            <path
              d={full}
              fill="none"
              strokeWidth={1.5}
              strokeDasharray="4 5"
              strokeLinecap="round"
              className="stroke-ink-3"
            />
          </>
        ) : (
          <>
            {scenery.blocks.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={2}
                className={b.park ? "fill-success/20" : "fill-surface-2"}
              />
            ))}
            <path
              d={scenery.river}
              fill="none"
              strokeWidth={5}
              strokeLinecap="round"
              className="stroke-cobalt-bright/20"
            />
            <path
              d={full}
              fill="none"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-hairline-strong"
            />
          </>
        )}
        <motion.path
          d={pathD}
          fill="none"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ stroke: PIGMENT }}
        />
        {route.stops.map(([x, y], i) => (
          <MapStop key={i} x={x} y={y} at={i / (stages - 1)} drawn={reach} />
        ))}
        <motion.g style={{ x: vx, y: vy, opacity: markerOpacity }}>
          <circle r={9} style={{ fill: PIGMENT }} />
          <motion.g style={{ rotate: heading, originX: 0.5, originY: 0.5 }}>
            <g
              transform="translate(-6 -6) scale(0.75)"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                color: "color-mix(in oklab, var(--tone) 6%, white)",
              }}
            >
              <VehicleShape mode={mode} />
            </g>
          </motion.g>
        </motion.g>
      </svg>
    </div>
  );
}

type CardProps = {
  notice: LiveActivityNotice;
  names: string[];
  stages: number;
  mode: LiveActivityMode;
  now: number | undefined;
  open: boolean;
  disabled: boolean;
  motionSafe: boolean;
  audio: TactileSound;
  onToggle: () => void;
  onDismiss: () => void;
  onStage: (index: number) => void;
};

function ActivityCard({
  notice,
  names,
  stages,
  mode,
  now,
  open,
  disabled,
  motionSafe,
  audio,
  onToggle,
  onDismiss,
  onStage,
}: CardProps) {
  const uid = React.useId();
  const target = clamp01(notice.progress);
  const pos = useMotionValue(target);
  const drawn = useMotionValue(open ? 1 : 0);
  const pulse = useMotionValue(0);
  const [pct, setPct] = React.useState(() => Math.round(target * 100));
  const [mapH, setMapH] = React.useState(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const chimes = React.useRef<number[]>([]);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const latest = React.useRef({ onStage, stages });
  React.useEffect(() => {
    latest.current = { onStage, stages };
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  // A new report: the vehicle eases there, paced by how far it has to go.
  const goal = React.useRef(target);
  React.useEffect(() => {
    if (target === goal.current && Math.abs(pos.get() - target) < 0.001) return;
    goal.current = target;
    if (!motionSafe) {
      anims.current.get("pos")?.stop();
      pos.set(target);
      return;
    }
    const distance = Math.abs(target - pos.get());
    run(
      "pos",
      animate(pos, target, {
        duration: clamp(distance * 8, 0.6, 2.2),
        ease: easings.move,
      }),
    );
  }, [target, motionSafe, pos]);

  // The stops light as the vehicle passes them, not when the report comes.
  const lastStage = React.useRef(Math.floor(target * (stages - 1) + 1e-6));
  React.useEffect(() => {
    lastStage.current = Math.floor(pos.get() * (stages - 1) + 1e-6);
    return pos.on("change", (v) => {
      const whole = Math.round(v * 100);
      setPct((p) => (p === whole ? p : whole));
      const n = latest.current.stages;
      const stage = Math.floor(v * (n - 1) + 1e-6);
      if (stage > lastStage.current) {
        lastStage.current = stage;
        latest.current.onStage(stage);
        pulse.set(0);
        run("pulse", animate(pulse, 1, { duration: 0.7, ease: easings.enter }));
      } else if (stage < lastStage.current) {
        lastStage.current = stage;
      }
    });
  }, [pos, pulse, stages]);

  // Opening draws the route from the start to the vehicle, and each stop
  // already passed chimes as the line reaches it: the visitor asked to see.
  const shownOpen = React.useRef(open);
  React.useEffect(() => {
    for (const t of chimes.current) window.clearTimeout(t);
    chimes.current.length = 0;
    if (open === shownOpen.current) return;
    shownOpen.current = open;
    if (!open) {
      run(
        "drawn",
        animate(drawn, 0, { duration: durations.fast, ease: easings.exit }),
      );
      return;
    }
    if (!motionSafe) {
      drawn.set(1);
      return;
    }
    drawn.set(0);
    const time = 0.6;
    run("drawn", animate(drawn, 1, { duration: time, ease: "linear" }));
    const p = pos.get();
    const n = latest.current.stages;
    const rect = buttonRef.current?.getBoundingClientRect();
    for (let k = 0; k < n; k += 1) {
      const at = k / (n - 1);
      if (at > p + 1e-6) break;
      const delay = p > 0 ? Math.round((at / p) * time * 1000) : 0;
      chimes.current.push(
        window.setTimeout(() => {
          audio.play("chime", {
            pitch: r2(semitones(k * 2)),
            gain: 0.35,
            pan: rect
              ? panFrom(rect.left + rect.width * (0.1 + 0.8 * at), null)
              : 0,
          });
        }, delay + 80),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = chimes.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
    };
  }, []);

  const bindMap = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const h = Math.round(node.offsetHeight);
      setMapH((prev) => (prev === h ? prev : h));
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const reached = Math.min(
    stages - 1,
    Math.floor((pct / 100) * (stages - 1) + 1e-6),
  );
  const done = pct >= 100;
  const stageName = names[reached] ?? "";
  const nowMs = now;
  const left =
    notice.arrival !== undefined && nowMs !== undefined
      ? notice.arrival - nowMs
      : undefined;
  const parts = left !== undefined ? etaParts(left) : undefined;
  const fillLeft = useTransform(pos, (p) => `${r2(p * 100)}%`);
  const ringScale = useTransform(pulse, (v) => r2(1 + v * 1.4));
  const ringOpacity = useTransform(pulse, (v) =>
    v > 0 && v < 1 ? r2(0.7 * (1 - v)) : 0,
  );
  const fill = useTransform(pos, (p) => r2(p));

  const spoken = [
    notice.title,
    stageName,
    done ? "" : left !== undefined ? minutesSpoken(left) : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="@container relative w-full">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={`${uid}-map`}
        aria-label={spoken}
        aria-describedby={`${uid}-stops`}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            onDismiss();
          }
        }}
        className={cn(
          "block w-full cursor-pointer rounded-3 px-3 pt-3 pr-12 pb-2.5 text-left",
          "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed",
        )}
      >
        <span className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: PIGMENT,
              color: "color-mix(in oklab, var(--tone) 6%, white)",
            }}
          >
            <Vehicle mode={mode} className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-sm leading-5 font-medium text-foreground"
              title={notice.title}
            >
              {notice.title}
            </span>
            <span className="relative block h-4 overflow-clip text-xs leading-4 text-ink-2">
              <AnimatePresence initial={false}>
                <motion.span
                  key={stageName}
                  className="absolute inset-0 truncate"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe ? springs.snap : { duration: durations.fast }
                  }
                >
                  {stageName}
                  {notice.body ? ` · ${notice.body}` : ""}
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            {done ? (
              <span className="text-sm leading-5 font-medium text-success">
                Here
              </span>
            ) : parts ? (
              <span className="flex font-mono text-lg leading-6 text-foreground tabular-nums">
                {parts.h > 0 ? <span>{parts.h}:</span> : null}
                <span className="relative inline-flex overflow-clip">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={`${parts.h}-${parts.m}`}
                      initial={
                        motionSafe ? { y: "-100%", opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ y: 0, opacity: 1 }}
                      exit={
                        motionSafe
                          ? {
                              y: "100%",
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }
                          : { opacity: 0 }
                      }
                      transition={
                        motionSafe ? springs.snap : { duration: durations.fast }
                      }
                    >
                      {parts.h > 0 ? String(parts.m).padStart(2, "0") : parts.m}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span>:{String(parts.s).padStart(2, "0")}</span>
              </span>
            ) : (
              <span className="font-mono text-lg leading-6 text-ink-3">
                --:--
              </span>
            )}
            <span className="font-mono text-[10px] leading-3 tracking-[0.08em] text-ink-3 uppercase">
              {done ? names[stages - 1] : "left"}
            </span>
          </span>
        </span>

        <span aria-hidden className="relative mt-3 block h-6 px-3">
          <span className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-hairline-strong" />
          <motion.span
            className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full"
            style={{ background: PIGMENT, scaleX: fill, originX: 0 }}
          />
          <span className="absolute inset-x-3 inset-y-0">
            {names.map((name, i) => {
              const at = i / (stages - 1);
              const isLit = i <= reached;
              const isNext = i === reached + 1;
              return (
                <span
                  key={i}
                  title={name}
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors"
                  style={{
                    left: `${r2(at * 100)}%`,
                    background: isLit ? PIGMENT : "var(--popover)",
                    borderColor: isLit
                      ? PIGMENT
                      : isNext
                        ? "var(--ink-3)"
                        : "var(--hairline-strong)",
                  }}
                >
                  {i === reached && motionSafe ? (
                    <motion.span
                      className="absolute -inset-1 rounded-full border"
                      style={{
                        borderColor: PIGMENT,
                        scale: ringScale,
                        opacity: ringOpacity,
                      }}
                    />
                  ) : null}
                </span>
              );
            })}
            <motion.span
              className="absolute top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-popover"
              style={{
                left: fillLeft,
                background: PIGMENT,
                color: "color-mix(in oklab, var(--tone) 6%, white)",
              }}
            >
              <Vehicle mode={mode} className="size-3.5" />
            </motion.span>
          </span>
        </span>

        <span
          aria-hidden
          className="relative mt-1.5 hidden h-3.5 px-3 @lg:block"
        >
          <span className="absolute inset-x-3 inset-y-0">
            {names.map((name, i) => {
              const at = i / (stages - 1);
              return (
                <span
                  key={i}
                  className={cn(
                    "absolute top-0 font-mono text-[10px] leading-3.5 whitespace-nowrap",
                    i <= reached ? "text-ink-2" : "text-ink-3",
                    i === 0
                      ? ""
                      : i === stages - 1
                        ? "-translate-x-full"
                        : "-translate-x-1/2",
                  )}
                  style={{ left: `${r2(at * 100)}%` }}
                >
                  {name}
                </span>
              );
            })}
          </span>
        </span>
      </button>

      <ul id={`${uid}-stops`} role="list" className="sr-only">
        {names.map((name, i) => (
          <li key={i}>
            {name},{" "}
            {i <= reached ? "reached" : i === reached + 1 ? "next" : "to come"}
          </li>
        ))}
      </ul>

      <button
        type="button"
        aria-label={`Dismiss ${notice.title}`}
        disabled={disabled}
        onClick={onDismiss}
        className={cn(
          "absolute top-3 right-3 inline-flex size-7 cursor-pointer items-center justify-center rounded-2 text-ink-3 transition-colors",
          "hover:bg-surface-2 hover:text-foreground",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>

      <motion.div
        id={`${uid}-map`}
        inert={!open}
        className="overflow-clip"
        initial={false}
        animate={{ height: open ? mapH : 0, opacity: open ? 1 : 0 }}
        transition={
          motionSafe
            ? { height: springs.glide, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      >
        <div ref={bindMap} className="px-3 pb-3">
          <RouteMap
            notice={notice}
            mode={mode}
            stages={stages}
            pos={pos}
            drawn={drawn}
          />
        </div>
      </motion.div>
    </div>
  );
}

type Said = { n: number; text: string; urgent: boolean };

/**
 * A live activity for something on its way. The host reports positions and
 * an arrival time; the card never jumps to them. A van, a car or a plane
 * rides a route line with `stages` stops, and each report eases it along on a
 * tween paced by the distance, the travelled line filling behind it. The ETA
 * counts down from `now` in tabular figures with the minutes rolling, and
 * stops light as the vehicle actually passes them, a ring pulsing out once.
 *
 * A tap opens a map strip on glide: seeded streets or a coast, the same stops
 * on a route drawn up to the vehicle, rebuilt per frame from the same eased
 * position. Opening draws the route from the start and the stops already
 * passed light along it with a rising chime. Other activities wait as pills.
 * The card is a real button that says its stage and time left; Delete or the
 * dismiss button clears it. Under reduced motion the vehicle moves to each
 * report at once, the map opens on a short tween and its route is drawn
 * whole, while the ETA still counts and the stops still light.
 */
export function LiveActivity({
  notices,
  onDismiss,
  now,
  stages = 4,
  mode = "courier",
  expand = false,
  onExpandChange,
  labels,
  label = "Live activity",
  sound = false,
  disabled = false,
  className,
}: LiveActivityProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const n = clamp(Math.round(stages), 3, 5);
  const kind: LiveActivityMode = mode in STAGES ? mode : "courier";
  const pick = SAMPLE[n] ?? [0, 1, 3, 4];
  const names =
    labels && labels.length === n
      ? labels
      : pick.map(
          (i) =>
            (labels && labels.length === 5 ? labels : STAGES[kind])[i] ?? "",
        );

  const [open, setOpen] = React.useState(expand);
  const [seenExpand, setSeenExpand] = React.useState(expand);
  if (expand !== seenExpand) {
    setSeenExpand(expand);
    setOpen(expand);
  }
  const [frontId, setFrontId] = React.useState<string | null>(null);
  const [gone, setGone] = React.useState<string[]>([]);
  const [clock, setClock] = React.useState<number | undefined>(undefined);
  const [said, setSaid] = React.useState<Said & { id: string }>({
    n: 0,
    id: "",
    text: "",
    urgent: false,
  });

  const live = notices.filter((x) => !gone.includes(x.id));
  if (gone.some((id) => !notices.some((x) => x.id === id))) {
    setGone(gone.filter((id) => notices.some((x) => x.id === id)));
  }
  const front = live.find((x) => x.id === frontId) ?? live[0] ?? null;
  const others = live.filter((x) => x !== front);
  if (front && said.id !== front.id) {
    setSaid({
      n: said.n + 1,
      id: front.id,
      text: `${front.title}.${front.body ? ` ${front.body}` : ""}`,
      urgent: front.tone === "danger",
    });
  }

  // With no `now` from the host, the card keeps its own clock after mount.
  const given = toMs(now);
  React.useEffect(() => {
    if (given !== undefined) return;
    const tick = () => {
      if (!document.hidden) setClock(Date.now());
    };
    const first = window.setTimeout(tick, 0);
    const every = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [given]);
  const nowMs = given ?? clock;

  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const toggle = () => {
    if (disabled) return;
    const next = !open;
    setOpen(next);
    onExpandChange?.(next);
    const rect = rootRef.current?.getBoundingClientRect();
    audio.play("tick", {
      pitch: next ? 1.15 : 0.85,
      gain: 0.45,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const dismiss = () => {
    if (!front || disabled) return;
    const hadFocus = Boolean(
      rootRef.current?.contains(document.activeElement ?? null),
    );
    setGone((g) => (g.includes(front.id) ? g : [...g, front.id]));
    setFrontId(null);
    onDismiss?.(front.id);
    if (hadFocus) rootRef.current?.focus({ preventScroll: true });
  };

  const stageSaid = (index: number) => {
    if (!front) return;
    setSaid((p) => ({
      n: p.n + 1,
      id: p.id,
      text: `${front.title}: ${names[index] ?? ""}.`,
      urgent: false,
    }));
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={label}
      tabIndex={-1}
      className={cn(
        "relative isolate flex w-full max-w-2xl flex-col gap-2 outline-none",
        className,
      )}
    >
      {front ? (
        <div
          className="relative overflow-clip rounded-3 border border-hairline-strong bg-popover shadow-[0_8px_20px_-12px_color-mix(in_oklab,black_50%,transparent)]"
          style={
            { "--tone": TONES[front.tone ?? "info"] } as React.CSSProperties
          }
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={front.id}
              initial={
                motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              <ActivityCard
                notice={front}
                names={names}
                stages={n}
                mode={kind}
                now={nowMs}
                open={open}
                disabled={disabled}
                motionSafe={motionSafe}
                audio={audio}
                onToggle={toggle}
                onDismiss={dismiss}
                onStage={stageSaid}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}

      {others.length > 0 ? (
        <ul
          role="list"
          aria-label="Other activities"
          className="flex [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
          {others.map((o) => {
            const ms =
              o.arrival !== undefined && nowMs !== undefined
                ? o.arrival - nowMs
                : undefined;
            const mins =
              ms !== undefined
                ? Math.max(0, Math.round(ms / 60000))
                : undefined;
            return (
              <li key={o.id} className="shrink-0">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setFrontId(o.id)}
                  aria-label={`Show ${o.title}${mins !== undefined ? `, about ${mins} ${mins === 1 ? "minute" : "minutes"} left` : ""}`}
                  className={cn(
                    "inline-flex h-7 max-w-64 cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-popover px-2.5 text-xs text-ink-2 transition-colors",
                    "hover:border-hairline-strong hover:text-foreground",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  <Vehicle mode={kind} className="size-3.5 shrink-0" />
                  <span className="truncate">{o.title}</span>
                  {mins !== undefined ? (
                    <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                      {mins} min
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.urgent ? "" : said.text}</span>
      </p>
      <p role="alert" aria-live="assertive" className="sr-only">
        <span key={said.n}>{said.urgent ? said.text : ""}</span>
      </p>
    </div>
  );
}
