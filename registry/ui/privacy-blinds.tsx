"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PrivacyBlindsSize = "sm" | "md" | "lg";

export type PrivacyBlindsProps = {
  /** Controlled state: true is Private, the blinds shut. */
  pressed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the press that changed it, with the new state. */
  onPressedChange?: (pressed: boolean) => void;
  /** The word shown while open. @default "Public" */
  publicLabel?: string;
  /** The word shown while shut. @default "Private" */
  privateLabel?: string;
  /** The button's accessible name, the same in both states — `aria-pressed` carries the state. @default privateLabel */
  label?: string;
  /** Icon only; the accessible name stays. @default false */
  compact?: boolean;
  /** How many slats hang in the window, 3 to 8. @default 5 */
  slats?: number;
  /** The open slats' angle in degrees: 0 is edge-on and all daylight, 45 is half shut. @default 15 */
  tilt?: number;
  /** How far hovering tips the slats, in degrees: open a crack when private, toward shut when public. @default 14 */
  peek?: number;
  /** Strength of the light, 0 to 1: the daylight bands on the face, the sweep when it opens, the last sliver as it shuts. @default 0.6 */
  beam?: number;
  /** Time between one slat and the next, in ms; long blinds tighten it so the whole fall stays under 600ms. @default 45 */
  stagger?: number;
  /** Form a padlock out of the bottom rail while private. @default true */
  lock?: boolean;
  /** @default "md" */
  size?: PrivacyBlindsSize;
  /** Daylight colour, any CSS colour. @default a warm pigment taken from `--warn` */
  light?: string;
  /** Slat colour, any CSS colour. @default "var(--ink-2)" */
  shade?: string;
  /** Padlock colour, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the slats, the lock and the beam. Off unless asked for. @default false */
  sound?: boolean;
  /** Greys the toggle out and ignores presses and hover. @default false */
  disabled?: boolean;
  /** Extra classes for the button. */
  className?: string;
};

/** Slat angles are motion values made once, so the count can change freely. */
const MAX_SLATS = 8;

/** The window, in the icon's 24 × 24 frame. */
const PANE = { x: 4.25, y: 6, w: 15.5, h: 11.75 };
const RAIL = { x: 4.25, y: 18.25, w: 15.5, h: 1.6, rx: 0.8 };
const BODY = { x: 8.4, y: 13.9, w: 7.2, h: 5.6, rx: 1.3 };
const SHACKLE = "M 10.1 14.2 V 12.4 A 1.9 1.9 0 0 1 13.9 12.4 V 14.2";

const SIZES: Record<
  PrivacyBlindsSize,
  { icon: number; pill: string; round: string }
> = {
  sm: { icon: 20, pill: "h-8 gap-1.5 pr-3 pl-2 text-xs", round: "size-8" },
  md: { icon: 24, pill: "h-9 gap-2 pr-3.5 pl-2.5 text-sm", round: "size-9" },
  lg: { icon: 28, pill: "h-11 gap-2.5 pr-4 pl-3 text-base", round: "size-11" },
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sinDeg = (deg: number) => Math.sin((deg * Math.PI) / 180);

/**
 * How much of its pitch a slat covers at an angle. Edge-on it is a thin line;
 * face-on it covers a little more than its pitch, so shut slats overlap the
 * way real ones do and no light gets between them.
 */
const cover = (deg: number) => Math.max(0.05, 0.2 + 0.88 * sinDeg(deg));

/** The daylight that gets between a slat and the next, as a share of the pitch. */
const daylight = (deg: number) => clamp(1 - cover(deg), 0, 1);

function Slat({
  angle,
  index,
  count,
}: {
  angle: MotionValue<number>;
  index: number;
  count: number;
}) {
  const pitch = PANE.h / count;
  const centre = PANE.y + pitch * (index + 0.5);
  const height = useTransform(angle, (a) => r3(pitch * cover(a)));
  const y = useTransform(height, (h) => r3(centre - h / 2));
  // The lip under each slat is what makes shut blinds read as banded.
  const lipY = useTransform(height, (h) => r3(centre + h / 2 - 0.4));
  const lip = useTransform(angle, (a) => r3(clamp(sinDeg(a), 0, 1) ** 2));
  return (
    <>
      <motion.rect
        x={PANE.x}
        width={PANE.w}
        y={y}
        height={height}
        rx={0.35}
        style={{ fill: "var(--privacy-blinds-shade)" }}
      />
      <motion.rect
        x={PANE.x}
        width={PANE.w}
        y={lipY}
        height={0.4}
        style={{
          fill: "color-mix(in oklab, var(--privacy-blinds-shade) 55%, black)",
          opacity: lip,
        }}
      />
    </>
  );
}

function Band({
  angle,
  index,
  count,
}: {
  angle: MotionValue<number>;
  index: number;
  count: number;
}) {
  const scaleY = useTransform(angle, (a) => r3(daylight(a)));
  return (
    <span
      className="absolute inset-x-0"
      style={{
        top: `${r3((index / count) * 100)}%`,
        height: `${r3(100 / count)}%`,
      }}
    >
      <motion.span
        className="block size-full bg-linear-to-b from-transparent via-(--privacy-blinds-light) to-transparent"
        style={{ scaleY }}
      />
    </span>
  );
}

type Armed = { to: boolean; at: number };

type Api = {
  transition: (to: boolean, voiced: boolean) => void;
  rest: () => void;
};

const MASK =
  "linear-gradient(to right, black 0%, black 55%, rgb(0 0 0 / 0.3) 100%)";

/**
 * A Public / Private toggle drawn as a window with venetian blinds. Going
 * private, the slats tilt shut from the top down, each on its own snap so it
 * seats with one small overshoot; the face darkens with the room, the bands of
 * daylight the window throws across the button thin out one by one, a last
 * sliver of light stripes the label and goes out, and the bottom rail folds up
 * into a padlock whose shackle rises out of it. Going public, the lock lets go
 * first, the slats open from the bottom up, and a soft beam sweeps the face.
 * Hovering peeks the slats a few degrees.
 *
 * Every slat is drawn from its angle each frame — its height is the slat's
 * projection, so shut slats overlap — and the lock is the rail's own rect
 * morphing, not a second shape faded in. It is a real toggle button: Space
 * and Enter press it, `aria-pressed` carries the state under one constant
 * name. Under reduced motion the slats turn together on a short tween, the
 * lock fades in at its final shape and nothing sweeps: the window still shuts.
 */
export function PrivacyBlinds({
  pressed,
  defaultPressed = false,
  onPressedChange,
  publicLabel = "Public",
  privateLabel = "Private",
  label,
  compact = false,
  slats = 5,
  tilt = 15,
  peek = 14,
  beam = 0.6,
  stagger = 45,
  lock = true,
  size = "md",
  light,
  shade,
  accent,
  sound = false,
  disabled = false,
  className,
}: PrivacyBlindsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const geometry = SIZES[size] ?? SIZES.md;
  const count = Math.round(clamp(slats, 3, MAX_SLATS));
  const openAngle = clamp(tilt, 0, 60);
  const peekAngle = clamp(peek, 0, 40);
  const strength = clamp(beam, 0, 1);

  const [own, setOwn] = React.useState(defaultPressed);
  const isOn = pressed ?? own;

  const [angles] = React.useState(() =>
    Array.from({ length: MAX_SLATS }, () => motionValue(isOn ? 90 : openAngle)),
  );
  const locked = isOn && lock ? 1 : 0;
  const lockShape = useMotionValue(locked);
  const shackle = useMotionValue(locked);
  const lockFade = useMotionValue(1);
  const dim = useMotionValue(isOn ? 1 : 0);
  const sweep = useMotionValue(0);
  const sliver = useMotionValue(0);
  const squeeze = useMotionValue(1);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  /** The pointer is over the button and may peek. */
  const hovered = React.useRef(false);
  /** A press just happened under the pointer: no peek until it leaves. */
  const quiet = React.useRef(false);
  /** Until when the last transition's choreography owns the slats. */
  const busyUntil = React.useRef(0);
  const armed = React.useRef<Armed | null>(null);
  const shown = React.useRef(isOn);
  const api = React.useRef<Api | null>(null);

  const restAngle = (on: boolean) => {
    const peeking = hovered.current && !quiet.current;
    return on
      ? 90 - (peeking ? peekAngle : 0)
      : openAngle + (peeking ? peekAngle * 0.5 : 0);
  };

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };
  const halt = () => {
    for (const c of running.current.values()) c.stop();
    running.current.clear();
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.length = 0;
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.round(ms)));
  };
  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.height / 2, null) : 0;
  };
  const ease = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };

  /** Back to the resting pose for the current state, hover and settings. */
  const rest = () => {
    if (performance.now() < busyUntil.current) return;
    const target = restAngle(shown.current);
    angles.forEach((a, i) => {
      if (Math.abs(a.get() - target) < 0.01) return;
      run(`slat${i}`, animate(a, target, ease));
    });
    const lockTo = shown.current && lock ? 1 : 0;
    if (lockShape.get() !== lockTo) lockShape.jump(lockTo);
    if (shackle.get() !== lockTo) shackle.jump(lockTo);
  };

  const transition = (to: boolean, voiced: boolean) => {
    halt();
    const target = restAngle(to);
    const lockTo = to && lock ? 1 : 0;
    const where = pan();
    if (!motionSafe) {
      busyUntil.current = 0;
      const tween = { duration: durations.fast, ease: easings.enter };
      angles.forEach((a, i) => run(`slat${i}`, animate(a, target, tween)));
      run("dim", animate(dim, to ? 1 : 0, tween));
      sliver.jump(0);
      sweep.jump(0);
      lockShape.jump(lockTo);
      shackle.jump(lockTo);
      if (lockTo) {
        lockFade.jump(0);
        run("lockFade", animate(lockFade, 1, tween));
      }
      if (voiced) {
        audio.play(to ? "click" : "swish", { gain: 0.4, pan: where });
      }
      return;
    }
    lockFade.jump(1);
    const gap = Math.min(Math.max(0, stagger) / 1000, cascade(count));
    const last = (count - 1) * gap;
    if (to) {
      busyUntil.current = performance.now() + (last + 0.5) * 1000;
      // Top to bottom: slat i starts i gaps after the first.
      angles.forEach((a, i) => {
        const order = Math.min(i, count - 1);
        run(
          `slat${i}`,
          animate(a, target, { ...springs.snap, delay: order * gap }),
        );
      });
      run(
        "dim",
        animate(dim, 1, { duration: durations.slow, ease: easings.enter }),
      );
      sweep.jump(0);
      sliver.jump(1);
      run(
        "sliver",
        animate(sliver, 0, {
          duration: durations.base,
          ease: easings.exit,
          delay: last + 0.12,
        }),
      );
      if (lockTo) {
        run(
          "lockShape",
          animate(lockShape, 1, { ...springs.snap, delay: last + 0.12 }),
        );
        run(
          "shackle",
          animate(shackle, 1, { ...springs.snap, delay: last + 0.2 }),
        );
      }
      if (voiced) {
        audio.play("swish", { pitch: 0.85, gain: 0.35, pan: where });
        for (let i = 0; i < count; i += 1) {
          later((i * gap + 0.09) * 1000, () =>
            audio.play("click", {
              pitch: r3(lerp(1.3, 0.9, i / Math.max(1, count - 1))),
              gain: 0.16,
              pan: where,
            }),
          );
        }
        if (lockTo) {
          later((last + 0.29) * 1000, () =>
            audio.play("click", { pitch: 0.75, gain: 0.5, pan: where }),
          );
        }
      }
    } else {
      // The lock lets go first, then the slats open from the bottom up.
      const start = lock ? 0.1 : 0;
      busyUntil.current = performance.now() + (start + last + 0.5) * 1000;
      run(
        "shackle",
        animate(shackle, 0, { duration: durations.fast, ease: easings.exit }),
      );
      run("lockShape", animate(lockShape, 0, { ...springs.snap, delay: 0.05 }));
      angles.forEach((a, i) => {
        const order = Math.max(0, count - 1 - Math.min(i, count - 1));
        run(
          `slat${i}`,
          animate(a, target, { ...springs.snap, delay: start + order * gap }),
        );
      });
      run(
        "dim",
        animate(dim, 0, { duration: durations.slow, ease: easings.enter }),
      );
      sliver.jump(0);
      sweep.jump(0);
      // Light has no mass: the beam is a tween, not a spring.
      run(
        "sweep",
        animate(sweep, 1, {
          duration: durations.page,
          ease: easings.move,
          delay: start + 0.04,
        }),
      );
      if (voiced) {
        if (lock) audio.play("click", { pitch: 1.1, gain: 0.4, pan: where });
        later((start + 0.04) * 1000, () =>
          audio.play("swish", { pitch: 1.25, gain: 0.4, pan: where }),
        );
      }
    }
    // A pointer that came or went while the blinds were moving gets its
    // pose once they have finished.
    later(busyUntil.current - performance.now() + 20, () =>
      api.current?.rest(),
    );
  };

  React.useEffect(() => {
    api.current = { transition, rest };
  });

  // Whoever changed the state — a press, or a host — the blinds follow. Only
  // a change the visitor asked for is heard.
  React.useEffect(() => {
    if (shown.current === isOn) return;
    shown.current = isOn;
    const ask = armed.current;
    armed.current = null;
    const voiced =
      !!ask && ask.to === isOn && performance.now() - ask.at < 1500;
    api.current?.transition(isOn, voiced);
  }, [isOn]);

  // A new angle, count or lock setting re-poses the blinds where they are.
  React.useEffect(() => {
    api.current?.rest();
  }, [openAngle, peekAngle, count, lock, motionSafe]);

  React.useEffect(() => {
    const anims = running.current;
    const pending = timers.current;
    return () => {
      for (const c of anims.values()) c.stop();
      anims.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const press = () => {
    if (disabled) return;
    const next = !isOn;
    armed.current = { to: next, at: performance.now() };
    // The pointer that pressed is still over the button: the new state shows
    // as it is, not peeked, until the pointer leaves.
    if (hovered.current) quiet.current = true;
    if (pressed === undefined) setOwn(next);
    onPressedChange?.(next);
  };

  const hover = (on: boolean) => {
    if (hovered.current === on) return;
    hovered.current = on;
    if (!on) quiet.current = false;
    if (disabled) return;
    rest();
  };

  const squeezeTo = (to: number) => {
    if (!motionSafe) return;
    run("squeeze", animate(squeeze, to, to < 1 ? springs.flick : springs.snap));
  };

  const face = useTransform(
    dim,
    (d) =>
      `color-mix(in oklab, var(--card) ${r3(100 - 7 * clamp(d, 0, 1))}%, black)`,
  );
  const sweepX = useTransform(sweep, (s) => `${r3(lerp(-140, 260, s))}%`);
  const sweepOpacity = useTransform(sweep, (s) =>
    s <= 0 || s >= 1 ? 0 : r3(strength * 0.9 * Math.sin(Math.PI * s)),
  );
  // The last light: as thick as the bottom slat's gap, as bright as `beam`.
  const lastAngle = angles[count - 1] ?? angles[0];
  const sliverScale = useTransform(lastAngle as MotionValue<number>, (a) =>
    r3(daylight(a)),
  );
  const sliverOpacity = useTransform(sliver, (s) => r3(s * strength));

  const lx = useTransform(lockShape, (l) => r3(lerp(RAIL.x, BODY.x, l)));
  const ly = useTransform(lockShape, (l) => r3(lerp(RAIL.y, BODY.y, l)));
  const lw = useTransform(lockShape, (l) => r3(lerp(RAIL.w, BODY.w, l)));
  const lh = useTransform(lockShape, (l) => r3(lerp(RAIL.h, BODY.h, l)));
  const lrx = useTransform(lockShape, (l) => r3(lerp(RAIL.rx, BODY.rx, l)));
  const lockFill = useTransform(
    lockShape,
    (l) =>
      `color-mix(in oklab, var(--privacy-blinds-accent) ${Math.round(clamp(l, 0, 1) * 100)}%, var(--privacy-blinds-shade))`,
  );
  const halo = useTransform(lockShape, (l) => r3(1.4 * clamp(l, 0, 1)));
  const keyhole = useTransform(lockShape, (l) =>
    r3(clamp((l - 0.6) / 0.4, 0, 1)),
  );
  const shackleY = useTransform(shackle, (s) => r3(3 * (1 - s)));
  const shackleOpacity = useTransform(
    [shackle, lockFade] as MotionValue<number>[],
    ([s = 0, f = 1]: number[]) => r3(clamp(s * 3, 0, 1) * f),
  );

  const name = label ?? privateLabel;
  const style = {
    "--privacy-blinds-face": face,
    "--privacy-blinds-light": light ?? "oklch(from var(--warn) 0.84 0.13 h)",
    "--privacy-blinds-shade": shade ?? "var(--ink-2)",
    "--privacy-blinds-accent": accent ?? "var(--accent-bright)",
    scale: squeeze,
  } as unknown as React.ComponentProps<typeof motion.button>["style"];

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      aria-pressed={isOn}
      aria-label={name}
      disabled={disabled}
      onClick={press}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") hover(true);
      }}
      onPointerLeave={(event) => {
        squeezeTo(1);
        if (event.pointerType === "mouse") hover(false);
      }}
      onPointerDown={(event) => {
        if (disabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        squeezeTo(0.97);
      }}
      onPointerUp={() => squeezeTo(1)}
      onPointerCancel={() => squeezeTo(1)}
      style={style}
      className={cn(
        "group/privacy-blinds relative isolate inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-hairline-strong bg-(--privacy-blinds-face) font-medium text-foreground outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        "disabled:cursor-not-allowed disabled:opacity-50",
        compact ? geometry.round : geometry.pill,
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-clip rounded-full [contain:paint]"
      >
        <span
          className="absolute inset-0"
          style={{
            maskImage: MASK,
            WebkitMaskImage: MASK,
            opacity: r3(strength * 0.4),
          }}
        >
          {angles.slice(0, count).map((angle, i) => (
            <Band key={i} angle={angle} index={i} count={count} />
          ))}
        </span>
        <span
          className="absolute inset-x-0 top-1/2 h-1/2 -translate-y-1/2"
          style={{ maskImage: MASK, WebkitMaskImage: MASK }}
        >
          <motion.span
            className="block size-full bg-linear-to-b from-transparent via-(--privacy-blinds-light) to-transparent"
            style={{ scaleY: sliverScale, opacity: sliverOpacity }}
          />
        </span>
        <motion.span
          className="absolute -inset-y-1/2 left-0 w-1/2 -skew-x-[20deg] bg-linear-to-r from-transparent via-(--privacy-blinds-light) to-transparent"
          style={{ x: sweepX, opacity: sweepOpacity }}
        />
        <span className="absolute inset-0 bg-foreground opacity-0 transition-opacity duration-150 group-enabled/privacy-blinds:group-hover/privacy-blinds:opacity-[0.04]" />
      </span>

      <svg
        aria-hidden
        width={geometry.icon}
        height={geometry.icon}
        viewBox="0 0 24 24"
        className="block shrink-0 text-ink-2"
      >
        <rect
          x={PANE.x}
          y={PANE.y}
          width={PANE.w}
          height={PANE.h}
          style={{
            fill: "var(--privacy-blinds-light)",
            opacity: r3(0.2 + 0.45 * strength),
          }}
        />
        {[7.5, 16.5].map((x) => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1={PANE.y}
            y2={RAIL.y}
            strokeWidth={0.35}
            style={{ stroke: "var(--privacy-blinds-shade)", opacity: 0.5 }}
          />
        ))}
        {angles.slice(0, count).map((angle, i) => (
          <Slat key={i} angle={angle} index={i} count={count} />
        ))}
        <rect
          x={4.25}
          y={4.25}
          width={15.5}
          height={1.75}
          rx={0.6}
          style={{ fill: "var(--privacy-blinds-shade)" }}
        />
        <rect
          x={2.75}
          y={2.75}
          width={18.5}
          height={18.5}
          rx={3.25}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        {lock ? (
          <motion.g style={{ y: shackleY, opacity: shackleOpacity }}>
            <path
              d={SHACKLE}
              fill="none"
              strokeWidth={3.1}
              strokeLinecap="round"
              style={{ stroke: "var(--privacy-blinds-face)" }}
            />
            <path
              d={SHACKLE}
              fill="none"
              strokeWidth={1.35}
              strokeLinecap="round"
              style={{ stroke: "var(--privacy-blinds-accent)" }}
            />
          </motion.g>
        ) : null}
        <motion.g style={{ opacity: lockFade }}>
          <motion.rect
            x={lx}
            y={ly}
            width={lw}
            height={lh}
            rx={lrx}
            strokeWidth={halo}
            style={{
              fill: lockFill,
              stroke: "var(--privacy-blinds-face)",
              paintOrder: "stroke",
            }}
          />
          <motion.g style={{ opacity: keyhole }}>
            <circle
              cx={12}
              cy={16.3}
              r={0.8}
              style={{ fill: "var(--privacy-blinds-face)" }}
            />
            <rect
              x={11.6}
              y={16.3}
              width={0.8}
              height={1.5}
              rx={0.3}
              style={{ fill: "var(--privacy-blinds-face)" }}
            />
          </motion.g>
        </motion.g>
      </svg>

      {compact ? null : (
        <span aria-hidden className="grid">
          {[false, true].map((state) => {
            const current = isOn === state;
            // Private arrives from above, with the blinds; Public from below.
            const away = motionSafe
              ? state
                ? -distances.nudge
                : distances.nudge
              : 0;
            return (
              <motion.span
                key={String(state)}
                initial={false}
                animate={{ opacity: current ? 1 : 0, y: current ? 0 : away }}
                transition={
                  !motionSafe
                    ? { duration: durations.fast }
                    : current
                      ? {
                          ...springs.snap,
                          opacity: { duration: durations.base },
                        }
                      : exitFor(durations.base)
                }
                className="col-start-1 row-start-1 text-left whitespace-nowrap"
              >
                {state ? privateLabel : publicLabel}
              </motion.span>
            );
          })}
        </span>
      )}
    </motion.button>
  );
}
