"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShufflePot = { id: string; name: string; balance: number };

export type PotShuffleProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled pots. */
  pots?: ShufflePot[];
  /** Initial pots for uncontrolled usage. */
  defaultPots?: ShufflePot[];
  /** Fires when a move lands, with the whole new row. */
  onPotsChange?: (next: ShufflePot[]) => void;
  /** Fires alongside it with just the move. */
  onMove?: (from: string, to: string, amount: number) => void;
  /** Money moved by one drop, clamped to what the source holds. @default 50 */
  step?: number;
  /** Formats every figure. */
  format?: (value: number) => string;
  /** Names the row. @default "Pots" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on every figure in the row.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const defaultFormat = (value: number): string => MONEY.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const NO_POTS: ShufflePot[] = [];

/** Pointer travel before a press becomes a drag, so a tap still lifts and drops. */
const DRAG_SLOP = 4;
/** Half the coin's 28px body — the offset that centres it on a point. */
const COIN_HALF = 14;
/** How far the coin sinks past the lip when it lands. */
const DIP = 14;

/** Capture throws on a synthetic pointer id; the gesture works without it. */
const setCapture = (node: Element, pointerId: number, on: boolean) => {
  try {
    if (on) node.setPointerCapture(pointerId);
    else if (node.hasPointerCapture(pointerId)) {
      node.releasePointerCapture(pointerId);
    }
  } catch {
    // A sweep from the test suite has no capture target; the drag continues.
  }
};

/** The pot under a point, if any. A synthetic sweep may report none. */
const potAt = (x: number, y: number): string | null => {
  try {
    return (
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-pot]")
        ?.dataset.pot ?? null
    );
  } catch {
    return null;
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Keeps the latest row out of the flight's closure so a landing reads the truth. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Digit columns that roll to the new figure on `snap` — one strip of ten faces
 * per column moved by a percentage of its own height, so the layout never
 * shifts. Hidden from assistive technology: the pot's name carries the amount.
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

type Flight = { seq: number; from: string; to: string; amount: number };

/**
 * A row of savings jars. Each holds a liquid at its share of the fullest pot
 * and a figure beneath. Pressing a jar and dragging past 4px lifts a coin of
 * `step` under the pointer — two motion values, no renders — and tilts the
 * source jar toward the pointer, the way a jar tips to pour. Releasing over
 * another jar commits the move: the coin flies along an arc to the target's
 * lip, a progress value on `glide` mapped to a parabola, then drops in on
 * `recoil` with the two bounces of a splash; the target jar lands on the same
 * spring, the levels glide to their new shares and both figures roll their
 * digits on `snap` at that moment, not before. Released anywhere else, the coin
 * walks home and nothing changes.
 *
 * The keyboard runs the same move: Enter or Space lifts a coin from the
 * focused jar, Arrow keys walk the row, Enter or Space drops it, Escape puts it
 * back — and every step is announced. Under reduced motion there is no tilt
 * and no arc: the coin waits on its jar and fades at the drop, the levels move
 * on a tween and the figures swap their digits in place.
 */
export function PotShuffle({
  ref,
  pots,
  defaultPots,
  onPotsChange,
  onMove,
  step = 50,
  format = defaultFormat,
  label = "Pots",
  className,
}: PotShuffleProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState<ShufflePot[]>(
    defaultPots ?? NO_POTS,
  );
  const isControlled = pots !== undefined;
  const list = isControlled ? pots : uncontrolled;
  const listRef = useLatest(list);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const dragRef = React.useRef<{
    pointerId: number;
    node: HTMLElement;
    id: string;
    startX: number;
    startY: number;
    originX: number;
    moved: boolean;
  } | null>(null);
  const swallowClick = React.useRef(false);
  const runningRef = React.useRef<ReturnType<typeof animate>[]>([]);

  const [held, setHeld] = React.useState<string | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const [landed, setLanded] = React.useState<Flight | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  const coinX = useMotionValue(0);
  const coinY = useMotionValue(0);
  const coinOpacity = useMotionValue(1);
  const progress = useMotionValue(0);
  const tilt = useMotionValue(0);
  // Jars that are not pouring read a constant value of the same kind, so the
  // style never flips between a number and a motion value across renders.
  const upright = useMotionValue(0);

  const stopAll = () => {
    runningRef.current.forEach((controls) => controls.stop());
    runningRef.current = [];
  };
  React.useEffect(() => stopAll, []);

  /** A jar's lip centre in the wrapper's space — measured in events, never in render. */
  const lipOf = (id: string) => {
    const root = rootRef.current;
    const lip = root?.querySelector<HTMLElement>(
      `[data-pot="${CSS.escape(id)}"] [data-lip]`,
    );
    if (!root || !lip) return null;
    const rootBox = root.getBoundingClientRect();
    const box = lip.getBoundingClientRect();
    return {
      x: box.left - rootBox.left + box.width / 2 - COIN_HALF,
      y: box.top - rootBox.top + box.height / 2 - COIN_HALF,
    };
  };

  const lift = (id: string) => {
    if (flight) return;
    stopAll();
    const at = lipOf(id);
    if (at) {
      coinX.set(at.x);
      coinY.set(at.y);
    }
    coinOpacity.set(1);
    tilt.set(0);
    setHeld(id);
    const name = list.find((pot) => pot.id === id)?.name ?? id;
    setAnnouncement(`Lifted ${format(step)} from ${name}. Choose a pot.`);
  };

  const putDown = () => {
    setHeld(null);
    setOverId(null);
  };

  const cancel = (announce = true) => {
    if (held === null) return;
    if (announce) setAnnouncement("Move cancelled.");
    stopAll();
    runningRef.current.push(animate(tilt, 0, springs.glide));
    const home = motionSafe ? lipOf(held) : null;
    if (!home) return putDown();
    runningRef.current.push(
      animate(coinX, home.x, springs.glide),
      animate(coinY, home.y, { ...springs.glide, onComplete: putDown }),
    );
  };

  const commit = (move: Flight) => {
    const next = listRef.current.map((pot) =>
      pot.id === move.from
        ? { ...pot, balance: pot.balance - move.amount }
        : pot.id === move.to
          ? { ...pot, balance: pot.balance + move.amount }
          : pot,
    );
    if (!isControlled) setUncontrolled(next);
    onPotsChange?.(next);
    onMove?.(move.from, move.to, move.amount);
    setFlight(null);
    setLanded(move);
    const from = next.find((pot) => pot.id === move.from);
    const to = next.find((pot) => pot.id === move.to);
    if (from && to) {
      setAnnouncement(
        `Moved ${format(move.amount)} from ${from.name} to ${to.name}. ${from.name} ${format(from.balance)}, ${to.name} ${format(to.balance)}.`,
      );
    }
  };

  const drop = (toId: string) => {
    const from = list.find((pot) => pot.id === held);
    if (held === null || !from || held === toId) return cancel();
    const amount = Math.min(step, Math.max(0, from.balance));
    if (amount <= 0) {
      setAnnouncement(`${from.name} is empty.`);
      return cancel(false);
    }
    const move: Flight = {
      seq: (landed?.seq ?? 0) + 1,
      from: held,
      to: toId,
      amount,
    };
    stopAll();
    runningRef.current.push(animate(tilt, 0, springs.glide));
    setHeld(null);
    setOverId(null);
    setFlight(move);

    const end = motionSafe ? lipOf(toId) : null;
    if (!end) {
      // No travel: the coin fades where it is and the move still lands.
      runningRef.current.push(
        animate(coinOpacity, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: () => commit(move),
        }),
      );
      return;
    }

    // The arc: one progress value on glide, mapped to a parabola whose height
    // grows with the distance, so a hop to the neighbour stays a hop.
    const startX = coinX.get();
    const startY = coinY.get();
    const dx = end.x - startX;
    const dy = end.y - startY;
    const arc = clamp(Math.hypot(dx, dy) * 0.35, 20, 64);
    progress.set(0);
    const unsubscribe = progress.on("change", (t) => {
      coinX.set(startX + dx * t);
      coinY.set(startY + dy * t - arc * 4 * t * (1 - t));
    });
    runningRef.current.push(
      animate(progress, 1, {
        ...springs.glide,
        onComplete: () => {
          unsubscribe();
          // The drop-in is the landing: ζ0.53, two bounces past the lip.
          runningRef.current.push(
            animate(coinY, end.y + DIP, {
              ...springs.recoil,
              onComplete: () => commit(move),
            }),
            animate(coinOpacity, 0, {
              duration: durations.base,
              ease: easings.exit,
              delay: 0.12,
            }),
          );
        },
      }),
    );
  };

  const activate = (id: string) => {
    if (held === null) lift(id);
    else if (held === id) cancel();
    else drop(id);
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (event.button !== 0 || flight) return;
    swallowClick.current = false;
    const box = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      node: event.currentTarget,
      id,
      startX: event.clientX,
      startY: event.clientY,
      originX: box.left + box.width / 2,
      moved: false,
    };
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      const travel = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );
      if (travel <= DRAG_SLOP) return;
      drag.moved = true;
      // Captured only once the press has become a drag; capturing on
      // pointerdown swallows the click a tap is made of.
      setCapture(drag.node, event.pointerId, true);
      if (held === null) lift(drag.id);
    }
    const root = motionSafe ? rootRef.current : null;
    if (!root) return;
    const box = root.getBoundingClientRect();
    coinX.set(event.clientX - box.left - COIN_HALF);
    coinY.set(event.clientY - box.top - COIN_HALF);
    // The jar tips toward the hand that is pulling from it.
    tilt.set(clamp((event.clientX - drag.originX) / 10, -12, 12));
    const target = potAt(event.clientX, event.clientY);
    const next = target && target !== drag.id ? target : null;
    if (next !== overId) setOverId(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCapture(drag.node, event.pointerId, false);
    dragRef.current = null;
    if (!drag.moved) return;
    swallowClick.current = true;
    const target = potAt(event.clientX, event.clientY);
    if (target && target !== drag.id) drop(target);
    else cancel(false);
  };

  const focusAt = (to: number) => {
    const clamped = clamp(to, 0, Math.max(0, list.length - 1));
    setFocusIndex(clamped);
    const pot = list[clamped];
    if (pot) buttonRefs.current.get(pot.id)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const { key } = event;
    if (key === "ArrowRight" || key === "ArrowDown") focusAt(index + 1);
    else if (key === "ArrowLeft" || key === "ArrowUp") focusAt(index - 1);
    else if (key === "Home") focusAt(0);
    else if (key === "End") focusAt(list.length - 1);
    else if (key === "Escape" && held !== null) cancel();
    else return;
    event.preventDefault();
  };

  const total = list.reduce((sum, pot) => sum + pot.balance, 0);
  const fullest = Math.max(1, ...list.map((pot) => pot.balance));
  const anchor = clamp(focusIndex, 0, Math.max(0, list.length - 1));
  const fillTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {format(total)} across {list.length}
        </span>
      </div>

      <div ref={rootRef} className="relative">
        <ul
          aria-labelledby={labelId}
          className="m-0 flex list-none items-end gap-2 p-0"
        >
          {list.map((pot, index) => {
            const isHeld = held === pot.id;
            const isOver = overId === pot.id;
            const justLanded = landed?.to === pot.id;
            const share = clamp(pot.balance / fullest, 0, 1);
            // The landing re-mounts the jar, and the liquid with it; seeding
            // the re-mount from the balance before the coin arrived keeps the
            // level gliding up instead of jumping to the new share.
            const fromShare = justLanded
              ? clamp((pot.balance - landed.amount) / fullest, 0, 1)
              : share;
            return (
              <li
                key={pot.id}
                data-pot={pot.id}
                className="flex min-w-0 flex-1 flex-col"
              >
                <button
                  ref={(node) => {
                    buttonRefs.current.set(pot.id, node);
                  }}
                  type="button"
                  aria-pressed={isHeld}
                  aria-describedby={hintId}
                  aria-label={`${pot.name}, ${format(pot.balance)}`}
                  tabIndex={index === anchor ? 0 : -1}
                  onFocus={() => setFocusIndex(index)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  onClick={() => {
                    if (swallowClick.current) swallowClick.current = false;
                    else activate(pot.id);
                  }}
                  onPointerDown={(event) => beginDrag(event, pot.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className={cn(
                    "flex w-full cursor-grab touch-none flex-col items-center gap-1.5 rounded-2 px-1 pt-2 pb-1.5 transition-colors outline-none select-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isHeld && "bg-cobalt-wash",
                    isOver && "bg-accent",
                  )}
                >
                  {/* The jar tips from its base, so pouring reads as pouring;
                      a keyboard lift never writes the tilt, so it stays upright. */}
                  <motion.span
                    aria-hidden
                    className="flex w-14 flex-col items-center"
                    style={{
                      originX: 0.5,
                      originY: 1,
                      rotate: isHeld ? tilt : upright,
                    }}
                  >
                    <span className="block h-1.5 w-8 rounded-t-[3px] border border-b-0 border-hairline-strong bg-surface-2" />
                    <span
                      data-lip
                      className={cn(
                        "relative z-10 block h-1.5 w-11 rounded-full border transition-colors",
                        isOver
                          ? "border-cobalt-bright bg-cobalt-wash"
                          : "border-hairline-strong bg-surface-2",
                      )}
                    />
                    {/* Keyed by the landing so the jar re-mounts and settles
                        on recoil exactly when the coin drops in. */}
                    <motion.span
                      key={justLanded ? landed.seq : 0}
                      className={cn(
                        "relative -mt-px block h-16 w-14 overflow-hidden rounded-t-[4px] rounded-b-[1.25rem] border bg-surface-2 transition-colors",
                        isOver
                          ? "border-cobalt-bright"
                          : "border-hairline-strong",
                      )}
                      style={{ originX: 0.5, originY: 1 }}
                      initial={
                        motionSafe && justLanded ? { scale: 1.06 } : false
                      }
                      animate={{ scale: 1 }}
                      transition={springs.recoil}
                    >
                      <motion.span
                        className="absolute inset-x-0 bottom-0 bg-cobalt-bright/70"
                        initial={
                          justLanded
                            ? { height: `${(fromShare * 100).toFixed(2)}%` }
                            : false
                        }
                        animate={{ height: `${(share * 100).toFixed(2)}%` }}
                        transition={fillTransition}
                      >
                        <span className="absolute inset-x-0 top-0 h-0.5 bg-background/50" />
                      </motion.span>
                    </motion.span>
                  </motion.span>

                  <span
                    aria-hidden
                    className="flex w-full flex-col items-center gap-0.5"
                  >
                    <span className="w-full truncate text-center text-[11px] font-medium">
                      {pot.name}
                    </span>
                    <span className="font-mono text-[11px] text-ink">
                      <RollingNumber
                        value={format(pot.balance)}
                        motionSafe={motionSafe}
                      />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <AnimatePresence>
          {held !== null || flight !== null ? (
            <motion.span
              key="coin"
              aria-hidden
              style={{ x: coinX, y: coinY, opacity: coinOpacity }}
              initial={motionSafe ? { scale: 0.5 } : false}
              animate={{ scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
              className="pointer-events-none absolute top-0 left-0 z-20 grid size-7 place-items-center rounded-full border-2 border-warn bg-warn/90 font-mono text-[9px] font-semibold text-background tabular-nums shadow-raised"
            >
              {format(step)}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <p id={hintId} className="text-[11px] text-ink-3">
        {held !== null
          ? `Holding ${format(step)} — drop it on another pot, or press Escape.`
          : `Drag a pot onto another, or press one, to move ${format(step)}.`}
      </p>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
