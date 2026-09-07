"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CarouselSlide = {
  id: string;
  content: React.ReactNode;
};

export type SnapCarouselProps = {
  /** Slides, left to right. */
  slides: CarouselSlide[];
  /** Milliseconds between advances; omit to disable autoplay. */
  autoplay?: number;
  /** Wrap past the ends. @default true */
  loop?: boolean;
  /** Names the carousel. @default "Carousel" */
  label?: string;
  /** Fires when the settled slide changes. */
  onIndexChange?: (index: number) => void;
  className?: string;
};

const subscribeVisibility = (notify: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};

const readVisibility = () =>
  typeof document === "undefined" || !document.hidden;

/** A prerender has no document to ask, and a hidden tab never sees first paint. */
const serverVisibility = () => true;

/** Autoplay must not tick behind a hidden tab: the timers would pile up and the
 *  carousel would spring forward the moment the tab came back. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    readVisibility,
    serverVisibility,
  );
}

const wrap = (index: number, count: number) =>
  ((index % count) + count) % count;

/**
 * A carousel built on native scroll-snap, so the gesture is the browser's own —
 * momentum, rubber band and all — and the component only decides where it
 * lands. The next slide peeks past the edge so the row is legibly a row, and
 * the dot for the settled slide stretches into a pill on `snap`: a `layout`
 * animation, so one shape travels and widens rather than a second dot blinking
 * on somewhere else.
 *
 * Autoplay is a chain of timeouts keyed to the settled index, so a manual
 * scroll resets the clock instead of racing it, and it stands down on hover, on
 * focus inside the carousel, and whenever the tab is hidden. A visible toggle
 * stops it outright. The scroller is focusable: Left and Right move a slide,
 * Home and End jump to the ends, and the dots carry a roving tabindex. Under
 * reduced motion autoplay never starts, the dots swap rather than stretching,
 * and slides jump into place instead of scrolling.
 */
export function SnapCarousel({
  slides,
  autoplay,
  loop = true,
  label = "Carousel",
  onIndexChange,
  className,
}: SnapCarouselProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const slideRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const dotRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const [index, setIndex] = React.useState(0);
  // The scroll handler compares against this ref, never inside a state updater:
  // an updater can run during render, and calling a parent from there is a
  // cross-component update React refuses.
  const indexRef = React.useRef(0);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [running, setRunning] = React.useState(true);

  const count = slides.length;
  const canAutoplay = Boolean(autoplay) && motionSafe && count > 1;
  const playing = canAutoplay && running && !hovered && !focused && visible;

  const changeCallback = React.useRef(onIndexChange);
  React.useEffect(() => {
    changeCallback.current = onIndexChange;
  }, [onIndexChange]);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const measure = () => {
      const centre = scroller.scrollLeft + scroller.clientWidth / 2;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < count; i += 1) {
        const node = slideRefs.current[i];
        if (!node) continue;
        const distance = Math.abs(
          node.offsetLeft + node.offsetWidth / 2 - centre,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      if (best === indexRef.current) return;
      indexRef.current = best;
      setIndex(best);
      changeCallback.current?.(best);
    };

    scroller.addEventListener("scroll", measure, { passive: true });
    // ResizeObserver fires once on observe, which seeds the first reading
    // without setting state inside the effect body.
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [count]);

  const goTo = React.useCallback(
    (to: number) => {
      const scroller = scrollerRef.current;
      if (!scroller || count === 0) return;
      const target = loop
        ? wrap(to, count)
        : Math.min(count - 1, Math.max(0, to));
      const node = slideRefs.current[target];
      if (!node) return;
      scroller.scrollTo({
        left: node.offsetLeft - (scroller.clientWidth - node.offsetWidth) / 2,
        behavior: motionSafe ? "smooth" : "auto",
      });
    },
    [count, loop, motionSafe],
  );

  // One timeout per settled slide rather than an interval: any scroll — a
  // finger, an arrow key, a dot — changes `index` and restarts the wait, so
  // autoplay never fires on top of a move the reader just made.
  React.useEffect(() => {
    if (!playing || !autoplay) return;
    if (!loop && index >= count - 1) return;
    const timer = window.setTimeout(() => goTo(index + 1), autoplay);
    return () => window.clearTimeout(timer);
  }, [playing, autoplay, index, count, loop, goTo]);

  const handleScrollerKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        goTo(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        goTo(index - 1);
        break;
      case "Home":
        event.preventDefault();
        goTo(0);
        break;
      case "End":
        event.preventDefault();
        goTo(count - 1);
        break;
      default:
        break;
    }
  };

  const handleDotKeyDown = (event: React.KeyboardEvent, at: number) => {
    const step =
      event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowLeft"
          ? -1
          : event.key === "Home"
            ? -count
            : event.key === "End"
              ? count
              : 0;
    if (step === 0) return;
    event.preventDefault();
    const to = Math.min(count - 1, Math.max(0, at + step));
    dotRefs.current[to]?.focus();
    goTo(to);
  };

  const atStart = !loop && index === 0;
  const atEnd = !loop && index === count - 1;

  const arrowClass =
    "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-hairline-strong bg-surface-1 text-ink outline-none transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-ink-3 disabled:opacity-50";

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={(event) => {
        // Touch synthesises an enter on tap and often never sends the leave,
        // which would strand autoplay; hover is a mouse idea only.
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <div
        ref={scrollerRef}
        role="group"
        aria-label={`${label} slides`}
        tabIndex={0}
        onKeyDown={handleScrollerKeyDown}
        className="relative flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto overscroll-x-contain rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            ref={(node) => {
              slideRefs.current[i] = node;
            }}
            id={`${baseId}-slide-${slide.id}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            // The end margins are what let the first and last slide reach the
            // centre of the snapport; container padding is dropped by some
            // engines at the end of a scrolling flex row.
            className="w-[calc(100%-4rem)] shrink-0 snap-center first:ml-8 last:mr-8"
          >
            {slide.content}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous slide"
          disabled={atStart}
          onClick={() => goTo(index - 1)}
          className={arrowClass}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-4 shrink-0 fill-none stroke-current"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 5.5 8 12l6.5 6.5" />
          </svg>
        </button>

        <div
          role="group"
          aria-label="Choose slide"
          className="flex flex-1 items-center justify-center gap-1"
        >
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              ref={(node) => {
                dotRefs.current[i] = node;
              }}
              type="button"
              aria-label={`Slide ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              aria-controls={`${baseId}-slide-${slide.id}`}
              tabIndex={i === index ? 0 : -1}
              onClick={() => goTo(i)}
              onKeyDown={(event) => handleDotKeyDown(event, i)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <motion.span
                aria-hidden
                layout={motionSafe}
                transition={springs.snap}
                className={cn(
                  "block rounded-full transition-colors",
                  i === index ? "h-1.5 w-5 bg-primary" : "size-1.5 bg-ink-3/60",
                )}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label="Next slide"
          disabled={atEnd}
          onClick={() => goTo(index + 1)}
          className={arrowClass}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-4 shrink-0 fill-none stroke-current"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
          </svg>
        </button>

        {canAutoplay ? (
          <button
            type="button"
            aria-label={running ? "Pause autoplay" : "Start autoplay"}
            onClick={() => setRunning((was) => !was)}
            className={arrowClass}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="size-4 shrink-0 fill-current stroke-none"
            >
              {running ? (
                <path d="M9 6h2.2v12H9zM12.8 6H15v12h-2.2z" />
              ) : (
                <path d="M8.5 5.8 18 12l-9.5 6.2z" />
              )}
            </svg>
          </button>
        ) : null}
      </div>

      {/* Announcing while it auto-rotates would talk over the reader, so the
          live region only speaks for moves a person made. */}
      <span
        aria-live={playing ? "off" : "polite"}
        aria-atomic="true"
        className="sr-only"
      >
        {`Slide ${index + 1} of ${count}`}
      </span>
    </section>
  );
}
