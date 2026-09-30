"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  type Point,
} from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type AnglePickPreview = "gradient" | "shadow" | "arrow";
export type AnglePickRange = 360 | 180 | "360" | "180";

export type AnglePickProps = {
  /** Controlled angle in whole degrees, clockwise from the top: 0–359, or −90–90 at `range` 180. */
  value?: number;
  /** Starting angle when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, tap, key, throw or typed entry that changed the angle. */
  onValueChange?: (degrees: number) => void;
  /** What the angle sets. The control's name, shown over the preview and naming the field. @default "Angle" */
  label?: string;
  /** The Shift step and PageUp/PageDown step in degrees, 5 to 45; the ring's marks and ticks fall on it. @default 15 */
  snap?: number;
  /** What follows the dial: a gradient, a cast shadow or a pointing arrow. @default "gradient" */
  preview?: AnglePickPreview;
  /** Show the live angle in the dial's hub. @default true */
  readout?: boolean;
  /** A full turn (0–359, wrapping) or a half turn (−90 to 90, 0 at the top). @default "360" */
  range?: AnglePickRange;
  /** A tick at every snap mark the handle passes. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const SIZE = 148;
const C = SIZE / 2;
const TRACK = 56;
const FACE = 73;
const KNOB = 8.5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const wrap = (v: number) => ((v % 360) + 360) % 360;
/** The short way round from one angle to another, in (−180, 180]. */
const short = (from: number, to: number) => {
  const d = wrap(to - from);
  return d > 180 ? d - 360 : d;
};

/** A point `r` from the centre, `deg` clockwise from twelve o'clock. */
const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r3(C + r * Math.sin(a)), r3(C - r * Math.cos(a))];
};
const spoke = (r0: number, r1: number, deg: number) => {
  const [x0, y0] = polar(r0, deg);
  const [x1, y1] = polar(r1, deg);
  return `M${x0} ${y0}L${x1} ${y1}`;
};
const arc = (r: number, from: number, to: number) => {
  if (Math.abs(to - from) < 0.5) return "";
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r} ${r} 0 ${large} ${to > from ? 1 : 0} ${x1} ${y1}`;
};

const COMPASS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];
const compass = (deg: number) => COMPASS[Math.round(wrap(deg) / 45) % 8];
const minus = (n: number) => (n < 0 ? `−${-n}` : `${n}`);

/** Clockwise from twelve o'clock, in degrees; null too near the centre to read. */
const bearing = (p: Point, c: Point): number | null => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  if (dx * dx + dy * dy < 36) return null;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
};
/** Degrees per second about the centre, from a pointer's velocity where it let go. */
const spinOf = (p: Point, v: Point, c: Point) => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 36) return 0;
  return ((dx * v.y - dy * v.x) / d2) * (180 / Math.PI);
};

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

// Pigment, not text colour: the preview's fill reads the same on a light
// page and a dark one, so it takes each token's hue at a fixed lightness.
const GRADIENT_FROM = "oklch(from var(--accent) 0.52 0.19 h)";
const GRADIENT_TO = "oklch(from var(--signal) 0.86 0.14 h)";
const CAST = "color-mix(in oklab, var(--accent) 55%, transparent)";
const TRACK_TINT = "color-mix(in oklab, var(--ink) 9%, transparent)";

/**
 * An angle input for a design tool: a dial whose handle is set by turning
 * it, a field that takes typed degrees, and a live preview. 0° is at the
 * top and angles run clockwise, as CSS gradients and rotation do. Press
 * anywhere on the dial and the handle swings there the short way; drag and
 * it is under the finger, catching up first if the drag began away from it;
 * hold Shift and it jumps between `snap` marks like detents. A slow release
 * stays put, and a real spin coasts to where it would come to rest, ticking
 * past the marks as it slows. At `range` 180 the dial is a half turn that
 * rubber-bands past either end.
 *
 * The dial is a real slider: arrows turn a degree, Shift+Arrow and PageUp or
 * PageDown to the next mark, Home and End to the ends, with the same springs
 * and ticks. The field commits on Enter or blur and turns the handle to what
 * was typed; Escape restores it; its own arrows step as the slider's do. The
 * preview and the hub readout follow the handle itself, through every
 * spring. Under reduced motion the handle still follows the finger, and
 * everything else lands at once.
 */
export function AnglePick({
  value,
  defaultValue = 0,
  onValueChange,
  label = "Angle",
  snap = 15,
  preview = "gradient",
  readout = true,
  range = "360",
  sound = false,
  disabled = false,
  className,
}: AnglePickProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();
  const inputId = React.useId();

  const half = Number(range) === 180;
  const step = clamp(Math.round(Number.isFinite(snap) ? snap : 15), 1, 90);
  const lo = half ? -90 : 0;
  const hi = half ? 90 : 359;
  /** The whole-degree value an unwrapped dial angle stands for. */
  const valueOf = (a: number) =>
    half ? clamp(Math.round(a), -90, 90) : wrap(Math.round(a));

  const [own, setOwn] = React.useState(() => valueOf(defaultValue));
  const current = valueOf(value ?? own);
  const [draft, setDraft] = React.useState<string | null>(null);

  const angle = useMotionValue(current);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const dialRef = React.useRef<HTMLDivElement | null>(null);
  /** Where the handle rests, or is heading, unwrapped: keys chain from here. */
  const target = React.useRef<number>(current);
  const reported = React.useRef(current);
  const dragging = React.useRef(false);
  const grab = React.useRef({
    c: { x: 0, y: 0 } as Point,
    raw: 0,
    last: 0,
    /** Still travelling to the finger, or between snap marks. */
    catching: false,
    aim: 0,
    snapped: false,
  });
  const latest = React.useRef({ audio, step, half });
  React.useEffect(() => {
    latest.current = { audio, step, half };
  });

  const report = (v: number) => {
    if (v === reported.current) return;
    reported.current = v;
    if (value === undefined) setOwn(v);
    onValueChange?.(v);
  };

  const go = (to: number, spring: Spring = springs.snap, velocity = 0) => {
    run.current?.stop();
    target.current = to;
    if (!motionSafe || Math.abs(angle.get() - to) < 0.01) {
      angle.set(to);
      return;
    }
    run.current = animate(angle, to, {
      ...spring,
      velocity,
      restDelta: 0.01,
      restSpeed: 1,
    });
  };

  /** Turns to a new unwrapped angle and reports it. */
  const turnTo = (to: number) => {
    const next = half ? clamp(to, -90, 90) : to;
    if (valueOf(next) === current && Math.abs(target.current - next) < 0.5) {
      return;
    }
    report(valueOf(next));
    go(next);
  };

  /** The nearest unwrapped angle to `from` that shows as `v`. */
  const towards = (from: number, v: number) =>
    half ? v : from + short(from, v);

  const centre = (): Point => {
    const rect = dialRef.current?.getBoundingClientRect();
    return rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: 0, y: 0 };
  };

  // Every commit carries the host's answer to the last report. If it took
  // the value nothing moves; if it refused or set its own, the handle turns
  // there the short way.
  React.useLayoutEffect(() => {
    if (dragging.current) return;
    const off = half && Math.abs(target.current) > 90.5;
    if (valueOf(target.current) === current && !off) return;
    reported.current = current;
    go(towards(target.current, current));
  });

  // Ticks belong to the marks the handle passes, whatever turned it, so a
  // drag, a throw, a key and a typed value all sound the same. A mark that
  // just ticked has to be left by half a degree before it can tick again.
  React.useEffect(() => {
    let prev = angle.get();
    let armed: number | null = null;
    let armedStep = latest.current.step;
    return angle.on("change", (v) => {
      const { audio: out, step: s, half: halfTurn } = latest.current;
      if (s !== armedStep) {
        armed = null;
        armedStep = s;
      }
      if (armed !== null && Math.abs(v - armed * s) >= 0.5) armed = null;
      const up = v > prev;
      const first = up ? Math.floor(prev / s) + 1 : Math.ceil(v / s);
      const last = up ? Math.floor(v / s) : Math.ceil(prev / s) - 1;
      prev = v;
      if (first > last) return;
      const k = up ? last : first;
      const at = k * s;
      if (k === armed) return;
      if (halfTurn && Math.abs(at) > 90) return;
      armed = k;
      const w = halfTurn ? (at + 90) / 180 : wrap(at) / 360;
      out.play("tick", {
        pitch: r2(0.85 + 0.55 * w),
        gain: wrap(at) === 0 ? 0.36 : 0.26,
      });
    });
  }, [angle]);

  React.useEffect(() => () => run.current?.stop(), []);

  /** Where the finger says the handle goes, before rounding. */
  const shaped = (raw: number, shift: boolean) => {
    let t = half ? rubberClamp(raw, -90, 90, 24) : raw;
    if (shift) {
      t = Math.round(t / step) * step;
      if (half) t = clamp(t, -90, 90);
    }
    return t;
  };

  const follow = (shift: boolean) => {
    const g = grab.current;
    const t = shaped(g.raw, shift);
    report(valueOf(t));
    if (!motionSafe) {
      angle.set(r3(t));
      return;
    }
    if (shift) {
      // Between marks the handle jumps like a detent, on the quick spring.
      g.snapped = true;
      if (t !== g.aim || !run.current) {
        g.aim = t;
        run.current?.stop();
        run.current = animate(angle, t, {
          ...springs.flick,
          velocity: angle.getVelocity(),
        });
      }
      return;
    }
    if (g.snapped) {
      // Shift let go: glide back under the finger rather than jump there.
      g.snapped = false;
      g.catching = true;
    }
    if (g.catching && Math.abs(angle.get() - t) > 1.5) {
      g.aim = t;
      run.current?.stop();
      run.current = animate(angle, t, {
        ...springs.flick,
        velocity: angle.getVelocity(),
      });
      return;
    }
    g.catching = false;
    run.current?.stop();
    run.current = null;
    angle.set(r3(t));
  };

  const drag = useDrag({
    disabled,
    onStart: ({ point, offset, event }) => {
      const g = grab.current;
      dragging.current = true;
      g.c = centre();
      const pressed = bearing(
        { x: point.x - offset.x, y: point.y - offset.y },
        g.c,
      );
      const now = angle.get();
      g.raw = pressed === null ? now : now + short(now, pressed);
      g.last = pressed ?? wrap(now);
      g.catching = Math.abs(g.raw - now) > 1.5;
      g.snapped = false;
      g.aim = now;
      follow(event.shiftKey);
    },
    onMove: ({ point, event }) => {
      const g = grab.current;
      const b = bearing(point, g.c);
      if (b === null) return;
      g.raw += short(g.last, b);
      g.last = b;
      follow(event.shiftKey);
    },
    onEnd: ({ point, velocity, event }) => {
      dragging.current = false;
      const g = grab.current;
      const w = motionSafe ? spinOf(point, velocity, g.c) : 0;
      const here = run.current ? g.aim : angle.get();
      // A careful release stays where it is; only a real spin coasts.
      const coasting = Math.abs(w) > 540;
      let landing = coasting ? project(here, w, 0.995) : here;
      if (half) landing = clamp(landing, -90, 90);
      landing = event.shiftKey
        ? Math.round(landing / step) * step
        : Math.round(landing);
      if (half) landing = clamp(landing, -90, 90);
      report(valueOf(landing));
      if (coasting) {
        // Critically damped at the throw's own time constant, so the handle
        // slows the way the projection assumed and stops on its landing.
        const tau = -1 / Math.log(0.995) / 1000;
        go(
          landing,
          {
            type: "spring",
            stiffness: 1 / (tau * tau),
            damping: 2 / tau,
            mass: 1,
          },
          w,
        );
      } else {
        // A careful release lands where it is; only a handle pulled past an
        // end carries the hand's speed into its spring home.
        go(landing, springs.snap, Math.abs(here - landing) > 1 ? w : 0);
      }
    },
    onCancel: () => {
      dragging.current = false;
      const landing = Math.round(
        half ? clamp(angle.get(), -90, 90) : angle.get(),
      );
      report(valueOf(landing));
      go(landing);
    },
    onTap: (event) => {
      const b = bearing({ x: event.clientX, y: event.clientY }, centre());
      if (b === null) return;
      let to = half
        ? clamp(b, -90, 90)
        : target.current + short(target.current, b);
      to = event.shiftKey ? Math.round(to / step) * step : Math.round(to);
      turnTo(to);
    },
  });

  /** The next mark along from `from`, `dir` = 1 clockwise or −1 back. */
  const nextMark = (from: number, dir: 1 | -1) =>
    dir > 0
      ? (Math.floor(from / step + 1e-9) + 1) * step
      : (Math.ceil(from / step - 1e-9) - 1) * step;

  /** The arrow, page and end keys, shared by the dial and the field. */
  const keyTarget = (key: string, shift: boolean): number | null => {
    const from = target.current;
    switch (key) {
      case "ArrowRight":
      case "ArrowUp":
        return shift ? nextMark(from, 1) : from + 1;
      case "ArrowLeft":
      case "ArrowDown":
        return shift ? nextMark(from, -1) : from - 1;
      case "PageUp":
        return nextMark(from, 1);
      case "PageDown":
        return nextMark(from, -1);
      case "Home":
        return towards(from, lo);
      case "End":
        return towards(from, hi);
      default:
        return null;
    }
  };

  const onDialKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    const to = keyTarget(event.key, event.shiftKey);
    if (to === null) return;
    event.preventDefault();
    turnTo(to);
  };

  const commitDraft = () => {
    if (draft === null) return;
    const text = draft.replace(/[°\s]/g, "").replace("−", "-");
    setDraft(null);
    const n = Number(text);
    if (text === "" || !Number.isFinite(n)) return;
    const v = half ? clamp(Math.round(n), -90, 90) : wrap(Math.round(n));
    turnTo(towards(target.current, v));
  };

  const onFieldKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Escape") {
      // Handled here, so the page around it does not close on it too.
      event.preventDefault();
      setDraft(null);
      return;
    }
    if (
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "PageUp" &&
      event.key !== "PageDown"
    ) {
      return;
    }
    event.preventDefault();
    setDraft(null);
    const to = keyTarget(event.key, event.shiftKey);
    if (to !== null) turnTo(to);
  };

  const needle = useTransform(angle, r2);
  const sweep = useTransform(angle, (a) =>
    half ? arc(TRACK, 0, clamp(a, -90, 90)) : arc(TRACK, 0, wrap(a)),
  );
  const hub = useTransform(angle, (a) => `${minus(valueOf(a))}°`);
  const gradient = useTransform(
    angle,
    (a) => `linear-gradient(${r2(a)}deg, ${GRADIENT_FROM}, ${GRADIENT_TO})`,
  );
  const cast = useTransform(angle, (a) => {
    const rad = (a * Math.PI) / 180;
    return `${r2(Math.sin(rad) * 8)}px ${r2(-Math.cos(rad) * 8)}px 12px ${CAST}`;
  });

  const marks = React.useMemo(() => {
    let minor = "";
    let major = "";
    const from = half ? -90 : 0;
    const to = half ? 90 : 359;
    for (let d = Math.ceil(from / step) * step; d <= to; d += step) {
      if (d % 90 === 0) continue;
      minor += spoke(63.5, 67.5, d);
    }
    for (let d = from; d <= to; d += 90) major += spoke(62.5, 69.5, d);
    return { minor, major };
  }, [half, step]);

  const hubRadius = readout ? 25 : 5;
  const valueText = `${current} ${Math.abs(current) === 1 ? "degree" : "degrees"}, ${compass(current)}`;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex items-center gap-5",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        ref={dialRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={current}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onDialKey}
        {...drag}
        className={cn(
          "group/angle-pick relative shrink-0 touch-none rounded-full outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{ width: SIZE, height: SIZE }}
      >
        <svg
          aria-hidden
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="pointer-events-none absolute inset-0 block"
        >
          <circle
            cx={C}
            cy={C}
            r={FACE}
            strokeWidth={1}
            className={cn(
              "fill-surface-2 stroke-hairline-strong transition-colors",
              !disabled && "group-hover/angle-pick:stroke-cobalt-bright/50",
            )}
          />
          {half ? (
            <path
              d={arc(TRACK, 90, 270)}
              fill="none"
              strokeWidth={1}
              className="stroke-hairline-strong"
            />
          ) : null}
          {half ? (
            <path
              d={arc(TRACK, -90, 90)}
              fill="none"
              strokeWidth={12}
              strokeLinecap="round"
              style={{ stroke: TRACK_TINT }}
            />
          ) : (
            <circle
              cx={C}
              cy={C}
              r={TRACK}
              fill="none"
              strokeWidth={12}
              style={{ stroke: TRACK_TINT }}
            />
          )}
          <motion.path
            d={sweep}
            fill="none"
            strokeWidth={4}
            strokeLinecap="round"
            className="stroke-cobalt-bright"
          />
          <path
            d={marks.minor}
            fill="none"
            strokeWidth={1}
            strokeLinecap="round"
            className="stroke-ink-3"
          />
          <path
            d={marks.major}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            className="stroke-ink-2"
          />
          <motion.g style={{ rotate: needle, originX: 0.5, originY: 0.5 }}>
            {/* Invisible, full size: it keeps the group's box centred on the
                hub, so the needle turns about the centre. */}
            <circle cx={C} cy={C} r={FACE} fill="none" />
            <path
              d={`M${C} ${C - hubRadius - 2}V${C - TRACK + KNOB + 1}`}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              className="stroke-ink-2"
            />
            <circle
              cx={C}
              cy={C - TRACK}
              r={KNOB}
              strokeWidth={2.5}
              className="fill-card stroke-cobalt-bright"
            />
            <circle
              cx={C}
              cy={C - TRACK}
              r={2}
              className="fill-cobalt-bright"
            />
          </motion.g>
          <circle
            cx={C}
            cy={C}
            r={hubRadius}
            strokeWidth={1}
            className={
              readout
                ? "fill-surface-1 stroke-hairline-strong"
                : "fill-ink-2 stroke-none"
            }
          />
        </svg>
        {readout ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-sm leading-none text-foreground tabular-nums"
          >
            {hub}
          </motion.span>
        ) : null}
      </div>

      <div className="flex w-[104px] shrink-0 flex-col gap-2">
        <label
          id={labelId}
          htmlFor={inputId}
          className="block truncate text-xs leading-4 text-ink-3"
          title={label}
        >
          {label}
        </label>
        <div
          aria-hidden
          className="relative h-[84px] w-full overflow-clip rounded-3 border border-hairline bg-surface-2 [contain:paint]"
        >
          {preview === "gradient" ? (
            <motion.div
              className="absolute inset-0"
              style={{ background: gradient }}
            />
          ) : preview === "shadow" ? (
            <motion.div
              className="absolute inset-x-[27px] inset-y-[17px] rounded-2 border border-hairline-strong bg-card"
              style={{ boxShadow: cast }}
            />
          ) : (
            <>
              <span className="absolute top-1.5 left-1/2 -translate-x-1/2 font-mono text-[9px] leading-none text-ink-3">
                N
              </span>
              <span className="absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[9px] leading-none text-ink-3">
                E
              </span>
              <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 font-mono text-[9px] leading-none text-ink-3">
                S
              </span>
              <span className="absolute top-1/2 left-2 -translate-y-1/2 font-mono text-[9px] leading-none text-ink-3">
                W
              </span>
              <motion.div
                className="absolute top-1/2 left-1/2 -mt-5 -ml-5 size-10 text-cobalt-bright"
                style={{ rotate: needle }}
              >
                <svg viewBox="0 0 48 48" className="block size-full">
                  <path
                    d="M24 5L34 19H27.5V42H20.5V19H14Z"
                    fill="currentColor"
                  />
                </svg>
              </motion.div>
            </>
          )}
        </div>
        <div className="relative w-full">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-3"
          >
            <path
              d="M2.5 13.5H13.5M2.5 13.5L11 3M7.2 13.5A4.7 4.7 0 0 0 5.4 9.9"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          </svg>
          <input
            id={inputId}
            type="text"
            inputMode={half ? "text" : "decimal"}
            autoComplete="off"
            spellCheck={false}
            aria-label={`${label} in degrees`}
            disabled={disabled}
            value={draft ?? String(current)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onFieldKey}
            onBlur={commitDraft}
            className={cn(
              "h-8 w-full rounded-2 border border-input bg-surface-1 pr-4 pl-7 text-right font-mono text-xs text-foreground tabular-nums transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed",
            )}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-xs leading-none text-ink-3"
          >
            °
          </span>
        </div>
      </div>
    </div>
  );
}
