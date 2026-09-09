"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WheelMover = { symbol: string; name: string; change: number };

export type WheelSector = {
  id: string;
  label: string;
  /** The sector's move in percent; its magnitude sizes the wedge. */
  change: number;
  movers: WheelMover[];
};

export type SectorWheelProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Clockwise from the notch. */
  sectors: WheelSector[];
  /** Controlled selected sector id. */
  value?: string;
  /** Initial selected sector id for uncontrolled usage. @default the first sector */
  defaultValue?: string;
  /** Fires from the press, key or release that chose a sector. */
  onValueChange?: (id: string) => void;
  /** Percent points added to every wedge so a flat sector keeps a readable slice. @default 0.5 */
  baseline?: number;
  /** Prints a move. */
  formatChange?: (percent: number) => string;
  /** Visible heading. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const defaultFormatChange = (percent: number) =>
  `${percent > 0 ? "+" : percent < 0 ? "-" : ""}${Math.abs(percent).toFixed(2)}%`;

const words = (percent: number) =>
  percent === 0
    ? "flat"
    : `${percent > 0 ? "up" : "down"} ${Math.abs(percent).toFixed(2)} percent`;

const toneText = (percent: number) =>
  percent > 0 ? "text-success" : percent < 0 ? "text-danger" : "text-ink-3";

/** Ring geometry in viewBox units. */
const SIZE = 200;
const CENTER = 100;
const RADIUS = 76;
const THICKNESS = 22;
/** The gap between wedges as a fraction of the rim. */
const GAP = 0.012;
/** Pixels of travel before a press becomes a spin. */
const DRAG_SLOP = 4;

/** Folds a turn into (-180, 180] so every spin takes the shorter way round. */
const shortest = (degrees: number) => (((degrees % 360) + 540) % 360) - 180;

/**
 * Shares reach `stroke-dasharray` and the ring's rotate on both sides of
 * hydration, so they are settled to six decimals before anything reads them.
 */
const round6 = (value: number) => Number(value.toFixed(6));

/** The pointer's bearing from a box's centre, in degrees, clockwise from three o'clock. */
const bearing = (box: DOMRect, x: number, y: number) =>
  (Math.atan2(y - box.top - box.height / 2, x - box.left - box.width / 2) *
    180) /
  Math.PI;

const STEP: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index) => index + 1,
  ArrowDown: (index) => index + 1,
  ArrowLeft: (index) => index - 1,
  ArrowUp: (index) => index - 1,
  Home: () => 0,
  End: (_, count) => count - 1,
};

type Wedge = WheelSector & { share: number; start: number; centre: number };

type Gesture = {
  id: number;
  x: number;
  y: number;
  angle: number;
  moved: boolean;
};

function Caret({ change }: { change: number }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn(
        "size-2.5 shrink-0",
        change < 0 && "rotate-180",
        change === 0 && "opacity-0",
      )}
    >
      <path d="M6 2.5 10 9H2Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Sectors, as wedges. Each sector's share of the ring is its absolute move plus
 * a small baseline, so the sectors that moved most take most of the wheel, and
 * every wedge is success- or danger-coloured by the sign of its move. A change
 * of data re-proportions the ring on `glide` — every wedge animates its
 * `pathLength` and `pathOffset` on the one spring, so the ring settles as a
 * body instead of six paths racing. Choosing a sector spins the wheel so that
 * wedge's centre sits under the fixed notch at twelve o'clock, on `snap` and
 * by the shorter way round: the one crisp overshoot is the wheel finding its
 * detent. The hub cross-fades to the chosen sector, and a measured panel
 * beneath glides open on that sector's movers, which arrive on a `cascade()`.
 *
 * The wheel can also be grabbed: after four pixels of travel the ring turns
 * live under the pointer, and release selects whichever wedge sits under the
 * notch. The SVG is decorative; the chips beneath are a real radiogroup with
 * a roving tabindex, so every spin the pointer can make the keys make too.
 * Under reduced motion wedges and rotation set without a spring, the hub still
 * cross-fades by opacity and the movers appear in place.
 */
export function SectorWheel({
  ref,
  sectors,
  value,
  defaultValue,
  onValueChange,
  baseline = 0.5,
  formatChange = defaultFormatChange,
  label,
  className,
  "aria-label": ariaLabel,
}: SectorWheelProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? sectors[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const wedges = React.useMemo<Wedge[]>(() => {
    const sizes = sectors.map(
      (s) => Math.abs(s.change) + Math.max(0, baseline),
    );
    const total = sizes.reduce((sum, size) => sum + size, 0) || 1;
    return sectors.reduce<Wedge[]>((list, sector, index) => {
      const share = round6((sizes[index] ?? 0) / total);
      const start = round6(list.reduce((sum, w) => sum + w.share, 0));
      return [
        ...list,
        { ...sector, share, start, centre: round6(start + share / 2) },
      ];
    }, []);
  }, [sectors, baseline]);

  const selectedIndex = Math.max(
    0,
    wedges.findIndex((w) => w.id === current),
  );
  const selected = wedges[selectedIndex];
  const centre = selected?.centre ?? 0;

  const select = (id: string) => {
    if (id === current) return;
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  // The ring's turn is a motion value so a drag can set it every move and the
  // detent spring can start from wherever the hand let go.
  const rotate = useMotionValue(-centre * 360);
  const spin = React.useRef<ReturnType<typeof animate> | null>(null);
  const spinTo = React.useCallback(
    (fraction: number, transition: Transition) => {
      const from = rotate.get();
      spin.current?.stop();
      spin.current = animate(
        rotate,
        from + shortest(-fraction * 360 - from),
        transition,
      );
    },
    [rotate],
  );

  const gesture = React.useRef<Gesture | null>(null);
  const previousId = React.useRef(current);

  React.useEffect(() => {
    const changed = previousId.current !== current;
    previousId.current = current;
    // A live drag owns the ring; a data tick underneath it must not snatch it.
    if (gesture.current?.moved) return;
    // A chosen sector snaps to its detent; a re-proportioned ring glides so the
    // sector already under the notch stays there.
    spinTo(
      centre,
      motionSafe ? (changed ? springs.snap : springs.glide) : { duration: 0 },
    );
    return () => spin.current?.stop();
  }, [current, centre, motionSafe, spinTo]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      angle: bearing(box, event.clientX, event.clientY),
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.moved) {
      const travel = Math.hypot(
        event.clientX - active.x,
        event.clientY - active.y,
      );
      if (travel < DRAG_SLOP) return;
      active.moved = true;
      spin.current?.stop();
      try {
        // Capture only once the press has become a spin, so a plain click on
        // a wedge still lands — and never throw on a synthetic sweep.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    const box = event.currentTarget.getBoundingClientRect();
    const angle = bearing(box, event.clientX, event.clientY);
    rotate.set(rotate.get() + shortest(angle - active.angle));
    active.angle = angle;
  };

  const finishGesture = (
    event: React.PointerEvent<HTMLDivElement>,
    commit: boolean,
  ) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    if (!active.moved) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
    const under = (((-rotate.get() / 360) % 1) + 1) % 1;
    const hit = commit
      ? wedges.find((w) => under >= w.start && under < w.start + w.share)
      : undefined;
    if (hit && hit.id !== current) select(hit.id);
    else
      spinTo(
        hit?.centre ?? centre,
        motionSafe ? springs.snap : { duration: 0 },
      );
  };

  const chipRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const step = STEP[event.key];
    if (event.key === " ") {
      event.preventDefault();
      select(wedges[index]?.id ?? current);
      return;
    }
    if (!step) return;
    event.preventDefault();
    const next = Math.min(
      wedges.length - 1,
      Math.max(0, step(index, wedges.length)),
    );
    const wedge = wedges[next];
    if (!wedge) return;
    chipRefs.current[next]?.focus();
    select(wedge.id);
  };

  // The movers panel is measured, never reserved: the observer reports the
  // list's true height and the wrapper glides to it.
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPanelHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const movers = React.useMemo(
    () =>
      [...(selected?.movers ?? [])].sort(
        (a, b) => Math.abs(b.change) - Math.abs(a.change),
      ),
    [selected],
  );
  const top = movers[0];
  const stagger = cascade(movers.length);
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-4", className)}>
      {label ? (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      ) : null}

      <div
        aria-hidden
        // Clipped: the wheel is a square that turns, and its corners would
        // otherwise widen the page's scrollable box by the rotation's bound.
        className="relative mx-auto aspect-square w-full max-w-[14rem] cursor-grab touch-none overflow-clip select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishGesture(event, true)}
        onPointerCancel={(event) => finishGesture(event, false)}
      >
        <motion.div className="absolute inset-0" style={{ rotate }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full">
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="var(--hairline)"
              strokeWidth={THICKNESS}
            />
            {/* The circle path starts at three o'clock; the group turns it so
                the wedges run clockwise from the notch. */}
            <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
              {wedges.map((wedge) => (
                <motion.circle
                  key={wedge.id}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="butt"
                  strokeWidth={THICKNESS}
                  className={cn("cursor-pointer", toneText(wedge.change))}
                  onClick={() => select(wedge.id)}
                  initial={false}
                  animate={{
                    pathLength: Math.max(0, wedge.share - GAP),
                    pathOffset: wedge.start + GAP / 2,
                    opacity: wedge.id === current ? 1 : 0.45,
                  }}
                  transition={
                    motionSafe
                      ? {
                          pathLength: springs.glide,
                          pathOffset: springs.glide,
                          opacity: fade,
                        }
                      : { duration: 0, opacity: fade }
                  }
                />
              ))}
            </g>
          </svg>
        </motion.div>

        <svg
          viewBox="0 0 12 8"
          className="absolute top-0 left-1/2 w-3 -translate-x-1/2 text-ink"
        >
          <path d="M0 0h12L6 8Z" fill="currentColor" />
        </svg>

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="grid text-center">
            <AnimatePresence initial={false}>
              {selected ? (
                <motion.div
                  key={selected.id}
                  className="col-start-1 row-start-1 flex flex-col items-center gap-0.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={fade}
                >
                  <span className="text-sm font-semibold text-ink">
                    {selected.label}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 font-mono text-xs tabular-nums",
                      toneText(selected.change),
                    )}
                  >
                    <Caret change={selected.change} />
                    {formatChange(selected.change)}
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-wrap gap-2"
      >
        {wedges.map((wedge, index) => {
          const checked = wedge.id === current;
          return (
            <button
              key={wedge.id}
              ref={(node) => {
                chipRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${wedge.label}, ${words(wedge.change)}`}
              tabIndex={index === selectedIndex ? 0 : -1}
              onClick={() => select(wedge.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-hairline-strong bg-surface-1 text-ink-2 hover:bg-accent hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  wedge.change > 0
                    ? "bg-success"
                    : wedge.change < 0
                      ? "bg-danger"
                      : "bg-ink-3",
                )}
              />
              <span>{wedge.label}</span>
              <span aria-hidden className="font-mono text-[11px] tabular-nums">
                {formatChange(wedge.change)}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={panelHeight === null ? undefined : { height: panelHeight }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div ref={panelRef}>
          {selected ? (
            <ol
              key={selected.id}
              aria-label={`${selected.label} movers`}
              className="flex flex-col gap-1 border-t border-hairline pt-3"
            >
              {movers.map((mover, index) => (
                <motion.li
                  key={mover.symbol}
                  className="flex h-8 items-center gap-2 rounded-2 px-2"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          delay: index * stagger,
                          opacity: { ...fade, delay: index * stagger },
                        }
                      : fade
                  }
                >
                  <span className="w-10 shrink-0 font-mono text-xs font-semibold text-ink">
                    {mover.symbol}
                  </span>
                  <span
                    title={mover.name}
                    className="min-w-0 flex-1 truncate text-xs text-ink-3"
                  >
                    {mover.name}
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums",
                      toneText(mover.change),
                    )}
                  >
                    <Caret change={mover.change} />
                    <span className="sr-only">{words(mover.change)}, </span>
                    {formatChange(mover.change)}
                  </span>
                </motion.li>
              ))}
            </ol>
          ) : null}
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {selected
          ? `${selected.label}, ${words(selected.change)}.${top ? ` Top mover ${top.symbol}, ${words(top.change)}.` : ""}`
          : ""}
      </span>
    </div>
  );
}
