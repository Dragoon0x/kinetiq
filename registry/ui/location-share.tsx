"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LocationPoint = { x: number; y: number };

export type LocationShareProps = {
  ref?: React.Ref<HTMLElement>;
  /** Who is sharing; the puck's initials come from it. */
  person: string;
  /** The pin, normalised 0 to 1 inside the map box. */
  position: LocationPoint;
  /** The path already walked, oldest first. @default [] */
  trail?: LocationPoint[];
  /** The nearest landmark, in words. A change here is what gets announced. */
  place: string;
  /** Seconds of sharing left. The host counts it down; the card never does. */
  secondsLeft: number;
  /** The share's full length, for the ring. @default 900 */
  totalSeconds?: number;
  /** @default "live" */
  status?: "live" | "ended";
  /** A preformatted time, shown once the share has ended. */
  lastSeenTime?: string;
  /** Sizes the halo and is spoken in the map's name. @default 20 */
  accuracyMeters?: number;
  /** Picks the procedural map. @default 7 */
  seed?: number;
  /** Fires from Stop sharing. */
  onStop?: () => void;
  /** Fires from Add 15 minutes, with 900. */
  onExtend?: (seconds: number) => void;
  /** Names the card for assistive technology. */
  label: string;
  className?: string;
};

/** The map's coordinate space. Normalised positions are scaled into it. */
const MAP_W = 200;
const MAP_H = 120;

/** The countdown ring's radius, and the circumference it draws. */
const RING_R = 14;
const RING_C = Number((2 * Math.PI * RING_R).toFixed(3));

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Three decimals is the width a hydration diff can actually see. */
const round3 = (value: number) => Number(value.toFixed(3));

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/** mm:ss from an integer count of seconds, never from a clock. */
const clockOf = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
};

/**
 * A procedural town: four streets across, five down, a river band and a park,
 * every coordinate an integer taken from a small seeded generator. Nothing
 * here comes out of `Math.sin` or `Math.random`, so the prerender and the
 * hydration draw the same map.
 */
const mapOf = (seed: number) => {
  let state = (Math.imul(seed || 1, 2654435761) + 97) >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8;
  };
  const streets = [
    ...[0, 1, 2, 3].map((i) => {
      const y = 18 + i * 26 + (next() % 9) - 4;
      return `M0 ${y}H${MAP_W}`;
    }),
    ...[0, 1, 2, 3, 4].map((i) => {
      const x = 20 + i * 38 + (next() % 13) - 6;
      return `M${x} 0V${MAP_H}`;
    }),
  ].join("");
  const riverLeft = 30 + (next() % 30);
  const riverRight = 60 + (next() % 34);
  const river = `M0 ${riverLeft}L${MAP_W} ${riverRight}L${MAP_W} ${riverRight + 15}L0 ${riverLeft + 15}Z`;
  const park = { x: 16 + (next() % 24), y: 62 + (next() % 20) };
  return { streets, river, park };
};

/**
 * Where I am, live. A pin standing on a procedural map glides to each new
 * position on `glide` — a body crossing ground settles without overshoot, and
 * it never blinks to the new spot — while the path already walked draws behind
 * it and an accuracy halo breathes, the one ambient motion on the card and the
 * first thing reduced motion takes away.
 *
 * The ring around the sharer's initials carries how long the share has left. It
 * is driven from `secondsLeft`, never from a clock read during render, so the
 * host owns the tick and the card only draws it; the ring still empties under
 * reduced motion, because time left is information. Stopping ends it: the halo
 * stops, the pin dims to a last-seen marker, and the controls give way to a
 * line naming the place and the time the host gave.
 *
 * A polite region speaks one frozen sentence per meaningful change — the place,
 * the last minute, the end — and never per tick, because a region that talks
 * every second is a region nobody keeps on.
 */
export function LocationShare({
  ref,
  person,
  position,
  trail = [],
  place,
  secondsLeft,
  totalSeconds = 900,
  status = "live",
  lastSeenTime,
  accuracyMeters = 20,
  seed = 7,
  onStop,
  onExtend,
  label,
  className,
}: LocationShareProps) {
  const motionSafe = useMotionSafe();
  const live = status === "live";
  const art = React.useMemo(() => mapOf(seed), [seed]);

  const px = round3(clamp01(position.x) * MAP_W);
  const py = round3(clamp01(position.y) * MAP_H);
  const points = trail
    .map(
      (point) =>
        `${round3(clamp01(point.x) * MAP_W)},${round3(clamp01(point.y) * MAP_H)}`,
    )
    .join(" ");

  const span = totalSeconds > 0 ? totalSeconds : 1;
  const left = Math.max(0, Math.min(span, secondsLeft));
  const offset = round3(RING_C * (1 - left / span));
  // A halo drawn from the stated accuracy: 20 metres is a small circle, 80 a
  // wide one, and the number itself is spoken in the map's name.
  const halo = Math.max(6, Math.min(26, Math.round(accuracyMeters / 2.5)));

  const warn = live && left > 0 && left <= 60;
  const mapName = live
    ? `${person} is near ${place}, within ${accuracyMeters} metres.`
    : `${person} was last seen near ${place}.`;

  // Frozen at the moment of the change, one sentence per change and never per
  // tick, so a fast walk cannot leave the reading a street behind.
  const [spoken, setSpoken] = React.useState(() => ({
    status,
    place,
    warn,
    text: "",
  }));
  if (
    spoken.status !== status ||
    spoken.place !== place ||
    spoken.warn !== warn
  ) {
    setSpoken({
      status,
      place,
      warn,
      text:
        spoken.status !== status
          ? status === "ended"
            ? `Sharing ended. ${person} was last seen near ${place}${lastSeenTime ? ` at ${lastSeenTime}` : ""}.`
            : `${person} is sharing a live location.`
          : spoken.place !== place
            ? `${person} moved to ${place}.`
            : warn
              ? "One minute of sharing left."
              : spoken.text,
    });
  }

  return (
    <section
      ref={ref}
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="relative grid size-9 shrink-0 place-items-center">
          <svg
            viewBox="0 0 36 36"
            aria-hidden
            className="absolute inset-0 size-9"
          >
            <circle
              cx={18}
              cy={18}
              r={RING_R}
              fill="none"
              strokeWidth={2}
              className="stroke-hairline-strong"
            />
            <motion.circle
              cx={18}
              cy={18}
              r={RING_R}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              // Drawn from twelve o'clock, the way a countdown is read.
              transform="rotate(-90 18 18)"
              initial={false}
              animate={{ strokeDashoffset: live ? offset : RING_C }}
              transition={
                motionSafe ? springs.glide : { duration: durations.blink }
              }
              className={cn(
                "transition-colors",
                warn
                  ? "stroke-warn"
                  : live
                    ? "stroke-cobalt-bright"
                    : "stroke-ink-3",
              )}
            />
          </svg>
          <span
            aria-hidden
            className="font-mono text-[11px] font-semibold text-ink-2"
          >
            {initialsOf(person)}
          </span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate text-sm font-semibold">{person}</h3>
          <span className="truncate text-[11px] leading-snug text-ink-3">
            {live ? `Sharing live · near ${place}` : "Sharing ended"}
          </span>
        </span>

        <span
          role="timer"
          aria-live="off"
          className={cn(
            "shrink-0 font-mono text-xs tabular-nums",
            warn ? "text-warn" : live ? "text-ink-2" : "text-ink-3",
          )}
        >
          {live ? clockOf(left) : (lastSeenTime ?? "—")}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2 border border-hairline bg-surface-2">
        <svg
          role="img"
          aria-label={mapName}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="none"
          className="block aspect-[5/3] w-full"
        >
          <path d={art.river} className="fill-cobalt-bright" opacity={0.14} />
          <rect
            x={art.park.x}
            y={art.park.y}
            width={44}
            height={28}
            rx={4}
            className="fill-success"
            opacity={0.16}
          />
          <path
            d={art.streets}
            fill="none"
            strokeWidth={1.5}
            className="stroke-ink-3"
            opacity={0.35}
          />

          {trail.length > 1 ? (
            <polyline
              points={points}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-cobalt-bright"
              opacity={live ? 0.5 : 0.25}
            />
          ) : null}

          <motion.g
            initial={false}
            animate={{ x: px, y: py, opacity: live ? 1 : 0.55 }}
            transition={
              motionSafe
                ? { ...springs.glide, opacity: FADE }
                : { duration: durations.blink }
            }
          >
            <AnimatePresence initial={false}>
              {live && motionSafe ? (
                <motion.circle
                  key="halo"
                  cx={0}
                  cy={0}
                  r={halo}
                  className="fill-cobalt-bright"
                  style={{ originX: 0.5, originY: 0.5 }}
                  initial={{ scale: 1, opacity: 0.18 }}
                  animate={{ scale: 1.35, opacity: 0.1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: easings.move,
                  }}
                />
              ) : null}
            </AnimatePresence>
            {live && !motionSafe ? (
              <circle
                cx={0}
                cy={0}
                r={halo}
                className="fill-cobalt-bright"
                opacity={0.14}
              />
            ) : null}
            <circle cx={0} cy={0} r={6} className="fill-surface-0" />
            <circle
              cx={0}
              cy={0}
              r={4}
              className={cn(live ? "fill-cobalt-bright" : "fill-ink-3")}
            />
          </motion.g>
        </svg>
      </div>

      {/* Wraps rather than truncates: on a phone column the two controls drop
          to their own line instead of clipping a sentence nobody can reopen. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1 basis-40 text-[11px] leading-snug text-ink-3">
          {live
            ? `Within ${accuracyMeters} metres of ${place}`
            : `Last seen near ${place}${lastSeenTime ? ` at ${lastSeenTime}` : ""}`}
        </span>
        {live ? (
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onExtend?.(900)}
              className={chip}
            >
              Add 15 minutes
            </button>
            <button
              type="button"
              onClick={() => onStop?.()}
              className={cn(chip, "border-danger/50 text-danger")}
            >
              Stop
            </button>
          </span>
        ) : null}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.text}
      </span>
    </section>
  );
}
