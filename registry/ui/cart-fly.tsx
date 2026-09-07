"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** The flight is a throw, not a journey — long enough to follow, short enough
 *  that a second press never waits on the first. */
const FLIGHT = durations.slow;

/** How long the button reads "Added" before it offers itself again. */
const CONFIRM_MS = 1100;

type Flight = {
  id: number;
  /** Launch box, in the ghost layer's own coordinates. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Centre-to-centre travel to the cart, measured at press time. */
  dx: number;
  dy: number;
  /** How far above the straight line the arc peaks. */
  lift: number;
};

type GhostProps = {
  flight: Flight;
  children: React.ReactNode;
  onLanded: (id: number) => void;
};

/**
 * One thrown copy of the thumbnail. Its path is two motion values on tweens —
 * x linear, y through a lifted middle keyframe — because an arc is a straight
 * horizontal ride plus a vertical curve, not a spring. A third value carries
 * scale and fade so the trajectory itself stays pure.
 */
function Ghost({ flight, children, onLanded }: GhostProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const progress = useMotionValue(0);
  // Pops out of the row, then drops into the cart at half size.
  const scale = useTransform(progress, [0, 0.45, 1], [1, 1.28, 0.5]);
  const opacity = useTransform(progress, [0, 0.75, 1], [1, 1, 0]);

  React.useEffect(() => {
    const travelX = animate(x, flight.dx, {
      duration: FLIGHT,
      ease: easings.linear,
    });
    const travelY = animate(y, [0, flight.dy / 2 - flight.lift, flight.dy], {
      duration: FLIGHT,
      ease: easings.move,
      times: [0, 0.5, 1],
    });
    // The landing is announced by the animation that finishes the path, never
    // by a mount effect: the cart must catch something that actually arrived.
    const ride = animate(progress, 1, {
      duration: FLIGHT,
      ease: easings.linear,
      onComplete: () => onLanded(flight.id),
    });
    return () => {
      travelX.stop();
      travelY.stop();
      ride.stop();
    };
  }, [flight, onLanded, progress, x, y]);

  return (
    <motion.span
      aria-hidden
      style={{
        position: "absolute",
        left: flight.left,
        top: flight.top,
        width: flight.width,
        height: flight.height,
        x,
        y,
        scale,
        opacity,
      }}
      className="block overflow-hidden rounded-2 border border-hairline-strong shadow-raised"
    >
      {children}
    </motion.span>
  );
}

export type CartFlyProps = {
  /** The element the ghost flies to — the cart, wherever it sits. */
  cartRef: React.RefObject<HTMLElement | null>;
  /** The picture that flies. Rendered in the button and again as the ghost. */
  thumbnail: React.ReactNode;
  /** Fires when the flight lands, so the cart counts what arrived. */
  onAdd?: () => void;
  /** Button copy. @default "Add to cart" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Add to cart, with the item making the trip. Pressing lifts a ghost of the
 * button's thumbnail and throws it along an arc to whatever `cartRef` points
 * at; the ghost's landing — the tween's own `onComplete`, not a mount effect —
 * is what calls `onAdd`, so the cart bumps because it caught something rather
 * than because a number changed. The button then swaps to a check on `flick`
 * for a beat and returns.
 *
 * Every press measures both boxes fresh, so a scrolled page, a resized column
 * or a cart that moved all still land true, and several ghosts may be in the
 * air at once — a shopper mashing Add gets one flight per press. The ghost
 * layer is measured too, so the arc holds even inside a transformed ancestor.
 *
 * Keyboard is the same button: Enter or Space adds, and the outcome is
 * announced politely. Under reduced motion nothing flies — the count still
 * updates and the button still confirms, because that is information.
 */
export function CartFly({
  cartRef,
  thumbnail,
  onAdd,
  label = "Add to cart",
  disabled = false,
  className,
}: CartFlyProps) {
  const motionSafe = useMotionSafe();

  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const tileRef = React.useRef<HTMLSpanElement | null>(null);
  const nextId = React.useRef(0);
  const onAddRef = React.useRef(onAdd);

  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [added, setAdded] = React.useState(false);
  // Bumped on every landing so a second arrival restarts the confirm timer
  // instead of inheriting the first one's remaining beat.
  const [landings, setLandings] = React.useState(0);

  React.useEffect(() => {
    onAddRef.current = onAdd;
  }, [onAdd]);

  React.useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [added, landings]);

  // Stable across renders: the ghost restarts its flight whenever this
  // identity changes, so the latest onAdd is read through a ref instead.
  const land = React.useCallback((id: number) => {
    setFlights((list) => list.filter((flight) => flight.id !== id));
    setAdded(true);
    setLandings((n) => n + 1);
    onAddRef.current?.();
  }, []);

  const confirmWithoutFlight = () => {
    setAdded(true);
    setLandings((n) => n + 1);
    onAdd?.();
  };

  const handleClick = () => {
    if (disabled) return;
    const tile = tileRef.current;
    const layer = layerRef.current;
    const cart = cartRef.current;
    if (!motionSafe || !tile || !layer || !cart) {
      confirmWithoutFlight();
      return;
    }

    // Measured here, in the handler, because both boxes are only true at the
    // moment of the press — not when the component rendered.
    const from = tile.getBoundingClientRect();
    const to = cart.getBoundingClientRect();
    const origin = layer.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const id = nextId.current;
    nextId.current += 1;

    setFlights((list) => [
      ...list,
      {
        id,
        left: from.left - origin.left,
        top: from.top - origin.top,
        width: from.width,
        height: from.height,
        dx,
        dy,
        lift: Math.max(48, Math.abs(dx) * 0.3),
      },
    ]);
  };

  const swap = (visible: boolean) => ({
    opacity: visible ? 1 : 0,
    y: motionSafe ? (visible ? 0 : -4) : 0,
  });

  const swapTransition = {
    duration: motionSafe ? durations.fast : durations.blink,
    ease: easings.enter,
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        whileTap={motionSafe && !disabled ? { scale: 0.97 } : undefined}
        transition={springs.flick}
        className={cn(
          "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-3 border border-hairline-strong bg-surface-1 py-1 pr-3 pl-1 text-sm font-medium text-foreground transition-colors outline-none",
          "hover:border-cobalt-bright/60 hover:bg-accent",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-default disabled:opacity-50",
          className,
        )}
      >
        <span
          ref={tileRef}
          aria-hidden
          className="block size-8 shrink-0 overflow-hidden rounded-2 bg-surface-2"
        >
          {thumbnail}
        </span>

        {/* Both labels share one grid cell, so the button is already as wide as
            its widest state and the row never shifts when the check lands. */}
        <span className="grid">
          <motion.span
            aria-hidden={added || undefined}
            initial={false}
            animate={swap(!added)}
            transition={swapTransition}
            className="col-start-1 row-start-1 block whitespace-nowrap"
          >
            {label}
          </motion.span>
          <motion.span
            aria-hidden={!added || undefined}
            initial={false}
            animate={swap(added)}
            transition={swapTransition}
            className="col-start-1 row-start-1 flex items-center gap-1.5 whitespace-nowrap text-success"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0"
            >
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                initial={false}
                animate={{ pathLength: added ? 1 : 0 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.blink }
                }
              />
            </svg>
            Added
          </motion.span>
        </span>
      </motion.button>

      {/* Fixed, so the ghost is free of every clipping ancestor between the
          button and the cart; its own box is the origin the arc is measured
          against, which keeps the path honest under a transformed parent. It
          is a zero-size anchor, not a viewport-sized sheet: ghosts sit at
          absolute coordinates from its corner, so it needs no area of its own
          and never registers as an element hanging past the page. */}
      <div
        ref={layerRef}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-50 h-0 w-0 overflow-visible"
      >
        {flights.map((flight) => (
          <Ghost key={flight.id} flight={flight} onLanded={land}>
            {thumbnail}
          </Ghost>
        ))}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {added ? `${label} — added` : ""}
      </span>
    </>
  );
}
