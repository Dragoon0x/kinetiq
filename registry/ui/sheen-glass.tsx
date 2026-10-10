"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { createVelocityTracker } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type SheenGlassBlend = "screen" | "overlay" | "soft-light" | "normal";

export type SheenGlassProps = {
  /** The card under the glass. Untouched and fully interactive. */
  children?: React.ReactNode;
  /** The streak's resting lean off vertical, degrees. @default 24 */
  angle?: number;
  /** Width of the soft streak, px; the bright core is a fifth of it. @default 80 */
  width?: number;
  /** Peak brightness of the glint, 0 to 1. @default 0.6 */
  strength?: number;
  /** How much a fast hand brightens it, 0 to 1. @default 0.6 */
  speedBoost?: number;
  /** How far the direction of travel turns the streak, 0 (never) to 1 (fully perpendicular). @default 0.5 */
  steer?: number;
  /** How loosely the glint trails the hand, 0 (tight) to 1 (lazy). @default 0.35 */
  lag?: number;
  /** The light's colour. @default "white" */
  color?: string;
  /** Brightness of the core against the soft streak, 0 to 1. @default 0.8 */
  core?: number;
  /** The faint second reflection beside the streak, 0 to 1. @default 0.3 */
  ghost?: number;
  /** How much the inner border catches the light, 0 to 1. @default 0.6 */
  edge?: number;
  /** How the light mixes with the card. @default "screen" */
  blend?: SheenGlassBlend;
  /** One sweep across the first time the card comes into view. @default true */
  intro?: boolean;
  /** A sweep every so many ms while on screen; 0 never. @default 0 */
  interval?: number;
  /** Change it to send a sweep across now. */
  sweepKey?: string | number;
  /** No glint at all. @default false */
  disabled?: boolean;
  /** Classes for the card box; its radius is the glass's. */
  className?: string;
} & Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children" | "className" | "color"
>;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A streak is a line: its angle and the angle 180° away are the same. */
const shortest = (from: number, to: number) => {
  const d = ((((to - from) % 180) + 270) % 180) - 90;
  return from + d;
};

/**
 * How tightly the glint follows the hand, between the calibrated springs:
 * flick at 0, glide at 0.5, drift at 1.
 */
function followOf(lag: number) {
  const k = clamp(lag, 0, 1);
  const [a, b, t] =
    k <= 0.5
      ? [springs.flick, springs.glide, k / 0.5]
      : [springs.glide, springs.drift, (k - 0.5) / 0.5];
  return {
    type: "spring" as const,
    stiffness: r2(lerp(a.stiffness, b.stiffness, t)),
    damping: r2(lerp(a.damping, b.damping, t)),
    mass: r2(lerp(a.mass, b.mass, t)),
  };
}

const mixed = (color: string, share: number) =>
  `color-mix(in oklab, ${color} ${Math.round(clamp(share, 0, 1) * 100)}%, transparent)`;

/**
 * A glass glare over a card. A soft streak of light with a brighter core —
 * and a faint ghost beside it, the glass's back face — rides with the hand
 * on a spring tuned by `lag`; it turns toward perpendicular to the way the
 * hand is travelling (a horizontal swipe stands it up, a vertical one lays
 * it down) on the glide spring, always the short way round; and it flares
 * with the hand's speed on the flick spring, sinking back on the drift
 * spring as the hand slows. On leave it keeps going the way the hand went
 * and slides off the edge while it fades on the exit ease. A 1 px inner rim
 * catches the light nearest the streak.
 *
 * Keyboard focus inside the card brings the light to the focused control;
 * leaving slides it off. Nothing runs at rest: no loop, only springs while
 * they settle. Reduced motion: the light rests a third of the way across at
 * the resting angle, and hover and focus brighten it in place.
 */
export function SheenGlass({
  children,
  angle = 24,
  width = 80,
  strength = 0.6,
  speedBoost = 0.6,
  steer = 0.5,
  lag = 0.35,
  color = "white",
  core = 0.8,
  ghost = 0.3,
  edge = 0.6,
  blend = "screen",
  intro = true,
  interval = 0,
  sweepKey,
  disabled = false,
  className,
  ...rest
}: SheenGlassProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const gx = useMotionValue(-Math.max(24, width));
  const gy = useMotionValue(0);
  const rot = useMotionValue(angle);
  const glow = useMotionValue(0);
  const tracker = React.useRef(createVelocityTracker());
  const inside = React.useRef(false);
  const latest = React.useRef({
    angle,
    width,
    strength,
    speedBoost,
    steer,
    lag,
    edge,
    motionSafe,
    disabled,
    size,
  });
  React.useEffect(() => {
    latest.current = {
      angle,
      width,
      strength,
      speedBoost,
      steer,
      lag,
      edge,
      motionSafe,
      disabled,
      size,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const box = root.getBoundingClientRect();
      setSize((s) =>
        s.w === Math.round(box.width) && s.h === Math.round(box.height)
          ? s
          : { w: Math.round(box.width), h: Math.round(box.height) },
      );
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // Reduced motion (and the resting angle) keep the light where it lives:
  // a third of the way across, faint, never travelling.
  React.useEffect(() => {
    if (motionSafe || disabled || size.w === 0) return;
    gx.jump(r2(size.w / 3));
    gy.jump(r2(size.h / 2));
    rot.jump(angle);
    if (!inside.current) glow.jump(r2(clamp(strength, 0, 1) * 0.33));
  }, [motionSafe, disabled, size, angle, strength, gx, gy, rot, glow]);

  React.useEffect(() => {
    if (disabled) glow.jump(0);
  }, [disabled, glow]);

  /** One pass of light across the card, left to right at the resting angle. */
  const sweep = React.useCallback(() => {
    const p = latest.current;
    if (!p.motionSafe || p.disabled || inside.current) return;
    const { w, h } = p.size;
    if (w === 0) return;
    const reach = Math.max(24, p.width);
    rot.jump(p.angle);
    gx.jump(-reach);
    gy.jump(r2(h * 0.3));
    const time = 1.1;
    animate(gx, r2(w + reach), { duration: time, ease: easings.move });
    animate(gy, r2(h * 0.7), { duration: time, ease: easings.move });
    animate(glow, [0, r2(clamp(p.strength, 0, 1) * 0.85), 0], {
      duration: time,
      ease: easings.move,
      times: [0, 0.5, 1],
    });
  }, [gx, gy, glow, rot]);

  // The intro sweep and the interval: only on screen, only in a visible tab.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || !motionSafe || disabled) return;
    if (!intro && interval <= 0) return;
    let introDone = !intro;
    let timer = 0;
    let wait = 0;
    let inView = false;
    const sync = () => {
      const run = inView && !document.hidden;
      if (run && !introDone) {
        introDone = true;
        wait = window.setTimeout(sweep, 320);
      }
      if (run && interval > 0 && timer === 0) {
        timer = window.setInterval(sweep, Math.max(1200, interval));
      } else if (!run && timer !== 0) {
        window.clearInterval(timer);
        timer = 0;
      }
    };
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      sync();
    });
    io.observe(root);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.clearTimeout(wait);
      if (timer !== 0) window.clearInterval(timer);
    };
  }, [intro, interval, motionSafe, disabled, sweep]);

  const lastKey = React.useRef(sweepKey);
  React.useEffect(() => {
    if (lastKey.current === sweepKey) return;
    lastKey.current = sweepKey;
    sweep();
  }, [sweepKey, sweep]);

  const local = (event: { clientX: number; clientY: number }) => {
    const box = rootRef.current?.getBoundingClientRect();
    return box
      ? { x: event.clientX - box.left, y: event.clientY - box.top }
      : { x: 0, y: 0 };
  };

  const base = () => clamp(latest.current.strength, 0, 1) * 0.55;

  const arrive = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = latest.current;
    if (p.disabled) return;
    inside.current = true;
    tracker.current.reset();
    tracker.current.push(event.clientX, event.clientY, event.timeStamp);
    if (!p.motionSafe) {
      animate(glow, r2(clamp(p.strength, 0, 1) * 0.7), {
        duration: durations.base,
        ease: easings.enter,
      });
      return;
    }
    // The light comes in where the hand does, not from wherever it last was.
    const at = local(event);
    if (glow.get() < 0.02) {
      gx.jump(r2(at.x));
      gy.jump(r2(at.y));
      rot.jump(p.angle);
    }
    animate(glow, r2(base()), springs.flick);
  };

  const follow = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = latest.current;
    if (p.disabled || !p.motionSafe) return;
    if (!inside.current) arrive(event);
    tracker.current.push(event.clientX, event.clientY, event.timeStamp);
    const v = tracker.current.velocity();
    const speed = Math.hypot(v.x, v.y);
    const at = local(event);
    const spring = followOf(p.lag);
    animate(gx, r2(at.x), spring);
    animate(gy, r2(at.y), spring);
    if (speed > 60) {
      // Perpendicular to the way the hand travels, blended with the rest
      // angle by `steer` and by how decided the movement is.
      const travel = (Math.atan2(v.y, v.x) * 180) / Math.PI;
      const sure = clamp(speed / 900, 0, 1) * clamp(p.steer, 0, 1);
      const towards = shortest(p.angle, travel);
      const wanted = p.angle + (towards - p.angle) * sure;
      animate(rot, r2(shortest(rot.get(), wanted)), springs.glide);
    }
    const kick =
      base() +
      clamp(p.strength, 0, 1) *
        0.45 *
        clamp(p.speedBoost, 0, 1) *
        clamp(speed / 1400, 0, 1);
    animate(glow, r2(Math.min(1, kick)), {
      ...springs.flick,
      onComplete: () => animate(glow, r2(base()), springs.drift),
    });
  };

  const leave = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = latest.current;
    inside.current = false;
    if (p.disabled) return;
    if (!p.motionSafe) {
      animate(glow, r2(clamp(p.strength, 0, 1) * 0.33), {
        duration: durations.base,
        ease: easings.enter,
      });
      return;
    }
    tracker.current.push(event.clientX, event.clientY, event.timeStamp);
    const v = tracker.current.velocity();
    const speed = Math.hypot(v.x, v.y);
    const at = local(event);
    const { w, h } = p.size;
    // Keep going the way the hand went; a hand that drifted out slowly
    // takes the light straight out through the nearest edge.
    let dx = v.x;
    let dy = v.y;
    if (speed < 120) {
      dx = at.x - w / 2;
      dy = at.y - h / 2;
    }
    const len = Math.max(1, Math.hypot(dx, dy));
    const out = Math.max(24, p.width) + 40;
    animate(gx, r2(at.x + (dx / len) * out), {
      ...springs.glide,
      velocity: v.x,
    });
    animate(gy, r2(at.y + (dy / len) * out), {
      ...springs.glide,
      velocity: v.y,
    });
    animate(glow, 0, { duration: durations.slow, ease: easings.exit });
  };

  const focusIn = (event: React.FocusEvent<HTMLDivElement>) => {
    rest.onFocus?.(event);
    const p = latest.current;
    if (p.disabled || !event.target.matches(":focus-visible")) return;
    if (!p.motionSafe) {
      animate(glow, r2(clamp(p.strength, 0, 1) * 0.7), {
        duration: durations.base,
        ease: easings.enter,
      });
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const r = event.target.getBoundingClientRect();
    const tx = r2(r.left + r.width / 2 - box.left);
    const ty = r2(r.top + r.height / 2 - box.top);
    if (glow.get() < 0.02) {
      gx.jump(tx - Math.max(24, p.width));
      gy.jump(ty);
    }
    rot.jump(shortest(rot.get(), p.angle));
    animate(gx, tx, springs.glide);
    animate(gy, ty, springs.glide);
    animate(rot, r2(shortest(rot.get(), p.angle)), springs.glide);
    animate(glow, r2(base()), springs.flick);
  };

  const focusOut = (event: React.FocusEvent<HTMLDivElement>) => {
    rest.onBlur?.(event);
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    const p = latest.current;
    if (p.disabled || inside.current) return;
    if (!p.motionSafe) {
      animate(glow, r2(clamp(p.strength, 0, 1) * 0.33), {
        duration: durations.base,
        ease: easings.enter,
      });
      return;
    }
    animate(gx, r2(p.size.w + Math.max(24, p.width) + 40), springs.glide);
    animate(glow, 0, { duration: durations.slow, ease: easings.exit });
  };

  const reach = Math.max(24, width);
  const length = Math.max(400, Math.round(Math.hypot(size.w, size.h) * 2));
  const tone = (share: number) => mixed(color, share);
  const rim = useTransform(
    [gx, gy, glow] as MotionValue<number>[],
    ([x, y, g]) =>
      `radial-gradient(${Math.round(reach * 1.6)}px circle at ${r2(x as number)}px ${r2(y as number)}px, ${tone(
        (g as number) * clamp(edge, 0, 1) * 1.2,
      )}, transparent 70%), linear-gradient(${tone(0.1 * clamp(edge, 0, 1))}, ${tone(0.03)})`,
  );

  return (
    <div
      {...rest}
      ref={rootRef}
      onPointerEnter={(event) => {
        rest.onPointerEnter?.(event);
        arrive(event);
      }}
      onPointerMove={(event) => {
        rest.onPointerMove?.(event);
        follow(event);
      }}
      onPointerLeave={(event) => {
        rest.onPointerLeave?.(event);
        leave(event);
      }}
      onPointerCancel={(event) => {
        rest.onPointerCancel?.(event);
        leave(event);
      }}
      onFocus={focusIn}
      onBlur={focusOut}
      className={cn("relative isolate overflow-hidden", className)}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        style={{ mixBlendMode: blend }}
      >
        <motion.div
          className="absolute top-0 left-0 size-0"
          style={{ x: gx, y: gy, rotate: rot, opacity: glow }}
        >
          <div
            className="absolute"
            style={{
              left: -reach / 2,
              top: -length / 2,
              width: reach,
              height: length,
              backgroundImage: `linear-gradient(90deg, transparent, ${tone(0.16)} 28%, ${tone(0.32)} 50%, ${tone(0.16)} 72%, transparent)`,
            }}
          />
          <div
            className="absolute"
            style={{
              left: -Math.round(reach * 0.1),
              top: -length / 2,
              width: Math.max(4, Math.round(reach * 0.2)),
              height: length,
              backgroundImage: `linear-gradient(90deg, transparent, ${tone(clamp(core, 0, 1) * 0.85)} 50%, transparent)`,
            }}
          />
          <div
            className="absolute"
            style={{
              left: Math.round(reach * 0.62),
              top: -length / 2,
              width: Math.max(3, Math.round(reach * 0.14)),
              height: length,
              opacity: clamp(ghost, 0, 1),
              backgroundImage: `linear-gradient(90deg, transparent, ${tone(0.4)} 50%, transparent)`,
            }}
          />
        </motion.div>
      </div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] p-px"
        style={{
          backgroundImage: rim,
          maskImage:
            "linear-gradient(black, black), linear-gradient(black, black)",
          WebkitMaskImage:
            "linear-gradient(black, black), linear-gradient(black, black)",
          maskClip: "content-box, border-box",
          WebkitMaskClip: "content-box, border-box",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
        }}
      />
    </div>
  );
}
