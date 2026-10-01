"use client";

import * as React from "react";

/**
 * The film's time, in seconds. Nothing in the composition reads a wall
 * clock: the director (scripts/film/render.mjs) sets this once per captured
 * frame, so every choreographed value is a pure function of it and a render
 * is the same film every time.
 */
let now = 0;
const listeners = new Set<() => void>();

export const filmClock = {
  get: (): number => now,
  set(seconds: number): void {
    now = seconds;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** The current film time, re-rendering the caller whenever it moves. */
export function useFilmTime(): number {
  return React.useSyncExternalStore(
    filmClock.subscribe,
    filmClock.get,
    () => 0,
  );
}
