"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BandTypeProps = {
  text: string;
  /** Horizontal bands. @default 7 */
  bands?: number;
  /** Max horizontal slip in px at the cursor. @default 28 */
  slip?: number;
  /** Vertical pixel radius of the cursor's influence. @default 90 */
  radius?: number;
  as?: "h1" | "h2" | "p" | "span";
  className?: string;
};

/**
 * Hydration-safe "has the client committed" flag — false on the server and
 * on the first client render, true once mounted. Gating the band tree on
 * this (rather than on useMotionSafe(), which reports true during SSR)
 * keeps the reduced-motion "whole word" markup identical between server and
 * first client paint.
 */
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

type WrapperRect = { top: number; height: number };

/** Band `index` of `count`, extended 0.5px past its true edges so adjacent
 * bands overlap a hair instead of leaving a seam at fractional scales. */
function clipFor(index: number, count: number): string {
  const top = (index / count) * 100;
  const bottom = 100 - ((index + 1) / count) * 100;
  return `inset(calc(${top}% - 0.5px) 0px calc(${bottom}% - 0.5px) 0px)`;
}

/**
 * A word sliced into horizontal bands, each a clipped copy of the same
 * string layered edge to edge with a hairline overlap so the tiling never
 * shows a seam. The band nearest the cursor slips sideways furthest, on a
 * falloff from `radius`, and neighbouring bands alternate direction — that
 * alternation, not the distance, is what reads as the type slipping rather
 * than leaning as one block. Leaving settles every band back to rest on a
 * small-overshoot spring, staggered top to bottom so the return reads as a
 * wave. Touch treats a press as the hover point and its release as the
 * leave. Reduced motion: bands never move — the word renders once, whole,
 * and no pointer handlers are attached.
 */
export function BandType({
  text,
  bands = 7,
  slip = 28,
  radius = 90,
  as = "span",
  className,
}: BandTypeProps) {
  const motionSafe = useMotionSafe();
  const mounted = useMounted();
  const showBands = mounted && motionSafe;

  const count = Math.max(1, Math.round(bands));

  const wrapperRef = React.useRef<HTMLElement>(null);
  const rectRef = React.useRef<WrapperRect>({ top: 0, height: 0 });
  const bandsRef = React.useRef<Map<number, MotionValue<number>>>(new Map());

  const register = React.useCallback(
    (index: number, mv: MotionValue<number> | null) => {
      if (mv) bandsRef.current.set(index, mv);
      else bandsRef.current.delete(index);
    },
    [],
  );

  const measure = React.useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    rectRef.current = { top: rect.top, height: rect.height };
  }, []);

  // Stay sized to the wrapper as it reflows (font load, resize, zoom).
  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  // Full teardown of the registration map on unmount.
  React.useEffect(() => {
    const map = bandsRef.current;
    return () => {
      map.clear();
    };
  }, []);

  const retarget = (clientY: number) => {
    const rect = rectRef.current;
    if (rect.height <= 0) return;
    const y = clientY - rect.top;
    const bandHeight = rect.height / count;
    for (const [index, mv] of bandsRef.current) {
      const centerY = (index + 0.5) * bandHeight;
      const d = Math.abs(y - centerY);
      const t = radius > 0 ? Math.max(0, 1 - d / radius) : 0;
      const sign = index % 2 === 0 ? 1 : -1;
      animate(mv, sign * slip * t, springs.snap);
    }
  };

  const settle = () => {
    const step = cascade(count);
    for (const [index, mv] of bandsRef.current) {
      animate(mv, 0, { ...springs.recoil, delay: index * step });
    }
  };

  const handlePointerEnter = (event: React.PointerEvent<HTMLElement>) => {
    measure();
    retarget(event.clientY);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    retarget(event.clientY);
  };
  const handlePointerLeave = () => {
    settle();
  };
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    measure();
    retarget(event.clientY);
  };
  const handlePointerUp = () => {
    settle();
  };

  return React.createElement(
    as,
    {
      ref: wrapperRef,
      "aria-label": text,
      className: cn("relative inline-block select-none", className),
      onPointerEnter: showBands ? handlePointerEnter : undefined,
      onPointerMove: showBands ? handlePointerMove : undefined,
      onPointerLeave: showBands ? handlePointerLeave : undefined,
      onPointerDown: showBands ? handlePointerDown : undefined,
      onPointerUp: showBands ? handlePointerUp : undefined,
      onPointerCancel: showBands ? handlePointerLeave : undefined,
    },
    // The one reference copy — always in flow, sizing the wrapper. Under
    // full motion it stays invisible (the bands tile over it); under
    // reduced motion it is the only thing rendered.
    <span
      key="reference"
      aria-hidden
      className={cn("block", showBands && "invisible")}
    >
      {text}
    </span>,
    showBands
      ? Array.from({ length: count }, (_, index) => (
          <Band
            key={index}
            index={index}
            count={count}
            text={text}
            register={register}
          />
        ))
      : null,
  );
}

type BandProps = {
  index: number;
  count: number;
  text: string;
  register: (index: number, mv: MotionValue<number> | null) => void;
};

/**
 * One band: a clipped copy of the word, absolutely stretched over the
 * wrapper. It owns its own `x` motion value and registers it with the
 * parent on mount, so a single pointermove handler can retarget every
 * band's spring without any band ever re-rendering.
 */
function Band({ index, count, text, register }: BandProps) {
  const x = useMotionValue<number>(0);

  React.useEffect(() => {
    register(index, x);
    return () => register(index, null);
  }, [register, index, x]);

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none block"
      style={{
        position: "absolute",
        inset: 0,
        clipPath: clipFor(index, count),
        x,
      }}
    >
      {text}
    </motion.span>
  );
}
