"use client";

import * as React from "react";

import {
  motion,
  useMotionTemplate,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TimelineEvent = {
  title: string;
  detail?: React.ReactNode;
  marker?: React.ReactNode;
};

export type TimelineSpineProps = {
  events: TimelineEvent[];
  className?: string;
  "aria-label"?: string;
};

/** The spine's leading edge tracks scroll with this settle, one notch softer than glide. */
const PLAYHEAD_SPRING = { stiffness: 260, damping: 36, mass: 1 } as const;

/**
 * A vertical timeline whose spine fills as its rows pass the viewport center.
 *
 * `useScroll` maps the container's travel from "start center" to "end center"
 * onto `scrollYProgress` (0..1); a spring smooths it into `fill`. A `--signal`
 * overlay scales that fill down the `--hairline-strong` spine (top origin) and
 * a playhead dot rides its leading edge via `top: fill%`. Each row reveals once
 * on `whileInView` (fade + rise + settle), and each node dot brightens as the
 * fill sweeps past its normalized position — so the cascade reads as the
 * playhead lighting the spine.
 *
 * Reduced motion renders the final state: spine fully filled, playhead hidden,
 * every row and node at rest. No scroll-driven animation, first paint safe.
 */
export function TimelineSpine({
  events,
  className,
  "aria-label": ariaLabel,
}: TimelineSpineProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLOListElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  });
  const fill = useSpring(scrollYProgress, PLAYHEAD_SPRING);

  // scaleY wants 0..1; the playhead wants a CSS length riding the same edge.
  const playheadTop = useMotionTemplate`${useTransform(fill, [0, 1], [0, 100])}%`;
  // The playhead only exists mid-run — it fades in off the top, out at the end.
  const playheadOpacity = useTransform(fill, [0, 0.02, 0.98, 1], [0, 1, 1, 0]);

  const count = events.length;

  return (
    <ol
      ref={containerRef}
      aria-label={ariaLabel}
      className={cn("relative flex flex-col gap-8 pl-8", className)}
    >
      {/* Spine: static rail + the fill that scales down behind the playhead. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-[7px] w-px"
        style={{ background: "var(--hairline-strong)" }}
      >
        {motionSafe ? (
          <motion.div
            className="absolute inset-x-0 top-0 h-full origin-top"
            style={{ background: "var(--signal)", scaleY: fill }}
          />
        ) : (
          // Reduced motion: spine reads as fully traversed.
          <div
            className="absolute inset-0"
            style={{ background: "var(--signal)" }}
          />
        )}
        {/* Playhead dot at the fill's leading edge — decorative, motion-only. */}
        {motionSafe ? (
          <motion.span
            className="absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              top: playheadTop,
              opacity: playheadOpacity,
              background: "var(--signal)",
              boxShadow: "0 0 0 4px color-mix(in oklch, var(--signal) 22%, transparent)",
            }}
          />
        ) : null}
      </div>

      {events.map((event, index) => {
        // Each node's normalized center along the spine; the fill lights it as
        // it passes. Guarded so a single-event timeline still resolves to 0..1.
        const at = count > 1 ? index / (count - 1) : 1;
        return (
          <TimelineRow
            key={index}
            event={event}
            index={index}
            count={count}
            at={at}
            fill={fill}
            motionSafe={motionSafe}
          />
        );
      })}
    </ol>
  );
}

type TimelineRowProps = {
  event: TimelineEvent;
  index: number;
  count: number;
  at: number;
  fill: ReturnType<typeof useSpring>;
  motionSafe: boolean;
};

/**
 * One event row: a node dot on the spine plus its title/detail. Hooks live here
 * (not in a map callback) so the per-node transforms obey the Rules of Hooks.
 */
function TimelineRow({
  event,
  index,
  count,
  at,
  fill,
  motionSafe,
}: TimelineRowProps): React.JSX.Element {
  // Node lights over a short window centered on its position, so the fill's
  // leading edge visibly "arrives" at each dot rather than pre-lighting it.
  const lo = Math.max(0, at - 0.06);
  const lit = useTransform(fill, [lo, at], [0, 1]);
  const dotBackground = useTransform(
    lit,
    (value) => `color-mix(in oklch, var(--signal) ${value * 100}%, var(--surface-2))`,
  );
  const dotScale = useTransform(lit, [0, 1], [0.82, 1]);
  const dotGlow = useTransform(
    lit,
    (value) =>
      `0 0 0 ${value * 4}px color-mix(in oklch, var(--signal) ${value * 18}%, transparent)`,
  );

  // Stagger enters by depth, capped so a long log never reads as lag.
  const enterDelay = Math.min(index, count - 1) * 0.05;

  const reveal = motionSafe
    ? {
        initial: { opacity: 0, y: distances.step, scale: 0.96 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        viewport: { once: true, margin: "0px 0px -20% 0px" },
        transition: { ...springs.glide, delay: enterDelay },
      }
    : {};

  return (
    <motion.li className="relative" {...reveal}>
      {/* Node dot, seated on the spine at left. Decorative; the text carries meaning. */}
      {motionSafe ? (
        <motion.span
          aria-hidden
          className="ring-hairline-strong absolute top-1 left-[-25px] size-[9px] rounded-full ring-1 ring-inset"
          style={{
            background: dotBackground,
            scale: dotScale,
            boxShadow: dotGlow,
          }}
        />
      ) : (
        <span
          aria-hidden
          className="ring-hairline-strong absolute top-1 left-[-25px] size-[9px] rounded-full ring-1 ring-inset"
          style={{ background: "var(--signal)" }}
        />
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium text-ink">{event.title}</h3>
          {event.marker != null ? (
            <span className="text-label shrink-0 text-ink-3 tabular-nums">
              {event.marker}
            </span>
          ) : null}
        </div>
        {event.detail != null ? (
          <div className="text-sm text-ink-2">{event.detail}</div>
        ) : null}
      </div>
    </motion.li>
  );
}
