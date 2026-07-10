"use client";

import * as React from "react";

import { motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type Stratum = {
  id: string;
  label: string;
  content: React.ReactNode;
  /** The interlayer note revealed as scroll passes the seam below this stratum. */
  note?: string;
};

export type StrataScrollProps = {
  /** Three to six strata, top to bottom. */
  strata: Stratum[];
  /** Viewport height in px. @default 320 */
  height?: number;
  /** Fires when the stratum nearest the viewport center changes. */
  onFocusChange?: (id: string) => void;
  className?: string;
  "aria-label"?: string;
};

/** Half-window (px) around the center in which a seam is considered open. */
const SEAM_WINDOW = 220;
/** Interlayer strip height — fixed in layout so nothing ever thrashes. */
const SEAM_HEIGHT = 48;

/**
 * Content strata separate as scroll passes between them. Every strip between
 * two plates hides an interlayer note; when its seam crosses the viewport
 * center the note wakes (fade + unsquash) while the upper plate leans back and
 * the lower leans forward — all scrubbed 1:1 from scroll position through
 * transforms only, so layout never shifts under the reader. A depth rule on
 * the left tracks progress, and the stratum nearest center carries the accent
 * and is announced politely. Under reduced motion the notes render as static
 * dividers and only the active tracking remains.
 */
export function StrataScroll({
  strata,
  height = 320,
  onFocusChange,
  className,
  "aria-label": ariaLabel = "Strata",
}: StrataScrollProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  /** Measured element centers (plates and seams), in track coordinates. */
  const metricsRef = React.useRef<{ plates: number[]; seams: number[] }>({
    plates: [],
    seams: [],
  });
  const scrollY = useMotionValue(0);
  const progress = useMotionValue(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const announcedRef = React.useRef(0);

  const list = strata.slice(0, 6);

  // Measure plate/seam centers; re-measure on any size change. Writes go to a
  // ref (not state) — transforms re-read it on the next scroll tick, and we
  // nudge scrollY so maps recompute immediately after a resize.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const plates: number[] = [];
      const seams: number[] = [];
      container
        .querySelectorAll<HTMLElement>("[data-strata-plate]")
        .forEach((el) => {
          plates.push(el.offsetTop + el.offsetHeight / 2);
        });
      container
        .querySelectorAll<HTMLElement>("[data-strata-seam]")
        .forEach((el) => {
          seams.push(el.offsetTop + el.offsetHeight / 2);
        });
      metricsRef.current = { plates, seams };
      scrollY.set(container.scrollTop);
      progress.set(
        container.scrollHeight <= container.clientHeight
          ? 0
          : container.scrollTop /
              (container.scrollHeight - container.clientHeight),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const el of container.querySelectorAll<HTMLElement>(
      "[data-strata-plate]",
    )) {
      observer.observe(el);
    }
    measure();
    return () => observer.disconnect();
  }, [scrollY, progress, list.length]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    scrollY.set(el.scrollTop);
    progress.set(
      el.scrollHeight <= el.clientHeight
        ? 0
        : el.scrollTop / (el.scrollHeight - el.clientHeight),
    );
  };

  // Active stratum = plate center nearest the viewport center.
  useMotionValueEvent(scrollY, "change", (top) => {
    const container = containerRef.current;
    if (!container) return;
    const center = top + container.clientHeight / 2;
    const { plates } = metricsRef.current;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < plates.length; i += 1) {
      const d = Math.abs((plates[i] ?? 0) - center);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    if (nearest !== announcedRef.current) {
      announcedRef.current = nearest;
      setActiveIndex(nearest);
      const stratum = list[nearest];
      if (stratum) onFocusChange?.(stratum.id);
    }
  });

  const ruleTop = useTransform(progress, (p) => `${4 + clamp(p, 0, 1) * 92}%`);

  return (
    <div className={cn("relative", className)}>
      {/* depth rule */}
      <div
        aria-hidden
        className="border-hairline absolute top-0 bottom-0 left-0 w-6 border-r"
      >
        <motion.span
          className="bg-cobalt-bright absolute left-1/2 h-3 w-0.5 -translate-x-1/2 rounded-full"
          style={{ top: ruleTop }}
        />
        {list.map((stratum, i) => (
          <span
            key={stratum.id}
            className="text-ink-3 absolute left-1/2 -translate-x-1/2 font-mono text-[9px]"
            style={{ top: `${6 + (i / Math.max(list.length - 1, 1)) * 86}%` }}
          >
            {String(i * 12).padStart(2, "0")}
          </span>
        ))}
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        style={{ height }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 ml-6 overflow-y-auto rounded-3 border p-3 outline-none focus-visible:ring-2"
      >
        {list.map((stratum, i) => (
          <React.Fragment key={stratum.id}>
            <StratumPlate
              stratum={stratum}
              index={i}
              active={i === activeIndex}
              motionSafe={motionSafe}
              scrollY={scrollY}
              metricsRef={metricsRef}
              containerRef={containerRef}
            />
            {i < list.length - 1 ? (
              <Seam
                index={i}
                note={stratum.note}
                motionSafe={motionSafe}
                scrollY={scrollY}
                metricsRef={metricsRef}
                containerRef={containerRef}
              />
            ) : null}
          </React.Fragment>
        ))}
      </div>

      <span aria-live="polite" className="sr-only" role="status">
        {list[activeIndex]?.label}
      </span>
    </div>
  );
}

type SharedScrubProps = {
  index: number;
  motionSafe: boolean;
  scrollY: ReturnType<typeof useMotionValue<number>>;
  metricsRef: React.RefObject<{ plates: number[]; seams: number[] }>;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

/** Openness (0..1) of seam `index` given the current scroll position. */
function seamOpenness(
  seamCenter: number | undefined,
  top: number,
  viewport: number,
): number {
  if (seamCenter === undefined) return 0;
  const dist = Math.abs(seamCenter - (top + viewport / 2));
  return 1 - clamp(dist / SEAM_WINDOW, 0, 1);
}

function StratumPlate({
  stratum,
  index,
  active,
  motionSafe,
  scrollY,
  metricsRef,
  containerRef,
}: SharedScrubProps & { stratum: Stratum; active: boolean }) {
  // The plate leans by the MAX openness of its adjacent seams: back when the
  // seam below opens, forward when the seam above does.
  const lean = useTransform(scrollY, (top) => {
    const viewport = containerRef.current?.clientHeight ?? 0;
    const below = seamOpenness(metricsRef.current.seams[index], top, viewport);
    const above = seamOpenness(
      metricsRef.current.seams[index - 1],
      top,
      viewport,
    );
    return below >= above ? -below : above;
  });
  const scale = useTransform(lean, (l) =>
    l <= 0 ? 1 + l * 0.015 : 1 + l * 0.005,
  );
  const y = useTransform(lean, (l) => l * 6);
  const opacity = useTransform(lean, (l) =>
    l < 0 ? mapRange(-l, 0, 1, 1, 0.85) : 1,
  );

  return (
    <motion.section
      data-strata-plate
      aria-label={stratum.label}
      style={motionSafe ? { scale, y, opacity } : undefined}
      className={cn(
        "border-hairline rounded-3 border p-4 transition-colors",
        active
          ? "bg-surface-2 border-l-cobalt-bright border-l-2"
          : "bg-surface-1",
      )}
    >
      <p className="text-label text-ink-3">
        {String(index + 1).padStart(2, "0")} ·{" "}
        <span className={active ? "text-cobalt-bright" : undefined}>
          {stratum.label}
        </span>
      </p>
      <div className="mt-2">{stratum.content}</div>
    </motion.section>
  );
}

function Seam({
  index,
  note,
  motionSafe,
  scrollY,
  metricsRef,
  containerRef,
}: SharedScrubProps & { note?: string }) {
  const openness = useTransform(scrollY, (top) =>
    seamOpenness(
      metricsRef.current.seams[index],
      top,
      containerRef.current?.clientHeight ?? 0,
    ),
  );
  const noteOpacity = useTransform(openness, (o) => mapRange(o, 0.15, 1, 0, 1));
  const noteScaleY = useTransform(openness, (o) => 0.6 + o * 0.4);
  const seamLine = useTransform(openness, (o) => 1 - o);

  return (
    <div
      data-strata-seam
      aria-hidden={note ? undefined : true}
      style={{ height: SEAM_HEIGHT }}
      className="relative flex items-center justify-center"
    >
      {/* closed-seam line, fading away as the seam opens */}
      <motion.span
        aria-hidden
        className="bg-hairline-strong absolute right-6 left-6 h-px"
        style={motionSafe ? { opacity: seamLine } : { opacity: 0 }}
      />
      {note ? (
        <motion.p
          style={
            motionSafe
              ? { opacity: noteOpacity, scaleY: noteScaleY }
              : undefined
          }
          className="text-ink-3 px-6 text-center font-mono text-[10px] tracking-wide"
          transition={{ duration: durations.fast }}
        >
          {note}
        </motion.p>
      ) : null}
    </div>
  );
}
