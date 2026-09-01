"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Orb geometry lives in its own local SVG space — a fixed 160×160 viewBox. */
const ORB_SIZE = 160;
const ORB_CX = 80;
const ORB_CY = 80;
/** Liquid clip radius sits a few px inside the glass casing's own circle. */
const ORB_R = 74;

/** Liquid surface travel: y at empty vs. full, inside the sphere. */
const LEVEL_EMPTY_Y = 146;
const LEVEL_FULL_Y = 14;

/** Regen ticks at this resolution — the clock is a counter, never Date.now(). */
const TICK_MS = 100;
/** How long the wave's amplitude stays boosted after a cast. */
const SLOSH_MS = 700;
/** How long the "not enough" caption (and its flash) hold before clearing. */
const REFUSAL_MS = 950;
/** One cost-chip flight, mount to fade. */
const CHIP_S = 0.9;

/** Insufficient-mana shake: three keyframes, decaying, x-only. */
const ORB_SHAKE_S = 0.34;
const ORB_SHAKE_X = [-8, 7, 0] as const;
const ORB_SHAKE_TIMES = [0, 0.55, 1] as const;

/** Fixed bubble vectors — offset from center, stagger delay, radius, and how
 * far below the live surface each one starts. No randomness: the same cast
 * always throws the same handful of bubbles. */
const BUBBLES = [
  { x: -15, delay: 0, size: 3, rise: 30 },
  { x: 6, delay: 0.14, size: 2.4, rise: 38 },
  { x: -4, delay: 0.28, size: 3.4, rise: 22 },
  { x: 16, delay: 0.07, size: 2.6, rise: 33 },
] as const;
const BUBBLE_S = 0.62;
const BUBBLE_TIMES = [0, 0.72, 1] as const;

/** Shimmer streaks — fixed x offsets and stagger, traveling the full glass. */
const SHIMMER_BANDS = [
  { x: -18, delay: 0 },
  { x: 18, delay: 1.3 },
] as const;
const SHIMMER_S = 2.6;
const SHIMMER_W = 68;
const SHIMMER_H = 44;
const SHIMMER_TIMES = [0, 0.55, 1] as const;

/** Wave sampling: control points span well past the widest chord so the
 * surface never shows a seam at the clip edge, at any fill level. */
const WAVE_LEFT = -14;
const WAVE_SPAN = 188;
const WAVE_POINTS = 6;
const WAVE_FRAMES = 6;
const WAVE_TIMES: readonly number[] = Array.from(
  { length: WAVE_FRAMES + 1 },
  (_, i) => i / WAVE_FRAMES,
);

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Maps mana (0..max) to the liquid surface's y in orb-local SVG space. */
function levelYFor(value: number, max: number): number {
  const pct = max > 0 ? clamp(value / max, 0, 1) : 0;
  return LEVEL_EMPTY_Y - pct * (LEVEL_EMPTY_Y - LEVEL_FULL_Y);
}

/** One wave keyframe: a smooth curve through fixed sample points (quadratic
 * Bezier through midpoints), closed down to `depth` so it fills as a band. */
function waveFrame(offsets: readonly number[], depth: number): string {
  const step = WAVE_SPAN / (offsets.length - 1);
  const points = offsets.map((y, i) => ({ x: WAVE_LEFT + i * step, y }));
  const first = points[0];
  if (!first) return "";
  let d = `M${first.x},${first.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (!p0 || !p1) continue;
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    d += ` Q${p0.x},${p0.y} ${midX},${midY}`;
  }
  const last = points[points.length - 1] ?? first;
  d += ` L${last.x},${last.y} L${last.x},${depth} L${first.x},${depth} Z`;
  return d;
}

/** Builds a seamless-looping table of `d` strings: each frame advances the
 * phase, and each sample point carries its own phase offset so the crest
 * visibly travels rather than the whole surface bobbing in place. */
function buildWaveTable(
  amplitude: number,
  depth: number,
  phaseStep: number,
): readonly string[] {
  const table: string[] = [];
  for (let f = 0; f <= WAVE_FRAMES; f++) {
    const phase = (f / WAVE_FRAMES) * Math.PI * 2;
    const offsets = Array.from(
      { length: WAVE_POINTS },
      (_, i) => Math.sin(phase + i * phaseStep) * amplitude,
    );
    table.push(waveFrame(offsets, depth));
  }
  return table;
}

/** Layer A: shallower, slower. Layer B: shorter period, different phase
 * step — the two never line up, which is what reads as liquid rather than a
 * single sheet bobbing uniformly. Slosh swaps each to a bigger, faster table
 * for one beat after a cast. */
const WAVE_A = buildWaveTable(2.4, 40, 1.15);
const WAVE_A_SLOSH = buildWaveTable(7.5, 40, 1.15);
const WAVE_B = buildWaveTable(3.1, 24, 1.7);
const WAVE_B_SLOSH = buildWaveTable(8.5, 24, 1.7);
const WAVE_PERIOD_A = 4.6;
const WAVE_PERIOD_A_SLOSH = 0.85;
const WAVE_PERIOD_B = 5.9;
const WAVE_PERIOD_B_SLOSH = 1.05;

const ORB_SHEEN =
  "radial-gradient(circle at 30% 24%, oklch(1 0 0 / 0.32) 0%, transparent 46%)";
const ORB_INNER_SHADOW =
  "inset 0 6px 16px oklch(0 0 0 / 0.38), inset 0 -3px 8px oklch(1 0 0 / 0.05)";
const ORB_BASE_TINT = "color-mix(in oklab, var(--ink-2) 8%, var(--card))";
const MANA_FILL = "color-mix(in oklab, var(--primary) 80%, var(--card))";
const WAVE_FILL_A = "color-mix(in oklab, var(--primary) 55%, var(--card))";
const WAVE_FILL_B =
  "color-mix(in oklab, var(--primary-foreground) 30%, var(--primary))";
const BUBBLE_FILL = "var(--primary-foreground)";
const FLASH_TINT = "color-mix(in oklab, var(--ink-2) 60%, transparent)";
const PULSE_TINT =
  "color-mix(in oklab, var(--primary-foreground) 55%, transparent)";

export type ManaOrbProps = {
  /** Mana capacity. @default 100 */
  max?: number;
  /** Starting mana. @default 62 */
  start?: number;
  /** Mana spent per cast. @default 25 */
  cost?: number;
  /** Mana regenerated per second, applied in fixed ticks. @default 3 */
  regenPerSecond?: number;
  /** Fires the moment a cast succeeds, with the mana left afterward. */
  onCast?: (remaining: number) => void;
  className?: string;
};

/**
 * A glass orb of liquid mana whose surface is never flat: two translucent
 * wave bands, each an SVG path whose control points ride their own slow,
 * looping tween, drift at deliberately different periods and opacities so
 * their crests never line up — that desync is what sells liquid instead of a
 * sheet bobbing in place. CAST — a real button — spends `cost`: the level
 * drops on spring `glide`, the wave swaps to a bigger-amplitude table for a
 * brief slosh, a handful of fixed bubbles rise and pop at the surface, and a
 * mono "−cost" chip floats up beside the orb and fades. Too little mana and
 * the orb shakes on a three-keyframe tween with a muted flash instead, and a
 * caption reads "not enough" — the refusal is exactly as legible as a
 * successful cast. Between casts a fixed-rate interval regenerates the orb by
 * `regenPerSecond` per tick — driven purely by a tick counter, never
 * Date.now() or the wall clock — while a faint shimmer climbs inside the
 * glass; at full the orb gives one soft pulse and the shimmer stops, because
 * a full resource should not keep animating. Reduced motion: the surface is
 * flat and still, the level snaps instead of springing, and bubbles,
 * shimmer, slosh, and shake are all skipped — the readout and captions keep
 * working.
 */
export function ManaOrb({
  max = 100,
  start = 62,
  cost = 25,
  regenPerSecond = 3,
  onCast,
  className,
}: ManaOrbProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const maxSafe = Math.max(0, max);
  const costSafe = Math.max(0, cost);
  const clampedStart = clamp(start, 0, maxSafe);

  const [current, setCurrent] = React.useState(clampedStart);
  const [insufficientKey, setInsufficientKey] = React.useState(0);
  const [castKey, setCastKey] = React.useState(0);
  const [sloshing, setSloshing] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");

  // Liquid surface + shake are driven imperatively; static initial values
  // only — useMotionSafe() reports true during SSR, so seeding from it here
  // would desync the first paint.
  const levelY = useMotionValue<number>(levelYFor(clampedStart, maxSafe));
  const shakeX = useMotionValue<number>(0);

  const levelAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shakeAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const noticeTimer = React.useRef<number | null>(null);
  const sloshTimer = React.useRef<number | null>(null);

  const full = current >= maxSafe;

  // A full resource gives one soft pulse — adjusted during render from the
  // previous full state, the React-sanctioned way to react to a derived
  // value crossing a threshold without an effect calling setState.
  const [prevFull, setPrevFull] = React.useState(full);
  const [pulseKey, setPulseKey] = React.useState(0);
  if (full !== prevFull) {
    setPrevFull(full);
    if (full) setPulseKey((k) => k + 1);
  }

  // The regen clock: a fixed-rate interval, only while under max. State
  // changes live in the interval callback, not the effect body.
  React.useEffect(() => {
    if (full || regenPerSecond <= 0) return;
    const perTick = (Math.max(0, regenPerSecond) * TICK_MS) / 1000;
    const id = window.setInterval(() => {
      setCurrent((c) => clamp(c + perTick, 0, maxSafe));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [full, regenPerSecond, maxSafe]);

  // Drive the liquid surface to wherever `current` now points.
  React.useEffect(() => {
    const target = levelYFor(current, maxSafe);
    if (motionSafe) {
      levelAnim.current = animate(levelY, target, springs.glide);
    } else {
      levelY.jump(target);
    }
  }, [current, maxSafe, motionSafe, levelY]);

  React.useEffect(() => {
    return () => {
      levelAnim.current?.stop();
      shakeAnim.current?.stop();
      if (noticeTimer.current !== null)
        window.clearTimeout(noticeTimer.current);
      if (sloshTimer.current !== null) window.clearTimeout(sloshTimer.current);
    };
  }, []);

  const handleCast = () => {
    if (current < costSafe) {
      setInsufficientKey((k) => k + 1);
      setNotice("not enough");
      setAnnounce("Not enough mana.");
      if (noticeTimer.current !== null)
        window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(
        () => setNotice(null),
        REFUSAL_MS,
      );

      if (motionSafe) {
        shakeAnim.current?.stop();
        shakeX.jump(0);
        shakeAnim.current = animate(shakeX, [...ORB_SHAKE_X], {
          duration: ORB_SHAKE_S,
          ease: easings.move,
          times: [...ORB_SHAKE_TIMES],
        });
      }
      return;
    }

    const next = clamp(current - costSafe, 0, maxSafe);
    setCurrent(next);
    onCast?.(next);
    setAnnounce(`Cast. ${Math.round(next)} of ${maxSafe} mana remaining.`);
    setCastKey((k) => k + 1);

    if (motionSafe) {
      setSloshing(true);
      if (sloshTimer.current !== null) window.clearTimeout(sloshTimer.current);
      sloshTimer.current = window.setTimeout(
        () => setSloshing(false),
        SLOSH_MS,
      );
    }
  };

  const surfaceY = levelYFor(current, maxSafe);
  const orbClipId = `${uid}-orb-clip`;
  const liquidClipId = `${uid}-liquid-clip`;

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-4 rounded-3 border border-hairline bg-surface-0 p-6 shadow-raised",
        className,
      )}
    >
      <motion.span
        aria-hidden
        className="relative block"
        style={{ width: ORB_SIZE, height: ORB_SIZE, x: shakeX }}
      >
        {/* Sphere base tint */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: ORB_BASE_TINT }}
        />

        <svg
          viewBox={`0 0 ${ORB_SIZE} ${ORB_SIZE}`}
          className="absolute inset-0 size-full"
        >
          <defs>
            <clipPath id={orbClipId}>
              <circle cx={ORB_CX} cy={ORB_CY} r={ORB_R} />
            </clipPath>
            <clipPath id={liquidClipId}>
              <motion.rect
                x={0}
                width={ORB_SIZE}
                height={ORB_SIZE * 2}
                style={{ y: levelY }}
              />
            </clipPath>
          </defs>

          <g clipPath={`url(#${orbClipId})`}>
            {/* Liquid body */}
            <motion.rect
              x={0}
              width={ORB_SIZE}
              height={ORB_SIZE * 2}
              style={{ y: levelY }}
              fill={MANA_FILL}
            />

            {/* Shimmer — bounded to the live liquid area, faint upward climb
                while regenerating; stops at full. */}
            {motionSafe && !full && (
              <g clipPath={`url(#${liquidClipId})`}>
                {SHIMMER_BANDS.map((band) => (
                  <motion.rect
                    key={band.x}
                    x={ORB_CX + band.x - SHIMMER_W / 2}
                    width={SHIMMER_W}
                    height={SHIMMER_H}
                    fill={BUBBLE_FILL}
                    initial={{ y: 156, opacity: 0 }}
                    animate={{
                      y: [156, 60, -40],
                      opacity: [0, 0.16, 0],
                    }}
                    transition={{
                      duration: SHIMMER_S,
                      ease: easings.linear,
                      times: [...SHIMMER_TIMES],
                      repeat: Infinity,
                      delay: band.delay,
                    }}
                  />
                ))}
              </g>
            )}

            {/* Surface — two desynced wave layers, omitted flat under
                reduced motion. */}
            {motionSafe && (
              <motion.g style={{ y: levelY }}>
                <motion.path
                  fill={WAVE_FILL_A}
                  opacity={0.55}
                  initial={{ d: WAVE_A[0] ?? "" }}
                  animate={{ d: [...(sloshing ? WAVE_A_SLOSH : WAVE_A)] }}
                  transition={{
                    duration: sloshing ? WAVE_PERIOD_A_SLOSH : WAVE_PERIOD_A,
                    ease: easings.linear,
                    times: [...WAVE_TIMES],
                    repeat: Infinity,
                  }}
                />
                <motion.path
                  fill={WAVE_FILL_B}
                  opacity={0.38}
                  initial={{ d: WAVE_B[0] ?? "" }}
                  animate={{ d: [...(sloshing ? WAVE_B_SLOSH : WAVE_B)] }}
                  transition={{
                    duration: sloshing ? WAVE_PERIOD_B_SLOSH : WAVE_PERIOD_B,
                    ease: easings.linear,
                    times: [...WAVE_TIMES],
                    repeat: Infinity,
                  }}
                />
              </motion.g>
            )}

            {/* Bubbles — fixed vectors, rise from the bottom and pop just
                past the live surface. Not clipped to the tight liquid rect,
                so the pop can visibly breach the surface. */}
            {motionSafe && castKey > 0 && (
              <g aria-hidden>
                {BUBBLES.map((b, i) => {
                  const startY = surfaceY + b.rise;
                  const popY = surfaceY - 3;
                  return (
                    <motion.circle
                      key={`${castKey}-${i}`}
                      cx={ORB_CX + b.x}
                      fill={BUBBLE_FILL}
                      initial={{ cy: startY, r: b.size * 0.6, opacity: 0.85 }}
                      animate={{
                        cy: [startY, popY + 2, popY],
                        r: [b.size * 0.65, b.size, b.size * 1.5],
                        opacity: [0.85, 0.8, 0],
                      }}
                      transition={{
                        duration: BUBBLE_S,
                        ease: easings.exit,
                        times: [...BUBBLE_TIMES],
                        delay: b.delay,
                      }}
                    />
                  );
                })}
              </g>
            )}
          </g>
        </svg>

        {/* Glass casing: rim + inner shadow, always on top of the liquid */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full border border-hairline-strong"
          style={{ boxShadow: ORB_INNER_SHADOW }}
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: ORB_SHEEN }}
        />

        {/* Insufficient-mana flash — muted, brief */}
        {motionSafe && insufficientKey > 0 && (
          <motion.span
            key={insufficientKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ background: FLASH_TINT }}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}

        {/* Full pulse — one soft beat, then still */}
        {motionSafe && pulseKey > 0 && (
          <motion.span
            key={pulseKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ background: PULSE_TINT }}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.4, 0], scale: [1, 1.05, 1] }}
            transition={{
              duration: 0.55,
              ease: easings.enter,
              times: [0, 0.4, 1],
            }}
          />
        )}

        {/* Cast cost chip — floats up beside the orb and fades */}
        {motionSafe && castKey > 0 && (
          <motion.span
            key={castKey}
            aria-hidden
            className="pointer-events-none absolute top-3 -right-2 font-mono text-xs font-medium text-primary"
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [0, 1, 0], y: -24 }}
            transition={{ duration: CHIP_S, ease: easings.exit }}
          >
            {`−${costSafe}`}
          </motion.span>
        )}
      </motion.span>

      <button
        type="button"
        aria-label="Cast a spell"
        onClick={handleCast}
        className={cn(
          "rounded-2 bg-primary px-5 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none select-none",
          "hover:brightness-110 active:brightness-95",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        )}
      >
        Cast
      </button>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-baseline gap-2">
          <Readout
            value={current}
            format={(v) => `${Math.round(v)}/${maxSafe}`}
            size="md"
          />
          <span className="font-mono text-[10px] text-ink-3">
            +{regenPerSecond}/s
          </span>
        </div>
        <div className="flex h-4 items-center justify-center">
          <AnimatePresence>
            {notice && (
              <motion.span
                key="notice"
                className="font-mono text-xs text-ink-2"
                initial={motionSafe ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={
                  motionSafe
                    ? { duration: durations.base, ease: easings.enter }
                    : { duration: 0 }
                }
              >
                {notice}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
