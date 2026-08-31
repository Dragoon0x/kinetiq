"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type VignetteVoiceNoteProps = {
  /** Who left the note. */
  speaker?: string;
  /** Pre-formatted duration, e.g. "0:34". */
  duration?: string;
  /** Bar heights 0–1; a fixed shape so SSR and client agree. */
  waveform?: number[];
  /** Seconds one playback sweep takes. @default 6 */
  sweepSeconds?: number;
  className?: string;
};

const DEFAULT_WAVE = [
  0.3, 0.55, 0.8, 0.6, 0.35, 0.7, 0.95, 0.75, 0.5, 0.65, 0.85, 0.55, 0.3, 0.45,
  0.7, 0.9, 0.6, 0.4, 0.6, 0.8, 0.5, 0.35, 0.55, 0.4, 0.25,
];

/**
 * A voice note as a scene: speaker, a fixed waveform, and a play head that
 * sweeps the bars — each one brightening as the head passes, the way a
 * message app renders playback. The waveform is provided data, not audio
 * analysis, and nothing plays; it is the shape of a voice for heroes about
 * talking to software. One image to assistive tech.
 *
 * Reduced motion: the head rests a third of the way in, bars behind it lit.
 */
export function VignetteVoiceNote({
  speaker = "Mara — yard lead",
  duration = "0:34",
  waveform = DEFAULT_WAVE,
  sweepSeconds = 6,
  className,
}: VignetteVoiceNoteProps) {
  const motionSafe = useMotionSafe();
  const [progress, setProgress] = React.useState(motionSafe ? 0 : 0.33);

  // Mode changed: rest position is set during render, never in the effect.
  const [modeKey, setModeKey] = React.useState(motionSafe);
  if (modeKey !== motionSafe) {
    setModeKey(motionSafe);
    if (!motionSafe) setProgress(0.33);
  }

  React.useEffect(() => {
    if (!motionSafe) return;
    let frame: number;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = ((now - start) / (sweepSeconds * 1000)) % 1.2;
      setProgress(Math.min(t, 1));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [motionSafe, sweepSeconds]);

  return (
    <div
      role="img"
      aria-label={`Voice note from ${speaker}, ${duration}`}
      className={cn(
        "w-full max-w-xs rounded-4 border border-hairline bg-surface-1 p-3.5",
        className,
      )}
    >
      <div aria-hidden>
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium text-ink">
            {speaker}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {duration}
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <svg viewBox="0 0 12 12" className="ml-0.5 size-3 fill-current">
              <path d="M2.5 1.5v9l8-4.5z" />
            </svg>
          </span>
          <div className="flex h-9 flex-1 items-center gap-[2px]">
            {waveform.map((height, index) => {
              const lit = index / waveform.length <= progress;
              return (
                <motion.span
                  key={index}
                  className={cn(
                    "w-[3px] flex-1 rounded-full",
                    lit ? "bg-primary" : "bg-surface-2",
                  )}
                  animate={{ scaleY: lit ? 1 : 0.85 }}
                  transition={{ duration: 0.15 }}
                  style={{ height: `${Math.round(height * 100)}%` }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
