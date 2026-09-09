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

export type VoiceWord = {
  id: string;
  text: string;
  /** Interim words read light; a final word firms to full ink. */
  final: boolean;
};

export type VoicePromptProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Voice level 0..1; drives the ring while holding. */
  level?: number;
  /** The transcript so far, from the parent. */
  words?: VoiceWord[];
  /** Optional controlled hold state. */
  holding?: boolean;
  /** Fires from the press that begins a hold. */
  onHoldStart?: () => void;
  /** Fires from the release with the joined words. */
  onSend?: (text: string) => void;
  /** Fires from Escape during a hold, or a release with nothing said. */
  onCancel?: () => void;
  /** The button's accessible name. @default "Hold to talk" */
  label?: string;
  className?: string;
};

const NO_WORDS: VoiceWord[] = [];
/** How long the sent stamp and the empty-release hint stay up. */
const BEAT_MS = 1600;
/** Pointer travel before the hold captures the pointer, so a click stays a click. */
const CAPTURE_PX = 4;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ringScale = (level: number, reach: number) =>
  Number((1 + level * reach).toFixed(3));

/** A beat that waits out any stretch where the tab is hidden. */
function useBeat(active: boolean, ms: number, clear: () => void) {
  React.useEffect(() => {
    if (!active) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(clear, ms);
    };
    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer);
      else arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, ms, clear]);
}

/**
 * Speak; the words appear. A hold-to-talk button with two rings behind it:
 * the inner follows `level` on `flick`, the fastest house spring, so it reads
 * as the voice rather than lagging it, and the outer trails the same level on
 * `glide`, so a loud moment leaves a wake. Pointer down or a held Space or
 * Enter begins the hold; the pointer is captured only after four pixels of
 * travel, inside a try/catch, so a finger drifting off the button keeps the
 * hold and a plain click still lands.
 *
 * Interim words arrive from `distances.nudge` on `snap` in light ink and firm
 * to full ink when `final` flips. Release fires `onSend` with the joined words
 * and a Sent stamp lands on `recoil`; Escape cancels; a release with nothing
 * said shows a hint for a beat. No microphone is read — the level and the
 * words come from the parent. The button carries `aria-pressed`, the
 * transcript is a plain paragraph, and a status line announces the hold and
 * the send. Under reduced motion the rings hold their size and show the level
 * as wash opacity, words appear in place, and the stamp fades in.
 */
export function VoicePrompt({
  ref,
  level = 0,
  words = NO_WORDS,
  holding: holdingProp,
  onHoldStart,
  onSend,
  onCancel,
  label = "Hold to talk",
  className,
}: VoicePromptProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();

  const [uncontrolledHolding, setUncontrolledHolding] = React.useState(false);
  const holding = holdingProp ?? uncontrolledHolding;
  const [sent, setSent] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const pointer = React.useRef<{ x: number; y: number; id: number } | null>(
    null,
  );
  const captured = React.useRef(false);
  const keyHeld = React.useRef(false);

  const clearSent = React.useCallback(() => setSent(null), []);
  const clearHint = React.useCallback(() => setHint(false), []);
  useBeat(sent !== null, BEAT_MS, clearSent);
  useBeat(hint, BEAT_MS, clearHint);

  const begin = () => {
    if (holding) return;
    setUncontrolledHolding(true);
    setSent(null);
    setHint(false);
    setAnnounce("Listening");
    onHoldStart?.();
  };

  const release = () => {
    if (!holding) return;
    setUncontrolledHolding(false);
    const text = words
      .map((word) => word.text.trim())
      .filter(Boolean)
      .join(" ");
    if (text) {
      setSent(text);
      setAnnounce(`Sent: ${text}`);
      onSend?.(text);
    } else {
      setHint(true);
      setAnnounce("Nothing heard");
      onCancel?.();
    }
  };

  const cancel = () => {
    if (!holding) return;
    setUncontrolledHolding(false);
    setAnnounce("Cancelled");
    onCancel?.();
  };

  const volume = clamp01(level);
  const live = holding ? volume : 0;
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const ringClass = "pointer-events-none absolute inset-0 rounded-full";

  const idleLine = holding
    ? "Listening"
    : hint
      ? "Hold to talk"
      : "Hold the button and speak";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full items-center gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <span className="relative grid size-14 shrink-0 place-items-center">
        <motion.span
          aria-hidden
          className={cn(ringClass, "bg-cobalt-bright/15")}
          initial={false}
          animate={{
            scale: motionSafe ? ringScale(live, 0.42) : 1,
            opacity: holding ? Number((0.4 + live * 0.6).toFixed(3)) : 0,
          }}
          transition={motionSafe ? { ...springs.glide, opacity: fade } : fade}
        />
        <motion.span
          aria-hidden
          className={cn(ringClass, "bg-cobalt-bright/25")}
          initial={false}
          animate={{
            scale: motionSafe ? ringScale(live, 0.28) : 1,
            opacity: holding ? Number((0.5 + live * 0.5).toFixed(3)) : 0,
          }}
          transition={motionSafe ? { ...springs.flick, opacity: fade } : fade}
        />
        <button
          type="button"
          aria-pressed={holding}
          aria-label={label}
          aria-describedby={hintId}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            pointer.current = {
              x: event.clientX,
              y: event.clientY,
              id: event.pointerId,
            };
            captured.current = false;
            begin();
          }}
          onPointerMove={(event) => {
            const start = pointer.current;
            if (!start || captured.current || !holding) return;
            const travel = Math.hypot(
              event.clientX - start.x,
              event.clientY - start.y,
            );
            if (travel <= CAPTURE_PX) return;
            try {
              event.currentTarget.setPointerCapture(start.id);
              captured.current = true;
            } catch {
              // A synthetic sweep may carry no live pointer to capture; the
              // hold then ends when the pointer leaves, below.
            }
          }}
          onPointerUp={() => {
            pointer.current = null;
            captured.current = false;
            release();
          }}
          onPointerCancel={() => {
            pointer.current = null;
            captured.current = false;
            cancel();
          }}
          onPointerLeave={() => {
            if (pointer.current && !captured.current) {
              pointer.current = null;
              release();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
              return;
            }
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            if (event.repeat || keyHeld.current) return;
            keyHeld.current = true;
            begin();
          }}
          onKeyUp={(event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            if (!keyHeld.current) return;
            keyHeld.current = false;
            release();
          }}
          onBlur={() => {
            keyHeld.current = false;
            cancel();
          }}
          className={cn(
            "relative z-10 grid size-11 touch-none place-items-center rounded-full border transition-colors outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            holding
              ? "border-cobalt-bright bg-primary text-primary-foreground"
              : "border-hairline-strong bg-surface-2 text-foreground hover:bg-accent",
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
            className="size-4"
          >
            <rect x="6" y="1.5" width="4" height="7.5" rx="2" />
            <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M5.5 14.5h5" />
          </svg>
        </button>
        <span id={hintId} className="sr-only">
          Hold Space or the pointer to talk; release to send; Escape cancels.
        </span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm leading-6">
          <AnimatePresence initial={false}>
            {sent !== null ? (
              <motion.span
                key="sent"
                className="mr-1.5 inline-flex h-5 items-center gap-1 rounded-full bg-success/15 px-1.5 align-middle text-[11px] font-medium text-success"
                initial={
                  motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? { ...springs.recoil, opacity: fade } : fade
                }
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                >
                  <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                </svg>
                Sent
              </motion.span>
            ) : null}
          </AnimatePresence>
          {sent !== null ? (
            <span className="text-ink-2">{sent}</span>
          ) : words.length === 0 ? (
            <span className="text-ink-3">{idleLine}</span>
          ) : (
            <AnimatePresence initial={false}>
              {words.map((word) => (
                <motion.span
                  key={word.id}
                  className={cn(
                    "mr-1 inline-block transition-colors duration-200",
                    word.final ? "text-foreground" : "text-ink-3",
                  )}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: motionSafe ? -distances.nudge : 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe ? { ...springs.snap, opacity: fade } : fade
                  }
                >
                  {word.text}
                </motion.span>
              ))}
            </AnimatePresence>
          )}
        </p>
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          {holding
            ? `${words.length} word${words.length === 1 ? "" : "s"}`
            : "Hold to talk"}
        </span>
      </div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
