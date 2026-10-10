"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EdgeHazeEdges = "both" | "top" | "bottom";

export type EdgeHazeProps = {
  /** The scrolling content. */
  children: React.ReactNode;
  /** The blur at the very edge, in CSS pixels; it halves at each step inward. @default 10 */
  strength?: number;
  /** How deep the haze reaches into the area at its fullest, in CSS pixels. @default 64 */
  height?: number;
  /** Which edges haze over when content is hidden beyond them. @default "both" */
  edges?: EdgeHazeEdges;
  /** How many blur layers build the ramp, 3 to 8: more is smoother and costs more. @default 6 */
  steps?: number;
  /** How far the content fades into the surface at the very edge as well as blurring, 0 (not at all) to 1 (gone at the edge). @default 0.5 */
  fade?: number;
  /** How many pixels of hidden content give the full haze; less hidden, less haze. @default height × 1.5 */
  reach?: number;
  /** The colour the content fades into at the edge, any CSS colour. @default the first solid background behind the area, read on the element and again when the theme changes */
  tint?: string;
  /** The scroll area's maximum height (a number is CSS pixels); or size the box with `className`. */
  maxHeight?: number | string;
  /** The scroll area's accessible name. @default "Scrollable content" */
  label?: string;
  /** Keep keyboard-focused content and page steps clear of the haze. @default true */
  scrollPadding?: boolean;
  /** Fires when content starts or stops being hidden beyond either edge, and once on the first measure. */
  onEdgesChange?: (edges: { top: boolean; bottom: boolean }) => void;
  /** A ref to the scrolling element, for hosts that scroll it themselves. */
  viewportRef?: React.Ref<HTMLDivElement>;
  /** Classes for the scrolling element. */
  viewportClassName?: string;
  /** Classes for the box. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

type Rgba = [number, number, number, number];

/** Resolves any CSS colour the canvas can parse into sRGB bytes and alpha. */
function rgbaReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgba => {
    if (!ctx) return [0, 0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0];
  };
}

/** One edge's haze: `steps` backdrop blurs, each masked to start a step further out. */
function HazeStack({
  edge,
  steps,
  strength,
  gutter,
  size,
  opacity,
  wash,
}: {
  edge: "top" | "bottom";
  steps: number;
  strength: number;
  gutter: number;
  size: MotionValue<number>;
  opacity: MotionValue<number>;
  wash: MotionValue<string>;
}) {
  const n = Math.round(clamp(steps, 3, 8));
  // The gradient runs from the inner edge of the haze (0%) to the area's
  // edge (100%), so the strongest blur only ever lies against the edge.
  const toward = edge === "top" ? "to top" : "to bottom";
  return (
    <motion.div
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-0 z-10 rounded-[inherit]",
        edge === "top" ? "top-0" : "bottom-0",
      )}
      style={{ right: gutter, height: size, opacity }}
    >
      {Array.from({ length: n }, (_, i) => {
        const blur = strength * Math.pow(2, i - (n - 1));
        const mask = `linear-gradient(${toward}, transparent ${r2((i / n) * 100)}%, black ${r2(((i + 1) / n) * 100)}%)`;
        return (
          <div
            key={i}
            className="absolute inset-0 rounded-[inherit]"
            style={{
              backdropFilter: `blur(${r2(blur)}px)`,
              WebkitBackdropFilter: `blur(${r2(blur)}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
      {/* The fade: the surface's own colour, deepening toward the edge. It
          stands still while the content scrolls under it, so it can never
          lag a fast scroll the way a mask on the content would. */}
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{ backgroundImage: wash }}
      />
    </motion.div>
  );
}

/**
 * A scroll area whose edges dissolve instead of cutting off. Over the top and
 * bottom of a native scroll viewport sit stacks of backdrop blurs — each
 * twice the last and masked to begin a step further toward the edge — so the
 * content slips from sharp to `strength` pixels of blur along a smooth ramp,
 * while a wash of the surface's own colour — found behind the area, or
 * `tint` — deepens toward the edge by `fade`, so it dissolves into the card
 * it sits on rather than stopping at a line.
 *
 * Each edge's haze measures what it hides: the hidden distance beyond that
 * edge over `reach`, followed on springs.glide, so the bottom haze recedes as
 * the end comes near and lifts away when you arrive while the top one
 * gathers as content scrolls out above. With nothing to scroll, no haze is
 * drawn at all. The viewport is a focusable region while it overflows, so
 * the keyboard scrolls it natively, and scroll padding keeps a focused item
 * clear of the blur. Under reduced motion the haze follows the scroll
 * directly, with no spring.
 */
export function EdgeHaze({
  children,
  strength = 10,
  height = 64,
  edges = "both",
  steps = 6,
  fade = 0.5,
  reach,
  tint,
  maxHeight,
  label = "Scrollable content",
  scrollPadding = true,
  onEdgesChange,
  viewportRef,
  viewportClassName,
  className,
}: EdgeHazeProps) {
  const motionSafe = useMotionSafe();
  const viewport = React.useRef<HTMLDivElement | null>(null);
  const content = React.useRef<HTMLDivElement | null>(null);
  // Unknown on the server: a fresh scroll area that overflows has content
  // hidden below and nothing above, so that is the first frame drawn.
  const [overflowing, setOverflowing] = React.useState<boolean | null>(null);
  const [gutter, setGutter] = React.useState(0);

  const hasTop = edges !== "bottom";
  const hasBottom = edges !== "top";
  const depth = Math.max(0, height);
  const span = Math.max(1, reach ?? depth * 1.5);

  // How much each edge hides (0..1), and what is drawn from it.
  const top = useMotionValue(0);
  const bottom = useMotionValue(hasBottom ? 1 : 0);
  const topSize = useMotionValue(0);
  const topOpacity = useMotionValue(0);
  const bottomSize = useMotionValue(hasBottom ? r2(depth) : 0);
  const bottomOpacity = useMotionValue(hasBottom ? 1 : 0);
  // The fade's colour is read from the page, which the server cannot do, so
  // the first frame is the blur alone.
  const topWash = useMotionValue("none");
  const bottomWash = useMotionValue("none");
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const params = React.useRef({
    hasTop,
    hasBottom,
    depth,
    span,
    fade,
    tint,
    motionSafe,
    onEdgesChange,
  });
  React.useEffect(() => {
    params.current = {
      hasTop,
      hasBottom,
      depth,
      span,
      fade,
      tint,
      motionSafe,
      onEdgesChange,
    };
  });

  const api = React.useRef<{
    measure: () => void;
    restyle: () => void;
  } | null>(null);

  React.useEffect(() => {
    const view = viewport.current;
    const inner = content.current;
    const root = rootRef.current;
    if (!view || !inner || !root) return;
    const read = rgbaReader();
    let over: boolean | null = null;
    let reported: string | null = null;
    const running: AnimationPlaybackControls[] = [];

    const paint = () => {
      const p = params.current;
      const t = p.hasTop && over ? top.get() : 0;
      const b = p.hasBottom && over ? bottom.get() : 0;
      topSize.set(r2(p.depth * t));
      topOpacity.set(r3(clamp(t * 3, 0, 1)));
      bottomSize.set(r2(p.depth * b));
      bottomOpacity.set(r3(clamp(b * 3, 0, 1)));
    };

    /** The surface the area sits on: the first solid background behind it. */
    const restyle = () => {
      const p = params.current;
      let colour = p.tint;
      if (!colour) {
        for (let n: HTMLElement | null = root; n; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          const c = read(bg);
          if (c[3] >= 128) {
            colour = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
            break;
          }
        }
      }
      const f = Math.round(clamp(p.fade, 0, 1) * 100);
      if (f <= 0) {
        topWash.set("none");
        bottomWash.set("none");
        return;
      }
      const edge = `color-mix(in oklab, ${colour ?? "var(--background)"} ${f}%, transparent)`;
      topWash.set(`linear-gradient(to top, transparent, ${edge})`);
      bottomWash.set(`linear-gradient(to bottom, transparent, ${edge})`);
    };

    const follow = (mv: MotionValue<number>, to: number, slot: number) => {
      running[slot]?.stop();
      if (!params.current.motionSafe) {
        mv.jump(to);
        paint();
        return;
      }
      running[slot] = animate(mv, to, springs.glide);
    };

    const update = () => {
      const p = params.current;
      const max = view.scrollHeight - view.clientHeight;
      const y = clamp(view.scrollTop, 0, Math.max(0, max));
      const above = over ? y : 0;
      const below = over ? Math.max(0, max - y) : 0;
      follow(top, clamp(above / p.span, 0, 1), 0);
      follow(bottom, clamp(below / p.span, 0, 1), 1);
      const edgesNow = { top: above > 0.5, bottom: below > 0.5 };
      const key = `${edgesNow.top}:${edgesNow.bottom}`;
      if (key !== reported) {
        reported = key;
        p.onEdgesChange?.(edgesNow);
      }
    };

    const measure = () => {
      const fits = view.scrollHeight - view.clientHeight <= 0.5;
      if (over !== !fits) {
        over = !fits;
        setOverflowing(over);
      }
      setGutter(Math.max(0, view.offsetWidth - view.clientWidth));
      update();
      paint();
    };

    const unsubTop = top.on("change", paint);
    const unsubBottom = bottom.on("change", paint);
    const sizer = new ResizeObserver(measure);
    sizer.observe(view);
    sizer.observe(inner);
    view.addEventListener("scroll", update, { passive: true });
    api.current = { measure, restyle };
    restyle();

    return () => {
      for (const c of running) c?.stop();
      unsubTop();
      unsubBottom();
      sizer.disconnect();
      view.removeEventListener("scroll", update);
      api.current = null;
    };
  }, [
    top,
    bottom,
    topSize,
    topOpacity,
    bottomSize,
    bottomOpacity,
    topWash,
    bottomWash,
  ]);

  // A new depth, reach or edge set is drawn at once; a new fade or tint
  // re-reads the surface.
  React.useEffect(() => {
    api.current?.measure();
  }, [hasTop, hasBottom, depth, span, motionSafe]);
  React.useEffect(() => {
    api.current?.restyle();
  }, [fade, tint]);

  // The host's ref gets the scrolling element itself, once it exists.
  React.useImperativeHandle(
    viewportRef,
    () => viewport.current as HTMLDivElement,
    [],
  );

  const hazed = overflowing !== false;
  const padTop = scrollPadding && hasTop ? r2(depth) : undefined;
  const padBottom = scrollPadding && hasBottom ? r2(depth) : undefined;

  return (
    <div
      ref={rootRef}
      className={cn("relative isolate flex flex-col", className)}
    >
      <div
        ref={viewport}
        role="region"
        aria-label={label}
        tabIndex={overflowing ? 0 : undefined}
        className={cn(
          "relative flex-1 overflow-y-auto overscroll-contain rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          viewportClassName,
        )}
        style={{
          maxHeight,
          scrollPaddingTop: padTop,
          scrollPaddingBottom: padBottom,
        }}
      >
        <div ref={content}>{children}</div>
      </div>
      {hazed && hasTop ? (
        <HazeStack
          edge="top"
          steps={steps}
          strength={strength}
          gutter={gutter}
          size={topSize}
          opacity={topOpacity}
          wash={topWash}
        />
      ) : null}
      {hazed && hasBottom ? (
        <HazeStack
          edge="bottom"
          steps={steps}
          strength={strength}
          gutter={gutter}
          size={bottomSize}
          opacity={bottomOpacity}
          wash={bottomWash}
        />
      ) : null}
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.restyle()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </div>
  );
}
