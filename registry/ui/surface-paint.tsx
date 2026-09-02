"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  usePaintedSurface,
  type PaintedSurfaceState,
} from "@/registry/hooks/use-painted-surface";
import type { PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";

export type SurfaceMode = "overlay" | "replace";

export type SurfaceContextValue = PaintedSurfaceState & {
  /** How the effect composes with the DOM it paints. */
  mode: SurfaceMode;
  /** Reduced-motion decision, shared so effects never re-derive it. */
  motionSafe: boolean;
  /** The wrapper element. Pointer listeners belong here, never on a canvas. */
  host: HTMLDivElement | null;
  /**
   * Whether an effect layer should draw at all. False before the first
   * completed paint, and false under reduced motion in replace mode — in
   * which case the real DOM is shown and effects must render nothing.
   */
  active: boolean;
};

const SurfaceContext = React.createContext<SurfaceContextValue | null>(null);

/** The painted surface an effect layer draws from. Only valid inside `SurfacePaint`. */
export function useSurface(): SurfaceContextValue {
  const value = React.useContext(SurfaceContext);
  if (!value) {
    throw new Error("useSurface must be used inside <SurfacePaint>.");
  }
  return value;
}

export type SurfacePaintProps = {
  /** Overlay keeps the DOM visible and draws over it; replace shows only the texture. @default "overlay" */
  mode?: SurfaceMode;
  /** Painter options — DPR cap, node budget, pseudo-element painting, focus ring, backdrop. */
  paint?: PaintOptions;
  /** The effect layer, rendered above the painted root with pointer events off. */
  effect?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/**
 * The stage every effect in this wing stands on. Children render as real,
 * interactive DOM; a painter keeps a texture of them current; an effect
 * layer draws over the top with pointer events off, so every click and
 * key reaches the element it was aimed at. Overlay mode leaves the DOM
 * visible and lets the effect draw only where it differs. Replace mode
 * holds the DOM at zero opacity — still in flow, still focusable, still in
 * the accessibility tree, which `visibility: hidden` would not be — and
 * shows the transformed texture in its place. The painter draws a focus
 * ring into the texture, so an effect bends the ring like everything else.
 * Reduced motion: overlay effects freeze to their own still frame; replace
 * mode shows the real DOM and skips the canvas entirely, because showing
 * the real thing beats freezing the fake one.
 */
export function SurfacePaint({
  mode = "overlay",
  paint,
  effect,
  className,
  style,
  children,
}: SurfacePaintProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  // A callback ref, so effects re-render once the host exists and can
  // attach their pointer listeners to it.
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  const surface = usePaintedSurface(rootRef, paint);

  const painted = surface.canvas !== null && surface.version > 0;
  const active = painted && (mode === "overlay" || motionSafe);
  const hidden = mode === "replace" && active;

  const value = React.useMemo<SurfaceContextValue>(
    () => ({ ...surface, mode, motionSafe, host, active }),
    [surface, mode, motionSafe, host, active],
  );

  return (
    <SurfaceContext.Provider value={value}>
      <div
        ref={setHost}
        data-surface-mode={mode}
        data-surface-version={surface.version}
        data-surface-active={active ? "true" : "false"}
        className={cn("relative", className)}
        style={style}
      >
        <div
          ref={rootRef}
          data-surface-root
          // The painted root must not contain the effect layer: the layer
          // is a sibling, so the painter never paints its own output.
          style={hidden ? { opacity: 0 } : undefined}
        >
          {children}
        </div>
        <div
          aria-hidden
          data-surface-effect
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {effect}
        </div>
      </div>
    </SurfaceContext.Provider>
  );
}
