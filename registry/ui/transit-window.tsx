"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { djb2, mapRange, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type TransitWindowProps = {
  /**
   * Track length multiplier — the scrollable journey is `journey × height` px
   * (all four mile markers pass within the first 630px). @default 4
   */
  journey?: number;
  /** Cabin viewport height in px. @default 250 */
  height?: number;
  /**
   * Fires as each of the four mile markers (1–4) passes, deduped ascending.
   * Markers live on the FIRST lap of the loop only — later laps repeat the
   * scenery, not the events. Scrolling back below a marker re-arms it.
   */
  onMilestone?: (marker: number) => void;
  className?: string;
  "aria-label"?: string;
};

/** Logical width of one scenery tile; every band wraps at this period. */
const LOOP = 720;

/** Parallax speeds, far to near — the near fence outruns the far hills. */
const FAR_SPEED = 0.15;
const MID_SPEED = 0.45;
const NEAR_SPEED = 1;

/** Sway follower runs on the house glide constants. */
const SWAY_SPRING = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
};

/**
 * Mile markers, evenly spaced through the tile (90 · 270 · 450 · 630). The
 * near band moves ×1.0, so marker n crosses the cabin exactly at D = x.
 */
const MILE_MARKERS = [1, 2, 3, 4].map((n) => ({ n, x: n * 180 - 90 }));

const FENCE_XS = Array.from({ length: 10 }, (_, i) => 36 + i * 72);

// Dusk scene literals — the view is a self-contained vignette so it stays
// legible in both themes; only the cabin chrome speaks in tokens.
const SKY =
  "linear-gradient(180deg, oklch(0.48 0.05 280) 0%, oklch(0.40 0.055 295) 55%, oklch(0.33 0.05 305) 100%)";
const GROUND =
  "linear-gradient(180deg, oklch(0.22 0.025 305) 0%, oklch(0.185 0.02 305) 100%)";
const HILL_BACK_FILL = "oklch(0.30 0.045 305)";
const HILL_FRONT_FILL = "oklch(0.26 0.04 305)";
const CLOUD_FILL = "oklch(0.58 0.035 290)";
const MAST_INK = "oklch(0.205 0.025 300)";
const LAMP = "oklch(0.82 0.13 80)";
const LAMP_GLOW = "0 0 6px oklch(0.75 0.12 80 / 0.55)";
const NEAR_INK = "oklch(0.14 0.015 300)";
const PLATE = "oklch(0.87 0.06 85)";
const PLATE_INK = "oklch(0.25 0.03 300)";

/**
 * A sine-hump silhouette closed to the tile floor. An integer cycle count
 * makes x=0 and x=720 meet in value and slope, so the wrap is seamless.
 */
const hillPath = (
  cycles: number,
  phase: number,
  amp: number,
  base: number,
  floor: number,
): string => {
  const cmds: string[] = [];
  for (let x = 0; x <= LOOP; x += 20) {
    const y = base - amp * Math.sin((x / LOOP) * Math.PI * 2 * cycles + phase);
    cmds.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`);
  }
  return `${cmds.join(" ")} L${LOOP} ${floor} L0 ${floor} Z`;
};

/** All scatter is seeded off the serial — identical on server and client. */
const SCENE = (() => {
  const rng = seeded(djb2("kinetiq:transit-window:KQ-127"));
  const hillBack = hillPath(2, rng() * Math.PI * 2, 22, 58, 96);
  const hillFront = hillPath(3, rng() * Math.PI * 2, 15, 76, 96);
  const clouds = [0, 1, 2].map(() => {
    const w = 56 + rng() * 64;
    return {
      x: rng() * (LOOP - w),
      y: 10 + rng() * 22,
      w,
      h: 9 + rng() * 7,
      o: 0.24 + rng() * 0.16,
    };
  });
  const masts = [0, 1, 2, 3, 4, 5].map((slot) => ({
    x: slot * 120 + 10 + rng() * 90,
    h: 52 + rng() * 16,
  }));
  return { hillBack, hillFront, clouds, masts };
})();

/**
 * A train window onto a passing dusk landscape — the outside moves only with
 * your scroll. Container scrollTop becomes journey distance D; three scenery
 * bands wrap a fixed 720px tile at ×0.15 / ×0.45 / ×1.0, each rendered twice
 * side by side and translated by −((D × speed) % 720), so the near fence
 * outruns the far hills. The view (never the frame) leans with scroll
 * velocity through one glide spring and settles level at rest. Four mile
 * markers ride the near band and fire onMilestone once each on the first
 * lap, re-arming on scroll-back. Under reduced motion the scene poses as a
 * static mid-journey frame and only the distance readout tracks the scroll.
 */
export function TransitWindow({
  journey = 4,
  height = 250,
  onMilestone,
  className,
  "aria-label": ariaLabel = "Transit window",
}: TransitWindowProps) {
  const motionSafe = useMotionSafe();
  const regionRef = React.useRef<HTMLDivElement>(null);
  const passedRef = React.useRef(0);

  /** D — journey distance in px; every visual in the view derives from it. */
  const d = useMotionValue(0);
  const velocity = useVelocity(d);
  const swayGlide = useSpring(velocity, SWAY_SPRING);
  const sway = useTransform(swayGlide, (v) => mapRange(v, -800, 800, 1.2, -1.2));
  const metersText = useTransform(d, (v) =>
    String(Math.round(v / 5) * 5).padStart(4, "0"),
  );

  const laps = Math.max(1, journey);
  /** The frozen reduced-motion frame poses the bands at mid-journey. */
  const staticD = (laps * height) / 2;

  // Milestones: marker n passes when D crosses its logical x. Positions sit
  // below one LOOP, so they fire on lap one only (the honest rule — beyond
  // that the scenery repeats but the count holds at four). Deduped ascending
  // via ref; scrolling back below a marker re-arms it.
  useMotionValueEvent(d, "change", (v) => {
    let passed = 0;
    for (const marker of MILE_MARKERS) {
      if (v >= marker.x) passed += 1;
    }
    if (passed > passedRef.current) {
      for (let k = passedRef.current + 1; k <= passed; k += 1) {
        onMilestone?.(k);
      }
    }
    passedRef.current = passed;
  });

  // Adopt a restored scroll offset (remount, bfcache) into D once on mount.
  React.useEffect(() => {
    const el = regionRef.current;
    if (el && el.scrollTop !== 0) d.set(el.scrollTop);
  }, [d]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    d.set(event.currentTarget.scrollTop);
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={regionRef}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={handleScroll}
        style={{ height }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 overflow-y-auto rounded-4 border outline-none focus-visible:ring-2"
      >
        {/* The track sets journey length; the stage rides it, pinned. */}
        <div className="relative" style={{ height: height * (laps + 1) }}>
          <div className="sticky top-0" style={{ height }}>
            <p className="sr-only">
              A train window at dusk. Scrolling rolls the landscape past the
              glass at three depths: far hills under seeded clouds, a row of
              signal masts, and a near fence carrying four numbered mile
              markers that pass on the first stretch of the journey.
            </p>

            <div className="flex h-full min-h-0 flex-col gap-2 p-3">
              {/* THE VIEW — bands at a fixed 720px logical width, clipped by
                  the frame at 100% width; only the scene sways. */}
              <div
                aria-hidden
                className="border-hairline-strong relative min-h-0 flex-1 overflow-hidden rounded-3 border"
              >
                <motion.div
                  className="absolute -inset-2"
                  style={{ background: SKY, rotate: motionSafe ? sway : 0 }}
                >
                  <Band
                    d={d}
                    speed={FAR_SPEED}
                    motionSafe={motionSafe}
                    staticD={staticD}
                    bottom="26%"
                    height={96}
                  >
                    <FarScenery />
                  </Band>
                  <div
                    className="absolute inset-x-0 bottom-0"
                    style={{ height: "26%", background: GROUND }}
                  />
                  <Band
                    d={d}
                    speed={MID_SPEED}
                    motionSafe={motionSafe}
                    staticD={staticD}
                    bottom="21%"
                    height={70}
                  >
                    <MidScenery />
                  </Band>
                  <Band
                    d={d}
                    speed={NEAR_SPEED}
                    motionSafe={motionSafe}
                    staticD={staticD}
                    bottom="4%"
                    height={58}
                  >
                    <NearScenery />
                  </Band>
                </motion.div>

                {/* glass shading + the center mullion (frame chrome, tokens) */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ boxShadow: "inset 0 0 26px oklch(0.1 0.02 300 / 0.4)" }}
                />
                <div className="border-hairline-strong bg-surface-1 absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 border-x" />
              </div>

              {/* THE SILL — ticket chip and distance readout. */}
              <div className="border-hairline bg-surface-1 flex h-9 shrink-0 items-center justify-between rounded-3 border px-2.5 font-mono text-[10px] tracking-wide">
                <span className="text-ink-2">CAR 7 &middot; SEAT 14</span>
                <span className="text-ink-3 tabular-nums">
                  DISTANCE &middot;{" "}
                  <motion.span className="text-ink-2">{metersText}</motion.span>m
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type BandProps = {
  d: MotionValue<number>;
  speed: number;
  motionSafe: boolean;
  /** Journey distance the reduced-motion frame is frozen at. */
  staticD: number;
  /** Distance above the view floor, e.g. "26%". */
  bottom: string;
  height: number;
  children: React.ReactNode;
};

/**
 * One parallax strip: its tile rendered twice side by side, translated by
 * −((D × speed) % LOOP) so the seam never shows. The transform lives here,
 * per band; under reduced motion the offset is a plain frozen number.
 */
function Band({
  d,
  speed,
  motionSafe,
  staticD,
  bottom,
  height,
  children,
}: BandProps) {
  const bandX = useTransform(d, (v) => -((v * speed) % LOOP));
  return (
    <motion.div
      className="absolute left-0"
      style={{
        bottom,
        height,
        width: LOOP * 2,
        x: motionSafe ? bandX : -((staticD * speed) % LOOP),
      }}
    >
      <div className="absolute inset-y-0 left-0" style={{ width: LOOP }}>
        {children}
      </div>
      <div className="absolute inset-y-0" style={{ left: LOOP, width: LOOP }}>
        {children}
      </div>
    </motion.div>
  );
}

/** FAR ×0.15 — two overlapping sine-hump hills and three seeded clouds. */
function FarScenery() {
  return (
    <svg
      width={LOOP}
      height={96}
      viewBox={`0 0 ${LOOP} 96`}
      className="absolute bottom-0 left-0"
      fill="none"
    >
      {SCENE.clouds.map((cloud, i) => (
        <ellipse
          key={i}
          cx={cloud.x + cloud.w / 2}
          cy={cloud.y}
          rx={cloud.w / 2}
          ry={cloud.h / 2}
          fill={CLOUD_FILL}
          opacity={cloud.o}
        />
      ))}
      <path d={SCENE.hillBack} fill={HILL_BACK_FILL} />
      <path d={SCENE.hillFront} fill={HILL_FRONT_FILL} />
    </svg>
  );
}

/** MID ×0.45 — six signal masts at seeded x, lamps lit for the night run. */
function MidScenery() {
  return (
    <>
      {SCENE.masts.map((mast, i) => (
        <div
          key={i}
          className="absolute bottom-0"
          style={{ left: mast.x, width: 16, height: mast.h }}
        >
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2"
            style={{ width: 2.5, height: "100%", background: MAST_INK }}
          />
          <div
            className="absolute inset-x-0"
            style={{ top: 7, height: 2.5, background: MAST_INK }}
          />
          <div
            className="absolute rounded-full"
            style={{
              top: 6,
              left: -1.5,
              width: 4.5,
              height: 4.5,
              background: LAMP,
              boxShadow: LAMP_GLOW,
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              top: 6,
              right: -1.5,
              width: 4.5,
              height: 4.5,
              background: LAMP,
              boxShadow: LAMP_GLOW,
            }}
          />
        </div>
      ))}
    </>
  );
}

/** NEAR ×1.0 — a fence line of ten posts and the four numbered mile markers. */
function NearScenery() {
  return (
    <>
      <div
        className="absolute inset-x-0"
        style={{ bottom: 13, height: 2, background: NEAR_INK, opacity: 0.75 }}
      />
      {FENCE_XS.map((x) => (
        <div
          key={x}
          className="absolute bottom-0"
          style={{
            left: x,
            width: 3,
            height: 22,
            background: NEAR_INK,
            borderRadius: 1,
          }}
        />
      ))}
      {MILE_MARKERS.map((marker) => (
        <div
          key={marker.n}
          className="absolute bottom-0"
          style={{ left: marker.x - 11, width: 22, height: 56 }}
        >
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2"
            style={{ width: 3, height: "100%", background: NEAR_INK }}
          />
          <div
            className="absolute inset-x-0 top-0 text-center font-mono"
            style={{
              height: 17,
              borderRadius: 3,
              background: PLATE,
              color: PLATE_INK,
              fontSize: 10,
              lineHeight: "17px",
              letterSpacing: "0.06em",
            }}
          >
            {String(marker.n).padStart(2, "0")}
          </div>
        </div>
      ))}
    </>
  );
}
