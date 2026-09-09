"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LimitRaiseStatus = "idle" | "requested" | "approved" | "declined";

export type LimitRaiseProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The current limit; the solid segment. Raise it when a request is approved. */
  limit: number;
  /** Balance already used; drawn inside the limit. */
  used: number;
  /** The most that can be asked for; the full track. @default limit * 2.5 */
  ceiling?: number;
  /** Amount per stepper press or arrow key; Page keys move five. @default 500 */
  step?: number;
  /** Controlled ask. */
  proposed?: number;
  /** Initial ask for uncontrolled usage; resets to `limit + step` when the limit changes. */
  defaultProposed?: number;
  /** Fires from the press or key that changed the ask. */
  onProposedChange?: (amount: number) => void;
  /** Where the request stands; the parent decides. @default "idle" */
  status?: LimitRaiseStatus;
  /** Fires from the Request button with the ask. */
  onRequest?: (amount: number) => void;
  /** Formats every amount the bar prints. */
  format?: (value: number) => string;
  /** Names the meter; printed above the bar. @default "Credit limit" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same number, which is a
 * hydration mismatch on the figure the reader came for.
 */
const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

/**
 * The hatch repeats every 11.3137px along a 135° gradient line, which is exactly
 * 16px of horizontal travel (11.3137 ÷ sin 135°) — so a sheet that slides 16px
 * lands on the identical pattern and the march has no seam. `currentColor` keeps
 * the ink on a token class, so danger is one class swap away.
 */
const HATCH_TRAVEL = 16;
const HATCH_IMAGE =
  "repeating-linear-gradient(135deg, currentColor 0 5.6568px, transparent 5.6568px 11.3137px)";

/** Arrow keys move one step; Page keys move five. Home and End are apart. */
const KEY_STEPS: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
  PageUp: 5,
  PageDown: -5,
};

const STEP_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-2 border border-input bg-surface-1 text-ink transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** Nothing marches to an empty room: the hatch stops while the tab is hidden. */
const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

type RolledMoneyProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * The limit figure rolls to its new value on `glide` as a formatted motion
 * value, so the roll runs outside React and re-renders nothing. Hidden from
 * assistive technology: the meter's `aria-valuetext` already says the limit.
 */
function RolledMoney({
  value,
  format,
  motionSafe,
  className,
}: RolledMoneyProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the figure — only the travel is dropped.
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <motion.span
      aria-hidden
      className={cn("font-mono tabular-nums", className)}
    >
      {text}
    </motion.span>
  );
}

/**
 * Ask for more room. The limit is a bar against the most the issuer could
 * grant: the current limit is a solid cobalt segment with the balance already
 * used drawn darker inside it. A stepper names the limit you would like, its
 * tick sliding along the bar on `snap` as you step it, and requesting draws
 * the ask as a hatched extension growing from the limit's end on `snap` — a
 * preview taking a position, one crisp overshoot — whose hatch marches one
 * seamless stripe period while the request stands. Approval fills it: the
 * parent raises `limit`, the solid segment glides out over the hatched region
 * while the hatch fades on the exit ease, the figure rolls to the new limit,
 * and an Approved chip lands on `recoil`, the one landing the instrument
 * makes. A decline turns the hatch danger, stills it, and says so in words.
 *
 * The bar is a `role="meter"` of the balance against the limit whose
 * `aria-valuetext` names the room and the state of any request; the stepper
 * readout is a `role="spinbutton"` — arrows step, Page keys move five, Home and
 * End reach the ends — beside real − and + buttons. Under reduced motion the
 * widths tween without springs and the hatch stands still: the fill still
 * fills, because the new room is information.
 */
export function LimitRaise({
  ref,
  limit,
  used,
  ceiling,
  step = 500,
  proposed,
  defaultProposed,
  onProposedChange,
  status = "idle",
  onRequest,
  format = defaultFormat,
  label = "Credit limit",
  className,
}: LimitRaiseProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const askLabelId = `${baseId}-ask-label`;
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const floor = limit + step;
  const top = Math.max(ceiling ?? limit * 2.5, floor);
  const snapAsk = (raw: number) =>
    clamp(limit + Math.round((raw - limit) / step) * step, floor, top);

  const [uncontrolled, setUncontrolled] = React.useState<number>(
    defaultProposed ?? floor,
  );
  // A raised limit moves the floor: the uncontrolled ask starts again one step
  // above it, so an approved request cannot leave a stale ask behind.
  const [seenLimit, setSeenLimit] = React.useState(limit);
  if (seenLimit !== limit) {
    setSeenLimit(limit);
    setUncontrolled(limit + step);
  }
  const isControlled = proposed !== undefined;
  const ask = snapAsk(isControlled ? proposed : uncontrolled);

  const pending = status === "requested";
  const declined = status === "declined";
  const approved = status === "approved";

  const commit = (next: number) => {
    const snapped = snapAsk(next);
    if (snapped === ask) return;
    if (!isControlled) setUncontrolled(snapped);
    onProposedChange?.(snapped);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (pending) return;
    const move = KEY_STEPS[event.key];
    const next =
      move !== undefined
        ? ask + move * step
        : event.key === "Home"
          ? floor
          : event.key === "End"
            ? top
            : null;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const usedClamped = clamp(used, 0, limit);
  const available = Math.max(0, limit - used);
  const limitShare = clamp(limit / top, 0, 1);
  const usedShare = clamp(usedClamped / top, 0, 1);
  const askShare = clamp((ask - limit) / top, 0, 1 - limitShare);
  const showAsk = pending || declined;

  const verdict = pending
    ? `raise to ${format(ask)} under review`
    : approved
      ? "raise approved"
      : declined
        ? `raise to ${format(ask)} declined`
        : null;
  const valueText = [
    `${format(used)} of ${format(limit)} used`,
    `${format(available)} available`,
    verdict,
  ]
    .filter(Boolean)
    .join(", ");

  const sizing = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const placing = motionSafe
    ? springs.snap
    : { duration: durations.fast, ease: easings.enter };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span className="flex shrink-0 items-baseline gap-1">
          <RolledMoney
            value={limit}
            format={format}
            motionSafe={motionSafe}
            className="text-sm font-semibold text-ink"
          />
          <span className="text-[11px] text-ink-3">limit</span>
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={usedClamped}
        aria-valuetext={valueText}
        className="relative h-3 w-full overflow-hidden rounded-full bg-hairline-strong"
      >
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright/35"
          initial={false}
          animate={{ width: `${limitShare * 100}%` }}
          transition={sizing}
        />
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
          initial={false}
          animate={{ width: `${usedShare * 100}%` }}
          transition={sizing}
        />

        <AnimatePresence initial={false}>
          {showAsk && askShare > 0 ? (
            <motion.span
              key="ask"
              aria-hidden
              className={cn(
                "absolute inset-y-0 overflow-hidden rounded-r-full",
                declined ? "bg-danger/15" : "bg-cobalt-wash",
              )}
              style={{ left: `${limitShare * 100}%` }}
              initial={{ width: "0%", opacity: 0 }}
              animate={{ width: `${askShare * 100}%`, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={placing}
            >
              <motion.span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 -right-4 -left-4 transition-colors",
                  declined ? "text-danger" : "text-cobalt-bright",
                )}
                style={{ backgroundImage: HATCH_IMAGE }}
                initial={{ x: 0 }}
                animate={{
                  x: motionSafe && visible && pending ? HATCH_TRAVEL : 0,
                }}
                transition={
                  motionSafe && visible && pending
                    ? {
                        duration: 1.2,
                        ease: easings.linear,
                        repeat: Infinity,
                      }
                    : { duration: 0 }
                }
              />
            </motion.span>
          ) : null}
        </AnimatePresence>

        {/* The tick is where the ask would land; while a request stands the
            hatch ends there instead, so the tick steps aside. */}
        <motion.span
          aria-hidden
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink"
          initial={false}
          animate={{
            left: `${clamp(ask / top, 0, 1) * 100}%`,
            opacity: showAsk ? 0 : 1,
          }}
          transition={{ ...placing, opacity: fade }}
        />
      </div>

      <div className="flex h-5 items-center justify-between gap-3">
        <span
          aria-hidden
          className="min-w-0 truncate font-mono text-[11px] text-ink-2 tabular-nums"
        >
          {format(used)} used · {format(available)} available
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {approved ? (
            <motion.span
              key="approved"
              aria-hidden
              className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 text-[11px] font-medium text-success"
              initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
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
                className="size-3 shrink-0"
              >
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
              </svg>
              Approved
            </motion.span>
          ) : pending || declined ? (
            <motion.span
              key={status}
              aria-hidden
              className={cn(
                "shrink-0 text-[11px] font-medium",
                declined ? "text-danger" : "text-ink-2",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {declined ? "Declined" : "Under review"}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={askLabelId} className="text-[11px] text-ink-3">
          Raise to
        </span>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-labelledby={askLabelId}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <button
              type="button"
              aria-label="Lower the ask"
              disabled={pending || ask <= floor}
              onClick={() => commit(ask - step)}
              className={STEP_BUTTON}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                className="size-3.5 shrink-0"
              >
                <path d="M3.5 8h9" />
              </svg>
            </button>
            <div
              role="spinbutton"
              tabIndex={pending ? -1 : 0}
              aria-labelledby={askLabelId}
              aria-valuemin={floor}
              aria-valuemax={top}
              aria-valuenow={ask}
              aria-valuetext={format(ask)}
              aria-disabled={pending || undefined}
              onKeyDown={handleKeyDown}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center justify-center rounded-2 border border-input bg-surface-1 px-2 font-mono text-sm font-medium text-ink tabular-nums outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                pending && "opacity-50",
              )}
            >
              <span className="truncate">{format(ask)}</span>
            </div>
            <button
              type="button"
              aria-label="Raise the ask"
              disabled={pending || ask >= top}
              onClick={() => commit(ask + step)}
              className={STEP_BUTTON}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                className="size-3.5 shrink-0"
              >
                <path d="M8 3.5v9M3.5 8h9" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => onRequest?.(ask)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {pending ? "Requested" : "Request"}
          </button>
        </div>
      </div>

      <span role="status" className="sr-only">
        {verdict ?? ""}
      </span>
    </div>
  );
}
