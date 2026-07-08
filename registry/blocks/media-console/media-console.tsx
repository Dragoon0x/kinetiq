"use client";

import * as React from "react";

import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  ChevronDown,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { CaliperSlider } from "@/registry/ui/caliper-slider";
import { ScopeScrubber } from "@/registry/ui/scope-scrubber";

export type Track = {
  id: string;
  title: string;
  artist: string;
  /** Length in whole seconds. */
  duration: number;
};

export type MediaConsoleProps = {
  tracks?: Track[];
  defaultExpanded?: boolean;
  className?: string;
};

const DEFAULT_TRACKS: Track[] = [
  { id: "coil-memory", title: "Coil Memory", artist: "Signal Garden", duration: 204 },
  { id: "orbit-decay", title: "Orbit Decay", artist: "Phase Array", duration: 178 },
  { id: "copper-lines", title: "Copper Lines", artist: "Field Notes", duration: 251 },
];

/** Per-track artwork recipes — semantic tokens only, cycled by index. */
const ARTWORK_GRADIENTS = [
  "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 20%, var(--background)))",
  "linear-gradient(215deg, color-mix(in oklch, var(--primary) 65%, var(--foreground)), color-mix(in oklch, var(--primary) 15%, var(--background)))",
  "linear-gradient(160deg, color-mix(in oklch, var(--primary) 45%, var(--background)), var(--secondary))",
];

/** Frozen bar heights — the paused (and reduced-motion) waveform pose. */
const WAVE_IDLE = [0.55, 0.85, 0.45, 0.7, 0.5];
/** Looping height keyframes per bar; each loop closes on its start value. */
const WAVE_LOOPS = [
  [0.45, 0.95, 0.55, 0.8, 0.45],
  [0.7, 0.4, 0.9, 0.5, 0.7],
  [0.5, 0.85, 0.4, 1, 0.5],
  [0.8, 0.5, 0.75, 0.45, 0.8],
  [0.4, 0.7, 0.5, 0.9, 0.4],
];
const WAVE_LOOP_SECONDS = 1.2;
const WAVE_STAGGER_S = 0.12;

const TRACK_SLIDE_PX = 12;

const formatTime = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/**
 * A media island that unfolds into a console. The collapsed pill and the
 * expanded console share a `layoutId`, so toggling FLIP-morphs one surface
 * into the other on `glide` while inner content crossfades; play/pause icons
 * swap on `flick`, and track changes slide title + artwork direction-aware on
 * `snap`. Playback is simulated: a 1s interval advances progress, auto-nexts
 * at track end, and loops the queue. Reduced motion drops the morph for a
 * fast crossfade and freezes the waveform at varied heights.
 *
 * To wire real audio: render an `<audio>` element, drive `progress` from its
 * `timeupdate` event instead of the interval, call `play()`/`pause()` in the
 * toggle, set `audio.currentTime` in the timeline's `onValueChange`, advance
 * tracks from the `ended` event, and map the volume scrubber's
 * `onValueChange` to `audio.volume / 100`.
 */
export function MediaConsole({
  tracks,
  defaultExpanded = false,
  className,
}: MediaConsoleProps) {
  const motionSafe = useMotionSafe();
  const layoutId = React.useId();
  const trackList = tracks ?? DEFAULT_TRACKS;

  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [playing, setPlaying] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  /** +1 = advancing (next/auto-next), -1 = backing up; steers track slides. */
  const [direction, setDirection] = React.useState<1 | -1>(1);
  const [progress, setProgress] = React.useState(0);
  const progressRef = React.useRef(0);
  const [announcement, setAnnouncement] = React.useState("");
  const firstRender = React.useRef(true);
  const expandRef = React.useRef<HTMLButtonElement | null>(null);
  const collapseRef = React.useRef<HTMLButtonElement | null>(null);

  const safeIndex = trackList.length > 0 ? index % trackList.length : 0;
  const track = trackList[safeIndex];
  const duration = track?.duration ?? 0;

  const seek = (seconds: number) => {
    progressRef.current = seconds;
    setProgress(seconds);
  };

  const changeTrack = React.useCallback(
    (delta: 1 | -1) => {
      if (trackList.length === 0) return;
      setDirection(delta);
      setIndex((i) => (i + delta + trackList.length) % trackList.length);
      progressRef.current = 0;
      setProgress(0);
    },
    [trackList.length],
  );

  // Simulated playback: 1s per second, auto-next + loop at track end.
  React.useEffect(() => {
    if (!playing || duration <= 0) return;
    const interval = window.setInterval(() => {
      const next = progressRef.current + 1;
      if (next >= duration) {
        changeTrack(1);
      } else {
        progressRef.current = next;
        setProgress(next);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [playing, duration, safeIndex, changeTrack]);

  // Expanded flips: announce politely and hand focus to the new surface.
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setAnnouncement(expanded ? "Player expanded" : "Player collapsed");
    const frame = requestAnimationFrame(() => {
      (expanded ? collapseRef.current : expandRef.current)?.focus({
        preventScroll: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setExpanded(false);
    }
  };

  /** Direction-aware slide for title + artwork on track change. */
  const slideVariants: Variants = {
    enter: (dir: number) =>
      motionSafe
        ? { x: dir * TRACK_SLIDE_PX, opacity: 0 }
        : { opacity: 0 },
    center: {
      x: 0,
      opacity: 1,
      transition: motionSafe
        ? {
            x: springs.snap,
            opacity: { duration: durations.fast, ease: easings.enter },
          }
        : { duration: durations.fast },
    },
    exit: (dir: number) =>
      motionSafe
        ? { x: dir * -TRACK_SLIDE_PX, opacity: 0, transition: exitFor(durations.fast) }
        : { opacity: 0, transition: { duration: durations.fast } },
  };

  if (!track) return null;

  const gradient =
    ARTWORK_GRADIENTS[safeIndex % ARTWORK_GRADIENTS.length] ?? "var(--muted)";

  const playToggle = (buttonClassName: string, iconClassName: string) => (
    <button
      type="button"
      aria-label={playing ? "Pause" : "Play"}
      onClick={() => setPlaying((p) => !p)}
      className={buttonClassName}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={playing ? "pause" : "play"}
          initial={motionSafe ? { opacity: 0, scale: 0.9 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={
            motionSafe
              ? { opacity: 0, scale: 0.9, transition: exitFor(durations.fast) }
              : { opacity: 0, transition: { duration: 0 } }
          }
          transition={
            motionSafe
              ? {
                  scale: springs.flick,
                  opacity: { duration: durations.fast, ease: easings.enter },
                }
              : { duration: 0 }
          }
          className="flex"
        >
          {playing ? (
            <Pause aria-hidden className={iconClassName} />
          ) : (
            <Play aria-hidden className={iconClassName} />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );

  const waveform = (
    <span aria-hidden className="flex h-4 shrink-0 items-center gap-0.5">
      {WAVE_LOOPS.map((loop, i) => (
        <motion.span
          key={i}
          style={{ backgroundColor: "var(--signal, var(--primary))" }}
          initial={false}
          animate={
            playing && motionSafe
              ? { scaleY: loop }
              : { scaleY: WAVE_IDLE[i] ?? 0.6 }
          }
          transition={
            playing && motionSafe
              ? {
                  duration: WAVE_LOOP_SECONDS,
                  ease: "easeInOut",
                  repeat: Infinity,
                  delay: i * WAVE_STAGGER_S,
                }
              : { duration: durations.fast }
          }
          className="h-full w-0.5 origin-center rounded-full"
        />
      ))}
    </span>
  );

  const pill = (
    <motion.div
      key="pill"
      layoutId={motionSafe ? layoutId : undefined}
      style={{ borderRadius: 24 }}
      initial={motionSafe ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        transition: motionSafe
          ? exitFor(durations.fast)
          : { duration: durations.fast },
      }}
      transition={motionSafe ? springs.glide : { duration: durations.fast }}
      className="border-border bg-card flex h-12 items-center gap-3 rounded-full border px-2.5 shadow-sm"
    >
      <motion.div
        initial={motionSafe ? { opacity: 0, y: distances.step } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          y: motionSafe ? springs.glide : { duration: 0 },
          opacity: { duration: durations.base, ease: easings.enter },
        }}
        className="flex min-w-0 items-center gap-3"
      >
        <button
          ref={expandRef}
          type="button"
          aria-label="Expand player"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className="flex min-w-0 items-center gap-3 rounded-full"
        >
          <span className="relative min-w-0">
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              <motion.span
                key={track.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="flex min-w-0 items-center gap-3"
              >
                <span
                  aria-hidden
                  className="size-8 shrink-0 rounded-2"
                  style={{ background: gradient }}
                />
                <span className="block max-w-32 truncate text-sm font-medium">
                  {track.title}
                </span>
              </motion.span>
            </AnimatePresence>
          </span>
          {waveform}
        </button>
        {playToggle(
          "hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
          "size-4 fill-current",
        )}
      </motion.div>
    </motion.div>
  );

  const console_ = (
    <motion.div
      key="console"
      layoutId={motionSafe ? layoutId : undefined}
      style={{ borderRadius: 16 }}
      initial={motionSafe ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        transition: motionSafe
          ? exitFor(durations.fast)
          : { duration: durations.fast },
      }}
      transition={motionSafe ? springs.glide : { duration: durations.fast }}
      className="border-border bg-card w-80 rounded-4 border p-4 shadow-md"
    >
      <motion.div
        initial={motionSafe ? { opacity: 0, y: distances.step } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          y: motionSafe ? springs.glide : { duration: 0 },
          opacity: { duration: durations.base, ease: easings.enter },
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.08em] uppercase">
            Now playing
          </span>
          <button
            ref={collapseRef}
            type="button"
            aria-label="Collapse player"
            onClick={() => setExpanded(false)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground -mt-1 -mr-1 flex size-7 items-center justify-center rounded-2 transition-colors"
          >
            <ChevronDown aria-hidden className="size-4" />
          </button>
        </div>

        <div className="relative aspect-square w-full overflow-hidden rounded-3">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={track.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              aria-hidden
              className="absolute inset-0 rounded-3"
              style={{ background: gradient }}
            />
          </AnimatePresence>
        </div>

        <div className="relative overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={track.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <p className="truncate text-sm font-semibold">{track.title}</p>
              <p className="text-muted-foreground truncate text-xs">
                {track.artist}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div>
          <div className="text-muted-foreground mb-1 flex items-center justify-between font-mono text-[10px] font-medium tracking-[0.08em] uppercase">
            <span>Position</span>
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>
          <CaliperSlider
            min={0}
            max={duration}
            step={1}
            value={progress}
            onValueChange={(value) => {
              if (typeof value === "number") seek(value);
            }}
            format={formatTime}
            label="Position"
            readout="end"
          />
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            aria-label="Previous track"
            onClick={() => changeTrack(-1)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <SkipBack aria-hidden className="size-4 fill-current" />
          </button>
          {playToggle(
            "bg-primary text-primary-foreground hover:bg-primary/90 flex size-10 items-center justify-center rounded-full transition-colors",
            "size-4 fill-current",
          )}
          <button
            type="button"
            aria-label="Next track"
            onClick={() => changeTrack(1)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-9 items-center justify-center rounded-full transition-colors"
          >
            <SkipForward aria-hidden className="size-4 fill-current" />
          </button>
        </div>

        <ScopeScrubber
          min={0}
          max={100}
          step={1}
          unit="%"
          label="Volume"
          trace={false}
          defaultValue={72}
        />
      </motion.div>
    </motion.div>
  );

  return (
    <section
      aria-label="Media player"
      onKeyDown={handleKeyDown}
      className={cn("relative flex justify-center", className)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {expanded ? console_ : pill}
      </AnimatePresence>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </section>
  );
}
