"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type VanishTypeProps = {
  /** Four to ten words of one statement, in reading order. */
  words: string[];
  /** Scroll-stage height in px. @default 260 */
  height?: number;
  /** Fires when the read head crosses onto a new word. */
  onWordChange?: (index: number) => void;
  className?: string;
  /** Label for the focusable scroll region. @default "Vanishing statement" */
  "aria-label"?: string;
};

/** Scroll track allotted per word, px — sets the scrub gearing. */
const WORD_STEP = 90;
/** Front-left reading slot, as fractions of the stage. */
const FRONT = { x: 0.1, y: 0.68 } as const;
/** Vanishing point, upper-right, as fractions of the stage. */
const VANISH = { x: 0.78, y: 0.22 } as const;
/** How far already-read words drift down-left off the ray, stage fractions. */
const DRIFT = { x: 0.12, y: 0.18 } as const;

/**
 * A statement receding to its vanishing point. Words queue along a ray toward
 * an upper-right vanishing tick; scrolling the internal track advances a read
 * head, and each word in turn is pulled forward into the front-left reading
 * slot at full size under an accent underline. Words still ahead shrink and
 * fade up the ray; words already read drift slightly down-left off it and
 * dim — everything derives 1:1 from scroll position via useTransform, so the
 * scrub is springless and reversible. Screen readers get the whole sentence
 * as one sr-only paragraph (the staging is aria-hidden), the region is
 * keyboard-scrollable, and the active word is announced politely. Under
 * reduced motion the ray collapses to a plain wrapped headline whose active
 * word carries the underline — scroll still drives it, styling swaps
 * instantly.
 */
export function VanishType({
  words,
  height = 260,
  onWordChange,
  className,
  "aria-label": ariaLabel = "Vanishing statement",
}: VanishTypeProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);

  // Scroll progress 0..1 plus measured stage size, all as motion values —
  // every word transform derives from these, so a resize re-flows the ray
  // without any state write.
  const progress = useMotionValue(0);
  const stageW = useMotionValue(0);
  const stageH = useMotionValue(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const announcedRef = React.useRef(0);

  const list = words.slice(0, 10);
  const count = list.length;
  const span = Math.max(count - 1, 1);

  /** The read head in word units: 0 at the first word, count-1 at the last. */
  const head = useTransform(progress, (p) => clamp(p, 0, 1) * span);

  // The stage stays hidden until its first measure so words never flash
  // unpositioned at (0,0) on the frame before ResizeObserver runs.
  const stageReady = useTransform(stageW, (w) => (w > 0 ? 1 : 0));

  // Measure the sticky stage; re-measure on any size change. Sizes land in
  // motion values (not state), and progress is refreshed so every derived
  // transform recomputes against the new geometry.
  React.useEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      stageW.set(stage.clientWidth);
      stageH.set(stage.clientHeight);
      const max = container.scrollHeight - container.clientHeight;
      progress.set(max > 0 ? container.scrollTop / max : 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, [motionSafe, count, progress, stageW, stageH]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    progress.set(max > 0 ? el.scrollTop / max : 0);
  };

  // The active word is round(head); dedupe through a ref so state and the
  // callback only fire when the head actually crosses onto a new word.
  useMotionValueEvent(progress, "change", (p) => {
    const index = clamp(Math.round(clamp(p, 0, 1) * span), 0, span);
    if (index !== announcedRef.current) {
      announcedRef.current = index;
      setActiveIndex(index);
      onWordChange?.(index);
    }
  });

  return (
    <div className={cn("relative", className)}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        style={{ height }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 overflow-y-auto rounded-3 border outline-none focus-visible:ring-2"
      >
        {/* AT reads the statement whole; the staging below is decorative. */}
        <p className="sr-only">{list.join(" ")}</p>

        <div
          aria-hidden
          style={{ height: count * WORD_STEP }}
          className="pointer-events-none select-none"
        >
          {motionSafe ? (
            <motion.div
              ref={stageRef}
              className="sticky top-0 overflow-hidden"
              style={{ height, opacity: stageReady }}
            >
              {/* Ray hairline from the reading slot to the vanishing point. */}
              <svg
                className="absolute inset-0 size-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <line
                  x1={FRONT.x * 100}
                  y1={FRONT.y * 100}
                  x2={VANISH.x * 100}
                  y2={VANISH.y * 100}
                  stroke="var(--hairline-strong)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {/* Vanishing-point tick. */}
              <span
                className="border-hairline-strong absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                style={{
                  left: `${VANISH.x * 100}%`,
                  top: `${VANISH.y * 100}%`,
                }}
              />
              {list.map((word, i) => (
                <RayWord
                  key={`${i}-${word}`}
                  word={word}
                  index={i}
                  count={count}
                  head={head}
                  stageW={stageW}
                  stageH={stageH}
                />
              ))}
            </motion.div>
          ) : (
            /* Reduced motion: no recession — a plain wrapped headline whose
               active word carries the underline as scroll advances. */
            <div
              className="sticky top-0 flex items-center px-5"
              style={{ height }}
            >
              <p className="text-ink text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                {list.map((word, i) => (
                  <React.Fragment key={`${i}-${word}`}>
                    <span
                      className={cn(
                        i === activeIndex &&
                          "decoration-[var(--accent-bright)] underline decoration-2 underline-offset-4",
                      )}
                    >
                      {word}
                    </span>
                    {i < count - 1 ? " " : null}
                  </React.Fragment>
                ))}
              </p>
            </div>
          )}
        </div>
      </div>

      <span aria-live="polite" role="status" className="sr-only">
        {`Word ${activeIndex + 1} of ${count}: ${list[activeIndex] ?? ""}`}
      </span>
    </div>
  );
}

type RayWordProps = {
  word: string;
  index: number;
  count: number;
  head: MotionValue<number>;
  stageW: MotionValue<number>;
  stageH: MotionValue<number>;
};

/**
 * One word on the ray. Its signed distance from the read head picks the
 * mapping — ahead recedes up the ray toward the vanishing point, behind
 * drifts down-left out of the queue — while scale and opacity fall off with
 * absolute distance. Anchored by its left-center: the outer span translates
 * to the ray point and scales from the top-left origin while the inner block
 * lifts the glyphs half a line, so the anchor never wanders as words shrink.
 */
function RayWord({ word, index, count, head, stageW, stageH }: RayWordProps) {
  const span = Math.max(count - 1, 1);

  const x = useTransform([head, stageW], ([h = 0, w = 0]: number[]) => {
    const signed = (index - h) / span;
    const d = clamp(Math.abs(signed), 0, 1);
    if (signed < 0) return (FRONT.x - d * DRIFT.x) * w;
    return mapRange(d, 0, 1, FRONT.x, VANISH.x) * w;
  });
  const y = useTransform([head, stageH], ([h = 0, sh = 0]: number[]) => {
    const signed = (index - h) / span;
    const d = clamp(Math.abs(signed), 0, 1);
    if (signed < 0) return (FRONT.y + d * DRIFT.y) * sh;
    return mapRange(d, 0, 1, FRONT.y, VANISH.y) * sh;
  });
  const scale = useTransform(head, (h) =>
    mapRange(Math.abs(index - h) / span, 0, 1, 1, 0.28),
  );
  const opacity = useTransform(head, (h) =>
    mapRange(Math.abs(index - h) / span, 0, 1, 1, 0.12),
  );
  /** Nearer the head stacks higher, so the reading slot always wins overlap. */
  const zIndex = useTransform(
    head,
    (h) => 100 - Math.round(clamp(Math.abs(index - h), 0, count) * 8),
  );
  const underline = useTransform(head, (h) =>
    mapRange(Math.abs(index - h), 0.1, 0.55, 1, 0),
  );

  return (
    <motion.span
      className="text-ink absolute top-0 left-0 origin-top-left text-2xl font-semibold tracking-tight whitespace-nowrap sm:text-3xl"
      style={{ x, y, scale, opacity, zIndex }}
    >
      <span className="relative block -translate-y-1/2">
        {word}
        <motion.span
          className="bg-cobalt-bright absolute right-0 -bottom-1.5 left-0 h-0.5 rounded-full"
          style={{ opacity: underline }}
        />
      </span>
    </motion.span>
  );
}
