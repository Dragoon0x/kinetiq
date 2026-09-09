"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
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

export type SafetyLevel = "open" | "guarded" | "strict";

export type DialTool = {
  id: string;
  name: string;
  /** Locked while the dial sits at Strict. */
  strictLocks?: boolean;
};

export type SafetyDialProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled level. */
  value?: SafetyLevel;
  /** Initial level for uncontrolled usage. @default "guarded" */
  defaultValue?: SafetyLevel;
  /** Fires from the press, drag or key that moved the needle, with the ids locked at the new level. */
  onValueChange?: (level: SafetyLevel, lockedToolIds: string[]) => void;
  /** One sentence per stop, shown beneath the dial. */
  descriptions?: Partial<Record<SafetyLevel, string>>;
  /** The rail beneath the description; flagged tools lock at Strict. @default [] */
  tools?: DialTool[];
  /** Names the dial. */
  label: string;
  className?: string;
};

const LEVELS: { value: SafetyLevel; name: string }[] = [
  { value: "open", name: "Open" },
  { value: "guarded", name: "Guarded" },
  { value: "strict", name: "Strict" },
];

const COPY: Record<SafetyLevel, string> = {
  open: "Answers directly and uses every tool it has. For trusted, internal work.",
  guarded:
    "Checks before acting on anything it cannot undo and flags uncertain claims.",
  strict:
    "Refuses risky requests, cites every claim and keeps the flagged tools locked.",
};

const NO_TOOLS: DialTool[] = [];
/** Face geometry in viewBox units: the pivot, the arc radius, the stop spacing. */
const CX = 100;
const CY = 108;
const R = 84;
const VIEW_H = 124;
const STOP_DEG = 60;

const round3 = (n: number) => Number(n.toFixed(3));
/** A point on the face at `deg` from straight up, clockwise, `r` from the pivot. */
const pointAt = (deg: number, r: number): [number, number] => {
  const rad = (deg * Math.PI) / 180;
  return [round3(CX + r * Math.sin(rad)), round3(CY - r * Math.cos(rad))];
};
const ARC_START = pointAt(-STOP_DEG, R);
const ARC_END = pointAt(STOP_DEG, R);
/** Ticks every ten degrees; the three stops sit longer and heavier. */
const TICKS = Array.from({ length: 13 }, (_, i) => {
  const deg = -STOP_DEG + i * 10;
  const stop = deg % STOP_DEG === 0;
  return {
    deg,
    stop,
    from: pointAt(deg, stop ? R - 22 : R - 16),
    to: pointAt(deg, R - 10),
  };
});

/** Locked is drawn, not merely dimmed — hatching survives both themes and colour blindness. */
const HATCH =
  "repeating-linear-gradient(-45deg, var(--hairline-strong) 0 1px, transparent 1px 6px)";

/**
 * A three-stop dial for how careful the model should be. The needle glides
 * to the chosen stop on `glide` — a surface coming to rest, no overshoot —
 * driven by one motion value written straight to the needle's transform, so
 * no frame re-renders React. Beneath the face the stop's description slides
 * to match: it enters from the side the needle moved toward on `snap` while
 * the old one leaves on the exit ease, inside a cell whose height is measured
 * and glides. The strictest stop locks the flagged tools: a padlock lands on
 * each on `flick` — firm, because a lock is a confirmation — under a hatch
 * that fades in; loosening the dial lifts them.
 *
 * The stops are a radio group with a roving tabindex: arrows move one stop
 * without wrapping, Home and End jump, Space and Enter select. The face is
 * art a press can also aim at: the stop nearest the pointer's bearing from
 * the pivot is chosen, with no capture to swallow a click. The status region
 * speaks the stop and what it locks. Under reduced motion the needle swaps
 * to its stop, the description cross-fades and the locks still appear.
 */
export function SafetyDial({
  ref,
  value,
  defaultValue = "guarded",
  onValueChange,
  descriptions,
  tools = NO_TOOLS,
  label,
  className,
}: SafetyDialProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const stopId = (level: SafetyLevel) => `${baseId}-stop-${level}`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const current = value ?? uncontrolled;
  const currentIndex = Math.max(
    0,
    LEVELS.findIndex((level) => level.value === current),
  );
  const target = (currentIndex - 1) * STOP_DEG;

  // Direction the description slides from, derived from the last committed
  // index so a controlled change slides the same way a press does.
  const [slideFrom, setSlideFrom] = React.useState({
    index: currentIndex,
    dir: 1,
  });
  if (slideFrom.index !== currentIndex) {
    setSlideFrom({
      index: currentIndex,
      dir: currentIndex > slideFrom.index ? 1 : -1,
    });
  }
  const dir = slideFrom.dir;

  const lockedIds = (level: SafetyLevel) =>
    level === "strict"
      ? tools.filter((tool) => tool.strictLocks).map((tool) => tool.id)
      : [];
  const locked = new Set(lockedIds(current));
  const [announcement, setAnnouncement] = React.useState("");

  const select = (index: number) => {
    const next = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index))];
    if (!next || next.value === current) return;
    if (value === undefined) setUncontrolled(next.value);
    const ids = lockedIds(next.value);
    const names = tools
      .filter((tool) => ids.includes(tool.id))
      .map((tool) => tool.name);
    setAnnouncement(
      `${next.name}. ${names.length ? `Locks ${names.join(" and ")}.` : "All tools open."}`,
    );
    onValueChange?.(next.value, ids);
  };

  // The needle: one motion value, animated on glide and written to the
  // transform attribute on change. React renders the mount angle once and
  // never rewrites it, so no frame is ever painted at the wrong stop.
  const needleRef = React.useRef<SVGGElement | null>(null);
  const angle = useMotionValue(target);
  const [mountAngle] = React.useState(target);
  useMotionValueEvent(angle, "change", (deg) => {
    needleRef.current?.setAttribute(
      "transform",
      `rotate(${round3(deg)} ${CX} ${CY})`,
    );
  });
  React.useEffect(() => {
    const controls = animate(
      angle,
      target,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [angle, target, motionSafe]);

  // The description cell's border-box height, read by the observer only.
  const copyRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = copyRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const faceRef = React.useRef<HTMLDivElement | null>(null);

  /** A press on the face picks the stop nearest the pointer's bearing. */
  const onFacePress = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = faceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const px = rect.left + rect.width * (CX / 200);
    const py = rect.top + rect.height * (CY / VIEW_H);
    const deg =
      (Math.atan2(event.clientX - px, py - event.clientY) * 180) / Math.PI;
    select(Math.round(deg / STOP_DEG) + 1);
  };

  const onStopKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const moves: Record<string, number | undefined> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: LEVELS.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const level = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, next))];
    if (level) document.getElementById(stopId(level.value))?.focus();
    select(next);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  // Variants read the latest direction through `custom`, so a paragraph that
  // is already leaving still exits toward the side the needle just left.
  const slide = {
    enter: (d: number) =>
      motionSafe ? { opacity: 0, x: d * distances.step } : { opacity: 0 },
    rest: { opacity: 1, x: 0 },
    exit: (d: number) => ({
      opacity: 0,
      x: motionSafe ? -d * distances.step : 0,
      transition: exitFor(durations.fast),
    }),
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {LEVELS[currentIndex]?.name}
        </span>
      </div>

      <div
        ref={faceRef}
        aria-hidden
        className="mx-auto w-full max-w-64 cursor-pointer select-none"
        onClick={onFacePress}
      >
        <svg viewBox={`0 0 200 ${VIEW_H}`} className="block h-auto w-full">
          <path
            d={`M${ARC_START.join(" ")}A${R} ${R} 0 0 1 ${ARC_END.join(" ")}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className="text-hairline-strong"
          />
          {TICKS.map((tick) => (
            <line
              key={tick.deg}
              x1={tick.from[0]}
              y1={tick.from[1]}
              x2={tick.to[0]}
              y2={tick.to[1]}
              stroke="currentColor"
              strokeWidth={tick.stop ? 2.5 : 1.5}
              strokeLinecap="round"
              className={cn(
                "transition-colors duration-300",
                tick.stop && tick.deg === target
                  ? "text-cobalt-bright"
                  : tick.stop
                    ? "text-ink-3"
                    : "text-hairline-strong",
              )}
            />
          ))}
          <g ref={needleRef} transform={`rotate(${mountAngle} ${CX} ${CY})`}>
            <path
              d={`M${CX - 3} ${CY}L${CX} ${CY - 60}L${CX + 3} ${CY}Z`}
              className="fill-cobalt-bright"
            />
            <path
              d={`M${CX - 3} ${CY}L${CX} ${CY + 10}L${CX + 3} ${CY}Z`}
              className="fill-ink-3"
            />
          </g>
          <circle
            cx={CX}
            cy={CY}
            r="5"
            strokeWidth="1.5"
            className="fill-surface-0 stroke-hairline-strong"
          />
        </svg>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-3 gap-2"
      >
        {LEVELS.map((level, index) => {
          const checked = index === currentIndex;
          return (
            <button
              key={level.value}
              type="button"
              role="radio"
              id={stopId(level.value)}
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => onStopKeyDown(event, index)}
              className={cn(
                "flex h-8 items-center justify-center rounded-2 border px-2 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "border-cobalt-bright/50 bg-cobalt-wash text-foreground"
                  : "border-hairline-strong text-ink-2 hover:bg-accent hover:text-foreground",
              )}
            >
              {level.name}
            </button>
          );
        })}
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="relative overflow-hidden"
      >
        <div ref={copyRef} className="relative">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.p
              key={current}
              custom={dir}
              variants={slide}
              initial="enter"
              animate="rest"
              exit="exit"
              transition={
                motionSafe ? { ...springs.snap, opacity: fade } : fade
              }
              className="text-xs leading-5 text-ink-2"
            >
              {descriptions?.[current] ?? COPY[current]}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>

      {tools.length ? (
        <ul aria-label="Tools" className="flex flex-wrap gap-1.5">
          {tools.map((tool) => {
            const isLocked = locked.has(tool.id);
            return (
              <li
                key={tool.id}
                aria-label={isLocked ? `${tool.name}, locked` : tool.name}
                style={{ backgroundImage: isLocked ? HATCH : undefined }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-xs transition-colors",
                  isLocked
                    ? "border-hairline text-ink-3"
                    : "border-hairline-strong bg-surface-0 text-ink-2",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full transition-colors",
                    isLocked ? "bg-hairline-strong" : "bg-cobalt-bright",
                  )}
                />
                {tool.name}
                <AnimatePresence initial={false}>
                  {isLocked ? (
                    <motion.svg
                      key="lock"
                      viewBox="0 0 16 16"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      className="size-3 shrink-0"
                      initial={
                        motionSafe ? { opacity: 0, scale: 0.7 } : { opacity: 0 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe ? { ...springs.flick, opacity: fade } : fade
                      }
                    >
                      <rect x="3.5" y="7" width="9" height="6" rx="1.5" />
                      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
                    </motion.svg>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      ) : null}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
