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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LevelVialTint = "spirit" | "amber" | "cobalt" | "clear";

export type LevelVialProps = {
  /** Controlled value, between `min` and `max`. */
  value?: number;
  /** Starting value when uncontrolled. @default the centre */
  defaultValue?: number;
  /** Fires from the drag, tap or key that changed it, with the new value. */
  onValueChange?: (value: number) => void;
  /** @default -50 */
  min?: number;
  /** @default 50 */
  max?: number;
  /** @default 1 */
  step?: number;
  /** What the level sets. Its accessible name, shown above it. */
  label: string;
  /** The reading beside the label and in the spoken value. Defaults to a signed offset from the centre. */
  format?: (value: number) => string;
  /** What the two sides are called in the spoken value: "20, left of centre". @default ["left", "right"] */
  ends?: readonly [string, string];
  /** Thin spirit to thick oil, 0 to 1: how far the bubble lags, how much it overshoots and stretches. @default 0.4 */
  viscosity?: number;
  /** The level's length in px, 240 to 480. It shrinks to fit a narrower box. @default 360 */
  length?: number;
  /** Graduations on each side of the centre, 0 to 8. PageUp and PageDown move to the next one. @default 4 */
  marks?: number;
  /** The liquid's colour. @default "spirit" */
  tint?: LevelVialTint;
  /** Play the bubble moving through the liquid. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The body's height in its own units; the length is the other axis. */
const BODY_H = 44;
/** Room above and below the body for its tilt, in px. */
const CLEAR = 14;
/** How far an end rises at full tilt, in px, whatever the length. */
const RISE = 10;

const TINTS: Record<LevelVialTint, { color: string; body: number }> = {
  spirit: {
    color: "color-mix(in oklch, var(--success) 55%, var(--warn))",
    body: 68,
  },
  amber: { color: "var(--warn)", body: 70 },
  cobalt: { color: "var(--accent-bright)", body: 66 },
  clear: { color: "var(--ink-3)", body: 34 },
};

const GLASS = "color-mix(in oklab, var(--bg-0) 78%, black)";
const SHEEN = "color-mix(in oklab, white 12%, transparent)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const decimalsOf = (n: number) => {
  const text = String(n);
  if (text.includes("e-")) return Math.min(10, Number(text.split("e-")[1]));
  return (text.split(".")[1] ?? "").length;
};

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

function geometry(length: number) {
  const L = Math.round(clamp(length, 160, 640));
  const B = Math.round(clamp(L * 0.12, 30, 50));
  const mid = L / 2;
  const inner = { x0: 14, x1: L - 14, y0: 12, h: 20 };
  return {
    L,
    mid,
    cy: 22,
    vial: { x0: 12, x1: L - 12, y0: 10, h: 24 },
    inner,
    /** The bubble's resting size. */
    B,
    hB: 14,
    /** Where the glass stops the bubble's ends. */
    wallL: inner.x0 + 2,
    wallR: inner.x1 - 2,
    /** How far the bubble's centre travels either side of the middle. */
    half: mid - 17 - B / 2,
    /** The tilt, in degrees, at which an end has risen `RISE` px. */
    maxDeg: r3((Math.asin(RISE / mid) * 180) / Math.PI),
  };
}

/**
 * A two-sided slider drawn as a spirit level. The middle of the range is the
 * neutral point, framed by the two centre lines; the ends are the extremes.
 * Drag along it and the level tilts at once, 1:1 with the finger, raising the
 * end the value is heading for, because a bubble floats to the high end. The
 * bubble itself does not follow the finger: it drifts after it through the
 * liquid on a spring whose stiffness and damping are the liquid's viscosity,
 * lagging and overshooting, so the value visibly finds itself. It stretches
 * with its speed and flattens against the end of the vial rather than passing
 * through it. A release is projected from its velocity, so a flick carries,
 * and the level settles on the house snap spring with the release velocity.
 *
 * It is a real `role="slider"`: arrows move a step, PageUp and PageDown move
 * to the next graduation, Home and End to the extremes, each tilting the
 * level and sending the bubble exactly as a drag would. Under reduced motion
 * the level stays flat and the bubble moves in one piece on a short tween,
 * while the reading, the spoken value and the centre lines still answer,
 * because the value is information.
 */
export function LevelVial({
  value,
  defaultValue,
  onValueChange,
  min = -50,
  max = 50,
  step = 1,
  label,
  format,
  ends = ["left", "right"],
  viscosity = 0.4,
  length = 360,
  marks = 4,
  tint = "spirit",
  sound = false,
  disabled = false,
  className,
}: LevelVialProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();
  const clipId = `vial-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const g = geometry(length);
  const vs = clamp01(viscosity);
  const unit = step > 0 ? step : 1;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max) > lo ? Math.max(min, max) : lo + unit;
  const centre = (lo + hi) / 2;
  const halfRange = (hi - lo) / 2;
  const decimals = Math.max(decimalsOf(unit), decimalsOf(centre));
  const count = Math.round(clamp(marks, 0, 12));
  const liquid = TINTS[tint] ?? TINTS.spirit;

  /** Values are counted from the centre, so the two sides are mirror images. */
  const snap = (v: number) => {
    const d = v - centre;
    const q = Math.sign(d) * Math.round(Math.abs(d) / unit) * unit;
    return Number(clamp(centre + q, lo, hi).toFixed(decimals));
  };
  const pOf = (v: number) => r3((v - centre) / halfRange);
  const valueAt = (p: number) => snap(centre + clamp(p, -1, 1) * halfRange);

  const [own, setOwn] = React.useState(() => snap(defaultValue ?? centre));
  const controlled = value !== undefined;
  const current = snap(value ?? own);
  const restP = pOf(current);

  // The bubble and the tilt, both in the level's own units: -1 is `min`, 1 is
  // `max`. Past ±1 is a rubber-banded pull or a spring's overshoot.
  const bubble = useMotionValue(restP);
  const tilt = useMotionValue(restP);
  const speed = useVelocity(bubble);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const bubbleRun = React.useRef<AnimationPlaybackControls | null>(null);
  const tiltRun = React.useRef<AnimationPlaybackControls | null>(null);
  const loop = React.useRef<LoopHandle | null>(null);
  const dragging = React.useRef(false);
  /** Where the level is heading at rest, and the host's value it was for. */
  const goal = React.useRef({ value: current, p: restP });
  const reported = React.useRef(current);
  const feel = React.useRef({ half: g.half, vs });
  const [answered, setAnswered] = React.useState(0);

  React.useEffect(() => {
    feel.current = { half: g.half, vs };
  });
  React.useEffect(() => {
    reported.current = current;
  }, [current]);

  // Thin spirit is quick and bouncy; thick oil slow, lagging and composed.
  const viscous = spring(lerp(320, 55, vs), lerp(0.38, 0.9, vs));
  // How far a flick carries in the liquid, per ms of speed kept.
  const rate = lerp(0.992, 0.985, vs);

  const stopGlug = React.useCallback(() => {
    loop.current?.stop();
    loop.current = null;
  }, []);

  const startGlug = () => {
    if (loop.current) return;
    const b = clamp(bubble.get(), -1, 1);
    loop.current = audio.start("glug", {
      gain: 0,
      pitch: r2(lerp(0.85, 1.25, (b + 1) / 2) * lerp(1.15, 0.7, vs)),
      pan: r3(b * 0.5),
    });
  };

  const settled = () => {
    if (!dragging.current) stopGlug();
  };

  const drift = (to: number) => {
    bubbleRun.current?.stop();
    bubbleRun.current = motionSafe
      ? animate(bubble, to, {
          ...viscous,
          velocity: bubble.getVelocity(),
          onComplete: settled,
        })
      : animate(bubble, clamp(to, -1, 1), {
          duration: durations.fast,
          ease: easings.enter,
          onComplete: settled,
        });
  };

  const swing = (to: number, velocity = 0) => {
    tiltRun.current?.stop();
    if (!motionSafe) {
      tilt.set(0);
      return;
    }
    // Capped, so a violent flick cannot swing the body out of its own box.
    tiltRun.current = animate(tilt, to, {
      ...springs.snap,
      velocity: clamp(velocity, -6, 6),
    });
  };

  const report = (next: number) => {
    if (next === reported.current) return;
    reported.current = next;
    if (!controlled) setOwn(next);
    onValueChange?.(next);
  };

  const commit = (next: number, velocity = 0, audible = true) => {
    const p = pOf(next);
    goal.current = { value: next, p };
    // Nothing left to move (a tap where it already rests): no glug at all.
    const still =
      Math.abs(bubble.get() - p) < 0.002 &&
      Math.abs(bubble.getVelocity()) < 0.02;
    if (still || !audible) {
      if (!dragging.current) stopGlug();
    } else {
      startGlug();
    }
    swing(p, velocity);
    drift(p);
    report(next);
    // Checked again once the host has answered: a refused change glides back.
    setAnswered((n) => n + 1);
  };

  /** The point under the pointer, in the level's units. */
  const pointP = (clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return bubble.get();
    const x = ((clientX - rect.left) * g.L) / rect.width;
    return (x - g.mid) / g.half;
  };
  const perPx = () => {
    const width = rootRef.current?.getBoundingClientRect().width ?? g.L;
    return width > 0 ? g.L / width / g.half : 0;
  };

  const follow = (raw: number) => {
    if (motionSafe) {
      tilt.set(r3(rubberClamp(raw, -1, 1, 0.3)));
      bubbleRun.current = animate(bubble, rubberClamp(raw, -1, 1, 0.12), {
        ...viscous,
        velocity: bubble.getVelocity(),
        onComplete: settled,
      });
    } else {
      bubbleRun.current?.stop();
      bubble.set(r3(clamp(raw, -1, 1)));
    }
    report(valueAt(raw));
  };

  const drag = useDrag({
    axis: "x",
    disabled,
    onStart: () => {
      dragging.current = true;
      tiltRun.current?.stop();
      startGlug();
    },
    onMove: ({ point }) => {
      if (!disabled) follow(pointP(point.x));
    },
    onEnd: ({ point, velocity }) => {
      dragging.current = false;
      // Disabled mid-drag: it settles where it last was, quietly.
      if (disabled) {
        commit(reported.current, 0, false);
        return;
      }
      const v = velocity.x * perPx();
      const landing = project(clamp(pointP(point.x), -1, 1), v, rate);
      commit(valueAt(landing), v);
    },
    onCancel: () => {
      dragging.current = false;
      commit(reported.current, 0, !disabled);
    },
    onTap: (event) => commit(valueAt(pointP(event.clientX))),
  });

  // The host's value (or a refusal of ours) is where the level rests. A move
  // with no gesture behind it is silent.
  React.useEffect(() => {
    if (dragging.current) return;
    const g0 = goal.current;
    if (g0.value === current && g0.p === restP) return;
    goal.current = { value: current, p: restP };
    bubbleRun.current?.stop();
    tiltRun.current?.stop();
    if (!motionSafe) {
      bubble.set(restP);
      tilt.set(0);
      return;
    }
    bubbleRun.current = animate(bubble, restP, {
      ...spring(
        lerp(320, 55, feel.current.vs),
        lerp(0.38, 0.9, feel.current.vs),
      ),
      velocity: bubble.getVelocity(),
    });
    tiltRun.current = animate(tilt, restP, springs.snap);
  }, [current, restP, answered, motionSafe, bubble, tilt]);

  // Reduced motion keeps the level flat; the full pathway gets its tilt back.
  React.useEffect(() => {
    if (dragging.current) return;
    tiltRun.current?.stop();
    tilt.set(motionSafe ? goal.current.p : 0);
  }, [motionSafe, tilt]);

  // The glug is the bubble's speed made audible, frame by frame.
  React.useEffect(
    () =>
      speed.on("change", (v) => {
        const l = loop.current;
        if (!l) return;
        const b = clamp(bubble.get(), -1, 1);
        const { half, vs: thick } = feel.current;
        l.set({
          gain: r2(Math.min(0.6, (Math.abs(v) * half) / 700)),
          pitch: r2(lerp(0.85, 1.25, (b + 1) / 2) * lerp(1.15, 0.7, thick)),
        });
      }),
    [speed, bubble],
  );

  React.useEffect(() => {
    if (disabled) stopGlug();
  }, [disabled, stopGlug]);

  React.useEffect(
    () => () => {
      bubbleRun.current?.stop();
      tiltRun.current?.stop();
      stopGlug();
    },
    [stopGlug],
  );

  // Graduations sit where the bubble's centre rests for their value.
  const graduations: number[] = [];
  for (let k = 1; k <= count; k += 1) {
    const offset = (k * halfRange) / count;
    graduations.push(snap(centre - offset), snap(centre + offset));
  }
  const stops = [...new Set([lo, centre, hi, ...graduations])].sort(
    (a, b) => a - b,
  );
  const xOf = (v: number) => r2(g.mid + pOf(v) * g.half);
  const pair = g.B / 2 + 2;
  const glassMarks = graduations
    .map(xOf)
    .filter((x) => Math.abs(x - g.mid) > pair + 3)
    .map((x) => `M${x} ${g.vial.y0 + 1}V${g.vial.y0 + g.vial.h - 1}`)
    .join("");
  const housingTicks = graduations
    .map(xOf)
    .map((x) => `M${x} 4.5V7.5M${x} 36.5V39.5`)
    .join("");
  const centreTicks = `M${g.mid} 2.5V7.5M${g.mid} 36.5V41.5`;
  const centrePair = `M${r2(g.mid - pair)} ${g.vial.y0 + 1}V${g.vial.y0 + g.vial.h - 1}M${r2(g.mid + pair)} ${g.vial.y0 + 1}V${g.vial.y0 + g.vial.h - 1}`;

  const nextStop = (from: number, dir: 1 | -1) => {
    if (count === 0) return snap(from + (dir * (hi - lo)) / 10);
    const eps = unit / 1000;
    if (dir > 0) return stops.find((s) => s > from + eps) ?? hi;
    return [...stops].reverse().find((s) => s < from - eps) ?? lo;
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
        next = nextStop(current, 1);
        break;
      case "PageDown":
        next = nextStop(current, -1);
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

  // Per frame, all from the two motion values, every number rounded.
  const rotate = useTransform(tilt, (t) =>
    r3(-clamp(t, -1.35, 1.35) * g.maxDeg),
  );
  const stretchMax = motionSafe ? 0.3 * (1 - 0.5 * vs) : 0;
  const shape = useTransform(
    [bubble, speed] as MotionValue<number>[],
    ([b = 0, v = 0]: number[]) => {
      const cx = g.mid + b * g.half;
      // A moving bubble is long and thin; the area stays roughly the same.
      const k = Math.min(stretchMax, (Math.abs(v) * g.half) / 1600);
      let len = g.B * (1 + k);
      let h = g.hB * (1 - 0.35 * k);
      let left = cx - len / 2;
      const right = cx + len / 2;
      // The glass stops it: pushed into an end, it flattens against the wall.
      if (right > g.wallR) {
        const over = right - g.wallR;
        len = Math.max(g.B * 0.6, len - over);
        left = g.wallR - len;
        h = Math.min(g.inner.h - 2, h * (1 + (0.45 * over) / g.B));
      } else if (left < g.wallL) {
        const over = g.wallL - left;
        len = Math.max(g.B * 0.6, len - over);
        left = g.wallL;
        h = Math.min(g.inner.h - 2, h * (1 + (0.45 * over) / g.B));
      }
      return { x: r2(left), w: r2(len), y: r2(g.cy - h / 2), h: r2(h) };
    },
  );
  const bx = useTransform(shape, (s) => s.x);
  const bw = useTransform(shape, (s) => s.w);
  const by = useTransform(shape, (s) => s.y);
  const bh = useTransform(shape, (s) => s.h);
  const brx = useTransform(shape, (s) => r2(s.h / 2));
  const hx = useTransform(shape, (s) => r2(s.x + s.w * 0.34));
  const hy = useTransform(shape, (s) => r2(s.y + s.h * 0.3));
  const hrx = useTransform(shape, (s) => r2(Math.max(2, s.w * 0.2)));
  const hry = useTransform(shape, (s) => r2(Math.max(1, s.h * 0.13)));

  const offset = Number((current - centre).toFixed(decimals));
  const level = offset === 0;
  // The centre lines light as the bubble arrives between them, when level.
  const glow = useTransform(bubble, (b) =>
    level ? r2(clamp01(1 - Math.abs(b) / 0.05)) : 0,
  );

  const reading = format
    ? format(current)
    : offset === 0
      ? "0"
      : `${offset > 0 ? "+" : "−"}${Math.abs(offset)}`;
  const spoken = reading.replace(/[.\s]+$/, "");
  const side = offset < 0 ? ends[0] : ends[1];
  const sentence = level
    ? "Level, at the centre."
    : `${spoken}, ${side} of centre.`;

  const body = `color-mix(in oklab, ${liquid.color} ${liquid.body}%, var(--bg-1))`;
  const air = `color-mix(in oklab, ${liquid.color} 18%, white)`;
  const rim = `color-mix(in oklab, ${liquid.color} 62%, black)`;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
      style={{ maxWidth: g.L }}
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
          className={cn(
            "shrink-0 font-mono text-sm tabular-nums transition-colors",
            level ? "text-signal" : "text-foreground",
          )}
        >
          {reading}
        </span>
      </div>

      <div
        ref={rootRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-orientation="horizontal"
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={current}
        aria-valuetext={sentence}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "group/level-vial relative block touch-pan-y rounded-3 select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{ paddingBlock: CLEAR }}
      >
        {/* The drawing takes no pointer events, so a touch's implicit
            capture lands on the slider itself, never on a child that would
            lose it the moment the drag takes over. */}
        <motion.div className="pointer-events-none" style={{ rotate }}>
          <svg
            aria-hidden
            viewBox={`0 0 ${g.L} ${BODY_H}`}
            className="block h-auto w-full"
          >
            <defs>
              <clipPath id={clipId}>
                <rect
                  x={g.inner.x0}
                  y={g.inner.y0}
                  width={g.inner.x1 - g.inner.x0}
                  height={g.inner.h}
                  rx={g.inner.h / 2}
                />
              </clipPath>
            </defs>

            <rect
              x={0.5}
              y={0.5}
              width={g.L - 1}
              height={BODY_H - 1}
              rx={10}
              className={cn(
                "fill-surface-2 stroke-hairline-strong transition-colors",
                !disabled && "group-hover/level-vial:stroke-ink-3/60",
              )}
            />
            <path d={`M10 1.5H${g.L - 10}`} stroke={SHEEN} strokeWidth={1} />
            <path
              d={housingTicks}
              fill="none"
              strokeWidth={1}
              strokeLinecap="round"
              className="stroke-ink-3"
            />
            <path
              d={centreTicks}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="stroke-ink-2"
            />

            <rect
              x={g.vial.x0}
              y={g.vial.y0}
              width={g.vial.x1 - g.vial.x0}
              height={g.vial.h}
              rx={g.vial.h / 2}
              fill={GLASS}
              strokeWidth={1}
              className="stroke-hairline-strong"
            />
            <g clipPath={`url(#${clipId})`}>
              <rect
                x={g.inner.x0}
                y={g.inner.y0}
                width={g.inner.x1 - g.inner.x0}
                height={g.inner.h}
                fill={body}
              />
              <motion.rect
                x={bx}
                y={by}
                width={bw}
                height={bh}
                rx={brx}
                fill={air}
                stroke={rim}
                strokeWidth={1.25}
              />
              <motion.ellipse
                cx={hx}
                cy={hy}
                rx={hrx}
                ry={hry}
                fill="white"
                opacity={0.6}
              />
            </g>
            <path
              d={`M${g.inner.x0 + 9} ${g.inner.y0 + 2}H${g.inner.x1 - 9}`}
              fill="none"
              stroke="white"
              strokeOpacity={0.32}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <path
              d={glassMarks}
              fill="none"
              strokeWidth={1}
              className="stroke-foreground/30"
            />
            <path
              d={centrePair}
              fill="none"
              strokeWidth={1.25}
              className="stroke-foreground/55"
            />
            <motion.path
              d={centrePair}
              fill="none"
              strokeWidth={1.5}
              className="stroke-signal"
              style={{ opacity: glow }}
            />
          </svg>
        </motion.div>
        <svg
          aria-hidden
          width={10}
          height={6}
          viewBox="0 0 10 6"
          className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 fill-ink-3"
        >
          <path d="M5 0L10 6H0Z" />
        </svg>
      </div>
    </div>
  );
}
