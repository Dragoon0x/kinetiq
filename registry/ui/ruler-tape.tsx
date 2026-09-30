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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RulerTapeUnit = "cm" | "in";

export type RulerTapeProps = {
  /** Controlled value, in `unit`. */
  value?: number;
  /** Starting value when uncontrolled. @default min */
  defaultValue?: number;
  /** Fires from the drag, throw, tap or key that changed it, with the new value. */
  onValueChange?: (value: number) => void;
  /** Where the tape starts. @default 0 */
  min?: number;
  /** Where the tape ends. @default 300 cm, or 120 in */
  max?: number;
  /** The value of one mark. @default 1 cm, or 0.1 in */
  step?: number;
  /** What is being measured. Its accessible name, shown above the reading. */
  label: string;
  /** The scale printed on the tape. Uncontrolled, switching it converts the value. @default "cm" */
  unit?: RulerTapeUnit;
  /** How soon a thrown tape stops, 0 (a light reel that coasts) to 1 (a heavy one). @default 0.4 */
  friction?: number;
  /** Pixels between marks, 6 to 16. @default 10 */
  spacing?: number;
  /** Marks per numbered mark, 2 to 10. PageUp and PageDown move by one. @default 10 */
  majorEvery?: number;
  /** Ratchet as marks pass the needle, and thunk when the tape stops. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const UNITS: Record<
  RulerTapeUnit,
  {
    min: number;
    max: number;
    step: number;
    /** Centimetres in one of it. */
    cm: number;
    one: string;
    many: string;
  }
> = {
  cm: {
    min: 0,
    max: 300,
    step: 1,
    cm: 1,
    one: "centimetre",
    many: "centimetres",
  },
  in: { min: 0, max: 120, step: 0.1, cm: 2.54, one: "inch", many: "inches" },
};

/** How far either side of the needle the tape is drawn, in px: enough for a 1280 px window. */
const HALF = 640;
const TAPE_H = 60;
const MAJOR = 22;
const MIDDLE = 15;
const MINOR = 10;
/** Numbered marks are at least this far apart, in px. */
const LABEL_GAP = 40;
/** How far past its end the tape can be pulled, at most, in px. */
const PULL = 60;
const FADE =
  "linear-gradient(to right, transparent, black 16%, black 84%, transparent)";
const TAPE = "color-mix(in oklab, var(--warn) 24%, var(--bg-1))";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const decimalsOf = (n: number) => {
  const text = String(n);
  if (text.includes("e-")) return Math.min(10, Number(text.split("e-")[1]));
  return (text.split(".")[1] ?? "").length;
};

type Label = { x: number; text: string };
type Frame = {
  minor: string;
  middle: string;
  major: string;
  start: number;
  end: number;
  labels: (Label | null)[];
};

/**
 * A length picker drawn as a tape measure: a long tape slides under a fixed
 * needle, and the mark under the needle is the value. The tape is 1:1 under
 * the finger and rubber-bands past its hook and its cut end. Thrown, it
 * coasts: the landing is projected from the release speed with a rate set
 * by `friction`, snapped to the nearest mark, and reached on a critically
 * damped spring whose natural frequency is that same friction's time
 * constant, which makes the coast an exponential slowdown from the release
 * speed that stops exactly on the mark. A throw that would run off the end
 * hits it on the house snap spring instead, and a slow release settles on
 * the nearest mark with the snap spring's one small catch.
 *
 * The drawing is rebuilt from one motion value each frame, and only within a
 * fixed distance of the needle, so a tape of any length costs the same and
 * the server draws exactly what the browser does. A ratchet tick sounds as
 * each mark passes the needle, so its rate is the tape's speed, and a thunk
 * when it stops. It is a real `role="slider"`: arrows move a mark, PageUp
 * and PageDown a numbered mark, Home and End to the ends, with the same
 * ratchet and thunk. Under reduced motion every settle jumps straight to its
 * mark, while the drag, the reading and the sounds still answer.
 */
export function RulerTape({
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  step,
  label,
  unit = "cm",
  friction = 0.4,
  spacing = 10,
  majorEvery = 10,
  sound = false,
  disabled = false,
  className,
}: RulerTapeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();

  const scale: RulerTapeUnit = unit in UNITS ? unit : "cm";
  const u = UNITS[scale];
  const unitStep = step !== undefined && step > 0 ? step : u.step;
  const decimals = decimalsOf(unitStep);
  const lo = Math.min(min ?? u.min, max ?? u.max);
  const hi = Math.max(min ?? u.min, max ?? u.max);
  // Marks sit on whole multiples of `step`: the tape runs from the first
  // mark at or after `min` to the last at or before `max`.
  const iLo = Math.ceil(lo / unitStep - 1e-9);
  const iHi = Math.max(iLo, Math.floor(hi / unitStep + 1e-9));
  const first = Number((iLo * unitStep).toFixed(decimals));
  const last = Number((iHi * unitStep).toFixed(decimals));
  const px = clamp(spacing, 4, 40);
  const every = Math.round(clamp(majorEvery, 1, 50));
  /** Screen px per unit of value. */
  const k = px / unitStep;
  const labelEvery = every * Math.max(1, Math.ceil(LABEL_GAP / (px * every)));
  const pool = Math.ceil((2 * HALF) / (labelEvery * px)) + 2;
  // Per ms of speed kept while coasting: a light reel to a heavy one.
  const rate = lerp(0.9975, 0.99, clamp(friction, 0, 1));
  const tau = -1 / Math.log(rate) / 1000;
  const coast = {
    type: "spring" as const,
    stiffness: 1 / (tau * tau),
    damping: 2 / tau,
    mass: 1,
  };
  // The springs rest when the tape is still to the eye, not to the digit.
  const restDelta = 0.4 / k;
  const restSpeed = 8 / k;

  const snap = (v: number) =>
    Number(
      (clamp(Math.round(v / unitStep), iLo, iHi) * unitStep).toFixed(decimals),
    );
  const text = (v: number) => String(Number(v.toFixed(decimals)));

  const [own, setOwn] = React.useState(() => snap(defaultValue ?? lo));
  const [ownScale, setOwnScale] = React.useState(scale);
  // Uncontrolled, a new unit keeps the same length under the needle.
  if (ownScale !== scale) {
    const from = UNITS[ownScale];
    setOwnScale(scale);
    setOwn((o) => snap((o * from.cm) / u.cm));
  }
  const controlled = value !== undefined;
  const current = snap(value ?? own);

  /** The value under the needle; past `first` or `last` is a pull. */
  const pos = useMotionValue(current);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const grab = React.useRef(current);
  /** Sounds belong to gestures; a host's move is silent. */
  const voice = React.useRef(false);
  const goal = React.useRef({ value: current, scale });
  const reported = React.useRef(current);
  const [answered, setAnswered] = React.useState(0);

  const pan = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };
  const tick = (index: number, speed: number) => {
    const major = mod(index, every) === 0;
    const lift = 1 + Math.min(0.25, (Math.abs(speed) * k) / 5000);
    audio.play(major ? "detent" : "tick", {
      pitch: r2((major ? 0.9 : 1.05) * lift),
      gain: major ? 0.42 : 0.26,
      pan: pan(),
    });
  };
  const hear = React.useRef({ unitStep, iLo, iHi, tick });
  React.useEffect(() => {
    hear.current = { unitStep, iLo, iHi, tick };
  });
  React.useEffect(() => {
    reported.current = current;
  }, [current]);

  // One tick each time a new mark comes under the needle, whatever moved the
  // tape, so the ratchet's rate is the tape's speed.
  React.useEffect(() => {
    let under: number | null = null;
    return pos.on("change", (v) => {
      const h = hear.current;
      const index = clamp(Math.round(v / h.unitStep), h.iLo, h.iHi);
      if (under === null || !voice.current) {
        under = index;
        return;
      }
      if (index === under) return;
      under = index;
      h.tick(index, pos.getVelocity());
    });
  }, [pos]);

  const thunk = () =>
    audio.play("thock", { pitch: 0.85, gain: 0.5, pan: pan() });

  type How = "coast" | "catch" | "glide";
  const settle = (
    target: number,
    velocity: number,
    how: How,
    audible = true,
  ) => {
    run.current?.stop();
    voice.current = audible;
    if (!motionSafe) {
      pos.set(target);
      if (audible) thunk();
      return;
    }
    const spring =
      how === "coast" ? coast : how === "catch" ? springs.snap : springs.glide;
    run.current = animate(pos, target, {
      ...spring,
      velocity,
      restDelta,
      restSpeed,
      onComplete: () => {
        if (voice.current) thunk();
      },
    });
  };

  const report = (next: number) => {
    if (next === reported.current) return;
    reported.current = next;
    if (!controlled) setOwn(next);
    onValueChange?.(next);
  };

  const commit = (next: number, velocity: number, how: How, audible = true) => {
    goal.current = { value: next, scale };
    settle(next, velocity, how, audible);
    report(next);
    // Checked again once the host has answered: a refused change slides back.
    setAnswered((n) => n + 1);
  };

  const drag = useDrag({
    axis: "x",
    disabled,
    onStart: () => {
      dragging.current = true;
      voice.current = true;
      run.current?.stop();
      grab.current = pos.get();
    },
    onMove: ({ offset }) => {
      if (disabled) return;
      // Dragging left brings bigger numbers under the needle.
      const raw = grab.current - offset.x / k;
      pos.set(Number(rubberClamp(raw, first, last, PULL / k).toFixed(6)));
      report(snap(raw));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      // Disabled mid-drag: it settles on the nearest mark, quietly.
      if (disabled) {
        commit(snap(pos.get()), 0, "catch", false);
        return;
      }
      const v = -velocity.x / k;
      const here = pos.get();
      if (here < first || here > last) {
        commit(here < first ? first : last, v, "catch");
        return;
      }
      if (Math.abs(velocity.x) < 60) {
        commit(snap(here), v, "catch");
        return;
      }
      const landing = project(here, v, rate);
      const off = landing < first || landing > last;
      commit(snap(landing), v, off ? "catch" : "coast");
    },
    onCancel: () => {
      dragging.current = false;
      commit(snap(pos.get()), 0, "catch", !disabled);
    },
    onTap: (event) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = event.clientX - (rect.left + rect.width / 2);
      commit(snap(pos.get() + dx / k), 0, "glide");
    },
  });

  // The host's value (or a refusal of ours) is where the tape rests. A new
  // unit re-prints the tape in place; neither makes a sound.
  React.useEffect(() => {
    if (dragging.current) return;
    const g0 = goal.current;
    if (g0.value === current && g0.scale === scale) return;
    const slide = g0.scale === scale;
    goal.current = { value: current, scale };
    run.current?.stop();
    voice.current = false;
    if (!slide || !motionSafe) {
      pos.set(current);
      return;
    }
    run.current = animate(pos, current, {
      ...springs.glide,
      restDelta,
      restSpeed,
    });
  }, [current, scale, answered, motionSafe, pos, restDelta, restSpeed]);

  React.useEffect(() => () => run.current?.stop(), []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    const at = Math.round(current / unitStep);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = (at + 1) * unitStep;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = (at - 1) * unitStep;
        break;
      case "PageUp":
        next = (Math.floor(at / every) + 1) * every * unitStep;
        break;
      case "PageDown":
        next = (Math.ceil(at / every) - 1) * every * unitStep;
        break;
      case "Home":
        next = first;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    next = snap(next);
    if (next !== current) commit(next, 0, "catch");
  };

  const frame = useTransform(pos, (p): Frame => {
    const at = p / unitStep;
    const span = HALF / px;
    const a = Math.max(iLo, Math.ceil(at - span));
    const b = Math.min(iHi, Math.floor(at + span));
    let minor = "";
    let middle = "";
    let major = "";
    for (let i = a; i <= b; i += 1) {
      const x = r2((i - at) * px);
      const m = mod(i, every);
      if (m === 0) major += `M${x} 0V${MAJOR}`;
      else if (every % 2 === 0 && m === every / 2)
        middle += `M${x} 0V${MIDDLE}`;
      else minor += `M${x} 0V${MINOR}`;
    }
    const labels: (Label | null)[] = Array.from({ length: pool }, () => null);
    const jA = Math.ceil((at - span) / labelEvery);
    const jB = Math.floor((at + span) / labelEvery);
    for (let j = jA; j <= jB; j += 1) {
      const i = j * labelEvery;
      if (i < iLo || i > iHi) continue;
      labels[mod(j, pool)] = {
        x: r2((i - at) * px),
        text: text(i * unitStep),
      };
    }
    return {
      minor,
      middle,
      major,
      start: r2(clamp((iLo - at) * px, -HALF - 8, HALF + 8)),
      end: r2(clamp((iHi - at) * px, -HALF - 8, HALF + 8)),
      labels,
    };
  });
  const minorD = useTransform(frame, (f) => f.minor);
  const middleD = useTransform(frame, (f) => f.middle);
  const majorD = useTransform(frame, (f) => f.major);
  const bodyX = useTransform(frame, (f) => f.start);
  const bodyW = useTransform(frame, (f) => r2(Math.max(0, f.end - f.start)));
  const hookX = useTransform(frame, (f) => r2(f.start - 4));
  const reading = useTransform(pos, (p) => text(snap(p)));

  const n = current;
  const amount = `${text(n)} ${n === 1 ? u.one : u.many}`;
  let sentence = `${amount}.`;
  if (scale === "cm" && n >= 100) {
    const m = Math.floor(n / 100 + 1e-9);
    const rest = Number((n - m * 100).toFixed(decimals));
    sentence = `${amount}, ${m} ${m === 1 ? "metre" : "metres"}${rest ? ` ${text(rest)}` : ""}.`;
  } else if (scale === "in" && n >= 12) {
    const ft = Math.floor(n / 12 + 1e-9);
    const rest = Number((n - ft * 12).toFixed(decimals));
    sentence = `${amount}, ${ft} ${ft === 1 ? "foot" : "feet"}${rest ? ` ${text(rest)} ${rest === 1 ? "inch" : "inches"}` : ""}.`;
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex max-w-full flex-col items-center gap-1.5">
        <span
          id={labelId}
          className="max-w-full truncate text-xs text-ink-3"
          title={label}
        >
          {label}
        </span>
        <p
          aria-hidden
          className="font-mono text-2xl leading-none text-foreground tabular-nums"
        >
          <motion.span>{reading}</motion.span>
          <span className="ml-1.5 text-sm text-ink-3">{scale}</span>
        </p>
      </div>

      <div
        ref={rootRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-orientation="horizontal"
        aria-valuemin={first}
        aria-valuemax={last}
        aria-valuenow={current}
        aria-valuetext={sentence}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "group/ruler-tape relative block w-full touch-pan-y rounded-2 select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{ height: TAPE_H }}
      >
        {/* The fade is on this layer, not on the focusable box, so the focus
            ring is never masked. It takes no pointer events, so a touch's
            implicit capture lands on the slider itself, never on a child
            that would lose it the moment the drag takes over. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-clip [contain:paint]"
          style={{ maskImage: FADE, WebkitMaskImage: FADE }}
        >
          {/* Sliced, not met: the drawing is 1:1 and centred on the needle,
              and the svg itself clips whatever the window is too narrow for. */}
          <svg
            width="100%"
            height={TAPE_H}
            viewBox={`${-HALF} 0 ${2 * HALF} ${TAPE_H}`}
            preserveAspectRatio="xMidYMid slice"
            className="block"
          >
            <motion.rect
              x={bodyX}
              y={0.5}
              width={bodyW}
              height={TAPE_H - 1}
              fill={TAPE}
              strokeWidth={1}
              className={cn(
                "stroke-hairline-strong transition-colors",
                !disabled && "group-hover/ruler-tape:stroke-ink-3/60",
              )}
            />
            <motion.rect
              x={hookX}
              y={0}
              width={4}
              height={TAPE_H}
              rx={1}
              className="fill-ink-3"
            />
            <motion.path
              d={minorD}
              fill="none"
              strokeWidth={1}
              className="stroke-foreground/40"
            />
            <motion.path
              d={middleD}
              fill="none"
              strokeWidth={1}
              className="stroke-foreground/60"
            />
            <motion.path
              d={majorD}
              fill="none"
              strokeWidth={1.25}
              className="stroke-foreground/85"
            />
            {Array.from({ length: pool }, (_, i) => (
              <Numeral key={i} frame={frame} index={i} />
            ))}
          </svg>
        </div>
        {/* The needle reads the marks and stops short of the numerals, so the
            number under it is never struck through. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 w-0.5 -translate-x-1/2 rounded-b-full bg-cobalt-bright"
          style={{ height: MAJOR + 7 }}
        />
        <svg
          aria-hidden
          width={12}
          height={7}
          viewBox="0 0 12 7"
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 fill-cobalt-bright"
        >
          <path d="M0 0H12L6 7Z" />
        </svg>
      </div>
    </div>
  );
}

/** One recycled numeral slot: it shows whichever numbered mark is its turn. */
function Numeral({
  frame,
  index,
}: {
  frame: MotionValue<Frame>;
  index: number;
}) {
  const x = useTransform(frame, (f) => f.labels[index]?.x ?? 0);
  const opacity = useTransform(frame, (f) => (f.labels[index] ? 1 : 0));
  const content = useTransform(frame, (f) => f.labels[index]?.text ?? "");
  return (
    <motion.text
      x={x}
      y={40}
      textAnchor="middle"
      className="fill-foreground/75 font-mono text-[10px] tabular-nums"
      style={{ opacity }}
    >
      {content}
    </motion.text>
  );
}
