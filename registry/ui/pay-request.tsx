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

export type PayDelivery = "sent" | "delivered" | "read";

export type PayRequestMessage = {
  id: string;
  /** Own requests sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  /** Who is asking. */
  name: string;
  /** The figure asked for, in `currency`. */
  amount: number;
  /** What it is for, printed under the amount. */
  note?: string;
  /** Printed under the card, already formatted. */
  time?: string;
  /** Read for own requests only. @default "sent" */
  delivery?: PayDelivery;
};

export type PayRequestProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The request. */
  request: PayRequestMessage;
  /** Formats the amount. @default en-US with two decimals */
  format?: (amount: number) => string;
  /** The unit printed beside the amount; it never rolls. @default "BSN" */
  currency?: string;
  /** Controlled settled state. */
  paid?: boolean;
  /** Initial settled state for uncontrolled usage. @default false */
  defaultPaid?: boolean;
  /** Fires once, the moment the gesture or key commits. */
  onPay?: () => void;
  /** Fires with the knob's whole-percent position as it moves. */
  onProgressChange?: (percent: number) => void;
  /** Share of the track the knob must pass to commit, 0 to 1. @default 0.6 */
  threshold?: number;
  /** Already formatted; printed in the settled row. */
  paidAt?: string;
  /** Printed in the footer. @default "Waylight Pay" */
  provider?: string;
  /** Names the sender in the delivery sentence. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  /** Holds the track; the card still reads. @default false */
  disabled?: boolean;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const CHECK = "M2 8.5 5 11.5 10.5 5.5";
const CHECK_TRAIL = "M6.5 11.5 12 5.5";

/** Knob and track inset, in pixels — the geometry the travel is measured from. */
const KNOB = 36;
const INSET = 4;
/** A press must travel this far before the pointer is captured, or plain
 *  clicks on the knob would be swallowed by the capture. */
const SLOP = 4;

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (amount: number): string => money.format(amount);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const deliverySentence = (delivery: PayDelivery, peerName: string) =>
  ({
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
  })[delivery];

/**
 * The amount, rolling. Each column is ten faces tall and takes its new position
 * on `snap`; `tabular-nums` pins the cell so a figure that loses a digit cannot
 * shift the row. Hidden from assistive technology because the card already says
 * the amount in a sentence.
 */
function RollingAmount({
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
        // Keyed from the right so the units column keeps its identity and only
        // a genuinely new column mounts.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
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
                <span
                  key={face}
                  className="flex h-[1.15em] items-center justify-center"
                >
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

/**
 * Money, asked for in chat — a record of a request and never a transfer:
 * nothing moves, no card is asked for, and the footer says so.
 *
 * The amount is the headline and it rolls: each digit column takes its new
 * position on `snap`, one crisp overshoot, so a re-split reads as the figure
 * changing rather than the row redrawing. Under it is the confirm track, because
 * marking a request paid should cost a deliberate gesture rather than a stray
 * tap. The knob follows the pointer one-to-one and captures it only after 4px of
 * travel, inside try/catch, so a plain click is never swallowed; releasing short
 * of `threshold` returns the knob on `snap` and crossing it commits. Committing
 * stamps — a PAID mark lands from 1.16× on `recoil`, ζ0.53 and two bounces, like
 * something pressed onto paper — and the track cross-fades to a settled row
 * inside one shared grid cell, so no height is reserved for either.
 *
 * The knob is a real `role="slider"`: Right and Up step it 10 percent, Left and
 * Down step back, Home returns it, End takes it to the far end and commits,
 * Escape abandons the gesture, and Enter or Space commits from where it stands —
 * a keyboard user is owed an equivalent deliberate action, not a simulated drag.
 * Under reduced motion the knob still follows the pointer, because dragging is
 * direct manipulation rather than animation, but it returns instantly and the
 * stamp fades on in place.
 */
export function PayRequest({
  ref,
  request,
  format = defaultFormat,
  currency = "BSN",
  paid,
  defaultPaid = false,
  onPay,
  onProgressChange,
  threshold = 0.6,
  paidAt,
  provider = "Waylight Pay",
  peerName = "Them",
  label = "Thread",
  disabled = false,
  className,
}: PayRequestProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolledPaid, setUncontrolledPaid] = React.useState(defaultPaid);
  const [percent, setPercent] = React.useState(0);
  const [travel, setTravel] = React.useState(0);

  const isPaid = paid ?? uncontrolledPaid;
  const locked = disabled || isPaid;

  // Money is rounded to cents before it reaches a format, an attribute or a
  // motion string: a float from a division must never be printed raw.
  const cents = Math.round(request.amount * 100) / 100;
  const amountText = format(cents);
  const askSentence = `${request.name} is asking for ${amountText} ${currency}.`;
  const settledLine = paidAt ? `Marked paid at ${paidAt}` : "Marked paid";

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const knobX = useMotionValue(0);
  const fillWidth = useTransform(knobX, (value) => value + KNOB);
  const lastPercent = React.useRef(0);
  const drag = React.useRef<{
    id: number;
    startX: number;
    startKnob: number;
    captured: boolean;
  } | null>(null);

  React.useEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      // clientWidth, not the bounding rect: the knob is placed inside the
      // border box, so a rect that counts the border would let it overrun.
      const next = Math.max(0, node.clientWidth - INSET * 2 - KNOB);
      setTravel((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // An animate() started from a press outlives the press; stopping it on
  // unmount keeps a settling knob from writing to a value nobody paints.
  const running = React.useRef<{ stop: () => void } | null>(null);
  React.useEffect(() => () => running.current?.stop(), []);

  // A host that clears `paid` is re-opening the request, so the readout goes
  // back with it. Adjusted in render rather than pushed from an effect, and
  // without reporting: nobody moved the knob, so no progress is spoken.
  const [seenPaid, setSeenPaid] = React.useState(isPaid);
  if (seenPaid !== isPaid) {
    setSeenPaid(isPaid);
    if (!isPaid && percent !== 0) setPercent(0);
  }

  // The knob itself is a motion value, so it is returned in an effect rather
  // than during render — and any settle still in flight is stopped first.
  React.useEffect(() => {
    if (isPaid) return;
    running.current?.stop();
    knobX.set(0);
    lastPercent.current = 0;
  }, [isPaid, knobX]);

  const report = (fraction: number) => {
    const next = Math.round(clamp01(fraction) * 100);
    if (next === lastPercent.current) return;
    lastPercent.current = next;
    setPercent(next);
    onProgressChange?.(next);
  };

  const settleAt = (fraction: number) => {
    const target = clamp01(fraction) * travel;
    running.current?.stop();
    running.current = animate(
      knobX,
      target,
      motionSafe ? springs.snap : { duration: 0 },
    );
    report(fraction);
  };

  const commit = () => {
    if (locked) return;
    running.current?.stop();
    knobX.set(travel);
    report(1);
    if (paid === undefined) setUncontrolledPaid(true);
    onPay?.();
  };

  const onPointerDown = (pointer: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    drag.current = {
      id: pointer.pointerId,
      startX: pointer.clientX,
      startKnob: knobX.get(),
      captured: false,
    };
  };

  const onPointerMove = (pointer: React.PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (!held || held.id !== pointer.pointerId || locked) return;
    const dx = pointer.clientX - held.startX;
    if (!held.captured) {
      if (Math.abs(dx) <= SLOP) return;
      held.captured = true;
      try {
        pointer.currentTarget.setPointerCapture(pointer.pointerId);
      } catch {
        // A synthetic sweep can raise a pointer that was never down; the drag
        // still tracks without the capture.
      }
    }
    const next = Math.min(travel, Math.max(0, held.startKnob + dx));
    knobX.set(next);
    report(travel > 0 ? next / travel : 0);
  };

  const endDrag = (pointer: React.PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (!held || held.id !== pointer.pointerId) return;
    drag.current = null;
    if (held.captured) {
      try {
        pointer.currentTarget.releasePointerCapture(pointer.pointerId);
      } catch {
        // Already released — nothing to undo.
      }
    }
    if (locked) return;
    const reached = travel > 0 ? knobX.get() / travel : 0;
    if (reached >= threshold) commit();
    else settleAt(0);
  };

  const onKeyDown = (keyEvent: React.KeyboardEvent<HTMLDivElement>) => {
    if (locked) return;
    const here = travel > 0 ? knobX.get() / travel : 0;
    const key = keyEvent.key;
    if (key === "ArrowRight" || key === "ArrowUp") settleAt(here + 0.1);
    else if (key === "ArrowLeft" || key === "ArrowDown") settleAt(here - 0.1);
    else if (key === "Home" || key === "Escape") settleAt(0);
    else if (key === "End") commit();
    else if (key === "Enter" || key === " ") commit();
    else return;
    keyEvent.preventDefault();
  };

  const own = request.from === "me";
  const delivery = request.delivery ?? "sent";
  const fade = { duration: durations.base, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-1">
        <li
          className={cn(
            "flex flex-col gap-1",
            own ? "items-end" : "items-start",
          )}
        >
          <div
            className={cn(
              "relative flex w-full max-w-[92%] flex-col gap-2.5 rounded-3 px-3 py-2.5 transition-colors",
              own
                ? "rounded-br-1 bg-primary text-primary-foreground"
                : "rounded-bl-1 bg-surface-2 text-foreground",
            )}
          >
            <AnimatePresence initial={false}>
              {isPaid ? (
                <motion.span
                  key="stamp"
                  aria-hidden
                  initial={{
                    opacity: 0,
                    scale: motionSafe ? 1.16 : 1,
                    rotate: -8,
                  }}
                  animate={{ opacity: 1, scale: 1, rotate: -8 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? { scale: springs.recoil, opacity: fade }
                      : { duration: durations.fast }
                  }
                  className="absolute top-2 right-2.5 rounded-1 border border-success/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-success uppercase"
                >
                  Paid
                </motion.span>
              ) : null}
            </AnimatePresence>

            <div className="flex flex-col gap-1">
              <p className="text-[11px] leading-4 opacity-80">
                {`${request.name} is asking for`}
              </p>
              <p className="flex items-baseline gap-1.5">
                <span className="sr-only">{askSentence}</span>
                <span
                  aria-hidden
                  className={cn(
                    "font-mono text-[22px] leading-none font-semibold transition-colors",
                    isPaid && "text-success",
                  )}
                >
                  <RollingAmount value={amountText} motionSafe={motionSafe} />
                </span>
                <span
                  aria-hidden
                  className="font-mono text-[11px] font-medium opacity-70"
                >
                  {currency}
                </span>
              </p>
              {request.note ? (
                <p
                  className={cn(
                    "text-[12px] leading-4 transition-opacity",
                    isPaid ? "opacity-55" : "opacity-80",
                  )}
                >
                  {request.note}
                </p>
              ) : null}
            </div>

            {/* Track and settled row share one grid cell, so nothing reserves
                height for the state that is not showing. */}
            <div className="grid">
              <motion.div
                aria-hidden={isPaid}
                className={cn(
                  "col-start-1 row-start-1",
                  isPaid && "pointer-events-none",
                )}
                initial={false}
                animate={{ opacity: isPaid ? 0 : 1 }}
                transition={fade}
              >
                <div
                  ref={trackRef}
                  className={cn(
                    // No overflow clip: the knob sits 4px inside the track and
                    // its focus ring reaches exactly that far, so a clip here
                    // would shave the ring off.
                    "relative h-11 w-full rounded-2 border border-current/20 bg-current/8",
                    disabled && "opacity-50",
                  )}
                >
                  <motion.span
                    aria-hidden
                    style={{ width: fillWidth }}
                    className="absolute inset-y-1 left-1 rounded-2 bg-current/12"
                  />
                  <motion.span
                    aria-hidden
                    initial={false}
                    animate={{ opacity: percent > 26 ? 0 : 1 }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.move,
                    }}
                    className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium opacity-70"
                  >
                    Slide to confirm
                  </motion.span>
                  <motion.div
                    role="slider"
                    tabIndex={locked ? -1 : 0}
                    aria-label={`Slide to mark ${amountText} ${currency} paid to ${request.name}, or press Enter.`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-valuetext={`${percent} percent`}
                    aria-orientation="horizontal"
                    aria-disabled={locked || undefined}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={onKeyDown}
                    style={{ x: knobX }}
                    className={cn(
                      "absolute top-1 left-1 grid size-9 touch-none place-items-center rounded-2 bg-primary text-primary-foreground select-none",
                      locked
                        ? "cursor-default"
                        : "cursor-grab active:cursor-grabbing",
                      focusRing,
                    )}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 shrink-0"
                    >
                      <path d="M6 3.5 10.5 8 6 12.5" />
                    </svg>
                  </motion.div>
                </div>
              </motion.div>

              <motion.div
                aria-hidden={!isPaid}
                className={cn(
                  "col-start-1 row-start-1 flex h-11 items-center gap-2 rounded-2 border border-success/40 bg-success/10 px-3",
                  !isPaid && "pointer-events-none",
                )}
                initial={false}
                animate={{ opacity: isPaid ? 1 : 0 }}
                transition={fade}
              >
                <span aria-hidden className="text-success">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 shrink-0"
                  >
                    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                </span>
                <span
                  title={settledLine}
                  className="min-w-0 flex-1 truncate text-[12px] font-medium"
                >
                  {settledLine}
                </span>
              </motion.div>
            </div>

            <p className="text-[11px] opacity-65">
              {`${provider} · a request, not a transfer`}
            </p>
          </div>

          <span className="flex items-center gap-1.5 px-1">
            {request.time ? (
              <span className="text-[11px] text-ink-3 tabular-nums">
                {request.time}
              </span>
            ) : null}
            {own ? (
              <span
                role="img"
                aria-label={deliverySentence(delivery, peerName)}
                className={cn(
                  "inline-flex size-3.5 items-center justify-center",
                  delivery === "read" ? "text-cobalt-bright" : "text-ink-3",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                >
                  <path d={CHECK} />
                  {delivery === "sent" ? null : <path d={CHECK_TRAIL} />}
                </svg>
              </span>
            ) : null}
          </span>
        </li>
      </ol>

      {/* Derived from the settled state the host actually answered with, never
          frozen at the press — a controlled parent that refuses must not have
          this region claim the request was paid. */}
      <span role="status" aria-live="polite" className="sr-only">
        {isPaid
          ? `Marked paid, ${amountText} ${currency} to ${request.name}.`
          : ""}
      </span>
    </div>
  );
}
