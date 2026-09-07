"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HoverPreviewProps = {
  /** How many frames the sequence has. */
  frames: number;
  /** Draws frame `index`; index 0 is the poster. */
  renderFrame: (index: number) => React.ReactNode;
  /** Length of one pass through the sequence, ms. @default 2400 */
  duration?: number;
  /** Card title, and the control's accessible name. */
  title: string;
  /** Fires when this card starts or stops playing. */
  onPlayingChange?: (playing: boolean) => void;
  className?: string;
};

const subscribeVisibility = (notify: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};

const readVisibility = () =>
  typeof document === "undefined" || !document.hidden;

/** A prerender has no document to ask, and a hidden tab never sees first paint. */
const serverVisibility = () => true;

/** Playback behind a hidden tab burns frames nobody sees; it stops and resumes. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    readVisibility,
    serverVisibility,
  );
}

/**
 * A card that plays its own frames while you are looking at it. One linear
 * driver runs from 0 to the frame count and back on a loop: its floor picks the
 * frame, so the card re-renders once per frame rather than once per tick, and
 * the same value feeds the hairline under the art, which is why the bar and the
 * picture can never disagree about where the sequence is.
 *
 * Hovering with a mouse or reaching the card with the keyboard starts a pass;
 * leaving lets it fall back to the poster on the exit ease. A press pins
 * playback, which is what a tap does on touch, so the control is a real toggle
 * button carrying `aria-pressed` and Enter and Space work on it. Under reduced
 * motion the card is a still: the poster, a Preview badge, and no playback at
 * all — there is no gesture left that the keyboard could not reach either.
 */
export function HoverPreview({
  frames,
  renderFrame,
  duration = 2400,
  title,
  onPlayingChange,
  className,
}: HoverPreviewProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();

  const [frame, setFrame] = React.useState(0);
  // The driver compares against this ref; a state updater may run during
  // render, which is no place to decide anything a parent will hear about.
  const frameRef = React.useRef(0);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);

  const progress = useMotionValue(0);

  const count = Math.max(1, Math.floor(frames));
  const playing =
    motionSafe && visible && count > 1 && (pinned || hovered || focused);
  // The poster is frame 0, so a stopped card always shows the same still.
  const shown = playing ? Math.min(frame, count - 1) : 0;

  const playCallback = React.useRef(onPlayingChange);
  React.useEffect(() => {
    playCallback.current = onPlayingChange;
  }, [onPlayingChange]);

  React.useEffect(() => {
    playCallback.current?.(playing);
  }, [playing]);

  React.useEffect(() => {
    if (!playing) return;
    progress.set(0);
    const controls = animate(0, count, {
      duration: duration / 1000,
      ease: easings.linear,
      repeat: Number.POSITIVE_INFINITY,
      onUpdate: (value) => {
        progress.set(Math.min(1, value / count));
        const next = Math.min(count - 1, Math.floor(value));
        if (next === frameRef.current) return;
        frameRef.current = next;
        setFrame(next);
      },
    });
    return () => controls.stop();
  }, [playing, count, duration, progress]);

  // Stopping is an exit, so the bar leaves on the exit ease rather than
  // snapping to zero behind the poster.
  React.useEffect(() => {
    if (playing) return;
    const controls = animate(progress, 0, exitFor(durations.fast));
    return () => controls.stop();
  }, [playing, progress]);

  const art = (
    <div className="relative aspect-4/3 w-full overflow-hidden rounded-2 border border-hairline bg-surface-2">
      <div className="absolute inset-0">{renderFrame(shown)}</div>

      {motionSafe ? (
        <>
          <motion.span
            aria-hidden
            animate={{ opacity: playing ? 0 : 1 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="flex size-7 items-center justify-center rounded-full border border-hairline-strong bg-surface-1/90 text-ink shadow-raised">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="size-3.5 shrink-0 translate-x-px fill-current stroke-none"
              >
                <path d="M8.5 5.8 18 12l-9.5 6.2z" />
              </svg>
            </span>
          </motion.span>

          <motion.span
            aria-hidden
            style={{ scaleX: progress }}
            className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
          />
        </>
      ) : (
        <span className="absolute top-2 left-2 rounded-full border border-hairline-strong bg-surface-1/90 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Preview
        </span>
      )}
    </div>
  );

  const caption = (
    <span className="block min-w-0 truncate text-xs font-medium text-foreground">
      {title}
    </span>
  );

  // Under reduced motion there is nothing to operate: no playback, so no
  // control — a still with a caption rather than a button that does nothing.
  if (!motionSafe) {
    return (
      <figure className={cn("flex w-full flex-col gap-2", className)}>
        {art}
        <figcaption className="min-w-0">{caption}</figcaption>
      </figure>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={pinned}
      title={title}
      onClick={() => setPinned((was) => !was)}
      onPointerEnter={(event) => {
        // Touch synthesises an enter on tap; hover is a mouse idea only.
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerCancel={() => setHovered(false)}
      onFocus={(event) => {
        // A pointer press focuses the button too; only a keyboard arrival
        // should start a pass, or the card would keep playing after a click.
        if (event.currentTarget.matches(":focus-visible")) setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-2 rounded-3 text-left outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {art}
      <span className="flex min-w-0 items-center gap-1.5">
        {caption}
        {pinned ? (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-signal"
          />
        ) : null}
      </span>
    </button>
  );
}
