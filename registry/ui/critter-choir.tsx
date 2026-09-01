"use client";

import * as React from "react";

import { Music, Music2, Music3, Music4 } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Body diameter, px — same for all four critters. */
const BODY_SIZE = 56;

/** Idle breathing loop: slow, subtle, and never quite in sync across the row. */
const BREATHE_S = 2.6;
const BREATHE_PEAK = 1.045;

/** A tap counts toward the choir only inside this rolling window, ms. */
const CHORD_WINDOW_MS = 1400;

/** How long a full-motion sing holds the mouth open before it closes, ms. */
const SING_HOLD_MS = 700;

/** Reduced motion holds the static "inflated, mouth open" pose this long. */
const REDUCED_HOLD_MS = durations.slow * 1000;

/** How long the chord beat — glow ring and caption — holds, s / ms. */
const CHORD_HOLD_S = 0.9;
const CHORD_HOLD_MS = CHORD_HOLD_S * 1000;

/** Full-motion note flight: rise + fade, s. */
const FLIGHT_S = 1;

/** Mouth scaleY at rest (a slit) and mid-sing (wide open). */
const MOUTH_REST = 0.35;
const MOUTH_OPEN = 1;

/** The glow ring footprint behind the row, px. */
const GLOW_W = 300;
const GLOW_H = 100;
const GLOW_BACKGROUND =
  "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 32%, transparent), transparent 75%)";

type CritterConfig = {
  readonly label: string;
  readonly color: string;
  readonly Icon: typeof Music;
  /** Recoil peak scale — smaller for higher-pitched (later) critters. */
  readonly peakScale: number;
  /** Note rise distance, px — taller for higher-pitched (later) critters. */
  readonly rise: number;
  /** Fixed chord fan offset, px — negative left, positive right. */
  readonly fanX: number;
  /** Idle breathing phase offset, s. */
  readonly phaseDelay: number;
};

/**
 * Fixed left-to-right pitch ladder: color, glyph, and physics all read as
 * one ascending scale. Never randomized, never reordered.
 */
const CRITTERS = [
  {
    label: "first",
    color: "var(--primary)",
    Icon: Music,
    peakScale: 1.22,
    rise: 50,
    fanX: -33,
    phaseDelay: 0,
  },
  {
    label: "second",
    color: "var(--success, #047857)",
    Icon: Music2,
    peakScale: 1.19,
    rise: 68,
    fanX: -11,
    phaseDelay: 0.45,
  },
  {
    label: "third",
    color: "var(--warning, #b45309)",
    Icon: Music3,
    peakScale: 1.16,
    rise: 86,
    fanX: 11,
    phaseDelay: 0.9,
  },
  {
    label: "fourth",
    color: "var(--ink-2)",
    Icon: Music4,
    peakScale: 1.13,
    rise: 104,
    fanX: 33,
    phaseDelay: 1.35,
  },
] as const satisfies readonly CritterConfig[];

/** One flying note per critter: `gen` remounts it, `chord` picks its path. */
type NoteBurst = { gen: number; chord: boolean };

const IDLE_NOTES: readonly NoteBurst[] = [
  { gen: 0, chord: false },
  { gen: 0, chord: false },
  { gen: 0, chord: false },
  { gen: 0, chord: false },
];

export type CritterChoirProps = {
  /** Fires each time all four critters land inside the rolling window. */
  onChord?: () => void;
  className?: string;
};

/**
 * Four round critters in a fixed pitch ladder — primary, success, warning,
 * then ink-2 — that sing when tapped. A tap snaps its body to a peak scale
 * and springs it back on `recoil`, pops the mouth open, and floats its fixed
 * note glyph upward on a distance set by that critter pitch: taller rise,
 * smaller inflate, the further right you go. Land all four taps inside a
 * rolling 1.4s window (tracked from `event.timeStamp`, never `Date.now()`)
 * and the choir harmonizes — every critter inflates together, their notes
 * fan out on fixed offsets, a soft glow blooms behind the row, and the
 * caption flips to chord. for a beat. At rest the row breathes on a slow
 * loop with a fixed phase delay per critter, so it never quite lines up.
 * Reduced motion: no breathing loop and no floating flight — a tap swaps
 * the critter straight to its inflated, mouth-open pose for about 400ms
 * with its note glyph shown static above it, and a chord shows the glow
 * ring as a plain static state for the same beat.
 */
export function CritterChoir({
  onChord,
  className,
}: CritterChoirProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  // One motion value per critter body — imperative "set peak, spring to
  // rest" recoil, unrolled since the critter count is fixed at four.
  const bodyScale0 = useMotionValue(1);
  const bodyScale1 = useMotionValue(1);
  const bodyScale2 = useMotionValue(1);
  const bodyScale3 = useMotionValue(1);
  const bodyScales = [bodyScale0, bodyScale1, bodyScale2, bodyScale3] as const;

  // Shared state maps, one slot per critter, instead of duplicated hooks.
  const [singing, setSinging] = React.useState<readonly boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const [notes, setNotes] = React.useState<readonly NoteBurst[]>(IDLE_NOTES);
  const [chordActive, setChordActive] = React.useState(false);
  const [chordBurst, setChordBurst] = React.useState(0);

  // Rolling tap ledger — one timestamp slot per critter, read and written
  // only inside handlers, never in render.
  const tapTimesRef = React.useRef<Array<number | null>>([
    null,
    null,
    null,
    null,
  ]);
  const singingTimers = React.useRef<
    Array<number | null>
  >([null, null, null, null]);
  const chordTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    const timers = singingTimers.current;
    return () => {
      if (chordTimer.current !== null) window.clearTimeout(chordTimer.current);
      for (const timer of timers) {
        if (timer !== null) window.clearTimeout(timer);
      }
    };
  }, []);

  /** Restarts (or starts) one critter note flight — solo or chord path. */
  const bumpNote = (index: number, chord: boolean) => {
    setNotes((current) =>
      current.map((note, i) =>
        i === index ? { gen: note.gen + 1, chord } : note,
      ),
    );
  };

  /** Opens the mouth (and, under reduced motion, holds the still pose). */
  const wakeSinging = (index: number) => {
    setSinging((current) => current.map((v, i) => (i === index ? true : v)));
    const timers = singingTimers.current;
    const existing = timers[index] ?? null;
    if (existing !== null) window.clearTimeout(existing);
    const hold = motionSafe ? SING_HOLD_MS : REDUCED_HOLD_MS;
    timers[index] = window.setTimeout(() => {
      setSinging((current) => current.map((v, i) => (i === index ? false : v)));
    }, hold);
  };

  /** One critter, tapped alone: inflate, mouth, a note rising straight up. */
  const playSolo = (index: number) => {
    const critter = CRITTERS[index] ?? CRITTERS[0];
    bumpNote(index, false);
    wakeSinging(index);
    if (motionSafe) {
      const scale = bodyScales[index] ?? bodyScale0;
      scale.set(critter.peakScale);
      animate(scale, 1, springs.recoil);
    }
  };

  /** All four together: synchronized inflate, a fan of notes, the glow. */
  const triggerChord = () => {
    setChordBurst((b) => b + 1);
    setChordActive(true);
    if (chordTimer.current !== null) window.clearTimeout(chordTimer.current);
    chordTimer.current = window.setTimeout(() => {
      setChordActive(false);
    }, CHORD_HOLD_MS);

    for (let index = 0; index < CRITTERS.length; index += 1) {
      const critter = CRITTERS[index] ?? CRITTERS[0];
      bumpNote(index, true);
      wakeSinging(index);
      if (motionSafe) {
        const scale = bodyScales[index] ?? bodyScale0;
        scale.set(critter.peakScale);
        animate(scale, 1, springs.recoil);
      }
    }
    onChord?.();
  };

  /** Registers the tap in the rolling ledger, then fires solo or chord. */
  const handleTap = (index: number, timeStamp: number) => {
    const times = tapTimesRef.current;
    times[index] = timeStamp;
    const known = times.filter((t): t is number => t !== null);
    const isChord =
      known.length === CRITTERS.length &&
      Math.max(...known) - Math.min(...known) < CHORD_WINDOW_MS;

    if (isChord) {
      tapTimesRef.current = [null, null, null, null];
      triggerChord();
    } else {
      playSolo(index);
    }
  };

  const caption = chordActive ? "chord." : "tap them";

  return (
    <div className={cn("inline-flex flex-col items-center gap-4", className)}>
      <div className="relative flex items-center gap-4">
        <AnimatePresence>
          {chordActive && (
            <motion.span
              key={chordBurst}
              aria-hidden
              className="pointer-events-none absolute -z-10 rounded-full"
              style={{
                left: "50%",
                top: "50%",
                marginLeft: -(GLOW_W / 2),
                marginTop: -(GLOW_H / 2),
                width: GLOW_W,
                height: GLOW_H,
                background: GLOW_BACKGROUND,
              }}
              initial={motionSafe ? { scale: 0.7, opacity: 0 } : { opacity: 1 }}
              animate={
                motionSafe
                  ? { scale: [0.7, 1.15, 1.3], opacity: [0, 0.7, 0] }
                  : { opacity: 1 }
              }
              exit={{ opacity: 0 }}
              transition={
                motionSafe
                  ? {
                      duration: CHORD_HOLD_S,
                      times: [0, 0.4, 1],
                      ease: easings.exit,
                    }
                  : { duration: 0 }
              }
            />
          )}
        </AnimatePresence>

        {CRITTERS.map((critter, index) => {
          const isSinging = singing[index] ?? false;
          const note = notes[index] ?? { gen: 0, chord: false };
          const scale = bodyScales[index] ?? bodyScale0;

          return (
            <button
              key={critter.label}
              type="button"
              aria-label={`Sing, ${critter.label} critter`}
              onClick={(event) => handleTap(index, event.timeStamp)}
              className={cn(
                "relative inline-flex touch-manipulation items-center justify-center rounded-full p-1.5 select-none",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
              )}
            >
              {motionSafe && note.gen > 0 && (
                <FloatingNote
                  key={note.gen}
                  critter={critter}
                  chord={note.chord}
                />
              )}
              {!motionSafe && isSinging && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute block text-ink-2"
                  style={{
                    left: "50%",
                    top: -critter.rise,
                    marginLeft: -8,
                  }}
                >
                  <critter.Icon className="size-4" strokeWidth={1.75} />
                </span>
              )}

              <motion.span
                aria-hidden
                className="block"
                animate={
                  motionSafe ? { scale: [1, BREATHE_PEAK, 1] } : { scale: 1 }
                }
                transition={
                  motionSafe
                    ? {
                        duration: BREATHE_S,
                        times: [0, 0.5, 1],
                        repeat: Infinity,
                        ease: easings.move,
                        delay: critter.phaseDelay,
                      }
                    : { duration: 0 }
                }
              >
                <motion.span
                  aria-hidden
                  className="relative block rounded-full border border-hairline-strong shadow-raised"
                  style={{
                    width: BODY_SIZE,
                    height: BODY_SIZE,
                    background: critter.color,
                    scale: motionSafe
                      ? scale
                      : isSinging
                        ? critter.peakScale
                        : 1,
                  }}
                >
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-[6px] text-ink">
                    <span className="flex gap-[10px]">
                      <span className="block size-[6px] rounded-full bg-current" />
                      <span className="block size-[6px] rounded-full bg-current" />
                    </span>
                    <motion.span
                      className="block h-[7px] w-[13px] rounded-full bg-current"
                      initial={false}
                      animate={{ scaleY: isSinging ? MOUTH_OPEN : MOUTH_REST }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  </span>
                </motion.span>
              </motion.span>
            </button>
          );
        })}
      </div>

      <span className="text-label text-ink-3">{caption}</span>

      <span role="status" aria-live="polite" className="sr-only">
        {chordActive ? "chord" : ""}
      </span>
    </div>
  );
}

/**
 * One note in full flight: pops from above the button and rides a
 * fixed four-point arc (transform + opacity tween, `easings.exit`, ~1s) —
 * straight up when solo, fanned out on `critter.fanX` when part of a chord.
 */
function FloatingNote({
  critter,
  chord,
}: {
  critter: CritterConfig;
  chord: boolean;
}) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute block text-ink-2"
      style={{ left: "50%", top: 0, marginLeft: -8, marginTop: -8 }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.55 }}
      animate={{
        x: chord
          ? [0, critter.fanX * 0.35, critter.fanX * 0.75, critter.fanX]
          : [0, 0, 0, 0],
        y: [0, -critter.rise * 0.3, -critter.rise * 0.68, -critter.rise],
        opacity: [0, 1, 0.85, 0],
        scale: [0.55, 1.05, 1, 0.85],
      }}
      transition={{
        duration: FLIGHT_S,
        times: [0, 0.25, 0.7, 1],
        ease: easings.exit,
      }}
    >
      <critter.Icon className="size-4" strokeWidth={1.75} />
    </motion.span>
  );
}
