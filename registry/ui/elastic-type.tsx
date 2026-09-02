"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ElasticTypeProps = {
  text: string;
  /** Pixel radius of the cursor's influence. @default 120 */
  radius?: number;
  /** Maximum horizontal squash at the cursor (0-1). @default 0.55 */
  squash?: number;
  as?: "h1" | "h2" | "p" | "span";
  className?: string;
};

type GlyphEntry = {
  el: HTMLSpanElement;
  scaleX: MotionValue<number>;
  scaleY: MotionValue<number>;
};

type GlyphCenter = { cx: number; cy: number };

/**
 * Oversized display type that behaves like a row of rubber blocks: every
 * glyph owns its own spring pair — scaleX and scaleY — squashed by a
 * cursor-distance falloff so letters near the pointer compress while their
 * volume holds roughly steady, width lost to height gained. Move on, or lift
 * a touch, and each glyph snaps back on `springs.recoil`, which visibly
 * overshoots past 1 before it settles — that rebound is the whole point, not
 * an afterthought. Built for 404 numerals and one-word headlines, where
 * every character can carry its own weight. Reduced motion: glyphs never
 * deform — the text renders plainly, still one accessible string via the
 * wrapper's aria-label.
 */
export function ElasticType({
  text,
  radius = 120,
  squash = 0.55,
  as = "p",
  className,
}: ElasticTypeProps) {
  const motionSafe = useMotionSafe();

  const wrapperRef = React.useRef<HTMLElement>(null);
  const registryRef = React.useRef<Map<string, GlyphEntry>>(new Map());
  const rectsRef = React.useRef<Map<string, GlyphCenter>>(new Map());

  // Both caches belong to the component instance, not any one glyph — alias
  // them here so the returned cleanup never has to re-read `.current`.
  React.useEffect(() => {
    const registry = registryRef.current;
    const rects = rectsRef.current;
    return () => {
      registry.clear();
      rects.clear();
    };
  }, []);

  // Stable identity: Glyph's own effect depends on it, and refs never change.
  const register = React.useCallback((id: string, entry: GlyphEntry | null) => {
    if (entry) {
      registryRef.current.set(id, entry);
    } else {
      registryRef.current.delete(id);
      rectsRef.current.delete(id);
    }
  }, []);

  const remeasure = () => {
    registryRef.current.forEach((entry, id) => {
      const rect = entry.el.getBoundingClientRect();
      rectsRef.current.set(id, {
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
      });
    });
  };

  // Re-cache every glyph's center whenever the wrapper's box changes.
  React.useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => remeasure());
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  // The only place pointer energy turns into a write: each glyph's distance
  // to (x, y) drives a falloff, retargeted every call — snap toward the
  // squash inside the radius, recoil back to 1 outside it.
  const driveAt = (x: number, y: number) => {
    registryRef.current.forEach((entry, id) => {
      const center = rectsRef.current.get(id);
      if (!center) return;
      const d = Math.hypot(center.cx - x, center.cy - y);
      const t = Math.max(0, 1 - d / radius);
      if (t > 0) {
        animate(entry.scaleX, 1 - squash * t, springs.snap);
        animate(entry.scaleY, 1 + squash * 0.6 * t, springs.snap);
      } else {
        animate(entry.scaleX, 1, springs.recoil);
        animate(entry.scaleY, 1, springs.recoil);
      }
    });
  };

  const settleAll = () => {
    registryRef.current.forEach((entry) => {
      animate(entry.scaleX, 1, springs.recoil);
      animate(entry.scaleY, 1, springs.recoil);
    });
  };

  const handlePointerEnter = (event: React.PointerEvent<HTMLElement>) => {
    if (!motionSafe) return;
    remeasure();
    driveAt(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!motionSafe) return;
    driveAt(event.clientX, event.clientY);
  };

  const handlePointerLeave = () => {
    if (!motionSafe) return;
    settleAll();
  };

  // Touch: a press at a point does what a hover would, and release settles.
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!motionSafe) return;
    remeasure();
    driveAt(event.clientX, event.clientY);
  };

  const handlePointerUp = () => {
    if (!motionSafe) return;
    settleAll();
  };

  const glyphs = Array.from(text);

  return React.createElement(
    as,
    {
      ref: wrapperRef,
      "aria-label": text,
      className: cn("touch-none select-none", className),
      onPointerEnter: handlePointerEnter,
      onPointerMove: handlePointerMove,
      onPointerLeave: handlePointerLeave,
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
    glyphs.map((ch, i) => (
      <Glyph key={i} id={String(i)} char={ch} register={register} />
    )),
  );
}

type GlyphProps = {
  id: string;
  char: string;
  register: (id: string, entry: GlyphEntry | null) => void;
};

/**
 * One glyph, one spring pair. Registers its element and its scaleX/scaleY
 * motion values into the parent's registry on mount and unregisters on
 * unmount — the parent drives the values imperatively; this component never
 * reads them back.
 */
function Glyph({ id, char, register }: GlyphProps) {
  const scaleX = useMotionValue<number>(1);
  const scaleY = useMotionValue<number>(1);
  const elRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    register(id, { el, scaleX, scaleY });
    return () => {
      register(id, null);
    };
  }, [id, register, scaleX, scaleY]);

  return (
    <motion.span
      ref={elRef}
      aria-hidden
      className="inline-block will-change-transform"
      style={{
        transformOrigin: "bottom center",
        scaleX,
        scaleY,
      }}
    >
      {char === " " ? " " : char}
    </motion.span>
  );
}
