"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type InstantShakeTint = "cool" | "warm";
export type InstantShakeFrame = "classic" | "wide";

export type InstantShakeProps = {
  /** What the picture shows. Exposed the whole time, while it develops and after. */
  alt: string;
  /** The image to develop. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: any element that fills its box. */
  children?: React.ReactNode;
  /** Written into the frame's chin when the photo is done. */
  caption?: string;
  /**
   * Controlled: whether the picture is ready. Uncontrolled, an image is ready
   * once it has loaded (or failed), and children at once — the photo's own
   * chemistry is then the minimum run.
   */
  ready?: boolean;
  /** How much of the picture has arrived, 0 to 1. Until ready, the chemistry holds exactly there. */
  progress?: number;
  /** Fires once per photo, when it has come up and let go of the camera. */
  onReady?: () => void;
  /** How fast the photo feeds out and comes up, 0.5 to 2. @default 1 */
  speed?: number;
  /** The film's murk and colour cast while it develops: blue-grey or brown-amber. @default "cool" */
  tint?: InstantShakeTint;
  /** The format: a square window with a deep chin, or a landscape one. @default "classic" */
  frame?: InstantShakeFrame;
  /** Play the swish of a shake and the motor when a photo is pulled out. Off unless asked for. @default false */
  sound?: boolean;
  /** The photo still feeds out and develops; it cannot be shaken or pulled. */
  disabled?: boolean;
  /** Sizes the instrument's width. @default "w-full max-w-72" */
  className?: string;
};

type Phase = "developing" | "releasing" | "done";

type Format = {
  /** The photo's width and height, in any unit. */
  w: number;
  h: number;
  /** The border beside and above the window, as shares of the photo's width. */
  side: number;
  top: number;
  /** The window's width over its height. */
  window: number;
  /** The photo's width as a share of the instrument's. */
  span: number;
};

const FORMATS: Record<InstantShakeFrame, Format> = {
  classic: { w: 88, h: 107, side: 0.055, top: 0.055, window: 1, span: 0.7 },
  wide: { w: 108, h: 86, side: 0.042, top: 0.046, window: 99 / 62, span: 0.78 },
};

/** The camera's bar, and the slit the photo hangs from, as shares of the width. */
const BAR = 0.085;
const SLIT = 0.06;
/** Room under the photo for the drop when the rollers let go. */
const TAIL = 0.06;
/** Seconds of development at speed 1 with no shaking. */
const BASE = 4;
/** Seconds for the motor to feed the photo out at speed 1. */
const FEED = 1;
/** Where an indeterminate photo waits while its picture is not ready. */
const LATENT = 0.8;
/** How far a swing may go before it rubber-bands, in degrees. */
const REACH = 5;

// Fixed art, the same in both themes: white film stock, and the murk and
// cast of each tint.
const STOCK = "oklch(0.975 0.004 95)";
const INK = "oklch(0.32 0.03 265)";
const TINTS: Record<InstantShakeTint, { murk: string; cast: string }> = {
  cool: { murk: "oklch(0.36 0.035 238", cast: "oklch(0.62 0.13 215)" },
  warm: { murk: "oklch(0.4 0.045 62", cast: "oklch(0.72 0.13 68)" },
};
/** Seeded fractal noise: the chemistry's mottle, drawn once and tiled. */
const MOTTLE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='m' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.045' numOctaves='3' seed='4' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.6 1.1'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23m)'/%3E%3C/svg%3E\")";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator, so the mottle is the same on server and client. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Patch = { x: number; y: number; rx: number; ry: number; late: number };

/** Five patches of murk, each clearing a little later than the rest. */
function patchesOf(seed: number): Patch[] {
  const rand = lcg(seed);
  return Array.from({ length: 5 }, () => ({
    x: r3(18 + rand() * 64),
    y: r3(18 + rand() * 64),
    rx: r3(34 + rand() * 26),
    ry: r3(30 + rand() * 24),
    late: r3(rand() * 0.16),
  }));
}

/** The murk over the picture: a flat base that thins, and patches that linger. */
function murkOf(
  d: number,
  sway: number,
  patches: readonly Patch[],
  murk: string,
): string {
  const c = (a: number) => `${murk} / ${r3(clamp01(a))})`;
  const base = 1 - smooth(0.04, 0.78, d);
  const layers = patches.map((p) => {
    const a = 0.75 * (1 - smooth(0.12 + p.late, 0.92 + p.late * 0.5, d));
    return `radial-gradient(${p.rx}% ${p.ry}% at ${r3(p.x + sway)}% ${p.y}%, ${c(a)}, ${c(0)})`;
  });
  layers.push(`linear-gradient(${c(base)}, ${c(base)})`);
  return layers.join(", ");
}

/** The picture under the chemistry: dark, flat and grey at first. */
function filmOf(d: number): string {
  if (d >= 1) return "none";
  const b = 0.55 + 0.45 * smooth(0.05, 0.9, d);
  const c = 0.6 + 0.4 * smooth(0.15, 0.95, d);
  const s = 0.1 + 0.9 * smooth(0.3, 1, d);
  return `brightness(${r3(b)}) contrast(${r3(c)}) saturate(${r3(s)})`;
}

type Swing = {
  mode: "swing" | "pull" | null;
  grip: number;
  feedFrom: number;
  /** The pointer's distance below the slit when it took hold, in px. */
  arm: number;
  dir: number;
  from: number;
  last: number;
  lastT: number;
};

type Api = {
  reset: () => void;
  step: (dt: number) => boolean;
  eject: () => void;
};

/**
 * An image placeholder presented as an instant photo feeding out of a
 * camera. The photo slides out of the slot at a motor's steady pace and hangs
 * from it; in its window the real picture comes up under a film of chemistry
 * — a blue-grey (or brown-amber) murk that thins in mottled patches while the
 * picture beneath gains brightness, contrast and colour and loses its cast.
 *
 * Grab the photo and shake it: it swings from the slot like a pendulum, 1:1
 * under the finger, skewing a little against its own speed, and every
 * reversal is a stroke that agitates the chemistry — shake hard and it comes
 * up in half the time. Released, it swings home on the recoil spring. While
 * it is still feeding, a downward drag pulls it out by hand, over the
 * motor's whir. A determinate `progress` holds it at exactly that stage.
 * When it is done, the caption is written into the chin, the rollers let go
 * and the photo drops onto its own weight.
 *
 * The shake is a real button: Arrow keys swing it (one stroke each), Enter or
 * Space shakes it three times, ArrowDown pulls a feeding photo out. The clock
 * runs only while developing, on screen, in a visible page. Under reduced
 * motion nothing swings, slides or drops; shaking still speeds the chemistry,
 * and the murk still clears.
 */
export function InstantShake({
  alt,
  src,
  children,
  caption,
  ready,
  progress,
  onReady,
  speed = 1,
  tint = "cool",
  frame = "classic",
  sound = false,
  disabled = false,
  className,
}: InstantShakeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const pace = clamp(speed, 0.5, 2);
  const format = FORMATS[frame] ?? FORMATS.classic;
  const film = TINTS[tint] ?? TINTS.cool;
  const patches = React.useMemo(() => patchesOf(hash(alt)), [alt]);

  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const loaded = src !== undefined && loadedSrc === src;
  const [phase, setPhase] = React.useState<Phase>("developing");
  const [sheet, setSheet] = React.useState(0);
  const isReady =
    ready ?? (src ? loaded : progress === undefined || progress >= 1);

  // A new image, or a host that takes a finished photo back to not ready,
  // feeds a fresh one out.
  const [seen, setSeen] = React.useState({ src, isReady });
  if (seen.src !== src || seen.isReady !== isReady) {
    setSeen({ src, isReady });
    if (
      seen.src !== src ||
      (seen.isReady && !isReady && phase !== "developing")
    ) {
      setPhase("developing");
      setSheet((n) => n + 1);
    }
  }
  const developing = phase === "developing";

  const feed = useMotionValue(0);
  const angle = useMotionValue(0);
  const drop = useMotionValue(0);
  const tone = useMotionValue(0);
  const sway = useMotionValue(0);
  const writing = useMotionValue(0);
  const bar = useMotionValue(1);
  const shown = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const photoRef = React.useRef<HTMLDivElement | null>(null);
  const windowRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const whir = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef<number | null>(null);
  const dev = React.useRef({ d: 0, agitation: 0, holding: false });
  const swing = React.useRef<Swing>({
    mode: null,
    grip: 0,
    feedFrom: 0,
    arm: 200,
    dir: 0,
    from: 0,
    last: 0,
    lastT: 0,
  });
  const phaseRef = React.useRef<Phase>("developing");
  const resetFor = React.useRef(0);
  const loadedFor = React.useRef<string | null>(null);
  const visible = React.useRef(true);
  const wake = React.useRef<(() => void) | null>(null);
  const refocus = React.useRef(false);
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
  const clearHush = () => {
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = null;
  };
  const stopWhir = () => {
    clearHush();
    whir.current?.stop();
    whir.current = null;
  };

  const ceiling = () => {
    let top = isReady ? 1 : progress !== undefined ? clamp01(progress) : LATENT;
    // An image that has not arrived stays under the murk.
    if (src && !loaded) top = Math.min(top, 0.25);
    return top;
  };

  const reset = () => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    clearTimers();
    stopWhir();
    dev.current = { d: 0, agitation: 0, holding: false };
    swing.current.mode = null;
    phaseRef.current = "developing";
    feed.set(0);
    shown.set(1);
    angle.set(0);
    drop.set(0);
    tone.set(0);
    sway.set(0);
    writing.set(0);
    bar.set(1);
  };

  /** The motor feeds the photo out from wherever it is, at its own pace. */
  const eject = () => {
    if (anims.current.has("feed") || swing.current.mode === "pull") return;
    if (!motionSafe) {
      // Nothing slides: the photo is simply there, fading in.
      if (feed.get() >= 1) return;
      shown.set(0);
      feed.set(1);
      run(
        "shown",
        animate(shown, 1, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    const left = 1 - feed.get();
    if (left <= 0) return;
    run(
      "feed",
      animate(feed, 1, {
        duration: (left * FEED) / pace,
        ease: easings.linear,
        onComplete: () => {
          anims.current.delete("feed");
          // The rollers stop; the photo's own momentum swings it once.
          if (!dev.current.holding) {
            run(
              "angle",
              animate(angle, 0, { ...springs.recoil, velocity: 40 }),
            );
          }
        },
      }),
    );
  };

  /** Done: the caption is written, the rollers let go, the bar leaves. */
  const release = () => {
    if (phaseRef.current !== "developing") return;
    phaseRef.current = "releasing";
    clearTimers();
    stopWhir();
    setPhase("releasing");
    const finish = () => {
      if (phaseRef.current !== "releasing") return;
      phaseRef.current = "done";
      setPhase("done");
      onReady?.();
    };
    run(
      "bar",
      animate(bar, 0, { duration: durations.base, ease: easings.exit }),
    );
    if (!motionSafe) {
      run(
        "writing",
        animate(writing, 1, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: finish,
        }),
      );
      return;
    }
    run("writing", animate(writing, 1, { duration: 0.6, ease: easings.move }));
    run("angle", animate(angle, 0, springs.recoil));
    run(
      "drop",
      animate(drop, distances.step, { ...springs.recoil, onComplete: finish }),
    );
  };

  /** One step of the chemistry. */
  const step = (dt: number): boolean => {
    const st = dev.current;
    if (feed.get() < 1) eject();
    st.agitation *= Math.exp(-dt / 0.9);
    const top = ceiling();
    const rate = (pace / BASE) * (1 + 1.8 * Math.min(1.2, st.agitation));
    const room = top - st.d;
    if (room > 0) {
      const ease = top >= 1 ? 1 : Math.min(1, room / 0.06);
      st.d = Math.min(top, st.d + rate * dt * ease);
    }
    tone.set(r3(st.d));
    if (top >= 1 && st.d >= 1 && feed.get() >= 1) {
      // Done in the hand: it stops following the shake and lets go, so the
      // finish is seen rather than waiting for the pointer to lift.
      swing.current.mode = null;
      st.holding = false;
      release();
      return false;
    }
    return true;
  };

  React.useEffect(() => {
    api.current = { reset, step, eject };
  });

  // The clock: one frame loop while developing, on screen, in a visible page.
  React.useEffect(() => {
    if (!developing) return;
    if (resetFor.current !== sheet) {
      resetFor.current = sheet;
      api.current?.reset();
    }
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = 0;
      if (!visible.current || document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (api.current?.step(dt)) raf = window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf || !visible.current || document.hidden) return;
      last = 0;
      raf = window.requestAnimationFrame(tick);
    };
    wake.current = start;
    start();
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const running = anims.current;
    return () => {
      window.cancelAnimationFrame(raf);
      raf = 0;
      wake.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      // A feed cut short here (a re-run, a hidden page) resumes from where
      // it got to on the next frame rather than freezing half out.
      running.get("feed")?.stop();
      running.delete("feed");
    };
  }, [developing, sheet]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      if (hush.current !== null) window.clearTimeout(hush.current);
      hush.current = null;
      whir.current?.stop();
      whir.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (developing || !refocus.current) return;
    refocus.current = false;
    windowRef.current?.focus({ preventScroll: true });
  }, [developing]);

  const bindButton = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node) return;
    return () => {
      if (document.activeElement === node) refocus.current = true;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) wake.current?.();
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const arrived = () => {
    if (!src || loadedFor.current === src) return;
    loadedFor.current = src;
    setLoadedSrc(src);
  };
  // An image that finished loading before hydration never fires onLoad.
  const bindImage = (node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) arrived();
  };

  /** One shake stroke: agitation for the chemistry, a swish for the ear. */
  const stroke = (strength: number, side: number) => {
    const k = clamp01(strength);
    dev.current.agitation = Math.min(1.2, dev.current.agitation + 0.3);
    audio.play("swish", {
      pitch: r3(0.9 + 0.4 * k),
      gain: r3(0.25 + 0.3 * k),
      pan: r3(clamp(side, -1, 1) * 0.45),
    });
  };

  /** A swing given by a key or a tap: a kick of angular speed, home on recoil. */
  const kick = (side: number, strength = 1) => {
    if (disabled || phaseRef.current !== "developing") return;
    run(
      "angle",
      animate(angle, 0, {
        ...springs.recoil,
        velocity: side * 170 * strength,
      }),
    );
    sway.set(r3(side * 4 * strength));
    run("sway", animate(sway, 0, springs.drift));
    stroke(0.6 * strength, side);
  };

  const shake = () => {
    if (disabled || phaseRef.current !== "developing") return;
    clearTimers();
    [1, -1, 1].forEach((side, i) => {
      timers.current.push(window.setTimeout(() => kick(side), i * 170));
    });
  };

  /** ArrowDown while feeding: the rest comes out quickly, over the motor. */
  const pullOut = () => {
    if (disabled || feed.get() >= 1 || phaseRef.current !== "developing") {
      return;
    }
    halt("feed");
    stopWhir();
    whir.current = audio.start("whir", { pitch: 1.6, gain: 0.55 });
    run(
      "feed",
      animate(feed, 1, {
        duration: motionSafe ? 0.25 : 0,
        ease: easings.enter,
        onComplete: () => {
          anims.current.delete("feed");
          stopWhir();
        },
      }),
    );
  };

  const photoHeight = () => photoRef.current?.offsetHeight || 250;

  const drag = useDrag({
    threshold: 3,
    disabled: disabled || !developing,
    onStart: ({ offset, event, point }) => {
      const s = swing.current;
      dev.current.holding = true;
      const top = photoRef.current?.getBoundingClientRect().top ?? 0;
      s.arm = Math.max(60, point.y - offset.y - top);
      if (
        feed.get() < 1 &&
        Math.abs(offset.y) > Math.abs(offset.x) &&
        offset.y > 0
      ) {
        // Still feeding and pulled down: take it out of the rollers by hand.
        s.mode = "pull";
        s.feedFrom = feed.get();
        halt("feed");
        stopWhir();
        whir.current = audio.start("whir", { pitch: 1, gain: 0.4 });
        return;
      }
      s.mode = "swing";
      halt("angle");
      halt("sway");
      s.grip = angle.get();
      s.dir = 0;
      s.from = s.grip;
      s.last = s.grip;
      s.lastT = event.timeStamp;
    },
    onMove: ({ offset, delta, event }) => {
      const s = swing.current;
      if (s.mode === "pull") {
        const next = rubberClamp(
          s.feedFrom + offset.y / photoHeight(),
          0,
          1,
          0.08,
        );
        feed.set(r3(Math.min(1, next)));
        whir.current?.set({
          pitch: r3(0.8 + Math.min(1.2, Math.abs(delta.y) / 10)),
          gain: r3(0.35 + Math.min(0.3, Math.abs(delta.y) / 40)),
        });
        // A hand that stops pulling holds the rollers: the motor drops to
        // a low strain until it moves again.
        clearHush();
        hush.current = window.setTimeout(() => {
          whir.current?.set({ pitch: 0.7, gain: 0.12 });
        }, 120);
        if (next >= 1) {
          // Out of the rollers: the motor has nothing left to feed.
          s.mode = null;
          feed.set(1);
          stopWhir();
          run("angle", animate(angle, 0, { ...springs.recoil, velocity: 40 }));
        }
        return;
      }
      if (s.mode !== "swing") return;
      // The photo pivots on the slit; the point under the finger follows it.
      const deg = (Math.atan2(offset.x, s.arm) * 180) / Math.PI;
      const next = rubberClamp(s.grip + deg, -REACH, REACH, 2.5);
      angle.set(r3(next));
      sway.set(r3(next * 0.6));
      const d = next - s.last;
      if (Math.abs(d) < 0.05) return;
      const dir = Math.sign(d);
      if (s.dir !== 0 && dir !== s.dir) {
        const travel = Math.abs(s.last - s.from);
        const seconds = Math.max(0.04, (event.timeStamp - s.lastT) / 1000);
        if (travel > 2.5) stroke(travel / seconds / 60, Math.sign(s.last));
        s.from = s.last;
        s.lastT = event.timeStamp;
      }
      s.dir = dir;
      s.last = next;
    },
    onEnd: ({ velocity }) => {
      const s = swing.current;
      dev.current.holding = false;
      const mode = s.mode;
      s.mode = null;
      if (mode === "pull") {
        stopWhir();
        api.current?.eject();
        return;
      }
      if (mode !== "swing") return;
      // Let go: it swings home with the throw it had.
      const omega = (velocity.x / s.arm) * (180 / Math.PI);
      run(
        "angle",
        animate(angle, 0, {
          ...springs.recoil,
          velocity: clamp(omega, -150, 150),
        }),
      );
      run("sway", animate(sway, 0, springs.drift));
    },
    onCancel: () => {
      const s = swing.current;
      dev.current.holding = false;
      if (s.mode === "pull") {
        stopWhir();
        api.current?.eject();
      }
      s.mode = null;
      run("angle", animate(angle, 0, springs.recoil));
      run("sway", animate(sway, 0, springs.drift));
    },
    onTap: (event) => {
      const rect = photoRef.current?.getBoundingClientRect();
      const side = rect && event.clientX < rect.left + rect.width / 2 ? -1 : 1;
      kick(side, 0.6);
    },
  });

  const angularSpeed = useVelocity(angle);
  const rotate = useTransform(angle, (a) => (motionSafe ? r3(a) : 0));
  // The paper lags its own swing a little, as a card dragged through air.
  const skewX = useTransform(angularSpeed, (w) =>
    motionSafe ? r3(clamp(-w * 0.008, -2.5, 2.5)) : 0,
  );
  const feedY = useTransform(feed, (f) => `${r3((Math.min(1, f) - 1) * 100)}%`);
  const dropY = useTransform(drop, (d) => (motionSafe ? r3(d) : 0));
  // No shadow falls below the slot until the photo is out to cast it.
  const shadow = useTransform(feed, (f) => {
    const k = smooth(0.25, 0.7, f);
    return `0 1px 2px oklch(0 0 0 / ${r3(0.16 * k)}), 0 10px 22px -10px oklch(0 0 0 / ${r3(0.4 * k)})`;
  });
  const murk = useTransform(
    [tone, sway] as MotionValue<number>[],
    ([d = 0, s = 0]: number[]) =>
      murkOf(d, motionSafe ? s : 0, patches, film.murk),
  );
  const mottle = useTransform(tone, (d) =>
    r3(0.35 * (1 - smooth(0.1, 0.85, d))),
  );
  const filter = useTransform(tone, filmOf);
  const cast = useTransform(tone, (d) => r3(0.75 * (1 - smooth(0.4, 1, d))));
  const sheen = useTransform(tone, (d) => r3(0.5 * (1 - smooth(0.6, 1, d))));
  const captionClip = useTransform(writing, (w) =>
    motionSafe ? `inset(-4px ${r3((1 - w) * 100)}% -4px -4px)` : "none",
  );
  const captionOpacity = useTransform(writing, (w) => (motionSafe ? 1 : r3(w)));
  const barY = useTransform(bar, (b) =>
    motionSafe ? r3((1 - b) * -distances.nudge) : 0,
  );

  // The instrument's proportions, all as shares of its width.
  const photoTall = (format.span * format.h) / format.w;
  const tall = SLIT + photoTall + TAIL;
  const pct = (v: number) => `${r3(v * 100)}%`;
  const windowTop = (format.top * format.w) / format.h;
  const chinTop =
    ((format.top + (1 - 2 * format.side) / format.window) * format.w) /
    format.h;
  const hidden = ((BAR - SLIT + 0.004) * format.w) / (format.span * format.h);

  return (
    <div
      ref={bindRoot}
      aria-busy={phase !== "done"}
      className={cn(
        "relative isolate w-full max-w-72 overflow-clip select-none",
        className,
      )}
      style={{ aspectRatio: `1 / ${r3(tall)}` }}
    >
      <div
        className="absolute"
        style={{
          left: pct((1 - format.span) / 2),
          width: pct(format.span),
          top: pct(SLIT / tall),
        }}
      >
        <motion.div style={{ y: dropY }}>
          <motion.div
            ref={photoRef}
            className="relative rounded-[3px]"
            style={{
              aspectRatio: `${format.w} / ${format.h}`,
              backgroundColor: STOCK,
              boxShadow: shadow,
              y: feedY,
              rotate,
              skewX,
              opacity: shown,
              originX: 0.5,
              originY: 0,
            }}
          >
            <div
              className="absolute isolate overflow-clip"
              style={{
                left: pct(format.side),
                right: pct(format.side),
                top: pct(windowTop),
                aspectRatio: `${r3(format.window)}`,
              }}
            >
              <motion.div
                ref={windowRef}
                role={src ? undefined : "img"}
                aria-label={src ? undefined : alt}
                tabIndex={-1}
                className="absolute inset-0 outline-none *:size-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                style={{ filter }}
              >
                {src ? (
                  // A registry component cannot import a framework's image
                  // element; the picture is the host's own URL.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    ref={bindImage}
                    src={src}
                    alt={alt}
                    draggable={false}
                    onLoad={arrived}
                    onError={arrived}
                    className="block object-cover"
                  />
                ) : (
                  children
                )}
              </motion.div>
              {phase === "done" ? null : (
                <>
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 mix-blend-soft-light"
                    style={{ backgroundColor: film.cast, opacity: cast }}
                  />
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{ backgroundImage: murk }}
                  />
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 mix-blend-multiply"
                    style={{
                      backgroundImage: MOTTLE,
                      backgroundSize: "120px 120px",
                      opacity: mottle,
                    }}
                  />
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(125deg, oklch(1 0 0 / 0) 30%, oklch(1 0 0 / 0.22) 42%, oklch(1 0 0 / 0) 56%)",
                      opacity: sheen,
                    }}
                  />
                </>
              )}
            </div>
            {caption ? (
              <div
                className="absolute inset-x-0 bottom-0 flex items-center justify-center px-[8%]"
                style={{ top: pct(chinTop) }}
              >
                <motion.p
                  title={caption}
                  className="max-w-full -rotate-1 truncate text-[13px] leading-5 font-medium italic"
                  style={{
                    color: INK,
                    clipPath: captionClip,
                    opacity: captionOpacity,
                  }}
                >
                  {caption}
                </motion.p>
              </div>
            ) : null}
            {developing ? (
              <button
                ref={bindButton}
                type="button"
                aria-label="Shake the photo"
                aria-describedby={hintId}
                disabled={disabled}
                onClick={(event) => {
                  // Pointer shakes arrive through the drag and its tap. A
                  // click with no pointer behind it — Space, Enter,
                  // assistive technology — shakes it three times.
                  if (event.detail === 0) shake();
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    kick(event.key === "ArrowLeft" ? -1 : 1);
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    pullOut();
                  }
                }}
                {...drag}
                className={cn(
                  "absolute inset-x-0 bottom-0 touch-pan-y rounded-[3px] outline-none select-none [-webkit-touch-callout:none]",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  disabled
                    ? "cursor-not-allowed"
                    : "cursor-grab active:cursor-grabbing",
                )}
                style={{ top: pct(hidden) }}
              />
            ) : null}
          </motion.div>
        </motion.div>
      </div>

      {phase === "done" ? null : (
        <motion.div
          aria-hidden
          className="absolute inset-x-0 top-0 rounded-2 border border-hairline-strong bg-surface-2"
          style={{ height: pct(BAR / tall), opacity: bar, y: barY }}
        >
          <span className="absolute inset-x-[10%] top-[58%] h-[3px] -translate-y-1/2 rounded-full bg-foreground/70" />
          <span className="absolute top-[30%] left-[4%] size-1 rounded-full bg-ink-3/60" />
          <span className="absolute top-[30%] right-[4%] size-1 rounded-full bg-ink-3/60" />
        </motion.div>
      )}
      <p id={hintId} className="sr-only">
        Drag it side to side, or press the arrow keys, to shake it and bring the
        picture up faster.
      </p>
    </div>
  );
}
