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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SlideProjectorProps = {
  /** What the picture shows. It is on the picture from the first frame, loading or not. */
  alt: string;
  /** An image to load. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: an illustration, a slide. */
  children?: React.ReactNode;
  /**
   * Controlled: whether the picture is ready. Uncontrolled, an image is ready
   * once it has loaded, and children after a short warm-up.
   */
  ready?: boolean;
  /** How far the load has got, 0 to 1: the lens racks toward sharp as it climbs, never reaching it before `ready`. */
  progress?: number;
  /** Fires once per load, when the picture is sharp and square on the screen. */
  onReady?: () => void;
  /** The pace of the lamp, the focus hunt and the rack, 0.5 to 2. @default 1 */
  speed?: number;
  /** How far off square the slide arrives, 0 to 1. @default 0.5 */
  keystone?: number;
  /** Dust drifting in the beam while it loads. @default true */
  dust?: boolean;
  /** The screen's width over its height. @default 16 / 9 */
  ratio?: number;
  /** Shows the advance button. A press clacks the next slide in and calls this. */
  onAdvance?: () => void;
  /** The advance button's name. @default "Next slide" */
  advanceLabel?: string;
  /** The focus ring's name, shown beside it. @default "Focus" */
  focusLabel?: string;
  /** The advance's clack and the lens's hum, for the visitor's own hand. Off unless asked for. @default false */
  sound?: boolean;
  /** The load still plays; the ring and the advance cannot be used. */
  disabled?: boolean;
  className?: string;
};

/** Where on the ring the picture is sharp, and where a new slide starts. */
const SWEET = 0.6;
const START = 0.12;
/** Px of drag that turn the ring from one stop to the other. */
const RANGE = 220;
/** Px of blur per unit of ring away from sharp, and the most it blurs. */
const BLUR_PER = 30;
const BLUR_MAX = 9;
/** The steepest keystone, in degrees, and the perspective in screen heights. */
const TILT = 22;
const DEPTH = 2.2;
/** Seconds, at speed 1. */
const WARM = 1.1;
const MIN_RUN = 2.4;
const MIN_SHOW = 0.9;
/** Where the hunting lens drifts to: either side of sharp, never on it. */
const HUNT = [0.2, -0.16, 0.12, -0.19, 0.15, -0.11];
/** The distance scale printed on the barrel, as [ring position, label]. */
const SCALE: readonly (readonly [number, string])[] = [
  [0.05, "1"],
  [0.2, "1.5"],
  [0.32, "2"],
  [0.47, "3"],
  [0.6, "4"],
  [0.74, "6"],
  [0.86, "10"],
  [0.98, "∞"],
];
const MOTES = 28;

// Fixed art: a darkened room, lamp light from amber to warm white, a black
// anodised lens barrel. They are the same objects in either theme.
const ROOM = "oklch(0.24 0.012 260)";
const AMBER = "oklch(0.78 0.15 62)";
const WHITE = "oklch(0.985 0.012 90)";
const BARREL = "oklch(0.25 0.01 260)";
const KNURL =
  "repeating-linear-gradient(90deg, oklch(0.4 0.01 260) 0 1.5px, oklch(0.19 0.01 260) 1.5px 4px)";
const SHADE =
  "linear-gradient(180deg, oklch(1 0 0 / 0.16), transparent 32%, transparent 62%, oklch(0 0 0 / 0.42))";
const MOTE = "oklch(0.97 0.03 85)";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const blurOf = (f: number) =>
  Math.min(BLUR_MAX, Math.abs(f - SWEET) * BLUR_PER);

/** The lamp's light as it warms, 0 (amber, dim) to 1 (warm white). */
const lampOf = (w: number) =>
  `color-mix(in oklab, ${AMBER} ${Math.round((1 - clamp01(w)) * 100)}%, ${WHITE})`;

/** The pilot light: the lamp's colour, kept warm enough to read on any deck. */
const pilotOf = (w: number) =>
  `color-mix(in oklab, ${AMBER} ${Math.round(30 + (1 - clamp01(w)) * 70)}%, ${WHITE})`;

/** How much a keystoned slide shrinks so its wide top edge stays on the screen. */
const fitOf = (deg: number) => {
  const lift = 0.5 * Math.sin((deg * Math.PI) / 180);
  return 0.92 / (DEPTH / (DEPTH - lift));
};

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Mote = {
  x: number;
  y: number;
  r: number;
  phase: number;
  turn: number;
  depth: number;
};

const motesOf = (seed: number): Mote[] => {
  const rand = lcg(seed);
  return Array.from({ length: MOTES }, () => ({
    x: rand(),
    y: rand(),
    r: 0.5 + rand() * 1.2,
    phase: rand() * Math.PI * 2,
    turn: 0.6 + rand() * 2.4,
    depth: rand(),
  }));
};

type Phase = "loading" | "racking" | "sharp";

type Api = {
  start: (byHand: boolean) => void;
  settleReady: () => void;
  followProgress: () => void;
  setVisible: (v: boolean) => void;
  stop: () => void;
  grab: () => void;
  follow: (dx: number, t: number) => void;
  letGo: (vx: number) => void;
  nudge: (to: number) => void;
  advance: () => void;
  drawDust: (now: number) => void;
  sizeDust: () => void;
};

function Mark({ at, label }: { at: number; label: string }) {
  return (
    <span
      className="absolute top-0 -translate-x-1/2 font-mono text-[8px] leading-[11px] tabular-nums"
      style={{ left: r2(-at * RANGE), color: "oklch(0.92 0.01 90)" }}
    >
      {label}
    </span>
  );
}

/**
 * A picture that arrives as a slide on a projection screen. The projector
 * clicks the slide in — it drops into the gate with a small double bounce —
 * and the lamp warms from amber to white while the picture sits keystoned
 * (the projector is below the screen, so the top is wider) and out of focus.
 * While the picture is not ready the lens hunts, drifting to one side of
 * sharp and then the other, and dust drifts and glints in the beam. When it
 * is ready the focus racks it sharp and the projector levels: the keystone
 * squares up and the slide grows to fill the screen, and the plain picture
 * takes over.
 *
 * Below the screen is the projector's deck: a pilot light that warms with
 * the lamp, the lens barrel's focus ring — a real slider, turned by dragging
 * it 1:1 or by the arrow keys — and, when the host passes `onAdvance`, the
 * advance button. Under reduced motion nothing drops, hunts or drifts: the
 * slide fades in keystoned and soft, the lamp still warms, and at ready the
 * sharp, square picture cross-fades in.
 */
export function SlideProjector({
  alt,
  src,
  children,
  ready,
  progress,
  onReady,
  speed = 1,
  keystone = 0.5,
  dust = true,
  ratio = 16 / 9,
  onAdvance,
  advanceLabel = "Next slide",
  focusLabel = "Focus",
  sound = false,
  disabled = false,
  className,
}: SlideProjectorProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const labelId = `${uid}-focus`;
  const pace = Math.min(2, Math.max(0.5, speed));
  const tilt = clamp01(keystone) * TILT;
  const aspect = Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;

  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const [ranOut, setRanOut] = React.useState(false);
  const isReady = ready ?? (src !== undefined ? loadedSrc === src : ranOut);

  const [sharp, setSharp] = React.useState(false);
  const [shown, setShown] = React.useState(START);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [motes] = React.useState(() => motesOf(0x51a7e));

  const focus = useMotionValue(START);
  const warm = useMotionValue(0);
  const level = useMotionValue(0);
  const drop = useMotionValue(0);
  const slideIn = useMotionValue(0);
  const beam = useMotionValue(1);
  const lit = useMotionValue(1);
  const dustOpacity = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const screenRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const phase = React.useRef<Phase>("loading");
  const readyRef = React.useRef(isReady);
  const progressRef = React.useRef(progress);
  const visible = React.useRef(true);
  const clock = React.useRef({ since: 0, banked: 0 });
  const touched = React.useRef(false);
  const handAdvanced = React.useRef(false);
  const hunt = React.useRef(0);
  const reported = React.useRef(false);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const runTimer = React.useRef(0);
  const frame = React.useRef(0);
  const dustSize = React.useRef({ w: 0, h: 0, dpr: 1 });
  const dustColour = React.useRef(MOTE);
  const grip = React.useRef<{ start: number; last: number; t: number } | null>(
    null,
  );
  const hum = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef(0);
  const api = React.useRef<Api | null>(null);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };
  const halt = (key: string) => {
    running.current.get(key)?.stop();
    running.current.delete(key);
  };

  const wait = (seconds: number, fn: () => void) => {
    const id = window.setTimeout(
      () => {
        timers.current.delete(id);
        fn();
      },
      Math.round(seconds * 1000),
    );
    timers.current.add(id);
  };

  const elapsed = () =>
    clock.current.banked +
    (clock.current.since
      ? (performance.now() - clock.current.since) / 1000
      : 0);

  const report = (f: number) => setShown(r3(clamp01(f)));

  /* ----------------------------- the beam's dust ---------------------------- */

  const drawDust = (now: number) => {
    frame.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const { w, h, dpr } = dustSize.current;
    if (!canvas || !ctx || w < 1 || h < 1) return;
    const t = now / 1000;
    const glow = 0.35 + 0.65 * warm.get();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = dustColour.current;
    for (const m of motes) {
      // A slow flow field: each mote rises and wanders at its own depth.
      const x =
        (((m.x +
          t * (0.006 + 0.012 * m.depth) +
          0.03 * Math.sin(t * 0.35 + m.phase)) %
          1) +
          1) %
        1;
      const y =
        (((m.y -
          t * (0.004 + 0.006 * m.depth) +
          0.04 * Math.cos(t * 0.27 + m.phase)) %
          1) +
          1) %
        1;
      // A flake turning catches the light, then goes edge-on.
      const glint = 0.25 + 0.75 * Math.abs(Math.sin(t * m.turn + m.phase));
      // Only the beam lights a mote; out in the room it is barely there.
      const inBeam = x > 0.06 && x < 0.94 && y > 0.04 && y < 0.96 ? 1 : 0.3;
      const r = m.r * (0.7 + 0.6 * m.depth);
      ctx.globalAlpha = Math.min(
        1,
        glow * glint * inBeam * (0.35 + 0.5 * m.depth),
      );
      ctx.beginPath();
      ctx.arc(x * w, y * h, r, 0, Math.PI * 2);
      ctx.fill();
      if (r > 1.1) {
        ctx.globalAlpha *= 0.18;
        ctx.beginPath();
        ctx.arc(x * w, y * h, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (motionSafe && visible.current && dust && phase.current !== "sharp") {
      frame.current = window.requestAnimationFrame((n) =>
        api.current?.drawDust(n),
      );
    }
  };

  const startDust = () => {
    if (frame.current || !dust || phase.current === "sharp") return;
    if (!visible.current) return;
    // Reduced motion draws one still frame.
    frame.current = window.requestAnimationFrame((n) =>
      api.current?.drawDust(n),
    );
  };

  const stopDust = () => {
    if (frame.current) window.cancelAnimationFrame(frame.current);
    frame.current = 0;
  };

  const sizeDust = () => {
    const canvas = canvasRef.current;
    const screen = screenRef.current;
    if (!canvas || !screen) return;
    const w = screen.clientWidth;
    const h = screen.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    dustSize.current = { w, h, dpr };
    // The motes' colour lives on the canvas itself, read once per size.
    dustColour.current = getComputedStyle(canvas).color || MOTE;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    stopDust();
    startDust();
  };

  /* --------------------------------- the load -------------------------------- */

  const hunting = () =>
    phase.current === "loading" &&
    motionSafe &&
    visible.current &&
    !touched.current &&
    !readyRef.current &&
    progressRef.current === undefined;

  /** The lens drifts past sharp one way, then the other, never landing on it. */
  const huntNext = () => {
    if (!hunting()) return;
    const step = HUNT[hunt.current % HUNT.length] ?? 0.15;
    hunt.current += 1;
    run(
      "focus",
      animate(focus, SWEET + step, {
        ...springs.drift,
        onComplete: () => wait(0.35 / pace, huntNext),
      }),
    );
  };

  /** Children are ready after a short warm-up of on-screen time. */
  const armRun = () => {
    window.clearTimeout(runTimer.current);
    runTimer.current = 0;
    if (ready !== undefined || src !== undefined || !visible.current) return;
    if (phase.current !== "loading") return;
    const left = MIN_RUN / pace - elapsed();
    runTimer.current = window.setTimeout(
      () => setRanOut(true),
      Math.max(0, Math.round(left * 1000)),
    );
  };

  const finish = () => {
    if (phase.current === "sharp") return;
    phase.current = "sharp";
    stopDust();
    // Reduced, the rack was a cross-fade to the sharp picture: the ring is
    // set to sharp now, in one step, so the picture stays that way.
    if (!motionSafe) {
      halt("focus");
      focus.set(SWEET);
    }
    report(focus.get());
    setSharp(true);
    say("Slide in focus.");
    if (!reported.current) {
      reported.current = true;
      onReady?.();
    }
  };

  /** Focus racks it sharp, the projector levels, the beam gives way. */
  const rack = () => {
    if (phase.current !== "loading") return;
    phase.current = "racking";
    halt("focus");
    run(
      "warm",
      animate(warm, 1, { duration: durations.slow, ease: easings.enter }),
    );
    run(
      "beam",
      animate(beam, 0, { duration: durations.slow, ease: easings.enter }),
    );
    run(
      "dust",
      animate(dustOpacity, 0, { duration: durations.slow, ease: easings.exit }),
    );
    if (!motionSafe) {
      run(
        "lit",
        animate(lit, 0, {
          duration: durations.slow,
          ease: easings.enter,
          onComplete: finish,
        }),
      );
      return;
    }
    // The plain picture takes over once the projector has levelled. The
    // focus may still be settling (or in a visitor's hand): the picture
    // carries the same blur, so the hand-over has no seam.
    run("focus", animate(focus, SWEET, springs.glide));
    run(
      "level",
      animate(level, 1, { ...springs.glide, delay: 0.08, onComplete: finish }),
    );
  };

  const settleReady = () => {
    if (!readyRef.current || phase.current !== "loading") return;
    // The slide has to be in and the lamp lit before it can be racked.
    const left = MIN_SHOW / pace - elapsed();
    if (left > 0) wait(left, () => api.current?.settleReady());
    else rack();
  };

  const followProgress = () => {
    if (phase.current !== "loading" || touched.current) return;
    const p = progressRef.current;
    if (p === undefined) return;
    const target = lerp(START, SWEET - 0.07, clamp01(p));
    if (!motionSafe) {
      focus.set(target);
      return;
    }
    run("focus", animate(focus, target, springs.glide));
  };

  const stop = () => {
    for (const c of running.current.values()) c.stop();
    running.current.clear();
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    window.clearTimeout(runTimer.current);
    runTimer.current = 0;
    window.clearTimeout(hush.current);
    hum.current?.stop();
    hum.current = null;
    stopDust();
  };

  /** A slide clicks into the gate and the lamp warms. */
  const start = (byHand: boolean) => {
    stop();
    phase.current = "loading";
    touched.current = false;
    reported.current = false;
    hunt.current = 0;
    clock.current = {
      since: visible.current ? performance.now() : 0,
      banked: 0,
    };
    setSharp(false);
    setRanOut(false);
    focus.set(START);
    report(START);
    warm.set(0);
    level.set(0);
    beam.set(1);
    lit.set(1);
    dustOpacity.set(1);
    slideIn.set(0);
    // The gate is dark for a moment, then the slide drops in and lands.
    if (motionSafe) {
      drop.set(-distances.shift);
      wait(0.12, () => {
        run(
          "slide",
          animate(slideIn, 1, {
            duration: durations.fast,
            ease: easings.enter,
          }),
        );
        run("drop", animate(drop, 0, springs.recoil));
        if (byHand) {
          wait(0.09, () => audio.play("clack", { pitch: 0.82, gain: 0.32 }));
        }
      });
    } else {
      drop.set(0);
      run(
        "slide",
        animate(slideIn, 1, { duration: durations.base, ease: easings.enter }),
      );
      if (byHand) {
        wait(0.12, () => audio.play("clack", { pitch: 0.82, gain: 0.32 }));
      }
    }
    run(
      "warm",
      animate(warm, 1, {
        duration: WARM / pace,
        delay: 0.15,
        ease: easings.enter,
      }),
    );
    wait(0.5 / pace, huntNext);
    armRun();
    startDust();
    followProgress();
    settleReady();
    handAdvanced.current = false;
  };

  const setVisible = (v: boolean) => {
    if (v === visible.current) return;
    visible.current = v;
    if (v) {
      clock.current.since = performance.now();
      armRun();
      startDust();
      if (phase.current === "loading" && !running.current.has("focus")) {
        huntNext();
      }
    } else {
      clock.current.banked = elapsed();
      clock.current.since = 0;
      window.clearTimeout(runTimer.current);
      runTimer.current = 0;
      stopDust();
      if (phase.current === "loading" && !touched.current) halt("focus");
    }
  };

  /* --------------------------------- the hand -------------------------------- */

  const humAt = (speedPerSecond: number) => {
    if (!hum.current) {
      const rect = rootRef.current?.getBoundingClientRect();
      hum.current = audio.start("hum", {
        pitch: 0.8,
        gain: 0,
        pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
      });
    }
    const s = Math.min(1.5, Math.abs(speedPerSecond));
    hum.current.set({
      pitch: r2(0.8 + s * 0.5),
      gain: r2(Math.min(0.7, 0.2 + s * 0.4)),
    });
    window.clearTimeout(hush.current);
    hush.current = window.setTimeout(() => {
      hum.current?.set({ gain: 0 });
    }, 90);
  };

  const quiet = () => {
    window.clearTimeout(hush.current);
    hum.current?.stop();
    hum.current = null;
  };

  const grab = () => {
    touched.current = true;
    halt("focus");
    grip.current = { start: focus.get(), last: focus.get(), t: 0 };
  };

  const follow = (dx: number, t: number) => {
    const g = grip.current;
    if (!g) return;
    // 1:1 under the finger; past either stop the ring rubber-bands.
    const f = r3(rubberClamp(g.start + dx / RANGE, 0, 1, 0.06));
    if (g.t > 0 && t > g.t) humAt(((f - g.last) * 1000) / (t - g.t));
    g.last = f;
    g.t = t;
    focus.set(f);
  };

  const letGo = (vx: number) => {
    grip.current = null;
    quiet();
    const v = vx / RANGE;
    if (!motionSafe) {
      const f = clamp01(focus.get());
      focus.set(f);
      report(f);
      return;
    }
    const target = r3(clamp01(project(focus.get(), v, 0.99)));
    report(target);
    run("focus", animate(focus, target, { ...springs.glide, velocity: v }));
  };

  /** A key's turn of the ring. */
  const nudge = (to: number) => {
    if (disabled) return;
    touched.current = true;
    const f = r3(clamp01(to));
    report(f);
    humAt(1);
    if (!motionSafe) {
      halt("focus");
      focus.set(f);
      return;
    }
    run("focus", animate(focus, f, springs.snap));
  };

  const advance = () => {
    if (disabled) return;
    const rect = rootRef.current?.getBoundingClientRect();
    audio.play("clack", {
      gain: 0.6,
      pan: rect ? panFrom(rect.left + 24, null) : 0,
    });
    handAdvanced.current = true;
    onAdvance?.();
    // A ready picture going unready clicks the next slide in through the
    // readiness effect: a controlled host does that itself, uncontrolled
    // children are made unready here. Anything already unready, or an image
    // already loaded, starts over at once.
    if (isReady && (ready !== undefined || src === undefined)) {
      if (ready === undefined) setRanOut(false);
      return;
    }
    start(true);
  };

  React.useEffect(() => {
    api.current = {
      start,
      settleReady,
      followProgress,
      setVisible,
      stop,
      grab,
      follow,
      letGo,
      nudge,
      advance,
      drawDust,
      sizeDust,
    };
  });

  // Readiness from the host or the load; taken away, the next slide clicks in.
  const shownReady = React.useRef(isReady);
  React.useEffect(() => {
    readyRef.current = isReady;
    if (shownReady.current === isReady) return;
    const was = shownReady.current;
    shownReady.current = isReady;
    if (was && !isReady) {
      const byHand = handAdvanced.current;
      handAdvanced.current = false;
      api.current?.start(byHand);
    } else api.current?.settleReady();
  }, [isReady]);

  React.useEffect(() => {
    progressRef.current = progress;
    api.current?.followProgress();
  }, [progress]);

  // The first slide, or after StrictMode's rehearsal the same one again.
  React.useEffect(() => {
    api.current?.start(false);
    return () => api.current?.stop();
  }, []);

  React.useEffect(() => {
    const onVisibility = () => api.current?.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Dust switched on or off, or motion allowed again, redraws it.
  React.useEffect(() => {
    api.current?.sizeDust();
  }, [dust, motionSafe]);

  React.useEffect(() => {
    if (!sound) quiet();
  }, [sound]);

  const bindScreen = React.useCallback((node: HTMLDivElement | null) => {
    screenRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.sizeDust());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      api.current?.setVisible(
        Boolean(entry?.isIntersecting) && !document.hidden,
      );
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // The canvas comes and goes with each load; it is sized when it arrives.
  const bindCanvas = React.useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (node) api.current?.sizeDust();
  }, []);

  const bindImage = React.useCallback(
    (node: HTMLImageElement | null) => {
      // Settled before hydration: its load (or error) event has been and gone.
      if (node && src !== undefined && node.complete) setLoadedSrc(src);
    },
    [src],
  );

  const drag = useDrag({
    axis: "x",
    threshold: 2,
    disabled,
    onStart: () => api.current?.grab(),
    onMove: ({ offset, event }) =>
      api.current?.follow(offset.x, event.timeStamp),
    onEnd: ({ velocity }) => api.current?.letGo(velocity.x),
    onCancel: () => api.current?.letGo(0),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || disabled) return;
    const step = (d: number) => {
      event.preventDefault();
      a.nudge(shown + d);
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        step(0.02);
        return;
      case "ArrowLeft":
      case "ArrowDown":
        step(-0.02);
        return;
      case "PageUp":
        step(0.1);
        return;
      case "PageDown":
        step(-0.1);
        return;
      case "Home":
        event.preventDefault();
        a.nudge(0);
        return;
      case "End":
        event.preventDefault();
        a.nudge(1);
        return;
    }
  };

  /* ------------------------------ derived styles ------------------------------ */

  const lamp = useTransform(warm, lampOf);
  const dim = useTransform(warm, (w) => r3(0.45 * (1 - clamp01(w))));
  const tint = useTransform(
    [warm, beam] as MotionValue<number>[],
    ([w = 0, b = 1]: number[]) => r3(Math.max(0, 1 - clamp01(w)) * 0.9 * b),
  );
  const pilotFill = useTransform(warm, pilotOf);
  const pilot = useTransform(
    warm,
    (w) =>
      `0 0 ${r2(3 + 5 * w)}px ${r2(0.5 + w)}px color-mix(in oklab, ${pilotOf(w)} ${Math.round(40 + 40 * w)}%, transparent)`,
  );
  const slide = useTransform(
    [level, drop] as MotionValue<number>[],
    ([l = 0, d = 0]: number[]) => {
      const deg = tilt * (1 - l);
      const s = lerp(fitOf(tilt), 1, l);
      return `translateY(${r2(d)}px) perspective(${Math.round(DEPTH * 100)}cqh) rotateX(${r3(-deg)}deg) scale(${r3(s)})`;
    },
  );
  const blur = useTransform(focus, (f) => {
    const b = r2(blurOf(f));
    return b < 0.05 ? "none" : `blur(${b}px)`;
  });
  const knurl = useTransform(focus, (f) => `${r2(f * RANGE)}px 0`);
  const strip = useTransform(focus, (f) => r2(f * RANGE));

  const describe = (f: number) => {
    const d = f - SWEET;
    if (Math.abs(d) < 0.02) return "Sharp";
    return `Soft, turn ${d < 0 ? "right" : "left"} to sharpen`;
  };

  const copy =
    src !== undefined ? (
      // A registry component cannot depend on a framework's image loader.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        draggable={false}
        className="block size-full object-cover"
      />
    ) : (
      children
    );

  return (
    <div
      ref={rootRef}
      aria-busy={!sharp || undefined}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <div
        ref={bindScreen}
        className="[container-type:size] relative isolate w-full overflow-clip rounded-3 border border-hairline"
        style={{ aspectRatio: String(r3(aspect)), backgroundColor: ROOM }}
      >
        <motion.div
          className="absolute inset-0"
          style={sharp ? { filter: blur } : undefined}
        >
          {src !== undefined ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={bindImage}
              src={src}
              alt={alt}
              draggable={false}
              // A picture that fails to arrive is racked in too: its alt is
              // all there is to show, and a loader must not hunt forever.
              onLoad={() => setLoadedSrc(src)}
              onError={() => setLoadedSrc(src)}
              className="block size-full object-cover"
            />
          ) : (
            <div role="img" aria-label={alt} className="size-full">
              {children}
            </div>
          )}
        </motion.div>

        {sharp ? null : (
          <>
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: lit,
                backgroundColor: ROOM,
                backgroundImage:
                  "radial-gradient(120% 90% at 50% 120%, oklch(0.32 0.015 260), transparent 70%)",
              }}
            />
            <motion.div
              aria-hidden
              inert
              className="pointer-events-none absolute inset-0 overflow-clip will-change-transform"
              style={{
                transform: slide,
                opacity: lit,
                backgroundColor: lamp,
                filter: blur,
              }}
            >
              {/* The slide drops into the gate; the light frame stays put. */}
              <motion.div
                className="absolute inset-0"
                style={{ opacity: slideIn, y: drop }}
              >
                {copy}
              </motion.div>
              <motion.div
                className="absolute inset-0 mix-blend-multiply"
                style={{ backgroundColor: lamp, opacity: tint }}
              />
              <motion.div
                className="absolute inset-0 bg-black"
                style={{ opacity: dim }}
              />
              <motion.div
                className="absolute inset-0"
                style={{
                  opacity: beam,
                  backgroundImage:
                    "radial-gradient(closest-side circle at 50% 46%, oklch(1 0 0 / 0.2), transparent), radial-gradient(farthest-corner at 50% 50%, transparent 55%, oklch(0 0 0 / 0.38))",
                }}
              />
            </motion.div>
            {dust ? (
              <motion.canvas
                ref={bindCanvas}
                aria-hidden
                className="pointer-events-none absolute inset-0 size-full"
                style={{ color: MOTE, opacity: dustOpacity }}
              />
            ) : null}
          </>
        )}
      </div>

      <div className="flex h-9 items-center gap-2 rounded-3 border border-hairline bg-surface-1 px-1.5">
        {onAdvance ? (
          <button
            type="button"
            aria-label={advanceLabel}
            disabled={disabled}
            onClick={() => api.current?.advance()}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 text-ink-2 transition-colors outline-none",
              "hover:text-foreground active:scale-95",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0">
              <path d="M4 3.5 L10.5 8 L4 12.5 Z" fill="currentColor" />
              <rect
                x="11.5"
                y="3.5"
                width="1.8"
                height="9"
                rx="0.9"
                fill="currentColor"
              />
            </svg>
          </button>
        ) : null}
        <motion.span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full border border-hairline-strong"
          style={{ backgroundColor: pilotFill, boxShadow: pilot }}
        />
        <span
          id={labelId}
          className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {focusLabel}
        </span>
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(shown * 100)}
          aria-valuetext={describe(shown)}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onKeyUp={() => {
            if (!grip.current) quiet();
          }}
          onBlur={() => {
            if (!grip.current) quiet();
          }}
          {...drag}
          className={cn(
            "relative h-7 min-w-0 flex-1 touch-pan-y overflow-clip rounded-2 outline-none select-none [-webkit-touch-callout:none]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-ew-resize hover:brightness-110",
          )}
          style={{ backgroundColor: BARREL }}
        >
          <motion.div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[11px]"
            style={{ x: strip }}
          >
            <div className="absolute top-0 left-1/2">
              {SCALE.map(([at, label]) => (
                <Mark key={label} at={at} label={label} />
              ))}
            </div>
          </motion.div>
          <motion.div
            aria-hidden
            className="absolute inset-x-0 top-[12px] bottom-0"
            style={{ backgroundImage: KNURL, backgroundPosition: knurl }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: SHADE }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 left-1/2 h-[11px] w-px -translate-x-1/2"
            style={{ backgroundColor: AMBER }}
          />
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
