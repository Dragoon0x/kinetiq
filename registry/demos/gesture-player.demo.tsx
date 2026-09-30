"use client";

import * as React from "react";

import { motion, useTransform, type MotionValue } from "motion/react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GesturePlayer } from "@/registry/ui/gesture-player";

export const tweaks = defineTweaks({
  sensitivity: {
    kind: "range",
    label: "Sensitivity",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  zones: { kind: "toggle", label: "Zones", default: true },
  skip: {
    kind: "range",
    label: "Skip",
    default: 10,
    min: 5,
    max: 15,
    step: 5,
    unit: "s",
  },
  hints: { kind: "toggle", label: "Hints", default: true },
});

const LENGTH = 220;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** How far `t` is through the stretch of the clip from `a` to `b` (shares), 0–1. */
const phase = (t: number, a: number, b: number) =>
  clamp01((t / LENGTH - a) / (b - a));
const pct = (v: number) => Math.round(clamp01(v) * 100);

// Day, dusk and night, drawn from the theme's own colours in oklab.
const DAY_TOP = "color-mix(in oklab, var(--accent) 50%, white)";
const NIGHT_TOP = "color-mix(in oklab, var(--accent) 22%, black)";
const DAY_LOW = "color-mix(in oklab, var(--warn) 45%, white)";
const DUSK_LOW = "color-mix(in oklab, var(--danger) 55%, var(--warn))";
const NIGHT_LOW = "color-mix(in oklab, var(--accent) 40%, black)";
const HILL = "color-mix(in oklab, var(--success) 30%, black)";
const WATER = "color-mix(in oklab, var(--accent) 60%, black)";
const LAMP = "color-mix(in oklab, var(--warn) 85%, white)";

const STARS = [
  [14, 8],
  [30, 16],
  [52, 6],
  [70, 14],
  [96, 9],
  [118, 18],
  [134, 7],
  [150, 15],
] as const;
const WINDOWS = [
  [20, 54],
  [26, 56],
  [44, 52],
  [58, 55],
  [104, 53],
  [112, 56],
] as const;

/**
 * Coldbrook harbour from sundown to night, drawn from the playback time: the
 * sky darkens, the sun sets into the water, a ferry crosses twice, windows
 * and the lighthouse come on and the stars come out.
 */
function HarbourClip({ time }: { time: MotionValue<number> }) {
  const sky = useTransform(time, (t) => {
    const night = pct(phase(t, 0.2, 0.9));
    const dusk = pct(phase(t, 0.1, 0.5));
    const late = pct(phase(t, 0.55, 0.95));
    return `linear-gradient(to bottom, color-mix(in oklab, ${DAY_TOP}, ${NIGHT_TOP} ${night}%), color-mix(in oklab, color-mix(in oklab, ${DAY_LOW}, ${DUSK_LOW} ${dusk}%), ${NIGHT_LOW} ${late}%) 68%)`;
  });
  const sunY = useTransform(time, (t) => r2(24 + phase(t, 0, 0.62) * 48));
  const sunFill = useTransform(
    time,
    (t) =>
      `color-mix(in oklab, ${LAMP}, var(--danger) ${pct(phase(t, 0.2, 0.6))}%)`,
  );
  const glint = useTransform(time, (t) => r2(0.7 * (1 - phase(t, 0.35, 0.62))));
  const dark = useTransform(time, (t) => r2(0.55 * phase(t, 0.4, 0.95)));
  const lights = useTransform(time, (t) => r2(phase(t, 0.5, 0.65)));
  const stars = useTransform(time, (t) => r2(phase(t, 0.68, 0.92)));
  // Two crossings, left to right, in user units.
  const ferryX = useTransform(time, (t) =>
    r2(-30 + ((t % (LENGTH / 2)) / (LENGTH / 2)) * 200),
  );
  const beam = useTransform(time, (t) => r2(0.5 * phase(t, 0.55, 0.7)));
  const sweep = useTransform(time, (t) =>
    Number((Math.sin(t * 0.9) * 18).toFixed(3)),
  );

  return (
    <motion.div className="absolute inset-0" style={{ background: sky }}>
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <motion.g style={{ opacity: stars }}>
          {STARS.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={0.6} fill="white" />
          ))}
        </motion.g>
        <motion.circle cx={58} cy={sunY} r={7} style={{ fill: sunFill }} />
        <path
          d="M0 58 Q14 48 30 54 T62 50 T96 56 T128 49 T160 55 V64 H0Z"
          fill={HILL}
        />
        <motion.g style={{ opacity: lights }}>
          {WINDOWS.map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1.4}
              height={1.6}
              fill={LAMP}
            />
          ))}
        </motion.g>
        <rect x={0} y={62} width={160} height={28} fill={WATER} />
        <motion.ellipse
          cx={58}
          cy={66}
          rx={10}
          ry={1.3}
          fill={LAMP}
          style={{ opacity: glint }}
        />
        <rect x={138} y={42} width={4} height={14} fill="white" />
        <rect x={137.4} y={46} width={5.2} height={2.4} fill="var(--danger)" />
        <motion.g
          style={{ opacity: beam, rotate: sweep, originX: 1, originY: 0.5 }}
        >
          <path d="M140 40 L96 33 L96 47Z" fill={LAMP} />
        </motion.g>
        <circle cx={140} cy={40} r={1.8} fill={LAMP} />
        <motion.g style={{ x: ferryX }}>
          <path d="M0 70 H24 L21 75 H3Z" fill="white" />
          <rect x={6} y={65} width={11} height={5} fill="white" />
          <motion.g style={{ opacity: lights }}>
            <rect x={7.5} y={66.5} width={2} height={1.6} fill={LAMP} />
            <rect x={11} y={66.5} width={2} height={1.6} fill={LAMP} />
            <rect x={14.5} y={66.5} width={1.4} height={1.6} fill={LAMP} />
          </motion.g>
        </motion.g>
        <motion.rect
          x={0}
          y={0}
          width={160}
          height={90}
          fill="black"
          style={{ opacity: dark }}
        />
      </svg>
    </motion.div>
  );
}

const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * Basinworks field clips: a dusk timelapse of Coldbrook harbour. Swipe the
 * picture sideways to scrub through the evening, up and down on either half
 * for brightness and volume, and double-tap a side to skip.
 */
export function GesturePlayerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [at, setAt] = React.useState(42);
  const [playing, setPlaying] = React.useState(false);
  const [volume, setVolume] = React.useState(0.7);
  const [brightness, setBrightness] = React.useState(0.6);

  return (
    <div className="flex w-full max-w-96 flex-col gap-3">
      <GesturePlayer
        label="Coldbrook harbour, dusk timelapse"
        duration={LENGTH}
        value={at}
        onValueChange={setAt}
        playing={playing}
        onPlayingChange={setPlaying}
        volume={volume}
        onVolumeChange={setVolume}
        brightness={brightness}
        onBrightnessChange={setBrightness}
        sound={sound}
        {...values}
      >
        {(time) => <HarbourClip time={time} />}
      </GesturePlayer>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{playing ? "playing" : "paused"}</span>
          {` · ${fmt(at)} / ${fmt(LENGTH)} · vol ${Math.round(volume * 100)}%`}
          {values.zones === false
            ? ""
            : ` · bright ${Math.round(brightness * 100)}%`}
        </p>
      ) : null}
    </div>
  );
}
