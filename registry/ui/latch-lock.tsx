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
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LatchLockSize = "sm" | "md" | "lg";

export type LatchLockProps = {
  /** Controlled state: true is locked. */
  pressed?: boolean;
  /** Initial state when uncontrolled; true is locked. @default true */
  defaultPressed?: boolean;
  /** Fires from the press that changed it, with true for locked. */
  onPressedChange?: (locked: boolean) => void;
  /** Text while locked; also the accessible name then. @default "Locked" */
  lockedLabel?: string;
  /** Text while unlocked; also the accessible name then. @default "Unlocked" */
  unlockedLabel?: string;
  /** Icon only: a round button whose accessible name is still the label. @default false */
  compact?: boolean;
  /** How heavy the lock is, 0 to 1: a slower swing, a deeper drop and a lower thock. @default 0.5 */
  weight?: number;
  /** How hard the lock shakes when the shackle seats, and when a disabled lock is pressed, 0 to 1. @default 0.5 */
  rattle?: number;
  /** How bright the keyhole glints as it unlocks, 0 to 1; 0 hides the glint. @default 0.6 */
  glint?: number;
  /** How far the open shackle swings out, in degrees. @default 26 */
  swing?: number;
  /** Button height 32, 40 or 48 px, with the padlock scaled to match. @default "md" */
  size?: LatchLockSize;
  /** The body's colour while locked, and the pressed tint. Any CSS colour. @default "var(--accent-bright)" */
  lockedColor?: string;
  /** The body's colour while unlocked. Any CSS colour. @default "var(--ink-3)" */
  unlockedColor?: string;
  /** What a press on a disabled lock says to assistive technology. @default "This lock can't be changed right now" */
  disabledNote?: string;
  /** A press on a disabled lock: it rattled and stayed put. */
  onRefused?: () => void;
  /** Clack as the shackle lets go and thock as it seats. Off unless asked for. @default false */
  sound?: boolean;
  /** The lock rattles instead of toggling, and stays in the tab order to say why. @default false */
  disabled?: boolean;
  className?: string;
};

/**
 * The padlock's own box, from x = VX, tight round the body so the label sits
 * close. The swung shackle and the shake reach a unit or two past it, into
 * the button's own padding — never outside the button.
 */
const VX = 3;
const W = 24;
const H = 38;
/** The shackle at rest: the long left leg runs deep into the body, the short right leg just inside it. */
const SHACKLE = "M 9 30 V 14 A 6 6 0 0 1 21 14 V 23";
const SHACKLE_TOP = 8;
const SHACKLE_H = 22;
const BODY = { x: 5, y: 19, w: 20, h: 15, rx: 3.5 } as const;
/** Lifted this far, the short leg clears the body. */
const LIFT = 5.5;
const SPARK =
  "M 16.8 20.6 L 17.55 23.45 L 20.4 24.2 L 17.55 24.95 L 16.8 27.8 L 16.05 24.95 L 13.2 24.2 L 16.05 23.45 Z";

const SIZES: Record<
  LatchLockSize,
  { glyph: number; box: string; square: string }
> = {
  sm: { glyph: 18, box: "h-8 gap-1.5 px-3 text-xs", square: "size-8" },
  md: { glyph: 22, box: "h-10 gap-2 px-3.5 text-sm", square: "size-10" },
  lg: { glyph: 28, box: "h-12 gap-2.5 px-4 text-[15px]", square: "size-12" },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

type Intent = { to: boolean; until: number; pan: number };

/**
 * A lock toggle drawn as a padlock whose parts move on their own springs.
 * Unlocking lifts the shackle's short leg clear of the body on the snap
 * spring and swings it out about its long leg with one overshoot, while the
 * body, let go, drops a few pixels and a glint sweeps across the keyhole.
 * Locking swings the shackle back and drops it home on the flick spring — a
 * hard stop, no bounce — and a short shake runs through the whole lock.
 *
 * It is a `<button>` with `aria-pressed` (pressed is locked) whose label
 * reads "Locked" or "Unlocked". A disabled lock stays focusable
 * (`aria-disabled`) so a press can be answered: it rattles in place, says
 * why in a polite live region, and stays put. Under reduced motion the parts
 * jump to each pose, the colour still cross-fades and the glint is a short
 * flash, so locked and unlocked read at a glance.
 */
export function LatchLock({
  pressed,
  defaultPressed = true,
  onPressedChange,
  lockedLabel = "Locked",
  unlockedLabel = "Unlocked",
  compact = false,
  weight = 0.5,
  rattle = 0.5,
  glint = 0.6,
  swing = 26,
  size = "md",
  lockedColor = "var(--accent-bright)",
  unlockedColor = "var(--ink-3)",
  disabledNote = "This lock can't be changed right now",
  onRefused,
  sound = false,
  disabled = false,
  className,
}: LatchLockProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `latch-lock-${uid}`;
  const s = SIZES[size] ?? SIZES.md;
  const w = clamp01(weight);
  const shakeAmp = lerp(0, 2.4, clamp01(rattle)) * lerp(0.8, 1.2, w);
  const g = clamp01(glint);
  const open = Math.max(0, Math.min(80, swing));
  const dropBy = lerp(1.2, 3.4, w);

  const [own, setOwn] = React.useState(defaultPressed);
  const locked = pressed ?? own;
  const label = locked ? lockedLabel : unlockedLabel;
  // Each refused press re-announces: the trailing space flips the text.
  const [refusals, setRefusals] = React.useState(0);

  const lift = useMotionValue(locked ? 0 : LIFT);
  const peek = useMotionValue(0);
  const angle = useMotionValue(locked ? 0 : -open);
  const drop = useMotionValue(locked ? 0 : dropBy);
  const shake = useMotionValue(0);
  const tone = useMotionValue(locked ? 1 : 0);
  const glintX = useMotionValue(0);
  const glintOpacity = useMotionValue(0);
  const sparkScale = useMotionValue(0.4);
  const sparkRotate = useMotionValue(0);
  const sparkOpacity = useMotionValue(0);
  const denied = useMotionValue(0);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const intent = React.useRef<Intent | null>(null);
  const shown = React.useRef(locked);

  const halt = React.useCallback(() => {
    for (const a of running.current) a.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);
  const run = (...controls: AnimationPlaybackControls[]) => {
    running.current.push(...controls);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, Math.round(ms))));
  };

  const shakeOnce = (amp: number, duration = 0.28) => {
    if (amp <= 0.01) return;
    // A decaying shake has more than two keyframes, so it is a tween.
    run(
      animate(shake, [0, -amp, amp * 0.7, -amp * 0.4, amp * 0.15, 0], {
        duration,
        ease: "easeOut",
      }),
    );
  };

  const flashGlint = () => {
    if (g <= 0) return;
    if (!motionSafe) {
      sparkScale.jump(1);
      sparkRotate.jump(0);
      run(
        animate(sparkOpacity, [0, g, 0], {
          duration: durations.slow,
          ease: "easeInOut",
        }),
      );
      return;
    }
    glintX.jump(0);
    run(
      animate(glintX, 1, {
        duration: 0.42,
        delay: 0.1,
        ease: easings.enter,
      }),
      animate(glintOpacity, [0, 0.55 * g, 0], {
        duration: 0.42,
        delay: 0.1,
        ease: "easeInOut",
      }),
      animate(sparkScale, [0.4, 0.5 + 0.6 * g, 0.4], {
        duration: 0.46,
        delay: 0.2,
        ease: "easeOut",
      }),
      animate(sparkRotate, [0, 90], {
        duration: 0.46,
        delay: 0.2,
        ease: easings.enter,
      }),
      animate(sparkOpacity, [0, g, 0], {
        duration: 0.46,
        delay: 0.2,
        ease: "easeOut",
      }),
    );
  };

  /** Carries the padlock to locked or unlocked. */
  const perform = (to: boolean, pan: number | null) => {
    halt();
    const register = lerp(1.15, 0.78, w);
    if (!motionSafe) {
      lift.jump(to ? 0 : LIFT);
      angle.jump(to ? 0 : -open);
      drop.jump(to ? 0 : dropBy);
      peek.jump(0);
      shake.jump(0);
      run(
        animate(tone, to ? 1 : 0, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      if (!to) flashGlint();
      if (pan !== null) {
        audio.play(to ? "thock" : "clack", { pitch: register, gain: 0.6, pan });
      }
      return;
    }
    // Heavier locks swing slower; ζ 0.62 lets the hinged shackle overshoot
    // visibly once, where the house snap would hide it at this size.
    const swingSpring = spring(
      springs.snap.stiffness * lerp(1.25, 0.6, w),
      0.62,
    );
    run(animate(peek, 0, springs.flick));
    if (!to) {
      run(
        animate(lift, LIFT, springs.snap),
        animate(angle, -open, { ...swingSpring, delay: 0.05 }),
        animate(drop, dropBy, { ...springs.snap, delay: 0.03 }),
        animate(tone, 0, { duration: durations.base, ease: easings.enter }),
      );
      flashGlint();
      if (pan !== null) {
        audio.play("clack", { pitch: register * 1.08, gain: 0.55, pan });
      }
      return;
    }
    // Locking: back over the hole first, then down against the stop.
    const seat = 0.12;
    run(
      animate(angle, 0, swingSpring),
      animate(lift, 0, { ...springs.flick, delay: seat }),
      animate(drop, 0, { ...springs.flick, delay: seat }),
      animate(tone, 1, {
        duration: durations.base,
        delay: seat,
        ease: easings.enter,
      }),
      animate(glintOpacity, 0, { duration: durations.fast }),
      animate(sparkOpacity, 0, { duration: durations.fast }),
    );
    later(seat * 1000 + 70, () => {
      shakeOnce(shakeAmp);
      if (pan !== null) {
        audio.play("thock", { pitch: register, gain: 0.7, pan });
      }
    });
  };

  const refuse = (pan: number) => {
    setRefusals((n) => n + 1);
    onRefused?.();
    const amp = Math.max(0.6, shakeAmp);
    audio.play("clack", { pitch: 0.7, gain: 0.3, pan });
    later(120, () => audio.play("clack", { pitch: 0.64, gain: 0.22, pan }));
    if (!motionSafe) {
      // Nothing may travel: the refusal is a flash of the rim instead.
      run(animate(denied, [0, 1, 0], { duration: durations.slow }));
      return;
    }
    if (locked) {
      // Two hops against the stop: it is held, not stuck.
      const hop = 0.6 + amp * 0.5;
      run(
        animate(lift, [0, hop, 0, hop * 0.6, 0], {
          duration: 0.3,
          ease: "easeOut",
        }),
      );
    } else {
      const a = -open;
      run(
        animate(angle, [a, a - 2 * amp, a + 1.5 * amp, a - 0.6 * amp, a], {
          duration: 0.32,
          ease: "easeOut",
        }),
      );
    }
    shakeOnce(amp * 0.7, 0.26);
  };

  // Every change of state — a press or the host — runs the same moves; only
  // a change the visitor asked for is heard.
  React.useEffect(() => {
    if (shown.current === locked) return;
    shown.current = locked;
    const it = intent.current;
    const audible = !!it && it.to === locked && performance.now() < it.until;
    if (audible) intent.current = null;
    perform(locked, audible && it ? it.pan : null);
    // Runs on a change of state only; perform reads the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  // A new swing or weight moves the open pose; the shackle goes straight there.
  React.useEffect(() => {
    if (shown.current) return;
    angle.jump(-open);
    drop.jump(dropBy);
  }, [open, dropBy, angle, drop]);

  React.useEffect(() => halt, [halt]);

  const press = (at: number, clientX: number | null) => {
    const rect = buttonRef.current?.getBoundingClientRect();
    const x = clientX ?? (rect ? rect.left + rect.width / 2 : 0);
    const pan = panFrom(x, null);
    if (disabled) {
      refuse(pan);
      return;
    }
    const next = !locked;
    // The event's own timestamp is on the same clock as performance.now().
    intent.current = { to: next, until: at + 1500, pan };
    if (pressed === undefined) setOwn(next);
    onPressedChange?.(next);
  };

  const shackleY = useTransform(
    [lift, peek] as MotionValue<number>[],
    ([l = 0, p = 0]: number[]) => r2(-(l + p)),
  );
  // The shackle turns about the point where its long leg leaves the body,
  // wherever lift and drop have put that point this frame.
  const shackleOrigin = useTransform(
    [lift, peek, drop] as MotionValue<number>[],
    ([l = 0, p = 0, d = 0]: number[]) =>
      r3((BODY.y + d + l + p - SHACKLE_TOP) / SHACKLE_H),
  );
  const bodyFill = useTransform(
    tone,
    (t) =>
      `color-mix(in oklab, ${lockedColor} ${Math.round(clamp01(t) * 100)}%, ${unlockedColor})`,
  );
  const holeFill = useTransform(
    bodyFill,
    (c) => `color-mix(in oklab, ${c} 45%, black)`,
  );
  const glintPath = useTransform(glintX, (t) => {
    const x = r2(lerp(1, BODY.x + BODY.w + 9, t));
    const top = BODY.y;
    const bottom = BODY.y + BODY.h;
    return `M ${x} ${top} L ${r2(x + 3.5)} ${top} L ${r2(x - 3)} ${bottom} L ${r2(x - 6.5)} ${bottom} Z`;
  });

  return (
    <span className={cn("inline-flex", className)}>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-pressed={locked}
        aria-label={compact ? label : undefined}
        aria-disabled={disabled || undefined}
        onClick={(event) => {
          // Space, Enter and assistive technology arrive here with no
          // pointer behind them; they pan from the button's middle.
          press(event.timeStamp, event.detail === 0 ? null : event.clientX);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || disabled || !motionSafe) return;
          // Testing the lock: the seated shackle gives a hair.
          if (shown.current) run(animate(peek, 1, springs.snap));
        }}
        onPointerLeave={() => {
          if (peek.get() !== 0) run(animate(peek, 0, springs.flick));
        }}
        whileTap={motionSafe && !disabled ? { scale: 0.97 } : undefined}
        transition={springs.flick}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-full border font-medium whitespace-nowrap transition-colors outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          compact ? s.square : s.box,
          locked
            ? "text-foreground"
            : cn(
                "border-hairline-strong bg-surface-1 text-ink-2",
                !disabled && "hover:bg-surface-2 hover:text-foreground",
              ),
        )}
        style={
          locked
            ? {
                borderColor: `color-mix(in oklab, ${lockedColor} 45%, transparent)`,
                backgroundColor: `color-mix(in oklab, ${lockedColor} 12%, transparent)`,
              }
            : undefined
        }
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-full border-2 border-warn"
          style={{ opacity: denied }}
        />
        <svg
          aria-hidden
          width={r2((s.glyph * W) / H)}
          height={s.glyph}
          viewBox={`${VX} 0 ${W} ${H}`}
          className="block shrink-0 overflow-visible"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={BODY.x}
                y={BODY.y}
                width={BODY.w}
                height={BODY.h}
                rx={BODY.rx}
              />
            </clipPath>
          </defs>
          <motion.g style={{ x: shake }}>
            <motion.path
              d={SHACKLE}
              fill="none"
              strokeWidth={2.6}
              strokeLinecap="round"
              className="stroke-ink-2"
              style={{
                y: shackleY,
                rotate: angle,
                originX: 0,
                originY: shackleOrigin,
              }}
            />
            <motion.g style={{ y: drop }}>
              <motion.rect
                x={BODY.x}
                y={BODY.y}
                width={BODY.w}
                height={BODY.h}
                rx={BODY.rx}
                style={{ fill: bodyFill }}
              />
              <rect
                x={BODY.x + 1.5}
                y={BODY.y + 1.3}
                width={BODY.w - 3}
                height={1.6}
                rx={0.8}
                fill="white"
                opacity={0.22}
              />
              <motion.circle
                cx={15}
                cy={25.4}
                r={2.1}
                style={{ fill: holeFill }}
              />
              <motion.rect
                x={14.15}
                y={26.2}
                width={1.7}
                height={4}
                rx={0.85}
                style={{ fill: holeFill }}
              />
              <g clipPath={`url(#${clipId})`}>
                <motion.path
                  d={glintPath}
                  fill="white"
                  style={{ opacity: glintOpacity }}
                />
              </g>
              <motion.path
                d={SPARK}
                fill="white"
                style={{
                  scale: sparkScale,
                  rotate: sparkRotate,
                  opacity: sparkOpacity,
                  originX: 0.5,
                  originY: 0.5,
                }}
              />
            </motion.g>
          </motion.g>
        </svg>
        {compact ? null : (
          <span className="grid text-left">
            {[true, false].map((state) => {
              const active = state === locked;
              return (
                <motion.span
                  key={String(state)}
                  aria-hidden={active ? undefined : true}
                  className="col-start-1 row-start-1"
                  initial={false}
                  animate={
                    active
                      ? {
                          opacity: 1,
                          y: motionSafe ? [distances.nudge, 0] : 0,
                        }
                      : { opacity: 0, y: motionSafe ? -distances.nudge : 0 }
                  }
                  transition={
                    active
                      ? {
                          opacity: {
                            duration: durations.fast,
                            delay: 0.03,
                            ease: easings.enter,
                          },
                          y: springs.snap,
                        }
                      : exitFor(durations.blink)
                  }
                >
                  {state ? lockedLabel : unlockedLabel}
                </motion.span>
              );
            })}
          </span>
        )}
      </motion.button>
      <span aria-live="polite" aria-atomic className="sr-only">
        {refusals > 0 ? `${disabledNote}${refusals % 2 === 0 ? " " : ""}` : ""}
      </span>
    </span>
  );
}
