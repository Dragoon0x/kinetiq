"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

type JudgeResult = "perfect" | "good" | "miss";

/** Fixed 16-step groove — never random, always this shape. Steps 0, 3, 5, 8,
 * 11, 13 carry a note; the two halves echo each other. */
const DEFAULT_PATTERN = [
  true,
  false,
  false,
  true,
  false,
  true,
  false,
  false,
  true,
  false,
  false,
  true,
  false,
  true,
  false,
  false,
] as const;

/** Milliseconds per pattern step, unless the `tempo` prop overrides it. */
const DEFAULT_TEMPO = 500;

/** Step clock resolution — the interval that stands in for a performance
 * clock. Every spawn time and every judgement is counted in these ticks,
 * never in Date.now() milliseconds. */
const TICK_MS = 20;

/** Steps a note travels before it is exactly at the zone, and how many more
 * it keeps travelling before it is fully gone (and, if untapped, missed). */
const LEAD_STEPS = 6;
const OVERRUN_STEPS = 2;

/** Lane geometry, in percent of lane width. */
const NOTE_START_PCT = -6;
const HIT_ZONE_PCT = 78;
const NOTE_END_PCT = 112;

/** Judgement windows, in ms either side of dead-on. */
const PERFECT_WINDOW_MS = 90;
const GOOD_WINDOW_MS = 220;

const NOTE_SIZE = 14;
const ZONE_WIDTH = 26;
const ZONE_HEIGHT = 44;

const CHIP_HOLD_MS = 650;
const MISS_FLASH_MS = durations.slow * 1000;
const PULSE_HOLD_MS = durations.fast * 1000;

const NOTE_TINT = "color-mix(in oklab, var(--primary) 82%, var(--card))";
const PERFECT_TINT = "color-mix(in oklab, var(--success) 75%, var(--card))";
const GOOD_TINT = "color-mix(in oklab, var(--primary) 55%, var(--card))";
/** No red token exists in the set — a warm mix stands in for "miss". */
const MISS_TINT =
  "color-mix(in oklab, var(--warning, #b45309) 42%, transparent)";

const TAU = Math.PI * 2;

/** Six flecks, evenly spaced — the PERFECT burst. Fixed vectors, no Math.random. */
const PERFECT_FLECKS = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * TAU;
  return { dx: Math.cos(angle) * 16, dy: Math.sin(angle) * 16 };
});

/** Three flecks — the GOOD burst, offset so it never lines up with PERFECT. */
const GOOD_FLECKS = Array.from({ length: 3 }, (_, i) => {
  const angle = (i / 3) * TAU + Math.PI / 3;
  return { dx: Math.cos(angle) * 13, dy: Math.sin(angle) * 13 };
});

const formatPercent = (value: number): string => `${value}%`;

export type RhythmTapProps = {
  /** Fixed beat pattern, one entry per step. @default a 16-step groove */
  pattern?: boolean[];
  /** Milliseconds per pattern step. @default 500 */
  tempo?: number;
  /** Fires with the outcome of every judged tap or unaddressed note. */
  onJudge?: (result: JudgeResult) => void;
  className?: string;
};

/**
 * A single lane where beat markers arrive on a fixed, authored pattern and
 * you tap them as they cross a bracketed hit zone near the right edge. The
 * whole lane is a real button — Space and Enter work as well as a click —
 * and every note is a declarative left-to-right tween timed off a step
 * clock kept in a ref, never off DOM position, so judging the note nearest
 * the zone stays exact with several in flight at once. Landing a tap inside
 * the tight window flashes the zone bright and throws six flecks for
 * PERFECT, a wider window throws three for GOOD, and a stray tap or a note
 * that crosses the zone untapped flashes the lane a muted warning tint for
 * MISS and resets the combo; combo, best combo, and an accuracy readout sit
 * in the mono header above, and the loop starts paused until Play is
 * pressed or the lane itself is tapped. Reduced motion: notes never
 * travel — the hit zone pulses once per beat instead, taps still judge
 * against that same step clock, and the PERFECT/GOOD flecks are skipped
 * while the chip and the MISS flash still appear.
 */
export function RhythmTap({
  pattern = [...DEFAULT_PATTERN],
  tempo = DEFAULT_TEMPO,
  onJudge,
  className,
}: RhythmTapProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [playing, setPlaying] = React.useState(false);
  const [combo, setCombo] = React.useState(0);
  const [best, setBest] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [hits, setHits] = React.useState(0);
  const [notes, setNotes] = React.useState<number[]>([]);
  const [chip, setChip] = React.useState<{
    kind: JudgeResult;
    text: string;
    gen: number;
  } | null>(null);
  const [hitBurst, setHitBurst] = React.useState<{
    kind: "perfect" | "good";
    gen: number;
  } | null>(null);
  const [pulseOn, setPulseOn] = React.useState(false);
  const [missOn, setMissOn] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  // Ledger refs — the source of truth for every handler and timer callback,
  // so a stale closure scheduled ahead of time can never act on old counts.
  const comboRef = React.useRef(0);
  const bestRef = React.useRef(0);
  const totalRef = React.useRef(0);
  const hitsRef = React.useRef(0);

  // The step clock: a tick counter driven purely by an interval, never by
  // Date.now(). stepAccMsRef carries the remainder so the step boundary
  // stays exact even when tempo is not a multiple of TICK_MS.
  const clockRef = React.useRef(0);
  const stepIndexRef = React.useRef(-1);
  const stepAccMsRef = React.useRef(0);

  const noteIdRef = React.useRef(0);
  const activeNotesRef = React.useRef<Map<number, { spawnTick: number }>>(
    new Map(),
  );
  const noteTimersRef = React.useRef<Map<number, number>>(new Map());

  const chipGenRef = React.useRef(0);
  const chipTimerRef = React.useRef<number | null>(null);
  const hitBurstGenRef = React.useRef(0);
  const pulseTimerRef = React.useRef<number | null>(null);
  const missTimerRef = React.useRef<number | null>(null);

  // Latest-ref mirrors so the interval and note timers, all scheduled ahead
  // of time, never read a stale preference, prop, or tempo.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onJudgeRef = React.useRef(onJudge);
  React.useEffect(() => {
    onJudgeRef.current = onJudge;
  }, [onJudge]);
  const tempoRef = React.useRef(tempo);
  React.useEffect(() => {
    tempoRef.current = tempo;
  }, [tempo]);

  const travelMs = (LEAD_STEPS + OVERRUN_STEPS) * tempo;
  const travelS = travelMs / 1000;
  const leadFrac = LEAD_STEPS / (LEAD_STEPS + OVERRUN_STEPS);
  const leadMs = LEAD_STEPS * tempo;

  const showChip = (kind: JudgeResult) => {
    chipGenRef.current += 1;
    setChip({ kind, text: kind.toUpperCase(), gen: chipGenRef.current });
    if (chipTimerRef.current !== null)
      window.clearTimeout(chipTimerRef.current);
    chipTimerRef.current = window.setTimeout(() => {
      chipTimerRef.current = null;
      setChip(null);
    }, CHIP_HOLD_MS);
  };

  const triggerHitBurst = (kind: "perfect" | "good") => {
    hitBurstGenRef.current += 1;
    setHitBurst({ kind, gen: hitBurstGenRef.current });
  };

  /** Reduced-motion beat pulse: an instant flip on, then a timed flip off —
   * no continuous motion, just a brightness step handled by CSS. */
  const triggerPulse = () => {
    setPulseOn(true);
    if (pulseTimerRef.current !== null)
      window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => {
      pulseTimerRef.current = null;
      setPulseOn(false);
    }, PULSE_HOLD_MS);
  };

  const triggerMissFlash = () => {
    setMissOn(true);
    if (missTimerRef.current !== null)
      window.clearTimeout(missTimerRef.current);
    missTimerRef.current = window.setTimeout(() => {
      missTimerRef.current = null;
      setMissOn(false);
    }, MISS_FLASH_MS);
  };

  /** Books a judgement: updates the ledger, resets or extends the combo,
   * fires the matching flash/chip, and calls back out. */
  const registerJudgement = (kind: JudgeResult) => {
    totalRef.current += 1;
    setTotal(totalRef.current);

    if (kind === "miss") {
      comboRef.current = 0;
      setCombo(0);
      triggerMissFlash();
      setAnnounce("Miss. Combo reset.");
    } else {
      hitsRef.current += 1;
      setHits(hitsRef.current);
      const nextCombo = comboRef.current + 1;
      comboRef.current = nextCombo;
      setCombo(nextCombo);
      if (nextCombo > bestRef.current) {
        bestRef.current = nextCombo;
        setBest(nextCombo);
      }
      if (motionSafeRef.current) triggerHitBurst(kind);
      setAnnounce(
        `${kind === "perfect" ? "Perfect" : "Good"}. Combo ${nextCombo}.`,
      );
    }

    showChip(kind);
    onJudgeRef.current?.(kind);
  };

  /** A note that reaches the end of its travel unjudged: auto-miss. */
  const spawnNote = () => {
    const id = noteIdRef.current;
    noteIdRef.current += 1;
    activeNotesRef.current.set(id, { spawnTick: clockRef.current });
    setNotes((current) => [...current, id]);

    const timer = window.setTimeout(() => {
      noteTimersRef.current.delete(id);
      if (!activeNotesRef.current.has(id)) return;
      activeNotesRef.current.delete(id);
      setNotes((current) => current.filter((n) => n !== id));
      registerJudgement("miss");
    }, travelMs);
    noteTimersRef.current.set(id, timer);
  };

  /** One pattern step: reduced motion pulses the zone, and a marked step
   * spawns a note. */
  const advanceStep = () => {
    const len = pattern.length > 0 ? pattern.length : 1;
    stepIndexRef.current = (stepIndexRef.current + 1) % len;
    const hasNote = pattern[stepIndexRef.current] ?? false;

    if (!motionSafeRef.current) triggerPulse();
    if (hasNote) spawnNote();
  };

  // hitRef-style mirror (see drum-pads) — advanceStep closes over this
  // render's pattern/tempo, and the interval always calls the freshest one.
  const advanceStepRef = React.useRef(advanceStep);
  React.useEffect(() => {
    advanceStepRef.current = advanceStep;
  });

  // The step clock only runs while playing, and stops cleanly on pause.
  React.useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      clockRef.current += 1;
      stepAccMsRef.current += TICK_MS;
      while (stepAccMsRef.current >= tempoRef.current) {
        stepAccMsRef.current -= tempoRef.current;
        advanceStepRef.current();
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [playing]);

  // Full teardown on unmount — every in-flight note timer and every
  // transient-flash timer.
  React.useEffect(() => {
    const noteTimers = noteTimersRef.current;
    return () => {
      for (const timer of noteTimers.values()) window.clearTimeout(timer);
      noteTimers.clear();
      if (chipTimerRef.current !== null)
        window.clearTimeout(chipTimerRef.current);
      if (pulseTimerRef.current !== null)
        window.clearTimeout(pulseTimerRef.current);
      if (missTimerRef.current !== null)
        window.clearTimeout(missTimerRef.current);
    };
  }, []);

  /** Judge the note nearest the zone against the step clock — never DOM
   * position. Nothing in range at all is also a miss. */
  const judgeTap = () => {
    const now = clockRef.current;
    let bestId: number | null = null;
    let bestAbsDelta = Number.POSITIVE_INFINITY;

    for (const [id, note] of activeNotesRef.current) {
      const elapsedMs = (now - note.spawnTick) * TICK_MS;
      const absDelta = Math.abs(elapsedMs - leadMs);
      if (absDelta < bestAbsDelta) {
        bestAbsDelta = absDelta;
        bestId = id;
      }
    }

    if (bestId !== null && bestAbsDelta <= GOOD_WINDOW_MS) {
      activeNotesRef.current.delete(bestId);
      setNotes((current) => current.filter((n) => n !== bestId));
      const timer = noteTimersRef.current.get(bestId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        noteTimersRef.current.delete(bestId);
      }
      registerJudgement(bestAbsDelta <= PERFECT_WINDOW_MS ? "perfect" : "good");
    } else {
      registerJudgement("miss");
    }
  };

  /** Paused, the lane itself starts the loop — "tap to start" is literal.
   * Playing, the same tap judges the nearest note. */
  const handleLaneActivate = () => {
    if (!playing) {
      setPlaying(true);
      return;
    }
    judgeTap();
  };

  const togglePlay = () => {
    if (playing) {
      for (const timer of noteTimersRef.current.values())
        window.clearTimeout(timer);
      noteTimersRef.current.clear();
      activeNotesRef.current.clear();
      setNotes([]);
      setAnnounce("Paused.");
    } else {
      setAnnounce("Playing.");
    }
    setPlaying((prev) => !prev);
  };

  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0;

  return (
    <div className={cn("flex w-full max-w-md flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 font-mono text-xs">
          <StatLine label="combo" value={combo} />
          <StatLine label="best" value={best} />
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10px] tracking-[0.14em] text-ink-3 uppercase">
              acc
            </span>
            <Readout value={accuracy} format={formatPercent} size="sm" />
          </span>
        </div>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause the pattern" : "Play the pattern"}
          className="rounded-2 border border-hairline bg-surface-1 px-3 py-1.5 font-mono text-[11px] font-medium tracking-[0.08em] text-ink-2 uppercase transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {playing ? "Pause" : "Play"}
        </button>
      </div>

      <button
        type="button"
        aria-label="Tap the beat"
        onClick={handleLaneActivate}
        className="relative block h-16 w-full touch-manipulation overflow-hidden rounded-3 border border-hairline-strong bg-surface-0/40 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-300 ease-out"
          style={{ background: MISS_TINT, opacity: missOn ? 1 : 0 }}
        />

        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center justify-between",
            !motionSafe && "transition-[filter] duration-150 ease-out",
            !motionSafe && (pulseOn ? "brightness-150" : "brightness-100"),
          )}
          style={{
            left: `${HIT_ZONE_PCT}%`,
            marginLeft: -ZONE_WIDTH / 2,
            width: ZONE_WIDTH,
            height: ZONE_HEIGHT,
          }}
        >
          <span className="h-full w-2 rounded-l-1 border-y-2 border-l-2 border-hairline-strong" />
          <span className="h-full w-2 rounded-r-1 border-y-2 border-r-2 border-hairline-strong" />
        </span>

        {motionSafe &&
          notes.map((id) => (
            <motion.span
              key={id}
              aria-hidden
              className="absolute top-1/2 block -translate-y-1/2 rounded-full"
              style={{
                width: NOTE_SIZE,
                height: NOTE_SIZE,
                background: NOTE_TINT,
              }}
              initial={{ left: `${NOTE_START_PCT}%` }}
              animate={{
                left: [
                  `${NOTE_START_PCT}%`,
                  `${HIT_ZONE_PCT}%`,
                  `${NOTE_END_PCT}%`,
                ],
              }}
              transition={{
                duration: travelS,
                times: [0, leadFrac, 1],
                ease: easings.linear,
              }}
            />
          ))}

        {motionSafe && hitBurst !== null && (
          <ZoneBurst key={hitBurst.gen} kind={hitBurst.kind} />
        )}

        <span
          aria-hidden
          className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2"
        >
          <AnimatePresence>
            {chip && (
              <motion.span
                key={chip.gen}
                className={cn(
                  "block font-mono text-[10px] font-semibold tracking-[0.14em] uppercase",
                  chip.kind === "perfect" && "text-success",
                  chip.kind === "good" && "text-ink",
                  chip.kind === "miss" && "text-warn",
                )}
                initial={
                  motionSafe
                    ? { opacity: 0, y: 6, scale: 0.85 }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
              >
                {chip.text}
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        {!playing && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-[0.1em] text-ink-3 uppercase">
            tap to start
          </span>
        )}
      </button>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

function StatLine({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.JSX.Element {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] tracking-[0.14em] text-ink-3 uppercase">
        {label}
      </span>
      <span className="text-ink tabular-nums">{value}</span>
    </span>
  );
}

/** PERFECT/GOOD judge burst at the hit zone: a flash disc plus a fixed fleck
 * spray, sized and tinted by outcome. Motion-safe only. */
function ZoneBurst({ kind }: { kind: "perfect" | "good" }): React.JSX.Element {
  const flecks = kind === "perfect" ? PERFECT_FLECKS : GOOD_FLECKS;
  const tint = kind === "perfect" ? PERFECT_TINT : GOOD_TINT;
  const flashScale = kind === "perfect" ? 2.4 : 1.6;
  const flashOpacity = kind === "perfect" ? 0.9 : 0.55;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-1/2 -translate-y-1/2"
      style={{ left: `${HIT_ZONE_PCT}%` }}
    >
      <motion.span
        className="absolute block size-8 rounded-full"
        style={{ marginLeft: -16, marginTop: -16, background: tint }}
        initial={{ scale: 0.4, opacity: flashOpacity }}
        animate={{ scale: flashScale, opacity: 0 }}
        transition={{ duration: durations.slow, ease: easings.exit }}
      />
      {flecks.map((fleck, index) => (
        <motion.span
          key={index}
          className="absolute block size-1 rounded-full"
          style={{ marginLeft: -2, marginTop: -2, background: tint }}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: fleck.dx, y: fleck.dy, opacity: 0 }}
          transition={{ duration: durations.fast, ease: easings.exit }}
        />
      ))}
    </span>
  );
}
