"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";

import { STAGE, type PointerState } from "./input";

/**
 * A camera over a scene laid out in world pixels: the world point (x, y)
 * sits at the frame's centre, magnified `zoom` times. Pure transform — the
 * DOM underneath is re-rasterised at every scale, so a 30× macro of a live
 * component is as sharp as the component at rest.
 */
export function Camera({
  x,
  y,
  zoom,
  rotate = 0,
  className,
  style,
  children,
}: {
  x: number;
  y: number;
  zoom: number;
  rotate?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const transform = `translate(${STAGE.width / 2}px, ${STAGE.height / 2}px) rotate(${rotate}deg) scale(${zoom}) translate(${-x}px, ${-y}px)`;
  return (
    <div
      className={cn("absolute top-0 left-0", className)}
      style={{ transformOrigin: "0 0", transform, ...style }}
    >
      {children}
    </div>
  );
}

/** A full-frame layer; scenes stack these. */
export function Layer({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn("absolute inset-0 overflow-clip", className)}
      style={style}
    >
      {children}
    </div>
  );
}

export type CursorHandle = { set: (state: PointerState | null) => void };

/**
 * The visitor's hand, drawn by the film. Real input lands on the components
 * through the director; this is what the audience sees of it — an arrow
 * that dips on press. Positioned imperatively after each frame's layout, so
 * it is exactly where the real pointer is.
 */
export const Cursor = React.forwardRef<CursorHandle>(function Cursor(_, ref) {
  const root = React.useRef<HTMLDivElement>(null);
  const arrow = React.useRef<SVGSVGElement>(null);
  React.useImperativeHandle(ref, () => ({
    set(state) {
      const el = root.current;
      const svg = arrow.current;
      if (!el || !svg) return;
      if (!state || !state.visible) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = "1";
      el.style.transform = `translate(${Math.round(state.x * 10) / 10}px, ${Math.round(state.y * 10) / 10}px)`;
      svg.style.transform = state.down ? "scale(0.88)" : "scale(1)";
    },
  }));
  return (
    <div
      ref={root}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-50"
      style={{ opacity: 0 }}
    >
      <svg
        ref={arrow}
        width={34}
        height={44}
        viewBox="0 0 17 22"
        className="block"
        style={{
          transformOrigin: "1px 1px",
          filter: "drop-shadow(0 3px 6px oklch(0 0 0 / 0.45))",
        }}
      >
        <path
          d="M1 1 L1 17.2 L5.1 13.4 L7.9 20.1 L10.6 19 L7.8 12.4 L13.4 12.4 Z"
          fill="oklch(0.99 0 0)"
          stroke="oklch(0.16 0.02 258)"
          strokeWidth={1.1}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});
