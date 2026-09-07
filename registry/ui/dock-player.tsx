"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DockPlayerState = "inline" | "docked" | "closed";

export type DockPlayerProps = {
  /** The scrolling element whose viewport decides when the card docks. */
  container: React.RefObject<HTMLElement | null>;
  /** Card title, also the accessible name of the return control. */
  title: string;
  /** Corner the card docks into. */
  corner?: "bottom-right" | "bottom-left";
  /** The media surface; it is stretched to fill the card's picture area. */
  children: React.ReactNode;
  /** Fires when the card moves between inline, docked and closed. */
  onStateChange?: (state: DockPlayerState) => void;
  className?: string;
};

/** Length of the synthetic clip, in seconds. */
const CLIP = 72;
/** Below this much of the seat on screen, the card leaves for the corner. */
const DOCK_AT = 0.4;
/** Gap between the docked card and the scrollport's bottom edge, in px. */
const DOCK_GAP = 12;

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/**
 * Scroll past it; it docks in the corner. An IntersectionObserver watches the
 * seat against the scroller, and once less than 40% of it is on screen the card
 * hands itself to a sticky rail pinned to the corner. One `layoutId` spans both
 * places, so the card travels and shrinks on `glide` — a layout shift, damped
 * almost to critical, no bounce — rather than one card vanishing while another
 * blinks in. The seat keeps the card's exact shape, so nothing under it moves.
 *
 * Play, progress and close ride along; the docked picture is itself a button
 * that scrolls the seat back into view, so the return trip has a keyboard path.
 * Close dismisses the card until the seat's own button brings it back. Under
 * reduced motion the two positions cross-fade instead of travelling, and the
 * timecode and progress keep running, because playback state is information.
 */
export function DockPlayer({
  container,
  title,
  corner = "bottom-right",
  children,
  onStateChange,
  className,
}: DockPlayerProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const cardId = `${baseId}-card`;

  const slotRef = React.useRef<HTMLDivElement | null>(null);
  const [railTop, setRailTop] = React.useState(0);
  const [docked, setDocked] = React.useState(false);
  const [closed, setClosed] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  const state: DockPlayerState = closed
    ? "closed"
    : docked
      ? "docked"
      : "inline";

  React.useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // The observer's own first callback supplies the opening measurement, so the
  // effect body never sets state and the first paint is never a guess.
  React.useEffect(() => {
    const seat = slotRef.current;
    const root = container.current;
    if (!seat || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setDocked(entry.intersectionRatio < DOCK_AT);
      },
      { root, threshold: [0, DOCK_AT, 1] },
    );
    observer.observe(seat);
    return () => observer.disconnect();
  }, [container]);

  // The rail is stuck by `top`, which pushes down; `bottom` only ever pulls a
  // box up, so it would leave the rail stranded at the head of the article.
  // The offset is therefore the scrollport's own height, measured live.
  React.useEffect(() => {
    const root = container.current;
    if (!root) return;
    const observer = new ResizeObserver(() => {
      setRailTop(Math.max(0, root.clientHeight - DOCK_GAP));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [container]);

  // The clip only ticks while it is playing, so nothing starts a timer on mount.
  React.useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => (value + 0.25 >= CLIP ? 0 : value + 0.25));
    }, 250);
    return () => window.clearInterval(timer);
  }, [playing]);

  const returnHome = () => {
    const seat = slotRef.current;
    const root = container.current;
    if (!seat || !root) return;
    const seatRect = seat.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    root.scrollBy({
      top:
        seatRect.top - rootRect.top - (rootRect.height - seatRect.height) / 2,
      behavior: motionSafe ? "smooth" : "auto",
    });
  };

  const progress = Math.min(100, (elapsed / CLIP) * 100);

  const iconButton = cn(
    "flex size-7 shrink-0 items-center justify-center rounded-full outline-none transition-colors",
    "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
  );

  const card = (place: "inline" | "dock") => (
    <motion.div
      key={place}
      layoutId={motionSafe ? cardId : undefined}
      initial={motionSafe ? false : { opacity: 0 }}
      animate={motionSafe ? undefined : { opacity: 1 }}
      exit={
        motionSafe
          ? undefined
          : { opacity: 0, transition: exitFor(durations.fast) }
      }
      transition={motionSafe ? springs.glide : { duration: durations.fast }}
      className={cn(
        "flex flex-col overflow-hidden rounded-3 border border-hairline-strong bg-card shadow-lg",
        place === "inline"
          ? "absolute inset-0"
          : "pointer-events-auto w-40 max-w-full",
      )}
    >
      <motion.div
        layout={motionSafe ? "position" : false}
        className={cn(
          "relative overflow-hidden bg-surface-2",
          place === "inline" ? "min-h-0 flex-1" : "aspect-video w-full",
        )}
      >
        <div className="absolute inset-0">{children}</div>
        <span className="absolute right-1 bottom-1 rounded-1 bg-background/75 px-1 font-mono text-[10px] text-ink tabular-nums">
          {clock(elapsed)}
        </span>
        {place === "dock" ? (
          <button
            type="button"
            onClick={returnHome}
            aria-label={`Return ${title} to the article`}
            className={cn(
              "absolute inset-0 cursor-pointer outline-none",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            )}
          />
        ) : null}
      </motion.div>

      <motion.div
        layout={motionSafe ? "position" : false}
        className="flex h-11 shrink-0 items-center gap-2 px-2"
      >
        <motion.button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          whileTap={motionSafe ? { scale: 0.9 } : undefined}
          transition={springs.flick}
          className={cn(
            iconButton,
            "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="size-3 shrink-0"
            fill="currentColor"
          >
            {playing ? (
              <path d="M4.5 3h2.25v10H4.5zM9.25 3h2.25v10H9.25z" />
            ) : (
              <path d="M5 3.25 12.5 8 5 12.75z" />
            )}
          </svg>
        </motion.button>

        <div className="min-w-0 flex-1">
          <p title={title} className="truncate text-[11px] font-medium">
            {title}
          </p>
          <div
            role="progressbar"
            aria-label={`${title} progress`}
            aria-valuemin={0}
            aria-valuemax={CLIP}
            aria-valuenow={Math.floor(elapsed)}
            aria-valuetext={`${clock(elapsed)} of ${clock(CLIP)}`}
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-hairline-strong"
          >
            <div
              className="h-full rounded-full bg-cobalt-bright"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setClosed(true)}
          aria-label={`Close ${title}`}
          className={cn(
            iconButton,
            "text-ink-2 hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="m4.5 4.5 7 7" />
            <path d="m11.5 4.5-7 7" />
          </svg>
        </button>
      </motion.div>
    </motion.div>
  );

  return (
    // A fragment, not a wrapper: the sticky rail below must be a sibling in the
    // article's own flow, so its containing block is the whole scrolled column.
    <>
      <div ref={slotRef} className={cn("relative w-full", className)}>
        {/* The seat holds the card's exact shape — picture plus control row — so
            the article never reflows when the card leaves for the corner. */}
        <div className="flex flex-col overflow-hidden rounded-3 border border-dashed border-hairline">
          <div className="aspect-video w-full" />
          <div className="h-11" />
        </div>

        {closed ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setClosed(false)}
              className={cn(
                "flex h-8 items-center rounded-2 border border-hairline-strong bg-card px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              Show player
            </button>
          </div>
        ) : null}

        {docked && !closed ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-ink-3">
            Playing in the corner
          </p>
        ) : null}

        <AnimatePresence initial={false}>
          {!closed && !docked ? card("inline") : null}
        </AnimatePresence>
      </div>

      {/* A zero-height sticky rail: pinned to the bottom of the scrollport for
          the whole scroll, so the docked card rides the viewport without being
          fixed to the browser window. */}
      <div
        style={{ top: railTop }}
        className="pointer-events-none sticky z-20 h-0"
      >
        <div
          className={cn(
            "absolute bottom-0",
            corner === "bottom-right" ? "right-0" : "left-0",
          )}
        >
          <AnimatePresence initial={false}>
            {!closed && docked ? card("dock") : null}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
