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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SundialHourDial = "stone" | "brass" | "slate";
export type SundialHourNumerals = "roman" | "arabic" | "ticks";

export type SundialHourProps = {
  /** What is waiting on the day: the loader's accessible name, shown beside the dial unless `hideLabel`. @default "Loading" */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The glyph's box in px. Detail is simplified below 24 and below 44. @default 24 */
  size?: number;
  /** How fast the looping day passes, 0.5 to 2. @default 1 */
  speed?: number;
  /** How far through the day, 0 (06:00) to 1 (18:00). Omitted, a day passes on a loop. */
  progress?: number;
  /** The plate: weathered stone, polished brass or dark slate. @default "stone" */
  dial?: SundialHourDial;
  /** How the hours are marked round the rim, at 44 px and up. @default "roman" */
  numerals?: SundialHourNumerals;
  /** A tick for every hour line the shadow crosses while the visitor walks it. Off unless asked for. @default false */
  sound?: boolean;
  /** The day keeps passing but the shadow cannot be walked by hand. @default false */
  disabled?: boolean;
  className?: string;
};

type Pt = [number, number];
type Tier = 0 | 1 | 2;

type DialLook = {
  plate: string;
  light: string;
  rim: string;
  engrave: string;
  fin: string;
  edge: string;
};

// Pigments: a dial is an object, so it keeps one lightness in both themes.
const DIALS: Record<SundialHourDial, DialLook> = {
  stone: {
    plate: "oklch(0.8 0.015 80)",
    light: "oklch(0.9 0.012 85)",
    rim: "oklch(0.64 0.02 75)",
    engrave: "oklch(0.42 0.02 70)",
    fin: "oklch(0.56 0.06 65)",
    edge: "oklch(0.38 0.04 60)",
  },
  brass: {
    plate: "oklch(0.77 0.11 85)",
    light: "oklch(0.88 0.09 92)",
    rim: "oklch(0.6 0.1 72)",
    engrave: "oklch(0.4 0.07 62)",
    fin: "oklch(0.64 0.11 76)",
    edge: "oklch(0.4 0.07 62)",
  },
  slate: {
    plate: "oklch(0.44 0.015 250)",
    light: "oklch(0.54 0.015 250)",
    rim: "oklch(0.32 0.015 250)",
    engrave: "oklch(0.84 0.01 250)",
    fin: "oklch(0.72 0.08 80)",
    edge: "oklch(0.5 0.07 70)",
  },
};

const SHADOW = "oklch(0.2 0.02 260)";
const COOL = "oklch(0.86 0.05 240)";
const GOLD = "oklch(0.76 0.15 58)";
const DUSK = "oklch(0.22 0.04 265)";
const SUN_DAWN = "oklch(0.92 0.11 98)";
const SUN_EVE = "oklch(0.76 0.17 48)";

/* The dial, in a 64-unit box: the plate fills it, the gnomon's root sits a
   little south of the centre, and hour lines fan north from the root. */
const C: Pt = [32, 32];
const PLATE = 27.5;
const ROOT: Pt = [32, 41];
const RING = 16.5;
const NUMERALS_AT = 20.4;
const TICK_IN = 23;
const TICK_OUT = 25.3;
const SUN_AT = 27.5;
/** The dial's latitude, which sets how hour lines crowd towards noon. */
const LATITUDE = (50 * Math.PI) / 180;
const SIN_LAT = Math.sin(LATITUDE);
const COS_LAT = Math.cos(LATITUDE);
/** Gnomon height, in drawing units: the noon shadow is this over tan(40°), long enough to show past the fin. */
const GNOMON = 14;
/** Seconds of a looping day and of its dusk, at speed 1. */
const DAY_S = 8;
const NIGHT_S = 1.4;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const f = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;

/** The hour angle, radians from noon, for a share of the day 06:00 → 18:00. */
const hourAngle = (t: number) => (clamp01(t) - 0.5) * Math.PI;

/** The shadow's bearing, radians clockwise from north: tan θ = sin φ · tan H. */
const bearing = (t: number) => {
  const h = hourAngle(t);
  return Math.atan2(SIN_LAT * Math.sin(h), Math.cos(h));
};

const along = (theta: number): Pt => [Math.sin(theta), -Math.cos(theta)];

/** How far a ray from the root on this bearing runs before it meets a circle round the centre. */
const reach = (theta: number, radius: number) => {
  const d = along(theta);
  const ox = ROOT[0] - C[0];
  const oy = ROOT[1] - C[1];
  const b = ox * d[0] + oy * d[1];
  const c = ox * ox + oy * oy - radius * radius;
  return -b + Math.sqrt(Math.max(0, b * b - c));
};

const at = (theta: number, distance: number): Pt => {
  const d = along(theta);
  return [ROOT[0] + d[0] * distance, ROOT[1] + d[1] * distance];
};

/** The share of the day whose shadow points at a place on the dial. */
const timeAt = (x: number, y: number) => {
  const dx = x - ROOT[0];
  const dy = y - ROOT[1];
  let theta = Math.atan2(dx, -dy);
  if (dy > 0) theta = dx < 0 ? -Math.PI / 2 : Math.PI / 2;
  theta = clamp(theta, -Math.PI / 2, Math.PI / 2);
  const h = Math.atan2(Math.sin(theta), Math.cos(theta) * SIN_LAT);
  return clamp01(h / Math.PI + 0.5);
};

/** The sun's altitude over the dial at the equinox: sin α = cos φ · cos H. */
const altitude = (t: number) =>
  Math.asin(clamp(COS_LAT * Math.cos(hourAngle(t)), 0, 1));

const HOURS = Array.from({ length: 13 }, (_, i) => i / 12);

/** A wedge from the root along a bearing, `root` wide at the root and `tip` wide at its end. */
function wedge(theta: number, length: number, root: number, tip: number) {
  const d = along(theta);
  const n: Pt = [-d[1], d[0]];
  const end = at(theta, length);
  const pts: Pt[] = [
    [ROOT[0] + n[0] * root, ROOT[1] + n[1] * root],
    [end[0] + n[0] * tip, end[1] + n[1] * tip],
    [end[0] - n[0] * tip, end[1] - n[1] * tip],
    [ROOT[0] - n[0] * root, ROOT[1] - n[1] * root],
  ];
  return `M ${pts.map(f).join(" L ")} Z`;
}

/** The shadow's length: long and thin at morning and evening, short at noon, never off the dial. */
const shadowLength = (t: number) => {
  const theta = bearing(t);
  const most = reach(theta, TICK_OUT);
  const alt = altitude(t);
  return alt < 0.01 ? most : Math.min(most, GNOMON / Math.tan(alt));
};

/** The gnomon's fin seen from above: short, so the noon shadow shows past it. */
const FIN = [
  "M 30.6 41 L 32 28 L 33.4 41 Z",
  "M 31.1 41 L 32 30 L 32.9 41 Z",
] as const;

const ROMAN = ["VI", "IX", "XII", "III", "VI"];
const ARABIC = ["6", "9", "12", "3", "6"];

/** Engraving, computed once: hour lines, ticks and where the numerals sit. */
const ENGRAVING = (() => {
  const lines = HOURS.map((t) => {
    const theta = bearing(t);
    return `M ${f(at(theta, 4.5))} L ${f(at(theta, reach(theta, RING)))}`;
  }).join(" ");
  const long = HOURS.map((t) => {
    const theta = bearing(t);
    return `M ${f(at(theta, 4.5))} L ${f(at(theta, reach(theta, TICK_OUT - 1)))}`;
  }).join(" ");
  const ticks = HOURS.map((t, i) => {
    const theta = bearing(t);
    const inner = i % 3 === 0 ? NUMERALS_AT - 1.6 : TICK_IN;
    return `M ${f(at(theta, reach(theta, inner)))} L ${f(at(theta, reach(theta, TICK_OUT)))}`;
  }).join(" ");
  const quarters = [0, 3, 6, 9, 12].map((i) => {
    const theta = bearing(i / 12);
    const p = at(theta, reach(theta, NUMERALS_AT));
    return { x: r2(p[0]), y: r2(p[1]) };
  });
  const minor = HOURS.map((t) => {
    const theta = bearing(t);
    return `M ${f(at(theta, reach(theta, TICK_IN)))} L ${f(at(theta, reach(theta, TICK_OUT)))}`;
  }).join(" ");
  return { lines, long, ticks, minor, quarters };
})();

type Walk = { source: "pointer" | "key"; target: number; hour: number };

/**
 * An inline loader drawn as a garden sundial seen from above. The time of
 * day — the progress, or a looping day — sets the gnomon's shadow by the
 * real horizontal-dial formula, so the hour lines crowd towards noon, and
 * the sun's altitude sets its length: long and faint at morning and evening,
 * short and dark at noon. A small sun rides the rim opposite the shadow, the
 * plate is lit from its side, and the light warms from a cool dawn to a gold
 * evening; the looping day ends in a short dusk. With `progress` the time
 * follows it on the drift spring and rests in the evening at 1.
 *
 * The shadow can be walked: dragging on the dial swings it to point at the
 * finger (a flick for the first swing, then 1:1), ticking at every hour line
 * it crosses; let go and it drifts back to the real hour, or, in the looping
 * day, the day carries on from there. Left and Right walk it an hour, Page
 * keys three, Home and End to morning and evening. Under reduced motion the
 * shadow steps from hour to hour instead of sweeping.
 */
export function SundialHour({
  label = "Loading",
  hideLabel = false,
  size = 24,
  speed = 1,
  progress,
  dial = "stone",
  numerals = "roman",
  sound = false,
  disabled = false,
  className,
}: SundialHourProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const plateId = `${uid}-plate`;
  const lightId = `${uid}-light`;
  const sunGlowId = `${uid}-sun`;

  const px = Math.max(12, Math.round(size));
  const tier: Tier = px < 24 ? 0 : px < 44 ? 1 : 2;
  const unit = 64 / px;
  const sp = clamp(speed, 0.5, 2);
  const determinate = typeof progress === "number" && Number.isFinite(progress);
  const share = determinate ? clamp01(progress) : null;
  const look = DIALS[dial] ?? DIALS.stone;

  const time = useMotionValue(share ?? 0.3);
  const dusk = useMotionValue(0);

  const shadow = useTransform(time, (t) =>
    wedge(
      bearing(t),
      shadowLength(t),
      tier === 0 ? 2.6 : 1.7,
      tier === 0 ? 1 : 0.5,
    ),
  );
  const penumbra = useTransform(time, (t) =>
    wedge(bearing(t), shadowLength(t) + 1.6, 2.6, 1.4),
  );
  const shadowAlpha = useTransform(
    [time, dusk] as MotionValue<number>[],
    ([t = 0, d = 0]: number[]) =>
      r2((0.3 + (0.4 * Math.sin(altitude(t))) / COS_LAT) * (1 - d)),
  );
  const sun = useTransform(time, (t) => {
    const d = along(bearing(t));
    return {
      x: r2(C[0] - d[0] * SUN_AT),
      y: r2(C[1] - d[1] * SUN_AT),
      warm: Math.round(clamp01((t - 0.35) / 0.65) * 100),
    };
  });
  const sunX = useTransform(sun, (s) => s.x);
  const sunY = useTransform(sun, (s) => s.y);
  const sunFill = useTransform(
    sun,
    (s) => `color-mix(in oklch, ${SUN_EVE} ${s.warm}%, ${SUN_DAWN})`,
  );
  const sunAlpha = useTransform(dusk, (d) => r2(1 - d));
  const tint = useTransform(
    time,
    (t) =>
      `color-mix(in oklch, ${GOLD} ${Math.round(clamp01(t) * 100)}%, ${COOL})`,
  );
  const tintAlpha = useTransform(time, (t) =>
    r2(0.08 + 0.26 * Math.pow(Math.abs(2 * clamp01(t) - 1), 1.5)),
  );
  const penumbraAlpha = useTransform(shadowAlpha, (a) => r2(0.45 * a));
  const duskAlpha = useTransform(dusk, (d) => r2(0.55 * d));
  const lightAlpha = useTransform(dusk, (d) => r2(0.5 * (1 - d)));

  const glyphRef = React.useRef<HTMLButtonElement | null>(null);
  const loop = React.useRef({ raf: 0, last: 0, seen: false, acc: 0 });
  const clock = React.useRef((share ?? 0.3) * DAY_S);
  const step = React.useRef<(dt: number) => boolean>(() => false);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const walk = React.useRef<Walk | null>(null);
  const landing = React.useRef(false);
  const heard = React.useRef(0);

  const run = React.useCallback(
    (key: string, controls: AnimationPlaybackControls) => {
      anims.current.get(key)?.stop();
      anims.current.set(key, controls);
    },
    [],
  );
  const halt = React.useCallback((key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  }, []);

  const sleep = React.useCallback(() => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  }, []);

  // The looping day's frame loop runs only while the dial is on screen in a
  // visible page, and never while a hand holds the shadow.
  const wake = React.useCallback(() => {
    const l = loop.current;
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 0;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      if (step.current(dt)) l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  }, []);

  React.useEffect(() => {
    step.current = (dt: number) => {
      if (share !== null || walk.current || anims.current.has("time")) {
        return false;
      }
      if (!motionSafe) {
        // Reduced motion: the shadow steps an hour at a time; dusk fades.
        const l = loop.current;
        l.acc += dt;
        if (l.acc < 0.7 / sp) return true;
        l.acc = 0;
        const hour = Math.round(time.get() * 12);
        if (hour >= 12) {
          time.set(0);
          dusk.set(0.6);
          run(
            "dusk",
            animate(dusk, 0, { duration: durations.slow, ease: easings.enter }),
          );
        } else {
          time.set((hour + 1) / 12);
        }
        return true;
      }
      clock.current = (clock.current + dt * sp) % (DAY_S + NIGHT_S);
      const c = clock.current;
      if (c < DAY_S) {
        time.set(Number((c / DAY_S).toFixed(5)));
        dusk.set(0);
      } else {
        const u = (c - DAY_S) / NIGHT_S;
        time.set(u < 0.5 ? 1 : 0);
        dusk.set(r2(Math.sin(Math.PI * u)));
      }
      return true;
    };
  });

  const panHere = () => {
    const rect = glyphRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  // Every hour line the shadow crosses while a hand walks it ticks: bright in
  // the morning, low in the evening, loudest at noon.
  React.useEffect(
    () =>
      time.on("change", (t) => {
        if (!walk.current && !landing.current) return;
        const hour = Math.floor(t * 12 + 1e-6);
        if (hour === heard.current) return;
        heard.current = hour;
        audio.play("tick", {
          pitch: r2(1.3 - 0.5 * clamp01(t)),
          gain: r2(0.35 + 0.3 * (1 - Math.abs(2 * clamp01(t) - 1))),
          pan: panHere(),
        });
      }),
    [time, audio],
  );

  /** Where the shadow goes when no hand holds it. */
  const settle = (delay = 0) => {
    if (share === null) {
      halt("time");
      clock.current = clamp01(time.get()) * DAY_S;
      dusk.set(0);
      wake();
      return;
    }
    if (!motionSafe) {
      halt("time");
      time.set(share);
      return;
    }
    run(
      "time",
      animate(time, share, {
        ...springs.drift,
        delay,
        onComplete: () => anims.current.delete("time"),
      }),
    );
  };

  const api = React.useRef({ settle });
  React.useEffect(() => {
    api.current = { settle };
  });

  // The host's time of day, or the looping day.
  React.useEffect(() => {
    if (walk.current) return;
    if (share === null) {
      halt("time");
      clock.current = clamp01(time.get()) * DAY_S;
      wake();
      return;
    }
    dusk.set(0);
    if (!motionSafe) {
      halt("time");
      time.set(share);
      return;
    }
    run(
      "time",
      animate(time, share, {
        ...springs.drift,
        onComplete: () => anims.current.delete("time"),
      }),
    );
  }, [share, motionSafe, time, dusk, run, halt, wake]);

  React.useEffect(() => {
    wake();
  }, [sp, motionSafe, wake]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) sleep();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [sleep, wake]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      sleep();
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, [sleep]);

  const bindGlyph = React.useCallback(
    (node: HTMLButtonElement | null) => {
      glyphRef.current = node;
      if (!node) return;
      const l = loop.current;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        l.seen = Boolean(entry?.isIntersecting);
        if (l.seen) wake();
        else sleep();
      });
      watcher.observe(node);
      return () => {
        watcher.disconnect();
        l.seen = false;
        sleep();
      };
    },
    [wake, sleep],
  );

  /** A hand takes the shadow: the day stops under it. */
  const grab = (source: "pointer" | "key") => {
    halt("time");
    halt("dusk");
    sleep();
    dusk.set(0);
    landing.current = false;
    heard.current = Math.floor(time.get() * 12 + 1e-6);
    walk.current = {
      source,
      target: time.get(),
      hour: Math.round(time.get() * 12),
    };
  };

  /** The shadow swings to a time: a flick for a big swing, 1:1 when close. */
  const point = (t: number) => {
    const w = walk.current;
    if (!w) return;
    w.target = t;
    if (!motionSafe || Math.abs(t - time.get()) < 0.03) {
      halt("time");
      time.set(Number(t.toFixed(5)));
      return;
    }
    run("time", animate(time, t, springs.flick));
  };

  /** The hand lets go: a walk still under way lands first, then the shadow drifts back or the day goes on. */
  const letGo = (pause = 0) => {
    const w = walk.current;
    if (!w) return;
    walk.current = null;
    if (motionSafe && anims.current.has("time")) {
      landing.current = true;
      run(
        "time",
        animate(time, w.target, {
          ...springs.glide,
          onComplete: () => {
            landing.current = false;
            anims.current.delete("time");
            api.current.settle(pause);
          },
        }),
      );
      return;
    }
    settle(pause);
  };

  const local = (x: number, y: number) => {
    const rect = glyphRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return {
      x: ((x - rect.left) / rect.width) * 64,
      y: ((y - rect.top) / rect.height) * 64,
    };
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point: p, offset }) => {
      grab("pointer");
      const from = local(p.x - offset.x, p.y - offset.y);
      if (from) point(timeAt(from.x, from.y));
    },
    onMove: ({ point: p }) => {
      const here = local(p.x, p.y);
      if (here) point(timeAt(here.x, here.y));
    },
    onEnd: () => letGo(0.25),
    onCancel: () => letGo(0),
    onTap: (event) => {
      const here = local(event.clientX, event.clientY);
      if (!here) return;
      grab("pointer");
      point(timeAt(here.x, here.y));
      letGo(0.6);
    },
  });

  /** Keys walk the shadow a whole number of hours along the dial. */
  const stepHours = (n: number, absolute?: number) => {
    if (!walk.current) grab("key");
    const w = walk.current;
    if (!w || w.source !== "key") return;
    w.hour = clamp(absolute ?? w.hour + n, 0, 12);
    const t = w.hour / 12;
    w.target = t;
    if (!motionSafe) {
      halt("time");
      time.set(t);
      return;
    }
    run("time", animate(time, t, springs.glide));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        stepHours(1);
        return;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        stepHours(-1);
        return;
      case "PageUp":
        event.preventDefault();
        stepHours(3);
        return;
      case "PageDown":
        event.preventDefault();
        stepHours(-3);
        return;
      case "Home":
        event.preventDefault();
        stepHours(0, 0);
        return;
      case "End":
        event.preventDefault();
        stepHours(0, 12);
        return;
    }
  };

  const onKeyUp = () => {
    if (walk.current?.source === "key") letGo(0.45);
  };

  const fine = r2(Math.max(0.55, 0.6 * unit));
  const role = share === null ? "status" : "progressbar";
  const words = numerals === "arabic" ? ARABIC : ROMAN;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 align-middle",
        className,
      )}
    >
      <button
        ref={bindGlyph}
        type="button"
        disabled={disabled}
        aria-label="Sundial"
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          if (walk.current?.source === "key") letGo(0);
        }}
        onClick={(event) => {
          // Pointer taps arrive through the drag and keys through keydown; a
          // click with neither — assistive technology — walks an hour on.
          if (event.detail !== 0 || walk.current) return;
          stepHours(1);
          letGo(0.6);
        }}
        {...drag}
        className={cn(
          "relative shrink-0 touch-none rounded-full outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        style={{ width: px, height: px }}
      >
        <svg
          aria-hidden
          width={px}
          height={px}
          viewBox="0 0 64 64"
          className="block overflow-hidden"
        >
          <defs>
            <clipPath id={plateId}>
              <circle cx={C[0]} cy={C[1]} r={PLATE} />
            </clipPath>
            <radialGradient id={lightId}>
              <stop
                offset="0"
                style={{ stopColor: look.light, stopOpacity: 1 }}
              />
              <stop
                offset="1"
                style={{ stopColor: look.light, stopOpacity: 0 }}
              />
            </radialGradient>
            <radialGradient id={sunGlowId}>
              <stop
                offset="0"
                style={{ stopColor: SUN_DAWN, stopOpacity: 0.8 }}
              />
              <stop
                offset="1"
                style={{ stopColor: SUN_DAWN, stopOpacity: 0 }}
              />
            </radialGradient>
          </defs>

          <circle
            cx={C[0]}
            cy={C[1]}
            r={PLATE}
            strokeWidth={r2(Math.max(1.2, 1.1 * unit))}
            style={{ fill: look.plate, stroke: look.rim }}
          />
          <g clipPath={`url(#${plateId})`}>
            {tier > 0 ? (
              <motion.circle
                cx={sunX}
                cy={sunY}
                r={40}
                style={{ fill: `url(#${lightId})`, opacity: lightAlpha }}
              />
            ) : null}
            <motion.rect
              x={0}
              y={0}
              width={64}
              height={64}
              style={{ fill: tint, opacity: tintAlpha }}
            />
          </g>
          {tier === 2 ? (
            <circle
              cx={C[0]}
              cy={C[1]}
              r={PLATE - 2}
              fill="none"
              strokeWidth={0.6}
              opacity={0.6}
              style={{ stroke: look.light }}
            />
          ) : null}

          {tier === 2 ? (
            <g style={{ stroke: look.engrave }} fill="none">
              <path d={ENGRAVING.lines} strokeWidth={0.5} opacity={0.75} />
              <circle
                cx={C[0]}
                cy={C[1]}
                r={RING}
                strokeWidth={0.5}
                opacity={0.6}
              />
              <path
                d={numerals === "ticks" ? ENGRAVING.ticks : ENGRAVING.minor}
                strokeWidth={0.9}
                strokeLinecap="round"
              />
            </g>
          ) : tier === 1 ? (
            <path
              d={ENGRAVING.long}
              fill="none"
              strokeWidth={fine}
              opacity={0.7}
              style={{ stroke: look.engrave }}
            />
          ) : null}
          {tier === 2 && numerals !== "ticks"
            ? ENGRAVING.quarters.map((q, i) => (
                <text
                  key={`${q.x}-${q.y}`}
                  x={q.x}
                  y={q.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={numerals === "roman" ? 4.6 : 5.2}
                  fontWeight={600}
                  style={{ fill: look.engrave }}
                >
                  {words[i]}
                </text>
              ))
            : null}

          {tier === 2 ? (
            <motion.path
              d={penumbra}
              style={{ fill: SHADOW, opacity: penumbraAlpha }}
            />
          ) : null}
          <motion.path
            d={shadow}
            style={{ fill: SHADOW, opacity: shadowAlpha }}
          />

          <path
            d={FIN[tier === 0 ? 0 : 1]}
            strokeWidth={fine}
            strokeLinejoin="round"
            style={{ fill: look.fin, stroke: look.edge }}
          />

          <motion.circle
            cx={C[0]}
            cy={C[1]}
            r={PLATE}
            style={{ fill: DUSK, opacity: duskAlpha }}
          />

          {tier === 2 ? (
            <motion.circle
              cx={sunX}
              cy={sunY}
              r={4.5}
              style={{ fill: `url(#${sunGlowId})`, opacity: sunAlpha }}
            />
          ) : null}
          <motion.circle
            cx={sunX}
            cy={sunY}
            r={tier === 0 ? 3.4 : 2.6}
            style={{ fill: sunFill, opacity: sunAlpha }}
          />
        </svg>
      </button>
      <span
        role={role}
        aria-label={label}
        aria-valuemin={share === null ? undefined : 0}
        aria-valuemax={share === null ? undefined : 100}
        aria-valuenow={share === null ? undefined : Math.round(share * 100)}
        className={
          hideLabel ? "sr-only" : "min-w-0 text-sm leading-snug text-foreground"
        }
      >
        {label}
      </span>
      <span id={hintId} className="sr-only">
        Drag on the dial, or use the arrow keys, to walk the shadow through the
        hours.
      </span>
    </span>
  );
}
