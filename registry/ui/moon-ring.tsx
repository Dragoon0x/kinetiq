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
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MoonRingItem = {
  /** Stable key for the moon. */
  id: string;
  /** Its name: the radio's accessible name and the caption. */
  label: string;
  /** An image for the moon; without one a tile is generated. */
  src?: string;
  /** Kept for an image that carries meaning beyond its label. */
  alt?: string;
};

export type MoonRingReason = "drift" | "drag" | "press" | "key";

export type MoonRingProps = {
  /** The moons. Short of `count`, generated tiles fill the ring. @default generated */
  items?: MoonRingItem[];
  /** How many moons circle, 3 to 12. @default 6 */
  count?: number;
  /** How far the orbit tips toward you, degrees: 0 is edge-on, 70 nearly overhead. @default 20 */
  tilt?: number;
  /** Idle revolution, degrees per second; negative turns the other way, 0 holds still. @default 8 */
  speed?: number;
  /** The moon at the front (controlled). Controlled rings do not drift. */
  value?: number;
  /** The moon at the front to begin with. @default 0 */
  defaultValue?: number;
  /** A new moon reached the front, with what brought it there. */
  onValueChange?: (index: number, reason: MoonRingReason) => void;
  /** The orbit's lean in the picture, degrees. @default -8 */
  lean?: number;
  /** How much smaller the far side is, 0 to 0.8. @default 0.45 */
  depth?: number;
  /** Blur at the far side of the orbit, px. @default 2 */
  soften?: number;
  /** Moon shape. @default "circle" */
  shape?: "circle" | "rounded";
  /** Moon size, px. @default fits the stage */
  moonSize?: number;
  /** Height of the stage. @default "clamp(9rem, 30cqw, 12.5rem)" */
  height?: number | string;
  /** What the moons circle. @default a lit planet */
  center?: React.ReactNode;
  /** Name the front moon under the ring. @default true */
  caption?: boolean;
  /** Accessible name of the ring. @default "Orbit" */
  label?: string;
  /** A whoosh when a throw or a long trip brings a moon round. @default false */
  sound?: boolean;
  /** Hold the idle revolution. @default false */
  paused?: boolean;
  /** No drag, no presses; the moons leave the tab order. @default false */
  disabled?: boolean;
  /** Classes for the root, a size container for the stage. */
  className?: string;
};

const NAMES = [
  "Tide",
  "Ember",
  "Moss",
  "Frost",
  "Dune",
  "Dusk",
  "Fern",
  "Slate",
  "Pearl",
  "Rust",
  "Sage",
  "Ash",
];
/** Each generated moon's pigment: a token's hue at fixed lightness. */
const HUES: [string, number][] = [
  ["--accent", 0],
  ["--warn", -20],
  ["--success", 0],
  ["--accent", -40],
  ["--warn", 10],
  ["--danger", 20],
  ["--success", 30],
  ["--accent", 30],
  ["--warn", 40],
  ["--danger", 0],
  ["--success", -30],
  ["--accent", 60],
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (v: number, n: number) => ((v % n) + n) % n;

/** A tiny hash for crater placement, unsigned all the way. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A generated moon: a lit sphere in a token's pigment with three craters. */
function moonArt(i: number): string {
  const [token, turn] = HUES[i % HUES.length] ?? ["--accent", 0];
  const at = (l: number, c: number) =>
    `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;
  const craters: string[] = [];
  for (let k = 0; k < 3; k += 1) {
    const x = Math.round(28 + hash(i, k * 3) * 46);
    const y = Math.round(26 + hash(i, k * 3 + 1) * 46);
    const r = Math.round(7 + hash(i, k * 3 + 2) * 9);
    craters.push(
      `radial-gradient(${r}% ${r}% at ${x}% ${y}%, ${at(0.6, 0.035)} 0 70%, ${at(0.82, 0.03)} 86%, transparent 100%)`,
    );
  }
  return [
    // The terminator: the far side of the sphere falls into shadow.
    "radial-gradient(circle at 70% 76%, transparent 38%, color-mix(in oklab, black 42%, transparent) 100%)",
    ...craters,
    `radial-gradient(circle at 34% 30%, ${at(0.93, 0.03)}, ${at(0.76, 0.055)} 52%, ${at(0.5, 0.06)} 100%)`,
  ].join(", ");
}

const PLANET = [
  "radial-gradient(circle at 70% 74%, transparent 34%, color-mix(in oklab, black 55%, transparent) 100%)",
  "repeating-linear-gradient(-14deg, transparent 0 9%, oklch(from var(--accent) 0.72 0.09 calc(h + 20) / 0.35) 9% 13%, transparent 13% 21%)",
  "radial-gradient(circle at 34% 28%, oklch(from var(--accent) 0.86 0.07 h), oklch(from var(--accent) 0.6 0.14 h) 55%, oklch(from var(--accent) 0.32 0.1 h) 100%)",
].join(", ");

type Geo = { w: number; h: number };

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

type Layout = {
  m: number;
  rx: number;
  ry: number;
  cos: number;
  sin: number;
};

/**
 * Fits the orbit inside the stage: moons as large as the stage allows, the
 * ellipse's tipped and leaned extent plus half a moon held inside every edge.
 */
function layoutOf(
  geo: Geo,
  tilt: number,
  lean: number,
  moonSize: number | undefined,
): Layout {
  const m = Math.round(
    moonSize ?? clamp(Math.min(geo.w * 0.13, geo.h * 0.34), 28, 88),
  );
  const t = (clamp(tilt, 0, 80) * Math.PI) / 180;
  const l = (lean * Math.PI) / 180;
  const cos = Math.cos(l);
  const sin = Math.sin(l);
  let rx = Math.max(0, geo.w / 2 - m / 2 - 4);
  let ry = rx * Math.sin(t);
  const roomW = geo.w / 2 - 3 - m / 2;
  const roomH = geo.h / 2 - 3 - m / 2;
  // A short, wide stage keeps the ring wide: flatten the tip first (to no
  // less than half), and only then shrink the whole orbit to fit.
  const tall = Math.hypot(rx * sin, ry * cos);
  if (tall > roomH && Math.abs(cos) > 0.01) {
    const fits = Math.sqrt(Math.max(0, roomH * roomH - (rx * sin) ** 2));
    ry = Math.max(ry * 0.5, Math.min(ry, fits / Math.abs(cos)));
  }
  const hw = Math.hypot(rx * cos, ry * sin);
  const hh = Math.hypot(rx * sin, ry * cos);
  const k = Math.min(1, hw > 0 ? roomW / hw : 1, hh > 0 ? roomH / hh : 1);
  rx = Math.max(0, rx * k);
  ry = Math.max(0, ry * k);
  return { m, rx, ry, cos, sin };
}

type PoseKey = "x" | "y" | "s" | "z" | "o" | "b";

/**
 * One number of a moon's pose. Each style reads its own number straight
 * from the phase — no pose object is built per frame.
 */
function poseOf(
  key: PoseKey,
  i: number,
  n: number,
  phase: number,
  spread: number,
  lay: Layout,
  depth: number,
  soften: number,
): number {
  const th = (2 * Math.PI * (i - phase)) / n;
  const z = Math.cos(th);
  const far = (1 - z) / 2;
  if (key === "x" || key === "y") {
    const sx = lay.rx * Math.sin(th) * spread;
    const sy = lay.ry * z * spread;
    return key === "x"
      ? r2(sx * lay.cos - sy * lay.sin)
      : r2(sx * lay.sin + sy * lay.cos);
  }
  if (key === "s") {
    return r3((1 - clamp(depth, 0, 0.8) * far) * lerp(0.4, 1, spread));
  }
  if (key === "z") {
    return z >= 0 ? 52 + Math.round(38 * z) : 48 + Math.round(38 * z);
  }
  if (key === "o") {
    return r3((1 - 0.45 * far) * clamp(spread * 1.6 - 0.3, 0, 1));
  }
  return r2(Math.max(0, soften) * far);
}

/** The phase that puts moon `i` at the front by the shortest way round. */
const nearest = (from: number, i: number, n: number) => {
  const d = mod(i - from + n / 2, n) - n / 2;
  return from + d;
};

type MoonProps = {
  index: number;
  n: number;
  item: MoonRingItem;
  phase: MotionValue<number>;
  spread: MotionValue<number>;
  lay: Layout;
  depth: number;
  soften: number;
  shape: "circle" | "rounded";
  checked: boolean;
  disabled: boolean;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => void;
  onPress: (index: number) => void;
};

function Moon({
  index,
  n,
  item,
  phase,
  spread,
  lay,
  depth,
  soften,
  shape,
  checked,
  disabled,
  register,
  onKey,
  onPress,
}: MoonProps) {
  const pose = (key: PoseKey, p: unknown, sp: unknown) =>
    poseOf(key, index, n, p as number, sp as number, lay, depth, soften);
  const both = [phase, spread] as MotionValue<number>[];
  const x = useTransform(both, ([p, s]) => pose("x", p, s));
  const y = useTransform(both, ([p, s]) => pose("y", p, s));
  const scale = useTransform(both, ([p, s]) => pose("s", p, s));
  const zIndex = useTransform(both, ([p, s]) => pose("z", p, s));
  const opacity = useTransform(both, ([p, s]) => pose("o", p, s));
  const filter = useTransform(both, ([p, s]) => {
    const b = pose("b", p, s);
    return b > 0.15 ? `blur(${b}px)` : "none";
  });
  const ref = React.useCallback(
    (node: HTMLButtonElement | null) => register(item.id, node),
    [item.id, register],
  );

  return (
    <motion.button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={item.label}
      tabIndex={checked ? 0 : -1}
      disabled={disabled}
      data-moon={index}
      onKeyDown={(event) => onKey(event, index)}
      onClick={(event) => {
        // Pointer presses arrive through the stage's tap; a click with no
        // pointer behind it (Space, Enter, assistive tech) is a press too.
        if (event.detail === 0) onPress(index);
      }}
      className={cn(
        "absolute top-1/2 left-1/2 block cursor-pointer overflow-hidden outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        "disabled:cursor-not-allowed",
        shape === "circle" ? "rounded-full" : "rounded-3",
      )}
      style={{
        width: lay.m,
        height: lay.m,
        marginLeft: -lay.m / 2,
        marginTop: -lay.m / 2,
        x,
        y,
        scale,
        zIndex,
        opacity,
        filter,
        backgroundImage: item.src ? undefined : moonArt(index),
        boxShadow:
          "inset 0 0 0 1px color-mix(in oklab, white 14%, transparent), 0 6px 16px -8px color-mix(in oklab, black 60%, transparent)",
      }}
    >
      {item.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src}
          alt={item.alt ?? ""}
          draggable={false}
          className="pointer-events-none size-full object-cover"
        />
      ) : null}
    </motion.button>
  );
}

/**
 * Moons — images or generated tiles — on a tipped elliptical orbit around a
 * centre object. One motion value, the phase, drives every moon's pose:
 * position on the ellipse, leaned in the picture; scale, opacity and a
 * softening blur from its depth; and a z-order that carries it behind the
 * planet and back in front, with the near half of the orbit's path drawn
 * over the planet and the far half under it.
 *
 * The ring revolves on its own while nobody is touching it. A drag spins it
 * 1:1 — the front moon stays under the finger — and a release projects the
 * throw, snaps to the nearest moon and lands on the drift spring carrying
 * the release velocity, so a flick coasts several moons round. A click
 * brings a moon round the shortest way on the glide spring, with a whoosh
 * when `sound` is on. On first measure the moons launch from behind the
 * planet into orbit.
 *
 * It is a radio group: the front moon is checked and holds the tab stop,
 * arrows bring the neighbours round, Home and End the first and last.
 * Reduced motion: no drift and no travel — the chosen moon is put at the
 * front at once; dragging still follows the finger.
 */
export function MoonRing({
  items,
  count = 6,
  tilt = 20,
  speed = 8,
  value,
  defaultValue = 0,
  onValueChange,
  lean = -8,
  depth = 0.45,
  soften = 2,
  shape = "circle",
  moonSize,
  height = "clamp(9rem, 30cqw, 12.5rem)",
  center,
  caption = true,
  label = "Orbit",
  sound = false,
  paused = false,
  disabled = false,
  className,
}: MoonRingProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const n = Math.round(clamp(count, 3, 12));
  const moons = React.useMemo<MoonRingItem[]>(
    () =>
      Array.from({ length: n }, (_, i) => {
        const given = items?.[i];
        if (given) return given;
        return { id: `moon-${i}`, label: NAMES[i % NAMES.length] ?? "Moon" };
      }),
    [items, n],
  );

  const controlled = value !== undefined;
  const [own, setOwn] = React.useState(() => mod(Math.round(defaultValue), n));
  const front = mod(Math.round(controlled ? value : own), n);

  const phase = useMotionValue(front);
  const spread = useMotionValue(0);
  const ramp = useMotionValue(1);
  const [geo, setGeo] = React.useState<Geo>({ w: 0, h: 0 });
  const lay = layoutOf(geo, tilt, lean, moonSize);

  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const register = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) nodes.current.set(id, node);
      else nodes.current.delete(id);
    },
    [],
  );
  const shown = React.useRef(front);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const touch = React.useRef({ hover: false, focus: false, drag: false });
  const resumeAt = React.useRef(0);
  const dragFrom = React.useRef(0);
  const changeRef = React.useRef(onValueChange);
  React.useEffect(() => {
    changeRef.current = onValueChange;
  });

  // Measure the stage; everything about the orbit is fitted from it.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => {
      const box = stage.getBoundingClientRect();
      setGeo((g) =>
        Math.round(g.w) === Math.round(box.width) &&
        Math.round(g.h) === Math.round(box.height)
          ? g
          : { w: Math.round(box.width), h: Math.round(box.height) },
      );
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // The launch: once the stage has a size, the moons rise from behind the
  // planet into orbit. A re-run (StrictMode, a remount) finishes it.
  const measured = geo.w > 0;
  React.useEffect(() => {
    if (!measured) return;
    if (!motionSafe) {
      spread.jump(1);
      return;
    }
    const c = animate(spread, 1, springs.drift);
    return () => c.stop();
  }, [measured, motionSafe, spread]);

  const settle = React.useCallback(
    (target: number, velocity = 0, physics: Spring = springs.glide) => {
      running.current?.stop();
      running.current = null;
      if (!motionSafe) {
        phase.jump(target);
        return;
      }
      const c = animate(phase, target, {
        ...physics,
        velocity,
        onComplete: () => {
          if (running.current === c) running.current = null;
        },
      });
      running.current = c;
    },
    [motionSafe, phase],
  );

  // A host that changes `value` gets the same trip round a press would.
  React.useEffect(() => {
    if (shown.current === front) return;
    shown.current = front;
    if (touch.current.drag) return;
    settle(nearest(phase.get(), front, n));
  }, [front, n, phase, settle]);

  const whoosh = React.useCallback(
    (slots: number, clientX?: number) => {
      const amount = clamp(Math.abs(slots) / 3, 0, 1);
      if (amount < 0.2) return;
      audio.play("whoosh", {
        gain: r2(0.25 + 0.4 * amount),
        pitch: r2(0.85 + 0.35 * amount),
        pan: clientX !== undefined ? panFrom(clientX, stageRef.current) : 0,
      });
    },
    [audio],
  );

  const choose = (
    index: number,
    reason: MoonRingReason,
    options: { velocity?: number; clientX?: number; physics?: Spring } = {},
  ) => {
    const target = nearest(phase.get(), index, n);
    whoosh(target - phase.get(), options.clientX);
    if (!controlled) {
      setOwn(index);
      shown.current = index;
      settle(target, options.velocity ?? 0, options.physics);
    } else {
      // Controlled: the ring goes where the host says. If it takes the
      // change, the effect above brings the moon round once it answers.
      settle(nearest(phase.get(), front, n), options.velocity ?? 0);
    }
    if (index !== front) changeRef.current?.(index, reason);
    resumeAt.current = performance.now() + 1200;
  };

  const focusMoon = (index: number) => {
    const item = moons[mod(index, n)];
    if (item) nodes.current.get(item.id)?.focus();
  };

  const onKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    if (next === null) return;
    event.preventDefault();
    const target = mod(next, n);
    choose(target, "key");
    focusMoon(target);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      touch.current.drag = true;
      running.current?.stop();
      dragFrom.current = phase.get();
    },
    onMove: ({ offset }) => {
      // 1:1 at the front: a moon at θ = 0 moves Rx px per radian.
      const perSlot = (2 * Math.PI) / n;
      const rx = Math.max(24, lay.rx);
      phase.set(dragFrom.current - offset.x / rx / perSlot);
    },
    onEnd: ({ velocity, point }) => {
      touch.current.drag = false;
      const perSlot = (2 * Math.PI) / n;
      const rx = Math.max(24, lay.rx);
      const v = -velocity.x / rx / perSlot;
      // A light, coasting surface: a flick carries several moons round.
      const rest = Math.round(project(phase.get(), v, 0.998));
      choose(mod(rest, n), "drag", {
        velocity: v,
        clientX: point.x,
        physics: springs.drift,
      });
    },
    onCancel: () => {
      touch.current.drag = false;
      settle(nearest(phase.get(), front, n));
    },
    onTap: (event) => {
      const target = (event.target as Element | null)?.closest?.("[data-moon]");
      const index = target ? Number(target.getAttribute("data-moon")) : NaN;
      if (Number.isFinite(index)) {
        choose(index, "press", { clientX: event.clientX });
      }
    },
  });

  // The idle revolution: uncontrolled, on screen, visible, unpaused,
  // motion-safe and untouched. It eases out when a visitor arrives and back
  // in (drift spring) a moment after they leave.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage || controlled || paused || disabled || !motionSafe) return;
    if (speed === 0) return;
    let raf = 0;
    let last = 0;
    let inView = false;
    let easing: AnimationPlaybackControls | null = null;
    let resting = true;
    const perSecond = (speed / 360) * n;

    const touched = () =>
      touch.current.hover || touch.current.focus || touch.current.drag;

    const loop = (now: number) => {
      raf = 0;
      if (!inView || document.hidden) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const quiet = touched() || now < resumeAt.current;
      if (quiet && !resting) {
        resting = true;
        easing?.stop();
        easing = animate(ramp, 0, springs.glide);
      } else if (!quiet && resting) {
        resting = false;
        easing?.stop();
        easing = animate(ramp, 1, springs.drift);
      }
      const k = ramp.get();
      if (k > 0.001 && !touch.current.drag && !running.current) {
        const next = phase.get() + dt * perSecond * k;
        phase.set(next);
        const index = mod(Math.round(next), n);
        if (index !== shown.current) {
          shown.current = index;
          setOwn(index);
          changeRef.current?.(index, "drift");
        }
      }
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (raf !== 0 || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) inView = entry.isIntersecting;
      if (inView) wake();
      else if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(stage);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      easing?.stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [controlled, paused, disabled, motionSafe, speed, n, phase, ramp]);

  React.useEffect(() => () => running.current?.stop(), []);

  const item = moons[front];
  const half = (lower: boolean) => {
    // The orbit's path, as the near (lower) or far (upper) half of the
    // ellipse, in the stage's own coordinates.
    const { rx, ry } = lay;
    if (rx <= 0) return "";
    return `M ${r2(-rx)} 0 A ${r2(rx)} ${r2(Math.max(0.5, ry))} 0 0 ${lower ? 0 : 1} ${r2(rx)} 0`;
  };
  const leanDeg = r2(lean);
  const svgTransform = `translate(${r2(geo.w / 2)} ${r2(geo.h / 2)}) rotate(${leanDeg})`;
  const orbit = (lower: boolean) =>
    geo.w > 0 ? (
      <motion.svg
        aria-hidden
        width={geo.w}
        height={geo.h}
        className="pointer-events-none absolute inset-0 overflow-visible"
        style={{ zIndex: lower ? 51 : 1, opacity: spread }}
      >
        <path
          d={half(lower)}
          transform={svgTransform}
          fill="none"
          className="stroke-hairline-strong"
          strokeWidth={1}
          strokeDasharray={lower ? undefined : "2 4"}
        />
      </motion.svg>
    ) : null;

  return (
    <div
      className={cn(
        "@container flex w-full flex-col items-center gap-2",
        className,
      )}
    >
      <div
        ref={stageRef}
        role="radiogroup"
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        {...drag}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") touch.current.hover = true;
        }}
        onPointerLeave={() => {
          touch.current.hover = false;
          resumeAt.current = performance.now() + 1200;
        }}
        onFocus={(event) => {
          // Keyboard focus holds the ring still (a moving target is no place
          // to read from); a mouse press that focuses a moon does not.
          touch.current.focus = event.target.matches(":focus-visible");
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next))
            return;
          touch.current.focus = false;
          resumeAt.current = performance.now() + 1200;
        }}
        className={cn(
          "relative w-full touch-pan-y select-none",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{ height }}
      >
        {orbit(false)}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 aspect-square h-[46%] max-h-36 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            zIndex: 50,
            backgroundImage: center ? undefined : PLANET,
            boxShadow: center
              ? undefined
              : "0 10px 30px -12px oklch(from var(--accent) 0.4 0.12 h / 0.6), inset 0 0 0 1px color-mix(in oklab, white 10%, transparent)",
          }}
        >
          {center}
        </div>
        {orbit(true)}
        {moons.map((moon, i) => (
          <Moon
            key={moon.id}
            index={i}
            n={n}
            item={moon}
            phase={phase}
            spread={spread}
            lay={lay}
            depth={depth}
            soften={soften}
            shape={shape}
            checked={i === front}
            disabled={disabled}
            register={register}
            onKey={onKey}
            onPress={(index) => choose(index, "key")}
          />
        ))}
      </div>
      {caption && item ? (
        <p
          aria-hidden
          className="flex items-baseline gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums"
        >
          <motion.span
            key={item.id}
            initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="text-foreground"
          >
            {item.label}
          </motion.span>
          <span>
            {front + 1} of {n}
          </span>
        </p>
      ) : null}
      <span id={hintId} className="sr-only">
        Arrow keys bring the next moon round to the front; Home and End the
        first and last. Drag to spin the ring.
      </span>
    </div>
  );
}
