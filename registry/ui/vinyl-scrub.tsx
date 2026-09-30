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
import { springs } from "@/registry/lib/motion";
import { useDrag, type Point } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type VinylScrubRpm = 33 | 45 | "33" | "45";

export type VinylScrubProps = {
  /** Controlled playhead, in seconds (tenths). */
  value?: number;
  /** Starting playhead when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the play clock, the scrub or the key that moved the playhead. */
  onValueChange?: (seconds: number) => void;
  /** The track's length, in seconds. */
  duration: number;
  /** Controlled motor state: whether the record is playing. */
  playing?: boolean;
  /** Starting motor state when uncontrolled. @default false */
  defaultPlaying?: boolean;
  /** Fires from start/stop, Space or K, and when the track runs out. */
  onPlayingChange?: (playing: boolean) => void;
  /** True while a hand (or a held arrow key) is on the record, false when it lets go. */
  onScrubChange?: (scrubbing: boolean) => void;
  /** What is on the deck. The control's accessible name. */
  label: string;
  /** Platter speed: how fast it spins and how much of the track one turn scrubs. @default "33" */
  rpm?: VinylScrubRpm;
  /** How hard a finger stops the record, 0 (it slides under the hand) to 1 (dead stop). @default 0.6 */
  grip?: number;
  /** How heavy the platter is, 0 to 1: how long it takes to come back to speed, and how far a flick carries. @default 0.4 */
  inertia?: number;
  /** Show the tonearm tracking the groove; off, a ring around the platter shows the position. @default true */
  tonearm?: boolean;
  /** The scratch under the hand and the motor's whir. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const W = 300;
const H = 208;
const C: Point = { x: 104, y: 104 };
const PLATTER = 94;
const RECORD = 86;
const LABEL = 29;
const RING = 99;
/** The stylus runs from the outer groove at 0 to the inner one at the end. */
const GROOVE_OUT = 84;
const GROOVE_IN = 36;
const PIVOT: Point = { x: 258, y: 46 };
const ARM = 150;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const tenth = (v: number) => Math.round(v * 10) / 10 || 0;

/** A point `r` from `c`, `deg` clockwise from twelve o'clock. */
const polar = (c: Point, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r3(c.x + r * Math.sin(a)), r3(c.y - r * Math.cos(a))];
};
/** A ring segment between two radii and two bearings, as a closed path. */
const sector = (r0: number, r1: number, from: number, to: number) => {
  const [a, b] = polar(C, r1, from);
  const [c, d] = polar(C, r1, to);
  const [e, f] = polar(C, r0, to);
  const [g, h] = polar(C, r0, from);
  return `M${a} ${b}A${r1} ${r1} 0 0 1 ${c} ${d}L${e} ${f}A${r0} ${r0} 0 0 0 ${g} ${h}Z`;
};

// The arm is solved, not eased: the stylus sits exactly on the groove for
// the time. With the pivot `d` from the spindle, an arm `ARM` long reaches a
// groove of radius r at an angle α off the pivot-to-spindle line, from the
// law of cosines.
const SPAN = Math.hypot(C.x - PIVOT.x, C.y - PIVOT.y);
const BASE = (Math.atan2(C.y - PIVOT.y, C.x - PIVOT.x) * 180) / Math.PI;
const armAt = (fraction: number) => {
  const r = lerp(GROOVE_OUT, GROOVE_IN, clamp01(fraction));
  const cos = (ARM * ARM + SPAN * SPAN - r * r) / (2 * ARM * SPAN);
  return r2(BASE - (Math.acos(clamp(cos, -1, 1)) * 180) / Math.PI);
};

const GROOVES = (() => {
  let d = "";
  for (let r = 34; r <= 84; r += 2.5) {
    d += `M${C.x - r} ${C.y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  return d;
})();
const GAPS = [47.5, 60, 72.5]
  .map(
    (r) =>
      `M${C.x - r} ${C.y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`,
  )
  .join("");
const DOTS = Array.from({ length: 48 }, (_, i) => polar(C, 90.5, i * 7.5));
// Light from the top left: a band on the vinyl either side of the spindle
// that stays put while the record turns under it.
const SHEEN = sector(32, 85, -62, -34) + sector(32, 85, 118, 146);

// Shading, not theme: metal is the theme's surface pushed toward ink, and
// vinyl is black on a light page and a dark one alike.
const METAL = "color-mix(in oklab, var(--bg-2) 66%, var(--ink-3))";
const METAL_DARK = "color-mix(in oklab, var(--bg-2) 40%, var(--ink-2))";
const VINYL = "color-mix(in oklab, var(--ink) 6%, black)";
const GROOVE = "color-mix(in oklab, white 7%, transparent)";
const GLOSS = "color-mix(in oklab, white 9%, transparent)";
const DOT = "color-mix(in oklab, var(--ink) 55%, transparent)";
const PAPER = "oklch(from var(--warn) 0.74 0.13 h)";
const PRINT = "color-mix(in oklab, black 62%, transparent)";
const HEADSHELL = "color-mix(in oklab, var(--bg-2) 30%, var(--ink-2))";

const pad = (n: number) => String(n).padStart(2, "0");
function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
function spokenTime(t: number): string {
  const s = Math.max(0, Math.round(t));
  const m = Math.floor(s / 60);
  if (m === 0) return plural(s, "second");
  return s % 60 === 0
    ? plural(m, "minute")
    : `${plural(m, "minute")} ${plural(s % 60, "second")}`;
}

/** Clockwise from twelve o'clock, in degrees; null too near the spindle to read. */
const bearing = (p: Point, c: Point): number | null => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  if (dx * dx + dy * dy < 64) return null;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
};
/** The short way round from one bearing to the next. */
const turn = (from: number, to: number) => ((to - from + 540) % 360) - 180;
/** Degrees per second about the spindle, from a pointer's velocity where it let go. */
const spinOf = (p: Point, v: Point, c: Point) => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 64) return 0;
  return ((dx * v.y - dy * v.x) / d2) * (180 / Math.PI);
};

type Hand = "pointer" | "drag" | "key" | null;

type Deck = {
  /** Platter speed, degrees a second, whenever no hand is on it. */
  omega: number;
  hand: Hand;
  /** The hand's own spin, measured from how far it turned the platter each frame. */
  handOmega: number;
  lastAngle: number;
  pan: number;
  raf: number;
  last: number;
  /** Stopped because the deck went off screen or the page was hidden. */
  suspended: boolean;
  visible: boolean;
  /** A gesture started this spin-up or spin-down, so the motor may be heard. */
  whirOk: boolean;
  /** The time a held arrow key is scrubbing toward. */
  keyTime: number | null;
  keyRun: AnimationPlaybackControls | null;
  keyUp: boolean;
  /** The end of the track stopped the deck; asked once, until it answers. */
  ranOut: boolean;
  grab: { c: Point; last: number | null };
};

type Live = {
  frame: (now: number) => void;
  wake: () => void;
  release: (omega: number) => void;
};

/**
 * A turntable as a track's playhead. The record is the clock: at 33⅓ it
 * turns 200° a second and one second of the track is exactly that much
 * groove, so while it plays the platter spins and the time runs, and turned
 * by hand the time follows the hand, backwards too. A finger on the record
 * brakes it (how hard is `grip`); a drag turns it 1:1 about the spindle and
 * scrubs, with a scratch whose pitch follows the hand's speed; let go and
 * the platter keeps the hand's spin while the motor pulls it back to speed
 * on a time constant set by `inertia`, with a whir, and the time advances at
 * the platter's real speed the whole way. The tonearm's stylus is solved
 * onto the groove for the time, outer groove to inner.
 *
 * The record is a real slider. An arrow key is a hand on the record: it
 * holds it, turns it a second of groove (Shift five) with the same scratch,
 * keeps scrubbing on repeat and lets go on key-up; PageUp and PageDown drop
 * the needle ten seconds on or back, Home and End at either end, and Space
 * or K start and stop. The deck's one frame loop runs only while something
 * is turning and the deck is on screen. Under reduced motion the record
 * does not spin while it plays, and a release or a key lands at once; the
 * time, the arm and the sounds still answer.
 */
export function VinylScrub({
  value,
  defaultValue = 0,
  onValueChange,
  duration,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  onScrubChange,
  label,
  rpm = "33",
  grip = 0.6,
  inertia = 0.4,
  tonearm = true,
  sound = false,
  disabled = false,
  className,
}: VinylScrubProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();

  const dur = Math.max(1, Number.isFinite(duration) ? duration : 1);
  const fast = Number(rpm) === 45;
  /** Degrees of platter per second of track: 33⅓ rpm is 200°/s, 45 is 270°/s. */
  const deg = fast ? 270 : 200;
  const tau = lerp(0.06, 0.9, clamp01(inertia));
  const brake = 400 * Math.pow(60, clamp01(grip));

  const [own, setOwn] = React.useState(() =>
    tenth(clamp(defaultValue, 0, dur)),
  );
  const current = tenth(clamp(value ?? own, 0, dur));
  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const isPlaying = playing ?? ownPlaying;

  const pos = useMotionValue(current);
  const spin = useMotionValue(0);
  const armLag = useMotionValue(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [slot, setSlot] = React.useState<HTMLDivElement | null>(null);
  const [fit, setFit] = React.useState(1);

  React.useLayoutEffect(() => {
    if (!slot) return;
    const measure = () => {
      const room = slot.clientWidth;
      setFit(room > 0 ? Math.min(1, r3(room / W)) : 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [slot]);
  const platterRef = React.useRef<HTMLDivElement | null>(null);
  const reported = React.useRef(current);
  const armRun = React.useRef<AnimationPlaybackControls | null>(null);
  const scratch = React.useRef<LoopHandle | null>(null);
  const whir = React.useRef<LoopHandle | null>(null);
  const deck = React.useRef<Deck>({
    // Playing from the first frame is already at speed: nothing spins up,
    // so nothing is heard, on mount.
    omega: isPlaying ? deg : 0,
    hand: null,
    handOmega: 0,
    lastAngle: 0,
    pan: 0,
    raf: 0,
    last: 0,
    suspended: false,
    visible: true,
    whirOk: false,
    keyTime: null,
    keyRun: null,
    keyUp: false,
    ranOut: false,
    grab: { c: { x: 0, y: 0 }, last: null },
  });
  const live = React.useRef<Live | null>(null);

  const centre = (): Point => {
    const rect = platterRef.current?.getBoundingClientRect();
    return rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: 0, y: 0 };
  };

  const report = (t: number) => {
    const next = tenth(t);
    if (next === reported.current) return;
    reported.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const setPlay = (next: boolean, gesture: boolean) => {
    if (next === isPlaying) return;
    if (gesture) deck.current.whirOk = true;
    // Started from the run-out: the needle goes back to the top.
    if (next && pos.get() >= dur - 0.05) drop(0);
    if (playing === undefined) setOwnPlaying(next);
    onPlayingChange?.(next);
  };

  /** Moves the time; false when it is pinned at an end. */
  const moveTime = (seconds: number) => {
    const from = pos.get();
    const to = clamp(from + seconds, 0, dur);
    if (to === from) return false;
    pos.set(to);
    report(to);
    return true;
  };

  /** The hand turns the platter: the record and the time move together. */
  const turnBy = (degrees: number) => {
    spin.set(r2(spin.get() + degrees));
    moveTime(degrees / deg);
  };

  /** A needle drop: the time jumps, the arm swings over, the record does not turn. */
  const seek = (t: number) => {
    const from = pos.get();
    const to = clamp(t, 0, dur);
    reported.current = tenth(to);
    deck.current.ranOut = false;
    pos.set(to);
    armRun.current?.stop();
    if (!motionSafe || !tonearm) {
      armLag.set(0);
      return;
    }
    armLag.set(armLag.get() + from - to);
    armRun.current = animate(armLag, 0, springs.glide);
  };
  const drop = (t: number) => {
    seek(t);
    const to = tenth(clamp(t, 0, dur));
    if (value === undefined) setOwn(to);
    onValueChange?.(to);
  };

  const stopScratch = () => {
    scratch.current?.stop();
    scratch.current = null;
  };
  const stopWhir = () => {
    whir.current?.stop();
    whir.current = null;
  };

  const needsLoop = () => {
    const d = deck.current;
    return (
      d.hand !== null ||
      isPlaying ||
      Math.abs(d.omega) > 0.01 ||
      whir.current !== null
    );
  };

  // The frame loop always runs the newest render's frame, so a tweak or a
  // new host answer is picked up on the next frame.
  const loop = React.useCallback((now: number) => {
    live.current?.frame(now);
  }, []);

  const frame = (now: number) => {
    const d = deck.current;
    d.raf = 0;
    if (!d.visible || document.hidden) {
      // Off screen: nothing runs. The time catches up when it comes back.
      d.suspended = true;
      stopWhir();
      return;
    }
    const gap = Math.max(0, (now - d.last) / 1000);
    d.last = now;
    const target = isPlaying ? deg : 0;

    if (d.hand === null && gap > 0.25) {
      // Back from a hidden stretch: the record played on at speed.
      d.omega = target;
      if (target !== 0) {
        if (motionSafe) spin.set(r2((spin.get() + target * gap) % 360));
        moveTime(gap * (target / deg));
      }
    } else {
      const dt = Math.min(0.05, gap);
      if (d.hand === null) {
        if (!motionSafe) {
          d.omega = target;
        } else {
          d.omega += (target - d.omega) * (1 - Math.exp(-dt / tau));
          if (Math.abs(d.omega - target) < 0.5) d.omega = target;
        }
        const step = d.omega * dt;
        if (step !== 0) {
          // Reduced motion keeps the record still while it plays; the time
          // still runs, because the time is the information.
          if (motionSafe) spin.set(r2(spin.get() + step));
          moveTime(step / deg);
        }
      } else if (d.hand === "pointer") {
        // A finger resting on a spinning record: it brakes, sliding a little
        // or not at all as `grip` says, and the time slows with it.
        const slow = brake * dt;
        d.omega =
          Math.abs(d.omega) <= slow ? 0 : d.omega - Math.sign(d.omega) * slow;
        if (d.omega !== 0) turnBy(d.omega * dt);
        d.handOmega = d.omega;
      } else if (dt > 0) {
        const a = spin.get();
        const measured = (a - d.lastAngle) / dt;
        d.lastAngle = a;
        d.handOmega += (measured - d.handOmega) * 0.35;
      }
    }

    // What the hand is doing, heard.
    if (d.hand !== null) {
      const w = d.handOmega;
      const t = pos.get();
      const pinned = (t <= 0 && w < 0) || (t >= dur && w > 0);
      const speed = Math.min(2.5, Math.abs(w) / deg);
      const tone = {
        pitch: r2(clamp(0.4 + 0.9 * speed, 0.3, 3) * (w < 0 ? 0.88 : 1)),
        gain: pinned ? 0 : r2(Math.min(0.6, speed * 0.55)),
      };
      if (scratch.current) scratch.current.set(tone);
      else scratch.current = audio.start("scratch", { ...tone, pan: d.pan });
    } else {
      stopScratch();
    }

    // The motor, heard only while a gesture's spin-up or spin-down lasts.
    const off = Math.abs(target - d.omega) / deg;
    if (d.hand === null && d.whirOk && off > 0.03) {
      const tone = {
        pitch: r2(0.5 + 0.8 * Math.min(1.5, Math.abs(d.omega) / deg)),
        gain: r2(Math.min(0.5, 0.18 + off * 0.5)),
      };
      if (whir.current) whir.current.set(tone);
      else
        whir.current = audio.start("whir", {
          ...tone,
          pan: panFrom(centre().x, null),
        });
    } else {
      if (d.hand === null && off <= 0.03) d.whirOk = false;
      stopWhir();
    }

    // Run out: the deck stops by itself at the end of the track.
    if (d.hand === null && isPlaying && !d.ranOut && pos.get() >= dur) {
      d.ranOut = true;
      d.whirOk = false;
      setPlay(false, false);
    }

    if (needsLoop()) d.raf = window.requestAnimationFrame(loop);
  };

  const wake = () => {
    const d = deck.current;
    if (d.raf || !d.visible || document.hidden || !needsLoop()) return;
    // From idle the clock starts now; from a suspension it keeps the old
    // stamp, so the first frame sees the gap and catches the time up.
    if (!d.suspended) d.last = performance.now();
    d.suspended = false;
    d.raf = window.requestAnimationFrame(loop);
  };

  const handDown = (hand: Exclude<Hand, null>, pan: number) => {
    const d = deck.current;
    if (d.hand !== null) return;
    d.hand = hand;
    d.pan = pan;
    d.handOmega = d.omega;
    d.lastAngle = spin.get();
    if (!motionSafe) d.omega = 0;
    stopWhir();
    onScrubChange?.(true);
    wake();
  };

  const release = (omega: number) => {
    const d = deck.current;
    if (d.hand === null) return;
    d.hand = null;
    d.keyTime = null;
    d.keyRun?.stop();
    d.keyRun = null;
    d.keyUp = false;
    d.omega = motionSafe
      ? clamp(omega, -4 * deg, 4 * deg)
      : isPlaying
        ? deg
        : 0;
    d.whirOk = true;
    stopScratch();
    onScrubChange?.(false);
    wake();
  };

  React.useEffect(() => {
    live.current = { frame, wake, release };
  });

  // Every commit carries the host's answer to the last report. A time the
  // control did not report is the host's own: a needle drop.
  React.useLayoutEffect(() => {
    if (Math.abs(current - reported.current) < 0.05) return;
    if (deck.current.hand !== null) {
      reported.current = current;
      pos.set(current);
      return;
    }
    seek(current);
  });

  // Started or stopped (by a press, a key or the host): the motor answers.
  React.useEffect(() => {
    deck.current.ranOut = false;
    live.current?.wake();
  }, [isPlaying]);

  React.useEffect(() => {
    const d = deck.current;
    const node = rootRef.current;
    const observer =
      node && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (!entry) return;
            d.visible = entry.isIntersecting;
            if (d.visible) live.current?.wake();
          })
        : null;
    if (node) observer?.observe(node);
    const onVisibility = () => {
      if (!document.hidden) live.current?.wake();
    };
    const letGo = () => live.current?.release(0);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", letGo);
    live.current?.wake();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", letGo);
      if (d.raf) window.cancelAnimationFrame(d.raf);
      d.raf = 0;
      d.keyRun?.stop();
      d.keyRun = null;
    };
  }, []);

  // Sound switched off stops the loops with the kit; new ones start with
  // the next frame that needs them.
  React.useEffect(() => {
    scratch.current = null;
    whir.current = null;
  }, [audio]);

  React.useEffect(
    () => () => {
      armRun.current?.stop();
    },
    [],
  );

  React.useEffect(() => {
    if (disabled) live.current?.release(0);
  }, [disabled]);

  const drag = useDrag({
    disabled,
    onStart: ({ point, offset }) => {
      const d = deck.current;
      if (d.hand === "key") return;
      if (d.hand === null) handDown("drag", panFrom(point.x, null));
      d.hand = "drag";
      d.grab.c = centre();
      d.grab.last = bearing(
        { x: point.x - offset.x, y: point.y - offset.y },
        d.grab.c,
      );
      d.lastAngle = spin.get();
    },
    onMove: ({ point }) => {
      const d = deck.current;
      if (d.hand !== "drag") return;
      const a = bearing(point, d.grab.c);
      if (a === null) return;
      if (d.grab.last !== null) turnBy(turn(d.grab.last, a));
      d.grab.last = a;
      d.pan = panFrom(point.x, null);
    },
    onEnd: ({ point, velocity }) => {
      if (deck.current.hand !== "drag") return;
      release(spinOf(point, velocity, deck.current.grab.c));
    },
    onCancel: () => {
      if (deck.current.hand === "drag") release(0);
    },
    onTap: () => {
      // A touch that never moved: the record was held, and now it is not.
      if (deck.current.hand === "pointer") release(deck.current.omega);
    },
  });

  /** An arrow key is a hand on the record: it holds it and turns it. */
  const keyScrub = (seconds: number) => {
    const d = deck.current;
    if (d.hand !== null && d.hand !== "key") return;
    handDown("key", panFrom(centre().x, null));
    d.keyUp = false;
    d.keyTime = clamp((d.keyTime ?? pos.get()) + seconds, 0, dur);
    const by = (d.keyTime - pos.get()) * deg;
    if (!motionSafe) {
      turnBy(by);
      return;
    }
    d.keyRun?.stop();
    const from = spin.get();
    d.keyRun = animate(from, from + by, {
      ...springs.glide,
      onUpdate: (a) => turnBy(a - spin.get()),
      onComplete: () => {
        d.keyRun = null;
        if (d.keyUp) live.current?.release(0);
      },
    });
  };
  const keyLift = () => {
    const d = deck.current;
    if (d.hand !== "key") return;
    if (d.keyRun) d.keyUp = true;
    else release(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    const far = event.shiftKey ? 5 : 1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        keyScrub(far);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        keyScrub(-far);
        break;
      case "PageUp":
        drop(pos.get() + 10);
        break;
      case "PageDown":
        drop(pos.get() - 10);
        break;
      case "Home":
        drop(0);
        break;
      case "End":
        drop(dur);
        break;
      case " ":
      case "k":
      case "K":
        if (!event.repeat) setPlay(!isPlaying, true);
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key.startsWith("Arrow")) keyLift();
  };

  const rotate = useTransform(spin, (a) => r2(a % 360));
  const arm = useTransform([pos, armLag] as MotionValue<number>[], ([t, lag]) =>
    armAt(((t as number) + (lag as number)) / dur),
  );
  const elapsed = useTransform(pos, clock);
  const remaining = useTransform(
    pos,
    (t) => `−${clock(Math.ceil(dur - t - 0.05))}`,
  );
  const progress = useTransform(pos, (t) => {
    const f = clamp01(t / dur);
    if (f <= 0.001) return "";
    const [x0, y0] = polar(C, RING, 0);
    const [x1, y1] = polar(C, RING, Math.min(359.9, f * 360));
    return `M${x0} ${y0}A${RING} ${RING} 0 ${f > 0.5 ? 1 : 0} 1 ${x1} ${y1}`;
  });

  const valueText = `${spokenTime(Math.floor(current))} of ${spokenTime(dur)}, ${isPlaying ? "playing" : "stopped"}`;

  return (
    // The deck is drawn at one size and scaled down, whole, when its slot is
    // narrower: the hand's angle round the platter is the same at any scale.
    <div
      ref={setSlot}
      className={cn("relative w-full shrink-0", className)}
      style={{ maxWidth: W, height: r2(H * fit) }}
    >
      <div
        ref={rootRef}
        role="group"
        aria-labelledby={labelId}
        className={cn(
          "relative rounded-4 border border-hairline-strong bg-surface-2 select-none",
          disabled && "opacity-50",
        )}
        style={{
          width: W,
          height: H,
          boxShadow: "var(--edge-highlight)",
          scale: String(fit),
          transformOrigin: "0 0",
        }}
      >
        <span id={labelId} className="sr-only">
          {label}
        </span>
        <svg
          aria-hidden
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="pointer-events-none absolute -inset-px block"
        >
          {tonearm ? null : (
            <>
              <circle
                cx={C.x}
                cy={C.y}
                r={RING}
                fill="none"
                strokeWidth={1.5}
                className="stroke-hairline-strong"
              />
              <motion.path
                d={progress}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                className="stroke-cobalt-bright"
              />
            </>
          )}

          <motion.g style={{ rotate, originX: 0.5, originY: 0.5 }}>
            <circle
              cx={C.x}
              cy={C.y}
              r={PLATTER}
              strokeWidth={1}
              className="stroke-hairline-strong"
              style={{ fill: METAL }}
            />
            {DOTS.map(([x, y]) => (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r={0.9}
                style={{ fill: DOT }}
              />
            ))}
            <circle cx={C.x} cy={C.y} r={RECORD} style={{ fill: VINYL }} />
            <path
              d={GROOVES}
              fill="none"
              strokeWidth={0.6}
              style={{ stroke: GROOVE }}
            />
            <path
              d={GAPS}
              fill="none"
              strokeWidth={1.8}
              style={{ stroke: VINYL }}
            />
            <circle cx={C.x} cy={C.y} r={LABEL} style={{ fill: PAPER }} />
            <circle
              cx={C.x}
              cy={C.y}
              r={21}
              fill="none"
              strokeWidth={0.8}
              style={{ stroke: PRINT }}
            />
            <rect
              x={C.x - 11}
              y={C.y - 19}
              width={22}
              height={3}
              rx={1.5}
              style={{ fill: PRINT }}
            />
            <rect
              x={C.x - 7}
              y={C.y - 14.5}
              width={14}
              height={1.6}
              rx={0.8}
              style={{ fill: PRINT }}
            />
            <text
              x={C.x}
              y={C.y + 17}
              textAnchor="middle"
              className="font-mono text-[6px]"
              style={{ fill: PRINT }}
            >
              {fast ? "45 RPM" : "33⅓ RPM"}
            </text>
            <circle
              cx={C.x}
              cy={C.y}
              r={2.6}
              strokeWidth={0.8}
              className="stroke-hairline-strong"
              style={{ fill: METAL }}
            />
          </motion.g>
          <path d={SHEEN} style={{ fill: GLOSS }} />

          {tonearm ? (
            <>
              <circle
                cx={PIVOT.x}
                cy={PIVOT.y}
                r={16}
                strokeWidth={1}
                className="stroke-hairline-strong"
                style={{ fill: METAL }}
              />
              <motion.g style={{ rotate: arm, originX: 0.5, originY: 0.5 }}>
                {/* Invisible, centred on the pivot: it keeps the group's box
                  centred there, so the arm turns about the pivot. */}
                <circle cx={PIVOT.x} cy={PIVOT.y} r={ARM + 20} fill="none" />
                <rect
                  x={PIVOT.x - 34}
                  y={PIVOT.y - 6.5}
                  width={13}
                  height={13}
                  rx={3}
                  strokeWidth={1}
                  className="stroke-hairline-strong"
                  style={{ fill: METAL_DARK }}
                />
                <path
                  d={`M${PIVOT.x - 22} ${PIVOT.y}H${PIVOT.x + ARM - 12}`}
                  fill="none"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  style={{ stroke: METAL_DARK }}
                />
                <path
                  d={`M${PIVOT.x - 20} ${PIVOT.y - 0.8}H${PIVOT.x + ARM - 14}`}
                  fill="none"
                  strokeWidth={0.8}
                  strokeLinecap="round"
                  style={{ stroke: GLOSS }}
                />
                <path
                  d={`M${PIVOT.x + ARM - 15} ${PIVOT.y - 4.5}H${PIVOT.x + ARM + 3}L${PIVOT.x + ARM + 1} ${PIVOT.y + 4.5}H${PIVOT.x + ARM - 15}Z`}
                  strokeWidth={0.8}
                  className="stroke-hairline-strong"
                  style={{ fill: HEADSHELL }}
                />
              </motion.g>
              <circle
                cx={PIVOT.x}
                cy={PIVOT.y}
                r={5}
                strokeWidth={1}
                className="stroke-hairline-strong"
                style={{ fill: METAL_DARK }}
              />
            </>
          ) : null}
        </svg>

        <div
          ref={platterRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Position"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.floor(current)}
          aria-valuetext={valueText}
          aria-keyshortcuts="Space K"
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={keyLift}
          {...drag}
          onPointerDown={(event) => {
            drag.onPointerDown(event);
            if (disabled) return;
            if (event.pointerType === "mouse" && event.button !== 0) return;
            handDown("pointer", panFrom(event.clientX, null));
          }}
          onPointerCancel={(event) => {
            drag.onPointerCancel(event);
            if (deck.current.hand === "pointer") release(0);
          }}
          onPointerLeave={() => {
            // Left before it became a drag: nothing holds the record now.
            if (deck.current.hand === "pointer") release(deck.current.omega);
          }}
          className={cn(
            "absolute touch-none rounded-full outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab transition-shadow duration-150 hover:shadow-[inset_0_0_0_3px_var(--accent-wash)] active:cursor-grabbing",
          )}
          style={{
            left: C.x - PLATTER - 1,
            top: C.y - PLATTER - 1,
            width: PLATTER * 2,
            height: PLATTER * 2,
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute top-[112px] right-3 flex flex-col items-end gap-1.5"
        >
          <motion.span className="font-mono text-base leading-none text-foreground tabular-nums">
            {elapsed}
          </motion.span>
          <motion.span className="font-mono text-[10px] leading-none text-ink-3 tabular-nums">
            {remaining}
          </motion.span>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[25px] left-[206px] flex items-center gap-2 font-mono text-[10px] leading-none"
        >
          <span className={fast ? "text-ink-3" : "text-cobalt-bright"}>33</span>
          <span className={fast ? "text-cobalt-bright" : "text-ink-3"}>45</span>
        </div>

        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={disabled}
          onClick={() => setPlay(!isPlaying, true)}
          className={cn(
            "absolute right-3 bottom-3 inline-flex size-9 items-center justify-center rounded-full border border-hairline-strong bg-surface-1 text-foreground transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-not-allowed"
              : "cursor-pointer hover:border-ink-3/60 hover:bg-surface-0",
          )}
        >
          <svg aria-hidden viewBox="0 0 12 12" className="size-3 fill-current">
            {isPlaying ? (
              <>
                <rect x={2} y={1.5} width={2.6} height={9} rx={0.6} />
                <rect x={7.4} y={1.5} width={2.6} height={9} rx={0.6} />
              </>
            ) : (
              <path d="M3 1.6L10.4 6L3 10.4Z" />
            )}
          </svg>
          <span
            className={cn(
              "absolute top-1 right-1 size-1.5 rounded-full transition-colors",
              isPlaying ? "bg-signal" : "bg-ink-3/40",
            )}
          />
        </button>
      </div>
    </div>
  );
}
