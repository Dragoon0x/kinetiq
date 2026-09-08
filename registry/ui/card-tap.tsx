"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CardTapStatus = "idle" | "reading" | "approved" | "declined";

export type CardTapProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled phase. */
  status?: CardTapStatus;
  /** Initial phase for uncontrolled usage. @default "idle" */
  defaultStatus?: CardTapStatus;
  /** Fires from the gesture or key that moved the card to the reader. */
  onStatusChange?: (status: CardTapStatus) => void;
  /** Fires once the card reaches the reader — start the authorisation here. */
  onTap?: () => void;
  /** The sum being tapped. @default 0 */
  amount?: number;
  /** Formats every amount; the stage never invents a currency. */
  format?: (value: number) => string;
  /** Who is being paid. @default "Fernworks Depot" */
  merchant?: string;
  /** Network wordmark printed on the slab. @default "Waylight" */
  network?: string;
  /** Last four digits printed on the slab. @default "4417" */
  last4?: string;
  /** Printed under the stage when the tap is refused. */
  declineReason?: string;
  /** Names the group for assistive technology. @default "Tap to pay" */
  label?: string;
  className?: string;
};

/** Explicit locale: the server and the first client render must agree. */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const formatMoney = (value: number): string => MONEY.format(value);

/** Share of the travel the card must pass before the reader takes it. */
const TAP_AT = 0.6;
/** Rings in flight while the reader reads. */
const RINGS = 3;
/** Shake amplitude in px — a rebuff, not a bounce. */
const SHAKE = 10;

/** The slab, lit from its top-right corner. Tokens only, so both themes read. */
const SLAB_ART = [
  "radial-gradient(125% 105% at 100% 0%, color-mix(in oklab, var(--accent) 44%, transparent), transparent 60%)",
  "linear-gradient(150deg, var(--bg-2), var(--bg-1) 70%)",
].join(", ");

const PHASE_TEXT: Record<CardTapStatus, string> = {
  idle: "Hold the card to the reader",
  reading: "Reading card",
  approved: "Approved",
  declined: "Declined",
};

/** The contactless mark: three arcs opening away from the contact point. */
function ContactMark({ active }: { active: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className="w-[44%] shrink-0"
      animate={{ opacity: active ? 1 : 0.55 }}
      transition={{ duration: durations.fast, ease: easings.enter }}
    >
      <path d="M8.5 5.5a9 9 0 0 1 0 13" />
      <path d="M12.5 8a5.5 5.5 0 0 1 0 8" />
      <path d="M16.5 10.5a2 2 0 0 1 0 3" />
    </motion.svg>
  );
}

/**
 * A contactless payment, drawn as a scene. Push the slab toward the reader —
 * drag it, or press Enter, Space or Right Arrow — and past six tenths of its
 * travel the tap fires: the card closes the gap on `snap`, one crisp overshoot,
 * because a card meeting a reader takes a position rather than journeying.
 * Rings pulse from the contact point on `drift`, the ambient spring, for as
 * long as the read lasts. Approval stamps a tick on `recoil`; a decline never
 * celebrates — the card shakes home on a four-keyframe tween, since a spring
 * carries exactly two and a refusal should read as a rebuff.
 *
 * The travel is read from the track and the slab inside the pointer and key
 * handlers, never during render, so the geometry follows its container at any
 * width and nothing is measured into layout. Under reduced motion nothing
 * travels: the reader lights, the tick appears, and the phase still changes,
 * because the outcome of a payment is information.
 */
export function CardTap({
  ref,
  status,
  defaultStatus = "idle",
  onStatusChange,
  onTap,
  amount = 0,
  format = formatMoney,
  merchant = "Fernworks Depot",
  network = "Waylight",
  last4 = "4417",
  declineReason = "Card limit reached",
  label = "Tap to pay",
  className,
}: CardTapProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const [uncontrolled, setUncontrolled] =
    React.useState<CardTapStatus>(defaultStatus);
  const isControlled = status !== undefined;
  const phase = isControlled ? status : uncontrolled;

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const slabRef = React.useRef<HTMLButtonElement | null>(null);
  const x = useMotionValue(0);
  const travelling = React.useRef<ReturnType<typeof animate> | null>(null);
  // A drag that ends short of the reader is still followed by a click; without
  // this the card would spring home and immediately tap itself.
  const moved = React.useRef(false);

  const money = format(amount);
  const idle = phase === "idle";

  /** Maximum travel, in px, from layout — transforms do not touch offsets. */
  const maxTravel = (): number => {
    const track = trackRef.current;
    const slab = slabRef.current;
    if (!track || !slab) return 0;
    return Math.max(0, track.clientWidth - slab.offsetWidth - slab.offsetLeft);
  };

  const setPhase = (next: CardTapStatus) => {
    if (!isControlled) setUncontrolled(next);
    onStatusChange?.(next);
  };

  const tap = () => {
    if (!idle) return;
    travelling.current?.stop();
    if (motionSafe) {
      travelling.current = animate(x, maxTravel(), springs.snap);
    } else {
      x.set(0);
    }
    setPhase("reading");
    onTap?.();
  };

  const releaseShort = () => {
    travelling.current?.stop();
    travelling.current = motionSafe ? animate(x, 0, springs.glide) : null;
    if (!motionSafe) x.set(0);
  };

  // Phase changes the host owns are answered here, in an effect, because the
  // slab's position is imperative state: reading and approved hold it at the
  // reader, a decline walks it home, and idle glides it back.
  React.useEffect(() => {
    if (phase === "reading" || phase === "approved") return;
    if (!motionSafe) {
      x.set(0);
      return;
    }
    const from = x.get();
    if (from === 0) return;
    const controls =
      phase === "declined"
        ? animate(x, [from, from - SHAKE, from + SHAKE * 0.6, 0], {
            duration: durations.slow,
            ease: easings.move,
          })
        : animate(x, 0, springs.glide);
    travelling.current = controls;
    return () => controls.stop();
  }, [phase, motionSafe, x]);

  React.useEffect(() => () => travelling.current?.stop(), []);

  const sentence =
    phase === "approved"
      ? `Approved, ${money} at ${merchant}`
      : phase === "declined"
        ? `Declined, ${declineReason.toLowerCase()}`
        : phase === "reading"
          ? "Reading card"
          : `Ready to tap ${money} at ${merchant}`;

  const readerTone =
    phase === "approved"
      ? "border-success text-success"
      : phase === "declined"
        ? "border-danger text-danger"
        : phase === "reading"
          ? "border-cobalt-bright text-cobalt-bright"
          : "border-hairline-strong text-ink-3";

  const ringStep = cascade(RINGS) * 3;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <div className="flex items-end justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="truncate text-[11px] text-ink-3">{merchant}</span>
        </span>
        <span className="shrink-0 font-mono text-sm font-medium tabular-nums">
          {money}
        </span>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-3 border border-hairline bg-surface-1"
        style={{ aspectRatio: "2.3" }}
      >
        {/* The reader plinth. Its inner edge at 76% is the contact point that
            every ring and stamp is centred on, and where the slab's travel ends. */}
        <div
          className={cn(
            "absolute inset-y-[14%] right-[3%] flex w-[21%] items-center justify-center rounded-2 border bg-surface-2 transition-colors",
            readerTone,
          )}
        >
          <ContactMark active={phase !== "idle"} />
        </div>

        <AnimatePresence>
          {phase === "reading" && motionSafe
            ? Array.from({ length: RINGS }, (_, index) => (
                <motion.span
                  key={`ring-${index}`}
                  aria-hidden
                  className="pointer-events-none absolute rounded-full border border-cobalt-bright"
                  style={{
                    left: "76%",
                    top: "50%",
                    width: "34%",
                    aspectRatio: "1",
                    x: "-50%",
                    y: "-50%",
                  }}
                  initial={{ scale: 0.24, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    scale: {
                      ...springs.drift,
                      repeat: Infinity,
                      repeatDelay: 0.08,
                      delay: index * ringStep,
                    },
                    opacity: {
                      duration: 0.8,
                      ease: easings.exit,
                      repeat: Infinity,
                      repeatDelay: 0.08,
                      delay: index * ringStep,
                    },
                  }}
                />
              ))
            : null}
        </AnimatePresence>

        {/* Reduced motion still gets a reader that answers: one static ring,
            opacity only, so the read is visible without anything travelling. */}
        {phase === "reading" && !motionSafe ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute rounded-full border border-cobalt-bright"
            style={{
              left: "76%",
              top: "50%",
              width: "34%",
              aspectRatio: "1",
              x: "-50%",
              y: "-50%",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            transition={{ duration: durations.fast }}
          />
        ) : null}

        <AnimatePresence initial={false}>
          {phase === "approved" || phase === "declined" ? (
            <motion.span
              key={phase}
              aria-hidden
              className={cn(
                "pointer-events-none absolute grid place-items-center rounded-full text-surface-0",
                phase === "approved" ? "bg-success" : "bg-danger",
              )}
              style={{
                left: "76%",
                top: "50%",
                width: "18%",
                aspectRatio: "1",
                x: "-50%",
                y: "-50%",
              }}
              initial={
                motionSafe && phase === "approved"
                  ? { scale: 1.35, opacity: 0 }
                  : { scale: 1, opacity: 0 }
              }
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                // A stamp lands on recoil; a refusal simply appears — nothing
                // that says no should bounce.
                motionSafe && phase === "approved"
                  ? {
                      ...springs.recoil,
                      opacity: { duration: durations.blink },
                    }
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[58%]"
              >
                {phase === "approved" ? (
                  <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                ) : (
                  <path d="m5 5 6 6M11 5l-6 6" />
                )}
              </svg>
            </motion.span>
          ) : null}
        </AnimatePresence>

        {/* The track runs from the stage's left edge to the contact point, so
            motion's own drag constraints stop the slab exactly at the reader. */}
        <div ref={trackRef} className="absolute inset-y-0 left-0 w-[76%]">
          <motion.button
            ref={slabRef}
            type="button"
            aria-disabled={!idle}
            aria-label={`Tap ${network} card ending ${last4} to pay ${money} at ${merchant}`}
            drag={motionSafe && idle ? "x" : false}
            dragConstraints={trackRef}
            dragElastic={0.04}
            dragMomentum={false}
            onPointerDown={() => {
              moved.current = false;
            }}
            onDrag={() => {
              moved.current = true;
            }}
            onDragEnd={() => {
              const max = maxTravel();
              if (max > 0 && x.get() >= max * TAP_AT) tap();
              else releaseShort();
            }}
            onClick={() => {
              if (moved.current) {
                moved.current = false;
                return;
              }
              tap();
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                tap();
              }
            }}
            style={{ x, y: "-50%", backgroundImage: SLAB_ART }}
            className={cn(
              "absolute top-1/2 left-[5%] flex w-[59%] flex-col justify-between rounded-2 border border-hairline-strong p-[6%] text-left text-ink outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              idle ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            )}
          >
            <span className="flex items-center justify-between gap-1">
              <span className="truncate text-[11px] font-semibold tracking-tight">
                {network}
              </span>
              <span
                aria-hidden
                className="h-2.5 w-3.5 shrink-0 rounded-[2px] border border-warn/70 bg-warn/45"
              />
            </span>
            <span className="font-mono text-[11px] tracking-[0.08em] tabular-nums">
              ···· {last4}
            </span>
          </motion.button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
        {/* Decoration: the sentence below is the live region, so a reader is
            told the outcome once rather than twice in two voices. */}
        <span aria-hidden className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              phase === "approved"
                ? "bg-success"
                : phase === "declined"
                  ? "bg-danger"
                  : phase === "reading"
                    ? "bg-cobalt-bright"
                    : "bg-ink-3",
            )}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={phase}
              className="truncate text-[11px] text-ink-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {phase === "declined" ? declineReason : PHASE_TEXT[phase]}
            </motion.span>
          </AnimatePresence>
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {idle ? "Drag or Enter" : `···· ${last4}`}
        </span>
      </div>

      <p role="status" className="sr-only">
        {sentence}
      </p>
    </div>
  );
}
