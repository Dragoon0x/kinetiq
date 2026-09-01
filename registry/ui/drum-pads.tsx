"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type PadId = "kick" | "snare" | "hat" | "clap";

type PadConfig = {
  readonly id: PadId;
  /** Keyboard shortcut, always uppercase. */
  readonly key: string;
  readonly tint: string;
};

/** Fixed 2x2 roster — order is reading order (top-left to bottom-right). */
const PADS = [
  {
    id: "kick",
    key: "A",
    tint: "color-mix(in oklab, var(--primary) 58%, var(--card))",
  },
  {
    id: "snare",
    key: "S",
    tint: "color-mix(in oklab, var(--success, #047857) 58%, var(--card))",
  },
  {
    id: "hat",
    key: "D",
    tint: "color-mix(in oklab, var(--warning, #b45309) 58%, var(--card))",
  },
  {
    id: "clap",
    key: "F",
    tint: "color-mix(in oklab, var(--ink-2) 58%, var(--card))",
  },
] as const satisfies readonly PadConfig[];

/** Chunky pad footprint, px. */
const PAD_SIZE = 92;

/** Layered inset shadow — a slight bevel on every pad, tokens only. */
const PAD_BEVEL =
  "inset 0 2px 3px color-mix(in oklab, var(--ink) 25%, transparent), " +
  "inset 0 -3px 5px color-mix(in oklab, var(--card) 60%, transparent), " +
  "0 1px 2px color-mix(in oklab, var(--ink) 18%, transparent)";

/** Squash peaks — spring `flick` carries the pad back to rest. */
const SQUASH_X = 1.16;
const SQUASH_Y = 0.78;

/** Label / pad brightness hold, ms. */
const FLASH_MS = durations.fast * 1000;
const FLASH_MS_REDUCED = durations.slow * 1000;

/** A hit only steps the streak up if it lands inside this window of the pad's last hit. */
const STREAK_WINDOW_MS = 700;
const MAX_LEVEL = 3;

/** Streak level (1-3) to a burst size multiplier — no lookup table, just arithmetic. */
const burstScale = (level: number): number => 0.7 + level * 0.35;

/** Kick: a thick ring, slow to bloom and fade. */
const KICK_BURST_S = 0.5;

/** Snare: a scatter of 6 short lines, fixed angles and lengths, never even. */
const SNARE_BURST_S = durations.fast;
const SNARE_LINES = [
  { angle: -72, len: 22 },
  { angle: -28, len: 26 },
  { angle: 12, len: 20 },
  { angle: 58, len: 24 },
  { angle: 118, len: 21 },
  { angle: 162, len: 25 },
] as const;

/** Hat: a fine spray of 8 dots, evenly spaced, quick to vanish. */
const HAT_BURST_S = 0.12;
const HAT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/** Clap: 3 offset ring arcs, staggered in on a fixed delay ladder. */
const CLAP_ARC_S = durations.base;
const CLAP_STAGGER_S = 0.05;
const CLAP_ARCS = [
  { dx: -9, dy: -5 },
  { dx: 8, dy: 3 },
  { dx: -1, dy: 11 },
] as const;

/** One live burst per pad: `gen` remounts it, `level` sizes it. */
type Burst = { gen: number; level: number } | null;

const IDLE_BURSTS: readonly Burst[] = [null, null, null, null];

/** One mark in the pattern strip. */
type Mark = { id: number; padIndex: number };

export type DrumPadsProps = {
  /** Fires with the pad id (`"kick"`, `"snare"`, `"hat"`, `"clap"`) on every hit. */
  onHit?: (pad: string) => void;
  className?: string;
};

/**
 * Four squashy drum pads in a 2x2 grid, each a real button bound to a fixed
 * key — A, S, D, F for kick, snare, hat, clap — so the keyboard plays as
 * naturally as a click. A hit squashes the pad wide then springs it home on
 * `flick`, throws a shape burst matched to that voice — a slow thick ring
 * for the kick, a sharp scatter of lines for the snare, a bright quick spray
 * of dots for the hat, three staggered ring arcs for the clap — and
 * brightens the label for a moment. Hitting the same pad again inside a
 * short window steps the burst up through three sizes, computed straight
 * from `event.timeStamp` and decaying back once the streak goes quiet; the
 * last eight hits scroll across a strip beneath the grid as small colored
 * marks. The pads are a purely visual instrument, mirroring `sound-toggle`
 * (which does not play real audio either) — no Web Audio, no assets.
 * Reduced motion: no squash and no shape burst — a hit flashes the whole pad
 * brightly for a beat instead, and the mark still lands in the pattern strip.
 */
export function DrumPads({
  onHit,
  className,
}: DrumPadsProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement>(null);

  // One squash pair per pad — set-then-animate, unrolled since the pad
  // count is fixed at four.
  const scaleX0 = useMotionValue(1);
  const scaleY0 = useMotionValue(1);
  const scaleX1 = useMotionValue(1);
  const scaleY1 = useMotionValue(1);
  const scaleX2 = useMotionValue(1);
  const scaleY2 = useMotionValue(1);
  const scaleX3 = useMotionValue(1);
  const scaleY3 = useMotionValue(1);
  const scaleXs = [scaleX0, scaleX1, scaleX2, scaleX3] as const;
  const scaleYs = [scaleY0, scaleY1, scaleY2, scaleY3] as const;

  const [bursts, setBursts] = React.useState<readonly Burst[]>(IDLE_BURSTS);
  const [flashing, setFlashing] = React.useState<readonly boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const [marks, setMarks] = React.useState<readonly Mark[]>([]);

  // Per-pad hit ledger — read and written only inside the handler, never in render.
  const streaksRef = React.useRef<Array<{ count: number; time: number }>>([
    { count: 0, time: 0 },
    { count: 0, time: 0 },
    { count: 0, time: 0 },
    { count: 0, time: 0 },
  ]);
  const markIdRef = React.useRef(0);
  const flashTimersRef = React.useRef<Array<number | null>>([
    null,
    null,
    null,
    null,
  ]);

  React.useEffect(() => {
    const timers = flashTimersRef.current;
    return () => {
      for (const timer of timers) {
        if (timer !== null) window.clearTimeout(timer);
      }
    };
  }, []);

  /** Bright for a beat, then back to rest — same beat drives the label (full
   * motion) or the whole pad (reduced motion), just rendered differently. */
  const triggerFlash = (index: number) => {
    setFlashing((current) => current.map((v, i) => (i === index ? true : v)));
    const timers = flashTimersRef.current;
    const existing = timers[index] ?? null;
    if (existing !== null) window.clearTimeout(existing);
    const hold = motionSafe ? FLASH_MS : FLASH_MS_REDUCED;
    timers[index] = window.setTimeout(() => {
      setFlashing((current) =>
        current.map((v, i) => (i === index ? false : v)),
      );
    }, hold);
  };

  /** One hit: squash, burst, flash, and a fresh mark in the pattern strip. */
  const hit = (index: number, timeStamp: number) => {
    const pad = PADS[index] ?? PADS[0];

    const streaks = streaksRef.current;
    const prev = streaks[index] ?? { count: 0, time: 0 };
    const level =
      timeStamp - prev.time < STREAK_WINDOW_MS
        ? Math.min(prev.count + 1, MAX_LEVEL)
        : 1;
    streaks[index] = { count: level, time: timeStamp };

    if (motionSafe) {
      const sx = scaleXs[index] ?? scaleX0;
      const sy = scaleYs[index] ?? scaleY0;
      sx.set(SQUASH_X);
      sy.set(SQUASH_Y);
      animate(sx, 1, springs.flick);
      animate(sy, 1, springs.flick);

      setBursts((current) =>
        current.map((burst, i) =>
          i === index ? { gen: (burst?.gen ?? 0) + 1, level } : burst,
        ),
      );
    }

    triggerFlash(index);

    markIdRef.current += 1;
    setMarks((current) =>
      [...current, { id: markIdRef.current, padIndex: index }].slice(-8),
    );

    onHit?.(pad.id);
  };

  // hitRef always mirrors the latest `hit` closure, so the listener below
  // can stay mounted once instead of tearing down and reattaching every render.
  const hitRef = React.useRef(hit);
  React.useEffect(() => {
    hitRef.current = hit;
  });

  // The keyboard shortcuts: a real listener on this component's own root,
  // so it only ever fires while focus lives inside it — bubbling gives us
  // "focus-within" for free, no separate focus tracking needed.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const letter = event.key.toUpperCase();
      const index = PADS.findIndex((pad) => pad.key === letter);
      if (index === -1) return;
      event.preventDefault();
      hitRef.current(index, event.timeStamp);
    };
    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn("inline-flex flex-col items-center gap-4", className)}
    >
      <div className="rounded-4 border border-hairline bg-surface-0/40 p-3">
        <div className="grid grid-cols-2 gap-3">
          {PADS.map((pad, index) => {
            const burst = bursts[index] ?? null;
            const isFlashing = flashing[index] ?? false;
            return (
              <button
                key={pad.id}
                type="button"
                aria-label={`Hit the ${pad.id} pad`}
                onClick={(event) => hit(index, event.timeStamp)}
                className="relative block touch-manipulation rounded-4 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
                style={{ width: PAD_SIZE, height: PAD_SIZE }}
              >
                <motion.span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-4 border border-hairline-strong",
                    !motionSafe && "transition-[filter] duration-300 ease-out",
                    !motionSafe &&
                      (isFlashing ? "brightness-150" : "brightness-100"),
                  )}
                  style={{
                    background: pad.tint,
                    boxShadow: PAD_BEVEL,
                    scaleX: motionSafe ? (scaleXs[index] ?? scaleX0) : 1,
                    scaleY: motionSafe ? (scaleYs[index] ?? scaleY0) : 1,
                  }}
                >
                  <span
                    className={cn(
                      "text-label transition-colors duration-150 ease-out",
                      isFlashing ? "text-ink" : "text-ink-2",
                    )}
                  >
                    {pad.id}
                  </span>
                  <span className="font-mono text-[10px] text-ink-3">
                    {pad.key}
                  </span>
                </motion.span>

                {motionSafe && burst !== null && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    aria-hidden
                  >
                    <PadBurst
                      key={burst.gen}
                      padId={pad.id}
                      tint={pad.tint}
                      level={burst.level}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <PatternStrip marks={marks} motionSafe={motionSafe} />
    </div>
  );
}

/** Picks the fixed shape burst for a pad's voice. */
function PadBurst({
  padId,
  tint,
  level,
}: {
  padId: PadId;
  tint: string;
  level: number;
}): React.JSX.Element {
  switch (padId) {
    case "kick":
      return <KickBurst tint={tint} level={level} />;
    case "snare":
      return <SnareBurst tint={tint} level={level} />;
    case "hat":
      return <HatBurst tint={tint} level={level} />;
    case "clap":
      return <ClapBurst tint={tint} level={level} />;
  }
}

/** Kick: one thick ring, blooming outward and fading — low and slow. */
function KickBurst({
  tint,
  level,
}: {
  tint: string;
  level: number;
}): React.JSX.Element {
  const grow = burstScale(level) * 2.6;
  return (
    <motion.svg
      aria-hidden
      viewBox="-30 -30 60 60"
      width={60}
      height={60}
      className="absolute"
      style={{ left: "50%", top: "50%", marginLeft: -30, marginTop: -30 }}
      initial={{ scale: 0.35, opacity: 0.85 }}
      animate={{ scale: grow, opacity: 0 }}
      transition={{ duration: KICK_BURST_S, ease: easings.exit }}
    >
      <circle cx={0} cy={0} r={16} fill="none" stroke={tint} strokeWidth={7} />
    </motion.svg>
  );
}

/** Snare: 6 short lines snapping outward on fixed, uneven angles — sharp. */
function SnareBurst({
  tint,
  level,
}: {
  tint: string;
  level: number;
}): React.JSX.Element {
  const reach = burstScale(level);
  return (
    <>
      {SNARE_LINES.map((line) => {
        const rad = (line.angle * Math.PI) / 180;
        const dist = line.len * reach;
        const x = Math.cos(rad) * dist;
        const y = Math.sin(rad) * dist;
        return (
          <motion.span
            key={line.angle}
            className="absolute block rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: 3,
              height: 13,
              marginLeft: -1.5,
              marginTop: -6.5,
              background: tint,
              rotate: line.angle + 90,
            }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x, y, opacity: 0 }}
            transition={{ duration: SNARE_BURST_S, ease: easings.exit }}
          />
        );
      })}
    </>
  );
}

/** Hat: 8 small dots spraying out evenly — bright and quick. */
function HatBurst({
  tint,
  level,
}: {
  tint: string;
  level: number;
}): React.JSX.Element {
  const radius = 16 + level * 8;
  return (
    <>
      {HAT_ANGLES.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * radius;
        const y = Math.sin(rad) * radius;
        return (
          <motion.span
            key={angle}
            className="absolute block size-1.5 rounded-full"
            style={{
              left: "50%",
              top: "50%",
              marginLeft: -3,
              marginTop: -3,
              background: tint,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
            animate={{ x, y, opacity: 0, scale: 1 }}
            transition={{ duration: HAT_BURST_S, ease: easings.exit }}
          />
        );
      })}
    </>
  );
}

/** Clap: 3 offset ring arcs, staggered on a fixed delay ladder. */
function ClapBurst({
  tint,
  level,
}: {
  tint: string;
  level: number;
}): React.JSX.Element {
  const grow = burstScale(level) * 1.8;
  return (
    <>
      {CLAP_ARCS.map((arc, index) => (
        <motion.svg
          key={`${arc.dx}-${arc.dy}`}
          aria-hidden
          viewBox="-16 -16 32 32"
          width={32}
          height={32}
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            marginLeft: -16 + arc.dx,
            marginTop: -16 + arc.dy,
          }}
          initial={{ scale: 0.4, opacity: 0.9 }}
          animate={{ scale: grow, opacity: 0 }}
          transition={{
            duration: CLAP_ARC_S,
            delay: index * CLAP_STAGGER_S,
            ease: easings.exit,
          }}
        >
          <path
            d="M -12 4 A 12 12 0 0 1 12 4"
            fill="none"
            stroke={tint}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </motion.svg>
      ))}
    </>
  );
}

/**
 * The last 8 hits, oldest at the left, newest at the right — a fixed-length
 * window that reads as a belt scrolling right to left as marks are capped.
 */
function PatternStrip({
  marks,
  motionSafe,
}: {
  marks: readonly Mark[];
  motionSafe: boolean;
}): React.JSX.Element {
  return (
    <div
      aria-hidden
      className="flex h-4 min-w-32 items-center gap-1.5 rounded-2 border border-hairline bg-surface-0/40 px-2.5"
    >
      <AnimatePresence initial={false}>
        {marks.map((mark) => {
          const pad = PADS[mark.padIndex] ?? PADS[0];
          return (
            <motion.span
              key={mark.id}
              className="block size-2 shrink-0 rounded-full"
              style={{ background: pad.tint }}
              initial={motionSafe ? { scale: 0, opacity: 0 } : { opacity: 1 }}
              animate={{
                scale: 1,
                opacity: 1,
                transition: motionSafe ? springs.snap : { duration: 0 },
              }}
              exit={{
                opacity: 0,
                transition: motionSafe
                  ? { duration: durations.fast, ease: easings.exit }
                  : { duration: 0 },
              }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
