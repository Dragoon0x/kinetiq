"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ChipContactStatus =
  "idle" | "connecting" | "reading" | "approved" | "declined";

export type ChipContactProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The phase the reader is in. @default "idle" */
  status?: ChipContactStatus;
  /** 0–1. Given, the scan is determinate and reported; omitted, it loops. */
  progress?: number;
  /** Read steps; the line under the plate names the one `progress` has reached. */
  steps?: string[];
  /** Who is reading, printed in the header. @default "Gaugeworks counter reader" */
  reader?: string;
  /** Printed under the plinth when the read is refused. */
  declineReason?: string;
  /** Fires from the Retry press; omit it and no Retry is offered. */
  onRetry?: () => void;
  /** Names the group for assistive technology. @default "Chip read" */
  label?: string;
  className?: string;
};

const DEFAULT_STEPS = [
  "Contact made",
  "Reading application data",
  "Verifying signature",
];

/**
 * Contact pads: four columns, two rows, laid out in the plate's own 54×40
 * viewBox so the grid keeps the plate's aspect and never stretches.
 */
const PADS = Array.from({ length: 8 }, (_, index) => ({
  x: 3 + (index % 4) * 12.5,
  y: 3 + Math.floor(index / 4) * 18.5,
}));

/**
 * A glint is literal light on a metal plate, so it is mixed against the white
 * keyword rather than a theme token — fixed art, like a magnetic stripe.
 */
const GLINT =
  "linear-gradient(100deg, transparent 12%, color-mix(in oklab, white 62%, transparent) 50%, transparent 88%)";

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * A close-up of a card's contact plate while a reader talks to it. Connecting
 * sweeps a glint across the plate on a linear tween — a sheen is light moving
 * over a surface, and light has no mass to spring — while the eight pads light
 * one after another in a `cascade(8)` of `flick`, the tick-draw spring, so the
 * connection reads as contact made pad by pad. Reading fills the plate left to
 * right, clipped to its rounded rect: determinate when the host passes
 * `progress`, at a linear rate because a read is a measurement rather than a
 * gesture, and a sweeping bar when it does not.
 *
 * Success stamps a disc on `recoil` — ζ0.53, the two bounces of a stamp — with
 * its tick drawn by `pathLength` on `flick`. A refusal never celebrates: the
 * plate blinks danger twice on a three-keyframe tween, which a spring could not
 * carry anyway, and the reason prints under the plinth beside Retry.
 *
 * `progress` drives the picture and the `role="progressbar"` value together, so
 * what is drawn and what is announced can never disagree. Under reduced motion
 * there is no glint, no travelling bar and no blink — a blinking plate is
 * exactly what a viewer who asked for less motion is avoiding — but the pads
 * still light, the fill still fills and the tick still appears, because how far
 * a read has got is information.
 */
export function ChipContact({
  ref,
  status = "idle",
  progress,
  steps = DEFAULT_STEPS,
  reader = "Gaugeworks counter reader",
  declineReason = "Chip could not be read",
  onRetry,
  label = "Chip read",
  className,
}: ChipContactProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const phase = status;

  const busy = phase === "connecting" || phase === "reading";
  const determinate = progress !== undefined;
  const fraction = determinate
    ? clamp01(progress)
    : phase === "approved"
      ? 1
      : 0;
  const percent = Math.round(fraction * 100);
  const padStep = cascade(PADS.length);

  const stepIndex = Math.min(
    steps.length - 1,
    Math.max(0, Math.floor(fraction * steps.length)),
  );
  const stepText =
    phase === "approved"
      ? "Read complete"
      : phase === "declined"
        ? declineReason
        : phase === "idle"
          ? "Waiting for a card"
          : (steps[stepIndex] ?? "Reading");

  const sentence =
    phase === "approved"
      ? "Approved. The chip was read."
      : phase === "declined"
        ? `Declined, ${declineReason.toLowerCase()}`
        : phase === "reading"
          ? `Reading the chip, ${percent} percent`
          : phase === "connecting"
            ? "Contact made with the chip"
            : "Waiting for a card";

  const plateTone =
    phase === "declined"
      ? "border-danger"
      : phase === "approved"
        ? "border-success"
        : busy
          ? "border-cobalt-bright"
          : "border-warn/70";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="truncate text-[11px] text-ink-3">{reader}</span>
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[11px] tabular-nums"
        >
          {determinate || phase === "approved" ? `${percent}%` : "——"}
        </span>
      </div>

      <div
        className="relative flex w-full items-center justify-center rounded-2 border border-hairline bg-surface-2"
        style={{ aspectRatio: "2.2" }}
      >
        <div
          role="progressbar"
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            determinate || !busy
              ? phase === "approved"
                ? 100
                : percent
              : undefined
          }
          aria-valuetext={
            determinate || !busy ? `${percent} percent, ${stepText}` : undefined
          }
          aria-busy={busy || undefined}
          className={cn(
            "relative w-[38%] overflow-hidden rounded-1 border-2 bg-warn/35 transition-colors",
            plateTone,
          )}
          style={{ aspectRatio: "1.35" }}
        >
          <svg
            viewBox="0 0 54 40"
            aria-hidden
            className="absolute inset-0 size-full"
          >
            {PADS.map((pad, index) => {
              // Engaged, not "lit": a refused read still has the pads in
              // contact, and the colour rather than the brightness is what
              // says how the read ended.
              const engaged = phase !== "idle";
              return (
                <motion.rect
                  key={`${pad.x}-${pad.y}`}
                  x={pad.x}
                  y={pad.y}
                  width="10.5"
                  height="15.5"
                  rx="1.8"
                  className={
                    phase === "declined"
                      ? "fill-danger"
                      : engaged
                        ? "fill-cobalt-bright"
                        : "fill-ink-3"
                  }
                  style={{ originX: 0.5, originY: 0.5 }}
                  initial={false}
                  animate={{
                    opacity: engaged ? 0.95 : 0.35,
                    scale: engaged ? 1 : 0.86,
                  }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.flick,
                          delay: engaged ? index * padStep : 0,
                          opacity: {
                            duration: durations.fast,
                            delay: engaged ? index * padStep : 0,
                          },
                        }
                      : { duration: 0 }
                  }
                />
              );
            })}
          </svg>

          {/* The scan. Determinate, it grows from the left edge at a linear
              rate; without a figure to report it sweeps instead. */}
          {determinate ? (
            <motion.span
              aria-hidden
              className="absolute inset-y-0 left-0 w-full origin-left bg-cobalt-bright/45"
              initial={false}
              animate={{ scaleX: phase === "idle" ? 0 : fraction }}
              transition={{ duration: durations.fast, ease: easings.linear }}
            />
          ) : busy && motionSafe ? (
            <motion.span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[26%] bg-cobalt-bright/45"
              initial={{ x: "-100%" }}
              animate={{ x: "385%" }}
              transition={{
                duration: 1.1,
                ease: easings.linear,
                repeat: Infinity,
              }}
            />
          ) : busy ? (
            <span
              aria-hidden
              className="absolute inset-0 bg-cobalt-bright/25"
            />
          ) : null}

          {busy && motionSafe ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-[-30%] left-0 w-[45%]"
              style={{ backgroundImage: GLINT }}
              initial={{ x: "-120%", opacity: 0.7 }}
              animate={{ x: "300%", opacity: 0.7 }}
              transition={{
                duration: 1.4,
                ease: easings.linear,
                repeat: Infinity,
                repeatDelay: 0.25,
              }}
            />
          ) : null}

          {/* A refusal blinks the plate twice — three keyframes, so a tween,
              and nothing here bounces. */}
          {phase === "declined" && motionSafe ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-danger"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.55, 0, 0.55, 0.12] }}
              transition={{ duration: durations.page, ease: easings.move }}
            />
          ) : phase === "declined" ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-danger/25"
            />
          ) : null}
        </div>

        <AnimatePresence initial={false}>
          {phase === "approved" ? (
            <motion.span
              key="stamp"
              aria-hidden
              className="absolute grid place-items-center rounded-full bg-success text-surface-0"
              style={{
                left: "62%",
                top: "26%",
                width: "12%",
                aspectRatio: "1",
                x: "-50%",
                y: "-50%",
              }}
              initial={
                motionSafe
                  ? { scale: 1.4, opacity: 0 }
                  : { scale: 1, opacity: 0 }
              }
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      ...springs.recoil,
                      opacity: { duration: durations.blink },
                    }
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              <motion.svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[62%]"
              >
                <motion.path
                  d="M3.5 8.5 6.5 11.5 12.5 4.5"
                  initial={motionSafe ? { pathLength: 0 } : { pathLength: 1 }}
                  animate={{ pathLength: 1 }}
                  transition={
                    motionSafe ? springs.flick : { duration: durations.fast }
                  }
                />
              </motion.svg>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Both sides of the row stand 32px tall, so swapping the mono word for
          the Retry button changes nothing about the instrument's height. */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span aria-hidden className="flex h-8 min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              phase === "approved"
                ? "bg-success"
                : phase === "declined"
                  ? "bg-danger"
                  : busy
                    ? "bg-cobalt-bright"
                    : "bg-ink-3",
            )}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={stepText}
              className={cn(
                "truncate text-[11px]",
                phase === "declined" ? "text-danger" : "text-ink-2",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {stepText}
            </motion.span>
          </AnimatePresence>
        </span>

        {phase === "declined" && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none",
              "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Retry
          </button>
        ) : (
          <span
            aria-hidden
            className="flex h-8 shrink-0 items-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {phase === "idle" ? "Ready" : phase}
          </span>
        )}
      </div>

      <p role="status" className="sr-only">
        {sentence}
      </p>
    </div>
  );
}
