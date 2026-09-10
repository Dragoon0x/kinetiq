"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AudioDelivery = "sent" | "delivered" | "read";

export type AudioClip = {
  id: string;
  /** Own clips sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  /** Named in the transport's label and in every sentence. */
  title: string;
  /** Length of the recording, in seconds. */
  seconds: number;
  /** Any integer; the waveform is drawn from it, so a clip keeps its shape. */
  seed: number;
  /** Printed under the bubble, already formatted. */
  time?: string;
  /** Read for own clips only. @default "sent" */
  delivery?: AudioDelivery;
};

export type AudioWaveProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  clips: AudioClip[];
  /** The clip the host is playing, or null. Playback lives in the host. */
  playingId?: string | null;
  /** Seconds played per clip id; a clip with no entry sits at zero. */
  positions?: Record<string, number>;
  /** Fires from a transport press; the host decides what plays. */
  onPlayRequest?: (id: string, playing: boolean) => void;
  /** Fires from a scrub, a tap on the wave, or an arrow key. */
  onSeek?: (id: string, seconds: number) => void;
  /** Controlled playback rate; one of `speeds`. */
  speed?: number;
  /** Initial rate for uncontrolled usage. @default 1 */
  defaultSpeed?: number;
  /** Fires as the label rolls to the next rate. */
  onSpeedChange?: (speed: number) => void;
  /** The rates the control cycles. @default [1, 1.5, 2] */
  speeds?: number[];
  /** Bars drawn per waveform. @default 36 */
  bars?: number;
  /** How long the head takes to reach a new position; match the host's tick. @default 100 */
  followMs?: number;
  /** Names the other side in sentences. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

const SPEEDS = [1, 1.5, 2];
const NO_POSITIONS: Record<string, number> = {};

/** Pointer travel before capture: capturing on pointerdown swallows plain taps. */
const CAPTURE_PX = 4;
/** Bars sit at this share of their level until the head has passed them. */
const RESTING = 0.45;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A 32-bit integer hash: deterministic, and free of trigonometry, so the drawn
 * waveform is identical on the server and in the browser to the last digit.
 */
const hash = (a: number, b: number): number => {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  x = x ^ (x >>> 13);
  x = Math.imul(x, 1274126177) | 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Two offset draws per bar give the profile a run of peaks rather than noise. */
const levelsFor = (seed: number, count: number): number[] =>
  Array.from({ length: count }, (_, index) => {
    const body = hash(seed, index);
    const swell = hash(seed + 17, Math.floor(index / 4));
    return Math.round((0.22 + 0.5 * body + 0.28 * swell) * 100) / 100;
  });

const round3 = (value: number): number => Number(value.toFixed(3));

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const mmss = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const spoken = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const tail = `${rest} ${rest === 1 ? "second" : "seconds"}`;
  if (minutes === 0) return tail;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ${tail}`;
};

const rate = (speed: number): string =>
  `${Number.isInteger(speed) ? speed : speed.toFixed(1)}×`;

const rateWords = (speed: number): string =>
  `${Number.isInteger(speed) ? speed : speed.toFixed(1)} times`;

const deliverySentence = (delivery: AudioDelivery, peerName: string) =>
  ({
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
  })[delivery];

const PLAY = "M5.5 3.5 12 8l-6.5 4.5z";
const PAUSE = "M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z";
const CHECK = "M2 8.5 5 11.5 10.5 5.5";
const CHECK_TRAIL = "M6.5 11.5 12 5.5";

/**
 * One gesture for the wave's scrub. The capture is taken only after four pixels
 * of travel — capturing on pointerdown eats plain taps — and inside try/catch,
 * because a synthetic sweep carries no capturable pointer.
 */
function useCapture() {
  const grab = React.useRef<{ x: number; y: number } | null>(null);
  const held = React.useRef(false);

  return {
    down(event: React.PointerEvent<Element>) {
      grab.current = { x: event.clientX, y: event.clientY };
      held.current = false;
    },
    move(event: React.PointerEvent<Element>): boolean {
      const start = grab.current;
      if (!start) return false;
      if (held.current) return true;
      if (
        Math.hypot(event.clientX - start.x, event.clientY - start.y) <
        CAPTURE_PX
      )
        return false;
      held.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic pointer has none; the scrub still follows it.
      }
      return true;
    },
    up(event: React.PointerEvent<Element>) {
      if (held.current) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Already released with the pointer, or never taken.
        }
      }
      grab.current = null;
      held.current = false;
    },
  };
}

type SpeedRollProps = {
  speeds: number[];
  index: number;
  motionSafe: boolean;
  onPress: () => void;
};

/**
 * The rate rolls rather than swaps: one column of faces translating by its own
 * share of its height on `snap`, the indicator spring — one crisp overshoot, the
 * same physics as any other control changing position.
 */
function SpeedRoll({ speeds, index, motionSafe, onPress }: SpeedRollProps) {
  const current = speeds[index] ?? 1;
  return (
    <button
      type="button"
      aria-label={`Playback speed, ${rateWords(current)}`}
      onClick={onPress}
      className={cn(
        "flex h-8 w-11 shrink-0 items-center justify-center rounded-full bg-current/15 transition-colors hover:bg-current/25",
        focusRing,
      )}
    >
      <span
        aria-hidden
        className="relative block h-4 w-full overflow-hidden text-center"
      >
        <motion.span
          className="absolute inset-x-0 top-0 flex flex-col"
          initial={false}
          animate={{
            y: `${round3((-index * 100) / Math.max(1, speeds.length))}%`,
          }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          {speeds.map((value) => (
            <span
              key={value}
              className="flex h-4 items-center justify-center font-mono text-[11px] leading-none tabular-nums"
            >
              {rate(value)}
            </span>
          ))}
        </motion.span>
      </span>
    </button>
  );
}

type ClipRowProps = {
  clip: AudioClip;
  playing: boolean;
  position: number;
  bars: number;
  followMs: number;
  speeds: number[];
  speedIndex: number;
  motionSafe: boolean;
  peerName: string;
  onPlayPress: (clip: AudioClip, playing: boolean) => void;
  onSeek: (clip: AudioClip, seconds: number) => void;
  onSpeedPress: () => void;
};

/** One audio bubble: transport, waveform slider, and the rate control. */
function ClipRow({
  clip,
  playing,
  position,
  bars,
  followMs,
  speeds,
  speedIndex,
  motionSafe,
  peerName,
  onPlayPress,
  onSeek,
  onSpeedPress,
}: ClipRowProps) {
  const waveRef = React.useRef<HTMLDivElement | null>(null);
  const capture = useCapture();
  const levels = React.useMemo(
    () => levelsFor(clip.seed, bars),
    [clip.seed, bars],
  );

  const total = Math.max(1, Math.round(clip.seconds));
  const at = clamp(position, 0, total);
  const share = at / total;
  const passed = Math.round(share * bars);
  const own = clip.from === "me";
  const delivery = clip.delivery ?? "sent";

  const seekTo = (clientX: number) => {
    const node = waveRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0) return;
    onSeek(clip, clamp((clientX - rect.left) / rect.width, 0, 1) * total);
  };

  const nudge = (delta: number) => onSeek(clip, clamp(at + delta, 0, total));

  return (
    <motion.li
      initial={motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={
        motionSafe
          ? { ...springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
      className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}
    >
      <div
        role="group"
        aria-label={`${own ? "Your audio" : `Audio from ${peerName}`}, ${clip.title}, ${spoken(total)}`}
        className={cn(
          "flex w-full max-w-[88%] flex-col gap-2 rounded-3 px-2.5 py-2.5",
          own
            ? "rounded-br-1 bg-primary text-primary-foreground"
            : "rounded-bl-1 bg-surface-2 text-foreground",
        )}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={playing ? `Pause ${clip.title}` : `Play ${clip.title}`}
            onClick={() => onPlayPress(clip, !playing)}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full bg-current/15 transition-colors hover:bg-current/25",
              focusRing,
            )}
          >
            <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
              <path d={playing ? PAUSE : PLAY} fill="currentColor" />
            </svg>
          </button>

          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12px] leading-4 font-medium">
              {clip.title}
            </span>
            <span
              aria-hidden
              className="font-mono text-[10px] leading-4 tabular-nums opacity-70"
            >
              {mmss(at)} / {mmss(total)}
            </span>
          </span>

          <SpeedRoll
            speeds={speeds}
            index={speedIndex}
            motionSafe={motionSafe}
            onPress={onSpeedPress}
          />
        </div>

        {/* The wave is the slider. Each bar wakes as the head passes it — full
            level and full colour on `flick` — so the fill arrives bar by bar
            like the sound going by, rather than a wipe sliding over a picture. */}
        <div
          ref={waveRef}
          role="slider"
          tabIndex={0}
          aria-label={`Position in ${clip.title}`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.round(at)}
          aria-valuetext={`${mmss(at)} of ${mmss(total)}`}
          onKeyDown={(event) => {
            const key = event.key;
            if (key === "ArrowRight") nudge(5);
            else if (key === "ArrowLeft") nudge(-5);
            else if (key === "ArrowUp") nudge(1);
            else if (key === "ArrowDown") nudge(-1);
            else if (key === "Home") onSeek(clip, 0);
            else if (key === "End") onSeek(clip, total);
            else return;
            event.preventDefault();
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            capture.down(event);
            seekTo(event.clientX);
          }}
          onPointerMove={(event) => {
            if (capture.move(event)) seekTo(event.clientX);
          }}
          onPointerUp={(event) => capture.up(event)}
          onPointerCancel={(event) => capture.up(event)}
          className={cn(
            "relative flex h-8 w-full cursor-pointer touch-none items-center gap-[2px] rounded-1 select-none",
            focusRing,
          )}
        >
          {levels.map((level, index) => {
            const woken = index < passed;
            return (
              <motion.span
                key={index}
                aria-hidden
                className={cn(
                  "min-w-[2px] flex-1 origin-center rounded-full transition-colors",
                  woken ? "bg-current" : "bg-current/35",
                )}
                style={{ height: `${round3(level * 100)}%` }}
                initial={false}
                animate={{ scaleY: woken ? 1 : RESTING }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            );
          })}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 -ml-px w-[2px] rounded-full bg-current"
            initial={false}
            animate={{ left: `${round3(share * 100)}%` }}
            transition={
              motionSafe
                ? { duration: followMs / 1000, ease: easings.linear }
                : { duration: 0 }
            }
          />
        </div>
      </div>

      <span className="flex items-center gap-1.5 px-1">
        {clip.time ? (
          <span className="text-[11px] text-ink-3 tabular-nums">
            {clip.time}
          </span>
        ) : null}
        {own ? (
          <span
            role="img"
            aria-label={deliverySentence(delivery, peerName)}
            className={cn(
              "inline-flex size-3.5 items-center justify-center",
              delivery === "read" ? "text-cobalt-bright" : "text-ink-3",
            )}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <path d={CHECK} />
              {delivery === "sent" ? null : <path d={CHECK_TRAIL} />}
            </svg>
          </span>
        ) : null}
      </span>
    </motion.li>
  );
}

/**
 * An audio attachment in a thread — a shared recording with a title and a
 * length, not a held voice note. The waveform is seeded, so a clip always draws
 * the same shape, and playback lives in the host: `playingId` and `positions`
 * come in as props, which is what keeps the component from reading a clock
 * while it renders. As the position crosses a bar that bar wakes — full level,
 * full colour, on `flick`, the fastest spring in the set — so the fill arrives
 * bar by bar like the sound passing rather than a wipe sliding across it, while
 * the head follows on a linear tween matched to the host's tick, because a
 * playhead that springs overshoots the present. The rate control rolls: a column
 * of faces travelling one face on `snap`, one crisp overshoot per press.
 *
 * The transport is a real button, the wave is a `role="slider"` reading mm:ss of
 * mm:ss — Left and Right step five seconds, Up and Down one, Home and End jump —
 * and a scrub captures the pointer only after 4px of travel, so a tap still
 * seeks where it landed. Under reduced motion the bars still fill and the head
 * still moves, because position is information: the wake becomes an instant
 * swap and the rate label changes without rolling.
 */
export function AudioWave({
  ref,
  clips,
  playingId = null,
  positions = NO_POSITIONS,
  onPlayRequest,
  onSeek,
  speed,
  defaultSpeed = 1,
  onSpeedChange,
  speeds = SPEEDS,
  bars = 36,
  followMs = 100,
  peerName = "Them",
  label,
  className,
}: AudioWaveProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState(defaultSpeed);
  const [say, setSay] = React.useState("");

  const current = speed ?? uncontrolled;
  const index = Math.max(
    0,
    speeds.findIndex((value) => value === current),
  );

  const cycleSpeed = () => {
    const next = speeds[(index + 1) % Math.max(1, speeds.length)] ?? 1;
    if (speed === undefined) setUncontrolled(next);
    onSpeedChange?.(next);
    setSay(`Speed ${rateWords(next)}`);
  };

  const playPress = (clip: AudioClip, next: boolean) => {
    onPlayRequest?.(clip.id, next);
    // The sentence is frozen here, at the press, rather than read back from a
    // prop the host may take a tick to change.
    setSay(next ? `Playing ${clip.title} at ${rateWords(current)}` : "Paused");
  };

  const seek = (clip: AudioClip, seconds: number) => {
    const total = Math.max(1, Math.round(clip.seconds));
    onSeek?.(clip.id, Math.round(clamp(seconds, 0, total)));
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-3">
        {clips.map((clip) => (
          <ClipRow
            key={clip.id}
            clip={clip}
            playing={playingId === clip.id}
            position={positions[clip.id] ?? 0}
            bars={bars}
            followMs={followMs}
            speeds={speeds}
            speedIndex={index}
            motionSafe={motionSafe}
            peerName={peerName}
            onPlayPress={playPress}
            onSeek={seek}
            onSpeedPress={cycleSpeed}
          />
        ))}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {say}
      </span>
    </div>
  );
}
