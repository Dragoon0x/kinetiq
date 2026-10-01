"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";

import { r2 } from "./spring";

/**
 * One line of display type that rises into its own mask: `p` is the
 * entrance (a spring, so it may overshoot and settle back), `out` the exit,
 * which carries on upward out of the same mask. Nothing fades: type arrives
 * and leaves through its baseline, like a slug through a slot.
 */
export function MaskLine({
  p,
  out = 0,
  className,
  style,
  children,
}: {
  p: number;
  out?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const y = (1 - p) * 112 - out * 112;
  return (
    <span
      className={cn("relative block overflow-clip", className)}
      // Room for descenders and the overshoot, so the mask never cuts a glyph.
      style={{ paddingBottom: "0.14em", marginBottom: "-0.14em", ...style }}
    >
      <span
        className="block"
        style={{
          transform: `translateY(${r2(y)}%)`,
          visibility: p <= 0 || out >= 1 ? "hidden" : undefined,
        }}
      >
        {children}
      </span>
    </span>
  );
}

/** Display type: the site's sans, set tight. */
export function Display({
  size,
  className,
  style,
  children,
}: {
  size: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("font-sans font-semibold text-ink", className)}
      style={{
        fontSize: size,
        lineHeight: 0.92,
        letterSpacing: "-0.045em",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The instrument label: mono, uppercase, tracked — serials, readings, notes. */
export function Label({
  size = 15,
  className,
  style,
  children,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn("font-mono text-ink-3 uppercase", className)}
      style={{
        fontSize: size,
        letterSpacing: "0.08em",
        lineHeight: 1.2,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** The first `p` share of a string, for a line being typed. */
export const typed = (text: string, p: number): string =>
  text.slice(
    0,
    Math.max(0, Math.min(text.length, Math.floor(text.length * p + 1e-6))),
  );
