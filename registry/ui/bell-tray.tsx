"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  safe,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BellTrayItem = {
  id: string;
  title: string;
  /** Short relative stamp, e.g. "2m". */
  time: string;
  unread: boolean;
};

export type BellTrayProps = {
  items: BellTrayItem[];
  /** Fires with the ids that just became read — one id, or all of them. */
  onRead?: (ids: string[]) => void;
  /** Fires when an item is dismissed; remove it from `items` to collapse it. */
  onDismiss?: (id: string) => void;
  /** Controlled tray state. */
  open?: boolean;
  /** Initial tray state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

const BELL =
  "M8 2.4a4 4 0 0 0-4 4v2.3L2.9 11h10.2L12 8.7V6.4a4 4 0 0 0-4-4Zm0 12.2a2 2 0 0 0 1.9-1.4H6.1A2 2 0 0 0 8 14.6Z";

/** The swing's starting angle. Recoil (ζ0.53) carries it back through zero
 *  twice, which is what makes it read as a struck bell rather than a tilt. */
const SWING_DEGREES = -14;

/**
 * The bell rings; the tray drops. An arriving notification swings the bell on
 * `recoil` — rotated about its crown, so it pivots where a bell hangs — and
 * bumps the badge with the same spring. Opening drops the tray on `glide` with
 * its items cascading in under the 600ms budget, marking all read sweeps the
 * unread dots out one after another, and dismissing an item collapses its row on
 * the exit ease so the rest close the gap.
 *
 * The bell is a button with `aria-expanded` and the tray a labelled region, so
 * it reads as the disclosure it is: Tab moves into the tray, Up and Down walk
 * the items, Escape closes and returns focus to the bell. Under reduced motion
 * nothing swings or travels — the badge and the dots still update, because a
 * count is information.
 *
 * The tray is absolutely positioned under the bell, so give the bar it sits in
 * `relative`.
 */
export function BellTray({
  items,
  onRead,
  onDismiss,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
}: BellTrayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const trayId = `${uid}-tray`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const bellRef = React.useRef<HTMLButtonElement | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  // Null until the first effect: a tray that mounts with items has not just
  // received them, so nothing rings on load.
  const known = React.useRef<Set<string> | null>(null);

  const rotate = useMotionValue(0);
  const badgeScale = useMotionValue(1);

  const unread = items.filter((item) => item.unread);
  const stagger = cascade(items.length);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    const ids = items.map((item) => item.id);
    const seen = known.current;
    known.current = new Set(ids);
    if (!seen) return;
    if (!motionSafe || !ids.some((id) => !seen.has(id))) return;
    rotate.set(SWING_DEGREES);
    badgeScale.set(1.3);
    const controls = [
      animate(rotate, 0, springs.recoil),
      animate(badgeScale, 1, springs.recoil),
    ];
    return () => controls.forEach((control) => control.stop());
  }, [items, motionSafe, rotate, badgeScale]);

  // A click outside is a dismissal, not a selection, so it only ever closes.
  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target;
      if (!root || (target instanceof Node && root.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen, setOpen]);

  const closeToBell = () => {
    setOpen(false);
    bellRef.current?.focus({ preventScroll: true });
  };

  const stepFocus = (from: number, delta: number) => {
    const next = Math.min(items.length - 1, Math.max(0, from + delta));
    itemRefs.current[next]?.focus();
  };

  const dismiss = (item: BellTrayItem) => {
    if (item.unread) onRead?.([item.id]);
    onDismiss?.(item.id);
  };

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          closeToBell();
        }
      }}
    >
      <button
        ref={bellRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={trayId}
        aria-label={`Notifications, ${unread.length} unread`}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-2 border border-hairline-strong transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          isOpen && "bg-accent",
        )}
      >
        <motion.span
          aria-hidden
          style={{ rotate }}
          className="flex origin-top items-center justify-center"
        >
          <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
            <path d={BELL} fill="currentColor" />
          </svg>
        </motion.span>

        {unread.length > 0 ? (
          <motion.span
            aria-hidden
            style={{ scale: badgeScale }}
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] leading-none text-destructive-foreground tabular-nums"
          >
            {unread.length}
          </motion.span>
        ) : null}
      </button>

      <span role="status" className="sr-only">
        {unread.length} unread
      </span>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            id={trayId}
            role="region"
            aria-label="Notifications"
            initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: motionSafe ? -distances.nudge : 0,
              transition: exitFor(),
            }}
            transition={safe(springs.glide)(motionSafe)}
            className="absolute top-full right-0 z-30 mt-2 w-[17rem] overflow-hidden rounded-3 border border-hairline-strong bg-popover text-popover-foreground shadow-raised"
          >
            <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Notifications
              </span>
              <button
                type="button"
                disabled={unread.length === 0}
                onClick={() => onRead?.(unread.map((item) => item.id))}
                className="rounded-1 text-[11px] font-medium text-cobalt-bright transition-colors outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:no-underline disabled:opacity-40"
              >
                Mark all read
              </button>
            </div>

            <ul className="max-h-36 overflow-y-auto">
              <AnimatePresence>
                {items.map((item, index) => (
                  <motion.li
                    key={item.id}
                    className="overflow-hidden border-b border-hairline last:border-b-0"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? distances.step : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      height: 0,
                      transition: exitFor(),
                    }}
                    transition={{
                      ...safe(springs.glide)(motionSafe),
                      delay: index * stagger,
                    }}
                  >
                    <button
                      ref={(node) => {
                        itemRefs.current[index] = node;
                      }}
                      type="button"
                      aria-label={`${item.title}, ${item.time}${
                        item.unread ? ", unread" : ""
                      }. Dismiss`}
                      onClick={() => dismiss(item)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          stepFocus(index, 1);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          stepFocus(index, -1);
                        }
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {/* The dot keeps its slot whether it is lit or swept, so
                          marking all read never shifts a title. */}
                      <span className="grid size-1.5 shrink-0 place-items-center">
                        <motion.span
                          className="col-start-1 row-start-1 size-1.5 rounded-full bg-cobalt-bright"
                          initial={false}
                          animate={{
                            opacity: item.unread ? 1 : 0,
                            scale: motionSafe && !item.unread ? 0 : 1,
                          }}
                          transition={{
                            ...(motionSafe
                              ? springs.flick
                              : { duration: durations.fast }),
                            delay: item.unread ? 0 : index * stagger,
                          }}
                        />
                      </span>
                      <span
                        title={item.title}
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13px]",
                          item.unread ? "font-medium" : "text-ink-2",
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                        {item.time}
                      </span>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            {items.length === 0 ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="px-3 py-6 text-center text-xs text-ink-3"
              >
                Nothing new.
              </motion.p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
