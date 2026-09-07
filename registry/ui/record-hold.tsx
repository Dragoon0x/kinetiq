"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RecordHoldProps = {
  /** Lifecycle callback; `seconds` is the whole seconds held. */
  onRecord?: (event: "start" | "stop" | "cancel", seconds: number) => void;
  /** The take stops itself here. @default 60 */
  maxSeconds?: number;
  /** Pixels of leftward travel that arm the cancel. @default 96 */
  cancelDistance?: number;
  className?: string;
};

type Phase = "idle" | "recording" | "sent" | "cancelled";

const BARS = 12;
/** Capture on pointerdown eats plain clicks; wait for real travel. */
const CAPTURE_PX = 4;

const SLOT = "absolute inset-0 flex items-center rounded-full border";
const FADE = { duration: durations.fast, ease: easings.enter };

/**
 * The waveform is computed, not sampled — two out-of-phase waves per bar. It is
 * deterministic, so the server and the client draw the same first frame and the
 * meter never trips a hydration warning.
 */
const level = (index: number, tick: number): number => {
  const a = Math.sin(index * 1.7 + tick * 0.55);
  const b = Math.cos(index * 0.63 - tick * 0.37);
  return 0.2 + 0.8 * Math.abs(a * 0.6 + b * 0.4);
};

const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const MIC =
  "M12 3.5a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0V6A2.5 2.5 0 0 1 12 3.5z";

/**
 * The clock, rolling one monospace cell per glyph. Seconds only ever climb, so
 * the ink always leaves upward and there is no direction to work out.
 */
function Digits({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const enter = motionSafe ? { y: "100%" } : { opacity: 0 };
  const leave = motionSafe
    ? { y: "-100%", opacity: 0, transition: exitFor(durations.fast) }
    : { opacity: 0, transition: exitFor(durations.blink) };
  return (
    <span
      aria-hidden
      className="flex w-9 shrink-0 justify-end font-mono text-xs text-foreground tabular-nums"
    >
      {text.split("").map((char, index) => (
        <span
          key={index}
          className="relative inline-block h-[1.3em] w-[1ch] overflow-hidden"
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={`${index}-${char}`}
              initial={enter}
              animate={{ y: "0%", opacity: 1 }}
              exit={leave}
              transition={motionSafe ? springs.snap : FADE}
              className="absolute inset-0 flex items-center justify-center"
            >
              {char}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/**
 * A hold-to-record button that puts the discard where the thumb already is.
 * Pressing grows a ring around the mic on `snap` and opens a pill carrying a
 * live procedural waveform and a rolling timer. Dragging left slides the mic
 * with the pointer 1:1, tilts it toward a bin that swaps in for the record dot,
 * and past `cancelDistance` the bin's lid lifts: release there and the take is
 * discarded on the exit ease — a destructive outcome never celebrates. Release
 * in place and the pill is thrown clear on `recoil` as "Sent" lands behind it.
 *
 * Capture waits for 4px of travel so a plain press still registers, and a
 * release before the first tick is read as a tap rather than a one-frame take.
 * Space or Enter toggles recording, Escape cancels while a take is live, and
 * the take stops itself at `maxSeconds` from inside the tick that crossed it.
 *
 * Under reduced motion the waveform holds its profile instead of pulsing and
 * every state swaps — but the timer still counts, because how long you have
 * been recording is information.
 */
export function RecordHold({
  onRecord,
  maxSeconds = 60,
  cancelDistance = 96,
  className,
}: RecordHoldProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [seconds, setSeconds] = React.useState(0);
  const [lastSeconds, setLastSeconds] = React.useState(0);
  const [tick, setTick] = React.useState(0);
  const [armed, setArmed] = React.useState(false);
  const [tooShort, setTooShort] = React.useState(false);

  const recording = phase === "recording";
  const lifted = phase === "sent";
  const secondsRef = React.useRef(0);
  const grab = React.useRef<{ x: number } | null>(null);
  const captured = React.useRef(false);
  const glide = React.useRef<AnimationPlaybackControls | null>(null);

  const x = useMotionValue(0);
  const progress = useTransform(x, [0, -cancelDistance], [0, 1], {
    clamp: true,
  });
  const dotOpacity = useTransform(progress, [0, 0.22], [1, 0]);
  const binOpacity = useTransform(progress, [0.06, 0.34], [0, 1]);
  const hintOpacity = useTransform(progress, [0, 0.6], [1, 0]);
  const micRotate = useTransform(progress, [0, 1], [0, -22]);

  useMotionValueEvent(progress, "change", (value) => setArmed(value >= 1));

  const finish = React.useCallback(
    (kind: "stop" | "cancel") => {
      const total = secondsRef.current;
      secondsRef.current = 0;
      setSeconds(0);
      setLastSeconds(total);
      setArmed(false);
      setPhase(kind === "stop" ? "sent" : "cancelled");
      onRecord?.(kind, total);
    },
    [onRecord],
  );

  // Kept fresh in an effect so the ticking interval can reach today's callback
  // without being torn down and restarted by every parent render.
  const latest = React.useRef({ finish, maxSeconds });
  React.useEffect(() => {
    latest.current = { finish, maxSeconds };
  });

  React.useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const next = secondsRef.current + 1;
      secondsRef.current = next;
      setSeconds(next);
      if (next >= latest.current.maxSeconds) latest.current.finish("stop");
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  React.useEffect(() => {
    if (!recording || !motionSafe) return;
    const meter = window.setInterval(() => setTick((value) => value + 1), 110);
    return () => window.clearInterval(meter);
  }, [recording, motionSafe]);

  React.useEffect(() => {
    if (phase !== "sent" && phase !== "cancelled") return;
    const done = window.setTimeout(() => setPhase("idle"), 1400);
    return () => window.clearTimeout(done);
  }, [phase]);

  React.useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") latest.current.finish("cancel");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [recording]);

  React.useEffect(() => () => glide.current?.stop(), []);

  const home = () => {
    glide.current?.stop();
    if (motionSafe) glide.current = animate(x, 0, springs.snap);
    else x.set(0);
  };

  const begin = () => {
    if (recording) return;
    secondsRef.current = 0;
    setSeconds(0);
    setTick(0);
    setTooShort(false);
    setArmed(false);
    glide.current?.stop();
    x.set(0);
    setPhase("recording");
    onRecord?.("start", 0);
  };

  const release = (cancel: boolean) => {
    if (recording) {
      // A press that never reached the first tick is a tap, not a take.
      const tap = secondsRef.current === 0 && !cancel;
      setTooShort(tap);
      finish(cancel || tap ? "cancel" : "stop");
    }
    home();
  };

  const endGesture = (
    event: React.PointerEvent<HTMLButtonElement>,
    cancel: boolean,
  ) => {
    if (!grab.current) return;
    if (
      captured.current &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    grab.current = null;
    captured.current = false;
    release(cancel);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && recording) {
      event.preventDefault();
      setTooShort(false);
      finish("cancel");
      home();
      return;
    }
    if (event.key !== " " && event.key !== "Enter") return;
    // Taking the default stops the browser turning this into a click, which
    // would toggle the take a second time.
    event.preventDefault();
    if (event.repeat) return;
    if (!recording) begin();
    else {
      setTooShort(false);
      finish("stop");
    }
  };

  const announce = recording
    ? "Recording"
    : lifted
      ? `Recording sent, ${lastSeconds} seconds`
      : phase === "cancelled"
        ? tooShort
          ? "Too short, hold to record"
          : "Recording discarded"
        : "";

  const slot =
    recording || lifted ? "live" : phase === "cancelled" ? "done" : "idle";
  const slotClass = {
    live: cn(
      "gap-2 px-3",
      armed ? "border-danger/50 bg-danger/10" : "border-hairline bg-surface-2",
    ),
    done: cn(
      "px-4 font-mono text-[11px] tracking-[0.06em] uppercase",
      tooShort
        ? "border-hairline bg-surface-1 text-ink-2"
        : "border-danger/40 bg-danger/10 text-danger",
    ),
    idle: "border-hairline bg-surface-1 px-4 text-xs text-ink-3",
  }[slot];

  return (
    <div
      className={cn("flex w-full items-center gap-2 select-none", className)}
    >
      <div className="relative h-12 min-w-0 flex-1">
        <AnimatePresence initial={false}>
          <motion.div
            key={slot}
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{
              opacity: lifted ? 0 : 1,
              y: lifted && motionSafe ? -distances.shift : 0,
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              // Arriving is a panel opening (snap); leaving on send is a
              // landing thrown clear of the composer (recoil).
              y: motionSafe
                ? lifted
                  ? springs.recoil
                  : springs.snap
                : { duration: 0 },
              // The send's fade is slower than a swap so the recoil is
              // actually seen; the pill has to leave, not blink out.
              opacity: lifted
                ? { duration: durations.slow, ease: easings.exit }
                : FADE,
            }}
            className={cn(SLOT, "transition-colors", slotClass)}
          >
            {slot === "idle" && "Hold the mic to record"}
            {slot === "done" &&
              (tooShort ? "Hold to record" : "Take discarded")}
            {slot === "live" && (
              <>
                <span className="relative flex size-5 shrink-0 items-center justify-center">
                  <motion.span
                    aria-hidden
                    style={{ opacity: dotOpacity }}
                    className="absolute size-2.5 rounded-full bg-danger"
                  />
                  <motion.svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    style={{ opacity: binOpacity }}
                    className="absolute size-4 text-danger"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    {/* Only origin* keys survive motion's transform-origin
                        rewrite on SVG children, so the lid pivots by them. */}
                    <motion.path
                      d="M3.2 4.2h9.6"
                      initial={false}
                      animate={{ rotate: armed && motionSafe ? -24 : 0 }}
                      transition={springs.snap}
                      style={{ originX: 0.85, originY: 0.5 }}
                    />
                    <path d="M4.6 4.2v8.2h6.8V4.2M6.6 4.2V2.8h2.8v1.4" />
                  </motion.svg>
                </span>

                <Digits text={clock(seconds)} motionSafe={motionSafe} />

                <span
                  aria-hidden
                  className="flex h-5 min-w-0 flex-1 items-center gap-[3px]"
                >
                  {Array.from({ length: BARS }, (_, index) => (
                    <motion.span
                      key={index}
                      initial={false}
                      animate={{ scaleY: level(index, tick) }}
                      transition={motionSafe ? springs.flick : FADE}
                      className="h-full min-w-px flex-1 rounded-full bg-cobalt-bright/70"
                    />
                  ))}
                </span>

                <motion.span
                  aria-hidden
                  style={{ opacity: hintOpacity }}
                  className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
                >
                  Slide to cancel
                </motion.span>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* The confirmation lands as the pill is thrown clear, so the send has
            a destination rather than just an absence. */}
        <AnimatePresence>
          {lifted && (
            <motion.p
              key="sent"
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={motionSafe ? springs.recoil : { duration: 0 }}
              className={cn(
                SLOT,
                "border-success/40 bg-success/10 px-4 font-mono text-[11px] tracking-[0.06em] text-success uppercase",
              )}
            >
              Sent · {clock(lastSeconds)}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="relative size-12 shrink-0">
        <motion.span
          aria-hidden
          initial={false}
          animate={{ scale: recording ? 1 : 0.72, opacity: recording ? 1 : 0 }}
          transition={motionSafe ? springs.snap : FADE}
          className={cn(
            "pointer-events-none absolute -inset-1.5 rounded-full border-2",
            armed ? "border-danger/50" : "border-primary/40",
          )}
        />
        <motion.button
          type="button"
          aria-pressed={recording}
          aria-label={
            recording ? "Recording, release to send" : "Hold to record"
          }
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            grab.current = { x: event.clientX };
            captured.current = false;
            begin();
          }}
          onPointerMove={(event) => {
            const from = grab.current;
            if (!from) return;
            const dx = event.clientX - from.x;
            if (!captured.current) {
              if (Math.abs(dx) < CAPTURE_PX) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              captured.current = true;
            }
            x.set(Math.max(Math.min(0, dx), -cancelDistance * 1.3));
          }}
          onPointerUp={(event) => endGesture(event, x.get() <= -cancelDistance)}
          onPointerCancel={(event) => endGesture(event, true)}
          // Under 4px there is no capture yet, so a pointer that slips off the
          // mic would otherwise never bring its own pointerup back.
          onPointerLeave={(event) => {
            if (!captured.current) endGesture(event, false);
          }}
          style={{ x, rotate: micRotate }}
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            armed
              ? "bg-destructive text-destructive-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="size-5 shrink-0"
          >
            <path d={MIC} fill="currentColor" stroke="none" />
            <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20" />
          </svg>
        </motion.button>
      </div>

      <span id={hintId} className="sr-only">
        Hold to record, slide left to cancel. Space or Enter toggles recording;
        Escape cancels.
      </span>
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
