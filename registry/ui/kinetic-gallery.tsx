"use client";

import * as React from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Pointer travel (px) before a press becomes a drag — protects taps on controls/slides. */
const DRAG_THRESHOLD = 3;
/** Release velocity is clamped to a believable throw. */
const MAX_FLING = 3000;
/** Projection horizon: where the throw would coast to, before snapping. */
const PROJECTION = 0.15;
/** Rubber-band resistance applied to overscroll past either edge. */
const RUBBER = 0.35;

type DragState = {
  pointerId: number;
  /** Pointer x where the press began — measures the tap threshold. */
  startX: number;
  /** Track offset (x) when the press began. */
  startX0: number;
  /** Last pointer x, for per-move deltas. */
  lastX: number;
  /** Last move timestamp (ms), for pointer velocity. */
  lastT: number;
  /** Smoothed pointer velocity in px/s; positive moves the track right. */
  velocity: number;
  engaged: boolean;
};

export type KineticGalleryProps = {
  /** Each direct child is a slide. */
  children: React.ReactNode;
  /** Gap in px between slides. */
  gap?: number;
  /** Snap alignment of the active slide within the viewport. */
  align?: "start" | "center";
  className?: string;
  /** Names the gallery region. */
  "aria-label"?: string;
};

/**
 * A horizontal gallery you grab and throw. One pointer gesture tracks the
 * track 1:1 while smoothing its velocity like a flywheel; release projects
 * where the throw would coast, snaps to the nearest slide, and settles there
 * on `glide` carrying the release velocity — so a hard fling overshoots and
 * recovers, a nudge eases over. Prev/Next controls and dot indicators drive
 * the same settle; arrow keys and Home/End steer it. Reduced motion swaps the
 * physics for a native scroll-snap rail — direct swiping still works, inertia
 * is whatever the browser gives.
 */
export function KineticGallery({
  children,
  gap = 16,
  align = "start",
  className,
  "aria-label": ariaLabel = "Gallery",
}: KineticGalleryProps) {
  const motionSafe = useMotionSafe();
  const slides = React.Children.toArray(children);
  const count = slides.length;
  const lastIndex = Math.max(0, count - 1);

  const [index, setIndex] = React.useState(0);

  return motionSafe ? (
    <FlingGallery
      slides={slides}
      count={count}
      lastIndex={lastIndex}
      index={index}
      setIndex={setIndex}
      gap={gap}
      align={align}
      className={className}
      ariaLabel={ariaLabel}
    />
  ) : (
    <ScrollGallery
      slides={slides}
      count={count}
      lastIndex={lastIndex}
      index={index}
      setIndex={setIndex}
      gap={gap}
      align={align}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}

type GalleryChildProps = {
  slides: React.ReactNode[];
  count: number;
  lastIndex: number;
  index: number;
  setIndex: React.Dispatch<React.SetStateAction<number>>;
  gap: number;
  align: "start" | "center";
  className: string | undefined;
  ariaLabel: string;
};

/* -------------------------------------------------------------------------- */
/*                             Motion-safe path                               */
/* -------------------------------------------------------------------------- */

function FlingGallery({
  slides,
  count,
  lastIndex,
  index,
  setIndex,
  gap,
  align,
  className,
  ariaLabel,
}: GalleryChildProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const slideRef = React.useRef<HTMLDivElement | null>(null);

  const x = useMotionValue(0);
  /** Distance from one slide's start to the next: slide width + gap. */
  const stride = React.useRef(0);
  /** Extra offset that parks the active slide centered rather than flush-left. */
  const alignOffset = React.useRef(0);
  const dragRef = React.useRef<DragState | null>(null);
  const controls = React.useRef<ReturnType<typeof animate> | null>(null);
  const [grabbing, setGrabbing] = React.useState(false);

  // Latest index without re-binding gesture handlers each render — synced in
  // an effect (never read during render) so measure/handlers see it fresh.
  const indexRef = React.useRef(index);
  React.useEffect(() => {
    indexRef.current = index;
  });

  const stopAnimation = React.useCallback(() => {
    controls.current?.stop();
    controls.current = null;
  }, []);

  /** Resting x for a slide: flush-left minus the alignment centering offset. */
  const offsetFor = React.useCallback(
    (target: number) => -target * stride.current + alignOffset.current,
    [],
  );

  /** Lower/upper bounds of x (upper is the first slide's rest, lower the last's). */
  const bounds = React.useCallback(() => {
    const upper = offsetFor(0);
    const lower = offsetFor(lastIndex);
    return { lower, upper };
  }, [offsetFor, lastIndex]);

  // Measure stride + alignment offset from the first slide and viewport.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    const slide = slideRef.current;
    if (!viewport || !slide) return;

    const measure = () => {
      const slideWidth = slide.offsetWidth;
      stride.current = slideWidth + gap;
      alignOffset.current =
        align === "center"
          ? Math.max(0, (viewport.offsetWidth - slideWidth) / 2)
          : 0;
      // Re-park on the current slide so a resize never leaves x mid-stride.
      if (!dragRef.current && !controls.current) {
        x.set(offsetFor(indexRef.current));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(slide);
    return () => observer.disconnect();
  }, [gap, align, x, offsetFor]);

  // A gesture or animation in flight must not outlive the component.
  React.useEffect(() => stopAnimation, [stopAnimation]);

  // Pause any settle while the tab is hidden — rAF is throttled there anyway.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopAnimation();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopAnimation]);

  /** Settle to a slide on `glide`, optionally carrying a release velocity. */
  const settleTo = React.useCallback(
    (target: number, velocity = 0) => {
      const clamped = Math.min(lastIndex, Math.max(0, target));
      stopAnimation();
      setIndex(clamped);
      controls.current = animate(x, offsetFor(clamped), {
        ...springs.glide,
        velocity,
      });
    },
    [lastIndex, offsetFor, setIndex, stopAnimation, x],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopAnimation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startX0: x.get(),
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const totalDx = event.clientX - drag.startX;
    if (!drag.engaged) {
      if (Math.abs(totalDx) < DRAG_THRESHOLD) return;
      // Crossed the threshold — this is a drag, not a tap. Capture now so
      // taps on controls/slides still receive their own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
    }

    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous pointer velocity so the fling reads intent.
      const instant = (event.clientX - drag.lastX) / dt;
      drag.velocity = drag.velocity * 0.4 + instant * 0.6;
    }
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;

    // Track 1:1, rubber-banding any travel past the edges.
    const { lower, upper } = bounds();
    let next = drag.startX0 + totalDx;
    if (next > upper) next = upper + (next - upper) * RUBBER;
    else if (next < lower) next = lower + (next - lower) * RUBBER;
    x.set(next);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) return; // A tap — leave the click to its target.

    setGrabbing(false);
    const release = Math.max(-MAX_FLING, Math.min(MAX_FLING, drag.velocity));
    const step = stride.current || 1;
    // Project where the throw would coast, then snap to the nearest slot.
    // Pointer moving right (+v) advances toward earlier slides (−x growth).
    const projected = x.get() + release * PROJECTION;
    const target = Math.round((alignOffset.current - projected) / step);
    settleTo(target, release);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let target: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        target = indexRef.current + 1;
        break;
      case "ArrowLeft":
        target = indexRef.current - 1;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = lastIndex;
        break;
    }
    if (target === null) return;
    event.preventDefault();
    settleTo(target);
  };

  return (
    <GalleryFrame
      count={count}
      index={index}
      ariaLabel={ariaLabel}
      onPrev={() => settleTo(index - 1)}
      onNext={() => settleTo(index + 1)}
      onDot={(target) => settleTo(target)}
      className={className}
    >
      <div
        ref={viewportRef}
        role="group"
        aria-label={ariaLabel}
        aria-roledescription="carousel"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          "focus-visible:ring-ring/60 relative overflow-hidden rounded-3 outline-none select-none focus-visible:ring-2",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ touchAction: "pan-y" }}
      >
        <motion.div className="flex w-max" style={{ x, gap }}>
          {slides.map((slide, i) => (
            <div
              key={i}
              ref={i === 0 ? slideRef : undefined}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${i + 1} of ${count}`}
              className="shrink-0"
            >
              {slide}
            </div>
          ))}
        </motion.div>
      </div>
    </GalleryFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                       Reduced-motion path (native scroll)                  */
/* -------------------------------------------------------------------------- */

function ScrollGallery({
  slides,
  count,
  lastIndex,
  index,
  setIndex,
  gap,
  align,
  className,
  ariaLabel,
}: GalleryChildProps) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const slideRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const scrollToIndex = React.useCallback(
    (target: number) => {
      const clamped = Math.min(lastIndex, Math.max(0, target));
      const slide = slideRefs.current[clamped];
      const scroller = scrollerRef.current;
      if (!slide || !scroller) return;
      setIndex(clamped);
      const left =
        align === "center"
          ? slide.offsetLeft - (scroller.clientWidth - slide.offsetWidth) / 2
          : slide.offsetLeft;
      scroller.scrollTo({ left, behavior: "smooth" });
    },
    [align, lastIndex, setIndex],
  );

  // Derive the active dot from scroll position. Reads happen in a passive
  // listener (never during render); index only advances via setState here.
  const handleScroll = React.useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const anchor =
      align === "center"
        ? scroller.scrollLeft + scroller.clientWidth / 2
        : scroller.scrollLeft;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < slideRefs.current.length; i += 1) {
      const slide = slideRefs.current[i];
      if (!slide) continue;
      const center =
        align === "center"
          ? slide.offsetLeft + slide.offsetWidth / 2
          : slide.offsetLeft;
      const distance = Math.abs(center - anchor);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    }
    setIndex((current) => (current === nearest ? current : nearest));
  }, [align, setIndex]);

  return (
    <GalleryFrame
      count={count}
      index={index}
      ariaLabel={ariaLabel}
      onPrev={() => scrollToIndex(index - 1)}
      onNext={() => scrollToIndex(index + 1)}
      onDot={(target) => scrollToIndex(target)}
      className={className}
    >
      <div
        ref={scrollerRef}
        role="group"
        aria-label={ariaLabel}
        aria-roledescription="carousel"
        tabIndex={0}
        onScroll={handleScroll}
        className="focus-visible:ring-ring/60 flex overflow-x-auto overscroll-x-contain rounded-3 outline-none focus-visible:ring-2"
        style={{
          gap,
          scrollSnapType: "x mandatory",
          scrollPadding: 0,
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            ref={(node) => {
              slideRefs.current[i] = node;
            }}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} of ${count}`}
            className="shrink-0"
            style={{ scrollSnapAlign: align === "center" ? "center" : "start" }}
          >
            {slide}
          </div>
        ))}
      </div>
    </GalleryFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Shared chrome (controls + dots)                     */
/* -------------------------------------------------------------------------- */

type GalleryFrameProps = {
  count: number;
  index: number;
  ariaLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onDot: (target: number) => void;
  className: string | undefined;
  children: React.ReactNode;
};

function GalleryFrame({
  count,
  index,
  ariaLabel,
  onPrev,
  onNext,
  onDot,
  className,
  children,
}: GalleryFrameProps) {
  const atStart = index <= 0;
  const atEnd = index >= count - 1;

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {children}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <ArrowButton
            label="Previous slide"
            disabled={atStart}
            onClick={onPrev}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </ArrowButton>
          <ArrowButton label="Next slide" disabled={atEnd} onClick={onNext}>
            <ChevronRight className="size-4" aria-hidden />
          </ArrowButton>
        </div>

        <div
          role="tablist"
          aria-label={`${ariaLabel} slides`}
          className="flex items-center gap-1.5"
        >
          {Array.from({ length: count }, (_, i) => {
            const active = i === index;
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-label={`Go to slide ${i + 1}`}
                aria-selected={active}
                aria-current={active ? "true" : undefined}
                onClick={() => onDot(i)}
                className={cn(
                  "focus-visible:ring-ring/60 h-1.5 rounded-1 transition-[width,background-color] duration-200 outline-none focus-visible:ring-2",
                  active
                    ? "bg-[var(--signal,var(--primary))] w-5"
                    : "bg-ink-3/40 hover:bg-ink-3/70 w-1.5",
                )}
              />
            );
          })}
        </div>
      </div>

      <span aria-live="polite" className="sr-only">
        Slide {index + 1} of {count}
      </span>
    </div>
  );
}

type ArrowButtonProps = {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ArrowButton({ label, disabled, onClick, children }: ArrowButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      // The gallery grabs on pointerdown; keep control presses out of that path.
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        "border-border bg-surface-2 text-ink-2 inline-flex size-7 items-center justify-center rounded-2 border transition-colors",
        "hover:text-foreground focus-visible:ring-ring/60 outline-none focus-visible:ring-2",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}
