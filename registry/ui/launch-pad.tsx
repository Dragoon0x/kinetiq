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
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LaunchPadState =
  "idle" | "countdown" | "pending" | "success" | "error";

export type LaunchPadSize = "sm" | "md" | "lg";

export type LaunchPadProps = {
  /** The deploy itself, called at zero. A returned promise keeps the rocket in flight until it settles. */
  onLaunch?: () => Promise<unknown> | unknown;
  /** Controlled state. Omit it and the countdown and the promise drive the pad. */
  state?: LaunchPadState;
  /** Every change of state — from a press, the count reaching zero, the promise or a hold running out — with the rejection on error. */
  onStateChange?: (state: LaunchPadState, error?: unknown) => void;
  /** A press (or Escape) during the countdown called the launch off. */
  onAbort?: () => void;
  /** Seconds counted down before lift-off, 0 to 9; each is one segment of the ring. 0 launches on the press. @default 3 */
  countdown?: number;
  /** How hard it launches, 0 to 1: a quicker climb, a longer flame, more exhaust. @default 0.6 */
  thrust?: number;
  /** How far a failure shakes the button, in px. 0 keeps it still. @default 6 */
  shake?: number;
  /** Known progress of the deploy, 0 to 1. Omit it for an estimate that never claims the finish. */
  progress?: number;
  /** How long a deploy usually takes, in ms: paces the estimated progress line. @default 2400 */
  eta?: number;
  /** The idle label. @default "Deploy" */
  label?: string;
  /** Shown before the seconds while counting down; a press then aborts. @default "Abort" */
  abortLabel?: string;
  /** The label while the deploy is in flight. @default "Deploying" */
  pendingLabel?: string;
  /** The version that goes live, read out as "Live · v2.4.1". @default "v2.4.1" */
  version?: string;
  /** The label once live. @default "Live · {version}" */
  successLabel?: string;
  /** What failed, shown before the retry. A rejection's own message replaces it. @default "Checks failed" */
  errorLabel?: string;
  /** The word after the error that says a press tries again. @default "Retry" */
  retryLabel?: string;
  /** How long "Live" holds before the pad resets, in ms. 0 keeps it. @default 2600 */
  successHold?: number;
  /** How long a failure holds before the pad resets, in ms. 0 keeps it until retried. @default 0 */
  errorHold?: number;
  /** @default "md" */
  size?: LaunchPadSize;
  /** The button's face. @default "var(--primary)" */
  accent?: string;
  /** The exhaust flame. @default the warn hue as a fixed-lightness pigment */
  flame?: string;
  /** Play the countdown ticks, the lift-off and the landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  height: number;
  /** Radius of the countdown ring. */
  ring: number;
  font: number;
  /** Space after the label, before the pill's right cap. */
  tail: number;
  /** Scale of the rocket and the flag against the md drawing. */
  s: number;
};

const GEOMETRY: Record<LaunchPadSize, Geometry> = {
  sm: { height: 36, ring: 12, font: 13, tail: 16, s: 0.82 },
  md: { height: 44, ring: 15, font: 14, tail: 20, s: 1 },
  lg: { height: 52, ring: 18, font: 15, tail: 24, s: 1.2 },
};

const PUFFS = 8;
const STATES: LaunchPadState[] = [
  "idle",
  "countdown",
  "pending",
  "success",
  "error",
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A stable 0–1 from two integers (unsigned, so never negative). */
const hash = (a: number, b: number) =>
  (((Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663)) >>> 0) % 1000) /
  1000;

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

const messageOf = (error: unknown): string | null => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return null;
};

/** A point on the ring, `deg` clockwise from twelve o'clock, rounded for hydration. */
const polar = (c: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${r2(c + r * Math.cos(a))} ${r2(c + r * Math.sin(a))}`;
};

const arc = (c: number, r: number, from: number, to: number) => {
  const span = to - from;
  if (span <= 0.5) return "";
  if (span >= 359.5) {
    // A whole circle is two half arcs: one arc command cannot close on itself.
    return `M ${polar(c, r, from)} A ${r} ${r} 0 1 1 ${polar(c, r, from + 180)} A ${r} ${r} 0 1 1 ${polar(c, r, from + 359.9)}`;
  }
  return `M ${polar(c, r, from)} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${polar(c, r, to)}`;
};

/**
 * One billow of exhaust. Every puff is born where the rocket's nozzle meets
 * the floor during the first half of the climb, rolls out sideways and
 * thins: all of it read from one clock, so nothing is stored per frame.
 */
function Puff({
  index,
  ex,
  left,
  top,
  size,
  reachRight,
  reachLeft,
  density,
}: {
  index: number;
  ex: MotionValue<number>;
  left: number;
  top: number;
  size: number;
  reachRight: number;
  reachLeft: number;
  density: number;
}) {
  // Two thirds roll right, along the button; the left cap has little floor.
  const dir = index % 3 === 1 ? -1 : 1;
  const reach =
    (0.5 + 0.5 * hash(index, 1)) * (dir > 0 ? reachRight : reachLeft);
  const rise = 2 + 8 * hash(index, 2);
  const birth = 0.03 + (0.42 * index) / (PUFFS - 1);
  const place = useTransform(ex, (e) => {
    const life = (e - birth) / 0.5;
    if (life <= 0 || life >= 1) return { x: 0, y: 0, s: 0, o: 0 };
    const out = 1 - (1 - life) * (1 - life);
    return {
      x: r2(dir * reach * out),
      y: r2(-rise * out),
      s: r2(0.35 + 1.45 * out),
      o: r2(density * (1 - life) * Math.min(1, life * 6)),
    };
  });
  const x = useTransform(place, (p) => p.x);
  const y = useTransform(place, (p) => p.y);
  const scale = useTransform(place, (p) => p.s);
  const opacity = useTransform(place, (p) => p.o);
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute rounded-full"
      style={{
        // Soft-edged, so overlapping billows read as one cloud, not beads.
        background:
          "radial-gradient(closest-side, currentColor, color-mix(in oklab, currentColor 55%, transparent) 55%, transparent)",
        left: left - size / 2,
        top: top - size / 2,
        width: size,
        height: size,
        x,
        y,
        scale,
        opacity,
      }}
    />
  );
}

type LabelValues = { o: MotionValue<number>; y: MotionValue<number> };

type Api = {
  enter: (to: LaunchPadState, from: LaunchPadState) => void;
  runClock: () => () => void;
  zero: () => void;
  estimate: () => () => void;
  landed: (run: number) => void;
  crashed: (run: number, error: unknown) => void;
  reset: () => void;
};

/**
 * A deploy button with a launch pad in its left cap. A press arms the
 * countdown: the ring round the rocket lights one segment per second and
 * drains clockwise, a tick on every second, the label reading "Abort · 3"
 * with its digit rolling — so a second press, or Escape, calls it off. At
 * zero the rocket squats and leaves through the roof on an accelerating
 * ease, its flame lengthening with `thrust`, exhaust billowing out along the
 * floor of the button while the label lifts off after it on a streak of
 * exhaust; `onLaunch` is called and a progress line runs along the bottom
 * lip while its promise is pending. Resolved, a flag drops into the pad on
 * the recoil spring and unfurls on snap and the face turns to the success
 * pigment: "Live · v2.4.1". Rejected, the rocket falls back nose-down on
 * glide — a failure never bounces — the button shakes its head, the face
 * turns to danger and the error is shown with a retry, which re-arms the
 * count.
 *
 * Controlled through `state` (it reports every change it wants through
 * `onStateChange` and waits for the host), or uncontrolled with the promise.
 * Width is reserved for the longest label, so nothing beside it moves. Under
 * reduced motion nothing travels: the ring still drains, the rocket fades
 * out and back, the line still fills and the colours still change.
 */
export function LaunchPad({
  onLaunch,
  state,
  onStateChange,
  onAbort,
  countdown = 3,
  thrust = 0.6,
  shake = 6,
  progress,
  eta = 2400,
  label = "Deploy",
  abortLabel = "Abort",
  pendingLabel = "Deploying",
  version = "v2.4.1",
  successLabel,
  errorLabel = "Checks failed",
  retryLabel = "Retry",
  successHold = 2600,
  errorHold = 0,
  size = "md",
  accent = "var(--primary)",
  flame = "oklch(from var(--warn) 0.8 c h)",
  sound = false,
  disabled = false,
  className,
}: LaunchPadProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const seconds = Math.max(0, Math.min(9, Math.round(countdown)));
  const power = clamp01(thrust);
  const amplitude = Math.max(0, shake);
  const live = successLabel ?? `Live · ${version}`;
  const lineHeight = r2(g.font * 1.25);
  const pad = g.height / 2;
  const box = 2 * (g.ring + 2);
  // The rocket climbs until its flame is clear of the roof.
  const climb = r2(pad + 30 * g.s);

  const [own, setOwn] = React.useState<LaunchPadState>("idle");
  const current = state ?? own;
  const [digit, setDigit] = React.useState(Math.max(1, seconds));
  const [failure, setFailure] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");

  const clock = useMotionValue(seconds);
  const ringOn = useMotionValue(current === "countdown" ? 1 : 0);
  const rocketY = useMotionValue(
    current === "pending" || current === "success" ? -climb : 0,
  );
  const hover = useMotionValue(0);
  const tilt = useMotionValue(current === "error" ? 140 : 0);
  const rocketOpacity = useMotionValue(
    current === "pending" || current === "success" ? 0 : 1,
  );
  const squat = useMotionValue(1);
  const flameScale = useMotionValue(0);
  const flameOpacity = useMotionValue(0);
  const ex = useMotionValue(0);
  const flagY = useMotionValue(0);
  const flagOpacity = useMotionValue(current === "success" ? 1 : 0);
  const cloth = useMotionValue(current === "success" ? 1 : 0);
  const line = useMotionValue(0);
  const lineOpacity = useMotionValue(current === "pending" ? 1 : 0);
  const shakeX = useMotionValue(0);
  const press = useMotionValue(1);
  const digitY = useMotionValue(-Math.max(1, seconds) * lineHeight);
  const streak = useMotionValue(0);
  const streakOpacity = useMotionValue(0);

  const idleO = useMotionValue(current === "idle" ? 1 : 0);
  const idleY = useMotionValue(0);
  const countO = useMotionValue(current === "countdown" ? 1 : 0);
  const countY = useMotionValue(0);
  const pendO = useMotionValue(current === "pending" ? 1 : 0);
  const pendY = useMotionValue(0);
  const liveO = useMotionValue(current === "success" ? 1 : 0);
  const liveY = useMotionValue(0);
  const errO = useMotionValue(current === "error" ? 1 : 0);
  const errY = useMotionValue(0);
  const labels: Record<LaunchPadState, LabelValues> = {
    idle: { o: idleO, y: idleY },
    countdown: { o: countO, y: countY },
    pending: { o: pendO, y: pendY },
    success: { o: liveO, y: liveY },
    error: { o: errO, y: errY },
  };

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const api = React.useRef<Api | null>(null);
  const shown = React.useRef<LaunchPadState>(current);
  /** The visitor started this sequence: only then may it make a sound. */
  const armed = React.useRef(false);
  /** Bumped by every arm and abort, so a stale zero never launches. */
  const seq = React.useRef(0);
  const zeroFor = React.useRef(-1);
  /** Bumped by every launch and abort, so a stale promise never lands. */
  const runs = React.useRef(0);
  const mounted = React.useRef(false);
  const deadline = React.useRef<number | null>(null);
  const pressedAt = React.useRef(-Infinity);
  const aloft = React.useRef(current === "pending" || current === "success");
  const liftEnd = React.useRef(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + pad, null) : 0;
  };
  const chirp = (
    tone: "tick" | "whoosh" | "chime" | "buzz",
    pitch: number,
    gain: number,
  ) => {
    if (armed.current) audio.play(tone, { pitch: r2(pitch), gain, pan: pan() });
  };

  const move = (next: LaunchPadState, error?: unknown) => {
    if (state === undefined) setOwn(next);
    onStateChange?.(next, error);
  };

  /** The label in one grid cell trades places with the next: no reflow. */
  const swap = (
    to: LaunchPadState,
    from: LaunchPadState,
    how: "up" | "down" | "lift",
    delay = 0,
    flight = 0.4,
  ) => {
    const out = labels[from];
    const into = labels[to];
    if (!motionSafe) {
      run(
        `o-${from}`,
        animate(out.o, 0, { duration: durations.fast, ease: easings.exit }),
      );
      out.y.jump(0);
      into.y.jump(0);
      run(
        `o-${to}`,
        animate(into.o, 1, {
          duration: durations.fast,
          ease: easings.enter,
          delay: delay + 0.06,
        }),
      );
      return;
    }
    if (how === "lift") {
      run(
        `y-${from}`,
        animate(out.y, -g.height * 0.8, {
          duration: flight,
          ease: easings.exit,
          delay: 0.14,
        }),
      );
      run(
        `o-${from}`,
        animate(out.o, 0, {
          duration: flight * 0.5,
          ease: easings.exit,
          delay: 0.14 + flight * 0.3,
        }),
      );
    } else {
      run(
        `y-${from}`,
        animate(out.y, how === "up" ? -distances.step : distances.step, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      run(
        `o-${from}`,
        animate(out.o, 0, { duration: durations.fast, ease: easings.exit }),
      );
    }
    into.y.jump(how === "down" ? -distances.step : distances.step);
    // The outgoing label is mostly gone before this one arrives.
    const arrive = how === "lift" ? delay : delay + 0.06;
    run(`y-${to}`, animate(into.y, 0, { ...springs.snap, delay: arrive }));
    run(
      `o-${to}`,
      animate(into.o, 1, {
        duration: durations.base,
        ease: easings.enter,
        delay: arrive,
      }),
    );
  };

  /** The rocket stands back up in its pad, rising a step from below. */
  const restore = (delay = 0) => {
    aloft.current = false;
    run("tilt", animate(tilt, 0, motionSafe ? springs.snap : { duration: 0 }));
    flameOpacity.jump(0);
    flameScale.jump(0);
    if (!motionSafe) {
      rocketY.jump(0);
      run(
        "rocketOpacity",
        animate(rocketOpacity, 1, { duration: durations.base, delay }),
      );
      return;
    }
    rocketY.jump(distances.step * g.s);
    rocketOpacity.jump(0);
    run("rocketY", animate(rocketY, 0, { ...springs.glide, delay }));
    run(
      "rocketOpacity",
      animate(rocketOpacity, 1, {
        duration: durations.base,
        ease: easings.enter,
        delay,
      }),
    );
  };

  const stowFlag = () => {
    if (flagOpacity.get() <= 0.01) return;
    if (motionSafe) {
      run(
        "flagY",
        animate(flagY, -g.height * 0.5, {
          duration: durations.base,
          ease: easings.exit,
        }),
      );
    }
    run(
      "flagOpacity",
      animate(flagOpacity, 0, {
        duration: durations.base * 0.6,
        ease: easings.exit,
      }),
    );
  };

  /** Lift-off: the rocket leaves through the roof and the exhaust rolls out. */
  const liftoff = () => {
    aloft.current = true;
    if (tilt.get() !== 0) {
      run(
        "tilt",
        animate(tilt, 0, motionSafe ? springs.flick : { duration: 0 }),
      );
    }
    chirp("whoosh", lerp(0.8, 1.3, power), 0.6);
    const flight = r2(lerp(0.62, 0.3, power));
    liftEnd.current = performance.now() + (flight + 0.1) * 1000;
    run(
      "ringOn",
      animate(ringOn, 0, { duration: durations.base, ease: easings.exit }),
    );
    run(
      "lineOpacity",
      animate(lineOpacity, 1, {
        duration: durations.base,
        ease: easings.enter,
        delay: motionSafe ? flight : 0,
      }),
    );
    line.jump(0);
    if (!motionSafe) {
      run(
        "rocketOpacity",
        animate(rocketOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      return;
    }
    // Anticipation, then the climb: position goes with the square of time,
    // which is what the exit ease is.
    run(
      "squat",
      animate(squat, [1, 0.86, 1.06, 1], {
        duration: 0.32,
        times: [0, 0.25, 0.55, 1],
        ease: "easeOut",
      }),
    );
    run(
      "rocketY",
      animate(rocketY, -climb, {
        duration: flight,
        ease: easings.exit,
        delay: 0.08,
      }),
    );
    run(
      "flameScale",
      animate(flameScale, r2(0.7 + 0.8 * power), {
        duration: durations.fast,
        ease: easings.enter,
        delay: 0.04,
      }),
    );
    run(
      "flameOpacity",
      animate(flameOpacity, 1, { duration: durations.blink, delay: 0.04 }),
    );
    ex.jump(0);
    run(
      "ex",
      animate(ex, 1, {
        duration: flight + 0.8,
        ease: "linear",
        delay: 0.06,
        onComplete: () => ex.jump(0),
      }),
    );
    streak.jump(0);
    run(
      "streak",
      animate(streak, g.height * 0.55, {
        duration: flight,
        ease: easings.exit,
        delay: 0.14,
      }),
    );
    run(
      "streakOpacity",
      animate(streakOpacity, [0, 0.5, 0], {
        duration: flight + 0.35,
        times: [0, 0.4, 1],
        ease: "easeOut",
        delay: 0.14,
      }),
    );
  };

  /** The flag lands in the empty pad. */
  const land = () => {
    const wait = Math.max(0, liftEnd.current - performance.now()) / 1000;
    run(
      "line",
      animate(
        line,
        1,
        motionSafe
          ? { ...springs.glide, delay: wait }
          : { duration: durations.base, ease: easings.enter },
      ),
    );
    run(
      "lineOpacity",
      animate(lineOpacity, 0, {
        duration: durations.base,
        ease: easings.exit,
        delay: wait + 0.35,
      }),
    );
    run(
      "rocketOpacity",
      animate(rocketOpacity, 0, { duration: durations.fast, delay: wait }),
    );
    if (!motionSafe) {
      flagY.jump(0);
      cloth.jump(1);
      run(
        "flagOpacity",
        animate(flagOpacity, 1, { duration: durations.base, delay: wait }),
      );
      return;
    }
    flagY.jump(-g.height * 0.6);
    cloth.jump(0);
    run(
      "flagOpacity",
      animate(flagOpacity, 1, { duration: durations.blink, delay: wait }),
    );
    run("flagY", animate(flagY, 0, { ...springs.recoil, delay: wait }));
    run("cloth", animate(cloth, 1, { ...springs.snap, delay: wait + 0.06 }));
    later(Math.round((wait + 0.1) * 1000), () => chirp("chime", 1, 0.5));
  };

  /** The rocket falls back nose-down and the button shakes its head. */
  const crash = () => {
    const wait = aloft.current
      ? Math.max(0, liftEnd.current - performance.now()) / 1000
      : 0;
    const wasAloft = aloft.current;
    aloft.current = false;
    run(
      "lineOpacity",
      animate(lineOpacity, 0, { duration: durations.base, ease: easings.exit }),
    );
    run(
      "ringOn",
      animate(ringOn, 0, { duration: durations.base, ease: easings.exit }),
    );
    flameOpacity.jump(0);
    if (!motionSafe) {
      rocketY.jump(0);
      tilt.jump(140);
      run(
        "rocketOpacity",
        animate(rocketOpacity, 1, { duration: durations.base, delay: wait }),
      );
      later(Math.round(wait * 1000), () => chirp("buzz", 1, 0.45));
      return;
    }
    if (wasAloft) {
      rocketY.jump(-climb);
      tilt.jump(180);
    }
    run(
      "rocketOpacity",
      animate(rocketOpacity, 1, { duration: durations.fast, delay: wait }),
    );
    run("rocketY", animate(rocketY, 0, { ...springs.glide, delay: wait }));
    run("tilt", animate(tilt, 140, { ...springs.glide, delay: wait }));
    // A refusal needs three swings inside half a second, faster than any
    // calibrated spring, so this one is stiff and lightly damped (ζ≈0.18)
    // and set going by a kick sized to `shake` rather than pulled aside.
    const hit = wait + (wasAloft ? 0.22 : 0);
    if (amplitude > 0) {
      run(
        "shake",
        animate(shakeX, 0, {
          type: "spring",
          stiffness: 1600,
          damping: 14,
          mass: 1,
          velocity: amplitude * 52,
          delay: hit,
        }),
      );
    }
    later(Math.round(hit * 1000), () => chirp("buzz", 1, 0.45));
  };

  const enter = (to: LaunchPadState, from: LaunchPadState) => {
    switch (to) {
      case "countdown": {
        const fresh = performance.now() - pressedAt.current < 1000;
        if (!fresh || deadline.current === null) {
          // Set going by the host, not by a press here: a run of its own.
          seq.current += 1;
          deadline.current = performance.now() + seconds * 1000;
        }
        clock.jump(seconds);
        digitY.jump(-Math.max(1, seconds) * lineHeight);
        setDigit(Math.max(1, seconds));
        run(
          "ringOn",
          animate(ringOn, 1, { duration: durations.fast, ease: easings.enter }),
        );
        if (from === "error") {
          run(
            "tilt",
            animate(tilt, 0, motionSafe ? springs.snap : { duration: 0 }),
          );
        }
        if (from === "success" || aloft.current) {
          stowFlag();
          restore();
        }
        swap(to, from, "up");
        setSaid(
          `Launching in ${seconds} ${seconds === 1 ? "second" : "seconds"}. Press again to abort.`,
        );
        return;
      }
      case "pending": {
        deadline.current = null;
        const flight = r2(lerp(0.62, 0.3, power));
        const lifting = !aloft.current;
        if (lifting) liftoff();
        swap(
          to,
          from,
          lifting ? "lift" : "up",
          // In once the lifted label is gone: the two never overlap.
          motionSafe ? 0.14 + flight * 0.85 : 0,
          flight,
        );
        setSaid(`${pendingLabel}.`);
        return;
      }
      case "success": {
        deadline.current = null;
        const flight = r2(lerp(0.62, 0.3, power));
        const lifting = !aloft.current;
        if (lifting) liftoff();
        land();
        const wait = Math.max(0, liftEnd.current - performance.now()) / 1000;
        swap(to, from, lifting ? "lift" : "up", motionSafe ? wait : 0, flight);
        setSaid(`${live.replace(/ · /g, ", ")}.`);
        return;
      }
      case "error": {
        deadline.current = null;
        crash();
        swap(to, from, "down");
        return;
      }
      case "idle": {
        deadline.current = null;
        if (from === "countdown") {
          // Called off: the segments fill back up and fade to the track.
          run(
            "clock",
            animate(
              clock,
              seconds,
              motionSafe ? springs.snap : { duration: 0 },
            ),
          );
          run(
            "ringOn",
            animate(ringOn, 0, {
              duration: durations.base,
              ease: easings.exit,
              delay: motionSafe ? 0.12 : 0,
            }),
          );
          chirp("tick", 0.7, 0.4);
          swap(to, from, "down");
          setSaid("Launch aborted.");
        } else {
          stowFlag();
          run(
            "lineOpacity",
            animate(lineOpacity, 0, { duration: durations.fast }),
          );
          if (from === "error" && !aloft.current) {
            run(
              "tilt",
              animate(tilt, 0, motionSafe ? springs.snap : { duration: 0 }),
            );
          } else {
            restore(motionSafe ? 0.12 : 0);
          }
          swap(to, from, "up", motionSafe ? 0.08 : 0);
          setSaid("");
        }
        armed.current = false;
        return;
      }
    }
  };

  const launch = () => {
    const ticket = ++runs.current;
    setFailure(null);
    let result: unknown;
    try {
      result = onLaunch?.();
    } catch (error) {
      setFailure(messageOf(error));
      move("pending");
      move("error", error);
      return;
    }
    move("pending");
    if (isThenable(result)) {
      result.then(
        () => api.current?.landed(ticket),
        (error: unknown) => api.current?.crashed(ticket, error),
      );
    } else {
      move("success");
    }
  };

  const runClock = () => {
    if (deadline.current === null) {
      deadline.current = performance.now() + seconds * 1000;
    }
    let remaining = Math.max(0, (deadline.current - performance.now()) / 1000);
    clock.jump(Math.min(seconds, remaining));
    let shownDigit = Math.max(1, Math.ceil(remaining - 1e-6));
    const onUpdate = (v: number) => {
      const d = Math.max(1, Math.ceil(v - 1e-6));
      if (d === shownDigit) return;
      shownDigit = d;
      setDigit(d);
      run(
        "digit",
        animate(
          digitY,
          -d * lineHeight,
          motionSafe ? springs.snap : { duration: 0 },
        ),
      );
      chirp("tick", semitones(seconds - d), 0.5);
    };
    const controls = animate(clock, 0, {
      duration: remaining,
      ease: "linear",
      onUpdate,
      onComplete: () => api.current?.zero(),
    });
    // A countdown is an abort window: it waits while the page is hidden
    // instead of launching behind the visitor's back.
    const onVisibility = () => {
      if (document.hidden) {
        controls.pause();
        remaining = clock.get();
      } else {
        deadline.current = performance.now() + remaining * 1000;
        controls.play();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controls.stop();
    };
  };

  const zero = () => {
    if (zeroFor.current === seq.current) return;
    zeroFor.current = seq.current;
    launch();
  };

  const estimate = () => {
    // An honest estimate: it approaches 92% exponentially, paced so a
    // typical deploy is most of the way there at `eta`, and never claims
    // the finish, which belongs to the promise.
    const from = line.get();
    const target = 0.92;
    if (from >= target) return () => {};
    const tau = Math.max(0.2, eta / 1000 / 2);
    const k = 1 - Math.exp(-5);
    const controls = animate(line, target, {
      duration: 5 * tau * ((target - from) / target),
      ease: (t: number) => (1 - Math.exp(-5 * t)) / k,
    });
    return () => controls.stop();
  };

  const landed = (ticket: number) => {
    if (ticket !== runs.current || !mounted.current) return;
    move("success");
  };

  const crashed = (ticket: number, error: unknown) => {
    if (ticket !== runs.current || !mounted.current) return;
    setFailure(messageOf(error));
    move("error", error);
  };

  const reset = () => move("idle");

  React.useEffect(() => {
    api.current = {
      enter,
      runClock,
      zero,
      estimate,
      landed,
      crashed,
      reset,
    };
  });

  // Every change of state, however it came — a press, the host, the promise
  // — gets the same choreography, from where the pad actually is.
  React.useEffect(() => {
    const from = shown.current;
    if (from === current) return;
    shown.current = current;
    api.current?.enter(current, from);
  }, [current]);

  const errorText = failure ?? errorLabel;
  // The error is spoken from the state that shows it, once the host has
  // answered with it and its text is known.
  const spoken =
    current === "error"
      ? `Launch failed: ${errorText.replace(/[.!?]+$/, "")}. Press to retry.`
      : said;

  // Phase-long work restarts cleanly when an effect re-runs, from the
  // deadline and values it left behind.
  React.useEffect(() => {
    if (current !== "countdown") return;
    return api.current?.runClock();
  }, [current]);

  const estimating = current === "pending" && progress === undefined;
  React.useEffect(() => {
    if (!estimating) return;
    return api.current?.estimate();
  }, [estimating]);

  React.useEffect(() => {
    if (progress === undefined || current !== "pending") return;
    const controls = animate(
      line,
      clamp01(progress),
      motionSafe ? springs.glide : { duration: durations.fast },
    );
    return () => controls.stop();
  }, [progress, current, line, motionSafe]);

  // Holds count only while the page is visible.
  const hold =
    current === "success" ? successHold : current === "error" ? errorHold : 0;
  React.useEffect(() => {
    if (hold <= 0) return;
    let left = hold + Math.max(0, liftEnd.current - performance.now());
    let started = performance.now();
    let id = 0;
    const start = () => {
      started = performance.now();
      id = window.setTimeout(() => api.current?.reset(), left);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(id);
        left = Math.max(0, left - (performance.now() - started));
      } else {
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hold, current]);

  React.useEffect(() => {
    mounted.current = true;
    const running = anims.current;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      for (const c of running.values()) c.stop();
      running.clear();
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const arm = () => {
    armed.current = true;
    seq.current += 1;
    setFailure(null);
    if (seconds === 0) {
      launch();
      return;
    }
    pressedAt.current = performance.now();
    deadline.current = pressedAt.current + seconds * 1000;
    chirp("tick", 1, 0.5);
    move("countdown");
  };

  const abort = () => {
    seq.current += 1;
    runs.current += 1;
    onAbort?.();
    move("idle");
  };

  const busy = current === "pending" || current === "success";

  const onClick = () => {
    if (disabled) return;
    if (current === "countdown") abort();
    else if (current === "idle" || current === "error") arm();
  };

  const ringPath = useTransform(clock, (t) => {
    if (seconds === 0) return "";
    const c = box / 2;
    const span = 360 / seconds;
    const gap = seconds > 1 ? 7 : 0;
    const elapsed = seconds - t;
    const parts: string[] = [];
    for (let i = 0; i < seconds; i += 1) {
      const a0 = i * span + gap;
      const a1 = (i + 1) * span - gap;
      const drained = clamp01(elapsed - i);
      const d = arc(c, g.ring, a0 + (a1 - a0) * drained, a1);
      if (d) parts.push(d);
    }
    return parts.join(" ");
  });

  // The rocket idles on the pad: a seeded sub-pixel tremor from the
  // countdown clock, stronger with thrust, and none at rest.
  const tremor = useTransform(
    [clock, ringOn] as MotionValue<number>[],
    ([t = 0, on = 0]: number[]) =>
      motionSafe
        ? r2(
            (Math.sin(t * 71) * 0.45 + Math.sin(t * 133) * 0.3) *
              on *
              (0.4 + power),
          )
        : 0,
  );
  const lift = useTransform(
    [rocketY, hover] as MotionValue<number>[],
    ([y = 0, h = 0]: number[]) => r2(y + h),
  );
  const stretch = useTransform(squat, (k) => r2(2 - k));
  const lineClip = useTransform(
    line,
    (p) => `inset(0 ${r2(100 - clamp01(p) * 100)}% 0 0 round 1px)`,
  );

  const face =
    current === "success"
      ? "oklch(from var(--success) 0.58 c h)"
      : current === "error"
        ? "oklch(from var(--danger) 0.56 c h)"
        : accent;
  const accessibleName =
    current === "countdown"
      ? `${abortLabel}, launching in ${digit}`
      : current === "pending"
        ? pendingLabel
        : current === "success"
          ? live.replace(/ · /g, ", ")
          : current === "error"
            ? `${retryLabel}: ${errorText}`
            : label;

  const s = g.s;
  const labelCell = "col-start-1 row-start-1 whitespace-nowrap";

  return (
    <span
      className={cn(
        "relative inline-flex max-w-full shrink-0 align-middle",
        className,
      )}
    >
      <motion.button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={accessibleName}
        aria-disabled={busy || undefined}
        aria-busy={current === "pending" || undefined}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Escape" && current === "countdown") {
            event.preventDefault();
            abort();
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || !motionSafe) return;
          if (current === "idle" || current === "error") {
            run("hover", animate(hover, -1.5 * s, springs.flick));
          }
        }}
        onPointerLeave={() => {
          run("hover", animate(hover, 0, springs.flick));
          run("press", animate(press, 1, springs.snap));
        }}
        onPointerDown={(event) => {
          if (disabled || busy || !motionSafe) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          run("press", animate(press, 0.98, springs.flick));
        }}
        onPointerUp={() => run("press", animate(press, 1, springs.snap))}
        onPointerCancel={() => run("press", animate(press, 1, springs.snap))}
        className={cn(
          "group/launch-pad relative inline-flex max-w-full touch-manipulation items-center overflow-clip rounded-full font-medium text-primary-foreground outline-none select-none",
          "transition-[background-color] duration-300",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed opacity-50"
            : busy
              ? "cursor-default"
              : "cursor-pointer",
        )}
        style={{
          height: g.height,
          paddingLeft: g.height + 2,
          paddingRight: g.tail,
          fontSize: g.font,
          lineHeight: `${lineHeight}px`,
          backgroundColor: face,
          x: shakeX,
          scale: press,
        }}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-current opacity-0 transition-opacity",
            !disabled && !busy && "group-hover/launch-pad:opacity-[0.07]",
          )}
        />

        {/* The pad: its track, the countdown's segments, the rocket, the flag. */}
        <svg
          aria-hidden
          width={box}
          height={box}
          viewBox={`0 0 ${box} ${box}`}
          className="pointer-events-none absolute"
          style={{ left: pad - box / 2, top: pad - box / 2 }}
        >
          <circle
            cx={box / 2}
            cy={box / 2}
            r={g.ring}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.24}
            strokeWidth={2}
          />
          <motion.path
            d={ringPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            style={{ opacity: ringOn }}
          />
        </svg>

        {/* Turns about its middle, squats onto its base. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: r2(pad - 7 * s),
            top: r2(pad - 8.5 * s),
            width: r2(14 * s),
            height: r2(17 * s),
            x: tremor,
            y: lift,
            rotate: tilt,
            opacity: rocketOpacity,
          }}
        >
          <motion.span
            className="absolute inset-0"
            style={{ scaleY: squat, scaleX: stretch, originY: 1 }}
          >
            <motion.span
              className="absolute left-1/2 rounded-b-full"
              style={{
                top: r2(15.2 * s),
                width: r2(5 * s),
                marginLeft: r2(-2.5 * s),
                height: r2(13 * s),
                background: `linear-gradient(to bottom, ${flame}, transparent)`,
                scaleY: flameScale,
                opacity: flameOpacity,
                originY: 0,
              }}
            />
            <svg
              width={r2(14 * s)}
              height={r2(17 * s)}
              viewBox="0 0 14 17"
              className="absolute inset-0"
            >
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M7 0.5C9.8 2.6 11 5.4 11 8.6V14H3V8.6C3 5.4 4.2 2.6 7 0.5ZM7 5.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2Z"
              />
              <path
                fill="currentColor"
                d="M3 9.8L0.8 13.4V15.8L3 14.4ZM11 9.8L13.2 13.4V15.8L11 14.4ZM5.2 14.4H8.8V15.6H5.2Z"
              />
            </svg>
          </motion.span>
        </motion.span>

        <motion.span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: r2(pad - 2 * s),
            top: r2(pad - 9 * s),
            width: r2(12 * s),
            height: r2(18 * s),
            y: flagY,
            opacity: flagOpacity,
          }}
        >
          <svg
            width={r2(12 * s)}
            height={r2(18 * s)}
            viewBox="0 0 12 18"
            className="block"
          >
            <path
              d="M1.5 1V17.2"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <motion.path
              d="M2.2 1.4H11L9 4.3L11 7.2H2.2Z"
              fill="currentColor"
              style={{ scaleX: cloth, originX: 0, originY: 0.5 }}
            />
          </svg>
        </motion.span>

        {motionSafe
          ? Array.from({ length: PUFFS }, (_, i) => (
              <Puff
                key={i}
                index={i}
                ex={ex}
                left={pad}
                top={g.height - 8 * s}
                size={r2(14 * s)}
                reachRight={r2((26 + 46 * power) * s)}
                reachLeft={r2((8 + 6 * power) * s)}
                density={r2(0.32 + 0.3 * power)}
              />
            ))
          : null}

        <span className="relative grid min-w-0">
          {/* Sizers: every label in one cell, so the widest sets the width. */}
          <span aria-hidden className={cn(labelCell, "invisible")}>
            {label}
          </span>
          <span aria-hidden className={cn(labelCell, "invisible")}>
            {abortLabel}
            <span className="px-[0.3em]">·</span>
            <span className="font-mono tabular-nums">0</span>
          </span>
          <span aria-hidden className={cn(labelCell, "invisible")}>
            {pendingLabel}
          </span>
          <span aria-hidden className={cn(labelCell, "invisible")}>
            {live}
          </span>
          <span aria-hidden className={cn(labelCell, "invisible")}>
            {errorLabel} · {retryLabel}
          </span>

          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-1/2 w-[60%] -translate-x-1/2 rounded-full"
            style={{
              top: lineHeight,
              height: streak,
              opacity: streakOpacity,
              background:
                "linear-gradient(to bottom, color-mix(in oklab, currentColor 45%, transparent), transparent)",
            }}
          />

          {STATES.map((key) => {
            const v = labels[key];
            return (
              <motion.span
                key={key}
                aria-hidden
                className={cn(
                  labelCell,
                  "flex w-0 min-w-full items-center justify-center",
                )}
                style={{ opacity: v.o, y: v.y }}
              >
                {key === "idle" ? (
                  label
                ) : key === "countdown" ? (
                  <>
                    {abortLabel}
                    <span className="px-[0.3em]">·</span>
                    <span
                      className="inline-block overflow-clip font-mono tabular-nums"
                      style={{ height: lineHeight }}
                    >
                      <motion.span
                        className="flex flex-col"
                        style={{ y: digitY }}
                      >
                        {Array.from({ length: 10 }, (_, d) => (
                          <span key={d} style={{ height: lineHeight }}>
                            {d}
                          </span>
                        ))}
                      </motion.span>
                    </span>
                  </>
                ) : key === "pending" ? (
                  pendingLabel
                ) : key === "success" ? (
                  live
                ) : (
                  <>
                    <span className="min-w-0 truncate" title={errorText}>
                      {errorText}
                    </span>
                    <span className="shrink-0 whitespace-pre">
                      {" "}
                      · {retryLabel}
                    </span>
                  </>
                )}
              </motion.span>
            );
          })}
        </span>

        {/* The progress line along the bottom lip: a track only in flight. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute h-0.5 rounded-full bg-current/25"
          style={{
            left: g.height + 2,
            right: pad,
            bottom: Math.round(4 * s),
            opacity: lineOpacity,
          }}
        >
          <motion.span
            className="absolute inset-0 rounded-full bg-current"
            style={{ clipPath: lineClip }}
          />
        </motion.span>
      </motion.button>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </span>
  );
}
