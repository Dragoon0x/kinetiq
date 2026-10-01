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
import { easings, springs } from "@/registry/lib/motion";
import {
  rubberClamp,
  useDrag,
  type Point,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RotaryDialFinish = "bakelite" | "chrome";

export type RotaryDialProps = {
  /** Controlled number, digits only. */
  value?: string;
  /** Starting number when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires when a digit lands, on Backspace and on clear, with the whole number. */
  onValueChange?: (value: string) => void;
  /** Fires when the digit that fills the last slot lands. */
  onComplete?: (value: string) => void;
  /** What is being dialled. The dial's accessible name. */
  label: string;
  /** How fast the wheel winds back, in pulses per second, 6 to 20. @default 10 */
  returnSpeed?: number;
  /** A glossy black wheel over a cream plate, or spun metal over black. @default "bakelite" */
  finish?: RotaryDialFinish;
  /** How many digits the number has, 3 to 10. Dialling stops when it is full. @default 7 */
  digits?: number;
  /** Show the number above the dial, with a clear button. Off, the host shows it. @default true */
  display?: boolean;
  /** The ratchet as it winds, the stop, a tick per pulse on the way back. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const SIZE = 172;
const C = SIZE / 2;
const PLATE = 85;
const WHEEL = 81;
const RING = 58;
const HOLE = 12.5;
const HUB = 27;
/** The finger stop, clockwise from twelve o'clock. */
const STOP_AT = 120;
/** One pulse of travel; the first 30° of every wind is free. */
const PULSE = 30;
/** Let go this close to the stop and it counts. */
const SLACK = 10;
/** A ratchet tooth every this many degrees while winding. */
const TOOTH = 10;
/** Pause at the stop before a tapped or typed digit winds back, in ms. */
const HOLD = 70;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r3(C + r * Math.sin(a)), r3(C - r * Math.cos(a))];
};
const circle = (x: number, y: number, r: number) =>
  `M${r3(x - r)} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;

/** The ten holes, by the pulses each sends: 1 to 9, and 10 for 0. */
const HOLES = Array.from({ length: 10 }, (_, i) => {
  const pulses = i + 1;
  const at = STOP_AT - (pulses + 1) * PULSE;
  const [x, y] = polar(RING, at);
  return { pulses, digit: pulses === 10 ? "0" : String(pulses), at, x, y };
});
const WHEEL_PATH =
  circle(C, C, WHEEL) + HOLES.map((h) => circle(h.x, h.y, HOLE)).join("");
const [STOP_X0, STOP_Y0] = polar(PLATE - 1, STOP_AT);
const [STOP_X1, STOP_Y1] = polar(RING + 5, STOP_AT);
const STOP_PATH = `M${STOP_X0} ${STOP_Y0}L${STOP_X1} ${STOP_Y1}`;
const [GLOSS_X0, GLOSS_Y0] = polar(WHEEL - 4, -78);
const [GLOSS_X1, GLOSS_Y1] = polar(WHEEL - 4, 12);
const GLOSS = `M${GLOSS_X0} ${GLOSS_Y0}A${WHEEL - 4} ${WHEEL - 4} 0 0 1 ${GLOSS_X1} ${GLOSS_Y1}`;

type Look = {
  plate: string;
  digit: string;
  wheel: string | null;
  rim: string;
  stop: string;
  hub: string;
  gloss: string;
};

// Physical materials, not theme: a telephone is the same object on a light
// page and a dark one, so these mix black and white with the theme's own ink
// in oklab and keep their contrast either way.
const LOOKS: Record<RotaryDialFinish, Look> = {
  bakelite: {
    plate: "color-mix(in oklab, var(--warn) 9%, white)",
    digit: "color-mix(in oklab, black 86%, var(--ink-3))",
    wheel: "color-mix(in oklab, black 88%, var(--ink-3))",
    rim: "color-mix(in oklab, white 18%, transparent)",
    stop: "color-mix(in oklab, white 74%, var(--ink-3))",
    hub: "color-mix(in oklab, var(--warn) 9%, white)",
    gloss: "color-mix(in oklab, white 24%, transparent)",
  },
  chrome: {
    plate: "color-mix(in oklab, black 84%, var(--ink-3))",
    digit: "color-mix(in oklab, white 92%, var(--ink-3))",
    wheel: null,
    rim: "color-mix(in oklab, black 28%, transparent)",
    stop: "color-mix(in oklab, black 72%, var(--ink-3))",
    hub: "color-mix(in oklab, white 80%, var(--ink-3))",
    gloss: "color-mix(in oklab, white 55%, transparent)",
  },
};
/** Concentric bands, as on spun metal: unchanged by turning, so it can turn. */
const SPUN: [number, string][] = [
  [0, "color-mix(in oklab, white 86%, var(--ink-3))"],
  [0.4, "color-mix(in oklab, white 64%, var(--ink-3))"],
  [0.58, "color-mix(in oklab, white 90%, var(--ink-3))"],
  [0.74, "color-mix(in oklab, white 58%, var(--ink-3))"],
  [0.88, "color-mix(in oklab, white 88%, var(--ink-3))"],
  [1, "color-mix(in oklab, white 52%, var(--ink-3))"],
];

/** Clockwise from twelve o'clock, in degrees. */
const bearing = (x: number, y: number, c: Point) =>
  (Math.atan2(x - c.x, -(y - c.y)) * 180) / Math.PI;
const turn = (from: number, to: number) => ((to - from + 540) % 360) - 180;

type Mode = "idle" | "wind" | "auto" | "return" | "land";
type Dialling = {
  mode: Mode;
  /** Pulses of the engaged hole; its stop is at (pulses + 1) × 30°. */
  pulses: number;
  travel: number;
  stopHit: boolean;
  /** Whether this return sends pulses (it reached the stop). */
  counting: boolean;
  /** 30° marks still above the wheel on the way back. */
  level: number;
  queue: number[];
  grab: { c: Point; last: number; raw: number };
};
type Live = {
  ratchet: (at: number, up: boolean) => void;
  stop: () => void;
  pulse: (sent: number) => void;
  land: () => void;
  idle: () => void;
  windBack: (from: number, counts: boolean) => void;
};

/**
 * A number input drawn as a telephone rotary dial. Put a finger in a hole
 * and drag it clockwise to the finger stop: the wheel turns 1:1 with the
 * pointer, ratcheting as it winds, and cannot go back past rest or on past
 * the stop. Let go at the stop and the wheel winds back by itself at the
 * constant speed a governor holds (`returnSpeed` pulses a second, 30° each) —
 * a linear run, not a spring, because that steady rate is what a rotary dial
 * is — ticking once per pulse while the next slot counts them up, then knocks
 * against its rest stop and the digit lands. Let go short of the stop and it
 * winds back silently, dialling nothing.
 *
 * The holes are real buttons in one tab stop: arrows move round the dial,
 * Enter or Space dials the focused hole, and number keys dial directly, each
 * with the same wind, pulses and sounds; keys pressed while it is busy wait
 * their turn. Backspace removes a digit and Escape clears the number. Under
 * reduced motion the wheel still follows a finger, but what it does by itself
 * is not shown moving: it rests at once while the pulses still tick and the
 * slot still counts on the governor's beat.
 */
export function RotaryDial({
  value,
  defaultValue = "",
  onValueChange,
  onComplete,
  label,
  returnSpeed = 10,
  finish = "bakelite",
  digits = 7,
  display = true,
  sound = false,
  disabled = false,
  className,
}: RotaryDialProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const size = Math.round(clamp(digits, 1, 16));
  const clean = (s: string) => s.replace(/\D/g, "").slice(0, size);
  const [own, setOwn] = React.useState(() => clean(defaultValue));
  const current = clean(value ?? own);
  const full = current.length >= size;
  const speed = clamp(returnSpeed, 1, 60);
  const look = LOOKS[finish] ?? LOOKS.bakelite;

  const [counting, setCounting] = React.useState<number | null>(null);
  const [landed, setLanded] = React.useState<number | null>(null);
  const [focus, setFocus] = React.useState(0);

  const angle = useMotionValue(0);
  const still = useMotionValue(0);
  const dialRef = React.useRef<HTMLDivElement | null>(null);
  const holeRefs = React.useRef(new Map<number, HTMLButtonElement>());
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const timer = React.useRef(0);
  const st = React.useRef<Dialling>({
    mode: "idle",
    pulses: 0,
    travel: 0,
    stopHit: false,
    counting: false,
    level: 0,
    queue: [],
    grab: { c: { x: 0, y: 0 }, last: 0, raw: 0 },
  });
  /** The newest render's handlers, for animations and timers that outlive the render that started them. */
  const live = React.useRef<Live | null>(null);
  const describedId = React.useId();
  /** The number as the host last rendered it, for callbacks that outlive a render. */
  const shown = React.useRef(current);

  const centre = (): Point => {
    const rect = dialRef.current?.getBoundingClientRect();
    return rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: 0, y: 0 };
  };
  const pan = () => panFrom(centre().x, null);

  const halt = React.useCallback(() => {
    run.current?.stop();
    run.current = null;
    window.clearTimeout(timer.current);
  }, []);

  const report = (next: string) => {
    shown.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const idle = () => {
    const s = st.current;
    s.mode = "idle";
    s.counting = false;
    setCounting(null);
    const next = s.queue.shift();
    if (next !== undefined) dial(next);
  };

  /** The wheel reaches rest: the digit lands, and the wheel knocks the stop. */
  const land = () => {
    const s = st.current;
    const sent = s.counting ? s.pulses : 0;
    audio.play("thock", {
      pitch: 1.25,
      gain: sent ? 0.4 : 0.24,
      pan: pan(),
    });
    if (sent) {
      const before = shown.current;
      const next = clean(before + (sent === 10 ? "0" : String(sent)));
      if (next !== before) {
        setLanded(next.length - 1);
        report(next);
        if (next.length >= size) onComplete?.(next);
      }
    }
    s.counting = false;
    setCounting(null);
    if (!motionSafe) {
      angle.set(0);
      idle();
      return;
    }
    s.mode = "land";
    // It hits the rest stop and rebounds a little: a stiff, loose spring
    // from rest with the governed speed turned back on itself.
    run.current = animate(angle, 0, {
      type: "spring",
      stiffness: 900,
      damping: 30,
      mass: 1,
      velocity: speed * PULSE * 0.4,
      restDelta: 0.05,
      onComplete: () => live.current?.idle(),
    });
  };

  const windBack = (from: number, counts: boolean) => {
    const s = st.current;
    halt();
    s.mode = "return";
    s.counting = counts;
    s.level = clamp(Math.floor(from / PULSE), 0, s.pulses);
    if (counts) setCounting(0);
    still.set(0);
    if (from <= 0.5) {
      angle.set(0);
      land();
      return;
    }
    // The governor: a constant angular speed, so each pulse takes the same time.
    run.current = animate(angle, 0, {
      duration: from / (speed * PULSE),
      ease: easings.linear,
      onComplete: () => live.current?.land(),
    });
  };

  /** A tapped or typed digit: the wheel winds itself to the stop and back. */
  function dial(pulses: number) {
    const s = st.current;
    if (disabled) return;
    if (s.mode !== "idle") {
      // A digit already on its way (winding itself, or counting back) will
      // take a slot; a finger's wind might not reach the stop, so it does not.
      const coming = s.mode === "auto" || s.counting ? 1 : 0;
      const room = size - shown.current.length - coming;
      if (s.queue.length < room) s.queue.push(pulses);
      return;
    }
    if (shown.current.length >= size) {
      s.queue = [];
      return;
    }
    halt();
    s.mode = "auto";
    s.pulses = pulses;
    s.travel = (pulses + 1) * PULSE;
    s.stopHit = false;
    const hold = () => {
      timer.current = window.setTimeout(
        () => live.current?.windBack(angle.get(), true),
        HOLD,
      );
    };
    if (!motionSafe) {
      angle.set(s.travel);
      hold();
      return;
    }
    run.current = animate(angle, s.travel, {
      ...springs.glide,
      restDelta: 0.5,
      onComplete: hold,
    });
  }

  const clear = () => {
    st.current.queue = [];
    if (shown.current !== "") report("");
  };

  React.useEffect(() => {
    shown.current = current;
  }, [current]);

  React.useEffect(() => {
    live.current = {
      ratchet: (at, up) =>
        audio.play("tick", {
          pitch: r2(0.8 + (0.5 * clamp(at, 0, 330)) / 330),
          gain: up ? 0.24 : 0.14,
          pan: pan(),
        }),
      stop: () => audio.play("clack", { pitch: 1, gain: 0.5, pan: pan() }),
      pulse: (sent) => {
        audio.play("detent", { pitch: 0.95, gain: 0.42, pan: pan() });
        setCounting(sent);
      },
      land,
      idle,
      windBack,
    };
  });

  // Every sound here belongs to the wheel crossing a mark, so each lands on
  // the frame it crosses, however the wheel is being moved.
  React.useEffect(() => {
    let prev = angle.get();
    return angle.on("change", (v) => {
      const s = st.current;
      const out = live.current;
      if (out && (s.mode === "wind" || s.mode === "auto")) {
        const a = Math.floor(prev / TOOTH);
        const b = Math.floor(v / TOOTH);
        if (a !== b) out.ratchet(v, b > a);
        if (!s.stopHit && v >= s.travel - 1.5) {
          s.stopHit = true;
          out.stop();
        } else if (s.stopHit && v < s.travel - 6) {
          s.stopHit = false;
        }
      } else if (out && s.mode === "return" && s.counting) {
        const level = clamp(Math.floor(v / PULSE), 0, s.pulses);
        if (level < s.level) {
          s.level = level;
          out.pulse(s.pulses - level);
        }
      }
      prev = v;
    });
  }, [angle]);

  React.useEffect(() => {
    const s = st.current;
    return () => {
      halt();
      s.mode = "idle";
      s.queue = [];
    };
  }, [halt]);

  /**
   * The hole under a point, at the wheel's current turn. The distance is
   * read in the dial's own units, so a dial inside a scaled or zoomed host
   * (a canvas tool, a scaled preview) still finds the hole under the finger.
   */
  const holeAt = (x: number, y: number) => {
    const c = centre();
    const shown = dialRef.current?.getBoundingClientRect().width ?? SIZE;
    const r = Math.hypot(x - c.x, y - c.y) / (shown > 0 ? shown / SIZE : 1);
    if (Math.abs(r - RING) > HOLE + 4) return null;
    const a = bearing(x, y, c);
    const turned = angle.get();
    for (const h of HOLES) {
      const off = (Math.abs(turn(h.at + turned, a)) * Math.PI * RING) / 180;
      if (off <= HOLE + 4) return h.pulses;
    }
    return null;
  };

  const drag = useDrag({
    disabled,
    onStart: ({ point, offset }) => {
      const s = st.current;
      if (s.mode !== "idle" || shown.current.length >= size) return;
      const down = { x: point.x - offset.x, y: point.y - offset.y };
      const pulses = holeAt(down.x, down.y);
      if (pulses === null) return;
      halt();
      s.mode = "wind";
      s.pulses = pulses;
      s.travel = (pulses + 1) * PULSE;
      s.stopHit = false;
      const c = centre();
      s.grab = { c, last: bearing(down.x, down.y, c), raw: 0 };
    },
    onMove: ({ point }) => {
      const s = st.current;
      if (s.mode !== "wind") return;
      const g = s.grab;
      const a = bearing(point.x, point.y, g.c);
      g.raw += turn(g.last, a);
      g.last = a;
      // Rest and the finger stop are hard in the mechanism; under a finger
      // they give a few degrees rather than clamp.
      const d = r2(
        g.raw < 0
          ? rubberClamp(g.raw, 0, s.travel, 3)
          : rubberClamp(g.raw, 0, s.travel, 5),
      );
      angle.set(d);
      still.set(d);
    },
    onEnd: () => {
      const s = st.current;
      if (s.mode !== "wind") return;
      const d = Math.max(0, angle.get());
      windBack(d, !disabled && d >= s.travel - SLACK);
    },
    onCancel: () => {
      const s = st.current;
      if (s.mode === "wind") windBack(Math.max(0, angle.get()), false);
    },
    onTap: (event) => {
      if (st.current.mode !== "idle") return;
      const pulses = holeAt(event.clientX, event.clientY);
      if (pulses !== null) dial(pulses);
    },
  });

  const moveFocus = (index: number) => {
    const i = ((index % 10) + 10) % 10;
    setFocus(i);
    holeRefs.current.get(i + 1)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    const key = event.key;
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      if (event.repeat) return;
      const pulses = key === "0" ? 10 : Number(key);
      moveFocus(pulses - 1);
      dial(pulses);
      return;
    }
    switch (key) {
      case "ArrowRight":
      case "ArrowDown":
        moveFocus(focus + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        moveFocus(focus - 1);
        break;
      case "Home":
        moveFocus(0);
        break;
      case "End":
        moveFocus(9);
        break;
      case "Backspace":
        st.current.queue = [];
        if (current !== "") report(current.slice(0, -1));
        break;
      case "Escape":
        // Handled only when there is something to clear, so an empty dial
        // leaves Escape to whatever it sits in.
        if (current === "" && st.current.queue.length === 0) return;
        clear();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const turned = useTransform(angle, (a) => r2(Math.max(-6, a)));
  const held = useTransform(still, (a) => r2(Math.max(-6, a)));
  const spinId = `${uid}-spun`;

  const spaced = current.split("").join(" ");
  const sentence =
    current === ""
      ? "Number cleared."
      : full
        ? `${spaced}, all ${size} digits.`
        : `${spaced}, ${current.length} of ${size} ${size === 1 ? "digit" : "digits"}.`;
  // Long numbers read in two groups, the last four apart.
  const split = size >= 7 ? size - 4 : -1;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={display ? describedId : undefined}
      className={cn(
        "flex flex-col items-center gap-3",
        disabled && "opacity-50",
        className,
      )}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      {display ? (
        <div className="flex items-center">
          <div aria-hidden className="flex items-center gap-1">
            {Array.from({ length: size }, (_, i) => {
              const digit = current[i];
              const pending = counting !== null && i === current.length;
              const next = !pending && !full && i === current.length;
              return (
                <span
                  key={i}
                  className={cn(
                    "flex h-8 w-5 items-center justify-center overflow-clip rounded-2 border font-mono text-sm tabular-nums transition-colors duration-150",
                    i === split && "ml-1.5",
                    digit !== undefined
                      ? "border-hairline-strong bg-surface-2 text-foreground"
                      : pending
                        ? "border-cobalt-bright text-cobalt-bright"
                        : next
                          ? "border-cobalt-bright/50 bg-cobalt-wash"
                          : "border-hairline",
                  )}
                >
                  {digit !== undefined ? (
                    <motion.span
                      key={`${i}-${digit}`}
                      initial={
                        motionSafe && landed === i ? { scale: 1.3 } : false
                      }
                      animate={{ scale: 1 }}
                      transition={springs.flick}
                    >
                      {digit}
                    </motion.span>
                  ) : pending && counting > 0 ? (
                    counting % 10
                  ) : null}
                </span>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Clear number"
            disabled={disabled || current === ""}
            onClick={clear}
            className={cn(
              "ml-2 flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors duration-150",
              "hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            )}
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="size-4 shrink-0 fill-none stroke-current"
              strokeWidth={1.5}
              strokeLinecap="round"
            >
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
            </svg>
          </button>
          <span id={describedId} className="sr-only" aria-live="polite">
            {sentence}
          </span>
        </div>
      ) : null}

      <div
        ref={dialRef}
        onKeyDown={onKeyDown}
        {...drag}
        className="relative shrink-0 touch-none select-none"
        style={{ width: SIZE, height: SIZE }}
      >
        <svg
          aria-hidden
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="pointer-events-none absolute inset-0 block"
        >
          {look.wheel === null ? (
            <defs>
              <radialGradient
                id={spinId}
                cx={C}
                cy={C}
                r={WHEEL}
                gradientUnits="userSpaceOnUse"
              >
                {SPUN.map(([at, color]) => (
                  <stop key={at} offset={at} style={{ stopColor: color }} />
                ))}
              </radialGradient>
            </defs>
          ) : null}
          <circle
            cx={C}
            cy={C}
            r={PLATE}
            strokeWidth={1}
            className="stroke-hairline-strong"
            style={{ fill: look.plate }}
          />
          {HOLES.map((h) => (
            <text
              key={h.digit}
              x={h.x}
              y={h.y}
              dy="0.35em"
              textAnchor="middle"
              className="font-mono text-[13px] font-semibold"
              style={{ fill: look.digit }}
            >
              {h.digit}
            </text>
          ))}
          <motion.g
            style={{
              rotate: motionSafe ? turned : held,
              originX: 0.5,
              originY: 0.5,
            }}
          >
            <path
              d={WHEEL_PATH}
              fillRule="evenodd"
              strokeWidth={1}
              fill={look.wheel === null ? `url(#${spinId})` : undefined}
              style={{
                stroke: look.rim,
                ...(look.wheel === null ? {} : { fill: look.wheel }),
              }}
            />
          </motion.g>
          <path
            d={GLOSS}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            style={{ stroke: look.gloss }}
          />
          <circle
            cx={C}
            cy={C}
            r={HUB}
            strokeWidth={1}
            style={{ fill: look.hub, stroke: look.rim }}
          />
          <circle
            cx={C}
            cy={C}
            r={HUB - 6}
            fill="none"
            strokeWidth={1}
            style={{ stroke: look.rim }}
          />
          <circle cx={C} cy={C} r={2} style={{ fill: look.rim }} />
          <path
            d={STOP_PATH}
            fill="none"
            strokeWidth={7}
            strokeLinecap="round"
            style={{ stroke: "color-mix(in oklab, black 45%, transparent)" }}
          />
          <path
            d={STOP_PATH}
            fill="none"
            strokeWidth={5}
            strokeLinecap="round"
            style={{ stroke: look.stop }}
          />
        </svg>
        {HOLES.map((h, i) => (
          <button
            key={h.digit}
            ref={(node) => {
              if (node) holeRefs.current.set(h.pulses, node);
              else holeRefs.current.delete(h.pulses);
            }}
            type="button"
            tabIndex={i === focus ? 0 : -1}
            aria-label={h.digit}
            aria-keyshortcuts="0 1 2 3 4 5 6 7 8 9 Backspace"
            aria-disabled={full || undefined}
            disabled={disabled}
            onFocus={() => setFocus(i)}
            onClick={(event) => {
              // Pointer presses arrive through the drag's tap. A click with
              // no pointer behind it (Enter, Space, assistive technology)
              // dials the hole the same way.
              if (event.detail === 0) dial(h.pulses);
            }}
            className={cn(
              "absolute rounded-full transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled || full
                ? "cursor-not-allowed"
                : "cursor-grab hover:bg-cobalt-wash active:cursor-grabbing",
            )}
            style={{
              left: r2(h.x - HOLE),
              top: r2(h.y - HOLE),
              width: HOLE * 2,
              height: HOLE * 2,
            }}
          />
        ))}
      </div>
    </div>
  );
}
