"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type Intensity = "tap" | "hit" | "slam";

/** Fixed reading order for the three strike buttons. */
const INTENSITY_ORDER = [
  "tap",
  "hit",
  "slam",
] as const satisfies readonly Intensity[];

type IntensityConfig = {
  /** Freeze length in ms — the number the readout names. */
  freezeMs: number;
  /** Flash overlay's peak opacity, 0–1. */
  flashPeak: number;
  /** Jolt travel, px. */
  joltPx: number;
  /** Impact lines drawn per strike. */
  lineCount: number;
  /** Impact line length, px. */
  lineLength: number;
};

/** The whole component's physics table — every number a strike touches. */
const INTENSITIES = {
  tap: {
    freezeMs: 60,
    flashPeak: 0.16,
    joltPx: 2,
    lineCount: 6,
    lineLength: 12,
  },
  hit: {
    freezeMs: 110,
    flashPeak: 0.26,
    joltPx: 4,
    lineCount: 9,
    lineLength: 18,
  },
  slam: {
    freezeMs: 180,
    flashPeak: 0.4,
    joltPx: 7,
    lineCount: 12,
    lineLength: 26,
  },
} as const satisfies Record<Intensity, IntensityConfig>;

/** Puck footprint and half-travel along its rail, px. */
const PUCK_SIZE = 12;
const TRACK_HALF = 46;
/** One full there-and-back loop of the scene, seconds — cheap and calm. */
const LOOP_S = 1.8;

/** Flash and jolt are brief impulses; lines get a touch longer to read as an exit. */
const FLASH_S = durations.fast;
const JOLT_S = durations.fast;
const LINE_S = durations.base;

/** How long the reduced-motion static outline holds before fading, ms. */
const EMPHASIS_MS = 400;

/**
 * A translucent surface/ink mix, never a raw white — leans bright against
 * the dark default theme and reads as a legible dimming pulse in light mode,
 * since ink and card are guaranteed to contrast in either.
 */
const FLASH_COLOR = "color-mix(in oklab, var(--ink) 60%, var(--card))";

const PILL_BASE =
  "h-7 rounded-2 border px-2.5 text-xs font-medium capitalize transition-colors touch-manipulation select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1";
const PILL_ACTIVE = "border-primary bg-cobalt-wash text-ink";
const PILL_IDLE = "border-input text-ink-2 hover:bg-cobalt-wash hover:text-ink";

/** One struck impact — its id remounts the flash and the impact lines. */
type Burst = {
  id: number;
  intensity: Intensity;
};

/** The mono readout's last word on a strike. */
type ReadoutEntry = {
  ms: number;
  /** True only when the freeze actually ran — false under reduced motion or Compare. */
  applied: boolean;
};

function describeReadout(
  entry: ReadoutEntry | null,
  motionSafe: boolean,
): string {
  if (!entry) return "ready — strike to test";
  if (entry.applied) return `stopped ${entry.ms}ms`;
  if (!motionSafe) return `${entry.ms}ms, reduced motion — no freeze`;
  return `${entry.ms}ms, compare — no freeze`;
}

/** A fixed radial fan of short lines, drawn outward then fading — never randomized. */
function ImpactLines({
  count,
  length,
}: {
  count: number;
  length: number;
}): React.JSX.Element {
  const step = 360 / count;
  const lines = Array.from({ length: count }, (_, index) => ({
    angle: step * index,
    key: index,
  }));
  return (
    <>
      {lines.map((line) => (
        <motion.span
          key={line.key}
          aria-hidden
          className="absolute top-0 left-0 origin-left rounded-full bg-primary"
          style={{ width: length, height: 1.5, rotate: `${line.angle}deg` }}
          initial={{ scaleX: 0, opacity: 0.9 }}
          animate={{ scaleX: 1, opacity: 0 }}
          transition={{ duration: LINE_S, ease: easings.exit }}
        />
      ))}
    </>
  );
}

export type ImpactFrameProps = {
  /** Fires with the struck intensity the instant STRIKE is accepted. */
  onImpact?: (intensity: "tap" | "hit" | "slam") => void;
  className?: string;
};

/**
 * The freeze frame that sells a hit. STRIKE runs one of three intensities —
 * tap, hit, or slam — pausing the scene's looping puck through the
 * imperative `animate()` controls' own pause/play (never a second, competing
 * loop) for a fixed number of milliseconds, then layers a translucent flash,
 * a contained few-pixel jolt of the card's contents, and a radial burst of
 * impact lines around that freeze. The mono readout always names the freeze
 * in milliseconds, and Compare re-runs the same strike with the pause
 * skipped so the two can be felt back to back — the single most useful thing
 * this component offers. Hit-stop and flashes are exactly the kind of effect
 * that can cause discomfort.
 * Reduced motion: the component never freezes, flashes, jolts, or draws
 * lines — the hit is read from a brief static outline emphasis and the mono
 * readout alone, with no reduced-but-still-flashing middle ground.
 */
export function ImpactFrame({
  onImpact,
  className,
}: ImpactFrameProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [compare, setCompare] = React.useState(false);
  const [burst, setBurst] = React.useState<Burst | null>(null);
  const [readout, setReadout] = React.useState<ReadoutEntry | null>(null);
  const [emphasized, setEmphasized] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const puckX = useMotionValue<number>(0);
  const joltX = useMotionValue<number>(0);
  const joltY = useMotionValue<number>(0);

  const loopControlsRef = React.useRef<{
    pause: () => void;
    play: () => void;
    stop: () => void;
  } | null>(null);
  const resumeTimerRef = React.useRef<number | null>(null);
  const emphasisTimerRef = React.useRef<number | null>(null);
  const genRef = React.useRef(0);

  // The scene's own loop: a there-and-back tween whose imperative controls
  // are exactly what hit-stop pauses and resumes — never a second, competing
  // loop. Reduced motion never starts it and parks the puck at a single,
  // deterministic rest frame.
  React.useEffect(() => {
    if (!motionSafe) {
      puckX.set(0);
      return;
    }
    const controls = animate(puckX, [-TRACK_HALF, TRACK_HALF, -TRACK_HALF], {
      duration: LOOP_S,
      times: [0, 0.5, 1],
      ease: easings.move,
      repeat: Infinity,
    });
    loopControlsRef.current = controls;
    return () => {
      controls.stop();
      loopControlsRef.current = null;
      // A pending resume must never fire against a stopped loop, and must
      // never be left to "resume" a scene that no longer runs.
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
  }, [motionSafe, puckX]);

  // The jolt is imperative too, driven off the same burst — a declarative
  // remount here would tear down and refocus the strike buttons below it.
  React.useEffect(() => {
    if (!burst || !motionSafe) return;
    const config = INTENSITIES[burst.intensity];
    const xControls = animate(joltX, [0, config.joltPx, 0], {
      duration: JOLT_S,
      times: [0, 0.4, 1],
      ease: easings.move,
    });
    const yControls = animate(joltY, [0, -config.joltPx * 0.6, 0], {
      duration: JOLT_S,
      times: [0, 0.4, 1],
      ease: easings.move,
    });
    return () => {
      xControls.stop();
      yControls.stop();
    };
  }, [burst, motionSafe, joltX, joltY]);

  // Reduced-motion emphasis timer cleanup on unmount.
  React.useEffect(() => {
    return () => {
      if (emphasisTimerRef.current !== null) {
        window.clearTimeout(emphasisTimerRef.current);
      }
    };
  }, []);

  const strike = (intensity: Intensity) => {
    const config = INTENSITIES[intensity];
    const applyHitStop = motionSafe && !compare;

    genRef.current += 1;
    setBurst({ id: genRef.current, intensity });
    setReadout({ ms: config.freezeMs, applied: applyHitStop });
    setAnnounce(
      applyHitStop
        ? `${intensity} struck. Froze ${config.freezeMs} milliseconds.`
        : `${intensity} struck. No freeze.`,
    );

    if (applyHitStop) {
      loopControlsRef.current?.pause();
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
      }
      resumeTimerRef.current = window.setTimeout(() => {
        resumeTimerRef.current = null;
        loopControlsRef.current?.play();
      }, config.freezeMs);
    }

    if (!motionSafe) {
      if (emphasisTimerRef.current !== null) {
        window.clearTimeout(emphasisTimerRef.current);
      }
      setEmphasized(true);
      emphasisTimerRef.current = window.setTimeout(() => {
        emphasisTimerRef.current = null;
        setEmphasized(false);
      }, EMPHASIS_MS);
    }

    onImpact?.(intensity);
  };

  const activeConfig = burst ? INTENSITIES[burst.intensity] : null;

  return (
    <div
      role="group"
      aria-label="Impact frame"
      className={cn(
        "w-full max-w-sm rounded-4 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <motion.div
        style={{ x: joltX, y: joltY }}
        className="relative flex flex-col gap-4"
      >
        <div
          aria-hidden
          className={cn(
            "relative h-32 overflow-hidden rounded-3 border transition-colors duration-300",
            "bg-surface-0",
            !motionSafe && emphasized ? "border-primary" : "border-hairline",
          )}
        >
          <span
            className="absolute top-1/2 left-1/2 h-px -translate-x-1/2 -translate-y-1/2 bg-hairline-strong"
            style={{ width: TRACK_HALF * 2 + PUCK_SIZE }}
          />
          <motion.span
            className="absolute rounded-full bg-signal"
            style={{
              width: PUCK_SIZE,
              height: PUCK_SIZE,
              left: "50%",
              top: "50%",
              marginLeft: -PUCK_SIZE / 2,
              marginTop: -PUCK_SIZE / 2,
              x: puckX,
            }}
          />

          {burst && motionSafe && activeConfig && (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <ImpactLines
                key={burst.id}
                count={activeConfig.lineCount}
                length={activeConfig.lineLength}
              />
            </span>
          )}

          {burst && motionSafe && activeConfig && (
            <motion.span
              key={`flash-${burst.id}`}
              className="pointer-events-none absolute inset-0"
              style={{ background: FLASH_COLOR }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, activeConfig.flashPeak, 0] }}
              transition={{
                duration: FLASH_S,
                times: [0, 0.35, 1],
                ease: easings.move,
              }}
            />
          )}
        </div>

        <p className="font-mono text-xs text-ink-2 tabular-nums">
          {describeReadout(readout, motionSafe)}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Strike intensity"
            className="flex gap-1.5"
          >
            {INTENSITY_ORDER.map((intensity) => (
              <motion.button
                key={intensity}
                type="button"
                aria-label={`Trigger a ${intensity} impact`}
                onClick={() => strike(intensity)}
                whileTap={motionSafe ? { scale: 0.92 } : undefined}
                transition={springs.flick}
                className={cn(
                  PILL_BASE,
                  burst?.intensity === intensity ? PILL_ACTIVE : PILL_IDLE,
                )}
              >
                {intensity}
              </motion.button>
            ))}
          </div>

          {motionSafe && (
            <motion.button
              type="button"
              aria-pressed={compare}
              aria-label="Run the strike without hit-stop, to compare"
              onClick={() => setCompare((current) => !current)}
              whileTap={{ scale: 0.92 }}
              transition={springs.flick}
              className={cn(PILL_BASE, compare ? PILL_ACTIVE : PILL_IDLE)}
            >
              compare
            </motion.button>
          )}
        </div>
      </motion.div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
