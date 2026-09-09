"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RoundUpPurchase = {
  id: string;
  merchant: string;
  amount: number;
  note?: string;
};

export type RoundUpProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The purchase on the card. A new `id` is a new purchase; when enabled its change lifts and flies. */
  purchase?: RoundUpPurchase | null;
  /** Controlled round-up total. */
  saved?: number;
  /** Initial total for uncontrolled usage. @default 0 */
  defaultSaved?: number;
  /** Fires when a lifted change lands in the figure, with the new total and the amount that landed. */
  onSavedChange?: (saved: number, change: number) => void;
  /** Controlled switch state. */
  enabled?: boolean;
  /** Initial switch state for uncontrolled usage. @default true */
  defaultEnabled?: boolean;
  /** Fires from the press that flipped the switch. */
  onEnabledChange?: (enabled: boolean) => void;
  /** The unit a purchase rounds up to. @default 1 */
  roundTo?: number;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Names the savings figure. @default "Round-ups" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on the figure the card exists to feed.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Spare change to the next unit, in whole cents so 7.35 leaves exactly 0.65. */
const spareOf = (amount: number, roundTo: number): number => {
  const unit = Math.max(1, Math.round(roundTo * 100));
  const cents = Math.round(Math.max(0, amount) * 100);
  return ((unit - (cents % unit)) % unit) / 100;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart a flight. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Digit columns that roll to the new figure on `snap`: one strip of ten faces
 * per column, moved by a percentage of its own height, so the layout never
 * shifts. Hidden from assistive technology — the sr-only amount beside it
 * reads as one string.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // total gains a digit and only the new column mounts.
        const key = value.length - index;
        if (digit < 0) return <span key={key}>{char}</span>;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span key={face} className="flex h-[1.15em] justify-center">
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

type Flight = { seq: number; change: number; merchant: string };

type FlyerProps = {
  flight: Flight;
  rootRef: React.RefObject<HTMLDivElement | null>;
  socketRef: React.RefObject<HTMLSpanElement | null>;
  figureRef: React.RefObject<HTMLSpanElement | null>;
  motionSafe: boolean;
  onLand: (flight: Flight) => void;
  children: React.ReactNode;
};

/**
 * One change in the air. It owns its motion values and its effect, so a second
 * purchase arriving mid-flight mounts a second flyer instead of hijacking the
 * first — every lifted coin still lands and still counts.
 */
function Flyer({
  flight,
  rootRef,
  socketRef,
  figureRef,
  motionSafe,
  onLand,
  children,
}: FlyerProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(0);
  const landRef = useLatest(onLand);

  React.useEffect(() => {
    const controls: ReturnType<typeof animate>[] = [];
    let cancelled = false;
    const finish = () => {
      if (!cancelled) landRef.current(flight);
    };
    const fadeOut = (delay: number, onComplete?: () => void) =>
      animate(opacity, 0, {
        duration: durations.base,
        ease: easings.exit,
        delay,
        onComplete,
      });

    // Measured in the effect, never in render: where the chip sits on the card
    // and where the figure is, both in the wrapper's own space.
    const rootBox = rootRef.current?.getBoundingClientRect();
    const from = socketRef.current?.getBoundingClientRect();
    const to = figureRef.current?.getBoundingClientRect();
    if (rootBox && from) {
      x.set(from.left - rootBox.left);
      y.set(from.top - rootBox.top);
    }
    scale.set(1);
    opacity.set(1);

    if (!motionSafe || !rootBox || !from || !to) {
      // No travel: the chip fades where it is and the total still commits.
      controls.push(fadeOut(0, finish));
    } else {
      const endX = to.left - rootBox.left + to.width / 2 - from.width / 2;
      const endY = to.top - rootBox.top + to.height / 2 - from.height / 2;
      // The lift is the acknowledgement — one crisp overshoot upward on snap —
      // and only then the glide to the figure, which is where money settles.
      const lift = animate(y, y.get() - distances.shift, springs.snap);
      controls.push(lift, animate(scale, 1.06, springs.snap));
      lift.then(() => {
        if (cancelled) return;
        controls.push(
          animate(x, endX, springs.glide),
          animate(y, endY, { ...springs.glide, onComplete: finish }),
          animate(scale, 0.6, springs.glide),
          fadeOut(0.2),
        );
      });
    }
    return () => {
      cancelled = true;
      controls.forEach((item) => item.stop());
    };
  }, [
    flight,
    rootRef,
    socketRef,
    figureRef,
    motionSafe,
    x,
    y,
    scale,
    opacity,
    landRef,
  ]);

  return (
    <motion.span
      aria-hidden
      style={{ x, y, scale, opacity }}
      className="pointer-events-none absolute top-0 left-0 z-20 flex h-6 items-center rounded-full border border-cobalt-bright bg-cobalt-wash px-2 font-mono text-[11px] font-medium text-cobalt-bright tabular-nums shadow-sm"
    >
      {children}
    </motion.span>
  );
}

const TONES = {
  live: "border-cobalt-bright bg-cobalt-wash text-cobalt-bright",
  saved: "border-success/40 bg-success/10 text-success",
  muted: "border-hairline-strong bg-surface-0 text-ink-3",
} as const;

/**
 * A purchase card whose spare change is saved. The chip on the card carries the
 * change up to the next unit; when a new purchase arrives with the switch on,
 * that chip lifts out of the card on `snap` — one crisp overshoot upward — and
 * glides into the savings figure above, shrinking as it goes. Only when it
 * arrives does the figure roll its digits to the new total on `snap` and a tag
 * name the amount that landed: the number moves because the change arrived.
 *
 * The switch is a real `role="switch"`; off, purchases still land on the card
 * but the chip sits dimmed and nothing flies. The figure is labelled and reads
 * as one string, and a status line announces each landing. Under reduced motion
 * the chip fades on the card instead of travelling — its fade still commits the
 * total — and the digits swap in place.
 */
export function RoundUp({
  ref,
  purchase = null,
  saved,
  defaultSaved = 0,
  onSavedChange,
  enabled,
  defaultEnabled = true,
  onEnabledChange,
  roundTo = 1,
  format = defaultFormat,
  label = "Round-ups",
  className,
}: RoundUpProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const merchantId = `${baseId}-merchant`;
  const switchId = `${baseId}-switch`;

  const [uncontrolledSaved, setUncontrolledSaved] =
    React.useState(defaultSaved);
  const isSavedControlled = saved !== undefined;
  const currentSaved = isSavedControlled ? saved : uncontrolledSaved;
  const savedRef = useLatest(currentSaved);
  const savedChangeRef = useLatest(onSavedChange);

  const [uncontrolledEnabled, setUncontrolledEnabled] =
    React.useState(defaultEnabled);
  const isEnabledControlled = enabled !== undefined;
  const isEnabled = isEnabledControlled ? enabled : uncontrolledEnabled;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const socketRef = React.useRef<HTMLSpanElement | null>(null);
  const figureRef = React.useRef<HTMLSpanElement | null>(null);

  // The last purchase seen lives in state, not a ref: the render is where an
  // incoming purchase has to be compared with the one already on the card.
  const purchaseId = purchase?.id ?? null;
  const [seen, setSeen] = React.useState({ id: purchaseId, seq: 0 });
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const change = purchase ? spareOf(purchase.amount, roundTo) : 0;
  if (seen.id !== purchaseId) {
    const seq = seen.seq + 1;
    setSeen({ id: purchaseId, seq });
    if (purchase && isEnabled && change > 0) {
      const merchant = purchase.merchant;
      setFlights((prev) => [...prev, { seq, change, merchant }]);
    }
  }

  const [landedSeq, setLandedSeq] = React.useState(0);
  const [lastLanded, setLastLanded] = React.useState<Flight | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const land = (flight: Flight) => {
    const next = round2(savedRef.current + flight.change);
    if (!isSavedControlled) setUncontrolledSaved(next);
    savedChangeRef.current?.(next, flight.change);
    setFlights((prev) => prev.filter((item) => item.seq !== flight.seq));
    setLandedSeq((prev) => Math.max(prev, flight.seq));
    setLastLanded(flight);
    setAnnouncement(
      `Rounded up ${format(flight.change)} from ${flight.merchant}. ${label} ${format(next)}.`,
    );
  };

  const toggle = () => {
    const next = !isEnabled;
    if (!isEnabledControlled) setUncontrolledEnabled(next);
    onEnabledChange?.(next);
    setAnnouncement(next ? "Round-up on." : "Round-up paused.");
  };

  const flying = flights.some((item) => item.seq === seen.seq);
  const landedHere = seen.seq > 0 && landedSeq === seen.seq;
  const tone: keyof typeof TONES =
    change === 0 || !(isEnabled || landedHere)
      ? "muted"
      : landedHere
        ? "saved"
        : "live";
  const chipText = !purchase
    ? ""
    : change === 0
      ? "already whole"
      : landedHere
        ? `${format(change)} saved`
        : isEnabled
          ? `${format(change)} spare`
          : `${format(change)} not rounded`;

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const arrive = motionSafe ? { ...springs.snap, opacity: fade } : fade;

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      {/* The flyers' coordinate space: the wrapper the host styles stays free
          of positioning so a `className` cannot move it. */}
      <div ref={rootRef} className="relative flex flex-col gap-3">
        <div
          role="group"
          aria-labelledby={labelId}
          className="flex items-center justify-between gap-3 px-1"
        >
          <span id={labelId} className="text-xs font-medium text-ink-3">
            {label}
          </span>
          <span className="flex items-center gap-2">
            <AnimatePresence initial={false}>
              {lastLanded ? (
                <motion.span
                  key={lastLanded.seq}
                  aria-hidden
                  className="flex h-5 items-center rounded-full border border-success/30 bg-success/10 px-1.5 font-mono text-[10px] text-success tabular-nums"
                  initial={{ opacity: 0, x: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={arrive}
                >
                  +{format(lastLanded.change)}
                </motion.span>
              ) : null}
            </AnimatePresence>
            <span
              ref={figureRef}
              className="font-mono text-xl leading-none font-medium text-ink"
            >
              <span className="sr-only">{format(currentSaved)}</span>
              <RollingNumber
                value={format(currentSaved)}
                motionSafe={motionSafe}
              />
            </span>
          </span>
        </div>

        <section
          aria-labelledby={purchase ? merchantId : undefined}
          aria-label={purchase ? undefined : "No purchase yet"}
          className="flex flex-col gap-3 rounded-3 border border-hairline-strong bg-surface-2 p-3"
        >
          {purchase ? (
            <motion.div
              key={purchase.id}
              className="flex items-start justify-between gap-3"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={arrive}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  id={merchantId}
                  className="truncate text-sm font-semibold"
                >
                  {purchase.merchant}
                </span>
                {purchase.note ? (
                  <span className="truncate text-[11px] text-ink-3">
                    {purchase.note}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-lg leading-none font-medium tabular-nums">
                {format(purchase.amount)}
              </span>
            </motion.div>
          ) : (
            <p className="text-xs text-ink-3">No purchase yet.</p>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <button
                id={switchId}
                type="button"
                role="switch"
                aria-checked={isEnabled}
                onClick={toggle}
                className={cn(
                  "relative flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isEnabled
                    ? "border-primary bg-primary"
                    : "border-hairline-strong bg-surface-0",
                )}
              >
                <motion.span
                  aria-hidden
                  className={cn(
                    "block size-3.5 rounded-full transition-colors",
                    isEnabled ? "bg-primary-foreground" : "bg-ink-3",
                  )}
                  initial={false}
                  animate={{ x: isEnabled ? 16 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </button>
              <label htmlFor={switchId} className="text-xs font-medium">
                Round up
              </label>
            </span>

            {/* The socket: the change at rest. While its flyer is in the air
                it keeps its width but not its ink, so the chip reads as having
                left the card rather than been copied. */}
            <span
              ref={socketRef}
              aria-hidden={flying || !purchase}
              className={cn(
                "flex h-6 shrink-0 items-center rounded-full border px-2 font-mono text-[11px] font-medium tabular-nums transition-opacity",
                !purchase && "invisible",
                flying && "opacity-0",
                TONES[tone],
              )}
            >
              {chipText}
            </span>
          </div>
        </section>

        {flights.map((flight) => (
          <Flyer
            key={flight.seq}
            flight={flight}
            rootRef={rootRef}
            socketRef={socketRef}
            figureRef={figureRef}
            motionSafe={motionSafe}
            onLand={land}
          >
            +{format(flight.change)}
          </Flyer>
        ))}

        <span role="status" className="sr-only">
          {announcement}
        </span>
      </div>
    </div>
  );
}
