"use client";

import type { SpringName } from "@/registry/lib/motion";

import { spring } from "./spring";

export type Point = { x: number; y: number };

/**
 * What the visitor's hand is doing at one film time. The director turns it
 * into real input — a moved mouse, a pressed button — so the components on
 * screen are operated, not animated: their response is their own.
 */
export type PointerState = Point & {
  /** The button is held. */
  down: boolean;
  /** Draw the film's cursor (input still lands while it is hidden). */
  visible: boolean;
};

/** Stage size: the film is composed at 1920×1080 and captured 1:1. */
export const STAGE = { width: 1920, height: 1080 } as const;

let stageScale = 1;
/** Set by the stage when a preview scales it to fit a smaller window. */
export const setStageScale = (scale: number): void => {
  stageScale = scale;
};

/**
 * A point on a named element (`data-film="name"`, or any CSS selector
 * starting with `[`, `.` or `#`), as a fraction of its box,
 * in stage pixels — read from the live layout, so it follows the element
 * through every camera move.
 */
export function on(name: string, u = 0.5, v = 0.5): Point {
  const element = document.querySelector(
    /^[[.#]/.test(name) ? name : `[data-film="${name}"]`,
  );
  if (!element) return { x: STAGE.width / 2, y: STAGE.height / 2 };
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left + rect.width * u) / stageScale,
    y: (rect.top + rect.height * v) / stageScale,
  };
}

export type Stop = {
  /** Film time the hand sets off for this point. */
  at: number;
  to: Point | (() => Point);
  /** The spring it travels on. @default "glide" */
  by?: SpringName;
};

/**
 * A hand that travels from stop to stop on the calibration springs, the way
 * a person's pointer accelerates out and settles in. Each leg starts from
 * wherever the previous one had reached, so an early departure curves
 * naturally into the next target.
 */
export function travel(t: number, stops: readonly Stop[]): Point {
  const resolve = (stop: Stop) =>
    typeof stop.to === "function" ? stop.to() : stop.to;
  const first = stops[0];
  if (!first) return { x: STAGE.width / 2, y: STAGE.height / 2 };
  let from = resolve(first);
  for (let i = 1; i < stops.length; i++) {
    const stop = stops[i];
    if (!stop) break;
    const next = stops[i + 1];
    // Where this leg has got to by now — or by the moment the next one left.
    const end = next ? Math.min(t, next.at) : t;
    if (end < stop.at) return from;
    const to = resolve(stop);
    const p = spring(stop.by ?? "glide", end, stop.at);
    const here = {
      x: from.x + (to.x - from.x) * p,
      y: from.y + (to.y - from.y) * p,
    };
    if (!next || t < next.at) return here;
    from = here;
  }
  return from;
}

/** The hand out of the way, in the frame's far corner, button up. */
export const PARKED: PointerState = {
  x: 1916,
  y: 1076,
  down: false,
  visible: false,
};

/** Held between `from` and `to` (film seconds). */
export const held = (t: number, ...presses: [number, number][]): boolean =>
  presses.some(([from, to]) => t >= from && t < to);
