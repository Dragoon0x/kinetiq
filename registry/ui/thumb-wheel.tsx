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
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ThumbWheelKnurl = "fine" | "coarse" | "diamond";

export type ThumbWheelProps = {
  /** Controlled value. */
  value?: number;
  /** Starting value when uncontrolled. @default min */
  defaultValue?: number;
  /** Fires from the roll, flick, scroll, tap or key that changed it: per step while rolling, and once where it lands. */
  onValueChange?: (value: number) => void;
  /** The bottom stop. @default 0 */
  min?: number;
  /** The top stop. @default 100 */
  max?: number;
  /** One detent's worth of value. @default 1 */
  step?: number;
  /** What the wheel sets. Its accessible name, shown over the value. */
  label: string;
  /** Printed after the value, as in "%" or "dB". */
  unit?: string;
  /** The pattern cut in the wheel's edge. @default "fine" */
  knurl?: ThumbWheelKnurl;
  /** How soon a flicked wheel stops, 0 (it coasts) to 1 (it stops almost at once). @default 0.4 */
  friction?: number;
  /** Click and settle on whole steps. Off, it rolls freely and the value shows one more decimal. @default true */
  detents?: boolean;
  /** How far the wheel turns from one stop to the other, in turns, 0.5 to 3. @default 1.5 */
  range?: number;
  /** A fine ratchet as the wheel rolls. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The wheel's radius: its front surface moves 1:1 with the finger. */
const R = 124;
/** How much of the wheel shows through the slot, either side of the front, in degrees. */
const VIS = 68;
const W = 84;
const H = 262;
const CY = H / 2;
const BAND_X0 = 29;
const BAND_X1 = 69;
const HALF = Math.round(R * Math.sin((VIS * Math.PI) / 180));
/** The travel gauge. */
const GAUGE_X = 14;
const TRACK = HALF * 2 - 12;
/** Degrees of wheel per pixel of its surface. */
const DEG_PER_PX = 180 / (Math.PI * R);
/** How far past a stop the wheel gives under the finger, at most, in degrees. */
const PULL = 22;
/** Pixels of knurl per pixel of scroll. */
const SCROLL = 0.5;

type KnurlCut = {
  /** Ridges round the whole wheel. */
  count: number;
  /** Groove depth and crest width at the front, in px. */
  groove: number;
  crest: number;
  diamond: boolean;
};

// Counts are whole ridges per turn so the pattern repeats cleanly, chosen for
// roughly 5, 10 and 7 px between ridges at the front of a 124 px wheel.
const KNURLS: Record<ThumbWheelKnurl, KnurlCut> = {
  fine: { count: 156, groove: 1.6, crest: 0.9, diamond: false },
  coarse: { count: 78, groove: 3.6, crest: 1.4, diamond: false },
  diamond: { count: 112, groove: 1.3, crest: 0.8, diamond: true },
};

// Shading, not theme: a rubber-rimmed wheel in a dark recess, built from the
// theme's own ink and surfaces so it sits on a light page or a dark one.
const BAND = "color-mix(in oklab, var(--ink-2) 48%, var(--bg-2))";
const GROOVE = "color-mix(in oklab, black 46%, transparent)";
const CREST = "color-mix(in oklab, white 42%, transparent)";
const RECESS = "color-mix(in oklab, var(--bg-0) 64%, black)";
const SHADE_EDGE = "color-mix(in oklab, black 70%, transparent)";
const SHADE_MID = "color-mix(in oklab, black 20%, transparent)";
const SPECULAR = "color-mix(in oklab, white 22%, transparent)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const decimalsOf = (n: number) => {
  const text = String(n);
  if (text.includes("e-")) return Math.min(10, Number(text.split("e-")[1]));
  return (text.split(".")[1] ?? "").length;
};

/** Screen y of a point on the wheel `deg` above its front. */
const yOf = (deg: number) =>
  r2(CY - R * Math.sin((clamp(deg, -89, 89) * Math.PI) / 180));

/**
 * The knurl for a wheel turned `theta` degrees: grooves and the lit crests
 * above them. Each ridge sits at its angle on the cylinder, so ridges bunch
 * and thin toward the top and bottom of the slot exactly as a real wheel's
 * do, and moving the angle rolls them.
 */
function knurlOf(theta: number, cut: KnurlCut) {
  const pitch = 360 / cut.count;
  const first = Math.ceil((-VIS - pitch - theta) / pitch);
  const last = Math.floor((VIS + pitch - theta) / pitch);
  let grooves = "";
  let crests = "";
  for (let i = first; i <= last; i += 1) {
    const psi = i * pitch + theta;
    if (cut.diamond) {
      // The two helices a diamond knurl leaves, each crossing one pitch
      // over the width of the wheel.
      const a = yOf(psi);
      const b = yOf(psi + pitch);
      grooves += `M${BAND_X0} ${a}L${BAND_X1} ${b}M${BAND_X0} ${b}L${BAND_X1} ${a}`;
      crests += `M${BAND_X0} ${r2(a - 1)}L${BAND_X1} ${r2(b - 1)}M${BAND_X0} ${r2(b - 1)}L${BAND_X1} ${r2(a - 1)}`;
      continue;
    }
    if (Math.abs(psi) > VIS + pitch) continue;
    const c = Math.cos((psi * Math.PI) / 180);
    const y = yOf(psi);
    const g = r2((cut.groove * c) / 2);
    const k = r2(cut.crest * c);
    grooves += `M${BAND_X0} ${r2(y - g)}H${BAND_X1}V${r2(y + g)}H${BAND_X0}Z`;
    crests += `M${BAND_X0} ${r2(y - g - k)}H${BAND_X1}V${r2(y - g)}H${BAND_X0}Z`;
  }
  return { grooves, crests };
}

/**
 * A value set by rolling a knurled wheel seen edge-on, as on the side of a
 * camera or a headset. The knurl scrolls 1:1 under the finger: the wheel's
 * front moves exactly as far as the pointer does, and its ridges bunch toward
 * the top and bottom of the slot as the cylinder turns away. The value sits
 * beside it, level with a fixed notch, and a gauge on the housing shows where
 * the wheel is between its stops, one mark per quarter turn of `range`.
 *
 * Rolled past a stop, it rubber-bands. Flicked, its landing is projected from
 * the release speed at a rate set by `friction`, snapped to a step when
 * `detents` is on, and reached on a critically damped spring with that same
 * time constant, so it slows exponentially and stops on the step; a throw
 * past a stop hits it on the snap spring. The scroll wheel rolls it as it
 * would scroll content, and hands the page the scroll once a stop is reached.
 * A fine ratchet ticks per step (per ridge with detents off), so its rate is
 * the wheel's speed. It is a real vertical `role="slider"`: arrows step,
 * PageUp and PageDown ten steps, Home and End to the stops, rolling there with
 * the same ratchet. Under reduced motion every settle jumps to its value
 * while the drag, the reading and the ratchet still answer.
 */
export function ThumbWheel({
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit,
  knurl = "fine",
  friction = 0.4,
  detents = true,
  range = 1.5,
  sound = false,
  disabled = false,
  className,
}: ThumbWheelProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo || 1;
  const unitStep = step > 0 ? step : 1;
  const decimals = decimalsOf(unitStep) + (detents ? 0 : 1);
  const turns = clamp(range, 0.25, 10);
  const top = turns * 360;
  const cut = KNURLS[knurl] ?? KNURLS.fine;
  const pitch = 360 / cut.count;
  // Per ms of speed kept while coasting: a free wheel to a stiff one.
  const rate = lerp(0.998, 0.99, clamp(friction, 0, 1));
  const tau = -1 / Math.log(rate) / 1000;
  const coast = {
    type: "spring" as const,
    stiffness: 1 / (tau * tau),
    damping: 2 / tau,
    mass: 1,
  };

  const angleOf = (v: number) => ((clamp(v, lo, hi) - lo) / span) * top;
  const valueAt = (a: number) => lo + (clamp(a, 0, top) / top) * span;
  const tidy = (v: number) => Number(v.toFixed(decimals));
  const snap = (v: number) =>
    tidy(clamp(lo + Math.round((v - lo) / unitStep) * unitStep, lo, hi));
  const settleValue = (v: number) =>
    detents ? snap(v) : tidy(clamp(v, lo, hi));

  const [own, setOwn] = React.useState(() => snap(defaultValue ?? lo));
  const controlled = value !== undefined;
  const current = settleValue(value ?? own);

  const theta = useMotionValue(angleOf(current));
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const grab = React.useRef(0);
  /** Sounds belong to gestures; a host's move is silent. */
  const voice = React.useRef(false);
  const goal = React.useRef({ value: current, angle: angleOf(current) });
  const reported = React.useRef(current);
  const scroll = React.useRef<{ aim: number | null; timer: number }>({
    aim: null,
    timer: 0,
  });
  const [answered, setAnswered] = React.useState(0);

  const pan = () => {
    const rect = node?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const report = (next: number) => {
    if (next === reported.current) return;
    reported.current = next;
    if (!controlled) setOwn(next);
    onValueChange?.(next);
  };

  type How = "coast" | "catch" | "stay";
  const settle = (target: number, velocity: number, how: How) => {
    run.current?.stop();
    if (!motionSafe || how === "stay") {
      theta.set(target);
      return;
    }
    run.current = animate(theta, target, {
      ...(how === "coast" ? coast : springs.snap),
      velocity,
      restDelta: 0.02,
      restSpeed: 1,
    });
  };

  const commit = (next: number, velocity: number, how: How) => {
    const angle = angleOf(next);
    goal.current = { value: next, angle };
    settle(how === "stay" ? clamp(theta.get(), 0, top) : angle, velocity, how);
    report(next);
    // Checked again once the host has answered: a refused value rolls back.
    setAnswered((n) => n + 1);
  };

  const tick = (at: number, fine: boolean) => {
    const t = (clamp(at, 0, top) / top) * 0.36;
    audio.play("tick", {
      pitch: r2((fine ? 1.3 : 0.86) + t),
      gain: fine ? 0.12 : 0.3,
      pan: pan(),
    });
  };
  const stop = () => audio.play("clack", { pitch: 1.1, gain: 0.3, pan: pan() });
  const hear = React.useRef({
    tick,
    stop,
    unitStep,
    top,
    pitch,
    detents,
    span,
  });
  React.useEffect(() => {
    hear.current = { tick, stop, unitStep, top, pitch, detents, span };
  });
  React.useEffect(() => {
    reported.current = current;
  }, [current]);

  // One tick each time a step (or, rolling freely, a ridge) passes the
  // notch, whatever turned the wheel: so the ratchet's rate is its speed.
  React.useEffect(() => {
    let mark: number | null = null;
    let inside = true;
    return theta.on("change", (a) => {
      const h = hear.current;
      const index = h.detents
        ? Math.round(((clamp(a, 0, h.top) / h.top) * h.span) / h.unitStep)
        : Math.floor(a / h.pitch);
      const within = a >= -0.01 && a <= h.top + 0.01;
      if (mark === null || !voice.current) {
        mark = index;
        inside = within;
        return;
      }
      // The wheel meets its stop on the frame it rolls past it.
      if (inside && !within) h.stop();
      inside = within;
      if (index === mark) return;
      mark = index;
      h.tick(a, !h.detents);
    });
  }, [theta]);

  const drag = useDrag({
    axis: "y",
    disabled,
    onStart: () => {
      dragging.current = true;
      voice.current = true;
      run.current?.stop();
      scroll.current.aim = null;
      grab.current = theta.get();
    },
    onMove: ({ offset }) => {
      if (disabled) return;
      // Rolling up raises it: the front of the wheel moves with the finger.
      const raw = grab.current - offset.y * DEG_PER_PX;
      theta.set(r2(rubberClamp(raw, 0, top, PULL)));
      report(settleValue(valueAt(raw)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const here = theta.get();
      const spin = -velocity.y * DEG_PER_PX;
      if (disabled) {
        commit(settleValue(valueAt(here)), 0, detents ? "catch" : "stay");
        return;
      }
      if (here < 0 || here > top) {
        commit(here < 0 ? lo : hi, spin, "catch");
        return;
      }
      if (Math.abs(velocity.y) < 40) {
        commit(settleValue(valueAt(here)), spin, detents ? "catch" : "stay");
        return;
      }
      const landing = project(here, spin, rate);
      const off = landing < 0 || landing > top;
      commit(settleValue(valueAt(landing)), spin, off ? "catch" : "coast");
    },
    onCancel: () => {
      dragging.current = false;
      commit(settleValue(valueAt(theta.get())), 0, "catch");
    },
    onTap: (event) => {
      const rect = node?.getBoundingClientRect();
      if (!rect) return;
      voice.current = true;
      const up = event.clientY < rect.top + rect.height / 2;
      const next = snap(current + (up ? unitStep : -unitStep));
      if (next !== current) commit(next, 0, "catch");
    },
  });

  // The host's value (or a refusal of ours) is where the wheel rests. A new
  // range, or new stops, re-seat it in place; neither makes a sound.
  const rest = angleOf(current);
  React.useEffect(() => {
    if (dragging.current || scroll.current.aim !== null) return;
    const g0 = goal.current;
    if (g0.value === current && Math.abs(g0.angle - rest) < 1e-6) return;
    // Same value, new geometry: the wheel is re-seated where it stands.
    const reseat = g0.value === current;
    goal.current = { value: current, angle: rest };
    run.current?.stop();
    voice.current = false;
    if (reseat || !motionSafe) {
      theta.set(rest);
      return;
    }
    run.current = animate(theta, rest, {
      ...springs.glide,
      restDelta: 0.02,
      restSpeed: 1,
    });
  }, [current, rest, answered, motionSafe, theta]);

  const onWheel = (px: number, event: WheelEvent) => {
    const s = scroll.current;
    const base = s.aim ?? theta.get();
    // It rolls as content scrolls: a scroll that would carry the page down
    // carries the knurl up, which raises the value.
    const delta = px * SCROLL * DEG_PER_PX;
    // At a stop the scroll belongs to the page again.
    if ((base >= top - 1e-6 && delta > 0) || (base <= 1e-6 && delta < 0)) {
      return;
    }
    event.preventDefault();
    const next = clamp(base + delta, 0, top);
    s.aim = next;
    voice.current = true;
    run.current?.stop();
    if (motionSafe) {
      run.current = animate(theta, next, {
        ...springs.flick,
        velocity: theta.getVelocity(),
      });
    } else {
      theta.set(next);
    }
    report(settleValue(valueAt(next)));
    window.clearTimeout(s.timer);
    s.timer = window.setTimeout(() => {
      s.aim = null;
      commit(settleValue(valueAt(theta.get())), 0, detents ? "catch" : "stay");
    }, 140);
  };
  // The scroll wheel, on a listener that may cancel it, bound when the node
  // arrives. It reads the render it needs through `live`.
  const live = React.useRef({ disabled, wheel: onWheel });
  React.useEffect(() => {
    live.current = { disabled, wheel: onWheel };
  });
  React.useEffect(() => {
    if (!node) return;
    const listener = (event: WheelEvent) => {
      if (live.current.disabled || event.ctrlKey) return;
      const { y } = wheelPixels(event);
      if (y !== 0) live.current.wheel(y, event);
    };
    node.addEventListener("wheel", listener, { passive: false });
    return () => node.removeEventListener("wheel", listener);
  }, [node]);

  React.useEffect(() => {
    const s = scroll.current;
    return () => {
      run.current?.stop();
      window.clearTimeout(s.timer);
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    let next: number;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = current + unitStep;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = current - unitStep;
        break;
      case "PageUp":
        next = current + unitStep * 10;
        break;
      case "PageDown":
        next = current - unitStep * 10;
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
    if (next === current) return;
    voice.current = true;
    commit(next, 0, "catch");
  };

  const frame = useTransform(theta, (a) => knurlOf(a, cut));
  const grooves = useTransform(frame, (f) => f.grooves);
  const crests = useTransform(frame, (f) => f.crests);
  const markerY = useTransform(theta, (a) =>
    r2(CY + TRACK / 2 - (clamp(a, 0, top) / top) * TRACK - 1.5),
  );
  const reading = useTransform(theta, (a) =>
    settleValue(valueAt(a)).toFixed(decimals),
  );

  const quarters = Math.max(1, Math.round(turns * 4));
  const gaugeMarks = React.useMemo(() => {
    let d = "";
    for (let j = 0; j <= quarters; j += 1) {
      const y = r2(CY + TRACK / 2 - (j / quarters) * TRACK);
      const long = j % 4 === 0 || j === quarters;
      d += `M${GAUGE_X - (long ? 5 : 3)} ${y}H${GAUGE_X + (long ? 5 : 3)}`;
    }
    return d;
  }, [quarters]);

  const text = current.toFixed(decimals);
  const joined = (v: string) =>
    unit ? `${v}${unit === "%" || unit === "°" ? "" : " "}${unit}` : v;
  // The reading keeps the width of its widest value, so rolling from 99 to
  // 100 never nudges the wheel sideways.
  const widest = Math.max(
    lo.toFixed(decimals).length,
    hi.toFixed(decimals).length,
  );
  // In the numerals' own ch: the unit (set smaller, after a 4px gap) with room to spare.
  const reserve = r2(widest + (unit ? unit.length * 0.7 + 0.3 : 0));
  const clipId = `${uid}-slot`;
  const shadeId = `${uid}-shade`;

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-stretch gap-5",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        ref={setNode}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-orientation="vertical"
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={current}
        aria-valuetext={joined(text)}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "group/thumb-wheel relative block shrink-0 touch-pan-x rounded-4 select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{ width: W, height: H }}
      >
        <svg
          aria-hidden
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="pointer-events-none block"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={BAND_X0}
                y={CY - HALF}
                width={BAND_X1 - BAND_X0}
                height={HALF * 2}
                rx={5}
              />
            </clipPath>
            <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: SHADE_EDGE }} />
              <stop offset="0.2" style={{ stopColor: SHADE_MID }} />
              <stop offset="0.4" style={{ stopColor: SPECULAR }} />
              <stop offset="0.52" stopColor="transparent" />
              <stop offset="0.8" style={{ stopColor: SHADE_MID }} />
              <stop offset="1" style={{ stopColor: SHADE_EDGE }} />
            </linearGradient>
          </defs>

          <rect
            x={0.5}
            y={0.5}
            width={W - 1}
            height={H - 1}
            rx={16}
            strokeWidth={1}
            className="fill-surface-2 stroke-hairline-strong transition-colors duration-150 group-hover/thumb-wheel:stroke-ink-3/60"
          />

          {/* The travel gauge: where the wheel is between its stops. */}
          <path
            d={`M${GAUGE_X} ${CY - TRACK / 2}V${CY + TRACK / 2}`}
            strokeWidth={1}
            className="stroke-hairline-strong"
          />
          <path d={gaugeMarks} strokeWidth={1} className="stroke-ink-3" />
          <motion.rect
            x={GAUGE_X - 5}
            y={markerY}
            width={10}
            height={3}
            rx={1.5}
            className="fill-cobalt-bright"
          />

          <rect
            x={BAND_X0 - 3}
            y={CY - HALF - 4}
            width={BAND_X1 - BAND_X0 + 6}
            height={HALF * 2 + 8}
            rx={8}
            style={{ fill: RECESS }}
          />
          <g clipPath={`url(#${clipId})`}>
            <rect
              x={BAND_X0}
              y={CY - HALF}
              width={BAND_X1 - BAND_X0}
              height={HALF * 2}
              style={{ fill: BAND }}
            />
            <motion.path
              d={crests}
              fill={cut.diamond ? "none" : undefined}
              strokeWidth={cut.diamond ? 0.8 : 0}
              style={
                cut.diamond
                  ? { stroke: CREST }
                  : { fill: CREST, stroke: "none" }
              }
            />
            <motion.path
              d={grooves}
              fill={cut.diamond ? "none" : undefined}
              strokeWidth={cut.diamond ? 1.4 : 0}
              style={
                cut.diamond
                  ? { stroke: GROOVE }
                  : { fill: GROOVE, stroke: "none" }
              }
            />
            <rect
              x={BAND_X0}
              y={CY - HALF}
              width={BAND_X1 - BAND_X0}
              height={HALF * 2}
              fill={`url(#${shadeId})`}
            />
            {/* The wheel's two faces, just visible at its edges. */}
            <path
              d={`M${BAND_X0 + 0.5} ${CY - HALF}V${CY + HALF}M${BAND_X1 - 0.5} ${CY - HALF}V${CY + HALF}`}
              strokeWidth={1}
              style={{ stroke: GROOVE }}
            />
          </g>

          {/* The notch the value is read against. */}
          <path
            d={`M${W - 3} ${CY - 5}L${BAND_X1 + 5} ${CY}L${W - 3} ${CY + 5}Z`}
            className="fill-cobalt-bright"
          />
        </svg>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto_1fr] gap-2">
        <span
          id={labelId}
          className="self-end truncate text-xs text-ink-3"
          title={label}
        >
          {label}
        </span>
        <p
          aria-hidden
          className="flex items-baseline gap-1 font-mono text-4xl leading-none text-foreground tabular-nums"
          style={{ minWidth: `${reserve}ch` }}
        >
          <motion.span>{reading}</motion.span>
          {unit ? <span className="text-base text-ink-3">{unit}</span> : null}
        </p>
        <span
          aria-hidden
          className="self-start font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {joined(lo.toFixed(decimals))} – {joined(hi.toFixed(decimals))}
        </span>
      </div>
    </div>
  );
}
