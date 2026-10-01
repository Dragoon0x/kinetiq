"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ViewfinderGrid = "thirds" | "cross" | "none";

export type ViewfinderShot = {
  /** Photos taken so far, this one included. */
  count: number;
  /** The focus point it was focused on, 0 to 8, row by row. */
  point: number;
  /** Whether focus had locked when the shutter fell. */
  sharp: boolean;
};

export type ViewfinderProps = {
  /** The scene: any content, framed 3:2 in a size container. */
  children?: React.ReactNode;
  /** The camera's accessible name. @default "Camera" */
  label?: string;
  /** Controlled focus point, 0 to 8, row by row from the top left. */
  point?: number;
  /** Initial focus point when uncontrolled. @default 4 */
  defaultPoint?: number;
  /** Fires from a tap on the scene or an arrow key, with the point chosen. */
  onPointChange?: (point: number) => void;
  /** Fires as the shutter falls, with the photo's count, point and whether it is sharp. */
  onShoot?: (shot: ViewfinderShot) => void;
  /** The framing grid. @default "thirds" */
  grid?: ViewfinderGrid;
  /** Show the electronic level, which turns green when the frame is level. @default true */
  level?: boolean;
  /** Depth of field, 0 (deep, f/11) to 1 (shallow, f/1.4): how soft the scene starts and how far the lens hunts. @default 0.5 */
  focus?: number;
  /** Play the half-press, the focus beep and the shutter. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/*
 * Everything is in cqh of the 2:1 root: the finder is 150 × 100 (3:2), the
 * column 45 wide, and the photo slot 42 × 28 — the finder at exactly 0.28,
 * so a photo flies there without anything being measured.
 */
const SLOT = { x: 156.5, y: 63, w: 42, h: 28 };
const SCALE = SLOT.w / 150;
const SHUTTER = { x: 160.5, y: 12, d: 34 };
/** Focus points, in finder units (150 × 100). */
const POINTS = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
  x: [37.5, 75, 112.5][i % 3] as number,
  y: [28, 50, 72][Math.floor(i / 3)] as number,
}));
const POINT_NAMES = [
  "Top left",
  "Top",
  "Top right",
  "Left",
  "Centre",
  "Right",
  "Bottom left",
  "Bottom",
  "Bottom right",
];
/** Where each point's subject stands, 0 near to 1 far: the top of a frame is usually far. */
const SUBJECT = [0.92, 0.97, 0.9, 0.62, 0.55, 0.6, 0.2, 0.28, 0.15];
/** How much brighter each point is than the frame, in stops: sky up top, shade below. */
const BRIGHT = [1.3, 1.7, 1, 0.3, 0, -0.3, -0.7, -1, -0.3];
const APERTURES = [11, 8, 5.6, 4, 2.8, 2, 1.4];
const SPEEDS = [
  8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500,
  400, 320, 250, 200, 160, 125, 100, 80, 60, 50, 40, 30,
];
/** The scene's exposure value at ISO 200, metered at the centre. */
const EV = 13;
/** The lens parks at infinity. */
const PARKED = 1;
const SHOTS_LEFT = 248;
/** Blur below this, in cqh, reads as sharp. */
const SHARP = 0.12;
const ROLL = 2;
/** Room for the roll and pan without the scene's edge showing. */
const OVERSCAN = 1.1;

const OSD = "oklch(0.98 0 0)";
const OSD_SHADOW = "oklch(0 0 0 / 0.5)";
const LOCKED = "oklch(0.84 0.19 145)";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ch = (v: number) => `${r2(v)}cqh`;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const apertureOf = (focus: number) =>
  APERTURES[Math.round(clamp01(focus) * (APERTURES.length - 1))] ?? 4;

/** The nearest marked shutter speed for an f-number at a point, as a fraction. */
function speedOf(n: number, point: number) {
  const t = (n * n) / Math.pow(2, EV + (BRIGHT[point] ?? 0));
  let best = SPEEDS[0] as number;
  for (const s of SPEEDS) {
    if (Math.abs(Math.log(1 / s / t)) < Math.abs(Math.log(1 / best / t))) {
      best = s;
    }
  }
  return `1/${best}`;
}

type Phase = "idle" | "racking" | "locked";

type Photo = {
  id: number;
  blur: number;
  bright: number;
  roll: number;
  panX: number;
  panY: number;
  landed: boolean;
};

type Said = { n: number; text: string };

type Api = {
  half: (via: "pointer" | "key" | "assist") => void;
  shoot: () => void;
  cancel: () => void;
  settlePoint: (p: number) => void;
  landed: (id: number) => void;
};

/** One photo: the frame as it was, flying from the finder into the slot. */
function PhotoCard({
  photo,
  motionSafe,
  onLanded,
  children,
}: {
  photo: Photo;
  motionSafe: boolean;
  onLanded: (id: number) => void;
  children: React.ReactNode;
}) {
  const x = useMotionValue(photo.landed ? SLOT.x : 0);
  const y = useMotionValue(photo.landed ? SLOT.y : 0);
  const s = useMotionValue(photo.landed ? SCALE : 1);
  const flash = useMotionValue(photo.landed ? 0 : 0.7);
  const fade = useMotionValue(photo.landed || motionSafe ? 1 : 0);
  const left = useTransform(x, ch);
  const top = useTransform(y, ch);
  const landed = React.useRef(onLanded);
  React.useEffect(() => {
    landed.current = onLanded;
  });

  React.useEffect(() => {
    const id = photo.id;
    const done = () => landed.current(id);
    if (photo.landed) return;
    if (!motionSafe) {
      x.set(SLOT.x);
      y.set(SLOT.y);
      s.set(SCALE);
      flash.set(0);
      const c = animate(fade, 1, {
        duration: durations.base,
        ease: easings.enter,
        onComplete: done,
      });
      return () => c.stop();
    }
    // The photo shrinks first, on snap, and travels on glide with y a beat
    // behind x, so it arcs over into the slot without leaving the box.
    const running = [
      animate(flash, 0, { duration: durations.slow, ease: easings.exit }),
      animate(s, SCALE, { ...springs.snap, delay: 0.1 }),
      animate(x, SLOT.x, { ...springs.glide, delay: 0.1 }),
      animate(y, SLOT.y, { ...springs.glide, delay: 0.17, onComplete: done }),
    ];
    return () => {
      for (const c of running) c.stop();
    };
  }, [photo.id, photo.landed, motionSafe, x, y, s, flash, fade]);

  return (
    <motion.div
      aria-hidden
      inert
      className="pointer-events-none absolute top-0 left-0 overflow-clip"
      style={{
        x: left,
        y: top,
        scale: s,
        originX: 0,
        originY: 0,
        opacity: fade,
        width: ch(150),
        height: ch(100),
        borderRadius: ch(2.2 / SCALE),
      }}
    >
      <div
        className="[container-type:size] absolute inset-0"
        style={{
          filter: `blur(${r2(photo.blur)}cqh) brightness(${r3(photo.bright)})`,
          transform: `translate(${ch(photo.panX)}, ${ch(photo.panY)}) rotate(${r2(photo.roll)}deg) scale(${OVERSCAN})`,
        }}
      >
        {children}
      </div>
      <div
        className="absolute inset-0"
        style={{ boxShadow: `inset 0 0 0 ${ch(1.6 / SCALE)} oklch(0.98 0 0)` }}
      />
      <motion.div
        className="absolute inset-0"
        style={{ opacity: flash, background: "oklch(1 0 0)" }}
      />
    </motion.div>
  );
}

/**
 * A camera viewfinder over any scene, with a two-stage shutter. Holding the
 * shutter is the half-press: its cap sinks to the first stage and the lens
 * racks to the focus point's subject on the recoil spring, hunting through
 * sharp twice the way a contrast lens does, until the point's brackets close
 * on snap, turn green and beep. Letting go fires: the cap bottoms out, two
 * curtains meet and part, and the frame — with the blur, exposure and roll
 * it was taken with — shrinks out of the finder and arcs into the slot in
 * the corner. Released before the lock, the photo is soft.
 *
 * The lens has a model: each focus point stands at a distance (near at the
 * bottom, far at the top) and a brightness (sky above, shade below), so
 * moving the point softens the scene, re-meters it and changes the shutter
 * speed; `focus` is the depth of field and sets the aperture. A mouse over
 * the finder aims the camera a little, and the level turns with the roll.
 *
 * The points are a real radiogroup (arrow keys in two dimensions); Space or
 * Enter held on the shutter is the half-press, released is the shot, and
 * Escape cancels. Under reduced motion nothing hunts, rolls or flies: focus
 * eases in, the curtains are one dim, and the photo appears in its slot.
 */
export function Viewfinder({
  children,
  label = "Camera",
  point,
  defaultPoint = 4,
  onPointChange,
  onShoot,
  grid = "thirds",
  level = true,
  focus = 0.5,
  sound = false,
  disabled = false,
  className,
}: ViewfinderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;

  const [ownPoint, setOwnPoint] = React.useState(() =>
    Math.min(8, Math.max(0, Math.round(defaultPoint))),
  );
  const current = Math.min(8, Math.max(0, Math.round(point ?? ownPoint)));
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [held, setHeld] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });

  const depth = lerp(2, 12, clamp01(focus));
  const aperture = apertureOf(focus);
  const speed = speedOf(aperture, current);

  const lens = useMotionValue(PARKED);
  const subject = useMotionValue(SUBJECT[current] ?? 0.5);
  const bright = useMotionValue(Math.pow(2, -(BRIGHT[current] ?? 0) * 0.22));
  const meter = useMotionValue(BRIGHT[current] ?? 0);
  const press = useMotionValue(0);
  const curtain = useMotionValue(0);
  const bx = useMotionValue(POINTS[current]?.x ?? 75);
  const by = useMotionValue(POINTS[current]?.y ?? 50);
  const bracket = useMotionValue(1);
  const aimX = useMotionValue(0);
  const aimY = useMotionValue(0);
  const glide = {
    stiffness: springs.glide.stiffness,
    damping: springs.glide.damping,
    mass: springs.glide.mass,
  };
  const sx = useSpring(aimX, glide);
  const sy = useSpring(aimY, glide);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const shutterRef = React.useRef<HTMLButtonElement | null>(null);
  const radios = React.useRef(new Map<number, HTMLDivElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const detach = React.useRef<(() => void) | null>(null);
  const halfDown = React.useRef(false);
  const shootOnLock = React.useRef(false);
  const lockedRef = React.useRef(false);
  const nextId = React.useRef(1);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const later = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };
  const pan = () => {
    const rect = shutterRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const blurNow = () => Math.abs(lens.get() - subject.get()) * depth;

  /* ---------------------------- focus and lock --------------------------- */

  const lock = () => {
    if (!halfDown.current) return;
    lockedRef.current = true;
    setPhase("locked");
    audio.play("click", { pitch: 2.2, gain: 0.2, pan: pan() });
    say("Focused.");
    if (motionSafe) {
      bracket.set(1.22);
      run("bracket", animate(bracket, 1, springs.snap));
    }
    if (shootOnLock.current) {
      shootOnLock.current = false;
      later(120, () => api.current?.shoot());
    }
  };

  const rack = () => {
    const target = SUBJECT[current] ?? 0.5;
    if (Math.abs(lens.get() - target) < 0.004 && lockedRef.current) {
      lock();
      return;
    }
    lockedRef.current = false;
    setPhase("racking");
    if (!motionSafe) {
      run(
        "lens",
        animate(lens, target, {
          duration: durations.slow,
          ease: easings.enter,
          onComplete: () => lock(),
        }),
      );
      return;
    }
    // ζ 0.53: the lens passes through sharp and back twice before it settles,
    // which is how a lens that judges focus by contrast finds it.
    run(
      "lens",
      animate(lens, target, {
        ...springs.recoil,
        velocity: lens.getVelocity(),
        restDelta: 0.002,
        restSpeed: 0.01,
        onComplete: () => lock(),
      }),
    );
  };

  const half = (via: "pointer" | "key" | "assist") => {
    if (disabled || halfDown.current) return;
    halfDown.current = true;
    shootOnLock.current = via === "assist";
    setHeld(true);
    audio.play("click", { pitch: 0.7, gain: 0.35, pan: pan() });
    if (motionSafe) run("press", animate(press, 0.5, springs.flick));
    else {
      halt("press");
      press.set(0.5);
    }
    rack();
  };

  const release = () => {
    halfDown.current = false;
    shootOnLock.current = false;
    setHeld(false);
    if (!lockedRef.current) setPhase("idle");
  };

  const cancel = () => {
    if (!halfDown.current) return;
    halt("lens");
    release();
    if (motionSafe) run("press", animate(press, 0, springs.snap));
    else {
      halt("press");
      press.set(0);
    }
  };

  const shoot = () => {
    if (!halfDown.current) return;
    const blur = blurNow();
    const sharp = lockedRef.current && blur < SHARP;
    halt("lens");
    release();
    const n = count + 1;
    setCount(n);
    const photo: Photo = {
      id: nextId.current,
      blur: r2(blur),
      bright: r3(bright.get()),
      roll: motionSafe ? r2(-sx.get() * ROLL) : 0,
      panX: motionSafe ? r2(-sx.get() * 2.2) : 0,
      panY: motionSafe ? r2(-sy.get() * 1.6) : 0,
      landed: false,
    };
    nextId.current += 1;
    // The last photo that landed stays under any still flying, and the new one.
    setPhotos((list) => [
      ...list.filter((p) => p.landed).slice(-1),
      ...list.filter((p) => !p.landed),
      photo,
    ]);
    say(`Photo ${n}, ${sharp ? "sharp" : "soft"}.`);
    audio.play("snap", { gain: 0.6, pan: pan() });
    later(70, () =>
      audio.play("click", { pitch: 0.85, gain: 0.45, pan: pan() }),
    );
    if (motionSafe) {
      run(
        "press",
        animate(press, 1, {
          ...springs.flick,
          onComplete: () => run("press", animate(press, 0, springs.snap)),
        }),
      );
      run(
        "curtain",
        animate(curtain, [0, 1, 1, 0], {
          duration: 0.26,
          times: [0, 0.35, 0.55, 1],
          ease: "linear",
        }),
      );
    } else {
      halt("press");
      press.set(0);
      run(
        "curtain",
        animate(curtain, [0, 1, 0], { duration: 0.2, ease: "linear" }),
      );
    }
    onShoot?.({ count: n, point: current, sharp });
  };

  /* -------------------------------- points ------------------------------- */

  const choose = (p: number, focusIt: boolean) => {
    if (disabled) return;
    const next = Math.min(8, Math.max(0, p));
    if (focusIt) radios.current.get(next)?.focus({ preventScroll: true });
    if (next === current) return;
    if (point === undefined) setOwnPoint(next);
    onPointChange?.(next);
  };

  const settlePoint = (p: number) => {
    lockedRef.current = false;
    if (!halfDown.current) setPhase("idle");
    const to = POINTS[p] ?? { x: 75, y: 50 };
    const ev = BRIGHT[p] ?? 0;
    // Focus and exposure are tweens: they are the lens and the meter
    // catching up, not objects with mass.
    run(
      "subject",
      animate(subject, SUBJECT[p] ?? 0.5, {
        duration: durations.slow,
        ease: easings.move,
      }),
    );
    run(
      "bright",
      animate(bright, Math.pow(2, -ev * 0.22), {
        duration: durations.slow,
        ease: easings.move,
      }),
    );
    if (motionSafe) {
      run("bx", animate(bx, to.x, springs.snap));
      run("by", animate(by, to.y, springs.snap));
      run("meter", animate(meter, ev, springs.snap));
    } else {
      for (const k of ["bx", "by", "meter"]) halt(k);
      bx.set(to.x);
      by.set(to.y);
      meter.set(ev);
    }
    // A half-press held while the point moves racks to the new subject.
    if (halfDown.current) rack();
  };

  const onRadioKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const col = current % 3;
    const row = Math.floor(current / 3);
    let next = -1;
    switch (event.key) {
      case "ArrowRight":
        next = current === 8 ? 0 : current + 1;
        break;
      case "ArrowLeft":
        next = current === 0 ? 8 : current - 1;
        break;
      case "ArrowDown":
        next = ((row + 1) % 3) * 3 + col;
        break;
      case "ArrowUp":
        next = ((row + 2) % 3) * 3 + col;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 8;
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        return;
    }
    if (next < 0) return;
    event.preventDefault();
    choose(next, true);
  };

  /* ------------------------------- shutter ------------------------------- */

  const onShutterPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    detach.current?.();
    const id = event.pointerId;
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      detach.current?.();
      detach.current = null;
      api.current?.shoot();
    };
    const lost = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      detach.current?.();
      detach.current = null;
      api.current?.cancel();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", lost);
    detach.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", lost);
    };
    half("pointer");
  };

  const onShutterKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      if (!halfDown.current) return;
      // Handled here, where focus is: the stage must not also close.
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (!event.repeat) half("key");
  };

  const onShutterKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (halfDown.current) shoot();
  };

  /* -------------------------------- aiming ------------------------------- */

  const aimAt = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || !motionSafe || disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    aimX.set(r3(Math.max(-1, Math.min(1, nx))));
    aimY.set(r3(Math.max(-1, Math.min(1, ny))));
  };
  const rest = () => {
    aimX.set(0);
    aimY.set(0);
  };

  const onSceneClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width < 1) return;
    const fx = ((event.clientX - rect.left) / rect.width) * 150;
    const fy = ((event.clientY - rect.top) / rect.height) * 100;
    let best = 0;
    POINTS.forEach((p, i) => {
      const b = POINTS[best] as { x: number; y: number };
      if (Math.hypot(p.x - fx, p.y - fy) < Math.hypot(b.x - fx, b.y - fy)) {
        best = i;
      }
    });
    choose(best, false);
  };

  const onLanded = React.useCallback((id: number) => {
    setPhotos((list) => {
      const at = list.findIndex((p) => p.id === id);
      if (at < 0) return list;
      return list
        .slice(at)
        .map((p) => (p.id === id ? { ...p, landed: true } : p));
    });
  }, []);

  React.useEffect(() => {
    api.current = { half, shoot, cancel, settlePoint, landed: onLanded };
  });

  const shownPoint = React.useRef(current);
  React.useEffect(() => {
    if (shownPoint.current === current) return;
    shownPoint.current = current;
    api.current?.settlePoint(current);
  }, [current]);

  // Nothing stays half-pressed while the page is away or the camera is disabled.
  React.useEffect(() => {
    const away = () => {
      detach.current?.();
      detach.current = null;
      api.current?.cancel();
    };
    const onVisibility = () => {
      if (document.hidden) away();
    };
    window.addEventListener("blur", away);
    document.addEventListener("visibilitychange", onVisibility);
    if (disabled) away();
    return () => {
      window.removeEventListener("blur", away);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [disabled]);

  React.useEffect(() => {
    if (!motionSafe) {
      aimX.set(0);
      aimY.set(0);
    }
  }, [motionSafe, aimX, aimY]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      detach.current?.();
      detach.current = null;
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ---------------------------- derived values --------------------------- */

  const sceneFilter = useTransform(
    () =>
      `blur(${r2(Math.abs(lens.get() - subject.get()) * depth)}cqh) brightness(${r3(bright.get())})`,
  );
  const sceneX = useTransform(sx, (v) => ch(-v * 2.2));
  const sceneY = useTransform(sy, (v) => ch(-v * 1.6));
  const sceneRoll = useTransform(sx, (v) => r2(-v * ROLL));
  const levelColor = useTransform(sx, (v) =>
    Math.abs(v * ROLL) < 0.4 ? LOCKED : OSD,
  );
  const pressScale = useTransform(press, (p) => r3(1 - 0.14 * p));
  const pressShade = useTransform(press, (p) => r3(0.28 * p));
  const meterX = useTransform(meter, (v) =>
    r2(30 + Math.max(-2, Math.min(2, v)) * 12),
  );
  const curtainScale = useTransform(curtain, (c) => (motionSafe ? r3(c) : 0));
  const dim = useTransform(curtain, (c) => (motionSafe ? 0 : r3(c * 0.6)));

  const locked = phase === "locked";
  const bracketColor = locked ? LOCKED : OSD;
  const ev = BRIGHT[current] ?? 0;
  const caption = held ? (locked ? "Release" : "Focus…") : "Hold";

  const line = (x1: number, y1: number, x2: number, y2: number) => (
    <g key={`${x1}-${y1}-${x2}-${y2}`}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        strokeWidth={2.4}
        vectorEffect="non-scaling-stroke"
        style={{ stroke: OSD_SHADOW }}
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        style={{ stroke: "oklch(1 0 0 / 0.7)" }}
      />
    </g>
  );

  const corner = (cx: number, cy: number, half: number, k: number) => {
    const out: string[] = [];
    for (const [sxn, syn] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const x = cx + sxn * half;
      const y = cy + syn * half * k;
      out.push(
        `M ${r2(x)} ${r2(y - syn * half * 0.45 * k)} L ${r2(x)} ${r2(y)} L ${r2(x - sxn * half * 0.45)} ${r2(y)}`,
      );
    }
    return out.join(" ");
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      data-phase={phase}
      className={cn(
        "group/viewfinder [container-type:size] relative aspect-[2/1] w-full select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* The finder. */}
      <div
        className="absolute top-0 left-0 overflow-clip bg-[oklch(0.12_0.004_260)]"
        style={{ width: ch(150), height: ch(100), borderRadius: ch(3.2) }}
        onPointerMove={aimAt}
        onPointerLeave={rest}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            x: sceneX,
            y: sceneY,
            rotate: sceneRoll,
            scale: OVERSCAN,
            filter: sceneFilter,
          }}
        >
          <div className="[container-type:size] absolute inset-0">
            {children}
          </div>
        </motion.div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 58%, color-mix(in oklab, black 34%, transparent))",
          }}
        />

        {/* Taps on the scene pick the nearest point. */}
        <div
          aria-hidden
          onClick={onSceneClick}
          className={cn(
            "absolute inset-0",
            disabled ? "cursor-not-allowed" : "cursor-crosshair",
          )}
        />

        <svg
          aria-hidden
          viewBox="0 0 150 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 block size-full"
          fill="none"
        >
          {grid === "thirds"
            ? [
                line(50, 0, 50, 100),
                line(100, 0, 100, 100),
                line(0, 33.33, 150, 33.33),
                line(0, 66.67, 150, 66.67),
              ]
            : grid === "cross"
              ? [line(75, 0, 75, 100), line(0, 50, 150, 50)]
              : null}
          <path
            d={[
              "M 22 24 V 17 H 29",
              "M 121 17 H 128 V 24",
              "M 128 76 V 83 H 121",
              "M 29 83 H 22 V 76",
            ].join(" ")}
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: "oklch(1 0 0 / 0.85)" }}
          />
          {POINTS.map((p, i) =>
            i === current ? null : (
              <rect
                key={i}
                x={p.x - 1.4}
                y={p.y - 1.4}
                width={2.8}
                height={2.8}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                style={{ stroke: "oklch(1 0 0 / 0.55)" }}
              />
            ),
          )}
          {level ? (
            <g>
              {line(46, 50, 52, 50)}
              {line(98, 50, 104, 50)}
              <motion.line
                x1={57}
                y1={50}
                x2={93}
                y2={50}
                strokeWidth={1.6}
                vectorEffect="non-scaling-stroke"
                style={{
                  stroke: levelColor,
                  rotate: sceneRoll,
                  originX: 0.5,
                  originY: 0.5,
                }}
              />
            </g>
          ) : null}
          {/* Motion keeps an SVG element's static style from its first
              render, so the colour lives on plain paths and only the
              motion values sit on the groups. */}
          <motion.g style={{ x: bx, y: by }}>
            <motion.g style={{ scale: bracket, originX: 0.5, originY: 0.5 }}>
              <path
                d={corner(0, 0, 6.5, 1)}
                strokeWidth={2.4}
                vectorEffect="non-scaling-stroke"
                style={{ stroke: OSD_SHADOW }}
              />
              <path
                d={corner(0, 0, 6.5, 1)}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                style={{ stroke: bracketColor }}
              />
            </motion.g>
          </motion.g>
        </svg>

        <div
          role="radiogroup"
          aria-label="Focus point"
          className="pointer-events-none absolute inset-0"
        >
          {POINTS.map((p, i) => (
            <div
              key={i}
              ref={(node) => {
                if (node) radios.current.set(i, node);
                else radios.current.delete(i);
              }}
              role="radio"
              aria-checked={i === current}
              aria-label={POINT_NAMES[i]}
              aria-disabled={disabled || undefined}
              tabIndex={i === current && !disabled ? 0 : -1}
              onKeyDown={onRadioKey}
              onClick={() => choose(i, false)}
              className={cn(
                "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-1",
                FOCUS_RING,
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              )}
              style={{
                left: `${r2((p.x / 150) * 100)}%`,
                top: `${p.y}%`,
                width: ch(16),
                height: ch(14),
              }}
            />
          ))}
        </div>

        {/* The camera's own words, white over any scene. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between font-mono leading-none tracking-[0.06em] uppercase tabular-nums"
          style={{
            height: ch(14),
            paddingInline: ch(5),
            fontSize: "max(9px, 4.2cqh)",
            color: OSD,
            textShadow: `0 0 3px ${OSD_SHADOW}`,
            background:
              "linear-gradient(to bottom, color-mix(in oklab, black 42%, transparent), transparent)",
          }}
        >
          <span className="flex items-center" style={{ gap: ch(2) }}>
            <span>AF-S</span>
            <span
              className="rounded-full"
              style={{
                width: ch(2.6),
                height: ch(2.6),
                background: locked ? LOCKED : "transparent",
                boxShadow: `inset 0 0 0 1px ${locked ? LOCKED : OSD}`,
              }}
            />
          </span>
          <span className="flex items-center" style={{ gap: ch(2) }}>
            <span>[{SHOTS_LEFT - count}]</span>
            <svg
              viewBox="0 0 14 8"
              style={{ width: ch(5.6), height: ch(3.2) }}
              className="block"
              fill="none"
            >
              <rect
                x="0.6"
                y="0.6"
                width="11.4"
                height="6.8"
                rx="1.2"
                stroke="currentColor"
                strokeWidth="1.1"
              />
              <rect x="2" y="2" width="6.4" height="4" fill="currentColor" />
              <rect
                x="12.6"
                y="2.6"
                width="1.2"
                height="2.8"
                fill="currentColor"
              />
            </svg>
          </span>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between font-mono leading-none tracking-[0.04em] tabular-nums"
          style={{
            height: ch(14),
            paddingInline: ch(5),
            fontSize: "max(9px, 4.2cqh)",
            color: OSD,
            textShadow: `0 0 3px ${OSD_SHADOW}`,
            background:
              "linear-gradient(to top, color-mix(in oklab, black 46%, transparent), transparent)",
          }}
        >
          <span>{speed}</span>
          <span>F{aperture}</span>
          <svg
            viewBox="0 0 60 12"
            className="block shrink-0"
            style={{ width: ch(30), height: ch(6) }}
            fill="none"
          >
            {[-2, -1, 0, 1, 2].map((v) => (
              <line
                key={v}
                x1={30 + v * 12}
                x2={30 + v * 12}
                y1={v === 0 ? 5 : 7}
                y2={12}
                stroke="currentColor"
                strokeWidth={v === 0 ? 1.4 : 1}
              />
            ))}
            {[-5, -4, -2, -1, 1, 2, 4, 5].map((v) => (
              <line
                key={v}
                x1={30 + v * 4}
                x2={30 + v * 4}
                y1={9.5}
                y2={12}
                stroke="currentColor"
                strokeWidth={0.8}
                opacity={0.7}
              />
            ))}
            <motion.path
              d="M -2.6 0 L 2.6 0 L 0 4 Z"
              fill="currentColor"
              style={{ x: meterX }}
            />
          </svg>
          <span>ISO 200</span>
        </div>

        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[oklch(0.06_0_0)]"
          style={{ scaleY: curtainScale, originY: 0 }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[oklch(0.06_0_0)]"
          style={{ scaleY: curtainScale, originY: 1 }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[oklch(0.06_0_0)]"
          style={{ opacity: dim }}
        />
      </div>

      {/* The shutter: two stages, half and full. */}
      <button
        ref={shutterRef}
        type="button"
        aria-label="Shutter"
        aria-describedby={hintId}
        disabled={disabled}
        onPointerDown={onShutterPointerDown}
        onKeyDown={onShutterKeyDown}
        onKeyUp={onShutterKeyUp}
        onBlur={() => {
          if (halfDown.current && !detach.current) cancel();
        }}
        onClick={(event) => {
          // A click with no pointer and no key behind it is assistive
          // technology: focus first, then the shot.
          if (event.detail === 0 && !halfDown.current) half("assist");
        }}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          "absolute touch-manipulation rounded-full border-2 border-foreground/70 bg-surface-2 [-webkit-touch-callout:none]",
          FOCUS_RING,
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{
          left: ch(SHUTTER.x),
          top: ch(SHUTTER.y),
          width: ch(SHUTTER.d),
          height: ch(SHUTTER.d),
        }}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-foreground/85"
          style={{ inset: ch(2.6), scale: pressScale }}
        >
          <motion.span
            className="absolute inset-0 rounded-full bg-background"
            style={{ opacity: pressShade }}
          />
        </motion.span>
      </button>
      <span
        aria-hidden
        className="pointer-events-none absolute text-center font-mono leading-none tracking-[0.08em] text-ink-3 uppercase"
        style={{
          left: ch(SLOT.x),
          width: ch(SLOT.w),
          top: ch(SHUTTER.y + SHUTTER.d + 4),
          fontSize: "max(9px, 4cqh)",
        }}
      >
        {caption}
      </span>

      {/* The slot the photos land in. */}
      <div
        aria-hidden
        className="pointer-events-none absolute flex items-center justify-center rounded-2 border border-dashed border-hairline-strong bg-surface-2 text-ink-3"
        style={{
          left: ch(SLOT.x),
          top: ch(SLOT.y),
          width: ch(SLOT.w),
          height: ch(SLOT.h),
        }}
      >
        <svg
          viewBox="0 0 16 12"
          style={{ width: ch(9), height: ch(7) }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        >
          <rect x="0.8" y="0.8" width="14.4" height="10.4" rx="1.6" />
          <path d="M 2.6 9.2 L 6.2 5.4 L 8.8 7.8 L 10.6 6.2 L 13.4 9.2" />
          <circle cx="11" cy="3.6" r="1.1" />
        </svg>
      </div>
      {photos.map((p) => (
        <PhotoCard
          key={p.id}
          photo={p}
          motionSafe={motionSafe}
          onLanded={onLanded}
        >
          {children}
        </PhotoCard>
      ))}
      {count > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute flex items-center justify-center rounded-full bg-foreground font-mono leading-none text-background tabular-nums"
          style={{
            left: ch(SLOT.x + SLOT.w - 10.5),
            top: ch(SLOT.y + 1.5),
            height: ch(7.5),
            minWidth: ch(9),
            paddingInline: ch(1.6),
            fontSize: "max(9px, 4cqh)",
          }}
        >
          {count}
        </span>
      ) : null}

      <p id={hintId} className="sr-only">
        Hold to focus, release to take the photo. Escape cancels.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
      <span className="sr-only">
        {speed} at f/{aperture}, metered {ev > 0 ? "+" : ""}
        {Math.round(ev * 10) / 10} stops.
      </span>
    </div>
  );
}
