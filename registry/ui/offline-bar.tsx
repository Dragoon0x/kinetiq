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

export type OfflineBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled connection state; omit to follow the browser. */
  online?: boolean;
  /** Seconds between automatic retries. @default 10 */
  retryIn?: number;
  /** Runs on every retry, automatic or pressed. Resolving true means connected. */
  onRetry?: () => Promise<boolean> | boolean;
  /** Copy while the connection is down. @default "No connection" */
  offlineLabel?: string;
  /** Copy for the beat after it returns. @default "Back online" */
  onlineLabel?: string;
  className?: string;
};

/** How long "Back online" stays before the bar lifts away. */
const BEAT = 1800;

const subscribeToConnection = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

const readConnection = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

/**
 * A prerender has no connection to read, and the first client render must
 * produce the markup the server actually sent — a page that arrived at all was
 * online. React re-renders with the true reading once hydration lands.
 */
const readServerConnection = () => true;

/**
 * A connection banner that keeps its own time. Going offline drops the bar in
 * from `distances.shift` on `glide` — a surface arriving, not a switch flipping
 * — in warn, with a ring counting the seconds down to the next check. Retry now
 * runs the check immediately. When the connection returns the bar turns
 * success, says so, and lifts away on the exit ease after a beat: a
 * reconnection is a relief, not a celebration, so nothing bounces.
 *
 * It follows the browser's own online and offline events through
 * `useSyncExternalStore`, so the value is read in a subscription rather than
 * during render and a prerender cannot disagree with the first paint. Products
 * with their own health check pass `online` instead and drive it themselves.
 *
 * The bar lives inside a permanent `role="status"`, so a change is announced
 * rather than a region appearing with text already in it, and the ticking
 * seconds are hidden from it — a live region that re-reads itself every second
 * is unusable. Under reduced motion the bar fades instead of dropping and the
 * ring steps between seconds, since a countdown is information.
 */
export function OfflineBar({
  ref,
  online,
  retryIn = 10,
  onRetry,
  offlineLabel = "No connection",
  onlineLabel = "Back online",
  className,
}: OfflineBarProps) {
  const motionSafe = useMotionSafe();
  const period = Math.max(1, Math.round(retryIn));

  const browserOnline = React.useSyncExternalStore(
    subscribeToConnection,
    readConnection,
    readServerConnection,
  );
  const source = online ?? browserOnline;

  const [trusted, setTrusted] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [remaining, setRemaining] = React.useState(period);

  // A successful check counts as connected for hosts whose truth is their own
  // health endpoint rather than the browser's flag.
  const connected = source || trusted;

  // Both adjustments happen while rendering rather than in an effect: the bar
  // reacts to a value it does not own, and an effect would paint one stale
  // frame of the wrong colour before correcting itself.
  const [seenSource, setSeenSource] = React.useState(source);
  if (seenSource !== source) {
    setSeenSource(source);
    // The source of truth saying offline outvotes a stale successful check.
    if (!source) setTrusted(false);
  }

  const [seenConnected, setSeenConnected] = React.useState(connected);
  if (seenConnected !== connected) {
    setSeenConnected(connected);
    setRestored(connected);
    setChecking(false);
    setRemaining(period);
  }

  const retryRef = React.useRef(onRetry);
  React.useEffect(() => {
    retryRef.current = onRetry;
  }, [onRetry]);

  const check = React.useCallback(() => {
    setChecking(true);
    // The callback is invoked from the press or the tick that caused it, never
    // from inside a state updater.
    const outcome = retryRef.current?.();
    Promise.resolve(outcome ?? false).then(
      (ok) => {
        setChecking(false);
        setRemaining(period);
        if (ok) setTrusted(true);
      },
      () => {
        setChecking(false);
        setRemaining(period);
      },
    );
  }, [period]);

  // One timeout per second rather than an interval: the schedule is derived
  // from the second on screen, so a pause for a check cannot leave a tick
  // running behind it.
  React.useEffect(() => {
    if (connected || checking) return;
    const id = window.setTimeout(() => {
      if (remaining <= 1) check();
      else setRemaining(remaining - 1);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [connected, checking, remaining, check]);

  React.useEffect(() => {
    if (!restored) return;
    const id = window.setTimeout(() => setRestored(false), BEAT);
    return () => window.clearTimeout(id);
  }, [restored]);

  const visible = !connected || restored;
  const headline = restored
    ? onlineLabel
    : checking
      ? "Checking the connection"
      : offlineLabel;
  const detail = checking ? "checking now" : `retrying in ${remaining}s`;
  const swept = 1 - Math.min(1, Math.max(0, remaining / period));

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={cn("w-full", className)}
    >
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            key="bar"
            className={cn(
              "flex w-full items-center gap-2 rounded-2 border px-3 py-2 transition-colors",
              restored
                ? "border-success/50 bg-success/15 text-success"
                : "border-warn/50 bg-warn/15 text-warn",
            )}
            initial={
              motionSafe
                ? { y: -distances.shift, opacity: 0 }
                : { y: 0, opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            exit={{
              opacity: 0,
              y: motionSafe ? -distances.shift : 0,
              transition: exitFor(),
            }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.fast, ease: easings.enter }
            }
          >
            {restored ? (
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" />
              </svg>
            ) : (
              <motion.span
                aria-hidden
                className="flex size-4 shrink-0 items-center justify-center"
                // The spinner is the only honest way to show a check with no
                // known duration; under reduced motion the words carry it.
                animate={
                  motionSafe && checking ? { rotate: 360 } : { rotate: 0 }
                }
                transition={
                  motionSafe && checking
                    ? {
                        duration: durations.page,
                        ease: easings.linear,
                        repeat: Infinity,
                      }
                    : { duration: 0 }
                }
              >
                <svg viewBox="0 0 16 16" className="size-4 -rotate-90">
                  <circle
                    cx="8"
                    cy="8"
                    r="6.5"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="2"
                  />
                  <motion.circle
                    cx="8"
                    cy="8"
                    r="6.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="1 1"
                    initial={false}
                    animate={{ strokeDashoffset: checking ? 0.7 : swept }}
                    transition={
                      motionSafe && !checking
                        ? { duration: 1, ease: easings.linear }
                        : { duration: 0 }
                    }
                  />
                </svg>
              </motion.span>
            )}

            <span className="min-w-0 flex-1 truncate text-xs">
              <span className="font-medium">{headline}</span>
              {restored ? null : (
                // Hidden from the live region: a countdown that re-announced
                // itself every second would talk over everything else.
                <span aria-hidden className="opacity-70">
                  {" · "}
                  {detail}
                </span>
              )}
            </span>

            {restored ? null : (
              <button
                type="button"
                onClick={check}
                disabled={checking}
                className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              >
                Retry now
              </button>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
