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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ShopLightSurface = "pegboard" | "plaster" | "slats";
export type ShopLightTrigger = "inView" | "mount" | "manual";

export type ShopLightProps = {
  /** What hangs on the wall under the light: a product, a card, a line of copy. It stays readable to assistive technology in the dark. */
  children?: React.ReactNode;
  /** Controlled: whether the tube is switched on. */
  lit?: boolean;
  /** Whether the tube starts switched on, when uncontrolled. @default false */
  defaultLit?: boolean;
  /** Fires from the cord, the key, the reveal or the focus that switched it, with the new state. */
  onLitChange?: (lit: boolean) => void;
  /** What switches the tube on by itself: coming into view, mounting, or nothing but the cord. @default "inView" */
  trigger?: ShopLightTrigger;
  /** Light once and stay lit; false puts it out when it leaves the view and strikes it again on return. @default true */
  once?: boolean;
  /** Pause before an automatic strike, in ms. @default 250 */
  delay?: number;
  /** How hard the cold tube fights before it catches, 0 (strikes clean) to 1 (a long preheat and five or six failed strikes). @default 0.6 */
  flicker?: number;
  /** The settled light's colour, 0 (6500 K daylight) to 1 (2700 K warm white). @default 0.55 */
  warmth?: number;
  /** How quickly the light dies below the tube, 0 (a wash to the floor) to 1 (a tight pool under it). @default 0.5 */
  falloff?: number;
  /** The tube's length as a share of the width, 0.3 to 0.9. @default 0.6 */
  tubeLength?: number;
  /** How far below the top edge the fixture hangs, in px. @default 22 */
  hang?: number;
  /** How much of the room shows with the tube out, 0 (pitch dark) to 0.5. @default 0.08 */
  ambient?: number;
  /** The wall the content hangs on: hardboard with holes, plaster, or timber slats. @default "pegboard" */
  surface?: ShopLightSurface;
  /** Show the pull cord, the visitor's switch. @default true */
  cord?: boolean;
  /** Seeds the stutter: the same seed fails the same way. @default 7 */
  seed?: number;
  /** The switch's accessible name. @default "Shop light" */
  label?: string;
  /** Fires when a strike has settled to a steady light. */
  onSettle?: () => void;
  /** Play the cord's click and the tube's buzz — only for the visitor's own pull, key or focus. @default false */
  sound?: boolean;
  /** Shows the room but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the room. @default "h-60 w-full" */
  className?: string;
};

/*
 * Pigments. The room is its own world — a pale wall in a dark shop — so it
 * reads the same on either page theme; only the content keeps tokens, scoped
 * to the light theme because it sits on a pale wall.
 */
const COOL = "oklch(0.97 0.022 240)";
const WARM = "oklch(0.95 0.072 74)";
const DARK = "oklch(0.13 0.012 262)";
const SHADE = "oklch(0.13 0.012 262 / 0.62)";
const BOUNCE = "oklch(0.36 0.014 262)";
const CATHODE = "oklch(0.74 0.16 46)";
const HOUSING_TOP = "oklch(0.5 0.014 250)";
const HOUSING_BOTTOM = "oklch(0.32 0.012 250)";
const CABLE = "oklch(0.46 0.01 250)";
const GLASS = "oklch(0.52 0.012 245)";
const CAP = "oklch(0.36 0.01 245)";
const BEAD = "oklch(0.7 0.012 250)";
const BEAD_GLOW = "oklch(0.86 0.13 152)";

const SURFACES: Record<ShopLightSurface, React.CSSProperties> = {
  pegboard: {
    backgroundColor: "oklch(0.77 0.055 66)",
    backgroundImage:
      "radial-gradient(circle at 50% 50%, oklch(0.3 0.03 55) 0 1.5px, oklch(0.64 0.05 62) 1.9px, transparent 2.6px)",
    backgroundSize: "18px 18px",
    backgroundPosition: "9px 9px",
  },
  plaster: {
    backgroundColor: "oklch(0.91 0.012 85)",
    backgroundImage:
      "radial-gradient(ellipse 60% 40% at 20% 72%, oklch(0.87 0.016 80 / 0.7), transparent), radial-gradient(ellipse 50% 50% at 82% 28%, oklch(0.94 0.01 90 / 0.8), transparent)",
  },
  slats: {
    backgroundColor: "oklch(0.8 0.05 72)",
    backgroundImage:
      "repeating-linear-gradient(to right, transparent 0 27px, oklch(0.55 0.05 58 / 0.55) 27px 28px, oklch(0.88 0.04 78 / 0.5) 28px 29px)",
  },
};

/** A warm tube — out for less than this, in ms — restrikes almost at once. */
const WARM_FOR = 8000;
/** The cord's travel before a pull counts, and where it starts to resist, px. */
const PULL_COMMIT = 9;
const PULL_STOP = 14;
const CORD = 30;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x5bd1e995) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The colour of the tube at a temperature, 0 cool to 1 warm, mixed in oklab. */
const tintAt = (t: number) =>
  `color-mix(in oklab, ${COOL}, ${WARM} ${Math.round(clamp01(t) * 100)}%)`;

/** A just-struck tube runs cooler than it will settle. */
const coldOf = (warmth: number) => Math.max(0, clamp01(warmth) - 0.4);

type Plan = {
  /** Seconds. */
  duration: number;
  times: number[];
  level: number[];
  cathode: number[];
  /** When each flash starts (s) and how bright it is, for the buzz. */
  flashes: { at: number; gain: number }[];
};

/**
 * A cold tube's start, as keyframes. The cathodes glow first (the preheat);
 * each failed strike is a short flash of uneven brightness with the ends
 * glowing again in the gap after it, sometimes a dim swim where the arc
 * half-holds; then it catches dimmer than it will settle and shimmers once.
 * Step changes are two keyframes a millisecond apart, on a linear tween — a
 * strike is a jump, not an ease.
 */
function strikePlan(flicker: number, seed: number, warm: boolean): Plan {
  const rand = lcg(seed);
  const f = clamp01(flicker);
  const pts: [number, number, number][] = [];
  let t = 0;
  const at = (level: number, cathode: number) =>
    pts.push([t, r3(level), r3(cathode)]);
  const step = (level: number, cathode: number) => {
    t += 0.001;
    at(level, cathode);
  };
  const flashes: Plan["flashes"] = [];

  at(0, 0);
  const preheat = warm ? 0.04 : 0.1 + f * 0.45 + rand() * 0.12 * f;
  t += preheat * 0.45;
  at(0, 0.7);
  t += preheat * 0.55;
  at(0, 1);

  const tries = warm ? 0 : Math.round(f * 4 + rand() * 1.4 * f);
  for (let i = 0; i < tries; i += 1) {
    const bright = 0.42 + rand() * 0.58;
    step(bright, 0.35);
    flashes.push({ at: t, gain: bright });
    t += 0.028 + rand() * 0.07;
    at(bright * (0.75 + rand() * 0.25), 0.3);
    const swim = rand() < 0.3;
    const dim = swim ? 0.1 + rand() * 0.12 : 0;
    step(dim, swim ? 0.5 : 1);
    t += 0.07 + rand() * 0.3 * (0.55 + f * 0.6);
    at(dim * 0.5, 1);
  }

  step(0.86, 0.15);
  flashes.push({ at: t, gain: 0.86 });
  t += 0.045;
  at(0.84, 0);
  step(0.7, 0);
  t += 0.035;
  at(0.72, 0);
  step(0.88, 0);
  t += 0.05;
  at(0.86, 0);
  step(0.8, 0);
  t += 0.03;
  at(0.84, 0);

  const duration = Math.max(0.05, t);
  return {
    duration,
    times: pts.map(([time]) => Math.min(1, time / duration)),
    level: pts.map(([, level]) => level),
    cathode: pts.map(([, , cathode]) => cathode),
    flashes,
  };
}

type Phase = "off" | "striking" | "lit";

/**
 * A room in the dark with a fluorescent batten hanging over the content. On
 * reveal the tube starts the way a cold tube does — cathodes glowing at both
 * ends, then uneven flashes and gaps from a seeded plan — and catches dimmer
 * and cooler than it will be, settling to full on the drift spring while its
 * colour warms to `warmth`, and the content rises a nudge into the pool on
 * glide. The light is composited, not tinted: the wall and the content are
 * multiplied by the light, so the pool warms what it falls on and dies into
 * the dark by `falloff`, and the wall above the reflector stays dim.
 *
 * The pull cord is a real switch: it follows a downward drag 1:1, a pull past
 * 9px toggles, and the bead springs back on recoil with the drag's velocity;
 * Space and Enter give the same pull. Keyboard focus walking into the content
 * in the dark switches the light on. Under reduced motion the light fades up
 * and out with no preheat, stutter or rise.
 */
export function ShopLight({
  children,
  lit,
  defaultLit = false,
  onLitChange,
  trigger = "inView",
  once = true,
  delay = 250,
  flicker = 0.6,
  warmth = 0.55,
  falloff = 0.5,
  tubeLength = 0.6,
  hang = 22,
  ambient = 0.08,
  surface = "pegboard",
  cord = true,
  seed = 7,
  label = "Shop light",
  onSettle,
  sound = false,
  disabled = false,
  className,
}: ShopLightProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const [own, setOwn] = React.useState(defaultLit);
  const isLit = lit ?? own;
  const [announcement, setAnnouncement] = React.useState("");

  const w = clamp01(warmth);
  const tl = Math.min(0.9, Math.max(0.3, tubeLength));
  const amb = Math.min(0.5, Math.max(0, ambient));
  const fo = clamp01(falloff);
  const top = Math.max(0, Math.round(hang));
  const tubeY = top + 10;

  const level = useMotionValue(defaultLit ? 1 : 0);
  const cathode = useMotionValue(0);
  const temp = useMotionValue(defaultLit ? w : coldOf(w));
  const afterglow = useMotionValue(0);
  const rise = useMotionValue(defaultLit ? 0 : distances.nudge);
  const pull = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cordRef = React.useRef<HTMLButtonElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const cordAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const shown = React.useRef(defaultLit);
  const phase = React.useRef<Phase>(defaultLit ? "lit" : "off");
  const offAt = React.useRef(-Infinity);
  const visitorAt = React.useRef(-Infinity);
  const strikes = React.useRef(0);
  const autoLit = React.useRef(false);
  const autoDone = React.useRef(false);
  const manualOff = React.useRef(false);

  const latest = React.useRef({
    flicker,
    warmth: w,
    seed,
    motionSafe,
    audio,
    onSettle,
  });
  React.useLayoutEffect(() => {
    latest.current = { flicker, warmth: w, seed, motionSafe, audio, onSettle };
  });

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const settle = React.useCallback(() => {
    phase.current = "lit";
    latest.current.onSettle?.();
  }, []);

  const strike = React.useCallback(() => {
    halt();
    const k = latest.current;
    phase.current = "striking";
    afterglow.jump(0);
    if (!k.motionSafe) {
      cathode.jump(0);
      temp.jump(k.warmth);
      rise.jump(0);
      running.current = [
        animate(level, 1, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: settle,
        }),
      ];
      return;
    }
    const now = performance.now();
    const warm = now - offAt.current < WARM_FOR;
    const byVisitor = now - visitorAt.current < 700;
    strikes.current += 1;
    const plan = strikePlan(k.flicker, k.seed + strikes.current - 1, warm);
    level.jump(0);
    temp.jump(coldOf(k.warmth));
    // The catch: dimmer and cooler than it will be, it creeps up to full on
    // the drift spring — a big surface settling, no overshoot — while the
    // colour warms and the content comes up into the pool on glide.
    const caught = () => {
      running.current = [
        animate(level, 1, { ...springs.drift, onComplete: settle }),
        animate(temp, latest.current.warmth, {
          duration: 1.1,
          ease: easings.enter,
        }),
        animate(rise, 0, springs.glide),
      ];
    };
    running.current = [
      animate(level, plan.level, {
        duration: plan.duration,
        times: plan.times,
        ease: "linear",
        onComplete: caught,
      }),
      animate(cathode, plan.cathode, {
        duration: plan.duration,
        times: plan.times,
        ease: "linear",
      }),
    ];
    if (byVisitor) {
      const rand = lcg(k.seed * 31 + strikes.current);
      timers.current = plan.flashes.map((flash) =>
        window.setTimeout(
          () =>
            latest.current.audio.play("buzz", {
              gain: r2(0.18 + flash.gain * 0.36),
              pitch: r2(0.92 + rand() * 0.16),
            }),
          Math.round(flash.at * 1000),
        ),
      );
    }
  }, [afterglow, cathode, halt, level, rise, settle, temp]);

  const douse = React.useCallback(() => {
    halt();
    phase.current = "off";
    offAt.current = performance.now();
    cathode.jump(0);
    if (!latest.current.motionSafe) {
      afterglow.jump(0);
      rise.jump(distances.nudge);
      running.current = [
        animate(level, 0, { duration: durations.fast, ease: easings.exit }),
      ];
      return;
    }
    // A tube goes out at once; only the phosphor on the glass lingers.
    const was = level.get();
    level.jump(0);
    afterglow.jump(was);
    running.current = [
      animate(afterglow, 0, { duration: 0.3, ease: easings.exit }),
      animate(rise, distances.nudge, {
        duration: durations.base,
        ease: easings.move,
      }),
    ];
  }, [afterglow, cathode, halt, level, rise]);

  // Whatever changed the state — cord, key, reveal or host — the tube does
  // the same thing once.
  React.useEffect(() => {
    if (shown.current === isLit) return;
    shown.current = isLit;
    if (isLit) strike();
    else douse();
  }, [isLit, strike, douse]);

  // A new colour while settled glides there; mid-strike the catch reads it.
  React.useEffect(() => {
    if (phase.current !== "lit") return;
    const c = animate(temp, w, {
      duration: durations.base,
      ease: easings.move,
    });
    return () => c.stop();
  }, [w, temp]);

  React.useEffect(
    () => () => {
      halt();
      cordAnim.current?.stop();
    },
    [halt],
  );

  const commit = (next: boolean, source: "visitor" | "auto") => {
    if (source === "visitor") {
      visitorAt.current = performance.now();
      manualOff.current = !next;
      setAnnouncement(next ? "Light on" : "Light off");
    }
    autoLit.current = source === "auto" && next;
    if (lit === undefined) setOwn(next);
    onLitChange?.(next);
  };
  const commitRef = React.useRef(commit);
  React.useLayoutEffect(() => {
    commitRef.current = commit;
  });
  const isLitRef = React.useRef(isLit);
  React.useLayoutEffect(() => {
    isLitRef.current = isLit;
  });

  // The reveal. The flag that says "already lit by the reveal" is set when
  // the timer fires, never when it is scheduled, so StrictMode's rehearsal
  // (mount, cleanup, mount) still lights it.
  React.useEffect(() => {
    // A disabled room still lights when it is revealed; it only refuses input.
    if (trigger === "manual") return;
    const node = rootRef.current;
    if (!node) return;
    let timer = 0;
    const light = () => {
      timer = window.setTimeout(
        () => {
          autoDone.current = true;
          if (!isLitRef.current) commitRef.current(true, "auto");
        },
        Math.max(0, delay),
      );
    };
    if (trigger === "mount") {
      if (!autoDone.current) light();
      return () => window.clearTimeout(timer);
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        window.clearTimeout(timer);
        if (entry?.isIntersecting) {
          if (once ? autoDone.current : manualOff.current) return;
          light();
        } else if (!once && autoLit.current && isLitRef.current) {
          commitRef.current(false, "auto");
        }
      },
      { threshold: 0.35 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [trigger, once, delay]);

  const toggle = () => {
    if (disabled) return;
    const next = !isLit;
    const node = cordRef.current;
    const pan = node
      ? panFrom(node.getBoundingClientRect().left, rootRef.current)
      : 0;
    audio.play("click", { pitch: next ? 1.2 : 0.85, gain: 0.55, pan });
    commit(next, "visitor");
  };

  const springBack = (velocity: number) => {
    cordAnim.current?.stop();
    cordAnim.current = motionSafe
      ? animate(pull, 0, { ...springs.recoil, velocity })
      : animate(pull, 0, { duration: durations.fast, ease: easings.enter });
  };

  /** A press without a drag: the same pull a hand gives, then the bounce. */
  const tug = () => {
    if (disabled) return;
    cordAnim.current?.stop();
    if (!motionSafe) {
      toggle();
      return;
    }
    cordAnim.current = animate(pull, PULL_COMMIT + 1, {
      ...springs.flick,
      onComplete: () => {
        toggle();
        springBack(0);
      },
    });
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: () => cordAnim.current?.stop(),
    onMove: ({ offset }) => {
      const y = offset.y;
      const p =
        y < 0
          ? rubberband(y, 12)
          : y <= PULL_STOP
            ? y
            : PULL_STOP + rubberband(y - PULL_STOP, 36);
      pull.set(r2(p));
    },
    onEnd: ({ velocity }) => {
      const p = pull.get();
      if (p >= PULL_COMMIT || project(p, velocity.y, 0.99) >= PULL_COMMIT * 2) {
        toggle();
      }
      springBack(velocity.y);
    },
    onCancel: () => springBack(0),
    onTap: tug,
  });

  const tint = useTransform(temp, tintAt);
  const scrim = useTransform(level, (l) => r3((1 - l) * (1 - amb)));
  const bloom = useTransform(level, (l) => r3(l * 0.85));
  const tube = useTransform(
    [level, afterglow] as MotionValue<number>[],
    ([l, a]) => r3(Math.max(l as number, (a as number) * 0.55)),
  );
  const glowBead = useTransform(level, (l) => r3((1 - l) * 0.9));
  const cordLength = useTransform(pull, (p) => r2(CORD + p));

  const poolImage = [
    `linear-gradient(to bottom, ${SHADE} 0px, ${SHADE} ${tubeY - 6}px, transparent ${tubeY + 10}px)`,
    `radial-gradient(ellipse ${r1(tl * 50 + 24)}% ${r1(lerp(165, 62, fo))}% at 50% ${tubeY}px, var(--shop-light-tint) 0%, var(--shop-light-tint) ${r1(lerp(36, 12, fo))}%, color-mix(in oklab, var(--shop-light-tint) 62%, ${BOUNCE}) ${r1(lerp(80, 52, fo))}%, ${BOUNCE} 100%)`,
  ].join(", ");
  const half = r1(tl * 50);
  const cordX = `calc(${r1(50 + tl * 50)}% - 14px)`;

  return (
    <div
      className={cn(
        "relative isolate overflow-clip rounded-3 border border-hairline",
        className ?? "h-60 w-full",
      )}
    >
      <motion.div
        ref={rootRef}
        className="light absolute inset-0 text-foreground"
        style={
          {
            ...SURFACES[surface],
            "--shop-light-tint": tint,
          } as React.CSSProperties & Record<string, unknown>
        }
      >
        <motion.div
          className="absolute inset-x-0 bottom-0 flex items-center-safe justify-center-safe overflow-clip px-4 pb-3"
          style={{ top: tubeY + 8, y: rise }}
          onFocus={() => {
            // A visitor walking into the content in the dark turns the light
            // on, so a focus ring is never drawn where nobody can see it.
            if (!isLit && !disabled) commit(true, "visitor");
          }}
        >
          <div className="flex w-full justify-center drop-shadow-[0_8px_10px_oklch(0.2_0.02_60/0.22)]">
            {children}
          </div>
        </motion.div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-multiply"
          style={{ backgroundImage: poolImage }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: DARK, opacity: scrim }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{
            opacity: bloom,
            backgroundImage: `radial-gradient(ellipse ${r1(tl * 50 + 10)}% ${tubeY + 30}px at 50% ${tubeY}px, color-mix(in oklab, var(--shop-light-tint) 62%, transparent) 0%, transparent 100%)`,
          }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{
            opacity: cathode,
            backgroundImage: [
              `radial-gradient(circle 26px at calc(${r1(50 - half)}% + 9px) ${tubeY}px, color-mix(in oklab, ${CATHODE} 70%, transparent), transparent)`,
              `radial-gradient(circle 26px at calc(${r1(50 + half)}% - 9px) ${tubeY}px, color-mix(in oklab, ${CATHODE} 70%, transparent), transparent)`,
            ].join(", "),
          }}
        />

        <div aria-hidden className="pointer-events-none absolute inset-0">
          {[
            `calc(${r1(50 - half)}% + 16px)`,
            `calc(${r1(50 + half)}% - 17px)`,
          ].map((left) => (
            <span
              key={left}
              className="absolute top-0 w-px"
              style={{ left, height: top + 1, backgroundColor: CABLE }}
            />
          ))}
          <span
            className="absolute rounded-[2px]"
            style={{
              left: `${r1(50 - half)}%`,
              width: `${r1(tl * 100)}%`,
              top,
              height: 7,
              backgroundImage: `linear-gradient(to bottom, ${HOUSING_TOP}, ${HOUSING_BOTTOM})`,
            }}
          />
          <span
            className="absolute overflow-clip rounded-full"
            style={{
              left: `calc(${r1(50 - half)}% + 5px)`,
              width: `calc(${r1(tl * 100)}% - 10px)`,
              top: top + 7,
              height: 6,
              backgroundColor: GLASS,
            }}
          >
            <span
              className="absolute inset-y-0 left-0 w-1.5"
              style={{ backgroundColor: CAP }}
            />
            <span
              className="absolute inset-y-0 right-0 w-1.5"
              style={{ backgroundColor: CAP }}
            />
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{
                opacity: tube,
                backgroundImage:
                  "linear-gradient(to bottom, color-mix(in oklab, var(--shop-light-tint) 70%, white), var(--shop-light-tint) 60%, color-mix(in oklab, var(--shop-light-tint) 82%, black))",
                boxShadow: "0 0 10px 2px var(--shop-light-tint)",
              }}
            />
            <motion.span
              className="absolute inset-y-0 left-1.5 w-3 rounded-r-full"
              style={{ opacity: cathode, backgroundColor: CATHODE }}
            />
            <motion.span
              className="absolute inset-y-0 right-1.5 w-3 rounded-l-full"
              style={{ opacity: cathode, backgroundColor: CATHODE }}
            />
          </span>
          {cord ? (
            <motion.span
              className="absolute w-px"
              style={{
                left: cordX,
                top: top + 7,
                height: cordLength,
                backgroundColor: CABLE,
              }}
            />
          ) : null}
        </div>

        {cord ? (
          <motion.button
            ref={cordRef}
            type="button"
            role="switch"
            aria-checked={isLit}
            aria-label={label}
            disabled={disabled}
            onClick={(event) => {
              // Pointer presses arrive through the drag's tap; a click with no
              // pointer behind it (Space, Enter, assistive technology) is the
              // same pull.
              if (event.detail === 0) tug();
            }}
            {...drag}
            className={cn(
              "absolute flex size-8 -translate-x-1/2 cursor-grab touch-pan-x items-center justify-center rounded-full outline-none select-none active:cursor-grabbing",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
            style={{
              left: `calc(${cordX} + 0.5px)`,
              top: top + 7 + CORD - 12,
              y: pull,
            }}
          >
            <span
              aria-hidden
              className="relative block h-3 w-2 rounded-full"
              style={{ backgroundColor: BEAD }}
            >
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{
                  opacity: glowBead,
                  backgroundColor: BEAD_GLOW,
                  boxShadow: `0 0 6px 1px color-mix(in oklab, ${BEAD_GLOW} 60%, transparent)`,
                }}
              />
            </span>
          </motion.button>
        ) : null}

        <span role="status" className="sr-only">
          {announcement}
        </span>
      </motion.div>
    </div>
  );
}
