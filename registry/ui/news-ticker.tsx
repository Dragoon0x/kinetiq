"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TickerTone = "up" | "down" | "flat";

export type TickerHeadline = {
  id: string;
  text: string;
  source: string;
  /** Already formatted. */
  time: string;
  tone?: TickerTone;
};

export type NewsTickerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** In arrival order; a new id pushes in at the right edge. */
  headlines: TickerHeadline[];
  /** Controlled play state. Off, the tape eases to a stop. */
  playing?: boolean;
  /** Initial play state for uncontrolled usage. @default true */
  defaultPlaying?: boolean;
  /** Fires from the tape's own Pause/Play toggle. */
  onPlayingChange?: (playing: boolean) => void;
  /** Cruising speed in px/s. @default 40 */
  speed?: number;
  /** Fires from the press on a headline. */
  onSelect?: (id: string) => void;
  /** Fires from the hover, focus or play change that paused or resumed the tape. */
  onPauseChange?: (paused: boolean) => void;
  /** Names the region. @default "Headlines" */
  label?: string;
  className?: string;
};

/** Pixels between headlines, and between one copy of the ring and the next. */
const GAP = 12;
/** Where a focused headline glides to, from the left edge. */
const MARGIN = 12;
/** Velocity eases toward its target over roughly three quarters of a second. */
const FRICTION_TAU = 0.25;
const EDGE_MASK =
  "linear-gradient(to right, transparent, black 8%, black 92%, transparent)";

const TONE_WORDS: Record<TickerTone, string> = {
  up: "up",
  down: "down",
  flat: "flat",
};

function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

function Caret({ tone }: { tone: TickerTone }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn(
        "size-2.5 shrink-0",
        tone === "up" && "text-success",
        tone === "down" && "rotate-180 text-danger",
        tone === "flat" && "text-ink-3",
      )}
    >
      {tone === "flat" ? (
        <path
          d="M2 6h8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <path d="M6 2.5 10 9H2Z" fill="currentColor" />
      )}
    </svg>
  );
}

/**
 * Headlines that pass, and pause. One frame loop integrates the tape's
 * velocity toward a target with exponential friction — `speed` while playing,
 * zero the moment a pointer is over it, a headline holds focus, or play is off
 * — so the tape eases to a stop rather than freezing, and eases back up when
 * the pointer leaves. The loop halts entirely while the document is hidden.
 *
 * Headlines are real buttons: focusing one pauses the tape and glides it into
 * view on `glide`, so the keyboard reads the same tape the pointer does. A new
 * headline is inserted into the ring after the item under the viewport's
 * right edge, arrives from `distances.shift` on `snap`, and a signal wash
 * flashes behind it. Everything already on screen is held still through the
 * insertion: the ring's ResizeObserver reads the width the new item added and
 * moves the tape by exactly that, so the only movement is the arrival.
 *
 * Only the first copy of the ring is in the accessibility tree; the loop
 * copies are inert. Under reduced motion there is no tape — the headlines
 * render as a wrapped row of chips, newest first, and a new one appears in
 * place with the same flash and the same polite announcement.
 */
export function NewsTicker({
  ref,
  headlines,
  playing,
  defaultPlaying = true,
  onPlayingChange,
  speed = 40,
  onSelect,
  onPauseChange,
  label = "Headlines",
  className,
}: NewsTickerProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolledPlaying, setUncontrolledPlaying] =
    React.useState(defaultPlaying);
  const isControlled = playing !== undefined;
  const isPlaying = isControlled ? playing : uncontrolledPlaying;
  const setPlaying = (next: boolean) => {
    if (!isControlled) setUncontrolledPlaying(next);
    onPlayingChange?.(next);
  };

  const byId = React.useMemo(
    () => new Map(headlines.map((headline) => [headline.id, headline])),
    [headlines],
  );
  const [order, setOrder] = React.useState(() =>
    headlines.map((headline) => headline.id),
  );
  const orderRef = useLatest(order);
  const [copies, setCopies] = React.useState(1);
  const [arriving, setArriving] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const ringRef = React.useRef<HTMLUListElement | null>(null);
  const x = useMotionValue(0);
  /** The tape's translate in px; copy A of the ring sits at exactly this offset. */
  const position = React.useRef(0);
  /** One ring width plus the gap that follows it — the wrap modulus. */
  const loopWidth = React.useRef(0);
  /** Which copy the last insertion landed in; the observer moves the tape by that many widths. */
  const pendingShift = React.useRef<number | null>(null);
  const velocity = React.useRef(0);
  const hovered = React.useRef(false);
  const focused = React.useRef(false);
  const playingRef = useLatest(isPlaying);
  const pausedRef = React.useRef<boolean | null>(null);
  const pauseChangeRef = useLatest(onPauseChange);
  const glide = React.useRef<ReturnType<typeof animate> | null>(null);
  const gliding = React.useRef(false);

  // The track is laid out from the leading copy, one ring width before copy A.
  // The position came through an exponential, so it is settled to three
  // decimals before it becomes a transform.
  const applyX = React.useCallback(() => {
    x.set(Number((position.current - loopWidth.current).toFixed(3)));
  }, [x]);

  const syncPaused = React.useCallback(() => {
    const paused = !playingRef.current || hovered.current || focused.current;
    if (paused === pausedRef.current) return;
    const first = pausedRef.current === null;
    pausedRef.current = paused;
    if (!first) pauseChangeRef.current?.(paused);
  }, [playingRef, pauseChangeRef]);

  React.useEffect(() => {
    syncPaused();
  }, [isPlaying, syncPaused]);

  // Ring and viewport widths are read in the observer, never in render. A
  // width change right after an insertion is the new item's width, and the
  // tape moves by that times the copy it landed in so nothing on screen jumps.
  React.useEffect(() => {
    const ring = ringRef.current;
    const viewport = viewportRef.current;
    if (!ring || !viewport || !motionSafe) return;
    const observer = new ResizeObserver(() => {
      const next = ring.offsetWidth + GAP;
      if (pendingShift.current !== null) {
        position.current -= pendingShift.current * (next - loopWidth.current);
        pendingShift.current = null;
      }
      loopWidth.current = next;
      setCopies(Math.ceil(viewport.clientWidth / Math.max(1, next)) + 1);
      applyX();
    });
    observer.observe(ring);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [motionSafe, applyX]);

  // New ids are spliced into the ring on the next frame, once the loop has a
  // current position to measure the right edge against.
  const known = React.useRef(new Set(headlines.map((headline) => headline.id)));
  React.useEffect(() => {
    const ids = new Set(headlines.map((headline) => headline.id));
    const fresh = headlines.filter(
      (headline) => !known.current.has(headline.id),
    );
    const stale = orderRef.current.some((id) => !ids.has(id));
    known.current = ids;
    if (fresh.length === 0 && !stale) return;
    const frame = requestAnimationFrame(() => {
      const kept = orderRef.current.filter((id) => ids.has(id));
      const ring = ringRef.current;
      const viewport = viewportRef.current;
      const width = loopWidth.current;
      let at = kept.length;
      if (ring && viewport && width > 0 && kept.length > 0) {
        const reach = viewport.clientWidth - position.current;
        const copy = Math.floor(reach / width);
        const edge = reach - copy * width;
        // Rects, not offsetLeft: both sides carry the same transform, so
        // their difference is the item's place in the ring however the
        // tape has moved and whatever the offset parent happens to be.
        const origin = ring.getBoundingClientRect().left;
        const under = Array.from(ring.children).findIndex((item) => {
          const rect = item.getBoundingClientRect();
          const left = rect.left - origin;
          return edge >= left && edge < left + rect.width + GAP;
        });
        if (under >= 0) {
          at = under + 1;
          pendingShift.current = copy;
        }
      }
      setOrder([
        ...kept.slice(0, at),
        ...fresh.map((h) => h.id),
        ...kept.slice(at),
      ]);
      const latest = fresh[fresh.length - 1];
      if (latest) {
        setArriving(latest.id);
        setAnnouncement(`New: ${latest.text}, ${latest.source}`);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [headlines, orderRef]);

  // The one frame loop. Friction is an exponential approach, so it is
  // framerate-independent; the wrap runs only while nothing holds focus, so
  // the copy that owns focus never jumps out from under it.
  React.useEffect(() => {
    if (!motionSafe) return;
    let frame = 0;
    let last = 0;
    let active = false;
    const step = (now: number) => {
      if (!active) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!gliding.current) {
        const target =
          playingRef.current && !hovered.current && !focused.current
            ? speed
            : 0;
        velocity.current +=
          (target - velocity.current) * (1 - Math.exp(-dt / FRICTION_TAU));
        if (target === 0 && Math.abs(velocity.current) < 0.2)
          velocity.current = 0;
        if (velocity.current !== 0) {
          position.current -= velocity.current * dt;
          const width = loopWidth.current;
          if (width > 0 && !focused.current) {
            position.current = ((position.current % width) - width) % width;
          }
          applyX();
        }
      }
      frame = requestAnimationFrame(step);
    };
    const start = () => {
      if (active || document.visibilityState === "hidden") return;
      active = true;
      last = 0;
      frame = requestAnimationFrame(step);
    };
    const stop = () => {
      active = false;
      cancelAnimationFrame(frame);
    };
    const onVisibility = () =>
      document.visibilityState === "hidden" ? stop() : start();
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      glide.current?.stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motionSafe, speed, playingRef, applyX]);

  // Glides copy A's headline into the viewport by the shortest way: the tape
  // may first be re-based by a whole ring width, which is invisible while the
  // loop copies cover both sides, and then travels the remainder on glide.
  const reveal = (index: number) => {
    const ring = ringRef.current;
    const viewport = viewportRef.current;
    const item = ring?.children[index] as HTMLElement | undefined;
    const width = loopWidth.current;
    if (!ring || !viewport || !item || width <= 0) return;
    const view = viewport.clientWidth;
    const rect = item.getBoundingClientRect();
    const start = rect.left - ring.getBoundingClientRect().left;
    const low = -start;
    const high = Math.max(low, view - start - rect.width);
    const ideal = Math.min(high, Math.max(low, MARGIN - start));
    let from = position.current;
    for (const shift of [-width, width]) {
      const candidate = position.current + shift;
      if (Math.abs(candidate - ideal) < Math.abs(from - ideal))
        from = candidate;
    }
    glide.current?.stop();
    gliding.current = false;
    velocity.current = 0;
    position.current = from;
    if (from >= low && from <= high) {
      applyX();
      return;
    }
    gliding.current = true;
    glide.current = animate(from, ideal, {
      ...springs.glide,
      onUpdate: (latest) => {
        position.current = latest;
        applyX();
      },
      onComplete: () => {
        gliding.current = false;
      },
    });
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  const renderHeadline = (
    headline: TickerHeadline,
    live: boolean,
    index: number,
  ) => (
    <motion.li
      key={headline.id}
      className={cn("relative shrink-0", !motionSafe && "max-w-full")}
      initial={
        arriving === headline.id
          ? motionSafe
            ? { x: distances.shift, opacity: 0 }
            : { opacity: 0 }
          : false
      }
      animate={{ x: 0, opacity: 1 }}
      transition={motionSafe ? { ...springs.snap, opacity: fade } : fade}
    >
      {arriving === headline.id ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-0.5 rounded-full bg-signal"
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 0 }}
          transition={{ duration: durations.slow, ease: easings.exit }}
          // The flash retires itself from its own completion, so no timer
          // has to be kept in step with the tween.
          onAnimationComplete={() => setArriving(null)}
        />
      ) : null}
      <button
        type="button"
        tabIndex={live ? undefined : -1}
        aria-label={`${headline.text}. ${headline.source}, ${headline.time}${
          headline.tone ? `, ${TONE_WORDS[headline.tone]}` : ""
        }`}
        onClick={() => onSelect?.(headline.id)}
        onFocus={live && motionSafe ? () => reveal(index) : undefined}
        className={cn(
          "relative flex items-center gap-2 rounded-full border border-hairline bg-surface-1 px-3 text-xs transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          // On the tape a headline is one unbroken line inside a clipped
          // viewport; as a chip in the reduced-motion row it wraps, so a long
          // one still fits 342px.
          motionSafe
            ? "h-8 whitespace-nowrap"
            : "max-w-full flex-wrap py-1.5 text-left",
        )}
      >
        {headline.tone ? <Caret tone={headline.tone} /> : null}
        <span className="text-foreground">{headline.text}</span>
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {headline.source} · {headline.time}
        </span>
      </button>
    </motion.li>
  );

  const ring = order
    .map((id) => byId.get(id))
    .filter((headline): headline is TickerHeadline => headline !== undefined);

  if (!motionSafe) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={label}
        className={cn("w-full", className)}
      >
        <ul role="list" className="flex flex-wrap gap-2">
          {[...headlines]
            .reverse()
            .map((headline, index) => renderHeadline(headline, true, index))}
        </ul>
        <span role="status" className="sr-only">
          {announcement}
        </span>
      </div>
    );
  }

  const renderCopy = (copy: number) => (
    <ul
      key={copy}
      ref={copy === 0 ? ringRef : undefined}
      role="list"
      aria-hidden={copy !== 0 || undefined}
      inert={copy !== 0 || undefined}
      className="flex shrink-0 items-center"
      style={{ gap: GAP }}
    >
      {ring.map((headline, index) =>
        renderHeadline(headline, copy === 0, index),
      )}
    </ul>
  );

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      className={cn("flex w-full items-center gap-2", className)}
    >
      {/* First in the tree so Tab reaches it before the tape; last on screen. */}
      <button
        type="button"
        aria-label="Pause tape"
        aria-pressed={!isPlaying}
        onClick={() => setPlaying(!isPlaying)}
        className="order-last inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-1 text-ink transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <svg viewBox="0 0 12 12" aria-hidden className="size-3">
          {isPlaying ? (
            <path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" />
          ) : (
            <path d="M3.5 2 10 6l-6.5 4z" fill="currentColor" />
          )}
        </svg>
      </button>

      <div
        ref={viewportRef}
        className="relative min-w-0 flex-1 overflow-clip py-1"
        style={{ maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}
        onPointerEnter={() => {
          hovered.current = true;
          syncPaused();
        }}
        onPointerLeave={() => {
          hovered.current = false;
          syncPaused();
        }}
        onFocus={() => {
          focused.current = true;
          syncPaused();
        }}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null))
            return;
          focused.current = false;
          syncPaused();
        }}
      >
        <motion.div
          className="flex w-max will-change-transform"
          style={{ x, gap: GAP }}
        >
          {Array.from({ length: copies + 2 }, (_, index) =>
            renderCopy(index - 1),
          )}
        </motion.div>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
