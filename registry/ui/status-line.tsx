"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StatusExpiry = {
  /** Already formatted remainder, printed and spoken ("45 min"). */
  label: string;
  /** What is left, in the caller's own unit. */
  remaining: number;
  /** What it started at; the ring is remaining over total. */
  total: number;
};

export type StatusLineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The person the status belongs to. */
  name: string;
  /** A quiet second line under the name ("Dispatch"). */
  roleLabel?: string;
  /** The custom line. A new value types itself; null wipes the old one away. */
  status?: string | null;
  /** Ring plus printed remainder; omit it for a status that does not expire. */
  expiry?: StatusExpiry;
  /** Milliseconds per character while typing. @default 26 */
  typeSpeed?: number;
  /** Copy for the clear control. @default "Clear" */
  clearLabel?: string;
  /** Fires from the Clear control and from Escape; set `status` to null here. */
  onClear?: () => void;
  /** Fires once when the line finishes typing. */
  onSettle?: (text: string) => void;
  /** Fires from an effect when `expiry.remaining` reaches zero. */
  onExpire?: () => void;
  className?: string;
};

const round3 = (value: number): number => Number(value.toFixed(3));

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/**
 * One line of custom status under a name. A new value types itself out from an
 * effect with cleanup that holds where it stands while the tab is hidden, with a
 * caret blinking beside the last character until the line settles; the initial
 * status renders whole, so the first client render matches the markup the server
 * sent. Clearing does not fade — the line is wiped away left to right by an
 * animated `clipPath` on the exit ease, and because the outgoing node keeps the
 * text it last drew, the wipe erases the real sentence rather than an empty box.
 *
 * Beside it an expiry ring drains: its `strokeDashoffset` is the remaining
 * fraction, rounded before it reaches the attribute, gliding between the values
 * the parent reports, with the remainder printed as a formatted string that
 * comes from props and never from a clock. Emptying reports `onExpire` from an
 * effect. The block's height is measured by a ResizeObserver bound to the
 * content when it arrives, so no status reserves no room. Reduced motion draws
 * the line whole with no caret and fades it out instead of wiping, and the ring
 * still drains, because a countdown is information.
 */
export function StatusLine({
  ref,
  name,
  roleLabel,
  status = null,
  expiry,
  typeSpeed = 26,
  clearLabel = "Clear",
  onClear,
  onSettle,
  onExpire,
  className,
}: StatusLineProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const target = status ?? "";

  // The initial status is already whole: typing plays on changes after mount,
  // which is also what keeps hydration honest.
  const [typed, setTyped] = React.useState(() => ({
    source: target,
    shown: target.length,
    stamp: 0,
  }));
  if (typed.source !== target) {
    setTyped({
      source: target,
      shown: motionSafe ? 0 : target.length,
      stamp: typed.stamp + 1,
    });
  }

  const typing = typed.shown < typed.source.length;
  React.useEffect(() => {
    if (!typing || !visible) return;
    const timer = window.setTimeout(
      () =>
        setTyped((prev) =>
          prev.shown < prev.source.length
            ? { ...prev, shown: prev.shown + 1 }
            : prev,
        ),
      Math.max(4, typeSpeed),
    );
    return () => window.clearTimeout(timer);
  }, [typing, visible, typeSpeed, typed.shown, typed.stamp]);

  const settleRef = useLatest(onSettle);
  const settledStamp = React.useRef(typed.stamp);
  React.useEffect(() => {
    if (typing || !typed.source) return;
    if (settledStamp.current === typed.stamp) return;
    settledStamp.current = typed.stamp;
    settleRef.current?.(typed.source);
  }, [typing, typed.source, typed.stamp, settleRef]);

  const expireRef = useLatest(onExpire);
  const expired = expiry !== undefined && expiry.remaining <= 0;
  const wasExpired = React.useRef(expired);
  React.useEffect(() => {
    if (expired && !wasExpired.current) {
      wasExpired.current = true;
      expireRef.current?.();
    } else if (!expired) {
      wasExpired.current = false;
    }
  }, [expired, expireRef]);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fraction =
    expiry && expiry.total > 0
      ? Math.min(1, Math.max(0, expiry.remaining / expiry.total))
      : 0;
  const drained = round3(1 - fraction);

  // Derived, not stored: the sentence changes exactly when the line settles or
  // is wiped, so the region speaks once per change and never per character.
  const spoken = typed.source
    ? typing
      ? ""
      : `Status set: ${typed.source}`
    : typed.stamp > 0
      ? "Status cleared"
      : "";

  return (
    <div
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === "Escape" && typed.source) onClear?.();
      }}
      className={cn("w-full", className)}
    >
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="flex flex-col gap-2 p-1">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2 text-xs font-semibold text-ink-2"
            >
              {initialsOf(name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">
                {name}
              </span>
              {roleLabel ? (
                <span className="truncate text-xs text-ink-3">{roleLabel}</span>
              ) : null}
            </span>
          </div>

          <AnimatePresence initial={false}>
            {typed.source ? (
              <motion.div
                // One key for the whole life of a status: setting a new one
                // retypes in place, and only clearing lets the node exit, which
                // is what gives the wipe the text it last drew.
                key="line"
                initial={false}
                animate={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
                exit={
                  motionSafe
                    ? {
                        clipPath: "inset(0% 0% 0% 100%)",
                        transition: {
                          duration: durations.base,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: exitFor(durations.fast) }
                }
                className="flex items-center gap-2 rounded-2 bg-surface-1 py-1.5 pr-1.5 pl-2"
              >
                <p className="min-w-0 flex-1 text-sm leading-snug text-ink-2">
                  {typed.source.slice(0, typed.shown)}
                  {motionSafe && typing ? (
                    <motion.span
                      aria-hidden
                      className="ml-0.5 inline-block w-px translate-y-0.5 bg-cobalt-bright"
                      style={{ height: "1em" }}
                      animate={{ opacity: [1, 0.15] }}
                      transition={{
                        duration: 0.5,
                        ease: easings.linear,
                        repeat: Infinity,
                        repeatType: "mirror",
                      }}
                    />
                  ) : null}
                </p>

                {expiry ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span
                      role="img"
                      aria-label={`Expires in ${expiry.label}`}
                      className="grid size-4 place-items-center text-cobalt-bright"
                    >
                      <svg viewBox="0 0 16 16" aria-hidden className="size-4">
                        <circle
                          cx="8"
                          cy="8"
                          r="6"
                          fill="none"
                          stroke="currentColor"
                          strokeOpacity="0.25"
                          strokeWidth="2.4"
                        />
                        <motion.circle
                          cx="8"
                          cy="8"
                          r="6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          pathLength={1}
                          strokeDasharray="1 1"
                          transform="rotate(-90 8 8)"
                          initial={false}
                          animate={{ strokeDashoffset: drained }}
                          transition={
                            motionSafe
                              ? springs.glide
                              : { duration: durations.base, ease: easings.move }
                          }
                        />
                      </svg>
                    </span>
                    <span
                      aria-hidden
                      className="font-mono text-[11px] text-ink-3 tabular-nums"
                    >
                      {expiry.label}
                    </span>
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => onClear?.()}
                  aria-label={`${clearLabel} status for ${name}`}
                  className="flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {clearLabel}
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
