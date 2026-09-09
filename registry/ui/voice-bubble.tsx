"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type VoiceNote = {
  id: string;
  /** Own notes sit on the right. */
  from: "me" | "peer";
  /** Whole seconds. */
  seconds: number;
  /** Bar levels 0..1, any count; 32 reads best. */
  wave: number[];
  /** Printed under the bubble, already formatted. */
  time?: string;
};

export type VoiceBubbleProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. Append the new note here from `onSend`. */
  notes: VoiceNote[];
  /** Fires from a release or a Space/Enter stop that held past the first tick. */
  onSend?: (note: { seconds: number; wave: number[] }) => void;
  /** Fires from Escape during a take, or a release that was only a tap. */
  onCancel?: () => void;
  /** Fires with 0 as a take opens, on each whole second, and null when it ends. */
  onRecording?: (seconds: number | null) => void;
  /** Fires with the note that started playing, or null when playback stops. */
  onPlayChange?: (id: string | null) => void;
  /** The take stops itself here. @default 30 */
  maxSeconds?: number;
  /** Names the other side in sentences. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

const LIVE_BARS = 24;
const NOTE_BARS = 32;
const TICK_MS = 100;
/** Pointer travel before a gesture captures the pointer, so a click still lands. */
const CAPTURE_PX = 4;
const HINT_MS = 1400;

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** A note with no profile still draws a wave rather than an empty box. */
const FLAT: number[] = Array.from({ length: NOTE_BARS }, () => 0.3);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Whole seconds, so nothing raw reaches an aria value or a clock. */
const wholeSeconds = (seconds: number) => Math.max(1, Math.round(seconds));

/**
 * The live level is computed, not sampled: two out-of-phase waves per bar,
 * rounded before they reach a motion value so the server and client agree —
 * Math.sin differs in its last digits between Node and the browser.
 */
const liveLevel = (index: number, tick: number) => {
  const a = Math.sin(index * 1.3 + tick * 0.6);
  const b = Math.cos(index * 0.7 - tick * 0.45);
  return Number((0.18 + 0.82 * Math.abs(a * 0.55 + b * 0.45)).toFixed(3));
};

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Averages a tick-long profile into `count` bars, two decimals each. */
const resample = (profile: number[], count: number) => {
  if (profile.length === 0) return FLAT.slice(0, count);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * profile.length) / count);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) * profile.length) / count),
    );
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += profile[i] ?? 0;
    return Math.round((sum / (end - start)) * 100) / 100;
  });
};

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/**
 * One gesture, used by the mic's hold and the wave's scrub. The capture is
 * taken only after four pixels of travel — capturing on pointerdown swallows
 * plain clicks — and inside try/catch, because the synthetic sweeps the test
 * suite drags through every specimen carry no capturable pointer.
 */
function useCapture() {
  const grab = React.useRef<{ x: number; y: number } | null>(null);
  const held = React.useRef(false);

  return {
    down(event: React.PointerEvent<Element>) {
      grab.current = { x: event.clientX, y: event.clientY };
      held.current = false;
    },
    /** True once the gesture has travelled far enough to be a drag. */
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
        // A synthetic pointer has none; the gesture still follows it.
      }
      return true;
    },
    /** True when a gesture was in flight; gives any capture back. */
    up(event: React.PointerEvent<Element>): boolean {
      const active = grab.current !== null;
      if (held.current) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Already released with the pointer, or never taken.
        }
      }
      grab.current = null;
      held.current = false;
      return active;
    },
  };
}

/** One row of level bars; the fill is a second copy lit through a clip. */
function Bars({ levels }: { levels: number[] }) {
  return levels.map((level, index) => (
    <span
      key={index}
      className="min-w-[2px] flex-1 rounded-full bg-current"
      style={{ height: `${Math.max(12, Math.round(clamp01(level) * 100))}%` }}
    />
  ));
}

const PLAY = "M5.5 3.5 12 8l-6.5 4.5z";
const PAUSE = "M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z";
/** A capsule, an arc under it and a stand: one stroked path, no icon set. */
const MIC =
  "M6 4.5a2 2 0 0 1 4 0v3a2 2 0 0 1-4 0zM4 7.5a4 4 0 0 0 8 0M8 11.5V14M6 14h4";

type NoteItemProps = {
  note: VoiceNote;
  playing: boolean;
  visible: boolean;
  motionSafe: boolean;
  peerName: string;
  onToggle: (id: string, playing: boolean) => void;
  onSay: (text: string) => void;
};

/**
 * One voice bubble. Position lives in ticks so the fill and the slider agree;
 * the tick runs only while `playing` and the document is visible.
 */
function NoteItem({
  note,
  playing,
  visible,
  motionSafe,
  peerName,
  onToggle,
  onSay,
}: NoteItemProps) {
  const seconds = wholeSeconds(note.seconds);
  const total = seconds * 10;
  const [played, setPlayed] = React.useState(0);
  const playedRef = React.useRef(0);
  const waveRef = React.useRef<HTMLDivElement | null>(null);
  const capture = useCapture();

  const latest = React.useRef({ onToggle, onSay });
  React.useEffect(() => {
    latest.current = { onToggle, onSay };
  });

  React.useEffect(() => {
    if (!playing || !visible) return;
    const timer = window.setInterval(() => {
      const next = playedRef.current + 1;
      if (next >= total) {
        playedRef.current = 0;
        setPlayed(0);
        latest.current.onToggle(note.id, false);
        latest.current.onSay("Finished");
        return;
      }
      playedRef.current = next;
      setPlayed(next);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, visible, total, note.id]);

  const seek = (ticks: number) => {
    const next = Math.min(total, Math.max(0, Math.round(ticks)));
    playedRef.current = next;
    setPlayed(next);
  };

  const seekTo = (clientX: number) => {
    const node = waveRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0) return;
    seek(clamp01((clientX - rect.left) / rect.width) * total);
  };

  const own = note.from === "me";
  const at = Math.round(played / 10);
  const percent = Number((100 - (played / total) * 100).toFixed(3));
  const bars = note.wave.length > 0 ? note.wave : FLAT;

  return (
    <motion.li
      initial={motionSafe ? { opacity: 0, y: distances.shift } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={motionSafe ? { y: springs.recoil, opacity: FADE } : FADE}
      className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}
    >
      <div
        role="group"
        aria-label={
          own
            ? `Your voice note, ${seconds} seconds`
            : `Voice note from ${peerName}, ${seconds} seconds`
        }
        className={cn(
          "flex w-full max-w-[86%] items-center gap-2 rounded-3 py-2 pr-3 pl-2",
          own
            ? "rounded-br-1 bg-primary text-primary-foreground"
            : "rounded-bl-1 bg-surface-2 text-foreground",
        )}
      >
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            onToggle(note.id, !playing);
            onSay(playing ? "Paused" : "Playing");
          }}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full bg-current/15 transition-colors outline-none hover:bg-current/25",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
            <path d={playing ? PAUSE : PLAY} fill="currentColor" />
          </svg>
        </button>

        {/* The wave is the slider: the played part is the same shape lit
            through a rounded inset clip over a second copy of the bars. */}
        <div
          ref={waveRef}
          role="slider"
          tabIndex={0}
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={seconds}
          aria-valuenow={at}
          aria-valuetext={`${at} of ${seconds} seconds`}
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowRight" || event.key === "ArrowUp"
                ? 10
                : event.key === "ArrowLeft" || event.key === "ArrowDown"
                  ? -10
                  : 0;
            if (step !== 0) {
              event.preventDefault();
              seek(playedRef.current + step);
            } else if (event.key === "Home") {
              event.preventDefault();
              seek(0);
            } else if (event.key === "End") {
              event.preventDefault();
              seek(total);
            }
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
            "relative h-7 min-w-0 flex-1 cursor-pointer touch-none rounded-1 outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span
            aria-hidden
            className="absolute inset-0 flex items-center gap-[2px] opacity-30"
          >
            <Bars levels={bars} />
          </span>
          <motion.span
            aria-hidden
            className="absolute inset-0 flex items-center gap-[2px]"
            initial={false}
            animate={{ clipPath: `inset(0 ${percent}% 0 0 round 2px)` }}
            transition={{ duration: TICK_MS / 1000, ease: easings.linear }}
          >
            <Bars levels={bars} />
          </motion.span>
        </div>

        {/* The clock counts what is left, so it reads as time remaining. */}
        <span
          aria-hidden
          className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums"
        >
          {clock(played > 0 ? seconds - at : seconds)}
        </span>
      </div>
      {note.time ? (
        <span className="px-1 text-[11px] text-ink-3 tabular-nums">
          {note.time}
        </span>
      ) : null}
    </motion.li>
  );
}

/**
 * Hold, speak, send. Holding the mic opens a waveform pill to its left on
 * `snap`: a tick every 100ms advances a seeded level for each of 24 bars — no
 * microphone is read — and each bar re-targets its height on `flick`, the
 * fastest spring, so the wave reads as the voice rather than lagging it, while
 * a clock counts the seconds. Each tick's mean level is kept, and a release
 * past the first tick resamples that profile to 32 bars and fires `onSend`;
 * the parent appends the note and its bubble rises from `distances.shift` on
 * `recoil`, the landing spring. A release before the first tick is a tap, and
 * the pill shows "Hold to record" for a beat instead.
 *
 * Inside a bubble, play runs a tick that fills the bars left to right through
 * a rounded inset clip while the clock counts down, and the wave is a slider:
 * press and drag scrub it — the pointer is captured only after 4px of travel,
 * in try/catch — Arrow keys step a second, Home and End jump. Under reduced
 * motion the pill fades in place, the live bars hold a static profile while
 * the clock still counts, the bubble fades in without the rise, and the fill
 * still advances because position is information.
 */
export function VoiceBubble({
  ref,
  notes,
  onSend,
  onCancel,
  onRecording,
  onPlayChange,
  maxSeconds = 30,
  peerName = "Them",
  label,
  className,
}: VoiceBubbleProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
  const hintId = React.useId();
  const capture = useCapture();

  const [recording, setRecording] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [hint, setHint] = React.useState(false);
  const [spoken, setSpoken] = React.useState("");
  const [playingId, setPlayingId] = React.useState<string | null>(null);

  const tickRef = React.useRef(0);
  const profileRef = React.useRef<number[]>([]);
  // A synthetic sweep can fire pointerdown and pointerup inside one task, so
  // the handlers read the take from a ref: the state has not committed yet.
  const recordingRef = React.useRef(false);

  const latest = React.useRef({ onSend, onCancel, onRecording, maxSeconds });
  React.useEffect(() => {
    latest.current = { onSend, onCancel, onRecording, maxSeconds };
  });

  const finish = React.useCallback((kind: "send" | "cancel" | "tap") => {
    const ticks = tickRef.current;
    const profile = profileRef.current;
    tickRef.current = 0;
    profileRef.current = [];
    recordingRef.current = false;
    setRecording(false);
    setTick(0);
    if (kind === "send") {
      const seconds = wholeSeconds(ticks / 10);
      latest.current.onSend?.({ seconds, wave: resample(profile, NOTE_BARS) });
      setSpoken(`Voice note sent, ${seconds} seconds`);
    } else {
      setHint(kind === "tap");
      latest.current.onCancel?.();
      setSpoken(
        kind === "tap" ? "Too short, hold to record" : "Recording discarded",
      );
    }
    latest.current.onRecording?.(null);
  }, []);

  // The take's clock: one interval, torn down with the take and while hidden.
  React.useEffect(() => {
    if (!recording || !visible) return;
    const timer = window.setInterval(() => {
      const next = tickRef.current + 1;
      tickRef.current = next;
      let sum = 0;
      for (let i = 0; i < LIVE_BARS; i += 1) sum += liveLevel(i, next);
      profileRef.current.push(Number((sum / LIVE_BARS).toFixed(3)));
      setTick(next);
      // Whole seconds only: ten calls a second all carrying "3" is noise.
      if (next % 10 === 0) latest.current.onRecording?.(next / 10);
      if (next >= latest.current.maxSeconds * 10) finish("send");
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [recording, visible, finish]);

  React.useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(false), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const begin = () => {
    if (recordingRef.current) return;
    tickRef.current = 0;
    profileRef.current = [];
    recordingRef.current = true;
    setTick(0);
    setHint(false);
    setRecording(true);
    setSpoken("Recording");
    onRecording?.(0);
  };

  // Nothing recorded yet is a tap, not a take.
  const release = () => {
    if (recordingRef.current) finish(tickRef.current < 1 ? "tap" : "send");
  };

  const listRef = React.useRef<HTMLOListElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = listRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const togglePlay = (id: string, playing: boolean) => {
    const next = playing ? id : null;
    setPlayingId(next);
    onPlayChange?.(next);
  };

  // A note the parent has since dropped cannot stay "playing".
  const activeId =
    playingId !== null && notes.some((item) => item.id === playingId)
      ? playingId
      : null;

  const held = Math.floor(tick / 10);
  const layout = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={layout}
        className="overflow-hidden"
      >
        <ol
          ref={listRef}
          role="list"
          aria-label={label}
          className="flex flex-col gap-3 px-0.5 pb-0.5"
        >
          <AnimatePresence initial={false}>
            {notes.map((item) => (
              <NoteItem
                key={item.id}
                note={item}
                playing={activeId === item.id}
                visible={visible}
                motionSafe={motionSafe}
                peerName={peerName}
                onToggle={togglePlay}
                onSay={setSpoken}
              />
            ))}
          </AnimatePresence>
        </ol>
      </motion.div>

      <div className="flex items-center gap-2 select-none">
        <div className="relative h-9 min-w-0 flex-1">
          <AnimatePresence initial={false}>
            {recording ? (
              <motion.div
                key="pill"
                aria-hidden
                initial={
                  motionSafe
                    ? { opacity: 0, scaleX: 0.85, x: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, scaleX: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? { ...springs.snap, opacity: FADE } : FADE
                }
                // The pill grows out of the mic, so its origin is its right end.
                style={{ originX: 1 }}
                className="absolute inset-0 flex items-center gap-2 rounded-full border border-hairline bg-surface-2 px-3"
              >
                <span className="size-2 shrink-0 rounded-full bg-danger" />
                <span className="flex h-full min-w-0 flex-1 items-center gap-[2px]">
                  {Array.from({ length: LIVE_BARS }, (_, index) => (
                    <motion.span
                      key={index}
                      className="h-4 min-w-[2px] flex-1 origin-center rounded-full bg-ink-2"
                      initial={false}
                      animate={{
                        scaleY: motionSafe
                          ? liveLevel(index, tick)
                          : liveLevel(index, 7),
                      }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    />
                  ))}
                </span>
                <span className="w-8 shrink-0 text-right font-mono text-[11px] text-foreground tabular-nums">
                  {clock(held)}
                </span>
              </motion.div>
            ) : (
              <motion.p
                key={hint ? "hint" : "idle"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.blink) }}
                transition={FADE}
                className={cn(
                  "absolute inset-0 flex items-center truncate rounded-full border border-hairline bg-surface-1 px-4 text-xs",
                  hint ? "text-warn" : "text-ink-3",
                )}
              >
                {hint
                  ? "Hold to record"
                  : "Hold the mic to record a voice note"}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          aria-label="Hold to record"
          aria-pressed={recording}
          aria-describedby={hintId}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            capture.down(event);
            begin();
          }}
          onPointerMove={(event) => capture.move(event)}
          onPointerUp={(event) => {
            if (capture.up(event)) release();
          }}
          onPointerCancel={(event) => {
            if (capture.up(event) && recordingRef.current) finish("cancel");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && recordingRef.current) {
              event.preventDefault();
              finish("cancel");
              return;
            }
            if (event.key !== " " && event.key !== "Enter") return;
            // Taking the default keeps the browser from adding a click that
            // would toggle the take a second time.
            event.preventDefault();
            if (event.repeat) return;
            if (recordingRef.current) release();
            else begin();
          }}
          className={cn(
            "grid size-9 shrink-0 touch-none place-items-center rounded-full transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            recording
              ? "bg-danger text-primary-foreground"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0"
          >
            <path d={MIC} />
          </svg>
        </button>
      </div>

      <span id={hintId} className="sr-only">
        Hold to record and release to send. Space or Enter toggles the take;
        Escape discards it.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
