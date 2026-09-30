"use client";

import * as React from "react";

/**
 * Tactile gesture — the hand-feel every Tactile component shares, so a throw,
 * an overscroll and a drag read the same from one component to the next.
 *
 * - `useDrag` follows the pointer 1:1, captures it only after it has
 *   travelled a few pixels (so a plain press is still a press), and hands the
 *   release velocity to whatever spring takes over.
 * - `project` answers "where would this throw come to rest", so a flick can
 *   commit to the detent it was heading for instead of the one under the finger.
 * - `rubberband` is the resistance past an edge: the further you pull, the
 *   less it gives, and it never gives more than the dimension itself.
 */

export type Point = { x: number; y: number };

/** Keeps the last ~80ms of samples and reads velocity from them, in px/s. */
export function createVelocityTracker(window = 80) {
  const samples: { x: number; y: number; t: number }[] = [];
  return {
    reset() {
      samples.length = 0;
    },
    push(x: number, y: number, t: number) {
      samples.push({ x, y, t });
      while (samples.length > 2 && t - (samples[0]?.t ?? t) > window) {
        samples.shift();
      }
    },
    velocity(): Point {
      const first = samples[0];
      const last = samples[samples.length - 1];
      if (!first || !last || last.t - first.t < 8) return { x: 0, y: 0 };
      const dt = (last.t - first.t) / 1000;
      return {
        x: Number(((last.x - first.x) / dt).toFixed(3)),
        y: Number(((last.y - first.y) / dt).toFixed(3)),
      };
    },
  };
}

/**
 * Where a throw comes to rest under a constant deceleration, given its
 * velocity in px/s. `rate` is the fraction of speed kept per millisecond:
 * 0.998 is a light, coasting surface; 0.99 is a heavy, stopping one.
 */
export const project = (
  value: number,
  velocity: number,
  rate = 0.998,
): number => value + ((velocity / 1000) * rate) / (1 - rate);

/**
 * Resistance past an edge. `overshoot` is how far the finger is beyond the
 * limit, `dimension` the size of the thing being pulled; the result is how far
 * the thing actually moves. Small pulls give almost 1:1, long pulls flatten.
 */
export const rubberband = (
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number => {
  if (dimension <= 0) return 0;
  const sign = Math.sign(overshoot);
  const d = Math.abs(overshoot);
  return sign * (1 - 1 / ((d * constant) / dimension + 1)) * dimension;
};

/** A value held to [min, max], rubber-banded rather than clamped outside it. */
export const rubberClamp = (
  value: number,
  min: number,
  max: number,
  dimension: number,
): number => {
  if (value < min) return min + rubberband(value - min, dimension);
  if (value > max) return max + rubberband(value - max, dimension);
  return value;
};

/** A wheel event's delta in pixels, whatever unit the device reported it in. */
export const wheelPixels = (event: {
  deltaY: number;
  deltaX: number;
  deltaMode: number;
}): Point => {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
};

export type DragInfo = {
  /** Pointer position relative to where the drag began. */
  offset: Point;
  /** Movement since the previous move event. */
  delta: Point;
  /** Current pointer position, in client coordinates. */
  point: Point;
  /** Release velocity, px/s. Zero until the pointer lifts. */
  velocity: Point;
  /** The event that produced this reading. */
  event: PointerEvent | React.PointerEvent;
};

export type DragOptions = {
  /** Pixels of travel before the drag takes over. @default 4 */
  threshold?: number;
  /** Lock the drag to an axis once it starts. */
  axis?: "x" | "y";
  /** Called when a press becomes a drag (after the threshold). */
  onStart?: (info: DragInfo) => void;
  onMove?: (info: DragInfo) => void;
  /** Called on release after a drag, with the release velocity. */
  onEnd?: (info: DragInfo) => void;
  /** Called on release when the pointer never passed the threshold. */
  onTap?: (event: React.PointerEvent) => void;
  /** Called when the pointer is lost (cancel, capture lost) mid-drag. */
  onCancel?: () => void;
  disabled?: boolean;
};

/**
 * Pointer handlers for a drag that behaves: 1:1 under the finger, capture only
 * after `threshold` pixels (inside try/catch — capture can throw when the
 * pointer is already gone), velocity measured over the last 80ms, and a tap
 * reported as a tap. Spread the returned handlers on the element; give it
 * `touch-action` that matches the axis (`pan-y` for a horizontal drag).
 */
export function useDrag(options: DragOptions) {
  const latest = React.useRef(options);
  React.useEffect(() => {
    latest.current = options;
  });

  const state = React.useRef<{
    id: number;
    start: Point;
    last: Point;
    active: boolean;
    target: Element | null;
    tracker: ReturnType<typeof createVelocityTracker>;
  } | null>(null);

  const info = (
    event: React.PointerEvent,
    velocity: Point = { x: 0, y: 0 },
  ): DragInfo | null => {
    const s = state.current;
    if (!s) return null;
    const axis = latest.current.axis;
    const point = { x: event.clientX, y: event.clientY };
    const offset = {
      x: axis === "y" ? 0 : point.x - s.start.x,
      y: axis === "x" ? 0 : point.y - s.start.y,
    };
    const delta = {
      x: axis === "y" ? 0 : point.x - s.last.x,
      y: axis === "x" ? 0 : point.y - s.last.y,
    };
    return {
      offset,
      delta,
      point,
      velocity: {
        x: axis === "y" ? 0 : velocity.x,
        y: axis === "x" ? 0 : velocity.y,
      },
      event,
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (latest.current.disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const tracker = createVelocityTracker();
    tracker.push(event.clientX, event.clientY, event.timeStamp);
    state.current = {
      id: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      last: { x: event.clientX, y: event.clientY },
      active: false,
      target: event.currentTarget,
      tracker,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const s = state.current;
    if (!s || s.id !== event.pointerId) return;
    s.tracker.push(event.clientX, event.clientY, event.timeStamp);
    if (!s.active) {
      const threshold = latest.current.threshold ?? 4;
      const dx = event.clientX - s.start.x;
      const dy = event.clientY - s.start.y;
      const axis = latest.current.axis;
      const travel =
        axis === "x"
          ? Math.abs(dx)
          : axis === "y"
            ? Math.abs(dy)
            : Math.hypot(dx, dy);
      if (travel < threshold) return;
      s.active = true;
      try {
        s.target?.setPointerCapture(event.pointerId);
      } catch {
        // The pointer can already be gone; the drag still follows move events.
      }
      const started = info(event);
      if (started) latest.current.onStart?.(started);
    }
    const moved = info(event);
    s.last = { x: event.clientX, y: event.clientY };
    if (moved) latest.current.onMove?.(moved);
  };

  const finish = (event: React.PointerEvent, cancelled: boolean) => {
    const s = state.current;
    if (!s || s.id !== event.pointerId) return;
    if (s.active) {
      try {
        if (s.target?.hasPointerCapture(event.pointerId)) {
          s.target.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Capture may already have been released by the browser.
      }
      if (cancelled) {
        latest.current.onCancel?.();
      } else {
        s.tracker.push(event.clientX, event.clientY, event.timeStamp);
        const ended = info(event, s.tracker.velocity());
        if (ended) latest.current.onEnd?.(ended);
      }
    } else if (!cancelled) {
      latest.current.onTap?.(event);
    }
    state.current = null;
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: React.PointerEvent) => finish(event, false),
    onPointerCancel: (event: React.PointerEvent) => finish(event, true),
    onLostPointerCapture: (event: React.PointerEvent) => {
      if (state.current?.active) finish(event, true);
    },
  };
}
