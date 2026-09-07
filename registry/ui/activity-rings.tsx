"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ActivityRing = {
  id: string;
  label: string;
  value: number;
  goal: number;
  /** Stroke colour for this ring; any CSS colour the caller trusts. */
  color: string;
};

export type ActivityRingsProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Outer to inner, up to three. */
  rings: ActivityRing[];
  /** Diameter in px. The SVG scales down with its container. @default 200 */
  size?: number;
  /** Ring stroke width in px. @default 14 */
  thickness?: number;
  /** Formats values and goals in the legend. @default en-US thousands */
  format?: (value: number) => string;
  /** Names the figure; the per-ring sentences are appended to it. */
  "aria-label"?: string;
  className?: string;
};

const formatCount = (value: number): string =>
  Math.round(value).toLocaleString("en-US");

const formatPercent = (value: number): string => `${Math.round(value)}%`;

/** Ring gap as a fraction of the stroke, so the set stays proportional. */
const GAP_RATIO = 0.4;
/** A closed ring keeps going as a second, darker lap over the first. */
const SECOND_LAP_FILTER = "brightness(0.68)";
/** Rings that are not the isolated one fade to this rather than vanishing. */
const DIMMED = 0.22;

type RolledNumberProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * A number that rolls to its target on `glide`. The formatted text is a motion
 * value handed to the span as its child, so the roll runs outside React and
 * re-renders nothing; `tabular-nums` pins the cell width so moving digits can
 * never nudge the layout around them.
 */
function RolledNumber({
  value,
  format,
  motionSafe,
  className,
}: RolledNumberProps) {
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
    <span className={cn("font-mono tabular-nums", className)}>
      <span className="sr-only">{format(value)}</span>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  );
}

/**
 * Three nested rings, each closing on its own spring. Every ring fills to its
 * value on `glide` — the spring for a surface moving to a new place — staggered
 * one `cascade` step apart so they read as three separate measurements
 * arriving, not one animation. A ring past its goal keeps going as a darker
 * second lap laid over the first, which is the honest picture: the goal is met
 * and the surplus is still counted. The centre figure rolls its digits to
 * whichever ring is being read.
 *
 * The legend is a list of buttons: hovering or focusing a row isolates its ring
 * and dims the others, Enter or Space pins that isolation, and arrows walk the
 * rows with Home and End at the ends. The figure carries an aria-label sentence
 * per ring, so the whole reading is available without sight or a pointer. Under
 * reduced motion the rings are set without spring and only the dimming tweens.
 */
export function ActivityRings({
  ref,
  rings,
  size = 200,
  thickness = 14,
  format = formatCount,
  "aria-label": ariaLabel = "Activity rings",
  className,
}: ActivityRingsProps) {
  const motionSafe = useMotionSafe();
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const isolated = hovered ?? pinned;
  // Clamped, so a shorter rings array can never leave the legend without a
  // tab stop.
  const anchor = Math.min(focusIndex, Math.max(0, rings.length - 1));
  const active = rings.find((ring) => ring.id === isolated) ?? rings[0] ?? null;
  const centre = size / 2;
  const step = cascade(rings.length);

  const percentOf = (ring: ActivityRing) =>
    ring.goal === 0 ? 0 : (ring.value / ring.goal) * 100;

  const sentence = `${ariaLabel}. ${rings
    .map(
      (ring) =>
        `${ring.label}: ${format(ring.value)} of ${format(
          ring.goal,
        )}, ${Math.round(percentOf(ring))} percent.`,
    )
    .join(" ")}`;

  const focusAt = (index: number) => {
    const clamped = Math.min(rings.length - 1, Math.max(0, index));
    setFocusIndex(clamped);
    buttonRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(rings.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={ref}
      className={cn("flex w-full flex-col items-center gap-4", className)}
    >
      <div className="relative w-full" style={{ maxWidth: size }}>
        <svg
          role="img"
          aria-label={sentence}
          viewBox={`0 0 ${size} ${size}`}
          className="block w-full"
        >
          {/* A plain group carries the -90° turn so every ring starts at twelve
              o'clock; motion never touches this transform. */}
          <g transform={`rotate(-90 ${centre} ${centre})`}>
            {rings.map((ring, index) => {
              const radius =
                centre - thickness / 2 - index * thickness * (1 + GAP_RATIO);
              if (radius <= 0) return null;
              const laps = ring.goal === 0 ? 0 : ring.value / ring.goal;
              const first = Math.min(1, Math.max(0, laps));
              const second = Math.min(1, Math.max(0, laps - 1));
              const dimmed = isolated !== null && isolated !== ring.id;
              const fill = motionSafe
                ? { ...springs.glide, delay: index * step }
                : { duration: 0 };
              return (
                <motion.g
                  key={ring.id}
                  animate={{ opacity: dimmed ? DIMMED : 1 }}
                  initial={false}
                  transition={{
                    duration: durations.base,
                    ease: easings.enter,
                  }}
                >
                  <circle
                    cx={centre}
                    cy={centre}
                    r={radius}
                    fill="none"
                    stroke={ring.color}
                    strokeOpacity={0.16}
                    strokeWidth={thickness}
                  />
                  <motion.circle
                    cx={centre}
                    cy={centre}
                    r={radius}
                    fill="none"
                    stroke={ring.color}
                    strokeWidth={thickness}
                    strokeLinecap="round"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: first }}
                    transition={fill}
                  />
                  {second > 0 ? (
                    <motion.circle
                      cx={centre}
                      cy={centre}
                      r={radius}
                      fill="none"
                      stroke={ring.color}
                      strokeWidth={thickness}
                      strokeLinecap="round"
                      style={{ filter: SECOND_LAP_FILTER }}
                      initial={motionSafe ? { pathLength: 0 } : false}
                      animate={{ pathLength: second }}
                      transition={fill}
                    />
                  ) : null}
                </motion.g>
              );
            })}
          </g>
        </svg>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1"
        >
          {active ? (
            <RolledNumber
              value={percentOf(active)}
              format={formatPercent}
              motionSafe={motionSafe}
              className="text-xl leading-none font-medium text-foreground"
            />
          ) : null}
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {active?.label ?? "No rings"}
          </span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-0.5">
        {rings.map((ring, index) => {
          const held = pinned === ring.id;
          return (
            <li key={ring.id} className="flex">
              <button
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                type="button"
                aria-pressed={held}
                tabIndex={index === anchor ? 0 : -1}
                onClick={() => setPinned(held ? null : ring.id)}
                onFocus={() => {
                  setFocusIndex(index);
                  setHovered(ring.id);
                }}
                onBlur={() => setHovered(null)}
                onPointerEnter={() => setHovered(ring.id)}
                onPointerLeave={() => setHovered(null)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-2 px-2 text-left outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: ring.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {ring.label}
                </span>
                <span className="shrink-0 font-mono text-xs text-ink-2 tabular-nums">
                  {format(ring.value)} / {format(ring.goal)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
