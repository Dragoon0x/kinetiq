"use client";

import * as React from "react";

import {
  createPainter,
  type PaintOptions,
  type PaintController,
} from "@/registry/lib/paint";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

type SurfaceSnapshot = {
  canvas: HTMLCanvasElement | null;
  version: number;
  width: number;
  height: number;
  dpr: number;
  native: boolean;
};

const INITIAL_SNAPSHOT: SurfaceSnapshot = {
  canvas: null,
  version: 0,
  width: 0,
  height: 0,
  dpr: 1,
  native: false,
};

export type PaintedSurfaceState = {
  canvas: HTMLCanvasElement | null;
  version: number;
  width: number;
  height: number;
  dpr: number;
  native: boolean;
  /** Force a synchronous paint (tests). */
  paintNow: () => number;
  /** Schedule a repaint. */
  repaint: () => void;
};

/**
 * React-facing wrapper around `createPainter`. Mounts a painter over
 * `ref.current` in a layout effect (so the first frame it observes already
 * matches committed DOM, not a pre-paint one), disposes it on unmount or if
 * `ref` itself changes, and mirrors completed paints into state.
 *
 * `canvas` stays `null` — and this is deliberate, not a loading bug — until
 * the first paint actually completes: state only ever changes from inside
 * the painter's `subscribe` callback, never synchronously in the effect
 * body, so a caller never observes a controller that exists but hasn't
 * painted yet as if it had. Call the returned `paintNow()` to force that
 * first paint synchronously (tests, or an effect that must sample before
 * its own first frame); `repaint()` just schedules one for the next frame.
 *
 * `options` can be a fresh object literal every render — only its value at
 * mount (or at the next `ref` change) is read, via a ref kept in sync by a
 * plain effect, so passing a new literal never tears the painter down and
 * rebuilds it.
 */
export function usePaintedSurface(
  ref: React.RefObject<HTMLElement | null>,
  options?: PaintOptions,
): PaintedSurfaceState {
  const [snapshot, setSnapshot] =
    React.useState<SurfaceSnapshot>(INITIAL_SNAPSHOT);
  const controllerRef = React.useRef<PaintController | null>(null);

  const optionsRef = React.useRef(options);
  React.useEffect(() => {
    optionsRef.current = options;
  });

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const controller = createPainter(node, optionsRef.current);
    controllerRef.current = controller;

    const unsubscribe = controller.subscribe((surface) => {
      setSnapshot({
        canvas: surface.canvas,
        version: surface.version,
        width: surface.width,
        height: surface.height,
        dpr: surface.dpr,
        native: surface.native,
      });
    });

    return () => {
      unsubscribe();
      controller.dispose();
      controllerRef.current = null;
      setSnapshot(INITIAL_SNAPSHOT);
    };
  }, [ref]);

  const paintNow = React.useCallback(
    (): number => controllerRef.current?.paintNow() ?? 0,
    [],
  );
  const repaint = React.useCallback((): void => {
    controllerRef.current?.repaint();
  }, []);

  return {
    canvas: snapshot.canvas,
    version: snapshot.version,
    width: snapshot.width,
    height: snapshot.height,
    dpr: snapshot.dpr,
    native: snapshot.native,
    paintNow,
    repaint,
  };
}
