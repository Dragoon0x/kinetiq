"use client";

import * as React from "react";

import { SendHorizontal } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SlingshotSize = "sm" | "md" | "lg";

export type SlingshotProps = {
  /** The button's text and accessible name. @default "Launch" */
  label?: string;
  /** The text while launched; both share one cell, so the width never changes. @default label */
  launchedLabel?: string;
  /** The projectile: what flies out of the button. @default a horizontal paper plane */
  icon?: React.ReactNode;
  /** Controlled: the shot is out (the icon sits in the target until this turns false). */
  launched?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultLaunched?: boolean;
  /** Fires from the release or key that launched, and from the reload, with the new state. */
  onLaunchedChange?: (launched: boolean) => void;
  /** Fires once per launch, at the moment of release. */
  onLaunch?: () => void;
  /** Uncontrolled: how long the icon stays out before the slingshot reloads, in ms. 0 keeps it out. @default 1400 */
  resetAfter?: number;
  /** The band's stiffness, 0 to 1: thicker at rest, harder past the draw, faster to fire. @default 0.5 */
  tension?: number;
  /** The longest draw, in px; past it the band rubber-bands. Narrow boxes shorten it. @default 72 */
  pull?: number;
  /** How far the icon flies to its target, in px, clamped to the room ahead. @default 140 */
  distance?: number;
  /** The share of the full draw that arms a launch, 0 to 1; a shorter pull springs back. @default 0.35 */
  threshold?: number;
  /** How far a shot can be angled up or down by pulling the other way, in degrees. 0 locks it level. @default 14 */
  aim?: number;
  /** The projectile, the aim line and the target. Any CSS colour. @default "var(--accent-bright)" */
  color?: string;
  /** The band at rest. Any CSS colour. @default "var(--ink-3)" */
  bandColor?: string;
  /** The band at full stretch, mixed in as it is drawn. Any CSS colour. @default "var(--warn)" */
  tautColor?: string;
  /** @default "md" */
  size?: SlingshotSize;
  /** Play the band's twang and the shot's whoosh. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Dims = {
  /** The rig's height. */
  box: number;
  /** The button's height. */
  h: number;
  pad: number;
  icon: number;
  text: string;
};

const SIZES: Record<SlingshotSize, Dims> = {
  sm: { box: 112, h: 32, pad: 12, icon: 14, text: "text-xs" },
  md: { box: 132, h: 40, pad: 16, icon: 16, text: "text-sm" },
  lg: { box: 152, h: 48, pad: 20, icon: 18, text: "text-base" },
};

type Measure = { w: number; bw: number; lane: number };

type Rig = {
  box: number;
  cy: number;
  h: number;
  maxPull: number;
  restLeft: number;
  /** The button's back cap: its centre at rest and the band's radius round it. */
  capX: number;
  capR: number;
  pegX: number;
  pegDy: number;
  /** Where the icon sits in the button at rest; NaN until measured. */
  iconX: number;
  /** The projectile's diameter and the target ring's radius. */
  puck: number;
  ringR: number;
  flight: number;
  aimMax: number;
  laneWant: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** The landing overshoots by about this share of the flight. */
const OVERSHOOT = 0.18;

function rigOf(
  d: Dims,
  pull: number,
  distance: number,
  aim: number,
  m: Measure | null,
): Rig {
  const want = Math.max(16, pull);
  // A narrow box shortens the draw so the lane ahead keeps more than half
  // of the free width; measured only after mount, so the server's frame is
  // the full draw.
  const maxPull = m
    ? Math.min(want, Math.max(16, Math.floor((m.w - m.bw) * 0.42)))
    : want;
  // Room behind the rest point for the full draw plus its rubber band.
  const restLeft = Math.round(maxPull * 1.25 + 10);
  const cy = d.box / 2;
  const puck = d.icon + 12;
  const ringR = puck / 2 + 4;
  const reach = Math.max(24, distance);
  const laneWant = Math.ceil(
    reach * (1 + OVERSHOOT) + ringR + 4 - d.pad - d.icon / 2,
  );
  const ahead = m ? d.pad + d.icon / 2 + m.lane : Infinity;
  const flight = Math.max(
    8,
    Math.min(reach, (ahead - ringR - 4) / (1 + OVERSHOOT)),
  );
  const room = cy - ringR - 4;
  const aimMax = Math.min(
    (Math.max(0, aim) * Math.PI) / 180,
    Math.asin(clamp01(room / (flight * (1 + OVERSHOOT)))),
  );
  return {
    box: d.box,
    cy,
    h: d.h,
    maxPull,
    restLeft,
    capX: restLeft + d.h / 2,
    capR: d.h / 2 + 1.5,
    pegX: restLeft + d.h / 2 + Math.round(d.h * 0.12),
    pegDy: d.h / 2 + Math.round(d.h * 0.55),
    iconX: m ? restLeft + m.bw - d.pad - d.icon / 2 : Number.NaN,
    puck,
    ringR,
    flight,
    aimMax,
    laneWant,
  };
}

/**
 * Where a band leaving a peg touches the cap round its back: of the two
 * tangent points from the peg to the circle, the one further left.
 */
function tangent(px: number, py: number, cx: number, cy: number, r: number) {
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d <= r + 0.5) return null;
  const phi = Math.atan2(dy, dx);
  const beta = Math.acos(r / d);
  const a =
    Math.cos(phi + beta) < Math.cos(phi - beta) ? phi + beta : phi - beta;
  return { a, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** The two strands and the pouch for the button at offset (x, y). */
function bandOf(rig: Rig, x: number, y: number) {
  const cx = rig.capX + x;
  const cy = rig.cy + y;
  const topY = rig.cy - rig.pegDy;
  const botY = rig.cy + rig.pegDy;
  const t = tangent(rig.pegX, topY, cx, cy, rig.capR);
  const b = tangent(rig.pegX, botY, cx, cy, rig.capR);
  const P = (px: number, py: number) => `${r2(px)} ${r2(py)}`;
  if (!t || !b) {
    const line = `M ${P(rig.pegX, topY)} L ${P(rig.pegX, botY)}`;
    return { band: line, pouch: "" };
  }
  // From the top tangent round the back to the bottom one: decreasing
  // angle, so counter-clockwise on screen.
  const travel = (((t.a - b.a) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const large = travel > Math.PI ? 1 : 0;
  const R = r2(rig.capR);
  const arc = `A ${R} ${R} 0 ${large} 0 ${P(b.x, b.y)}`;
  return {
    band: `M ${P(rig.pegX, topY)} L ${P(t.x, t.y)} ${arc} L ${P(rig.pegX, botY)}`,
    pouch: `M ${P(t.x, t.y)} ${arc}`,
  };
}

/** The shot's angle for a draw: opposite the pull, held inside the aim. */
const angleOf = (rig: Rig, x: number, y: number) =>
  -x < 4 ? 0 : clamp(Math.atan2(-y, -x), -rig.aimMax, rig.aimMax);

type Phase = "idle" | "drawing" | "firing" | "flying" | "landed";

type Api = {
  onMove: () => void;
  landed: () => void;
  detach: (quiet?: boolean) => void;
  reload: () => void;
  cancel: () => void;
};

/**
 * An action button you launch like a slingshot. The button rests in an
 * elastic band strung between two pegs; pull it back and the band stretches
 * with it — two strands that wrap the button's back in a pouch, thinning
 * and warming as they go, while a faint aim line reaches forward to the
 * target. Past `threshold` the target ring pops and the shot is armed; let
 * go and the band fires the button home on a stiff, underdamped spring that
 * carries the release velocity, and the frame it passes its rest point the
 * icon leaves it, flies `distance` px along the aim line, overshoots the
 * target and settles into it with two small bounces. A short pull just
 * springs back on springs.snap.
 *
 * It is a real button. Enter launches with a full draw; Space held draws
 * progressively and fires on release; Escape cancels a draw. Launched, it
 * stays focusable but `aria-disabled` until it reloads. Under reduced motion
 * the drag still follows the hand, but nothing springs or flies: the icon
 * fades out of the button and into the target.
 */
export function Slingshot({
  label = "Launch",
  launchedLabel,
  icon,
  launched,
  defaultLaunched = false,
  onLaunchedChange,
  onLaunch,
  resetAfter = 1400,
  tension = 0.5,
  pull = 72,
  distance = 140,
  threshold = 0.35,
  aim = 14,
  color = "var(--accent-bright)",
  bandColor = "var(--ink-3)",
  tautColor = "var(--warn)",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: SlingshotProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const d = SIZES[size] ?? SIZES.md;
  const tn = clamp01(tension);
  const arm = clamp(threshold, 0.05, 1);
  const outLabel = launchedLabel ?? label;

  const [own, setOwn] = React.useState(defaultLaunched);
  const isLaunched = launched ?? own;
  const [fired, setFired] = React.useState(false);
  const [measure, setMeasure] = React.useState<Measure | null>(null);
  const rig = rigOf(d, pull, distance, aim, measure);

  const bx = useMotionValue(0);
  const by = useMotionValue(0);
  const rest = bandOf(rig, 0, 0);
  const restWidth = r2(lerp(1.6, 2.8, tn));
  const bandD = useMotionValue(rest.band);
  const pouchD = useMotionValue(rest.pouch);
  const strand = useMotionValue(restWidth);
  const bandTint = useMotionValue(bandColor);
  const aimD = useMotionValue("");
  const aimOpacity = useMotionValue(0);
  const ringX = useMotionValue(0);
  const ringY = useMotionValue(0);
  const ringR = useMotionValue(0);
  const ringOpacity = useMotionValue(0);
  const ringFill = useMotionValue(0);
  const flight = useMotionValue(0);
  const puckX = useMotionValue(0);
  const puckY = useMotionValue(0);
  const puckRot = useMotionValue(0);
  const puckScale = useMotionValue(1);
  const puckOpacity = useMotionValue(0);
  const homeOpacity = useMotionValue(defaultLaunched ? 0 : 1);
  const homeScale = useMotionValue(1);
  const homeRot = useMotionValue(0);

  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const laneRef = React.useRef<HTMLSpanElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const phase = React.useRef<Phase>(defaultLaunched ? "landed" : "idle");
  const armed = React.useRef(false);
  const keyDraw = React.useRef(false);
  const dragBase = React.useRef({ x: 0, y: 0 });
  /** The shot's angle and target, frozen at release. */
  const shot = React.useRef({ angle: 0, x: 0, y: 0, sx: 0, sy: 0, s: 0 });
  const latest = React.useRef({ rig, isLaunched, motionSafe });
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** The target for an angle, in the row's coordinates. */
  const targetOf = (g: Rig, angle: number) => ({
    x: r2(g.iconX + g.flight * Math.cos(angle)),
    y: r2(g.cy + g.flight * Math.sin(angle)),
  });

  /** Redraws the band and, while drawing, the aim, for the button's place. */
  const draw = () => {
    const g = latest.current.rig;
    const x = bx.get();
    const y = by.get();
    const band = bandOf(g, x, y);
    bandD.set(band.band);
    pouchD.set(band.pouch);
    const s = clamp01(-x / g.maxPull);
    strand.set(r2(lerp(lerp(1.6, 2.8, tn), 1.1, s)));
    bandTint.set(
      `color-mix(in oklab, ${tautColor} ${Math.round(s * 100)}%, ${bandColor})`,
    );
    if (phase.current !== "drawing" || !Number.isFinite(g.iconX)) return;
    const angle = angleOf(g, x, y);
    const t = targetOf(g, angle);
    homeRot.set(r2((angle * 180) / Math.PI));
    aimD.set(`M ${r2(g.iconX + x)} ${r2(g.cy + y)} L ${t.x} ${t.y}`);
    ringX.set(t.x);
    ringY.set(t.y);
    const faint = clamp01(s / arm) * 0.35;
    aimOpacity.set(r2(armed.current ? 0.7 : faint));
    if (!armed.current) ringOpacity.set(r2(faint * 1.6));
    if (!armed.current && s >= arm) {
      armed.current = true;
      run(
        "ringR",
        animate(
          ringR,
          g.ringR,
          motionSafe ? springs.snap : { duration: durations.fast },
        ),
      );
      run("ringO", animate(ringOpacity, 1, { duration: durations.fast }));
    } else if (armed.current && s < arm) {
      armed.current = false;
      run(
        "ringR",
        animate(ringR, r2(g.ringR * 0.6), {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
    }
  };

  const fadeAim = () => {
    run(
      "aimO",
      animate(aimOpacity, 0, { duration: durations.base, ease: easings.exit }),
    );
    if (!armed.current) {
      run(
        "ringO",
        animate(ringOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
    }
  };

  /** Back to rest without a shot. */
  const settleHome = (vx = 0, vy = 0, quiet = false) => {
    const s = clamp01(-bx.get() / latest.current.rig.maxPull);
    phase.current = "idle";
    keyDraw.current = false;
    armed.current = false;
    if (!quiet && s > 0.1) {
      audio.play("twang", {
        pitch: r2(lerp(0.6, 0.85, tn)),
        gain: 0.2,
        pan: pan(),
      });
    }
    const home = motionSafe
      ? { ...springs.snap }
      : { duration: durations.fast, ease: easings.enter };
    run("bx", animate(bx, 0, motionSafe ? { ...home, velocity: vx } : home));
    run("by", animate(by, 0, motionSafe ? { ...home, velocity: vy } : home));
    run("homeRot", animate(homeRot, 0, motionSafe ? springs.snap : home));
    fadeAim();
    run(
      "ringR",
      animate(ringR, 0, { duration: durations.fast, ease: easings.exit }),
    );
  };

  const setLaunchedState = (next: boolean) => {
    if (launched === undefined) setOwn(next);
    onLaunchedChange?.(next);
  };

  /** The band lets go: the button flies home and, as it passes, the icon leaves. */
  const fire = (vx = 0, vy = 0) => {
    const g = latest.current.rig;
    if (!Number.isFinite(g.iconX)) {
      settleHome(vx, vy, true);
      return;
    }
    const x = bx.get();
    const y = by.get();
    const s = clamp01(-x / g.maxPull);
    const angle = angleOf(g, x, y);
    const t = targetOf(g, angle);
    shot.current = { angle, x: t.x, y: t.y, sx: 0, sy: 0, s };
    keyDraw.current = false;
    armed.current = false;
    phase.current = "firing";
    clearTimers();
    setFired(true);
    setLaunchedState(true);
    onLaunch?.();
    audio.play("twang", {
      pitch: r2(lerp(0.85, 1.35, tn) * lerp(0.92, 1.08, s)),
      gain: r2(lerp(0.35, 0.7, s)),
      pan: pan(),
    });
    ringX.set(t.x);
    ringY.set(t.y);
    run("ringR", animate(ringR, g.ringR, { duration: durations.fast }));
    run("ringO", animate(ringOpacity, 1, { duration: durations.fast }));
    if (!motionSafe) {
      const tween = { duration: durations.fast, ease: easings.enter };
      run("bx", animate(bx, 0, tween));
      run("by", animate(by, 0, tween));
      homeRot.set(0);
      puckX.jump(r2(t.x - g.puck / 2));
      puckY.jump(r2(t.y - g.puck / 2));
      puckRot.jump(0);
      puckScale.jump(1);
      run("homeO", animate(homeOpacity, 0, tween));
      run(
        "puckO",
        animate(puckOpacity, 1, {
          ...tween,
          onComplete: () => api.current?.landed(),
        }),
      );
      phase.current = "flying";
      fadeAim();
      return;
    }
    // The band is stiffer and fires faster with tension; under-damped, so
    // the pouch carries the button past its rest point and back.
    const band = spring(lerp(520, 1500, tn), 0.42);
    run("bx", animate(bx, 0, { ...band, velocity: vx }));
    run("by", animate(by, 0, { ...band, velocity: vy }));
    run("homeRot", animate(homeRot, 0, springs.snap));
    fadeAim();
  };

  /** The frame the button passes its rest point: the icon leaves it. */
  const detach = (quiet = false) => {
    const g = latest.current.rig;
    const sh = shot.current;
    phase.current = "flying";
    const sx = g.iconX + bx.get();
    const sy = g.cy + by.get();
    shot.current = { ...sh, sx, sy };
    homeOpacity.jump(0);
    puckRot.jump(r2((sh.angle * 180) / Math.PI));
    puckX.jump(r2(sx - g.puck / 2));
    puckY.jump(r2(sy - g.puck / 2));
    puckScale.jump(0.62);
    puckOpacity.jump(1);
    flight.jump(0);
    if (!quiet) {
      audio.play("whoosh", {
        pitch: r2(lerp(0.8, 1.3, sh.s)),
        gain: 0.45,
        pan: pan(),
      });
    }
    run("puckScale", animate(puckScale, 1, springs.flick));
    // Two visible bounces into the ring; a harder draw leaves faster.
    run(
      "flight",
      animate(flight, 1, {
        ...spring(lerp(170, 300, tn), 0.55),
        velocity: lerp(3, 8, sh.s),
        onComplete: () => api.current?.landed(),
      }),
    );
  };

  /** In the ring: it flashes, and reloads unless the host keeps it out. */
  const landed = () => {
    const g = latest.current.rig;
    phase.current = "landed";
    if (motionSafe) {
      ringR.jump(r2(g.ringR * 1.3));
      run("ringR", animate(ringR, g.ringR, springs.recoil));
    }
    run(
      "ringFill",
      animate(ringFill, [0, 0.5, 0.18], {
        duration: durations.slow,
        ease: easings.enter,
      }),
    );
    if (!latest.current.isLaunched) {
      // A host that did not take the launch: the shot still lands, then
      // the slingshot reloads.
      timers.current.push(window.setTimeout(() => api.current?.reload(), 420));
      return;
    }
    if (launched === undefined && resetAfter > 0) {
      timers.current.push(
        window.setTimeout(() => {
          setOwn(false);
          onLaunchedChange?.(false);
        }, resetAfter),
      );
    }
  };

  /** A fresh icon pops into the button; the shot and its target fade. */
  const reload = () => {
    phase.current = "idle";
    const exit = { duration: durations.fast, ease: easings.exit };
    run("puckO", animate(puckOpacity, 0, exit));
    run(
      "ringO",
      animate(ringOpacity, 0, { ...exit, duration: durations.base }),
    );
    run("ringFill", animate(ringFill, 0, exit));
    run("aimO", animate(aimOpacity, 0, exit));
    if (motionSafe) {
      homeScale.jump(0.4);
      run("homeScale", animate(homeScale, 1, springs.snap));
    }
    run(
      "homeO",
      animate(homeOpacity, 1, {
        duration: durations.fast,
        ease: easings.enter,
      }),
    );
  };

  /** Enter, or a click from assistive technology: a full draw, then the shot. */
  const drawAndFire = () => {
    if (disabled || isLaunched || phase.current !== "idle") return;
    if (!motionSafe) {
      bx.jump(-latest.current.rig.maxPull);
      fire();
      return;
    }
    phase.current = "drawing";
    run("by", animate(by, 0, springs.glide));
    run(
      "bx",
      animate(bx, -latest.current.rig.maxPull, {
        ...springs.glide,
        onComplete: () => {
          if (phase.current === "drawing" && !keyDraw.current) fire();
        },
      }),
    );
  };

  const nudge = () => {
    if (disabled || isLaunched || phase.current !== "idle") return;
    if (!motionSafe) return;
    // A press with no pull: the band gives a little and the aim flashes,
    // which is the gesture, shown.
    run(
      "bx",
      animate(bx, -12, {
        ...springs.flick,
        onComplete: () => run("bx", animate(bx, 0, springs.snap)),
      }),
    );
    aimOpacity.set(0.3);
    ringOpacity.set(0.3);
    ringR.set(r2(latest.current.rig.ringR * 0.6));
    run(
      "aimO",
      animate(aimOpacity, 0, { duration: durations.slow, ease: easings.exit }),
    );
    run(
      "ringO",
      animate(ringOpacity, 0, { duration: durations.slow, ease: easings.exit }),
    );
  };

  const dragOn = !disabled && !isLaunched;
  const drag = useDrag({
    threshold: 4,
    disabled: !dragOn,
    onStart: () => {
      if (phase.current !== "idle" && phase.current !== "drawing") return;
      for (const key of ["bx", "by", "homeRot"]) halt(key);
      phase.current = "drawing";
      keyDraw.current = false;
      dragBase.current = { x: bx.get(), y: by.get() };
    },
    onMove: ({ offset }) => {
      if (phase.current !== "drawing") return;
      const g = latest.current.rig;
      const rawX = dragBase.current.x + offset.x;
      const rawY = dragBase.current.y + offset.y;
      // 1:1 inside the draw; past it the band resists (harder with
      // tension), never giving more than the 25% the rig leaves room for;
      // forward of rest it barely gives.
      const x =
        rawX > 0
          ? rubberband(rawX, g.h * 0.5)
          : rawX < -g.maxPull
            ? -g.maxPull -
              rubberband(-rawX - g.maxPull, g.maxPull * lerp(0.22, 0.12, tn))
            : rawX;
      // The band holds the button level until it is drawn: the room to aim
      // grows with the pull, up to the aim and the box.
      const yLim = Math.min(
        Math.max(0, g.cy - g.h / 2 - 8),
        Math.max(0, -x) * Math.tan(g.aimMax) + 4,
      );
      const y =
        Math.abs(rawY) > yLim
          ? Math.sign(rawY) * (yLim + rubberband(Math.abs(rawY) - yLim, 8))
          : rawY;
      bx.set(r2(x));
      by.set(r2(y));
    },
    onEnd: ({ velocity }) => {
      if (phase.current !== "drawing") return;
      const s = clamp01(-bx.get() / latest.current.rig.maxPull);
      if (s >= arm) fire(velocity.x, velocity.y);
      else settleHome(velocity.x, velocity.y);
    },
    onCancel: () => {
      if (phase.current === "drawing") settleHome(0, 0, true);
    },
    onTap: () => nudge(),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const key = event.key;
    if (key === "Escape" && phase.current === "drawing") {
      // Handled here, so the stage around it never sees it.
      event.preventDefault();
      settleHome(0, 0, true);
      return;
    }
    if (key !== "Enter" && key !== " ") return;
    event.preventDefault();
    if (event.repeat || disabled || isLaunched) return;
    if (phase.current !== "idle") return;
    if (key === "Enter") {
      drawAndFire();
      return;
    }
    if (!motionSafe) {
      bx.jump(-latest.current.rig.maxPull);
      fire();
      return;
    }
    // Space held draws the band back; letting go decides.
    keyDraw.current = true;
    phase.current = "drawing";
    run("by", animate(by, 0, springs.glide));
    run(
      "bx",
      animate(bx, -latest.current.rig.maxPull, {
        duration: 0.7,
        ease: easings.enter,
      }),
    );
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " ") return;
    event.preventDefault();
    if (!keyDraw.current || phase.current !== "drawing") return;
    keyDraw.current = false;
    const s = clamp01(-bx.get() / latest.current.rig.maxPull);
    if (s >= arm) fire();
    else settleHome();
  };

  React.useEffect(() => {
    latest.current = { rig, isLaunched, motionSafe };
    api.current = {
      onMove: draw,
      landed,
      detach,
      reload,
      cancel: () => {
        if (phase.current === "drawing") settleHome(0, 0, true);
      },
    };
  });

  // The rig's measured parts: the row, the button, and the lane ahead.
  React.useEffect(() => {
    const row = rowRef.current;
    const button = buttonRef.current;
    const lane = laneRef.current;
    if (!row || !button || !lane) return;
    const read = () =>
      setMeasure((prev) => {
        const next = {
          w: row.clientWidth,
          bw: button.offsetWidth,
          lane: lane.offsetWidth,
        };
        return prev &&
          prev.w === next.w &&
          prev.bw === next.bw &&
          prev.lane === next.lane
          ? prev
          : next;
      });
    const sizer = new ResizeObserver(read);
    sizer.observe(row);
    sizer.observe(button);
    sizer.observe(lane);
    return () => sizer.disconnect();
  }, []);

  // Every move of the button redraws the band; the frame it passes its
  // rest point while firing, the icon leaves.
  React.useEffect(() => {
    const onX = (v: number) => {
      api.current?.onMove();
      if (phase.current === "firing" && v >= -0.5) api.current?.detach();
    };
    const offX = bx.on("change", onX);
    const offY = by.on("change", () => api.current?.onMove());
    const offF = flight.on("change", (f) => {
      const g = latest.current.rig;
      const sh = shot.current;
      puckX.set(r2(sh.sx + (sh.x - sh.sx) * f - g.puck / 2));
      puckY.set(r2(sh.sy + (sh.y - sh.sy) * f - g.puck / 2));
    });
    return () => {
      offX();
      offY();
      offF();
    };
  }, [bx, by, flight, puckX, puckY]);

  // A new size, draw or lane: the band and any shot already out move with it.
  const rigKey = `${rig.maxPull}:${rig.capX}:${rig.pegDy}:${rig.iconX}:${rig.flight}:${rig.box}:${tn}:${bandColor}:${tautColor}`;
  React.useEffect(() => {
    api.current?.onMove();
    const g = latest.current.rig;
    if (phase.current === "landed" && Number.isFinite(g.iconX)) {
      const t = targetOf(g, shot.current.angle);
      shot.current = { ...shot.current, x: t.x, y: t.y };
      ringX.set(t.x);
      ringY.set(t.y);
      ringR.set(g.ringR);
      puckX.set(r2(t.x - g.puck / 2));
      puckY.set(r2(t.y - g.puck / 2));
    }
    // Keyed on the geometry, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rigKey]);

  // What the host says. Taken back: reload once the shot has landed. Sent
  // out from rest without a draw: the icon flies anyway, silently.
  const shown = React.useRef(isLaunched);
  React.useEffect(() => {
    if (shown.current === isLaunched) return;
    shown.current = isLaunched;
    const p = phase.current;
    if (!isLaunched) {
      if (p === "landed") api.current?.reload();
      return;
    }
    if (p === "idle" || p === "drawing") {
      const g = latest.current.rig;
      if (!Number.isFinite(g.iconX)) return;
      clearTimers();
      halt("bx");
      halt("by");
      bx.jump(0);
      by.jump(0);
      const t = targetOf(g, 0);
      shot.current = { angle: 0, x: t.x, y: t.y, sx: 0, sy: 0, s: 0.6 };
      ringX.set(t.x);
      ringY.set(t.y);
      run("ringR", animate(ringR, g.ringR, { duration: durations.fast }));
      run("ringO", animate(ringOpacity, 1, { duration: durations.fast }));
      if (motionSafe) {
        detach(true);
      } else {
        homeOpacity.set(0);
        puckX.jump(r2(t.x - g.puck / 2));
        puckY.jump(r2(t.y - g.puck / 2));
        run(
          "puckO",
          animate(puckOpacity, 1, {
            duration: durations.fast,
            onComplete: () => api.current?.landed(),
          }),
        );
      }
    }
    // Answers the host's value only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLaunched]);

  // Mounted already launched: the icon waits in its target once measured.
  const measured = Number.isFinite(rig.iconX);
  React.useEffect(() => {
    const g = latest.current.rig;
    if (!measured || phase.current !== "landed") return;
    const t = targetOf(g, 0);
    shot.current = { angle: 0, x: t.x, y: t.y, sx: 0, sy: 0, s: 0 };
    ringX.set(t.x);
    ringY.set(t.y);
    ringR.set(g.ringR);
    ringOpacity.set(1);
    ringFill.set(0.18);
    puckX.set(r2(t.x - g.puck / 2));
    puckY.set(r2(t.y - g.puck / 2));
    puckOpacity.set(1);
    // Once, when the first measurement lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured]);

  React.useEffect(() => {
    if (disabled) api.current?.cancel();
  }, [disabled]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const hoverLean = (to: number) => {
    if (!motionSafe || disabled || isLaunched) return;
    if (phase.current !== "idle") return;
    run("bx", animate(bx, to, springs.flick));
  };

  const socket = useTransform(homeOpacity, (v) => r2(1 - v));
  const spoken = fired ? (isLaunched ? `${outLabel}.` : "Ready.") : "";

  return (
    <div
      className={cn("relative flex w-full justify-center", className)}
      style={
        { height: rig.box, "--slingshot-color": color } as React.CSSProperties
      }
    >
      <div
        ref={rowRef}
        className="relative flex h-full max-w-full min-w-0 items-center"
      >
        <svg
          aria-hidden
          width="100%"
          height="100%"
          className="pointer-events-none absolute inset-0 block"
        >
          <motion.path
            d={aimD}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray="2 6"
            style={{ stroke: "var(--slingshot-color)", opacity: aimOpacity }}
          />
          <motion.circle
            cx={ringX}
            cy={ringY}
            r={ringR}
            strokeWidth={1.5}
            strokeDasharray="3 4"
            style={{
              stroke: "var(--slingshot-color)",
              fill: "none",
              opacity: ringOpacity,
            }}
          />
          <motion.circle
            cx={ringX}
            cy={ringY}
            r={ringR}
            style={{ fill: "var(--slingshot-color)", opacity: ringFill }}
          />
          {/* The frame, seen from above: two arms from the pegs meet in
              a handle that points at the target, hidden by the button at
              rest and plain the moment it is drawn back. */}
          <path
            d={`M ${rig.pegX} ${rig.cy - rig.pegDy} L ${rig.pegX + rig.h} ${rig.cy} L ${rig.pegX} ${rig.cy + rig.pegDy} M ${rig.pegX + rig.h} ${rig.cy} L ${rig.pegX + Math.round(rig.h * 1.8)} ${rig.cy}`}
            fill="none"
            strokeWidth={Math.round(rig.h * 0.09 * 10) / 10}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-hairline-strong"
          />
          <motion.path
            d={pouchD}
            fill="none"
            strokeWidth={4.5}
            strokeLinecap="round"
            style={{ stroke: bandTint }}
          />
          <motion.path
            d={bandD}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: bandTint, strokeWidth: strand }}
          />
          {[-1, 1].map((side) => (
            <circle
              key={side}
              cx={rig.pegX}
              cy={rig.cy + side * rig.pegDy}
              r={Math.round(d.h * 0.1 * 10) / 10}
              className="fill-surface-2 stroke-ink-3"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        <span
          aria-hidden
          className="block h-px shrink-0"
          style={{ width: rig.restLeft }}
        />
        <motion.button
          ref={buttonRef}
          type="button"
          aria-label={isLaunched ? outLabel : label}
          aria-describedby={hintId}
          aria-disabled={disabled || isLaunched || undefined}
          onClick={(event) => {
            // Pointer presses arrive through the drag's tap; a click with no
            // pointer behind it is assistive technology, and launches.
            if (event.detail === 0) drawAndFire();
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={() => {
            if (keyDraw.current) settleHome(0, 0, true);
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") hoverLean(-3);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") hoverLean(0);
          }}
          {...drag}
          className={cn(
            "relative z-10 inline-flex shrink-0 touch-none items-center rounded-full font-medium whitespace-nowrap outline-none select-none",
            "bg-primary text-primary-foreground shadow-raised",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-not-allowed opacity-50"
              : isLaunched
                ? "cursor-default"
                : "cursor-grab active:cursor-grabbing",
            d.text,
          )}
          style={{
            x: bx,
            y: by,
            height: d.h,
            paddingLeft: d.pad + 2,
            paddingRight: d.pad,
            gap: Math.round(d.pad * 0.6),
          }}
        >
          <span aria-hidden className="grid">
            <span
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-200",
                isLaunched && "opacity-0",
              )}
            >
              {label}
            </span>
            <span
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-200",
                !isLaunched && "opacity-0",
              )}
            >
              {outLabel}
            </span>
          </span>
          <span
            aria-hidden
            className="relative flex shrink-0 items-center justify-center"
            style={{ width: d.icon, height: d.icon }}
          >
            <motion.span
              className="absolute rounded-full border border-dashed border-primary-foreground/45"
              style={{
                inset: -3,
                opacity: socket,
              }}
            />
            <motion.span
              className="flex items-center justify-center [&>svg]:size-full"
              style={{
                width: d.icon,
                height: d.icon,
                opacity: homeOpacity,
                scale: homeScale,
                rotate: homeRot,
              }}
            >
              {icon ?? <SendHorizontal strokeWidth={2.25} />}
            </motion.span>
          </span>
        </motion.button>
        <span
          ref={laneRef}
          aria-hidden
          className="block h-px min-w-0 shrink"
          style={{ width: rig.laneWant }}
        />

        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-20 flex items-center justify-center rounded-full text-primary-foreground [&>svg]:size-[57%]"
          style={{
            width: rig.puck,
            height: rig.puck,
            x: puckX,
            y: puckY,
            rotate: puckRot,
            scale: puckScale,
            opacity: puckOpacity,
            background: "var(--slingshot-color)",
          }}
        >
          {icon ?? <SendHorizontal strokeWidth={2.25} />}
        </motion.span>
      </div>

      <span id={hintId} className="sr-only">
        Pull back and let go to launch, or press Enter.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
