"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BuoyantLineElement =
  "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";

export type BuoyantLineProps = {
  /** The line. Read once by assistive technology, and copied as written. */
  text: string;
  /** The element the line renders as. @default "p" */
  as?: BuoyantLineElement;
  /** How deep the letters start below their places, em. @default 1 */
  rise?: number;
  /** How strung out the rise is, 0 (together, brisk) to 1 (one after another, slow to follow). @default 0.5 */
  lag?: number;
  /** How much of the viewport's height the line scrolls through while its letters rise, 0.1 to 1. @default 0.5 */
  range?: number;
  /** Where the rise begins, as a fraction of the viewport's height from its top (1 is the bottom edge). @default 0.92 */
  start?: number;
  /** How far a submerged letter tilts as it sways, degrees. @default 8 */
  sway?: number;
  /** How much the letters bob as they reach the surface, 0 (none) to 1. @default 0.5 */
  bob?: number;
  /** The colour a submerged letter takes before it surfaces into ink. @default "var(--accent-bright)" */
  tint?: string;
  /** Fade the letters with depth. @default true */
  fade?: boolean;
  /** Drive the rise yourself, 0 to 1; overrides scrolling. */
  progress?: number;
  /** Once every letter has surfaced, stay surfaced. @default false */
  once?: boolean;
  /** The scroll container to read; defaults to the nearest scrollable ancestor, or the window. */
  scrollContainer?: React.RefObject<HTMLElement | null>;
  /** The line's progress through its rise, 0 to 1 in steps of 0.01, as it changes. */
  onProgressChange?: (progress: number) => void;
  /** Every letter has surfaced (again). */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Buoyancy builds then eases off as a letter nears the surface. */
const smooth = (u: number) => u * u * (3 - 2 * u);

/** The share of the rise the lag spreads the letters' starts across. */
const SPREAD = 0.6;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** User-perceived characters, so an emoji or an accent never splits in two. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** The nearest ancestor that scrolls vertically, or null for the window. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if (
      overflow === "auto" ||
      overflow === "scroll" ||
      overflow === "overlay"
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

type Float = {
  char: string;
  /** Place among the letters, for its share of the rise. */
  k: number;
  /** Seeded buoyancy: a stiffness factor and a sway phase. */
  buoy: number;
  phase: number;
};

/** Each letter's place and seeded buoyancy; null for spaces. */
function floatsOf(chars: string[], text: string): (Float | null)[] {
  const rand = lcg(hash(text));
  const out: (Float | null)[] = [];
  let k = 0;
  for (const char of chars) {
    if (char.trim() === "") {
      out.push(null);
      continue;
    }
    out.push({
      char,
      k,
      buoy: r2(0.88 + rand() * 0.24),
      phase: r2(rand() * Math.PI * 2),
    });
    k += 1;
  }
  return out;
}

type LetterProps = {
  float: Float;
  count: number;
  progress: MotionValue<number>;
  rise: number;
  lag: number;
  sway: number;
  bob: number;
  tint: string;
  fade: boolean;
  motionSafe: boolean;
};

function Letter({
  float,
  count,
  progress,
  rise,
  lag,
  sway,
  bob,
  tint,
  fade,
  motionSafe,
}: LetterProps) {
  const spread = lag * SPREAD;
  const from = count > 1 ? (float.k / (count - 1)) * spread : 0;
  const span = 1 - spread;
  // Depth: 1 at the bottom of the rise, 0 in place.
  const target = useTransform(progress, (p) =>
    r3(1 - smooth(clamp01((p - from) / span))),
  );
  // Water drags: the letter follows its depth on a spring that softens from
  // snap toward drift as the lag grows, and bobs at the surface by `bob`.
  const stiffness = Math.round(
    lerp(springs.snap.stiffness, springs.drift.stiffness, lag) * float.buoy,
  );
  const ratio = lerp(1, 0.53, bob);
  const sprung = useSpring(target, {
    stiffness,
    damping: r2(2 * ratio * Math.sqrt(stiffness)),
    mass: 1,
  });
  const depth = motionSafe ? sprung : target;

  const y = useTransform(depth, (d) =>
    motionSafe ? `${r3(d * rise)}em` : "0em",
  );
  const x = useTransform(depth, (d) =>
    motionSafe
      ? `${r3(Math.cos(float.phase * 1.3 + d * 4) * 0.05 * clamp01(d))}em`
      : "0em",
  );
  const rotate = useTransform(depth, (d) =>
    motionSafe ? r2(Math.sin(float.phase + d * 5) * sway * clamp01(d)) : 0,
  );
  const opacity = useTransform(depth, (d) => {
    const under = clamp01(d);
    if (!motionSafe) return r3(0.12 + 0.88 * (1 - under));
    return fade ? r3(Math.pow(1 - under, 0.8)) : 1;
  });
  const color = useTransform(
    depth,
    (d) =>
      `color-mix(in oklab, ${tint} ${Math.round(clamp01(d) * 100)}%, currentColor)`,
  );

  return (
    <motion.span
      className="inline-block"
      style={{ x, y, rotate, opacity, color }}
    >
      {float.char}
    </motion.span>
  );
}

type Api = { read: () => void };

/**
 * Scroll-float text. As the line scrolls up through its scroll container's
 * viewport, its letters float up from below their places as if rising
 * through water — left to right, each on its own share of the scroll — and
 * sink back if the reader scrolls back down. Every letter follows its depth on
 * its own spring, softer the longer the lag and seeded a little differently,
 * so the line drifts up unevenly and bobs as it surfaces; a submerged letter
 * sways, takes the water's tint and fades, and comes out of it into plain ink.
 * The element's bottom edge is the waterline: nothing below it shows.
 *
 * Progress is read from the nearest scrollable ancestor (or the window, or
 * `scrollContainer`) on its scroll events, only while the line is near view;
 * the springs settle and stop. `progress` drives it directly. The text is read
 * once from an sr-only copy. Under reduced motion nothing rises or sways: the
 * letters fade in place from faint to full ink, still with the scroll.
 */
export function BuoyantLine({
  text,
  as = "p",
  rise = 1,
  lag = 0.5,
  range = 0.5,
  start = 0.92,
  sway = 8,
  bob = 0.5,
  tint = "var(--accent-bright)",
  fade = true,
  progress,
  once = false,
  scrollContainer,
  onProgressChange,
  onComplete,
  className,
}: BuoyantLineProps) {
  const motionSafe = useMotionSafe();
  const level = useMotionValue(clamp01(progress ?? 0));
  const rootRef = React.useRef<HTMLElement | null>(null);
  const reported = React.useRef(-1);
  const surfaced = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onProgressChange, onComplete });
  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
  }, []);

  const chars = React.useMemo(() => graphemes(text), [text]);
  const floats = React.useMemo(() => floatsOf(chars, text), [chars, text]);
  const count = floats.filter(Boolean).length;

  /** Sets the rise from a raw progress, latching and reporting as it goes. */
  const settle = (raw: number) => {
    let p = r3(clamp01(raw));
    if (once && surfaced.current) p = 1;
    level.set(p);
    const step = Math.round(p * 100) / 100;
    if (step !== reported.current) {
      reported.current = step;
      report.current.onProgressChange?.(step);
    }
    if (p >= 1 && !surfaced.current) {
      surfaced.current = true;
      report.current.onComplete?.();
    } else if (p < 1 && !once) {
      surfaced.current = false;
    }
  };

  const read = () => {
    if (progress !== undefined) {
      settle(progress);
      return;
    }
    const node = rootRef.current;
    if (!node) return;
    const container = scrollContainer?.current ?? scrollParent(node);
    const box = node.getBoundingClientRect();
    let top = 0;
    let height = window.innerHeight;
    if (container) {
      const view = container.getBoundingClientRect();
      top = view.top + container.clientTop;
      height = container.clientHeight;
    }
    if (height <= 0) return;
    const y = box.top - top;
    settle((clamp01(start) * height - y) / (clamp(range, 0.1, 1) * height));
  };

  React.useLayoutEffect(() => {
    api.current = { read };
    report.current = { onProgressChange, onComplete };
  });

  // Scroll, resize and the line coming near view all re-read the rise; far
  // from view the listener does no work.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || progress !== undefined) return;
    const container = scrollContainer?.current ?? scrollParent(node);
    let near = false;
    const onScroll = () => {
      if (near) api.current?.read();
    };
    const target: HTMLElement | Window = container ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        near = Boolean(entry?.isIntersecting);
        // Leaving view, the last reading still lands: a fast fling past the
        // line leaves it fully risen or fully sunk, never halfway.
        api.current?.read();
      },
      { root: container, rootMargin: "25% 0px" },
    );
    watcher.observe(node);
    const sizer = new ResizeObserver(() => api.current?.read());
    sizer.observe(node);
    if (container) sizer.observe(container);
    api.current?.read();
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      watcher.disconnect();
      sizer.disconnect();
    };
  }, [scrollContainer, progress]);

  // Driven directly, and every change of how the rise maps to the scroll.
  React.useEffect(() => {
    api.current?.read();
  }, [progress, range, start, once]);

  // Words stay whole: the line wraps between them, never inside one.
  const words: { at: number[]; key: number }[] = [];
  let current: number[] = [];
  chars.forEach((char, at) => {
    if (char.trim() === "") {
      if (current.length) words.push({ at: current, key: at });
      current = [];
      return;
    }
    current.push(at);
  });
  if (current.length) words.push({ at: current, key: chars.length });

  const Tag = as;

  return (
    <Tag
      ref={bindRoot}
      className={cn(
        // The waterline: letters below the element's bottom edge stay under.
        "relative [clip-path:inset(-0.15em_-0.1em_0_-0.1em)]",
        className,
      )}
    >
      <span className="sr-only select-none">{text}</span>
      <span aria-hidden>
        {words.map((word, w) => (
          <React.Fragment key={word.key}>
            {w > 0 ? " " : null}
            <span className="inline-block whitespace-nowrap">
              {word.at.map((at) => {
                const float = floats[at];
                if (!float) return null;
                return (
                  <Letter
                    key={at}
                    float={float}
                    count={count}
                    progress={level}
                    rise={rise}
                    lag={clamp01(lag)}
                    sway={sway}
                    bob={clamp01(bob)}
                    tint={tint}
                    fade={fade}
                    motionSafe={motionSafe}
                  />
                );
              })}
            </span>
          </React.Fragment>
        ))}
      </span>
    </Tag>
  );
}
