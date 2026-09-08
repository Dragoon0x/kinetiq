"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EnvelopeItem = {
  id: string;
  name: string;
  /** Money set aside for this envelope. Transfers move this figure. */
  allocated: number;
  /** Money already spent out of it. */
  spent: number;
};

export type EnvelopeRowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled envelopes. */
  envelopes?: EnvelopeItem[];
  /** Initial envelopes for uncontrolled usage. */
  defaultEnvelopes?: EnvelopeItem[];
  /** Fires from the drop or key that moved money, with the whole new row. */
  onEnvelopesChange?: (next: EnvelopeItem[]) => void;
  /** Fires from the same event with just the move. */
  onTransfer?: (from: string, to: string, amount: number) => void;
  /** Money moved by one drop. @default 25 */
  step?: number;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Names the row; printed above it. @default "Envelopes" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on the figure the row exists to show.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Pointer travel before a press becomes a drag, so plain taps still land. */
const DRAG_SLOP = 4;
/** Half the coin's 36px body — the offset that centres it under the pointer. */
const COIN_HALF = 18;
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

/**
 * Money set aside, on purpose. Each envelope fills from the bottom with the
 * share of its allocation already spent — a `scaleY` on `glide`, because an
 * amount settles rather than switches — and the remainder chip settles on
 * `recoil` whenever the allocation moves.
 *
 * Moving money is the gesture. Every card carries a coin in a socket; pressing
 * that coin and dragging past 4px lifts it, and it tracks the pointer through
 * two motion values, so the flight costs no renders. Releasing over another
 * envelope commits `step`, the coin flies the rest of the way on `glide` — the
 * envelope, not the hand, decides where money lands — and both cards' fills
 * glide to their new heights. Releasing over nothing walks the coin home and
 * nothing moves. The socket is the only surface that takes a drag, so the row
 * still scrolls under a thumb everywhere else.
 *
 * Clicking a card runs the same trade in two taps, and so does the keyboard:
 * Enter or Space lifts the coin, Arrow keys walk the row, a second Enter or
 * Space drops it, Escape puts it back. Under reduced motion the coin never
 * travels — it waits on its source card and fades at the drop — but the fills
 * still fill and the figures still change, because that is the information.
 */
export function EnvelopeRow({
  ref,
  envelopes,
  defaultEnvelopes,
  onEnvelopesChange,
  onTransfer,
  step = 25,
  format = (value) => money.format(value),
  label = "Envelopes",
  className,
}: EnvelopeRowProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState<EnvelopeItem[]>(
    defaultEnvelopes ?? [],
  );
  const isControlled = envelopes !== undefined;
  const list = isControlled ? envelopes : uncontrolled;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const dragRef = React.useRef<{
    pointerId: number;
    node: HTMLElement;
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  /** A drag ends in a click on the socket; that click must not re-arm the coin. */
  const swallowClick = React.useRef(false);
  const flightRef = React.useRef<ReturnType<typeof animate>[]>([]);

  const [heldId, setHeldId] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  const coinX = useMotionValue(0);
  const coinY = useMotionValue(0);

  React.useEffect(
    () => () => flightRef.current.forEach((controls) => controls.stop()),
    [],
  );

  /** A card's centre in the wrapper's space — measured in events, never in render. */
  const centreOf = (id: string) => {
    const root = rootRef.current;
    const card = root?.querySelector<HTMLElement>(
      `[data-envelope="${CSS.escape(id)}"]`,
    );
    if (!root || !card) return null;
    const rootBox = root.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    return {
      x: box.left - rootBox.left + box.width / 2 - COIN_HALF,
      y: box.top - rootBox.top + box.height / 2 - COIN_HALF,
    };
  };

  /** Walks the coin to a point and puts it down when it arrives. */
  const flyTo = (id: string) => {
    flightRef.current.forEach((controls) => controls.stop());
    const to = motionSafe ? centreOf(id) : null;
    if (!to) {
      flightRef.current = [];
      setHeldId(null);
      return;
    }
    flightRef.current = [
      animate(coinX, to.x, {
        ...springs.glide,
        onComplete: () => setHeldId(null),
      }),
      animate(coinY, to.y, springs.glide),
    ];
  };

  const pickUp = (id: string) => {
    flightRef.current.forEach((controls) => controls.stop());
    const at = centreOf(id);
    if (at) {
      coinX.set(at.x);
      coinY.set(at.y);
    }
    setHeldId(id);
    const from = list.find((item) => item.id === id);
    setAnnouncement(
      from ? `Holding ${format(step)} from ${from.name}.` : "Holding.",
    );
  };

  const cancel = (announce = true) => {
    if (!heldId) return;
    if (announce) setAnnouncement("Move cancelled.");
    flyTo(heldId);
  };

  const drop = (toId: string) => {
    const fromId = heldId;
    const from = list.find((item) => item.id === fromId);
    const to = list.find((item) => item.id === toId);
    if (!fromId || !from || !to || fromId === toId) return cancel();
    const amount = Math.min(step, Math.max(0, from.allocated));
    if (amount <= 0) {
      setAnnouncement(`${from.name} has nothing left to move.`);
      return cancel(false);
    }
    const next = list.map((item) =>
      item.id === fromId
        ? { ...item, allocated: item.allocated - amount }
        : item.id === toId
          ? { ...item, allocated: item.allocated + amount }
          : item,
    );
    if (!isControlled) setUncontrolled(next);
    onEnvelopesChange?.(next);
    onTransfer?.(fromId, toId, amount);
    setAnnouncement(
      `Moved ${format(amount)} from ${from.name} to ${to.name}. ${to.name} now ${format(
        to.allocated + amount,
      )} allocated.`,
    );
    flyTo(toId);
  };

  const activate = (id: string) => {
    if (heldId === null) pickUp(id);
    else if (heldId === id) cancel();
    else drop(id);
  };

  const beginDrag = (event: React.PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0) return;
    swallowClick.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      node: event.currentTarget,
      id,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const held = dragRef.current;
    if (!held || held.pointerId !== event.pointerId) return;
    if (!held.moved) {
      const travel = Math.hypot(
        event.clientX - held.startX,
        event.clientY - held.startY,
      );
      if (travel <= DRAG_SLOP) return;
      held.moved = true;
      // Captured only once the press has become a drag; capturing on
      // pointerdown swallows the click a tap is made of.
      setCapture(held.node, event.pointerId, true);
      if (heldId === null) pickUp(held.id);
    }
    const root = motionSafe ? rootRef.current : null;
    if (!root) return;
    const box = root.getBoundingClientRect();
    coinX.set(event.clientX - box.left - COIN_HALF);
    coinY.set(event.clientY - box.top - COIN_HALF);
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    const held = dragRef.current;
    if (!held || held.pointerId !== event.pointerId) return;
    setCapture(held.node, event.pointerId, false);
    dragRef.current = null;
    if (!held.moved) return;
    swallowClick.current = true;
    let targetId: string | null = null;
    try {
      targetId =
        document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-envelope]")?.dataset.envelope ?? null;
    } catch {
      // A synthetic sweep may report no element; the coin simply goes home.
    }
    if (targetId && targetId !== held.id) drop(targetId);
    else cancel(false);
  };

  const focusAt = (to: number) => {
    const clamped = Math.min(list.length - 1, Math.max(0, to));
    setFocusIndex(clamped);
    buttonRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const { key } = event;
    if (key === "ArrowRight" || key === "ArrowDown") focusAt(index + 1);
    else if (key === "ArrowLeft" || key === "ArrowUp") focusAt(index - 1);
    else if (key === "Home") focusAt(0);
    else if (key === "End") focusAt(list.length - 1);
    else if (key === "Escape" && heldId !== null) cancel();
    else return;
    event.preventDefault();
  };

  const allocated = list.reduce((sum, item) => sum + item.allocated, 0);
  const left = list.reduce((sum, item) => sum + item.allocated - item.spent, 0);
  const anchor = Math.min(
    Math.max(0, focusIndex),
    Math.max(0, list.length - 1),
  );
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
          {format(allocated)} set aside
        </span>
      </div>

      <div ref={rootRef} className="relative">
        <div className="-mx-1 overflow-x-auto px-1 pt-1 pb-2">
          <ul
            aria-labelledby={labelId}
            className="m-0 flex list-none items-stretch gap-2 p-0"
          >
            {list.map((item, index) => {
              const remaining = item.allocated - item.spent;
              const over = remaining < 0;
              const span = item.allocated > 0 ? item.allocated : 1;
              const held = heldId === item.id;
              const reading = `${item.name}, ${format(item.allocated)} allocated, ${format(
                item.spent,
              )} spent, ${format(Math.abs(remaining))} ${over ? "over" : "left"}`;
              return (
                <li
                  key={item.id}
                  data-envelope={item.id}
                  className="relative flex"
                >
                  <button
                    ref={(node) => {
                      buttonRefs.current[index] = node;
                    }}
                    type="button"
                    aria-pressed={held}
                    aria-describedby={hintId}
                    aria-label={reading}
                    tabIndex={index === anchor ? 0 : -1}
                    onFocus={() => setFocusIndex(index)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                    onClick={() => activate(item.id)}
                    className={cn(
                      "relative flex h-28 w-36 shrink-0 flex-col justify-between overflow-hidden rounded-3 border p-2.5 text-left transition-colors outline-none",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      held
                        ? "border-cobalt-bright bg-cobalt-wash"
                        : "border-hairline-strong bg-surface-2 hover:border-cobalt-bright/60",
                    )}
                  >
                    {/* The paper filling up. Origin at the bottom, so money
                        stacks inside the card rather than the card growing. */}
                    <motion.span
                      aria-hidden
                      className={cn(
                        "absolute inset-x-0 bottom-0 h-full origin-bottom transition-colors",
                        over ? "bg-danger/15" : "bg-cobalt-bright/14",
                      )}
                      initial={{ scaleY: 0 }}
                      animate={{
                        scaleY: Math.min(1, Math.max(0, item.spent / span)),
                      }}
                      transition={fillTransition}
                    />

                    <span
                      aria-hidden
                      className="relative flex min-w-0 flex-col gap-0.5"
                    >
                      <span className="truncate pr-8 text-xs font-medium">
                        {item.name}
                      </span>
                      <span className="truncate font-mono text-[10px] text-ink-3 tabular-nums">
                        {format(item.spent)} of {format(item.allocated)}
                      </span>
                    </span>

                    {/* Keyed by the allocation, so the chip re-mounts on every
                        move and lands the way a coin does: ζ0.53, one settle
                        rather than a celebration. */}
                    <motion.span
                      key={`${item.id}-${item.allocated}`}
                      initial={motionSafe ? { scale: 0.84 } : false}
                      animate={{ scale: 1 }}
                      transition={springs.recoil}
                      className={cn(
                        "relative inline-flex h-5 w-fit max-w-full items-center rounded-full border bg-surface-0 px-1.5 font-mono text-[10px] font-medium",
                        over
                          ? "border-danger/40 text-danger"
                          : "border-hairline-strong text-ink",
                      )}
                    >
                      <span aria-hidden className="tabular-nums">
                        {format(Math.abs(remaining))} {over ? "over" : "left"}
                      </span>
                    </motion.span>
                  </button>

                  {/* The only surface that takes a drag, so the row still
                      scrolls under a thumb everywhere else. It sits over the
                      card rather than inside it — a button inside a button is
                      invalid — and duplicates an action the card already
                      carries, so it stays out of the accessibility tree. */}
                  <span
                    aria-hidden
                    onPointerDown={(event) => beginDrag(event, item.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onClick={() => {
                      if (swallowClick.current) swallowClick.current = false;
                      else activate(item.id);
                    }}
                    className={cn(
                      "absolute top-2.5 right-2.5 grid size-7 cursor-grab touch-none place-items-center rounded-full border border-dashed text-[9px] font-medium transition-colors select-none",
                      held
                        ? "border-cobalt-bright/60 text-transparent"
                        : "border-hairline-strong bg-surface-0 text-ink-3",
                    )}
                  >
                    {held ? "" : format(step)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Edge fades mark the row as scrollable without a scrollbar reserving
            space the layout would then have to keep. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-linear-to-r from-surface-1 to-surface-1/0"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-linear-to-l from-surface-1 to-surface-1/0"
        />

        <AnimatePresence>
          {heldId !== null && (
            <motion.span
              aria-hidden
              style={{ x: coinX, y: coinY }}
              initial={motionSafe ? { scale: 0.5, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? springs.flick : { duration: durations.fast }
              }
              className="pointer-events-none absolute top-0 left-0 z-20 grid size-9 place-items-center rounded-full bg-primary font-mono text-[10px] font-semibold text-primary-foreground shadow-raised"
            >
              {format(step)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <p id={hintId} className="text-[11px] text-ink-3">
        {heldId
          ? `Holding ${format(step)} — drop it on another envelope, or press Escape.`
          : `Drag a coin, or press an envelope, to lift ${format(step)}.`}
      </p>

      <span className="sr-only" role="status">
        {announcement ||
          `${format(allocated)} allocated, ${format(left)} left.`}
      </span>
    </div>
  );
}
