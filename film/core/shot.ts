import type * as React from "react";

import type { PointerState } from "./input";

/** The film runs at 30 frames a second; its music at 112.5 BPM, 16 frames a beat. */
export const FPS = 30;
export const BEAT_FRAMES = 16;
export const DURATION_FRAMES = 900;

/** Seconds for a frame number — every timing in the film is written in frames. */
export const f = (frames: number): number => frames / FPS;
/** Seconds for a beat number from the top of the film. */
export const beat = (n: number): number => f(n * BEAT_FRAMES);

export type SceneProps = {
  /** Film time, seconds. */
  t: number;
  /** Seconds since this shot's first frame (negative during preroll). */
  local: number;
};

/** A sound placed by the edit rather than by a component being used. */
export type Cue = { at: number; play: () => void };

export type Shot = {
  id: string;
  /** First frame and the frame after the last, at 30 fps. */
  from: number;
  to: number;
  /**
   * Mounted this many frames before `from`, hidden, so whatever it holds has
   * measured, loaded and settled by the time it is seen.
   */
  preroll?: number;
  Scene: React.ComponentType<SceneProps>;
  /** The hand, while this shot is on screen. */
  input?: (t: number) => PointerState | null;
  cues?: Cue[];
};
