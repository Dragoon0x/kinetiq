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

export type LiveRow = {
  /** Stable across re-renders — the row travels on this, it never remounts. */
  id: string;
  content: React.ReactNode;
};

export type LiveRowsProps = {
  /** Rows, newest first. */
  items: LiveRow[];
  /** Rows kept on screen. @default 6 */
  max?: number;
  /** Holds the list: arrivals wait, removals still land. */
  paused?: boolean;
  /** Names the feed and titles its header. @default "Feed" */
  label?: string;
  /** Read while there is nothing in the feed. @default "Nothing yet." */
  emptyLabel?: string;
  /** Fires when a pointer or a focus enters and leaves the list. */
  onHoldChange?: (held: boolean) => void;
  className?: string;
};

/**
 * A live feed that keeps its feet. A row arrives from a `step` above and glides
 * the rest of the list down — `layout` on `glide`, so the rows below travel
 * rather than jumping — while a cobalt wash drains off the new row over the
 * longest tween in the set, cool by the time the next row lands. Rows pushed
 * past `max` fade and collapse on the exit ease; nothing springs on the way out.
 *
 * The list holds while a pointer is over it or the keyboard is inside it, which
 * is the whole point of a feed a person is actually reading: arrivals queue in
 * `items` and land together on release, and removals still land immediately so a
 * host that clears the feed is never argued with. `paused` holds it the same way
 * from outside.
 *
 * The frame is a polite log region, so additions are announced once and the
 * header states plainly whether the feed is live or held. Under reduced motion
 * rows appear and vanish on opacity alone — the arrivals are the information,
 * so they are never animated away.
 */
export function LiveRows({
  items,
  max = 6,
  paused = false,
  label = "Feed",
  emptyLabel = "Nothing yet.",
  onHoldChange,
  className,
}: LiveRowsProps) {
  const motionSafe = useMotionSafe();
  const [pointerIn, setPointerIn] = React.useState(false);
  const [focusIn, setFocusIn] = React.useState(false);

  // The rows as of the moment the hold began. Captured at commit (see
  // `holdMarker`), never during render and never from inside an effect body.
  const [frozen, setFrozen] = React.useState<LiveRow[] | null>(() =>
    paused ? items.slice(0, max) : null,
  );
  const shownRef = React.useRef<LiveRow[]>([]);

  const held = paused || pointerIn || focusIn;
  const live = items.slice(0, max);

  // A held list still honours removals: freezing arrivals is a courtesy to the
  // reader, but showing rows the host has already dropped would be a lie.
  const liveIds = new Set(items.map((item) => item.id));
  const rows = frozen
    ? frozen.filter((row) => liveIds.has(row.id)).slice(0, max)
    : live;

  // Rows already on screen at mount are not arrivals — they get no wash.
  const [seeded] = React.useState(
    () => new Set(items.slice(0, max).map((item) => item.id)),
  );

  React.useEffect(() => {
    if (!held) shownRef.current = live;
  });

  /**
   * Mounting this marker is the capture point. A ref callback runs during
   * commit, which is the one place a snapshot of what is on screen can be taken
   * without setting state during render or synchronously inside an effect.
   */
  const holdMarker = React.useCallback((node: HTMLSpanElement | null) => {
    if (!node) setFrozen(null);
    else if (shownRef.current.length > 0) setFrozen(shownRef.current);
  }, []);

  // Reports the pointer/focus hold only. `paused` is the host's own state, so
  // echoing it back would just tell the host what it already said — and would
  // leave the flag stale if the pointer left while the feed was paused.
  const report = (next: boolean) => onHoldChange?.(next);

  const rowTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };

  return (
    <div
      onPointerEnter={() => {
        setPointerIn(true);
        report(true);
      }}
      onPointerLeave={() => {
        setPointerIn(false);
        report(focusIn);
      }}
      onFocus={() => {
        setFocusIn(true);
        report(true);
      }}
      onBlur={() => {
        setFocusIn(false);
        report(pointerIn);
      }}
      className={cn(
        "w-full overflow-hidden rounded-3 border bg-surface-1 transition-colors",
        held ? "border-hairline-strong" : "border-hairline",
        className,
      )}
    >
      {held ? <span hidden aria-hidden ref={holdMarker} /> : null}

      <div className="flex h-8 items-center justify-between gap-2 border-b border-hairline px-3">
        <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full transition-colors",
              held ? "bg-ink-3" : "bg-signal",
            )}
          />
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            {held ? "Held" : "Live"}
          </span>
        </span>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={label}
      >
        <ul className="[&>li:last-child>div]:border-b-0">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.li
                key={row.id}
                layout={motionSafe ? "position" : false}
                initial={
                  motionSafe
                    ? { opacity: 0, y: -distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={
                  motionSafe
                    ? { opacity: 0, height: 0, transition: exitFor() }
                    : {
                        opacity: 0,
                        transition: { duration: durations.blink },
                      }
                }
                transition={rowTransition}
                // The collapse needs a clipping box of its own, and the wash
                // has to stop at the row's edge.
                className="relative overflow-hidden"
              >
                <div className="relative border-b border-hairline px-3 py-2">
                  {seeded.has(row.id) ? null : (
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-cobalt-wash"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{
                        duration: durations.page,
                        ease: easings.exit,
                      }}
                    />
                  )}
                  <div className="relative min-w-0">{row.content}</div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-3">
            {emptyLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}
