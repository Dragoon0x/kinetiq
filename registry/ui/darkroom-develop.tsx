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
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DarkroomDevelopProps = {
  /** What the picture shows. Exposed the whole time, while it develops and after. */
  alt: string;
  /** The image to develop. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: any element that fills its box. */
  children?: React.ReactNode;
  /**
   * Controlled: whether the picture is ready. Uncontrolled, an image is ready
   * once it has loaded (or failed), and children at once — the print's own
   * development is then the minimum run.
   */
  ready?: boolean;
  /** How much of the picture has arrived, 0 to 1. Until ready, the print holds at that stage. */
  progress?: number;
  /** Fires once per print, when the lights are on and the picture is whole. */
  onReady?: () => void;
  /** How fast the print comes up, 0.5 to 2. @default 1 */
  speed?: number;
  /** Develop under a red safelight that switches off when the print is done. Off: plain white light. @default true */
  safelight?: boolean;
  /** Silver grain as the image forms, 0 (clean) to 1 (coarse). @default 0.4 */
  grain?: number;
  /** Play the developer when the tray is rocked. Off unless asked for. @default false */
  sound?: boolean;
  /** The print still develops; the tray cannot be rocked. */
  disabled?: boolean;
  /** Sizes the box. @default "aspect-[4/3] w-full" */
  className?: string;
};

type Phase = "developing" | "lifting" | "done";

/** Vertical bands, each developing at its own pace. */
const BANDS = 12;
/** A band's clock, in seconds of development at speed 1, before the rates below. */
const BASE = 2.5;
/** The share of the rate a band gets with no fresh developer on it. */
const REST = 0.72;
/** The share of the rate each unit of fresh developer adds. */
const BOOST = 0.8;
/** How much fresh developer a passing crest leaves behind, per unit of liquid speed. */
const REACH = 3;
/** The crest's width, as a share of the sheet. */
const WIDTH = 0.12;
/** How long fresh developer keeps working, in seconds. */
const FRESH = 0.6;
/** Where an indeterminate print waits while its picture is not ready. */
const LATENT = 0.8;
/** The hand's own rocking: its reach, as a tilt, and its period in seconds. */
const IDLE_TILT = 0.45;
const IDLE_PERIOD = 2.6;
/**
 * The liquid: an underdamped oscillator driven by the tray's tilt, about
 * 1.25 Hz with ζ 0.18 — slow enough to read as a body of water sloshing over
 * and back, lively enough to answer a quick rock.
 */
const SLOSH_K = (2 * Math.PI * 1.25) ** 2;
const SLOSH_C = 2 * 0.18 * Math.sqrt(SLOSH_K);

// Fixed art, the same in both themes: photographic paper, a red safelight
// brightest under the lamp, and the lamp's reflection on the liquid.
const PAPER = "oklch(0.965 0.006 85)";
const SAFELIGHT =
  "radial-gradient(120% 95% at 50% -12%, oklch(0.72 0.19 31), oklch(0.52 0.18 27) 58%, oklch(0.37 0.14 25))";
const MENISCUS =
  "inset 0 0 0 1px oklch(0.2 0.02 30 / 0.2), inset 0 0 22px oklch(0.2 0.03 28 / 0.3)";
/** Seeded fractal noise, drawn once by the browser as an image and tiled. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 0 0 0 1.45'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)'/%3E%3C/svg%3E\")";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The print's mask: each band's density at its centre, blended between. */
function maskOf(bands: readonly number[]): string {
  const stops = bands.map(
    (d, i) =>
      `rgb(0 0 0 / ${r3(smooth(0.02, 0.55, d))}) ${r3(((i + 0.5) / BANDS) * 100)}%`,
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

const BLANK = maskOf(new Array<number>(BANDS).fill(0));

/**
 * A print's tone curve. Early on the picture is drawn far too bright, so only
 * its shadows register on the paper; the brightness falls and the contrast
 * climbs as it develops, which brings the midtones and then the highlights
 * up in the order a real print shows them. `colour` is the room light coming
 * on: grey gives way to the picture's own colour with a brief lift.
 */
function toneOf(mean: number, colour: number): string {
  if (colour >= 1) return "none";
  const lift =
    1.35 * Math.pow(1 - smooth(0.08, 0.95, mean), 1.2) +
    0.12 * Math.sin(Math.PI * colour);
  const contrast = 0.72 + 0.28 * smooth(0.25, 1, mean);
  return `grayscale(${r3(1 - colour)}) brightness(${r3(1 + lift)}) contrast(${r3(contrast + (1 - contrast) * colour)})`;
}

type Sim = {
  bands: number[];
  fresh: number[];
  /** The liquid's centre of mass, -1 to 1 across the tray, and its speed. */
  s: number;
  v: number;
  /** Seconds of rocking clock, scaled by speed. */
  clock: number;
  /** How much of the hand's own rocking is on, 0 to 1. */
  idle: number;
  holding: boolean;
  /** When the visitor last had the tray, in ms. */
  touched: number;
};

const freshSim = (): Sim => ({
  bands: new Array<number>(BANDS).fill(0),
  fresh: new Array<number>(BANDS).fill(0),
  s: 0,
  v: 0,
  clock: 0,
  idle: 1,
  holding: false,
  touched: -Infinity,
});

type Stroke = { dir: number; from: number; last: number; t0: number };

type Api = {
  reset: () => void;
  step: (dt: number) => boolean;
  finish: () => void;
};

/**
 * An image placeholder that develops its picture like a print in a darkroom
 * tray. The box is a sheet of paper under developer and a red safelight; the
 * picture comes up through a print's tone curve — shadows first, then the
 * midtones, then the highlights, contrast climbing — in twelve bands that each
 * develop at their own pace, sped wherever the slosh has just washed fresh
 * developer over them. The liquid is drawn with gradients: the lamp's glint,
 * a travelling crest and the tray's deeper side, driven by an underdamped
 * oscillator the hand rocks gently on its own.
 *
 * Dragging across the print tips the tray 1:1 and the liquid chases it;
 * agitation is what speeds development, so a hard rock brings the picture up
 * in half the time. When the picture is ready and fully developed, the print
 * is lifted — the liquid drains, the safelight switches off and the room
 * light brings up its real colour.
 *
 * The rocking is a real button: Arrow keys tip the tray and Enter or Space
 * rocks it both ways, through the same liquid. The clock runs only while
 * developing, on screen, in a visible page. Under reduced motion nothing
 * travels: the print comes up evenly as a fade, rocking still speeds it (the
 * sheen brightens), and the lights come on as a fade.
 */
export function DarkroomDevelop({
  alt,
  src,
  children,
  ready,
  progress,
  onReady,
  speed = 1,
  safelight = true,
  grain = 0.4,
  sound = false,
  disabled = false,
  className,
}: DarkroomDevelopProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const pace = clamp(speed, 0.5, 2);
  const grit = clamp01(grain);

  // The src that has loaded (or failed), so a new src is unloaded at once.
  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const loaded = src !== undefined && loadedSrc === src;
  const [phase, setPhase] = React.useState<Phase>("developing");
  const [sheet, setSheet] = React.useState(0);
  const isReady =
    ready ?? (src ? loaded : progress === undefined || progress >= 1);

  // A new image, or a host that takes a finished print back to not ready,
  // lays a fresh sheet in the tray.
  const [seen, setSeen] = React.useState({ src, isReady });
  if (seen.src !== src || seen.isReady !== isReady) {
    setSeen({ src, isReady });
    if (seen.src !== src) {
      setPhase("developing");
      setSheet((n) => n + 1);
    } else if (seen.isReady && !isReady && phase !== "developing") {
      setPhase("developing");
      setSheet((n) => n + 1);
    }
  }

  const developing = phase === "developing";

  const hand = useMotionValue(0);
  const tilt = useMotionValue(0);
  const slosh = useMotionValue(0);
  const flow = useMotionValue(0);
  const tone = useMotionValue(0);
  const agitation = useMotionValue(0);
  const mask = useMotionValue(BLANK);
  const colour = useMotionValue(0);
  const drain = useMotionValue(0);
  const lamp = useMotionValue(1);
  const arrive = useMotionValue(src ? 0 : 1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pictureRef = React.useRef<HTMLDivElement | null>(null);
  const sim = React.useRef<Sim>(freshSim());
  const stroke = React.useRef<Stroke>({ dir: 0, from: 0, last: 0, t0: 0 });
  const grip = React.useRef(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
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

  /** Where the bands may develop to right now. */
  const ceiling = () => {
    let top = isReady
      ? 1
      : progress !== undefined
        ? 0.9 * clamp01(progress)
        : LATENT;
    // An image that has not arrived has nothing to develop yet: the sheet
    // only fogs, so the picture never pops in at a late stage.
    if (src && !loaded) top = Math.min(top, 0.3);
    return top;
  };

  const reset = () => {
    for (const [key, c] of anims.current) {
      if (key === "arrive") continue;
      c.stop();
      anims.current.delete(key);
    }
    sim.current = freshSim();
    phaseRef.current = "developing";
    hand.set(0);
    tilt.set(0);
    slosh.set(0);
    flow.set(0);
    tone.set(0);
    agitation.set(0);
    mask.set(BLANK);
    colour.set(0);
    drain.set(0);
    lamp.set(1);
    // An image already here keeps its fade; one still loading starts hidden.
    if (!src || loadedFor.current !== src) {
      halt("arrive");
      arrive.set(src ? 0 : 1);
    }
  };

  /** Lifts a finished print: the liquid drains, then the lights change. */
  const lift = () => {
    if (phaseRef.current !== "developing") return;
    phaseRef.current = "lifting";
    halt("hand");
    mask.set("none");
    setPhase("lifting");
    run(
      "drain",
      animate(drain, 1, {
        duration: motionSafe ? durations.slow : durations.fast,
        ease: easings.exit,
      }),
    );
    // The safelight is a switch: its red goes at once. The room light then
    // brings the colour up as the eye adjusts.
    run(
      "lamp",
      animate(lamp, 0, {
        duration: durations.fast,
        ease: easings.exit,
        delay: motionSafe ? 0.28 : 0,
      }),
    );
    run(
      "colour",
      animate(colour, 1, {
        duration: motionSafe ? durations.page : durations.base,
        ease: easings.enter,
        delay: motionSafe ? 0.3 : 0.05,
        onComplete: () => api.current?.finish(),
      }),
    );
  };

  const finish = () => {
    if (phaseRef.current !== "lifting") return;
    phaseRef.current = "done";
    setPhase("done");
    onReady?.();
  };

  /** One step of the tray: the rocking, the liquid, and the bands. */
  const step = (dt: number): boolean => {
    const st = sim.current;
    const now = performance.now();
    st.clock += dt * pace;
    // The hand's own rocking fades out while the visitor has the tray and
    // back in a moment after they let it go. None under reduced motion.
    const wanted = motionSafe && !st.holding && now - st.touched > 900 ? 1 : 0;
    st.idle += (wanted - st.idle) * (1 - Math.exp(-dt / 0.4));
    const idle =
      IDLE_TILT * st.idle * Math.sin((2 * Math.PI * st.clock) / IDLE_PERIOD);
    const t = hand.get() + idle;
    for (let k = 0; k < 2; k += 1) {
      const h = dt / 2;
      st.v += (SLOSH_K * (t - st.s) - SLOSH_C * st.v) * h;
      st.s = clamp(st.s + st.v * h, -1.3, 1.3);
    }
    const crest = 0.5 + 0.44 * clamp(st.s, -1.15, 1.15);
    const speedOf = Math.abs(st.v);
    const top = ceiling();
    let sum = 0;
    let freshSum = 0;
    let all = true;
    for (let i = 0; i < BANDS; i += 1) {
      const x = (i + 0.5) / BANDS;
      // Fresh developer lands where the crest passes; under reduced motion
      // the wave is not drawn, so it lands evenly and the print stays even.
      const near = motionSafe ? Math.exp(-(((x - crest) / WIDTH) ** 2)) : 0.3;
      const fresh =
        ((st.fresh[i] ?? 0) + dt * speedOf * REACH * near) *
        Math.exp(-dt / FRESH);
      st.fresh[i] = fresh;
      freshSum += fresh;
      const rate = (pace / BASE) * (REST + Math.min(2, fresh) * BOOST);
      const d = st.bands[i] ?? 0;
      const room = top - d;
      // A print held short of done eases into its hold; one that may finish
      // runs straight through.
      const ease = top >= 1 ? 1 : Math.min(1, room / 0.08);
      const next = room > 0 ? Math.min(top, d + rate * dt * ease) : d;
      st.bands[i] = next;
      sum += next;
      if (next < 0.999) all = false;
    }
    tilt.set(r3(t));
    slosh.set(r3(st.s));
    flow.set(r3(st.v));
    tone.set(r3(sum / BANDS));
    agitation.set(r3(Math.min(1, freshSum / BANDS)));
    mask.set(maskOf(st.bands));
    if (top >= 1 && all) {
      lift();
      return false;
    }
    return true;
  };

  React.useEffect(() => {
    api.current = { reset, step, finish };
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
    return () => {
      window.cancelAnimationFrame(raf);
      raf = 0;
      wake.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [developing, sheet]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // The rocking control leaves with the liquid; focus it held goes to the
  // picture rather than to the page.
  React.useEffect(() => {
    if (developing || !refocus.current) return;
    refocus.current = false;
    pictureRef.current?.focus({ preventScroll: true });
  }, [developing]);

  const bindButton = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node) return;
    return () => {
      if (document.activeElement === node) refocus.current = true;
    };
  }, []);

  // On screen or not, bound to the node when it arrives.
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
    run(
      "arrive",
      animate(arrive, 1, { duration: durations.slow, ease: easings.enter }),
    );
  };
  // An image that finished loading before hydration never fires onLoad.
  const bindImage = (node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) arrived();
  };

  const swish = (strength: number, side: number) => {
    const k = clamp01(strength);
    audio.play("swish", {
      pitch: r3(0.85 + 0.4 * k),
      gain: r3(0.22 + 0.33 * k),
      pan: r3(clamp(side, -1, 1) * 0.5),
    });
  };

  const touch = () => {
    sim.current.touched = performance.now();
  };

  /** A rock by key or tap: out to each side in turn on snap, home on glide. */
  const rock = (sides: number[]) => {
    if (disabled || phaseRef.current !== "developing") return;
    halt("hand");
    touch();
    const go = (i: number) => {
      touch();
      const side = sides[i];
      if (side === undefined) {
        run("hand", animate(hand, 0, { ...springs.glide, onComplete: touch }));
        return;
      }
      swish(0.6, side);
      run(
        "hand",
        animate(hand, side * 0.9, {
          ...springs.snap,
          onComplete: () => go(i + 1),
        }),
      );
    };
    go(0);
  };

  const trayWidth = () => (rootRef.current?.clientWidth || 300) * 0.42;

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || !developing,
    onStart: ({ event }) => {
      halt("hand");
      sim.current.holding = true;
      touch();
      grip.current = hand.get();
      stroke.current = {
        dir: 0,
        from: grip.current,
        last: grip.current,
        t0: event.timeStamp,
      };
    },
    onMove: ({ offset, event }) => {
      const next = rubberClamp(
        grip.current + offset.x / trayWidth(),
        -1,
        1,
        0.6,
      );
      hand.set(r3(next));
      touch();
      // Each reversal after a real excursion is one stroke of the rock,
      // and each stroke is heard.
      const s = stroke.current;
      const d = next - s.last;
      if (Math.abs(d) < 0.002) return;
      const dir = Math.sign(d);
      if (s.dir !== 0 && dir !== s.dir) {
        const travel = Math.abs(s.last - s.from);
        const seconds = Math.max(0.05, (event.timeStamp - s.t0) / 1000);
        if (travel > 0.3) swish(travel / seconds / 6, s.last);
        s.from = s.last;
        s.t0 = event.timeStamp;
      }
      s.dir = dir;
      s.last = next;
    },
    onEnd: ({ velocity }) => {
      sim.current.holding = false;
      touch();
      const v = velocity.x / trayWidth();
      if (Math.abs(velocity.x) > 900) swish(Math.abs(v) / 8, Math.sign(v));
      // The tray is set down level; it takes the throw with it.
      run("hand", animate(hand, 0, { ...springs.glide, velocity: v }));
    },
    onCancel: () => {
      sim.current.holding = false;
      touch();
      run("hand", animate(hand, 0, springs.glide));
    },
    onTap: (event) => {
      const rect = rootRef.current?.getBoundingClientRect();
      const side = rect && event.clientX < rect.left + rect.width / 2 ? -1 : 1;
      rock([side]);
    },
  });

  const filter = useTransform(
    [tone, colour] as MotionValue<number>[],
    ([m = 0, c = 0]: number[]) => toneOf(m, c),
  );
  // Grain clumps as the image forms, settles by half, and clears with the light.
  const grainOpacity = useTransform(
    [tone, colour] as MotionValue<number>[],
    ([m = 0, c = 0]: number[]) =>
      r3(
        grit *
          0.7 *
          smooth(0.05, 0.4, m) *
          (1 - 0.5 * smooth(0.6, 1, m)) *
          (1 - c),
      ),
  );
  const liquidOpacity = useTransform(drain, (d) => r3(1 - d));
  const drainY = useTransform(drain, (d) =>
    motionSafe ? r3(d * distances.step) : 0,
  );

  const lampOf = (a: number) =>
    safelight
      ? `oklch(0.86 0.12 32 / ${r3(clamp01(a))})`
      : `oklch(0.99 0.004 90 / ${r3(clamp01(a))})`;
  const darkOf = (a: number) =>
    safelight
      ? `oklch(0.2 0.03 28 / ${r3(clamp01(a))})`
      : `oklch(0.25 0.01 250 / ${r3(clamp01(a))})`;

  // The liquid, in three gradients: the lamp's glint (it moves with the
  // tray's tilt, 1:1), the crest (where the liquid's mass is, bright on its
  // leading edge and troughed behind, as bright as it is fast), and the
  // deeper water on the low side.
  const liquid = useTransform(
    [tilt, slosh, flow, agitation] as MotionValue<number>[],
    ([t = 0, s = 0, v = 0, a = 0]: number[]) => {
      if (!motionSafe) {
        return `linear-gradient(180deg, ${lampOf(0.1 + 0.3 * a)}, ${lampOf(0)} 62%), linear-gradient(90deg, ${darkOf(0.08)}, ${darkOf(0.02)} 50%, ${darkOf(0.08)})`;
      }
      const glint = r3(clamp(50 + t * 30 + v * 3, 6, 94));
      const crest = 50 + clamp(s, -1.15, 1.15) * 44;
      const k = clamp01(Math.abs(v) / 2.4);
      const c = (d: number) => `${r3(crest + d)}%`;
      const wave =
        v >= 0
          ? `linear-gradient(96deg, transparent ${c(-18)}, ${darkOf(0.12 * k)} ${c(-7)}, ${lampOf(0.06 + 0.16 * k)} ${c(-3)}, ${lampOf(0.1 + 0.26 * k)} ${c(-0.8)}, ${lampOf(0.04 * k)} ${c(1.8)}, transparent ${c(5)})`
          : `linear-gradient(96deg, transparent ${c(-5)}, ${lampOf(0.04 * k)} ${c(-1.8)}, ${lampOf(0.1 + 0.26 * k)} ${c(0.8)}, ${lampOf(0.06 + 0.16 * k)} ${c(3)}, ${darkOf(0.12 * k)} ${c(7)}, transparent ${c(18)})`;
      const low = clamp01(s);
      const high = clamp01(-s);
      return [
        `radial-gradient(30% 20% at ${glint}% 24%, ${lampOf(0.26 + 0.16 * k)}, ${lampOf(0)})`,
        wave,
        `linear-gradient(90deg, ${darkOf(0.08 + 0.14 * high)}, ${darkOf(0.02)} 50%, ${darkOf(0.08 + 0.14 * low)})`,
      ].join(", ");
    },
  );

  return (
    <div
      ref={bindRoot}
      aria-busy={phase !== "done"}
      className={cn(
        "relative isolate aspect-[4/3] w-full overflow-clip rounded-3 select-none",
        className,
      )}
      style={{ backgroundColor: PAPER }}
    >
      <motion.div
        ref={pictureRef}
        role={src ? undefined : "img"}
        aria-label={src ? undefined : alt}
        tabIndex={-1}
        className="absolute inset-0 rounded-[inherit] outline-none *:size-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        style={{ filter, maskImage: mask, opacity: arrive }}
      >
        {src ? (
          // A registry component cannot import a framework's image element;
          // the picture is the host's own URL, sized by the box.
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

      {phase !== "done" ? (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-multiply"
            style={{
              backgroundImage: GRAIN,
              backgroundSize: "140px 140px",
              opacity: grainOpacity,
            }}
          />
          {safelight ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 mix-blend-multiply"
              style={{ backgroundImage: SAFELIGHT, opacity: lamp }}
            />
          ) : null}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: liquid,
              opacity: liquidOpacity,
              y: drainY,
            }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ boxShadow: MENISCUS, opacity: liquidOpacity }}
          />
        </>
      ) : null}

      {developing ? (
        <button
          ref={bindButton}
          type="button"
          aria-label="Rock the tray"
          aria-describedby={hintId}
          disabled={disabled}
          onClick={(event) => {
            // Pointer rocks arrive through the drag and its tap. A click
            // with no pointer behind it — Space, Enter, assistive
            // technology — rocks the tray both ways.
            if (event.detail === 0) rock([1, -1]);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              rock([event.key === "ArrowLeft" ? -1 : 1]);
            }
          }}
          {...drag}
          className={cn(
            "absolute inset-0 size-full touch-pan-y rounded-[inherit] outline-none select-none [-webkit-touch-callout:none]",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
        />
      ) : null}
      <p id={hintId} className="sr-only">
        Drag side to side, or press the arrow keys, to rock the developer and
        hurry the print.
      </p>
    </div>
  );
}
