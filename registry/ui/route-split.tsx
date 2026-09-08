"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RouteLeg = {
  id: string;
  /** Venue the leg goes through. */
  venue: string;
  /** Weight of this leg; the component normalises the set. */
  share: number;
};

export type RouteSplitProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The roads, in draw order. */
  legs: RouteLeg[];
  /** The total being routed; each road carries `amount × share`. */
  amount: number;
  /** Source ticker, printed in the left pill. */
  from: string;
  /** Destination ticker, printed in the right pill. */
  to: string;
  /** Formats every amount, in the legend and in the spoken sentences. */
  format?: (value: number) => string;
  /** Controlled pinned leg. */
  value?: string | null;
  /** Initially pinned leg for uncontrolled usage. @default null */
  defaultValue?: string | null;
  /** Fires from the press or the Escape that changed the pin. */
  onValueChange?: (id: string | null) => void;
  /** Fires whenever the read leg changes — by hover, focus or pin. */
  onActiveChange?: (id: string | null) => void;
  /** Runs the dash flow. @default true */
  flowing?: boolean;
  /** Diagram height in px; the width is fluid and measured. @default 104 */
  height?: number;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** One dash plus one gap, in px — the flow travels exactly this per cycle. */
const DASH_CYCLE = 18;
/** Thinnest and thickest road, so a 2% leg is still a road and a 90% one still fits. */
const MIN_STROKE = 2;
const MAX_STROKE = 14;

const units = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const defaultFormat = (value: number) => units.format(value);

const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** SVG numbers are rounded before they reach an attribute: Node and the browser
 *  can disagree in the last digits, and a mismatched attribute is a hydration
 *  error rather than a rounding difference. */
const round = (value: number) => Number(value.toFixed(3));

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab has no rAF, so an ambient loop there is work nobody sees. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

type RoadProps = {
  d: string;
  width: number;
  flow: MotionValue<number>;
  /** Fatter roads carry faster, so the picture reads as volume, not decoration. */
  speed: number;
  tone: string;
  dashed: boolean;
  motionSafe: boolean;
};

/**
 * One road. The dash offset is a transform of a single shared motion value, so
 * every road flows off one animation rather than one per leg.
 */
function Road({ d, width, flow, speed, tone, dashed, motionSafe }: RoadProps) {
  const offset = useTransform(flow, (value) => value * speed);
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeDasharray={dashed ? "10 8" : undefined}
      style={dashed ? { strokeDashoffset: offset } : undefined}
      className={cn("transition-colors duration-150", tone)}
      initial={false}
      animate={{ strokeWidth: width }}
      transition={
        motionSafe
          ? springs.glide
          : { duration: durations.fast, ease: easings.move }
      }
    />
  );
}

/**
 * One trade, drawn as the several roads it actually takes. Each leg is a curve
 * whose stroke width is its share, so the picture is the split rather than an
 * illustration of it, and the amount moves along it as a flowing dash on a
 * linear ease — roads that carry, not roads that merely connect. A changed
 * split re-lays the widths on `glide`, one quantity settling over 450ms.
 *
 * The legend is the accessible surface: real buttons on a roving tabindex, each
 * named by a sentence carrying its share and amount. Hovering or focusing a row
 * lifts its road and dims the rest; pressing pins the reading so the pointer can
 * leave, and Escape unpins. Under reduced motion the roads draw solid and still
 * carry their widths, because the split is the information.
 */
export function RouteSplit({
  ref,
  legs,
  amount,
  from,
  to,
  format = defaultFormat,
  value,
  defaultValue = null,
  onValueChange,
  onActiveChange,
  flowing = true,
  height = 104,
  label,
  className,
  "aria-label": ariaLabel,
}: RouteSplitProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const plotRef = React.useRef<HTMLDivElement>(null);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = node.offsetWidth;
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const total = legs.reduce((sum, leg) => sum + Math.max(0, leg.share), 0) || 1;
  const shares = legs.map((leg) => Math.max(0, leg.share) / total);

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const pinned = isControlled ? value : uncontrolled;

  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [roving, setRoving] = React.useState(0);
  // Clamped rather than stored clamped: a legend that loses legs must still
  // keep exactly one button in the tab order.
  const rovingIndex = Math.min(roving, Math.max(legs.length - 1, 0));

  // Hover and focus preview on top of the pin without disturbing it.
  const activeId = hovered ?? focused ?? pinned ?? null;
  const activeIndex = legs.findIndex((leg) => leg.id === activeId);

  const changeRef = React.useRef(onActiveChange);
  React.useEffect(() => {
    changeRef.current = onActiveChange;
  }, [onActiveChange]);

  // Seeded with the first render's value so a mount reports nothing; the
  // callback then fires from the effect the hover, focus or press scheduled,
  // never from a state updater and never during render.
  const reportedRef = React.useRef<string | null>(activeId);
  React.useEffect(() => {
    if (reportedRef.current === activeId) return;
    reportedRef.current = activeId;
    changeRef.current?.(activeId);
  }, [activeId]);

  const pin = (next: string | null) => {
    if (next === pinned) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const flow = useMotionValue(0);
  React.useEffect(() => {
    if (!motionSafe || !flowing || !visible) return;
    // Restarted from zero each time it re-arms: the cycle is periodic, so the
    // jump is invisible, and animating from the value it stopped at would
    // otherwise be a loop of no travel at all.
    flow.set(0);
    const controls = animate(flow, -DASH_CYCLE, {
      duration: 1.1,
      ease: easings.linear,
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [motionSafe, flowing, visible, flow]);

  const count = legs.length;
  const cy = height / 2;
  const pad = MAX_STROKE / 2 + 2;
  const laneY = (index: number) =>
    count <= 1
      ? cy
      : pad + ((index + 0.5) * (height - pad * 2)) / Math.max(count, 1);

  const pathFor = (index: number) => {
    const y = round(laneY(index));
    const w = round(width);
    return [
      `M 0 ${round(cy)}`,
      `C ${round(width * 0.3)} ${round(cy)} ${round(width * 0.16)} ${y} ${round(width * 0.5)} ${y}`,
      `C ${round(width * 0.84)} ${y} ${round(width * 0.7)} ${round(cy)} ${w} ${round(cy)}`,
    ].join(" ");
  };

  const strokeFor = (share: number) =>
    MIN_STROKE + share * (MAX_STROKE - MIN_STROKE);

  const focusRow = (index: number) => {
    const clamped = Math.min(count - 1, Math.max(0, index));
    setRoving(clamped);
    buttonRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusRow(index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusRow(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRow(0);
        break;
      case "End":
        event.preventDefault();
        focusRow(count - 1);
        break;
      case "Escape":
        if (pinned === null) return;
        event.preventDefault();
        pin(null);
        break;
      default:
        break;
    }
  };

  const activeLeg = activeIndex >= 0 ? legs[activeIndex] : undefined;
  const activeShare = activeIndex >= 0 ? (shares[activeIndex] ?? 0) : 0;
  const pinnedIndex = legs.findIndex((leg) => leg.id === pinned);
  const pinnedLeg = pinnedIndex >= 0 ? legs[pinnedIndex] : undefined;
  const pinnedShare = pinnedIndex >= 0 ? (shares[pinnedIndex] ?? 0) : 0;
  const chipTop = Math.min(
    Math.max(laneY(Math.max(activeIndex, 0)) - 11, 0),
    Math.max(height - 22, 0),
  );

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-xs font-medium tabular-nums">
          {format(amount)}
          <span className="ml-1 text-ink-3">{from}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="flex h-8 min-w-12 shrink-0 items-center justify-center rounded-2 border border-hairline bg-surface-2 px-2 font-mono text-[11px] font-medium whitespace-nowrap">
          {from}
        </span>

        <div
          ref={plotRef}
          className="relative min-w-0 flex-1"
          style={{ height }}
        >
          {width > 0 ? (
            <svg
              aria-hidden
              width={width}
              height={height}
              viewBox={`0 0 ${round(width)} ${round(height)}`}
              className="absolute inset-0 block"
            >
              {legs.map((leg, index) => {
                const isActive = leg.id === activeId || activeId === null;
                return (
                  <Road
                    key={leg.id}
                    d={pathFor(index)}
                    width={strokeFor(shares[index] ?? 0)}
                    flow={flow}
                    speed={0.6 + (shares[index] ?? 0)}
                    tone={
                      isActive ? "text-cobalt-bright" : "text-hairline-strong"
                    }
                    dashed={motionSafe}
                    motionSafe={motionSafe}
                  />
                );
              })}
            </svg>
          ) : null}

          <AnimatePresence initial={false}>
            {activeLeg ? (
              <motion.span
                key={activeLeg.id}
                aria-hidden
                className="absolute left-1/2 max-w-full -translate-x-1/2 truncate rounded-full border border-hairline-strong bg-popover px-2 py-0.5 font-mono text-[10px] font-medium text-popover-foreground shadow-raised"
                style={{ top: chipTop }}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? springs.snap
                    : { duration: durations.fast, ease: easings.enter }
                }
              >
                {activeLeg.venue} · {percent.format(activeShare * 100)}%
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <span className="flex h-8 min-w-12 shrink-0 items-center justify-center rounded-2 border border-hairline bg-surface-2 px-2 font-mono text-[11px] font-medium whitespace-nowrap">
          {to}
        </span>
      </div>

      <ul
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-col gap-0.5"
      >
        {legs.map((leg, index) => {
          const share = shares[index] ?? 0;
          const isActive = leg.id === activeId;
          const isPinned = leg.id === pinned;
          return (
            <li key={leg.id}>
              <button
                type="button"
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                tabIndex={index === rovingIndex ? 0 : -1}
                aria-pressed={isPinned}
                aria-label={`${leg.venue}, ${percent.format(share * 100)} percent, ${format(
                  amount * share,
                )} ${from}`}
                onClick={() => {
                  setRoving(index);
                  pin(isPinned ? null : leg.id);
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onPointerEnter={() => setHovered(leg.id)}
                onPointerLeave={() =>
                  setHovered((prev) => (prev === leg.id ? null : prev))
                }
                onFocus={() => setFocused(leg.id)}
                onBlur={() =>
                  setFocused((prev) => (prev === leg.id ? null : prev))
                }
                className={cn(
                  "relative flex h-9 w-full items-center gap-2 overflow-hidden rounded-2 px-2 text-left transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isActive ? "bg-accent" : "hover:bg-accent",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "w-3.5 shrink-0 rounded-full transition-colors",
                    isActive || activeId === null
                      ? "bg-cobalt-bright"
                      : "bg-hairline-strong",
                  )}
                  style={{ height: Math.round(strokeFor(share)) }}
                />
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  title={leg.venue}
                >
                  {leg.venue}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums">
                  {percent.format(share * 100)}%
                  <span className="ml-1.5 text-ink-3">
                    {format(amount * share)}
                  </span>
                </span>
                <motion.span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-px origin-left transition-colors",
                    isActive || activeId === null
                      ? "bg-cobalt-bright"
                      : "bg-hairline-strong",
                  )}
                  initial={false}
                  animate={{ scaleX: share }}
                  transition={
                    motionSafe
                      ? springs.glide
                      : { duration: durations.fast, ease: easings.move }
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Announced once a road is pinned; a hover sweep says nothing, because a
          pointer crossing the legend is not a decision. */}
      <span role="status" className="sr-only">
        {pinnedLeg
          ? `Routing ${format(amount * pinnedShare)} ${from} through ${pinnedLeg.venue}`
          : ""}
      </span>
    </div>
  );
}
