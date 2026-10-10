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
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CometKnobSize = "sm" | "md" | "lg";

/** Pigments that read the same on a light page and a dark one. */
export type CometKnobColor = "cobalt" | "signal" | "ember" | "rose";

export type CometKnobProps = {
  /** Controlled value, `min` to `max`. */
  value?: number;
  /** Initial value when uncontrolled. @default min */
  defaultValue?: number;
  /** Fires from the drag, coast or key that changed it, at every detent it passes. */
  onValueChange?: (value: number) => void;
  /** Fires once the knob comes to rest after a gesture or a key: the value to act on. */
  onValueCommit?: (value: number) => void;
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  /** The resolution when `detents` is 0. @default 1 */
  step?: number;
  /** Notches across the whole range; the knob ticks and settles at each. 0 turns smoothly by `step`. @default 12 */
  detents?: number;
  /** How long the comet's tail is, 0 to 1: the follower's lag, 50 to 320 ms behind the head. @default 0.5 */
  tail?: number;
  /** How quickly a flick coasts to a stop, 0 to 1: a long glide, or a short heavy turn. @default 0.4 */
  friction?: number;
  /** Degrees of travel from the minimum to the maximum, centred on the top. @default 270 */
  sweep?: number;
  /** The slider's accessible name, shown under the reading. */
  label: string;
  /** The reading, and the spoken value. @default the value, rounded */
  format?: (value: number) => string;
  /** The comet's pigment: a preset or any CSS colour. @default "cobalt" */
  color?: CometKnobColor | (string & {});
  /** @default "md" */
  size?: CometKnobSize;
  /** Tick at every detent passed, by hand, coast or key. Off unless asked for. @default false */
  sound?: boolean;
  /** Dims the knob and ignores pointer and keys. @default false */
  disabled?: boolean;
  /** Classes for the slider box. */
  className?: string;
};

const PALETTE: Record<CometKnobColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "oklch(from var(--warn) 0.74 c h)",
  rose: "oklch(from var(--danger) 0.64 c h)",
};

type Metrics = {
  /** The knob's box, px square. */
  box: number;
  /** Track stroke width. */
  track: number;
  /** Head radius. */
  head: number;
  reading: string;
};

const SIZES: Record<CometKnobSize, Metrics> = {
  sm: { box: 120, track: 3, head: 4, reading: "text-base" },
  md: { box: 152, track: 4, head: 5, reading: "text-xl" },
  lg: { box: 184, track: 4.5, head: 6, reading: "text-2xl" },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const RAD = Math.PI / 180;

/** A point at `deg` clockwise from twelve o'clock, rounded so Node and the browser agree. */
const polar = (c: number, r: number, deg: number): [number, number] => [
  r2(c + r * Math.sin(deg * RAD)),
  r2(c - r * Math.cos(deg * RAD)),
];

function arcPath(c: number, r: number, from: number, to: number): string {
  if (to - from < 0.05) return "";
  const [x1, y1] = polar(c, r, from);
  const [x2, y2] = polar(c, r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

type Comet = {
  /** The tapered tail, filled with a gradient along it. */
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0 at rest, 1 at full speed. */
  speed: number;
  /** Detent dots under the tail. */
  lit: string;
  fill: string;
  hx: number;
  hy: number;
};

type Mode = "drag" | "coast" | "key" | "host" | null;

/**
 * A rotary knob that leaves light where it turns. The value is a bright head
 * on a 270° track round a machined face; as the head moves a follower angle
 * chases it, and the arc between the two is drawn as a tapered tail whose
 * gradient, glow and halo brighten with the gap — so the comet is exactly as
 * long and as bright as the knob is fast, and drains into the head when it
 * stops. Detent dots under the tail light as it passes.
 *
 * Drag on the rim to turn it by angle, 1:1 under the finger, or on the face
 * to turn it by distance; past either end it rubber-bands. A flick coasts on
 * motion's inertia generator — started at the hand's own speed, decaying by
 * `friction`, landing on the nearest detent and bouncing once off an end
 * stop — and every detent passed ticks. It is a real `role="slider"`: arrows
 * step a detent on the snap spring (so keys draw a comet too), Page keys a
 * tenth, Home and End jump. Under reduced motion there is no comet and no
 * coast: the head jumps to its detent with a brief halo, and the face still
 * turns, because the angle is the value.
 */
export function CometKnob({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  detents = 12,
  tail = 0.5,
  friction = 0.4,
  sweep = 270,
  label,
  format,
  color = "cobalt",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: CometKnobProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const m = SIZES[size] ?? SIZES.md;
  const paint = (PALETTE as Record<string, string>)[color] ?? color;
  const say = format ?? ((v: number) => String(Math.round(v)));

  const lo = Math.min(min, max);
  const hi = Math.max(min, max, lo + 1e-6);
  const span = hi - lo;
  const notches = Math.max(0, Math.round(detents));
  const unit = notches > 0 ? span / notches : step > 0 ? step : span / 100;
  const arc = Math.min(340, Math.max(60, sweep));
  const a0 = -arc / 2;
  const a1 = arc / 2;
  const tau = lerp(50, 320, clamp01(tail));
  const coastTime = lerp(700, 120, clamp01(friction));

  const c = m.box / 2;
  const rTrack = c - 15;
  const rTick = c - 5;
  const rFace = rTrack - 13;

  const clampV = (v: number) => Math.min(hi, Math.max(lo, v));
  const quantize = (v: number) =>
    clampV(Number((lo + Math.round((v - lo) / unit) * unit).toFixed(6)));
  const toAngle = (v: number) => a0 + (arc * (v - lo)) / span;
  const toValue = (a: number) => lo + (span * (a - a0)) / arc;
  const snapAngle = (a: number) => toAngle(quantize(toValue(a)));

  const [own, setOwn] = React.useState(() => quantize(defaultValue ?? lo));
  const current = clampV(value ?? own);

  const angle = useMotionValue(r3(toAngle(current)));
  const trail = useMotionValue(r3(toAngle(current)));
  const halo = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const haloAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const reported = React.useRef(current);
  const mode = React.useRef<Mode>(null);
  const notch = React.useRef(Math.round((current - lo) / unit));
  const visible = React.useRef(true);
  const follow = React.useRef({ tau, motionSafe, cap: 200 });
  const grip = React.useRef({ rim: false, start: 0, last: 0, turned: 0 });
  const api = React.useRef<{ moved: (a: number) => void } | null>(null);

  const stop = () => {
    running.current?.stop();
    running.current = null;
  };

  const flash = () => {
    haloAnim.current?.stop();
    halo.jump(1);
    haloAnim.current = animate(halo, 0, {
      duration: durations.slow,
      ease: easings.exit,
    });
  };

  const report = (q: number) => {
    reported.current = q;
    if (value === undefined) setOwn(q);
    onValueChange?.(q);
  };

  const panHere = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** Every frame the head moves: detents are counted, heard and reported here. */
  const moved = (a: number) => {
    const v = clampV(toValue(a));
    const k = Math.round((v - lo) / unit);
    if (k === notch.current) return;
    notch.current = k;
    const by = mode.current;
    if (by === null || by === "host") return;
    if (notches > 0) {
      audio.play("detent", {
        pitch: r2(lerp(0.85, 1.3, (v - lo) / span)),
        gain: 0.5,
        pan: panHere(),
      });
    }
    // A key reports its target once, up front; a hand or a coast reports
    // every detent it passes.
    if (by === "key") return;
    const q = quantize(v);
    if (q !== reported.current) report(q);
  };

  React.useEffect(() => {
    api.current = { moved };
    follow.current = { tau, motionSafe, cap: Math.min(arc * 0.8, 220) };
  });

  const finish = () => {
    running.current = null;
    const q = quantize(toValue(angle.get()));
    if (q !== reported.current) report(q);
    mode.current = null;
    onValueCommit?.(q);
  };

  /** A key, a rim tap or a let-go that is not a throw: the head springs to its detent. */
  const settle = (to: number, velocity = 0, by: Mode = "key") => {
    stop();
    mode.current = by;
    const target = r3(Math.min(a1, Math.max(a0, to)));
    if (!motionSafe) {
      angle.set(target);
      flash();
      finish();
      return;
    }
    running.current = animate(angle, target, {
      ...springs.snap,
      velocity,
      onComplete: finish,
    });
  };

  const release = (omega: number) => {
    stop();
    const a = angle.get();
    if (!motionSafe || Math.abs(omega) < 60) {
      settle(
        snapAngle(Math.min(a1, Math.max(a0, a))),
        motionSafe ? omega : 0,
        "drag",
      );
      return;
    }
    mode.current = "coast";
    // Power equal to the time constant (in seconds) makes the coast start at
    // exactly the hand's speed; the end stops catch it with one firm bounce.
    // Two keyframes, not one: motion skips an animation whose keyframes are
    // all the same unless its type is a spring, and inertia reads only the
    // first (the origin) — its target comes from the velocity.
    running.current = animate(angle, [a, a + Math.sign(omega) * 0.01], {
      type: "inertia",
      velocity: omega,
      timeConstant: coastTime,
      power: coastTime / 1000,
      modifyTarget: snapAngle,
      min: a0,
      max: a1,
      bounceStiffness: 520,
      bounceDamping: 26,
      restDelta: 0.05,
      onComplete: finish,
    });
  };

  // The host's value, when it is not this knob's own report coming back.
  React.useEffect(() => {
    if (current === reported.current) return;
    reported.current = current;
    if (mode.current === "drag" || mode.current === "coast") return;
    stop();
    mode.current = "host";
    const target = r3(toAngle(current));
    if (!motionSafe) {
      angle.set(target);
      mode.current = null;
      return;
    }
    running.current = animate(angle, target, {
      ...springs.glide,
      onComplete: () => {
        running.current = null;
        mode.current = null;
      },
    });
    // The host's value is the only input here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // A new range, sweep or step count re-seats the head where the value is.
  React.useEffect(() => {
    if (mode.current) return;
    const v = reported.current;
    notch.current = Math.round((v - lo) / unit);
    angle.jump(r3(a0 + (arc * (v - lo)) / span));
    trail.jump(angle.get());
  }, [lo, span, arc, a0, unit, angle, trail]);

  // The comet's follower: one rAF chain that runs only while the head moves
  // or the tail is still draining, and never off screen.
  React.useEffect(() => {
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = 0;
      const a = angle.get();
      const f = follow.current;
      if (!visible.current || !f.motionSafe || document.hidden) {
        trail.set(a);
        last = 0;
        return;
      }
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      let tr = trail.get();
      tr += (a - tr) * (1 - Math.exp(-dt / f.tau));
      if (a - tr > f.cap) tr = a - f.cap;
      else if (tr - a > f.cap) tr = a + f.cap;
      if (Math.abs(a - tr) < 0.05) {
        trail.set(a);
        last = 0;
        return;
      }
      trail.set(r3(tr));
      raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      api.current?.moved(angle.get());
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const off = angle.on("change", wake);
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [angle, trail]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      visible.current = entries.some((e) => e.isIntersecting);
    });
    io.observe(root);
    return () => io.disconnect();
  }, []);

  React.useEffect(
    () => () => {
      running.current?.stop();
      haloAnim.current?.stop();
    },
    [],
  );

  /** The pointer's angle round the centre, clockwise from twelve, and how far out it is (0 centre, 1 the box's edge). */
  const pointerAt = (x: number, y: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { deg: 0, reach: 0 };
    const dx = x - (rect.left + rect.width / 2);
    const dy = y - (rect.top + rect.height / 2);
    return {
      deg: Math.atan2(dx, -dy) / RAD,
      reach: Math.hypot(dx, dy) / (rect.width / 2 || 1),
    };
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      stop();
      mode.current = "drag";
      const p = pointerAt(point.x, point.y);
      grip.current = {
        rim: p.reach >= rFace / c,
        start: angle.get(),
        last: p.deg,
        turned: 0,
      };
    },
    onMove: ({ offset, point }) => {
      const g = grip.current;
      let raw: number;
      if (g.rim) {
        const p = pointerAt(point.x, point.y);
        let d = p.deg - g.last;
        if (d > 180) d -= 360;
        else if (d < -180) d += 360;
        g.last = p.deg;
        g.turned += d;
        raw = g.start + g.turned;
      } else {
        // Up or right turns it up: about one and a half knobs for the sweep.
        const scale =
          (rootRef.current?.getBoundingClientRect().width ?? m.box) / m.box;
        raw =
          g.start +
          ((offset.x - offset.y) / (scale || 1)) * (arc / (m.box * 1.6));
      }
      angle.set(r3(rubberClamp(raw, a0, a1, 36)));
    },
    onEnd: ({ velocity, point }) => {
      const g = grip.current;
      let omega: number;
      if (g.rim) {
        const p = pointerAt(point.x, point.y);
        const rect = rootRef.current?.getBoundingClientRect();
        const r = Math.max(8, (p.reach * (rect?.width ?? m.box)) / 2);
        // The throw's tangential part, as degrees a second.
        const t = p.deg * RAD;
        omega = (velocity.x * Math.cos(t) + velocity.y * Math.sin(t)) / r / RAD;
      } else {
        const scale =
          (rootRef.current?.getBoundingClientRect().width ?? m.box) / m.box;
        omega =
          ((velocity.x - velocity.y) / (scale || 1)) * (arc / (m.box * 1.6));
      }
      release(Math.max(-2400, Math.min(2400, omega)));
    },
    onCancel: () => settle(snapAngle(angle.get()), 0, "drag"),
    onTap: (event) => {
      rootRef.current?.focus({
        preventScroll: true,
        focusVisible: false,
      } as FocusOptions);
      const p = pointerAt(event.clientX, event.clientY);
      // A tap on the rim sets the knob there; a tap on the face only focuses it.
      if (p.reach < rFace / c) return;
      const to = snapAngle(Math.min(a1, Math.max(a0, p.deg)));
      const q = quantize(toValue(to));
      if (q !== reported.current) report(q);
      settle(to, 0, "key");
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = Math.max(1, Math.round(span / unit / 10));
    const from = reported.current;
    let next: number;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = from + unit;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = from - unit;
        break;
      case "PageUp":
        next = from + big * unit;
        break;
      case "PageDown":
        next = from - big * unit;
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
    const q = quantize(next);
    if (q === from) return;
    report(q);
    settle(r3(toAngle(q)), angle.getVelocity(), "key");
  };

  const comet = useTransform((): Comet => {
    const a = angle.get();
    const t = trail.get();
    const glow = halo.get();
    const shown = Math.min(a1 + 30, Math.max(a0 - 30, a));
    const [hx, hy] = polar(c, rTrack, shown);
    const fill = arcPath(c, rTrack, a0, Math.min(a1, Math.max(a0, shown)));
    const lag = shown - t;
    const len = Math.abs(lag);
    const speed = Math.max(clamp01(len / 50), glow);
    if (len < 0.6) {
      return {
        d: "",
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        speed,
        lit: "",
        fill,
        hx,
        hy,
      };
    }
    // The tail tapers from a point at its end to wider than the track at the
    // head: outer edge out, inner edge back.
    const steps = 18;
    const outer: string[] = [];
    const inner: string[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const deg = t + lag * u;
      const w = (m.track * 1.7 * Math.pow(u, 0.9)) / 2;
      const [ox, oy] = polar(c, rTrack + w, deg);
      const [ix, iy] = polar(c, rTrack - w, deg);
      outer.push(`${ox} ${oy}`);
      inner.unshift(`${ix} ${iy}`);
    }
    const [x1, y1] = polar(c, rTrack, t);
    let lit = "";
    if (notches > 0 && notches <= 48) {
      const loA = Math.min(t, shown);
      const hiA = Math.max(t, shown);
      for (let k = 0; k <= notches; k += 1) {
        const deg = a0 + (arc * k) / notches;
        if (deg < loA || deg > hiA) continue;
        const [x, y] = polar(c, rTick, deg);
        lit += `M ${r2(x - 1.6)} ${y} a 1.6 1.6 0 1 0 3.2 0 a 1.6 1.6 0 1 0 -3.2 0 `;
      }
    }
    return {
      d: `M ${outer.join(" L ")} L ${inner.join(" L ")} Z`,
      x1,
      y1,
      x2: hx,
      y2: hy,
      speed,
      lit,
      fill,
      hx,
      hy,
    };
  });

  const tailD = useTransform(comet, (k) => k.d);
  const gx1 = useTransform(comet, (k) => k.x1);
  const gy1 = useTransform(comet, (k) => k.y1);
  const gx2 = useTransform(comet, (k) => k.x2);
  const gy2 = useTransform(comet, (k) => k.y2);
  const headStop = useTransform(comet, (k) => r2(0.45 + 0.55 * k.speed));
  const glowOpacity = useTransform(comet, (k) => r2(k.speed * 0.75));
  const litD = useTransform(comet, (k) => k.lit);
  const fillD = useTransform(comet, (k) => k.fill);
  const headX = useTransform(comet, (k) => k.hx);
  const headY = useTransform(comet, (k) => k.hy);
  const haloR = useTransform(comet, (k) => r2(m.head * (1.6 + 1.4 * k.speed)));

  const tickCount = notches > 0 && notches <= 48 ? notches : 10;
  const ticks = React.useMemo(() => {
    const out: { deg: number; x: number; y: number }[] = [];
    for (let k = 0; k <= tickCount; k += 1) {
      const deg = a0 + (arc * k) / tickCount;
      const [x, y] = polar(c, rTick, deg);
      out.push({ deg, x, y });
    }
    return out;
  }, [tickCount, a0, arc, c, rTick]);

  const knurl = React.useMemo(() => {
    let d = "";
    for (let k = 0; k < 48; k += 1) {
      const deg = (360 * k) / 48;
      const [x1, y1] = polar(c, rFace - 1.5, deg);
      const [x2, y2] = polar(c, rFace - 5, deg);
      d += `M ${x1} ${y1} L ${x2} ${y2} `;
    }
    return d;
  }, [c, rFace]);

  const [nx1, ny1] = polar(c, rFace * 0.62, 0);
  const [nx2, ny2] = polar(c, rFace * 0.84, 0);
  const reading = say(current);
  const longest = [say(lo), say(hi), reading].reduce((a, b) =>
    b.length > a.length ? b : a,
  );
  const shownAngle = toAngle(current);
  const glowId = `comet-glow-${uid}`;
  const gradId = `comet-grad-${uid}`;
  const faceId = `comet-face-${uid}`;

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={r3(lo)}
      aria-valuemax={r3(hi)}
      aria-valuenow={r3(current)}
      aria-valuetext={reading}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      {...drag}
      onPointerDown={(event) => {
        // A press catches a coasting knob where it is.
        if (!disabled && mode.current === "coast") {
          stop();
          finish();
        }
        drag.onPointerDown(event);
      }}
      className={cn(
        "relative shrink-0 touch-none rounded-full outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
      style={{ width: m.box, height: m.box }}
    >
      <svg
        aria-hidden
        width={m.box}
        height={m.box}
        viewBox={`0 0 ${m.box} ${m.box}`}
        className="block"
        style={{ color: paint }}
      >
        <defs>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={m.track * 0.9} />
          </filter>
          <motion.linearGradient
            id={gradId}
            gradientUnits="userSpaceOnUse"
            x1={gx1}
            y1={gy1}
            x2={gx2}
            y2={gy2}
          >
            <stop offset="0" stopColor="currentColor" stopOpacity={0} />
            <motion.stop
              offset="1"
              stopColor="currentColor"
              style={{ stopOpacity: headStop }}
            />
          </motion.linearGradient>
          <radialGradient id={faceId} cx="38%" cy="30%" r="75%">
            <stop offset="0" stopColor="white" stopOpacity={0.1} />
            <stop offset="1" stopColor="white" stopOpacity={0} />
          </radialGradient>
        </defs>

        {ticks.map((t, k) => (
          <circle
            key={k}
            cx={t.x}
            cy={t.y}
            r={notches > 0 ? 1.2 : 0.9}
            className={t.deg <= shownAngle + 0.01 ? undefined : "fill-ink-3/40"}
            style={
              t.deg <= shownAngle + 0.01
                ? { fill: paint, opacity: 0.7 }
                : undefined
            }
          />
        ))}
        <motion.path
          d={litD}
          fill="currentColor"
          style={{ opacity: glowOpacity }}
        />

        <path
          d={arcPath(c, rTrack, a0, a1)}
          fill="none"
          strokeWidth={m.track}
          strokeLinecap="round"
          className="stroke-ink-3/20"
        />
        <motion.path
          d={fillD}
          fill="none"
          stroke="currentColor"
          strokeWidth={m.track}
          strokeLinecap="round"
          opacity={0.28}
        />

        <motion.path
          d={tailD}
          fill="currentColor"
          filter={`url(#${glowId})`}
          style={{ opacity: glowOpacity }}
        />
        <motion.path d={tailD} fill={`url(#${gradId})`} />

        <motion.circle
          cx={headX}
          cy={headY}
          r={haloR}
          fill="currentColor"
          filter={`url(#${glowId})`}
          style={{ opacity: glowOpacity }}
        />
        <motion.circle cx={headX} cy={headY} r={m.head} fill="currentColor" />
        <motion.circle
          cx={headX}
          cy={headY}
          r={r2(m.head * 0.4)}
          fill="white"
          opacity={0.7}
        />

        <circle
          cx={c}
          cy={c}
          r={rFace}
          className="fill-card stroke-hairline-strong"
          strokeWidth={1}
          style={{
            filter:
              "drop-shadow(0 1px 1.5px color-mix(in oklab, black 22%, transparent))",
          }}
        />
        <circle cx={c} cy={c} r={rFace - 0.5} fill={`url(#${faceId})`} />
        <motion.g style={{ rotate: angle, originX: "50%", originY: "50%" }}>
          <path d={knurl} className="stroke-hairline-strong" strokeWidth={1} />
          <line
            x1={nx1}
            y1={ny1}
            x2={nx2}
            y2={ny2}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </motion.g>
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span
          className={cn(
            "grid font-mono leading-none text-foreground tabular-nums",
            m.reading,
          )}
        >
          <span className="col-start-1 row-start-1 text-center">{reading}</span>
          <span aria-hidden className="invisible col-start-1 row-start-1">
            {longest}
          </span>
        </span>
        <span
          className="max-w-[60%] truncate font-mono text-[9px] tracking-[0.1em] text-ink-3 uppercase"
          title={label}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
