"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { clamp, djb2, mapRange, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Hour rails — the dial sweeps one civil day. */
const MIN_HOUR = 0;
const MAX_HOUR = 24;
/** Sunrise / sunset: the sun's arc runs 180° → 0° between these hours. */
const SUNRISE = 6;
const SUNSET = 18;
/** Celestial bodies fade over ±0.7 h around their horizon crossings. */
const CROSS_FADE = 0.7;

/** Horizon line, % of scene height from the top; ground fills the rest. */
const HORIZON_PCT = 82;
/** Celestial arc radii: horizontal % of scene width, vertical % of height. */
const ARC_RX = 40;
const ARC_RY = 64;

/** Dial track geometry: a shallow dome above the scene (px unless noted). */
const TRACK_H = 56;
/** Handle reach either side of center, % of track width. */
const TRACK_SPAN = 46;
const TRACK_APEX = 12;
const TRACK_DROP = 26;
/** Arrow and page key steps, hours. */
const KEY_STEP = 1;
const PAGE_STEP = 3;

/** Shadow slab thickness on the ground band, px. */
const SHADOW_H = 12;

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const pad2 = (v: number): string => String(v).padStart(2, "0");

/**
 * One oklch stop: [lightness, chroma, hue]. Hues are UNWRAPPED — they may
 * exceed 360 (CSS normalizes) — so plain numeric lerp routes through the
 * intended colors: the horizon runs 232 → 415 (=55) into dusk, passing ~320,
 * which is the sunset magenta, not a detour through green.
 */
type SkyStop = readonly [number, number, number];

type SkyKey = { at: number; zenith: SkyStop; horizon: SkyStop };

const NIGHT_KEY: SkyKey = {
  at: 0,
  zenith: [0.13, 0.03, 265],
  horizon: [0.18, 0.045, 280],
};

/**
 * THE SKY RAMP TABLE — keyframed oklch stops, lerped per channel between
 * neighboring hours (night 0 → dawn 6 → noon 12 → dusk 18 → night 24):
 *
 *   hour   zenith (L C H)      horizon (L C H)        reads as
 *   00.0   0.130 0.030 265     0.180 0.045 280        moonless night
 *   04.8   0.150 0.038 270     0.240 0.060 322        pre-dawn violet
 *   06.0   0.350 0.065 275     0.700 0.145 420 (=60)  dawn amber
 *   08.5   0.580 0.100 248     0.800 0.070 235        morning blue
 *   12.0   0.650 0.110 240     0.860 0.050 228        noon haze
 *   15.5   0.580 0.100 245     0.800 0.070 232        afternoon
 *   18.0   0.370 0.070 282     0.680 0.150 415 (=55)  dusk ember
 *   19.4   0.160 0.040 272     0.230 0.055 330        late twilight
 *   24.0   0.130 0.030 265     0.180 0.045 280        night again
 *
 * The gradient's mid stop is the 55% channel-mix of zenith and horizon, so
 * at dawn/dusk its hue lands near 355 — the pink twilight band — for free.
 */
const SKY_RAMP: readonly SkyKey[] = [
  NIGHT_KEY,
  { at: 4.8, zenith: [0.15, 0.038, 270], horizon: [0.24, 0.06, 322] },
  { at: 6, zenith: [0.35, 0.065, 275], horizon: [0.7, 0.145, 420] },
  { at: 8.5, zenith: [0.58, 0.1, 248], horizon: [0.8, 0.07, 235] },
  { at: 12, zenith: [0.65, 0.11, 240], horizon: [0.86, 0.05, 228] },
  { at: 15.5, zenith: [0.58, 0.1, 245], horizon: [0.8, 0.07, 232] },
  { at: 18, zenith: [0.37, 0.07, 282], horizon: [0.68, 0.15, 415] },
  { at: 19.4, zenith: [0.16, 0.04, 272], horizon: [0.23, 0.055, 330] },
  { at: 24, zenith: [0.13, 0.03, 265], horizon: [0.18, 0.045, 280] },
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpStop = (a: SkyStop, b: SkyStop, t: number): SkyStop => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

const fmtStop = (s: SkyStop): string =>
  `oklch(${s[0].toFixed(3)} ${s[1].toFixed(3)} ${s[2].toFixed(1)})`;

/** The interpolated zenith/horizon pair for an hour, off the ramp table. */
const skyAt = (h: number): { zenith: SkyStop; horizon: SkyStop } => {
  let lo = NIGHT_KEY;
  let hi: SkyKey | null = null;
  for (const key of SKY_RAMP) {
    if (key.at <= h) lo = key;
    if (hi === null && key.at >= h) hi = key;
  }
  const up = hi ?? lo;
  const t = up.at === lo.at ? 0 : clamp((h - lo.at) / (up.at - lo.at), 0, 1);
  return {
    zenith: lerpStop(lo.zenith, up.zenith, t),
    horizon: lerpStop(lo.horizon, up.horizon, t),
  };
};

/** Sun sweep: 180° (east rail) at 06:00 through 90° (apex) to 0° at 18:00. */
const sunAngleAt = (h: number): number => mapRange(h, SUNRISE, SUNSET, 180, 0);
/** Altitude 0..1 — sin of the (clamped) arc angle; 1 exactly at noon. */
const sunAltAt = (h: number): number => Math.sin(toRad(sunAngleAt(h)));
/** Above-horizon fade: 0 down, 1 up, ramping over ±0.7 h at 06:00 / 18:00. */
const sunFadeAt = (h: number): number =>
  Math.min(
    mapRange(h, SUNRISE - CROSS_FADE, SUNRISE + CROSS_FADE, 0, 1),
    mapRange(h, SUNSET - CROSS_FADE, SUNSET + CROSS_FADE, 1, 0),
  );
/** The moon rides the same arc in anti-phase — the sun's clock +12 h. */
const moonHourAt = (h: number): number => (h + 12) % 24;
const moonFadeAt = (h: number): number =>
  Math.max(
    mapRange(h, SUNSET - CROSS_FADE, SUNSET + CROSS_FADE, 0, 1),
    mapRange(h, SUNRISE + CROSS_FADE, SUNRISE - CROSS_FADE, 0, 1),
  );
/** Stars hold the dark hours: fading in below 5.5 h and above 18.5 h. */
const starFadeAt = (h: number): number =>
  Math.max(mapRange(h, 5.5, 4.3, 0, 1), mapRange(h, 18.5, 19.7, 0, 1));

/**
 * The skyline: left/width in % of scene width, rise as a fraction of scene
 * height. Every building stands on the horizon line.
 */
const BUILDINGS = [
  { left: 15, width: 14, rise: 0.42 },
  { left: 43, width: 18, rise: 0.58 },
  { left: 69, width: 12, rise: 0.32 },
] as const;

/*
 * SHADOW PROJECTION — an elevation scene, so shadows are ground slabs. Each
 * building's slab anchors at its center foot on the horizon; its natural
 * width is the building's own HEIGHT in px, so plain scaleX IS the length
 * rule:
 *
 *   altitude a = sin(sunAngle)     0 at either horizon, 1 at noon
 *   azimuth  s = -cos(sunAngle)    +1 sun east (throws west/right),
 *                                  -1 sun west; 0 dead noon
 *   length     = mapRange(a, 0, 1, 2.4, 0.25) × building height
 *   scaleX     = s × that factor   — the sign steers the anti-sun side and
 *                                  tapers the slab under the eaves at noon
 *   skewX      = s × mapRange(a, 0, 1, 46°, 10°) — raking light shears the
 *                slab down-sun; s must sign the shear itself because motion
 *                composes scale BEFORE skew, so a flipped scale would not
 *                mirror an unsigned skew
 *   opacity    = sunFade × mapRange(a, 0, 1, 0.34, 0.48) — dissolves to 0
 *                once the sun is below the horizon
 */

/** 14 fixed stars, seeded from the component name — never Math.random. */
const STAR_RNG = seeded(djb2("daylight-dial"));
const STARS = Array.from({ length: 14 }, () => ({
  left: 3 + STAR_RNG() * 94,
  top: 4 + STAR_RNG() * 46,
  size: 1 + STAR_RNG() * 1.2,
  dim: 0.45 + STAR_RNG() * 0.55,
}));

/** Track guide: rails at ±TRACK_SPAN, apex at noon, in a 100×TRACK_H box. */
const RAIL_Y = TRACK_APEX + TRACK_DROP;
const GUIDE = `M ${50 - TRACK_SPAN} ${RAIL_Y} Q 50 ${
  2 * TRACK_APEX - RAIL_Y
} ${50 + TRACK_SPAN} ${RAIL_Y}`;

export type DaylightDialProps = {
  /**
   * Controlled hour, 0–24. Gestures still scrub the dial, so mirror
   * `onHourChange` back into your state when controlling.
   */
  hour?: number;
  /** Boot hour when uncontrolled. @default 10 */
  defaultHour?: number;
  /** Fires on settle (drag release, keys) with the integer hour — deduped. */
  onHourChange?: (hour: number) => void;
  /** Scene height, px. @default 250 */
  height?: number;
  className?: string;
  /** Accessible name for the dial. @default "Time of day" */
  "aria-label"?: string;
};

/**
 * A time-of-day dial over a diorama. ONE hour motion value — commanded by
 * the arc track, chased through `glide` so the sky trails the finger — drives
 * every layer by transform: the sky re-mixes its oklch gradient off the ramp
 * table each frame; the sun and moon ride one semicircular arc in anti-phase,
 * each fading over ±0.7 h around its horizon crossings; three skyline
 * silhouettes warm slightly under a low sun; their cast shadows stretch,
 * rake, and swap sides off the sun's altitude and azimuth (projection notes
 * above); and fourteen seeded stars keep the dark hours. Releasing a drag
 * settles the dial on the nearest whole hour, like a detent.
 *
 * The whole track is the slider: drag anywhere on it (pointer-captured),
 * arrows step ±1 h, PageUp/Down ±3 h, Home/End seat 0/24, and the value is
 * spoken "14:00"-style; `onHourChange` reports settles (release and keys) as
 * deduped integers. The grabber is a celestial handle — a mini sun and moon
 * crossfading on the same horizon fades as the sky. A mono clock chip
 * top-right reads the sprung hour live.
 *
 * Reduced motion: the spring is bypassed and the hour scrubs 1:1 — every
 * layer still derives, nothing else changes. No rAF loops, no timers, no
 * randomness at render; the spring is hook-owned, so nothing outlives
 * unmount.
 */
export function DaylightDial({
  hour,
  defaultHour = 10,
  onHourChange,
  height = 250,
  className,
  "aria-label": ariaLabel = "Time of day",
}: DaylightDialProps) {
  const motionSafe = useMotionSafe();
  const trackRef = React.useRef<HTMLDivElement>(null);

  /** Commanded hour — the slider's value. */
  const target = useMotionValue(clamp(hour ?? defaultHour, MIN_HOUR, MAX_HOUR));
  const sprung = useSpring(target, GLIDE);
  /** THE hour: every scene layer below derives from this one motion value. */
  const live = motionSafe ? sprung : target;

  /** Slider semantics mirror the commanded hour. */
  const [announced, setAnnounced] = React.useState(() =>
    Math.round(clamp(hour ?? defaultHour, MIN_HOUR, MAX_HOUR)),
  );
  /** The clock chip mirrors the sprung hour the scene is actually lit for. */
  const [clockHour, setClockHour] = React.useState(announced);

  const lastEmittedRef = React.useRef(
    Math.round(clamp(hour ?? defaultHour, MIN_HOUR, MAX_HOUR)),
  );
  const onHourChangeRef = React.useRef(onHourChange);
  React.useEffect(() => {
    onHourChangeRef.current = onHourChange;
  });

  // Readouts update through motion-value events — never effect bodies.
  useMotionValueEvent(target, "change", (h) => {
    setAnnounced(Math.round(clamp(h, MIN_HOUR, MAX_HOUR)));
  });
  useMotionValueEvent(live, "change", (h) => {
    setClockHour(Math.round(clamp(h, MIN_HOUR, MAX_HOUR)));
  });

  // Controlled hour steers the dial — a motion-value op only, no state here.
  React.useEffect(() => {
    if (hour === undefined) return;
    const next = clamp(hour, MIN_HOUR, MAX_HOUR);
    if (next !== target.get()) target.set(next);
  }, [hour, target]);

  const emit = (settled: number) => {
    if (lastEmittedRef.current === settled) return;
    lastEmittedRef.current = settled;
    onHourChangeRef.current?.(settled);
  };

  /** Seat a whole hour (keys, drag release) and report the settle once. */
  const settleTo = (next: number) => {
    const v = clamp(Math.round(next), MIN_HOUR, MAX_HOUR);
    target.set(v);
    emit(v);
  };

  /** Track x → hour, matched to the handle's ±TRACK_SPAN reach. */
  const scrubTo = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const inMin = rect.left + rect.width * ((50 - TRACK_SPAN) / 100);
    const inMax = rect.left + rect.width * ((50 + TRACK_SPAN) / 100);
    target.set(mapRange(clientX, inMin, inMax, MIN_HOUR, MAX_HOUR));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    scrubTo(event.clientX);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    scrubTo(event.clientX);
  };
  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    settleTo(target.get());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = Math.round(target.get()) + KEY_STEP;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = Math.round(target.get()) - KEY_STEP;
    } else if (event.key === "PageUp") {
      next = Math.round(target.get()) + PAGE_STEP;
    } else if (event.key === "PageDown") {
      next = Math.round(target.get()) - PAGE_STEP;
    } else if (event.key === "Home") {
      next = MIN_HOUR;
    } else if (event.key === "End") {
      next = MAX_HOUR;
    }
    if (next === null) return;
    event.preventDefault();
    settleTo(next);
  };

  // == SKY == the gradient re-derives from the ramp table (docs above).
  const skyBackground = useTransform(live, (h) => {
    const s = skyAt(clamp(h, MIN_HOUR, MAX_HOUR));
    const mid = lerpStop(s.zenith, s.horizon, 0.55);
    return `linear-gradient(to bottom, ${fmtStop(s.zenith)} 0%, ${fmtStop(
      mid,
    )} 58%, ${fmtStop(s.horizon)} 100%)`;
  });

  // == SUN & MOON == positions off the shared semicircular arc.
  const sunLeft = useTransform(
    live,
    (h) => `${(50 + ARC_RX * Math.cos(toRad(sunAngleAt(h)))).toFixed(2)}%`,
  );
  const sunTop = useTransform(
    live,
    (h) => `${(HORIZON_PCT - ARC_RY * sunAltAt(h)).toFixed(2)}%`,
  );
  const sunOpacity = useTransform(live, sunFadeAt);
  const moonLeft = useTransform(
    live,
    (h) =>
      `${(50 + ARC_RX * Math.cos(toRad(sunAngleAt(moonHourAt(h))))).toFixed(2)}%`,
  );
  const moonTop = useTransform(
    live,
    (h) =>
      `${(
        HORIZON_PCT - ARC_RY * Math.sin(toRad(sunAngleAt(moonHourAt(h))))
      ).toFixed(2)}%`,
  );
  const moonOpacity = useTransform(live, moonFadeAt);

  // == STARS == one fade for the field; per-star dimness is seeded.
  const starsOpacity = useTransform(live, starFadeAt);

  // == GROUND & SKYLINE == scenery tones nudged by the same hour.
  // Ground: night slate 0.15/0.015/250 → noon moss 0.25/0.035/145.
  const groundColor = useTransform(live, (h) => {
    const alt = sunAltAt(h);
    return `oklch(${(0.15 + alt * 0.1).toFixed(3)} ${(
      0.015 +
      alt * 0.02
    ).toFixed(3)} ${(250 - alt * 105).toFixed(1)})`;
  });
  // Silhouette ink: L 0.13 night → 0.17 noon; a low warm sun (sun up, near
  // the horizon) swings the hue 268 → 78 at chroma ≤ 0.035 — an ember rim
  // that never leaves near-black.
  const silhouette = useTransform(live, (h) => {
    const alt = sunAltAt(h);
    const warm = sunFadeAt(h) * (1 - alt);
    return `oklch(${(0.13 + alt * 0.04).toFixed(3)} ${(
      0.015 +
      warm * 0.02
    ).toFixed(3)} ${(268 - warm * 190).toFixed(1)})`;
  });

  // == SHADOWS == shared by all three slabs (projection notes above).
  const shadowScaleX = useTransform(live, (h) => {
    const s = -Math.cos(toRad(sunAngleAt(h)));
    return s * mapRange(sunAltAt(h), 0, 1, 2.4, 0.25);
  });
  const shadowSkewX = useTransform(live, (h) => {
    const s = -Math.cos(toRad(sunAngleAt(h)));
    return s * mapRange(sunAltAt(h), 0, 1, 46, 10);
  });
  const shadowOpacity = useTransform(
    live,
    (h) => sunFadeAt(h) * mapRange(sunAltAt(h), 0, 1, 0.34, 0.48),
  );

  // == THE HANDLE == rides the track dome on the same sprung hour.
  const handleLeft = useTransform(live, (h) => {
    const a = mapRange(h, MIN_HOUR, MAX_HOUR, -90, 90);
    return `${(50 + Math.sin(toRad(a)) * TRACK_SPAN).toFixed(2)}%`;
  });
  const handleTop = useTransform(live, (h) => {
    const a = mapRange(h, MIN_HOUR, MAX_HOUR, -90, 90);
    return TRACK_APEX + (1 - Math.cos(toRad(a))) * TRACK_DROP;
  });

  return (
    <div
      className={cn(
        "border-hairline bg-surface-0 relative w-full rounded-3 border select-none",
        className,
      )}
    >
      {/* == THE DIAL == the whole track is the slider. */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={24}
        aria-valuenow={announced}
        aria-valuetext={`${pad2(announced)}:00`}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative mx-3 mt-2 cursor-ew-resize touch-none rounded-2"
        style={{ height: TRACK_H }}
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 100 ${TRACK_H}`}
          preserveAspectRatio="none"
        >
          <path
            d={GUIDE}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* The celestial grabber: mini sun and moon crossfade with the sky. */}
        <motion.div
          aria-hidden
          style={{ left: handleLeft, top: handleTop, x: "-50%", y: "-50%" }}
          className="border-hairline-strong bg-surface-2 absolute size-[22px] rounded-full border shadow-[0_1px_4px_oklch(0.05_0.02_258/0.35)]"
        >
          <motion.span
            className="absolute inset-[3px] rounded-full"
            style={{
              opacity: sunOpacity,
              background: "oklch(0.85 0.15 78)",
              boxShadow: "0 0 8px 2px oklch(0.82 0.15 70 / 0.55)",
            }}
          />
          <motion.span
            className="absolute inset-[3px] rounded-full"
            style={{ opacity: moonOpacity, background: "oklch(0.9 0.015 255)" }}
          >
            <span
              className="absolute top-[2px] right-[2px] size-[7px] rounded-full"
              style={{ background: "var(--card)" }}
            />
          </motion.span>
        </motion.div>
      </div>

      {/* == THE SCENE == a landscape plate, wholly derived and decorative. */}
      <div
        aria-hidden
        className="border-hairline relative mx-3 mt-1 mb-3 overflow-hidden rounded-2 border"
        style={{ height }}
      >
        {/* Sky */}
        <motion.div
          className="absolute inset-0"
          style={{ background: skyBackground }}
        />

        {/* Stars — the field fades as one; each dot keeps its seeded dimness. */}
        <motion.div
          className="absolute inset-0"
          style={{ opacity: starsOpacity }}
        >
          {STARS.map((star) => (
            <span
              key={`${star.left.toFixed(3)}-${star.top.toFixed(3)}`}
              className="absolute rounded-full"
              style={{
                left: `${star.left.toFixed(2)}%`,
                top: `${star.top.toFixed(2)}%`,
                width: star.size,
                height: star.size,
                opacity: star.dim,
                background: "oklch(0.95 0.01 260)",
              }}
            />
          ))}
        </motion.div>

        {/* Moon — a pale disc with a crescent notch (two circles). */}
        <motion.div
          className="absolute size-5 rounded-full"
          style={{
            left: moonLeft,
            top: moonTop,
            x: "-50%",
            y: "-50%",
            opacity: moonOpacity,
            background: "oklch(0.9 0.015 255)",
            boxShadow: "0 0 12px 4px oklch(0.9 0.02 255 / 0.22)",
          }}
        >
          <span
            className="absolute top-[3px] right-[3px] size-3 rounded-full"
            style={{ background: "oklch(0.17 0.035 268)" }}
          />
        </motion.div>

        {/* Sun — an accent-warm disc in a soft glow ring. */}
        <motion.div
          className="absolute size-[26px] rounded-full"
          style={{
            left: sunLeft,
            top: sunTop,
            x: "-50%",
            y: "-50%",
            opacity: sunOpacity,
            background: "oklch(0.86 0.14 80)",
            boxShadow:
              "0 0 0 6px oklch(0.85 0.15 75 / 0.16), 0 0 24px 10px oklch(0.82 0.16 62 / 0.38)",
          }}
        />

        {/* Ground */}
        <motion.div
          className="absolute inset-x-0 bottom-0"
          style={{ height: `${100 - HORIZON_PCT}%`, background: groundColor }}
        />
        {/* Horizon glint */}
        <div
          className="absolute inset-x-0"
          style={{
            top: `${HORIZON_PCT}%`,
            height: 1,
            background: "oklch(0.95 0.02 260 / 0.10)",
          }}
        />

        {/* Cast shadows — slabs on the ground band, one per building. */}
        {BUILDINGS.map((b) => (
          <motion.div
            key={`shadow-${b.left}`}
            className="absolute"
            style={{
              left: `${b.left + b.width / 2}%`,
              top: `${HORIZON_PCT}%`,
              width: b.rise * height,
              height: SHADOW_H,
              transformOrigin: "left top",
              scaleX: shadowScaleX,
              skewX: shadowSkewX,
              opacity: shadowOpacity,
              background: "oklch(0.12 0.02 258)",
            }}
          />
        ))}

        {/* Skyline — three cutout silhouettes standing on the horizon. */}
        {BUILDINGS.map((b) => (
          <motion.div
            key={`tower-${b.left}`}
            className="absolute rounded-t-[2px]"
            style={{
              left: `${b.left}%`,
              width: `${b.width}%`,
              bottom: `${100 - HORIZON_PCT}%`,
              height: `${b.rise * 100}%`,
              background: silhouette,
            }}
          />
        ))}

        {/* Clock chip — the sprung hour, live. */}
        <div className="border-hairline bg-surface-0/70 absolute top-2 right-2 rounded-2 border px-2 py-0.5 backdrop-blur-sm">
          <span className="text-ink font-mono text-[11px] tabular-nums">
            {pad2(clockHour)}:00
          </span>
        </div>
      </div>
    </div>
  );
}
