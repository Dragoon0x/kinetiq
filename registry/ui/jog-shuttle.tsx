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
import { springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  type Point,
} from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type JogShuttleProps = {
  /** Controlled playhead, in frames. */
  value?: number;
  /** Starting frame when uncontrolled. @default min */
  defaultValue?: number;
  /** Fires from the jog detent, shuttle frame or key that moved the playhead. */
  onValueChange?: (frame: number) => void;
  /** Fires when the shuttle speed changes: signed, 0 when stopped, negative in reverse. */
  onSpeedChange?: (speed: number) => void;
  /** The first frame. @default 0 */
  min?: number;
  /** The last frame. @default 1439 */
  max?: number;
  /** Frames per second: the timecode, a PageUp's jump, and the shuttle's rate. @default 24 */
  fps?: number;
  /** What is being scrubbed. The control's accessible name, shown over the timecode. */
  label: string;
  /** Detents per revolution of the jog wheel, 12 to 48. One detent is one frame. @default 24 */
  detents?: number;
  /** How far the jog wheel coasts when let go spinning, 0 (stops dead) to 1 (a heavy flywheel). @default 0.5 */
  inertia?: number;
  /** The shuttle's top speed. The ring's zones double from 1× up to it. @default 16 */
  shuttleMax?: number;
  /** The ring's return spring, 0 (soft: it swings past centre) to 1 (firm: straight home). @default 0.5 */
  spring?: number;
  /** Detent ticks, zone clicks and the shuttle's whir. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const SIZE = 172;
const C = SIZE / 2;
/** The shuttle ring is one wide stroke, centred between its two edges. */
const RING_MID = 72.5;
const RING_W = 23;
const RIDGE_IN = 65;
const RIDGE_OUT = 80;
/** The fixed collar between ring and wheel, where the zone marks are printed. */
const COLLAR = 55.5;
const WHEEL = 49;
const DIMPLE_AT = 29;
/** How far the ring twists either way, and the dead band around centre, in degrees. */
const TWIST = 64;
const DEAD = 7;
/** A finger resting on a zone boundary must pass it by this much to change zone. */
const HYSTERESIS = 1.5;
/** How far past full twist the ring gives under the finger, at most, in degrees. */
const PULL = 16;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

/** A point `r` from the centre, `deg` clockwise from twelve o'clock. */
const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r3(C + r * Math.sin(a)), r3(C - r * Math.cos(a))];
};
const spoke = (r0: number, r1: number, deg: number) => {
  const [x0, y0] = polar(r0, deg);
  const [x1, y1] = polar(r1, deg);
  return `M${x0} ${y0}L${x1} ${y1}`;
};
const arc = (r: number, from: number, to: number) => {
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  return `M${x0} ${y0}A${r} ${r} 0 0 ${to > from ? 1 : 0} ${x1} ${y1}`;
};

// The ridges skip twelve o'clock, where the ring carries its index pip.
const RIDGES = Array.from({ length: 29 }, (_, i) =>
  spoke(RIDGE_IN, RIDGE_OUT, (i + 1) * 12),
).join("");
const PIP = spoke(RIDGE_IN - 1, RIDGE_OUT + 1, 0);
// Rim light from above. It stays put while the parts turn under it, which is
// what makes them read as turning rather than as a picture being rotated.
const RING_SHEEN = arc(83.5, -48, 48);
const WHEEL_SHEEN = arc(47.5, -56, 56);

// Shading, not theme: each part is the theme's own surface pushed toward ink
// or black, so the instrument reads as one object on a light page or a dark one.
const RING_FILL = "color-mix(in oklab, var(--bg-2) 62%, var(--ink-3))";
const RIDGE = "color-mix(in oklab, var(--ink) 30%, transparent)";
const COLLAR_FILL = "color-mix(in oklab, var(--bg-0) 78%, black)";
const WHEEL_FILL = "color-mix(in oklab, var(--bg-2) 84%, var(--ink-2))";
const DIMPLE = "color-mix(in oklab, var(--bg-2) 64%, black)";
const MARK = "color-mix(in oklab, var(--ink) 38%, transparent)";
const SHEEN = "color-mix(in oklab, white 34%, transparent)";

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

/** A spring from a stiffness and a damping ratio, at unit mass. */
const springOf = (stiffness: number, ratio: number): Spring => ({
  type: "spring",
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** 1×, 2×, 4× … doubling up to the top speed, which is always the last zone. */
function speedsFor(max: number): number[] {
  const top = Math.max(2, Math.round(max));
  const out: number[] = [];
  for (let s = 1; s < top; s *= 2) out.push(s);
  out.push(top);
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

function clockOf(frame: number, fps: number) {
  const ff = frame % fps;
  const total = Math.floor(frame / fps);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor(total / 60) % 60,
    s: total % 60,
    ff,
  };
}

/** Clockwise from twelve o'clock, in degrees; null too near the centre to read. */
const bearing = (x: number, y: number, c: Point): number | null => {
  const dx = x - c.x;
  const dy = y - c.y;
  if (dx * dx + dy * dy < 36) return null;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
};
/** The short way round from one bearing to the next. */
const turn = (from: number, to: number) => ((to - from + 540) % 360) - 180;
/** Degrees per second about the centre, from a pointer's velocity where it let go. */
const spinOf = (p: Point, v: Point, c: Point) => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 36) return 0;
  return ((dx * v.y - dy * v.x) / d2) * (180 / Math.PI);
};

type Grab = { c: Point; last: number | null; raw: number };

type Live = {
  step: (n: number, via: "jog" | "shuttle") => boolean;
  runFrame: (now: number) => void;
  stopShuttle: (velocity?: number) => void;
  size: number;
};

/**
 * An edit deck's transport control: a jog wheel for single frames inside a
 * spring-loaded shuttle ring for distance. The wheel turns 1:1 under the
 * finger and steps the playhead one frame per detent, ticking; let go
 * spinning, it is a flywheel whose landing is projected from the release spin
 * at a rate set by `inertia`, snapped to a detent and reached on a critically
 * damped spring with that same time constant, so it slows exponentially and
 * stops exactly on a detent, stepping as it goes. The ring twists up to 64°
 * either way; how far sets the speed, in zones that double from 1× to
 * `shuttleMax`, and the playhead runs at that speed for as long as it is
 * held, with a whir that rises with it. Let go, the playhead stops and the
 * ring swings home on the `spring` spring with the release's spin.
 *
 * Both parts are real sliders. Arrows jog a frame (Shift ten, PageUp and
 * PageDown a second), turning the wheel by the same detents; J and L shuttle
 * in reverse and forward, faster each press, K stops and Space toggles, and
 * the ring twists and holds to show it. Under reduced motion the parts still
 * follow the finger, but a released wheel settles at once and the ring snaps
 * home; the playhead, the readout and the sounds still answer.
 */
export function JogShuttle({
  value,
  defaultValue,
  onValueChange,
  onSpeedChange,
  min = 0,
  max = 1439,
  fps = 24,
  label,
  detents = 24,
  inertia = 0.5,
  shuttleMax = 16,
  spring = 0.5,
  sound = false,
  disabled = false,
  className,
}: JogShuttleProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();

  const lo = Math.round(Math.min(min, max));
  const hi = Math.max(lo, Math.round(Math.max(min, max)));
  const rate = Math.max(1, Math.round(fps));
  const count = Math.round(clamp(detents, 4, 120));
  const size = 360 / count;
  const speeds = React.useMemo(() => speedsFor(shuttleMax), [shuttleMax]);
  const zones = speeds.length;
  const band = (TWIST - DEAD) / zones;
  const ret = springOf(
    lerp(160, 900, clamp01(spring)),
    lerp(0.45, 0.9, clamp01(spring)),
  );

  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue ?? lo), lo, hi),
  );
  const current = clamp(Math.round(value ?? own), lo, hi);
  const [zone, setZone] = React.useState(0);
  const shownZone = clamp(zone, -zones, zones);

  const jog = useMotionValue(0);
  const ring = useMotionValue(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  /** Where the playhead is, as far as this control knows: its last report, until the host answers. */
  const head = React.useRef(current);
  const zoneRef = React.useRef(0);
  const latched = React.useRef(false);
  const ringHeld = React.useRef(false);
  const jogRun = React.useRef<AnimationPlaybackControls | null>(null);
  const ringRun = React.useRef<AnimationPlaybackControls | null>(null);
  const aim = React.useRef<number | null>(null);
  const blocked = React.useRef(false);
  const whir = React.useRef<LoopHandle | null>(null);
  const transport = React.useRef({ raf: 0, last: 0, carry: 0 });
  const jogGrab = React.useRef<Grab>({ c: { x: 0, y: 0 }, last: null, raw: 0 });
  const ringGrab = React.useRef<Grab>({
    c: { x: 0, y: 0 },
    last: null,
    raw: 0,
  });
  /** What the frame loop, the detent listener and the document listeners need, current every render. */
  const latest = React.useRef<Live | null>(null);

  // Every commit carries the host's answer to the last report (React batches
  // the host's update with ours), so the next step starts from what the host
  // accepted: a refused frame is simply not where the playhead is.
  React.useLayoutEffect(() => {
    head.current = current;
  });

  const centre = (): Point => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: 0, y: 0 };
  };
  const pan = () => panFrom(centre().x, null);
  const speedOf = (k: number) =>
    k === 0
      ? 0
      : Math.sign(k) * (speeds[Math.min(zones, Math.abs(k)) - 1] ?? 1);
  const zoneAt = (a: number) => {
    const m = Math.abs(a);
    if (m < DEAD) return 0;
    return Math.sign(a) * Math.min(zones, 1 + Math.floor((m - DEAD) / band));
  };
  const zoneCentre = (k: number) =>
    k === 0 ? 0 : Math.sign(k) * (DEAD + (Math.abs(k) - 0.5) * band);

  // The frame loop always runs the newest render's frame, so a tweak or a
  // new host value mid-shuttle is picked up on the next frame.
  const loop = React.useCallback((now: number) => {
    latest.current?.runFrame(now);
  }, []);

  const halt = React.useCallback(() => {
    jogRun.current?.stop();
    ringRun.current?.stop();
    if (transport.current.raf) {
      window.cancelAnimationFrame(transport.current.raf);
      transport.current.raf = 0;
    }
    whir.current?.stop();
    whir.current = null;
  }, []);

  /** Moves the playhead `n` frames from where it is. False when an end blocks it. */
  const step = (n: number, via: "jog" | "shuttle") => {
    const from = head.current;
    const next = clamp(from + n, lo, hi);
    if (via === "jog") {
      if (next === from) {
        // The wheel still turns at an end; the first blocked detent says so.
        if (!blocked.current) {
          blocked.current = true;
          audio.play("clack", { pitch: 0.9, gain: 0.4, pan: pan() });
        }
      } else {
        blocked.current = false;
        const t = hi > lo ? (next - lo) / (hi - lo) : 0;
        audio.play("detent", {
          pitch: r2(0.9 + 0.25 * t),
          gain: 0.4,
          pan: pan(),
        });
      }
    }
    if (next === from) return false;
    head.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    return true;
  };

  const syncWhir = () => {
    const speed = Math.abs(speedOf(zoneRef.current));
    if (!transport.current.raf || speed === 0) {
      whir.current?.stop();
      whir.current = null;
      return;
    }
    const octave = Math.log2(speed);
    const tone = {
      pitch: r2(0.8 + 0.4 * octave),
      gain: r2(Math.min(0.6, 0.3 + 0.06 * octave)),
    };
    if (whir.current) whir.current.set(tone);
    else whir.current = audio.start("whir", { ...tone, pan: pan() });
  };

  const stopTransport = () => {
    const t = transport.current;
    if (t.raf) window.cancelAnimationFrame(t.raf);
    t.raf = 0;
    t.carry = 0;
  };

  // One frame of shuttle: the playhead advances by speed × fps × elapsed,
  // carrying the fraction, so a 1× shuttle lands on every frame in turn.
  const runFrame = (now: number) => {
    const t = transport.current;
    const dt = Math.min(0.1, Math.max(0, (now - t.last) / 1000));
    t.last = now;
    t.carry += speedOf(zoneRef.current) * rate * dt;
    const whole = Math.trunc(t.carry);
    if (whole !== 0) {
      t.carry -= whole;
      if (!step(whole, "shuttle")) {
        // At an end. A latched shuttle lets go; a held ring waits, silent,
        // until it is turned the other way.
        t.raf = 0;
        if (latched.current) stopShuttle();
        else stopTransport();
        syncWhir();
        return;
      }
    }
    t.raf = window.requestAnimationFrame(loop);
  };

  const canRun = (k: number) =>
    (k > 0 && head.current < hi) || (k < 0 && head.current > lo);

  const setSpeedZone = (k: number) => {
    if (k === zoneRef.current) return;
    zoneRef.current = k;
    setZone(k);
    onSpeedChange?.(speedOf(k));
    audio.play("tick", {
      pitch: r2(0.9 + Math.abs(k) * 0.09),
      gain: 0.34,
      pan: pan(),
    });
    if (k !== 0 && canRun(k)) {
      const t = transport.current;
      if (!t.raf) {
        t.last = performance.now();
        t.carry = 0;
        t.raf = window.requestAnimationFrame(loop);
      }
    } else {
      stopTransport();
    }
    syncWhir();
  };

  const homeRing = (velocity = 0) => {
    ringRun.current?.stop();
    if (!motionSafe) {
      ring.set(0);
      return;
    }
    ringRun.current = animate(ring, 0, {
      ...ret,
      velocity,
      restDelta: 0.1,
      restSpeed: 2,
    });
  };

  /** Stops the playhead and lets the ring go home. */
  const stopShuttle = (velocity = 0) => {
    latched.current = false;
    setSpeedZone(0);
    homeRing(velocity);
  };

  /** A key twist: the ring goes to that zone and holds there (latched). */
  const twistTo = (k: number) => {
    if (ringHeld.current) return;
    const next = clamp(k, -zones, zones);
    if (next === 0) {
      stopShuttle();
      return;
    }
    if (!canRun(next)) {
      audio.play("clack", { pitch: 0.9, gain: 0.4, pan: pan() });
      return;
    }
    latched.current = true;
    setSpeedZone(next);
    ringRun.current?.stop();
    if (!motionSafe) {
      ring.set(zoneCentre(next));
      return;
    }
    ringRun.current = animate(ring, zoneCentre(next), {
      ...ret,
      restDelta: 0.1,
      restSpeed: 2,
    });
  };

  const settleJog = (spin: number) => {
    jogRun.current?.stop();
    aim.current = null;
    const here = jog.get();
    const nearest = Math.round(here / size) * size;
    if (!motionSafe) {
      jog.set(nearest);
      return;
    }
    const weight = clamp01(inertia);
    if (weight === 0 || Math.abs(spin) < 30) {
      jogRun.current = animate(jog, nearest, {
        ...springs.flick,
        velocity: spin,
      });
      return;
    }
    // Per ms of spin kept while coasting: a light wheel to a heavy flywheel.
    const keep = lerp(0.99, 0.9985, weight);
    const tau = -1 / Math.log(keep) / 1000;
    const landing = Math.round(project(here, spin, keep) / size) * size;
    jogRun.current = animate(jog, landing, {
      type: "spring",
      stiffness: 1 / (tau * tau),
      damping: 2 / tau,
      mass: 1,
      velocity: spin,
      restDelta: 0.05,
      restSpeed: 2,
    });
  };

  /** Keys turn the wheel by whole detents; the detents do the stepping. */
  const jogBy = (n: number) => {
    if (zoneRef.current !== 0) stopShuttle();
    jogRun.current?.stop();
    const base = aim.current ?? Math.round(jog.get() / size) * size;
    const target = base + n * size;
    if (!motionSafe) {
      aim.current = null;
      jog.set(target);
      return;
    }
    aim.current = target;
    jogRun.current = animate(
      jog,
      target,
      Math.abs(n) === 1 ? springs.snap : springs.glide,
    );
  };

  const jumpTo = (frame: number) => {
    if (zoneRef.current !== 0) stopShuttle();
    step(frame - head.current, "jog");
  };

  React.useEffect(() => {
    latest.current = { step, runFrame, stopShuttle, size };
  });

  // Each detent the wheel passes is one frame, whatever turned it: a finger,
  // a coast, or a key. So the ticks land on the frame the detent passes.
  React.useEffect(() => {
    let pitch = latest.current?.size ?? 15;
    let at = Math.round(jog.get() / pitch);
    return jog.on("change", (a) => {
      const now = latest.current;
      if (!now) return;
      if (now.size !== pitch) {
        pitch = now.size;
        at = Math.round(a / pitch);
        return;
      }
      const i = Math.round(a / pitch);
      if (i === at) return;
      const n = i - at;
      at = i;
      now.step(n, "jog");
    });
  }, [jog]);

  // New detents re-seat the wheel on the nearest one, silently.
  React.useEffect(() => {
    jogRun.current?.stop();
    aim.current = null;
    jog.set(Math.round(jog.get() / size) * size);
  }, [jog, size]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) latest.current?.stopShuttle();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (disabled) latest.current?.stopShuttle();
  }, [disabled]);

  // New zones mean the twist no longer names the speed that was reported:
  // a running shuttle stops rather than change speed unannounced.
  React.useEffect(() => {
    latest.current?.stopShuttle();
  }, [speeds]);

  // Sound switched off stops the whir with the kit; a new one starts on the
  // next zone change.
  React.useEffect(() => {
    whir.current = null;
  }, [audio]);

  React.useEffect(() => halt, [halt]);

  const grab = (g: Grab, point: Point, offset: Point, raw: number) => {
    g.c = centre();
    g.last = bearing(point.x - offset.x, point.y - offset.y, g.c);
    g.raw = raw;
  };
  /** Follows the pointer round the centre, unwrapping every move. */
  const follow = (g: Grab, point: Point) => {
    const a = bearing(point.x, point.y, g.c);
    if (a === null) return;
    if (g.last !== null) g.raw += turn(g.last, a);
    g.last = a;
  };

  const jogDrag = useDrag({
    disabled,
    onStart: ({ point, offset }) => {
      if (zoneRef.current !== 0) stopShuttle();
      jogRun.current?.stop();
      aim.current = null;
      grab(jogGrab.current, point, offset, jog.get());
    },
    onMove: ({ point }) => {
      if (disabled) return;
      follow(jogGrab.current, point);
      jog.set(r2(jogGrab.current.raw));
    },
    onEnd: ({ point, velocity }) => {
      settleJog(disabled ? 0 : spinOf(point, velocity, jogGrab.current.c));
    },
    onCancel: () => settleJog(0),
  });

  const ringDrag = useDrag({
    disabled,
    onStart: ({ point, offset }) => {
      ringHeld.current = true;
      latched.current = false;
      ringRun.current?.stop();
      grab(ringGrab.current, point, offset, ring.get());
    },
    onMove: ({ point }) => {
      if (disabled) return;
      const g = ringGrab.current;
      follow(g, point);
      ring.set(r2(rubberClamp(g.raw, -TWIST, TWIST, PULL)));
      const a = clamp(g.raw, -TWIST, TWIST);
      const prev = zoneRef.current;
      let k = zoneAt(a);
      // Stay put until the ring is clearly past the boundary.
      if (k !== prev && zoneAt(a - Math.sign(k - prev) * HYSTERESIS) === prev) {
        k = prev;
      }
      setSpeedZone(k);
    },
    onEnd: ({ point, velocity }) => {
      ringHeld.current = false;
      stopShuttle(spinOf(point, velocity, ringGrab.current.c));
    },
    onCancel: () => {
      ringHeld.current = false;
      stopShuttle();
    },
  });

  /** J, K, L and Space, wherever focus is in the control. */
  const transportKey = (event: React.KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key !== "j" && key !== "k" && key !== "l" && key !== " ") return false;
    event.preventDefault();
    if (event.repeat) return true;
    const z = zoneRef.current;
    if (key === "l") twistTo(z <= 0 ? 1 : z + 1);
    else if (key === "j") twistTo(z >= 0 ? -1 : z - 1);
    else if (key === "k" || z !== 0) stopShuttle();
    else twistTo(1);
    return true;
  };

  const onJogKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    const far = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        jogBy(far);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        jogBy(-far);
        break;
      case "PageUp":
        jogBy(rate);
        break;
      case "PageDown":
        jogBy(-rate);
        break;
      case "Home":
        jumpTo(lo);
        break;
      case "End":
        jumpTo(hi);
        break;
      default:
        transportKey(event);
        return;
    }
    event.preventDefault();
  };

  const onRingKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    const z = zoneRef.current;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        twistTo(z + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        twistTo(z - 1);
        break;
      case "Home":
        twistTo(-zones);
        break;
      case "End":
        twistTo(zones);
        break;
      default:
        transportKey(event);
        return;
    }
    event.preventDefault();
  };

  const jogRotate = useTransform(jog, r2);
  const ringRotate = useTransform(ring, r2);
  const sweep = useTransform(ring, (a) => {
    const t = r2(clamp(a, -TWIST, TWIST));
    return Math.abs(t) < 0.5 ? "" : arc(COLLAR, 0, t);
  });

  const marks = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => spoke(43, 47, i * size)).join(""),
    [count, size],
  );
  const zoneMarks = React.useMemo(() => {
    const edges = [DEAD];
    for (let i = 1; i <= zones; i += 1) edges.push(DEAD + i * band);
    return edges
      .map((e, i) => {
        const outer = i === edges.length - 1 ? COLLAR + 5 : COLLAR + 3.5;
        return spoke(COLLAR - 3.5, outer, e) + spoke(COLLAR - 3.5, outer, -e);
      })
      .join("");
  }, [zones, band]);

  const clock = clockOf(current, rate);
  const hours = Math.floor(hi / rate) >= 3600;
  const timecode = `${hours ? `${pad(clock.h)}:` : ""}${pad(clock.m)}:${pad(clock.s)}:${pad(clock.ff)}`;
  const spoken = [
    clock.h ? plural(clock.h, "hour") : "",
    clock.h || clock.m ? plural(clock.m, "minute") : "",
    plural(clock.s, "second"),
  ]
    .filter(Boolean)
    .join(" ");
  const jogText = `${spoken} and ${plural(clock.ff, "frame")}, frame ${current}`;
  const speed = speedOf(shownZone);
  const reverseMost = -zones;
  const ringText =
    speed === 0
      ? "Stopped"
      : `${speed > 0 ? "Forward" : "Reverse"}, ${Math.abs(speed)} times speed`;
  const stalled = (speed > 0 && current >= hi) || (speed < 0 && current <= lo);
  const progress = hi > lo ? r2(((current - lo) / (hi - lo)) * 100) : 0;
  const part = cn(
    "absolute rounded-full touch-none select-none transition-[background-color,box-shadow] duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
  );

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full items-center gap-4",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        ref={rootRef}
        className="relative shrink-0"
        style={{ width: SIZE, height: SIZE }}
      >
        <svg
          aria-hidden
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="pointer-events-none absolute inset-0 block"
        >
          <motion.g style={{ rotate: ringRotate, originX: 0.5, originY: 0.5 }}>
            {/* Invisible, full size: it keeps the group's box centred on
                the hub, so the ring turns about the centre. */}
            <circle cx={C} cy={C} r={RING_MID + RING_W / 2} fill="none" />
            <circle
              cx={C}
              cy={C}
              r={RING_MID}
              fill="none"
              strokeWidth={RING_W}
              style={{ stroke: RING_FILL }}
            />
            <path
              d={RIDGES}
              fill="none"
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{ stroke: RIDGE }}
            />
            <path
              d={PIP}
              fill="none"
              strokeWidth={3.5}
              strokeLinecap="round"
              className="stroke-cobalt-bright"
            />
          </motion.g>
          <circle
            cx={C}
            cy={C}
            r={RING_MID + RING_W / 2 + 0.5}
            fill="none"
            strokeWidth={1}
            className="stroke-hairline-strong"
          />
          <path
            d={RING_SHEEN}
            fill="none"
            strokeWidth={1}
            strokeLinecap="round"
            style={{ stroke: SHEEN }}
          />

          <circle
            cx={C}
            cy={C}
            r={COLLAR}
            fill="none"
            strokeWidth={11}
            style={{ stroke: COLLAR_FILL }}
          />
          <path
            d={zoneMarks}
            fill="none"
            strokeWidth={1}
            className="stroke-ink-3"
          />
          <circle cx={C} cy={C - COLLAR} r={1.5} className="fill-ink-2" />
          <motion.path
            d={sweep}
            fill="none"
            strokeWidth={3.5}
            strokeLinecap="round"
            className={cn(
              "transition-colors duration-150",
              shownZone === 0 ? "stroke-ink-3" : "stroke-cobalt-bright",
            )}
          />

          <motion.g style={{ rotate: jogRotate, originX: 0.5, originY: 0.5 }}>
            <circle
              cx={C}
              cy={C}
              r={WHEEL}
              strokeWidth={1}
              className="stroke-hairline-strong"
              style={{ fill: WHEEL_FILL }}
            />
            <circle
              cx={C}
              cy={C}
              r={WHEEL - 17}
              fill="none"
              strokeWidth={1}
              className="stroke-hairline"
            />
            <path
              d={marks}
              fill="none"
              strokeWidth={1}
              strokeLinecap="round"
              style={{ stroke: MARK }}
            />
            <circle
              cx={C}
              cy={C - DIMPLE_AT}
              r={9.5}
              strokeWidth={1}
              className="stroke-hairline-strong"
              style={{ fill: DIMPLE }}
            />
          </motion.g>
          <path
            d={WHEEL_SHEEN}
            fill="none"
            strokeWidth={1}
            strokeLinecap="round"
            style={{ stroke: SHEEN }}
          />
        </svg>

        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Jog"
          aria-orientation="horizontal"
          aria-valuemin={lo}
          aria-valuemax={hi}
          aria-valuenow={current}
          aria-valuetext={jogText}
          aria-keyshortcuts="J K L Space"
          aria-disabled={disabled || undefined}
          onKeyDown={onJogKey}
          {...jogDrag}
          className={cn(
            part,
            "z-10",
            !disabled && "hover:bg-cobalt-wash active:bg-cobalt-wash",
          )}
          style={{
            left: C - WHEEL,
            top: C - WHEEL,
            width: WHEEL * 2,
            height: WHEEL * 2,
          }}
        />
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Shuttle"
          aria-orientation="horizontal"
          aria-valuemin={reverseMost}
          aria-valuemax={zones}
          aria-valuenow={shownZone}
          aria-valuetext={ringText}
          aria-keyshortcuts="J K L Space"
          aria-disabled={disabled || undefined}
          onKeyDown={onRingKey}
          {...ringDrag}
          className={cn(
            part,
            "inset-0",
            !disabled &&
              "hover:shadow-[inset_0_0_0_24px_var(--accent-wash)] active:shadow-[inset_0_0_0_24px_var(--accent-wash)]",
          )}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span
          id={labelId}
          className="truncate text-xs text-ink-3"
          title={label}
        >
          {label}
        </span>
        <p
          aria-hidden
          className="font-mono text-base leading-none text-foreground tabular-nums"
        >
          {timecode}
        </p>
        <p
          aria-hidden
          className={cn(
            "flex items-center gap-1.5 font-mono text-[10px] leading-none tracking-[0.08em] uppercase transition-colors duration-150",
            speed !== 0 && !stalled ? "text-cobalt-bright" : "text-ink-3",
          )}
        >
          <Glyph speed={stalled ? 0 : speed} />
          <span>
            {speed === 0
              ? "Paused"
              : stalled
                ? speed > 0
                  ? "At end"
                  : "At start"
                : `${Math.abs(speed)}×`}
          </span>
        </p>
        <span
          aria-hidden
          className="relative block h-0.5 w-full overflow-clip rounded-full bg-hairline-strong"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
            style={{ width: `${progress}%` }}
          />
        </span>
      </div>
    </div>
  );
}

/** Pause bars, or a play arrow that doubles once the shuttle passes 1×. */
function Glyph({ speed }: { speed: number }) {
  const flip = speed < 0 ? "scale(-1 1) translate(-10 0)" : undefined;
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className="size-2.5 shrink-0 fill-current"
    >
      {speed === 0 ? (
        <>
          <rect x={2} y={1.5} width={2} height={7} rx={0.5} />
          <rect x={6} y={1.5} width={2} height={7} rx={0.5} />
        </>
      ) : (
        <g transform={flip}>
          {Math.abs(speed) > 1 ? (
            <path d="M0.5 1.5L5 5L0.5 8.5ZM5 1.5L9.5 5L5 8.5Z" />
          ) : (
            <path d="M2 1.5L8.5 5L2 8.5Z" />
          )}
        </g>
      )}
    </svg>
  );
}
