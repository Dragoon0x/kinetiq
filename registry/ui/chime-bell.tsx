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
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ChimeBellStrap = "belt" | "cross" | "tape";
export type ChimeBellSize = "sm" | "md" | "lg";

export type ChimeBellProps = {
  /** Controlled: notifications are on. */
  pressed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the press or key that changed it, with the new state. */
  onPressedChange?: (pressed: boolean) => void;
  /** What the bell turns on: its accessible name and the first line under it. @default "Notifications" */
  label?: string;
  /** The state line while on. @default "On" */
  onLabel?: string;
  /** The state line while off. @default "Muted" */
  offLabel?: string;
  /** Keep the label and state line for assistive technology only. @default false */
  hideLabel?: boolean;
  /** How hard turning on kicks the bell: roughly its first swing, in degrees. Under ~18° the clapper never reaches the rim. @default 40 */
  swing?: number;
  /** How fast the swing dies, 0 to 1: 0 rings on, 1 is two strikes and still. @default 0.4 */
  damping?: number;
  /** How the bell is held while off: a belt round the waist, two crossed straps, or tape over the mouth. @default "belt" */
  strap?: ChimeBellStrap;
  /** Unread count on a badge; a rise while on rings the bell (silently), while off it strains against the strap. */
  count?: number;
  /** The bell while on. Any CSS colour. @default brass, from --warn at fixed lightness */
  color?: string;
  /** The bell while off. Any CSS colour. @default grey, from --ink-3 at fixed lightness */
  mutedColor?: string;
  /** The strap (tape is a pale tint of it). Any CSS colour. @default leather, from --warn */
  strapColor?: string;
  /** @default "md" */
  size?: ChimeBellSize;
  /** Play a chime at every strike of the clapper. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Dims = { bell: number; well: number; text: string; pitch: number };

const SIZES: Record<ChimeBellSize, Dims> = {
  sm: { bell: 40, well: 60, text: "text-xs", pitch: 1.18 },
  md: { bell: 56, well: 80, text: "text-sm", pitch: 1 },
  lg: { bell: 72, well: 100, text: "text-sm", pitch: 0.86 },
};

/** The bell hangs from its crown loop; the clapper from inside the dome. */
const BELL_PIVOT = "32 6.5";
const CLAPPER_PIVOT = "32 12";
/** Relative angle at which the clapper's ball meets the inside of the lip, rad. */
const CONTACT = 0.3;
/** Natural frequencies, rad/s: the clapper is the quicker pendulum. */
const W_BELL = (2 * Math.PI) / 1.05;
const W_CLAPPER = (2 * Math.PI) / 0.82;
const RESTITUTION = 0.45;
/** How much of a strike's impulse the bell takes back. */
const MASS_RATIO = 0.1;
const STEP = 1 / 240;

// A slim hand bell: the mouth is drawn to the clapper, so the ball meets
// the inside of the lip at exactly CONTACT.
const BODY =
  "M 32 10 C 25.5 10 22.2 15 21.8 21.5 L 21.2 33 C 20.9 38.5 19.4 42 16.6 44.4 C 15.6 45.2 15.6 46.8 16.8 47 L 47.2 47 C 48.4 46.8 48.4 45.2 47.4 44.4 C 44.6 42 43.1 38.5 42.8 33 L 42.2 21.5 C 41.8 15 38.5 10 32 10 Z";
const SHEEN = "M 26.4 15.4 C 24.6 18 24.1 22.4 23.9 28 L 23.4 35";
const TAPE =
  "M 12.85 42.62 L 51.85 46.62 L 50.8 48.3 L 52.1 50 L 51 51.7 L 51.15 53.38 L 12.15 49.38 L 13.7 47.7 L 12.6 46 L 13.9 44.3 Z";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const DEG = 180 / Math.PI;

type Sim = {
  th: number;
  thV: number;
  ph: number;
  phV: number;
  raf: number;
  last: number;
  acc: number;
  /** Strikes make sound only when a visitor's press set the bell going. */
  audible: boolean;
  /** Which way the last strike went, so a resting contact is not re-struck. */
  lastSide: number;
};

/**
 * A notifications toggle drawn as a hand bell. Turning it on kicks the bell
 * about its crown: the bell and its clapper are two damped pendulums with
 * different periods, integrated at 240 Hz, so the clapper lags and the rim
 * catches it at the extremes — each strike a real collision with
 * restitution, heard as a chime as loud as the impact — until `damping` has
 * taken the energy out and the loop stops itself. Turning it off catches the
 * bell on springs.snap, greys it, and straps it still: a belt round the
 * waist with a buckle, two crossed straps, or tape over the mouth.
 *
 * It is a real toggle button with `aria-pressed`; Space and Enter press it.
 * While off, a new `count` makes the bell strain against its strap; while
 * on it rings, silently, because sound only answers a press. Under reduced
 * motion nothing swings: the colour changes, two sound arcs glow once, and
 * the strap fades in whole.
 */
export function ChimeBell({
  pressed,
  defaultPressed = false,
  onPressedChange,
  label = "Notifications",
  onLabel = "On",
  offLabel = "Muted",
  hideLabel = false,
  swing = 40,
  damping = 0.4,
  strap = "belt",
  count,
  color = "oklch(from var(--warn) 0.8 0.12 h)",
  mutedColor = "oklch(from var(--ink-3) 0.74 0.01 h)",
  strapColor = "oklch(from var(--warn) 0.5 0.08 h)",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: ChimeBellProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tapeClip = `chime-tape-${uid}`;
  const d = SIZES[size] ?? SIZES.md;

  const [own, setOwn] = React.useState(defaultPressed);
  const isOn = pressed ?? own;

  // 0 brass, 1 muted grey: mixed in oklab, never through a lost hue.
  const mute = useMotionValue(isOn ? 0 : 1);
  const strapA = useMotionValue(isOn ? 0 : 1);
  const strapB = useMotionValue(isOn ? 0 : 1);
  const strapOpacity = useMotionValue(isOn ? 0 : 1);
  const buckle = useMotionValue(isOn ? 0 : 1);
  const tapeWidth = useMotionValue(isOn ? 0 : 64);
  const arcs = useMotionValue(0);
  const press = useMotionValue(1);
  const badgeScale = useMotionValue(1);

  const rootRef = React.useRef<HTMLButtonElement | null>(null);
  const bellRef = React.useRef<SVGGElement | null>(null);
  const clapperRef = React.useRef<SVGGElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const visible = React.useRef(true);
  /** When a visitor last pressed: the change that follows it is heard. */
  const userPress = React.useRef(-Infinity);
  const sim = React.useRef<Sim>({
    th: 0,
    thV: 0,
    ph: 0,
    phV: 0,
    raf: 0,
    last: 0,
    acc: 0,
    audible: false,
    lastSide: 0,
  });
  const latest = React.useRef({ damping, pitch: d.pitch, motionSafe, isOn });
  const kickRef = React.useRef<(degrees: number, audible: boolean) => void>(
    () => {},
  );
  const strainRef = React.useRef<() => void>(() => {});

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  /** Writes the two angles (radians) straight onto the drawing. */
  const pose = React.useCallback((th: number, ph: number) => {
    bellRef.current?.setAttribute(
      "transform",
      `rotate(${r2(th * DEG)} ${BELL_PIVOT})`,
    );
    clapperRef.current?.setAttribute(
      "transform",
      `rotate(${r2(th * DEG)} ${BELL_PIVOT}) rotate(${r2((ph - th) * DEG)} ${CLAPPER_PIVOT})`,
    );
  }, []);

  const stopSim = React.useCallback(() => {
    const s = sim.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
  }, []);

  /** Straight to rest: off screen, hidden, or caught. */
  const rest = React.useCallback(() => {
    stopSim();
    const s = sim.current;
    s.th = 0;
    s.thV = 0;
    s.ph = 0;
    s.phV = 0;
    pose(0, 0);
  }, [pose, stopSim]);

  const strike = (rv: number, side: number) => {
    const s = sim.current;
    const speed = Math.abs(rv);
    if (!s.audible || speed < 0.35) return;
    audio.play("chime", {
      pitch: r2(latest.current.pitch * (side > 0 ? 1.012 : 1)),
      gain: r2(Math.min(1, speed / 5) * 0.62 + 0.08),
      pan: side * 0.28,
    });
  };

  /** One fixed step of the two pendulums and the rim between them. */
  const step = (dt: number) => {
    const s = sim.current;
    const k = clamp01(latest.current.damping);
    // Air and the hand: light at 0, heavy at 1 — but only while the swing
    // can still reach the clapper. Below that it is let settle, so the
    // bell rings and then rests instead of idling on a long, silent tail.
    const amp = Math.hypot(s.th, s.thV / W_BELL);
    const settle =
      amp < CONTACT * 0.95 ? lerp(1.4, 3, k) + (amp < 0.04 ? 4 : 0) : 0;
    const cb = lerp(0.1, 2.6, k * Math.sqrt(k)) + settle;
    s.thV += (-W_BELL * W_BELL * Math.sin(s.th) - cb * s.thV) * dt;
    // The clapper is heavily damped on its pin: it bounces off the rim and
    // hangs again, ready for the next extreme.
    s.phV += (-W_CLAPPER * W_CLAPPER * Math.sin(s.ph) - 7 * s.phV) * dt;
    s.th += s.thV * dt;
    s.ph += s.phV * dt;
    const rel = s.ph - s.th;
    const rv = s.phV - s.thV;
    const side = rel > CONTACT ? 1 : rel < -CONTACT ? -1 : 0;
    if (side !== 0 && rv * side > 0) {
      // The clapper is put back on the rim and bounces off it; the bell
      // takes a share of the blow.
      s.ph = s.th + side * CONTACT;
      const j = ((1 + RESTITUTION) * rv) / (1 + MASS_RATIO);
      s.phV -= j;
      s.thV += MASS_RATIO * j;
      if (s.lastSide !== side || Math.abs(rv) > 0.6) strike(rv, side);
      s.lastSide = side;
    } else if (side === 0) {
      s.lastSide = 0;
    }
  };

  const tick = (now: number) => {
    const s = sim.current;
    s.raf = 0;
    if (!visible.current || document.hidden) {
      rest();
      return;
    }
    const dt = Math.min(0.05, (now - s.last) / 1000);
    s.last = now;
    s.acc += dt;
    while (s.acc >= STEP) {
      step(STEP);
      s.acc -= STEP;
    }
    pose(s.th, s.ph);
    const energy =
      Math.abs(s.th) +
      Math.abs(s.thV) * 0.2 +
      Math.abs(s.ph) +
      Math.abs(s.phV) * 0.2;
    if (energy < 0.0025) {
      rest();
      return;
    }
    s.raf = requestAnimationFrame(tickRef.current);
  };
  const tickRef = React.useRef(tick);

  /** Sets the bell going with an angular velocity, in degrees of swing. */
  const kick = (degrees: number, audible: boolean) => {
    if (!latest.current.motionSafe || !visible.current) return;
    for (const key of ["th", "ph", "strain"]) anims.current.get(key)?.stop();
    const s = sim.current;
    // Aimed so the first swing peaks near `degrees` despite the damping.
    const k = clamp01(latest.current.damping);
    const cb = lerp(0.1, 2.6, k * Math.sqrt(k));
    s.thV +=
      (degrees / DEG) * W_BELL * Math.exp((cb / 2) * (Math.PI / (2 * W_BELL)));
    s.audible = audible || (s.audible && s.raf !== 0);
    if (!s.raf) {
      s.last = performance.now();
      s.acc = 0;
      s.raf = requestAnimationFrame(tickRef.current);
    }
  };

  /** Caught: both angles run home on the snap spring, carrying their speed. */
  const catchBell = () => {
    const s = sim.current;
    stopSim();
    if (!latest.current.motionSafe) {
      rest();
      return;
    }
    const thFrom = s.th;
    const phFrom = s.ph;
    run(
      "th",
      animate(thFrom, 0, {
        ...springs.snap,
        velocity: s.thV,
        onUpdate: (v) => {
          s.th = v;
          pose(s.th, s.ph);
        },
      }),
    );
    run(
      "ph",
      animate(phFrom, 0, {
        ...springs.snap,
        velocity: s.phV,
        onUpdate: (v) => {
          s.ph = v;
          pose(s.th, s.ph);
        },
      }),
    );
    s.thV = 0;
    s.phV = 0;
  };

  /** Held by the strap: a twitch that goes nowhere. */
  const strain = () => {
    if (!latest.current.motionSafe) return;
    const s = sim.current;
    if (s.raf) return;
    run(
      "strain",
      animate(0, [0, 1.6, -1.1, 0.5, 0], {
        duration: 0.34,
        ease: easings.move,
        onUpdate: (deg: number) => pose(deg / DEG, deg / DEG),
      }),
    );
  };

  const strapOn = () => {
    const ms = latest.current.motionSafe;
    if (!ms) {
      strapA.set(1);
      strapB.set(1);
      buckle.set(1);
      tapeWidth.set(64);
      run(
        "strapO",
        animate(strapOpacity, 1, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      return;
    }
    strapOpacity.set(1);
    strapA.jump(0);
    strapB.jump(0);
    tapeWidth.jump(0);
    run("strapA", animate(strapA, 1, { duration: 0.26, ease: easings.enter }));
    run(
      "strapB",
      animate(strapB, 1, { duration: 0.26, delay: 0.1, ease: easings.enter }),
    );
    run(
      "tape",
      animate(tapeWidth, 64, { duration: 0.32, ease: easings.enter }),
    );
    buckle.jump(0);
    run("buckle", animate(buckle, 1, { ...springs.snap, delay: 0.2 }));
  };

  const strapOff = () => {
    const exit = { duration: durations.fast, ease: easings.exit };
    if (!latest.current.motionSafe) {
      run("strapO", animate(strapOpacity, 0, exit));
      return;
    }
    run("buckle", animate(buckle, 0, exit));
    run("strapA", animate(strapA, 0, { ...exit, delay: 0.04 }));
    run("strapB", animate(strapB, 0, exit));
    run("tape", animate(tapeWidth, 0, { ...exit, duration: durations.base }));
  };

  // On and off, from a press or from the host. Only a press is heard.
  const shown = React.useRef(isOn);
  React.useEffect(() => {
    if (shown.current === isOn) return;
    shown.current = isOn;
    const audible = performance.now() - userPress.current < 1000;
    userPress.current = -Infinity;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    const tween = { duration: durations.slow, ease: easings.enter };
    if (isOn) {
      run("mute", animate(mute, 0, tween));
      strapOff();
      if (!motionSafe) {
        run(
          "arcs",
          animate(arcs, [0, 1, 0], { duration: 0.9, ease: easings.move }),
        );
        if (audible) audio.play("chime", { pitch: d.pitch, gain: 0.5 });
        return;
      }
      // The strap is mostly off before the kick lands.
      timers.current.push(
        window.setTimeout(() => kickRef.current(swing, audible), 120),
      );
    } else {
      run("mute", animate(mute, 1, tween));
      catchBell();
      strapOn();
    }
    // Answers the state only; the rest is read from the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOn]);

  // A new notification: rung silently while on, strained against while off.
  const seen = React.useRef(count ?? 0);
  React.useEffect(() => {
    const now = count ?? 0;
    const rose = now > seen.current;
    seen.current = now;
    if (!rose) return;
    if (latest.current.motionSafe) {
      badgeScale.jump(0.6);
      run("badge", animate(badgeScale, 1, springs.recoil));
    }
    if (latest.current.isOn) kickRef.current(Math.max(6, swing * 0.5), false);
    else strainRef.current();
    // Answers the count only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  React.useEffect(() => {
    latest.current = { damping, pitch: d.pitch, motionSafe, isOn };
    tickRef.current = tick;
    kickRef.current = kick;
    strainRef.current = strain;
  });

  // Off screen or in a hidden tab, the bell is simply at rest.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visible.current = e.isIntersecting;
    });
    io.observe(root);
    const onVisibility = () => {
      if (document.hidden) rest();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rest]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      stopSim();
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, [stopSim]);

  const body = useTransform(
    mute,
    (m) =>
      `color-mix(in oklab, ${mutedColor} ${Math.round(m * 100)}%, ${color})`,
  );
  const rim = useTransform(
    mute,
    (m) =>
      `color-mix(in oklab, color-mix(in oklab, ${mutedColor} ${Math.round(m * 100)}%, ${color}) 72%, black)`,
  );
  const tape = `color-mix(in oklab, ${strapColor} 30%, white)`;
  const tapeEdge = `color-mix(in oklab, ${strapColor} 55%, white)`;

  const toggle = () => {
    if (disabled) return;
    const next = !isOn;
    userPress.current = performance.now();
    if (pressed === undefined) setOwn(next);
    onPressedChange?.(next);
  };

  const n = count ?? 0;
  const badgeText = n > 99 ? "99+" : String(n);
  const name = n > 0 ? `${label}, ${n} new` : label;
  const icon = d.bell;

  return (
    <button
      ref={rootRef}
      type="button"
      aria-pressed={isOn}
      aria-label={name}
      disabled={disabled}
      onClick={toggle}
      onPointerDown={(event) => {
        if (disabled || !motionSafe) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        run("press", animate(press, 0.94, springs.flick));
      }}
      onPointerUp={() => run("press", animate(press, 1, springs.snap))}
      onPointerCancel={() => run("press", animate(press, 1, springs.snap))}
      onPointerLeave={() => run("press", animate(press, 1, springs.snap))}
      onPointerEnter={(event) => {
        // A hand passing over a live bell nudges it, short of a strike.
        if (event.pointerType !== "mouse" || disabled || !isOn) return;
        kick(3, false);
      }}
      className={cn(
        "group/chime-bell inline-flex flex-col items-center gap-2 rounded-4 p-1.5 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        "enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <motion.span
        aria-hidden
        className={cn(
          "relative flex items-center justify-center rounded-full border transition-colors",
          isOn
            ? "border-hairline-strong bg-surface-2"
            : "border-hairline bg-surface-1",
          "group-hover/chime-bell:border-hairline-strong",
        )}
        style={{ width: d.well, height: d.well, scale: press }}
      >
        <svg
          width={icon}
          height={icon}
          viewBox="0 0 64 64"
          className="block overflow-visible"
        >
          <defs>
            <clipPath id={tapeClip}>
              <motion.rect x={0} y={0} height={64} width={tapeWidth} />
            </clipPath>
          </defs>
          {/* Two sound arcs: the reduced-motion ring. */}
          <motion.g
            fill="none"
            strokeWidth={2.4}
            strokeLinecap="round"
            style={{ opacity: arcs, stroke: body }}
          >
            <path d="M 8 18 C 4.5 23 4.5 31 8 36" />
            <path d="M 56 18 C 59.5 23 59.5 31 56 36" />
          </motion.g>
          <g ref={clapperRef}>
            <motion.path
              d="M 32 12 V 46.6"
              strokeWidth={2.2}
              strokeLinecap="round"
              style={{ stroke: rim }}
            />
            <motion.circle cx={32} cy={50} r={3.6} style={{ fill: rim }} />
          </g>
          <g ref={bellRef}>
            {strap === "belt" ? (
              <motion.path
                d="M 19.6 26.8 Q 32 22.8 44.4 26.8"
                fill="none"
                strokeWidth={5}
                style={{
                  stroke: `color-mix(in oklab, ${strapColor} 70%, black)`,
                  opacity: strapOpacity,
                  pathLength: strapA,
                }}
              />
            ) : null}
            <motion.circle
              cx={32}
              cy={6.5}
              r={3}
              fill="none"
              strokeWidth={2.2}
              style={{ stroke: body }}
            />
            <motion.path
              d="M 29.5 9.6 H 34.5"
              strokeWidth={3}
              strokeLinecap="round"
              style={{ stroke: rim }}
            />
            <motion.path d={BODY} style={{ fill: body }} />
            <path
              d={SHEEN}
              fill="none"
              stroke="white"
              strokeOpacity={0.35}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <motion.path
              d="M 17 45.6 H 47"
              strokeWidth={2.6}
              strokeLinecap="round"
              style={{ stroke: rim }}
            />

            {strap === "belt" ? (
              <motion.g style={{ opacity: strapOpacity }}>
                <motion.path
                  d="M 20.5 27.6 Q 32 32.2 43.5 27.6"
                  fill="none"
                  strokeWidth={5.2}
                  style={{ stroke: strapColor, pathLength: strapA }}
                />
                <motion.g style={{ scale: buckle, originX: 0.5, originY: 0.5 }}>
                  <rect
                    x={28.8}
                    y={26.3}
                    width={6.4}
                    height={7.2}
                    rx={1.6}
                    fill="none"
                    strokeWidth={1.6}
                    style={{
                      stroke: `color-mix(in oklab, ${color} 80%, white)`,
                    }}
                  />
                  <path
                    d="M 32 27.5 V 32.3"
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    style={{
                      stroke: `color-mix(in oklab, ${color} 80%, white)`,
                    }}
                  />
                </motion.g>
              </motion.g>
            ) : null}

            {strap === "cross" ? (
              <motion.g
                style={{ opacity: strapOpacity }}
                fill="none"
                strokeWidth={4.6}
                strokeLinecap="butt"
              >
                <motion.path
                  d="M 23 16.6 L 44.4 44.2"
                  style={{ stroke: strapColor, pathLength: strapA }}
                />
                <motion.path
                  d="M 41 16.6 L 19.6 44.2"
                  style={{ stroke: strapColor, pathLength: strapB }}
                />
                <motion.circle
                  cx={32}
                  cy={28.2}
                  r={2.6}
                  strokeWidth={0}
                  style={{
                    fill: `color-mix(in oklab, ${color} 80%, white)`,
                    scale: buckle,
                    originX: 0.5,
                    originY: 0.5,
                  }}
                />
              </motion.g>
            ) : null}

            {strap === "tape" ? (
              <motion.g
                clipPath={`url(#${tapeClip})`}
                style={{ opacity: strapOpacity }}
              >
                <path
                  d={TAPE}
                  strokeWidth={0.8}
                  strokeLinejoin="round"
                  style={{ fill: tape, stroke: tapeEdge }}
                />
                <path
                  d="M 14.2 46.1 L 50.6 49.9"
                  fill="none"
                  strokeWidth={0.7}
                  strokeDasharray="1.5 2.5"
                  style={{ stroke: tapeEdge }}
                />
              </motion.g>
            ) : null}
          </g>
        </svg>
        {n > 0 ? (
          <motion.span
            className={cn(
              "absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] leading-none font-medium tabular-nums",
              isOn
                ? "bg-danger text-destructive-foreground"
                : "bg-ink-3 text-background",
            )}
            style={{ scale: badgeScale }}
          >
            {badgeText}
          </motion.span>
        ) : null}
      </motion.span>
      <span
        aria-hidden
        className={cn(
          "flex flex-col items-center leading-tight",
          hideLabel && "sr-only",
          d.text,
        )}
      >
        <span className="font-medium text-foreground">{label}</span>
        <span className="grid text-xs text-ink-3">
          <span
            className={cn(
              "col-start-1 row-start-1 text-center transition-opacity duration-200",
              !isOn && "opacity-0",
            )}
          >
            {onLabel}
          </span>
          <span
            className={cn(
              "col-start-1 row-start-1 text-center transition-opacity duration-200",
              isOn && "opacity-0",
            )}
          >
            {offLabel}
          </span>
        </span>
      </span>
    </button>
  );
}
