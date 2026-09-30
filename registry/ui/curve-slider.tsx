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
import { springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CurveSliderPath = "arc" | "wave" | "spiral";

export type CurveSliderProps = {
  /** Controlled value, between `min` and `max`. */
  value?: number;
  /** Starting value when uncontrolled. @default min */
  defaultValue?: number;
  /** Fires from the drag, tap or key that changed it, with the new value. */
  onValueChange?: (value: number) => void;
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  /** @default 1 */
  step?: number;
  /** What the slider sets. Its accessible name, shown above the path. */
  label: string;
  /** The reading beside the label and in the spoken value. Defaults to the number. */
  format?: (value: number) => string;
  /** The line the track follows. @default "arc" */
  path?: CurveSliderPath;
  /** Beads at equal steps along the path, 0 to 12. They tick, and PageUp and PageDown move to them. @default 6 */
  marks?: number;
  /** Trace the path behind the thumb in the accent colour. @default true */
  fill?: boolean;
  /** Track weight in px, 2 to 14; the thumb and beads grow with it. @default 6 */
  thickness?: number;
  /** Tick softly at each mark the thumb passes. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The drawing's own units. Every path is fitted inside this box. */
const W = 260;
const H = 172;
const MARGIN = 18;
const SEGMENTS = 320;
/** How near the path, in drawing units, a press must land to take it. */
const HIT = 26;
/** How far past an end the thumb can be pulled, at most. */
const REACH = 26;
/** Arc-length distance costs this much, so a drag keeps to its own turn. */
const STAY = 0.35;

type Point = { x: number; y: number };
type Track = {
  pts: Point[];
  /** Cumulative arc length at each point. */
  lens: number[];
  total: number;
  /** "x y" for each point, rounded, for rebuilding the fill. */
  coords: string[];
  d: string;
  /** Unit tangents at the two ends, both pointing along the path. */
  start: Point;
  end: Point;
};

const PATHS: Record<CurveSliderPath, (u: number) => [number, number]> = {
  // A 240° sweep over the top, like a gauge.
  arc: (u) => {
    const a = ((210 - 240 * u) * Math.PI) / 180;
    return [Math.cos(a), -Math.sin(a)];
  },
  // One and a half periods of a sine, rising first.
  wave: (u) => [u, -0.21 * Math.sin(3 * Math.PI * u)],
  // An Archimedean spiral of 1.75 turns, winding outward, clockwise.
  spiral: (u) => {
    const r = 0.19 + 0.81 * u;
    const a = -3.5 * Math.PI * (1 - u);
    return [r * Math.cos(a), r * Math.sin(a)];
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const decimalsOf = (n: number) => {
  const text = String(n);
  if (text.includes("e-")) return Math.min(10, Number(text.split("e-")[1]));
  return (text.split(".")[1] ?? "").length;
};

/**
 * Samples a path into a polyline, fits it inside the box and measures it.
 * The points are rounded before anything is measured, so the server and the
 * browser agree on every coordinate even where their trigonometry differs in
 * the last digit.
 */
function build(shape: CurveSliderPath): Track {
  const f = PATHS[shape];
  const rawPts: [number, number][] = [];
  for (let i = 0; i <= SEGMENTS; i += 1) rawPts.push(f(i / SEGMENTS));
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of rawPts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const scale = Math.min(
    (W - 2 * MARGIN) / Math.max(1e-6, x1 - x0),
    (H - 2 * MARGIN) / Math.max(1e-6, y1 - y0),
  );
  const ox = W / 2 - ((x0 + x1) / 2) * scale;
  const oy = H / 2 - ((y0 + y1) / 2) * scale;
  const pts = rawPts.map(([x, y]) => ({
    x: r2(ox + x * scale),
    y: r2(oy + y * scale),
  }));
  const lens = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    lens.push((lens[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const unitOf = (a: Point, b: Point): Point => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const coords = pts.map((p) => `${p.x} ${p.y}`);
  const n = pts.length - 1;
  return {
    pts,
    lens,
    total: lens[n] ?? 0,
    coords,
    d: `M${coords.join("L")}`,
    start: unitOf(pts[0]!, pts[1]!),
    end: unitOf(pts[n - 1]!, pts[n]!),
  };
}

/** All three are small (321 points each), so they are built once, up front. */
const TRACKS: Record<CurveSliderPath, Track> = {
  arc: build("arc"),
  wave: build("wave"),
  spiral: build("spiral"),
};

/** The index of the segment that holds arc length `s`. */
function segmentAt(t: Track, s: number) {
  let lo = 0;
  let hi = t.lens.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((t.lens[mid] ?? 0) <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The point at arc length `s`, carried on along the end tangents past either end. */
function pointAt(t: Track, s: number): Point & { tx: number; ty: number } {
  const first = t.pts[0]!;
  const last = t.pts[t.pts.length - 1]!;
  if (s <= 0) {
    return {
      x: first.x + t.start.x * s,
      y: first.y + t.start.y * s,
      tx: t.start.x,
      ty: t.start.y,
    };
  }
  if (s >= t.total) {
    const over = s - t.total;
    return {
      x: last.x + t.end.x * over,
      y: last.y + t.end.y * over,
      tx: t.end.x,
      ty: t.end.y,
    };
  }
  const i = segmentAt(t, s);
  const a = t.pts[i]!;
  const b = t.pts[i + 1]!;
  const l = (t.lens[i + 1] ?? 0) - (t.lens[i] ?? 0) || 1;
  const k = (s - (t.lens[i] ?? 0)) / l;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    tx: (b.x - a.x) / l,
    ty: (b.y - a.y) / l,
  };
}

/**
 * The nearest point on the path to (x, y), by projection onto every segment.
 * With `prev`, arc-length distance from it costs a little, so on the spiral a
 * finger drifting between two turns stays on its own turn. Past either end
 * the answer carries on along the end's tangent, rubber-banded.
 */
function nearest(t: Track, x: number, y: number, prev: number | null) {
  let best = Infinity;
  let bestS = 0;
  let bestD = Infinity;
  for (let i = 0; i < t.pts.length - 1; i += 1) {
    const a = t.pts[i]!;
    const b = t.pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) continue;
    const k = clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1);
    const px = a.x + dx * k;
    const py = a.y + dy * k;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    const s = (t.lens[i] ?? 0) + k * Math.sqrt(l2);
    const cost = prev === null ? d2 : d2 + (STAY * (s - prev)) ** 2;
    if (cost < best) {
      best = cost;
      bestS = s;
      bestD = Math.sqrt(d2);
    }
  }
  const first = t.pts[0]!;
  const last = t.pts[t.pts.length - 1]!;
  if (bestS <= 1e-3) {
    const over = -((x - first.x) * t.start.x + (y - first.y) * t.start.y);
    if (over > 0) bestS = -rubberband(over, REACH);
  } else if (bestS >= t.total - 1e-3) {
    const over = (x - last.x) * t.end.x + (y - last.y) * t.end.y;
    if (over > 0) bestS = t.total + rubberband(over, REACH);
  }
  return { s: bestS, d: bestD };
}

/** The path from its start to arc length `s`, as a polyline. */
function prefix(t: Track, s: number): string {
  if (s <= 0) return "";
  const at = pointAt(t, s);
  const tail = `${r2(at.x)} ${r2(at.y)}`;
  if (s >= t.total) return `M${t.coords.join("L")}L${tail}`;
  const i = segmentAt(t, s);
  return `M${t.coords.slice(0, i + 1).join("L")}L${tail}`;
}

/**
 * A slider whose track is any line: an arc, a wave or a spiral. The thumb
 * goes to the point on the path nearest the finger, by projection onto the
 * sampled path, and the value is arc length, so equal steps are equal
 * distances along the line however it bends. A press away from the thumb
 * chases the pressed point on the house flick spring and then follows 1:1;
 * past either end the thumb rubber-bands out along the end's tangent. A
 * release is projected along the path from the finger's speed along it, so a
 * flick carries on round the curve, and glides to its step on the house
 * glide spring with that speed. The fill traces the path behind the thumb,
 * rebuilt from the sampled points each frame.
 *
 * It is a real `role="slider"`: arrows move a step, PageUp and PageDown move
 * to the next mark, Home and End to the ends, and the thumb glides along the
 * path each time, ticking at every mark it passes exactly as a drag would.
 * Under reduced motion the thumb and fill jump to their place, while the
 * reading, the marks and the ticks still answer.
 */
export function CurveSlider({
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format,
  path = "arc",
  marks = 6,
  fill = true,
  thickness = 6,
  sound = false,
  disabled = false,
  className,
}: CurveSliderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();

  const shape: CurveSliderPath = path in TRACKS ? path : "arc";
  const track = TRACKS[shape];
  const total = track.total;
  const unit = step > 0 ? step : 1;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max) > lo ? Math.max(min, max) : lo + unit;
  const decimals = Math.max(decimalsOf(unit), decimalsOf(lo));
  const weight = clamp(thickness, 1, 20);
  const thumbR = r2(Math.max(9, weight / 2 + 4));
  const beadR = r2(Math.max(2.5, weight * 0.28));

  const snap = (v: number) =>
    Number(
      clamp(lo + Math.round((v - lo) / unit) * unit, lo, hi).toFixed(decimals),
    );
  const sOf = (v: number) => r2(((v - lo) / (hi - lo)) * total);
  const valueAt = (s: number) => snap(lo + clamp(s / total, 0, 1) * (hi - lo));

  const [own, setOwn] = React.useState(() => snap(defaultValue ?? lo));
  const controlled = value !== undefined;
  const current = snap(value ?? own);
  const restS = sOf(current);

  const count = Math.round(clamp(marks, 0, 24));
  const markValues =
    count > 0
      ? [
          ...new Set(
            Array.from({ length: count + 1 }, (_, k) =>
              snap(lo + (k * (hi - lo)) / count),
            ),
          ),
        ]
      : [];
  const markS = markValues.map(sOf);
  const tickS = count > 0 ? markS : [0, r2(total)];

  /** Arc length of the thumb along the path; past 0 or `total` is a pull. */
  const s = useMotionValue(restS);
  const pressed = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const pressRun = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const chasing = React.useRef(false);
  /** Where the finger last projected to, for the next projection. */
  const prevS = React.useRef(restS);
  /** Ticks belong to gestures; a host's move or a redrawn path is silent. */
  const voice = React.useRef(false);
  const lastTick = React.useRef({ at: -1, time: -Infinity });
  const goal = React.useRef({ value: current, s: restS, shape });
  const reported = React.useRef(current);
  const [answered, setAnswered] = React.useState(0);

  const tick = (at: number) => {
    const root = rootRef.current;
    const rect = root?.getBoundingClientRect();
    const p = pointAt(track, at);
    const clientX = rect ? rect.left + (p.x / W) * rect.width : 0;
    audio.play("tick", {
      pitch: r2(lerp(0.85, 1.35, clamp(at / total, 0, 1))),
      gain: 0.32,
      pan: panFrom(clientX, root),
    });
  };
  const hear = React.useRef({ tickS, tick });
  React.useEffect(() => {
    hear.current = { tickS, tick };
  });
  React.useEffect(() => {
    reported.current = current;
  }, [current]);

  // A mark ticks on the frame the thumb reaches or crosses it, whatever
  // moved it; a spring settling on the same mark does not tick it twice.
  React.useEffect(() => {
    let prev = s.get();
    return s.on("change", (v) => {
      const from = prev;
      prev = v;
      if (!voice.current) return;
      for (const m of hear.current.tickS) {
        if (!((from < m && v >= m) || (from > m && v <= m))) continue;
        const now = performance.now();
        const last = lastTick.current;
        if (last.at === m && now - last.time < 150) break;
        lastTick.current = { at: m, time: now };
        hear.current.tick(m);
        break;
      }
    });
  }, [s]);

  const report = (next: number) => {
    if (next === reported.current) return;
    reported.current = next;
    if (!controlled) setOwn(next);
    onValueChange?.(next);
  };

  const press = (to: number) => {
    pressRun.current?.stop();
    if (!motionSafe) {
      pressed.set(0);
      return;
    }
    pressRun.current = animate(pressed, to, springs.flick);
  };

  const commit = (next: number, velocity = 0, audible = true) => {
    const target = sOf(next);
    goal.current = { value: next, s: target, shape };
    prevS.current = target;
    voice.current = audible;
    run.current?.stop();
    if (motionSafe) {
      run.current = animate(s, target, { ...springs.glide, velocity });
    } else {
      s.set(target);
    }
    report(next);
    // Checked again once the host has answered: a refused change glides back.
    setAnswered((n) => n + 1);
  };

  /** Client coordinates to drawing units, and drawing units per client px. */
  const toLocal = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) * W) / rect.width,
      y: ((clientY - rect.top) * H) / rect.height,
      per: W / rect.width,
    };
  };

  const drag = useDrag({
    disabled,
    onStart: () => {
      dragging.current = true;
      chasing.current = true;
      voice.current = true;
      run.current?.stop();
      press(1);
    },
    onMove: ({ point }) => {
      if (disabled) return;
      const at = toLocal(point.x, point.y);
      if (!at) return;
      const hit = nearest(track, at.x, at.y, prevS.current);
      prevS.current = clamp(hit.s, 0, total);
      const to = r2(hit.s);
      // The first moves chase the pressed point; once caught, it is 1:1.
      if (motionSafe && chasing.current && Math.abs(to - s.get()) > 1) {
        run.current = animate(s, to, {
          ...springs.flick,
          velocity: s.getVelocity(),
        });
      } else {
        chasing.current = false;
        run.current?.stop();
        s.set(to);
      }
      report(valueAt(to));
    },
    onEnd: ({ point, velocity }) => {
      dragging.current = false;
      press(0);
      // Disabled mid-drag: it settles where it last was, quietly.
      if (disabled) {
        commit(reported.current, 0, false);
        return;
      }
      const at = toLocal(point.x, point.y);
      const from = prevS.current;
      const dir = pointAt(track, from);
      // Only the finger's speed along the path carries the thumb on.
      const along = at
        ? (velocity.x * dir.tx + velocity.y * dir.ty) * at.per
        : 0;
      commit(valueAt(project(from, along, 0.994)), along);
    },
    onCancel: () => {
      dragging.current = false;
      press(0);
      commit(reported.current, 0, !disabled);
    },
    onTap: (event) => {
      const at = toLocal(event.clientX, event.clientY);
      if (!at) return;
      commit(valueAt(nearest(track, at.x, at.y, null).s));
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const at = toLocal(event.clientX, event.clientY);
    if (!at) return;
    const here = clamp(s.get(), 0, total);
    const thumb = pointAt(track, here);
    const onThumb = Math.hypot(at.x - thumb.x, at.y - thumb.y) <= thumbR + 8;
    const hit = nearest(track, at.x, at.y, null);
    // Only the path and the thumb are live: the empty middle of an arc is not.
    if (!onThumb && hit.d > HIT) return;
    prevS.current = onThumb ? here : clamp(hit.s, 0, total);
    drag.onPointerDown(event);
  };

  // The host's value (or a refusal of ours) is where the thumb rests. A new
  // path or range redraws it in place; neither makes a sound.
  React.useEffect(() => {
    if (dragging.current) return;
    const g0 = goal.current;
    if (g0.value === current && g0.s === restS && g0.shape === shape) return;
    const glide = g0.shape === shape && g0.value !== current;
    goal.current = { value: current, s: restS, shape };
    prevS.current = restS;
    voice.current = false;
    run.current?.stop();
    if (glide && motionSafe) {
      run.current = animate(s, restS, springs.glide);
    } else {
      s.set(restS);
    }
  }, [current, restS, shape, answered, motionSafe, s]);

  React.useEffect(
    () => () => {
      run.current?.stop();
      pressRun.current?.stop();
    },
    [],
  );

  const nextMark = (from: number, dir: 1 | -1) => {
    if (markValues.length < 2) return snap(from + (dir * (hi - lo)) / 10);
    const eps = unit / 1000;
    if (dir > 0) return markValues.find((m) => m > from + eps) ?? hi;
    return [...markValues].reverse().find((m) => m < from - eps) ?? lo;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = current + unit;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = current - unit;
        break;
      case "PageUp":
        next = nextMark(current, 1);
        break;
      case "PageDown":
        next = nextMark(current, -1);
        break;
      case "Home":
        next = lo;
        break;
      case "End":
        next = hi;
        break;
      default:
        return;
    }
    event.preventDefault();
    next = snap(next);
    if (next !== current) commit(next);
  };

  const thumb = useTransform(s, (v) => {
    const p = pointAt(track, v);
    const inset = thumbR + 1;
    return {
      x: r2(clamp(p.x, inset, W - inset)),
      y: r2(clamp(p.y, inset, H - inset)),
    };
  });
  const cx = useTransform(thumb, (p) => p.x);
  const cy = useTransform(thumb, (p) => p.y);
  const shadowY = useTransform(thumb, (p) => r2(p.y + 1.5));
  const knobR = useTransform(pressed, (p) => r2(thumbR + 2 * p));
  const haloR = useTransform(pressed, (p) => r2(thumbR + 5 + 3 * p));
  const haloOpacity = useTransform(pressed, (p) => r2(p));
  const ringR = useTransform(pressed, (p) => r2(thumbR + 4 + 2 * p));
  const trace = useTransform(s, (v) => (fill ? prefix(track, v) : ""));

  const reading = format ? format(current) : String(current);
  const spoken = reading.replace(/[.\s]+$/, "");
  const share = Math.round(((current - lo) / (hi - lo)) * 100);
  const sentence = `${spoken}, ${share} percent along the ${shape}.`;

  return (
    <div
      className={cn(
        "flex w-full max-w-72 flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          id={labelId}
          className="min-w-0 truncate text-xs text-ink-3"
          title={label}
        >
          {label}
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-sm text-foreground tabular-nums"
        >
          {reading}
        </span>
      </div>

      <div
        ref={rootRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={current}
        aria-valuetext={sentence}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        onPointerDown={onPointerDown}
        className={cn(
          // The ring is drawn round the thumb, the thing that moves.
          "group/curve-slider relative block touch-none rounded-3 outline-none select-none",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        {/* The drawing takes no pointer events, so a touch's implicit
            capture lands on the slider itself, never on a child that would
            lose it the moment the drag takes over. */}
        <svg
          aria-hidden
          viewBox={`0 0 ${W} ${H}`}
          className="pointer-events-none block h-auto w-full"
        >
          <path
            d={track.d}
            fill="none"
            strokeWidth={weight}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-ink-3/30"
          />
          <motion.path
            d={trace}
            fill="none"
            strokeWidth={weight}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-cobalt-bright"
          />
          {markValues.map((v, i) => {
            const p = pointAt(track, markS[i] ?? 0);
            return (
              <Bead
                key={v}
                progress={s}
                at={markS[i] ?? 0}
                x={r2(p.x)}
                y={r2(p.y)}
                r={beadR}
              />
            );
          })}

          <motion.circle
            cx={cx}
            cy={cy}
            r={haloR}
            className={cn(
              "fill-cobalt-wash opacity-0 transition-opacity",
              !disabled && "group-hover/curve-slider:opacity-100",
            )}
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={haloR}
            className="fill-cobalt-wash"
            style={{ opacity: haloOpacity }}
          />
          <motion.circle
            cx={cx}
            cy={shadowY}
            r={knobR}
            fill="color-mix(in oklab, black 22%, transparent)"
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={knobR}
            strokeWidth={2.5}
            className="fill-card stroke-cobalt-bright"
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={2.5}
            className="fill-cobalt-bright"
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={ringR}
            fill="none"
            strokeWidth={2}
            className="stroke-ring opacity-0 group-focus-visible/curve-slider:opacity-100"
          />
        </svg>
      </div>
    </div>
  );
}

function Bead({
  progress,
  at,
  x,
  y,
  r,
}: {
  progress: MotionValue<number>;
  at: number;
  x: number;
  y: number;
  r: number;
}) {
  // Passed marks take the accent: the path keeps count even with no fill.
  const stroke = useTransform(progress, (v) =>
    v >= at - 0.5 ? "var(--accent-bright)" : "var(--ink-3)",
  );
  return (
    <motion.circle
      cx={x}
      cy={y}
      r={r}
      strokeWidth={1.5}
      className="fill-card"
      style={{ stroke }}
    />
  );
}
