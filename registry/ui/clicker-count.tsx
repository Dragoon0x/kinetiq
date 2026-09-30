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
import { durations, springs } from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ClickerFinish = "steel" | "brass" | "matte";

export type ClickerCountProps = {
  /** Controlled count. */
  value?: number;
  /** Initial count when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the press or the finished reset, with the new count. */
  onValueChange?: (value: number) => void;
  /** What is being counted. Names the counter and is spoken with the count. */
  label: string;
  /** Number wheels in the window, 3 to 5. It rolls over past the last. @default 4 */
  digits?: number;
  /** How far the plunger sinks, in px: short and snappy, or long and heavy. @default 8 */
  travel?: number;
  /** The body's finish. @default "steel" */
  finish?: ClickerFinish;
  /**
   * Geared wheels: a rollover turns the next wheel in the same stroke and a
   * reset rewinds through every number. Off, the wheels above the units turn
   * freely to their own digits. @default true
   */
  carry?: boolean;
  /** Play the clicks, the reset whir and the landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The component's box, and the parts placed in it. */
const W = 176;
const HT = 172;
const BODY = { left: 14, top: 22, size: 148 };
const PLUNGER = { width: 30, height: 26, rise: 16 };
/** The knob sits on the rim at -40°; rounded so Node and the browser agree. */
const KNOB = { x: 144.69, y: 48.43, r: 13 };
const CELL = { w: 20, h: 30 };
const HOLD = 0.8;
const RING_R = 16.5;
const RING_C = 103.67;
/** The strip each wheel shows: 9 above 0, and 0 again below 9, so it wraps seamlessly. */
const STRIP = [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (v: number, m: number) => ((v % m) + m) % m;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Knurls round the knob: short radial lines, precomputed and rounded. */
const KNURLS = Array.from({ length: 20 }, (_, i) => {
  const a = (i / 20) * Math.PI * 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    x1: r2(18 + c * 10.25),
    y1: r2(18 + s * 10.25),
    x2: r2(18 + c * 12.5),
    y2: r2(18 + s * 12.5),
  };
});

/**
 * Where wheel `k` stands for a continuous count `c`, the way an odometer's
 * gears put it: a wheel only turns while every wheel below it reads 9, so
 * 099 → 100 turns three wheels in one stroke.
 */
function geared(c: number, k: number): number {
  const count = Math.max(0, c);
  const p = 10 ** k;
  const n = Math.floor(count);
  const base = Math.floor(n / p);
  return n % p === p - 1 ? base + (count - n) : base;
}

// Mixed in oklab, not oklch: a hue-interpolating mix toward the near-white
// token would swing brass through green on its way.
const tint = (c: string, pct: number) =>
  `color-mix(in oklab, ${c}, var(--primary-foreground) ${pct}%)`;
const shade = (c: string, k: number) => `oklch(from ${c} calc(l * ${k}) c h)`;

type Finish = {
  body: string;
  rim: string;
  cap: string;
  edge: string;
  knob: string;
};

function finishOf(finish: ClickerFinish): Finish {
  if (finish === "matte") {
    const base = "var(--bg-2)";
    return {
      body: `linear-gradient(to bottom, ${tint(base, 5)}, ${shade(base, 0.95)})`,
      rim: "inset 0 0 0 1px var(--hairline-strong), inset 0 -6px 12px -8px var(--hairline-strong)",
      cap: `linear-gradient(to right, ${shade(base, 0.9)}, ${tint(base, 8)} 40%, ${shade(base, 0.92)})`,
      edge: "inset 0 0 0 1px var(--hairline-strong)",
      knob: shade(base, 0.9),
    };
  }
  // Metal from tokens: ink-3 is the same mid grey in both themes; brass takes
  // warn's hue and some of its chroma at a fixed lightness, so it is the same
  // metal on a light or a dark stage. Relative-colour shades keep one light
  // direction in either theme.
  const base =
    finish === "brass"
      ? "oklch(from var(--warn) 0.7 calc(c * 0.75) h)"
      : "var(--ink-3)";
  return {
    body: `radial-gradient(circle at 32% 24%, ${tint(base, 60)} 0%, ${tint(base, 22)} 34%, ${base} 62%, ${shade(base, 0.7)} 100%)`,
    rim: `inset 0 0 0 1px ${shade(base, 0.62)}, inset 0 -10px 16px -10px ${shade(base, 0.45)}, inset 0 10px 14px -10px ${tint(base, 70)}`,
    cap: `linear-gradient(to right, ${shade(base, 0.72)}, ${tint(base, 55)} 32%, ${base} 64%, ${shade(base, 0.66)})`,
    edge: `inset 0 0 0 1px ${shade(base, 0.62)}`,
    knob: shade(base, 0.8),
  };
}

const WINDOW_BG = "oklch(from var(--ink-3) calc(l * 0.28) c h)";
const WHEEL_BG = "oklch(from var(--ink-3) calc(l * 0.38) c h)";
const CYLINDER =
  "linear-gradient(to bottom, oklch(from var(--ink-3) calc(l * 0.2) c h / 0.92) 0%, transparent 32%, transparent 68%, oklch(from var(--ink-3) calc(l * 0.2) c h / 0.92) 100%)";

function Wheel({
  k,
  value,
  carry,
  count,
  hold,
  motionSafe,
}: {
  k: number;
  value: number;
  carry: boolean;
  count: MotionValue<number>;
  hold: MotionValue<number>;
  motionSafe: boolean;
}) {
  const digit = Math.floor(value / 10 ** k) % 10;
  const free = !carry && k > 0;
  // A free wheel keeps its own position and rolls to its digit on its own
  // spring; a geared one reads the shared count and needs none.
  const own = useMotionValue(digit);

  React.useEffect(() => {
    const at = own.get();
    // A digit that changes while the knob is wound is the reset landing: the
    // winding already carried this wheel to zero, so it must not roll again.
    if (!free || !motionSafe || hold.get() > 0) {
      own.set(digit);
      return;
    }
    let delta = digit - mod(at, 10);
    if (delta > 5) delta -= 10;
    if (delta < -5) delta += 10;
    if (Math.abs(delta) < 0.001) return;
    const run = animate(own, at + delta, {
      ...springs.snap,
      onComplete: () => own.set(mod(own.get(), 10)),
    });
    return () => run.stop();
  }, [digit, free, hold, motionSafe, own]);

  const y = useTransform(
    [count, hold, own] as MotionValue<number>[],
    (values) => {
      const [c = 0, h = 0, o = 0] = values as number[];
      // Winding the knob carries every wheel back toward zero as it fills;
      // under reduced motion they wait and swap when it completes.
      const wind = motionSafe ? 1 - smooth(Math.min(1, Math.max(0, h))) : 1;
      const pos = carry
        ? geared(c * wind, k)
        : k === 0
          ? mod(c, 10) * wind
          : mod(o, 10) * wind;
      return r2(-(mod(pos, 10) + 1) * CELL.h);
    },
  );

  return (
    <span
      className="relative block overflow-clip rounded-[3px]"
      style={{ width: CELL.w, height: CELL.h, background: WHEEL_BG }}
    >
      <motion.span className="absolute inset-x-0 top-0 block" style={{ y }}>
        {STRIP.map((d, i) => (
          <span
            key={i}
            className="flex items-center justify-center font-mono text-[19px] leading-none text-primary-foreground tabular-nums"
            style={{ height: CELL.h }}
          >
            {d}
          </span>
        ))}
      </motion.span>
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: CYLINDER }}
      />
    </span>
  );
}

/**
 * A hand tally counter. Press the body and the plunger sinks while the
 * units wheel turns one step on the same spring — the wheel is geared to the
 * stroke — then the plunger springs back up and the wheel stays. With `carry`
 * the wheels are geared together, so 099 → 100 turns three wheels at once;
 * without it the upper wheels turn freely to their own digits. A long press
 * on the reset knob winds everything back: the knob turns, the wheels run
 * back toward zero as the hold fills, and letting go early springs them home.
 *
 * The body and the knob are real buttons. Space and Enter count (a held
 * Enter keeps counting, like a held plunger); holding Space or Enter on the
 * knob is the long press, and Escape lets it go. The count is spoken
 * politely. Under reduced motion the plunger darkens instead of travelling,
 * the digits swap in place, and the knob's ring still fills while it is held.
 */
export function ClickerCount({
  value: valueProp,
  defaultValue = 0,
  onValueChange,
  label,
  digits = 4,
  travel = 8,
  finish = "steel",
  carry = true,
  sound = false,
  disabled = false,
  className,
}: ClickerCountProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const gradientId = `clicker-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const controlled = valueProp !== undefined;
  const [own, setOwn] = React.useState(defaultValue);
  const wheels = Math.min(6, Math.max(1, Math.round(digits)));
  const limit = 10 ** wheels;
  const raw = Math.max(0, Math.round(valueProp ?? own));
  const value = mod(raw, limit);
  const depthPx = Math.min(16, Math.max(2, travel));
  const look = finishOf(finish);

  const [initial] = React.useState(value);
  const count = useMotionValue(initial);
  const depth = useMotionValue(0);
  const hold = useMotionValue(0);

  const shown = React.useRef(value);
  const shownLimit = React.useRef(limit);
  const target = React.useRef(value);
  const expect = React.useRef<{ value: number; why: "press" | "reset" } | null>(
    null,
  );
  const countRun = React.useRef<AnimationPlaybackControls | null>(null);
  const depthRun = React.useRef<AnimationPlaybackControls | null>(null);
  const holdRun = React.useRef<AnimationPlaybackControls | null>(null);
  const whir = React.useRef<LoopHandle | null>(null);
  const whirSync = React.useRef<(() => void) | null>(null);
  const timers = React.useRef<number[]>([]);
  const pressed = React.useRef(false);
  const holding = React.useRef(false);
  const bodyRef = React.useRef<HTMLButtonElement | null>(null);
  const knobRef = React.useRef<HTMLButtonElement | null>(null);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  };

  const panOf = (el: Element | null) => {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return panFrom(rect.left + rect.width / 2, null);
  };

  const releaseKnob = React.useCallback(() => {
    holdRun.current?.stop();
    // The knob springs home; under reduced motion its ring simply empties.
    holdRun.current = animate(
      hold,
      0,
      motionSafe ? springs.snap : { duration: durations.fast },
    );
  }, [hold, motionSafe]);

  const stopWhir = () => {
    whirSync.current?.();
    whirSync.current = null;
    whir.current?.stop();
    whir.current = null;
  };

  // The host's count arrives here. A press moves one notch forward on the
  // stroke's own spring (so 9999 rolls on to 0000 rather than back); a reset
  // is already wound to zero by the knob; anything else runs the gears to
  // the new number.
  React.useEffect(() => {
    const prev = shown.current;
    const resized = shownLimit.current !== limit;
    shownLimit.current = limit;
    if (prev === value && !resized) return;
    shown.current = value;
    const hint = expect.current;
    const why = hint && hint.value === value ? hint.why : "host";
    expect.current = null;
    countRun.current?.stop();
    // A new number of wheels is a different counter, not a count to run.
    if (why === "reset" || resized) {
      target.current = value;
      count.set(value);
      releaseKnob();
      return;
    }
    target.current =
      why === "press" ? target.current + mod(value - prev, limit) : value;
    const settle = () => {
      if (target.current >= limit) {
        target.current = mod(target.current, limit);
        count.set(target.current);
      }
    };
    if (!motionSafe) {
      count.set(target.current);
      settle();
      return;
    }
    countRun.current = animate(count, target.current, {
      ...(why === "press" ? springs.flick : springs.glide),
      onComplete: settle,
    });
  }, [count, limit, motionSafe, releaseKnob, value]);

  React.useEffect(
    () => () => {
      countRun.current?.stop();
      depthRun.current?.stop();
      holdRun.current?.stop();
      whirSync.current?.();
      whir.current?.stop();
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const commit = (next: number, why: "press" | "reset") => {
    expect.current = { value: next, why };
    if (!controlled) setOwn(next);
    onValueChange?.(next);
  };

  const down = (pan: number) => {
    if (disabled) return;
    pressed.current = true;
    const next = mod(value + 1, limit);
    commit(next, "press");
    depthRun.current?.stop();
    depthRun.current = animate(
      depth,
      1,
      motionSafe ? springs.flick : { duration: durations.blink },
    );
    // Deeper travel is a bigger, lower click; a carry adds the thunk of the
    // next wheel engaging, on the same frame.
    audio.play("click", {
      pitch: r3(1.3 - depthPx / 30),
      gain: 0.6,
      pan,
    });
    if (value % 10 === 9) audio.play("detent", { pitch: 0.8, gain: 0.45, pan });
  };

  const up = (pan: number) => {
    if (!pressed.current) return;
    pressed.current = false;
    depthRun.current?.stop();
    depthRun.current = animate(
      depth,
      0,
      motionSafe ? springs.snap : { duration: durations.fast },
    );
    audio.play("clack", { pitch: 1.15, gain: 0.32, pan });
  };

  const startHold = (pan: number) => {
    if (disabled || holding.current) return;
    holding.current = true;
    holdRun.current?.stop();
    stopWhir();
    const loop = audio.start("whir", { pitch: 0.6, gain: 0.55, pan });
    whir.current = loop;
    whirSync.current = hold.on("change", (h) =>
      loop.set({ pitch: r3(0.6 + h * 1.3) }),
    );
    holdRun.current = animate(hold, 1, {
      duration: r3(HOLD * (1 - hold.get())),
      ease: "linear",
      onComplete: () => {
        holding.current = false;
        stopWhir();
        audio.play("thock", { gain: 0.6, pan });
        if (value === 0) {
          releaseKnob();
          return;
        }
        commit(0, "reset");
        // A host that refuses the reset never answers: the knob lets go and
        // the wheels run back to the count it still holds.
        later(() => {
          if (expect.current?.why !== "reset") return;
          expect.current = null;
          releaseKnob();
        }, 250);
      },
    });
  };

  const releaseHold = () => {
    if (!holding.current) return;
    holding.current = false;
    stopWhir();
    audio.play("tick", { pitch: 0.7, gain: 0.3, pan: panOf(knobRef.current) });
    releaseKnob();
  };

  const plungerY = useTransform(depth, (d) =>
    motionSafe ? r2(d * depthPx) : 0,
  );
  const plungerShade = useTransform(depth, (d) =>
    motionSafe ? 0 : r3(d * 0.45),
  );
  const knobTurn = useTransform(hold, (h) => (motionSafe ? r2(h * -300) : 0));
  const ringOffset = useTransform(hold, (h) =>
    r2(RING_C * (1 - Math.min(1, Math.max(0, h)))),
  );
  const ringOpacity = useTransform(hold, (h) =>
    r3(Math.min(1, Math.max(0, h * 6))),
  );

  const windowWidth = wheels * CELL.w + (wheels - 1) * 2 + 10;
  const windowHeight = CELL.h + 10;

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("relative shrink-0 select-none", className)}
      style={{ width: W, height: HT }}
    >
      <button
        ref={bodyRef}
        type="button"
        aria-label={`Add one to ${label}`}
        disabled={disabled}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          down(panFrom(event.clientX, event.currentTarget));
        }}
        onPointerUp={(event) => up(panFrom(event.clientX, event.currentTarget))}
        onPointerLeave={(event) =>
          up(panFrom(event.clientX, event.currentTarget))
        }
        onPointerCancel={() => up(0)}
        onClick={(event) => {
          // Pointer strokes arrive through pointerdown/up. A click with no
          // pointer behind it — Space, Enter, assistive technology — is a
          // whole stroke: down, then up a beat later, both sounds included.
          if (event.detail !== 0) return;
          const pan = panOf(bodyRef.current);
          down(pan);
          later(() => up(pan), 90);
        }}
        className={cn(
          "absolute cursor-pointer touch-manipulation rounded-full",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        style={{
          left: BODY.left,
          top: BODY.top,
          width: BODY.size,
          height: BODY.size,
        }}
      >
        <motion.span
          aria-hidden
          className="absolute left-1/2 overflow-clip rounded-t-[8px] rounded-b-[3px]"
          style={{
            top: -PLUNGER.rise,
            width: PLUNGER.width,
            height: PLUNGER.height,
            marginLeft: -PLUNGER.width / 2,
            background: look.cap,
            boxShadow: look.edge,
            y: plungerY,
          }}
        >
          <motion.span
            className="absolute inset-0"
            style={{ background: WINDOW_BG, opacity: plungerShade }}
          />
        </motion.span>
        <span
          aria-hidden
          className="absolute inset-0 rounded-full shadow-[var(--shadow-raised)]"
          style={{ background: look.body }}
        >
          <span
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: look.rim }}
          />
          <span
            className="absolute flex items-center gap-0.5 rounded-[7px] p-[5px]"
            style={{
              left: (BODY.size - windowWidth) / 2,
              top: (BODY.size - windowHeight) / 2,
              width: windowWidth,
              height: windowHeight,
              background: WINDOW_BG,
              boxShadow: `inset 0 2px 5px ${shade("var(--ink-3)", 0.1)}, 0 0 0 1px ${tint("var(--ink-3)", 30)}`,
            }}
          >
            {Array.from({ length: wheels }, (_, i) => {
              const k = wheels - 1 - i;
              return (
                <Wheel
                  key={k}
                  k={k}
                  value={value}
                  carry={carry}
                  count={count}
                  hold={hold}
                  motionSafe={motionSafe}
                />
              );
            })}
          </span>
        </span>
      </button>

      <button
        ref={knobRef}
        type="button"
        aria-label={`Hold to reset ${label}`}
        disabled={disabled}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          startHold(panFrom(event.clientX, null));
        }}
        onPointerUp={releaseHold}
        onPointerLeave={releaseHold}
        onPointerCancel={releaseHold}
        onBlur={releaseHold}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (!holding.current) return;
            event.preventDefault();
            releaseHold();
            return;
          }
          if (event.key !== " " && event.key !== "Enter") return;
          // The key is the hold: its own down and up, never a click.
          event.preventDefault();
          if (!event.repeat) startHold(panOf(knobRef.current));
        }}
        onKeyUp={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          releaseHold();
        }}
        onClick={(event) => {
          // Assistive technology activates without a key to hold: the reset
          // runs its full course.
          if (event.detail === 0 && !holding.current) {
            startHold(panOf(knobRef.current));
          }
        }}
        className={cn(
          "absolute cursor-pointer touch-manipulation rounded-full",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        style={{
          left: r2(KNOB.x - KNOB.r),
          top: r2(KNOB.y - KNOB.r),
          width: KNOB.r * 2,
          height: KNOB.r * 2,
        }}
      >
        <svg
          aria-hidden
          width={36}
          height={36}
          viewBox="0 0 36 36"
          className="pointer-events-none absolute -top-[5px] -left-[5px] overflow-visible"
        >
          <defs>
            <radialGradient id={gradientId} cx="0.36" cy="0.3" r="0.75">
              <stop offset="0" style={{ stopColor: tint(look.knob, 45) }} />
              <stop offset="1" style={{ stopColor: look.knob }} />
            </radialGradient>
          </defs>
          <g transform="rotate(-90 18 18)">
            <motion.circle
              cx={18}
              cy={18}
              r={RING_R}
              fill="none"
              className="stroke-cobalt-bright"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={ringOffset}
              style={{ opacity: ringOpacity }}
            />
          </g>
          <motion.g style={{ rotate: knobTurn, originX: 0.5, originY: 0.5 }}>
            <circle
              cx={18}
              cy={18}
              r={12.5}
              fill={`url(#${gradientId})`}
              style={{ stroke: shade(look.knob, 0.7) }}
              strokeWidth={1}
            />
            {KNURLS.map((n, i) => (
              <line
                key={i}
                x1={n.x1}
                y1={n.y1}
                x2={n.x2}
                y2={n.y2}
                style={{ stroke: shade(look.knob, 0.6) }}
                strokeWidth={1}
              />
            ))}
            <circle
              cx={18}
              cy={18}
              r={3.5}
              style={{ fill: shade(look.knob, 0.75) }}
            />
            <circle
              cx={18}
              cy={12}
              r={1.25}
              className="fill-primary-foreground"
            />
          </motion.g>
        </svg>
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {`${label}: ${value}`}
      </span>
    </div>
  );
}
