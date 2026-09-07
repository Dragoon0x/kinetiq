"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SectionDot = {
  /** id of the section element inside the container. */
  id: string;
  label: string;
};

export type SectionDotsProps = {
  ref?: React.Ref<HTMLElement>;
  /** Sections in document order. */
  sections: SectionDot[];
  /** The scrolling element the rail watches. */
  container: React.RefObject<HTMLElement | null>;
  /** Which edge the rail sits on. */
  side?: "left" | "right";
  /** Fires when the section under the viewport changes. */
  onActiveChange?: (id: string) => void;
  /** Names the rail for assistive technology. */
  label?: string;
  className?: string;
};

/** Ratios thick enough to resolve which full-height section owns the view. */
const THRESHOLDS = [0, 0.25, 0.5, 0.75, 1];

/**
 * A rail of dots down the side of a scrolling story. The active dot stretches
 * into a pill — a `layout` animation on `snap`, so the shape itself travels and
 * one crisp overshoot marks the arrival rather than a dot blinking on somewhere
 * else. Its label slides out from the rail on hover or focus, a `step` of
 * travel on the enter ease, and leaves on the exit ease.
 *
 * The rail reads the container with an IntersectionObserver rather than a
 * scroll handler, so it costs nothing while idle and stays correct however the
 * container was scrolled — a click, a keyboard, a trackpad fling. Dots are
 * buttons carrying `aria-current`: Up and Down move between them, Home and End
 * jump to the ends, Enter and Space scroll the container to that section. Under
 * reduced motion the pill swaps and the container jumps instead of gliding.
 */
export function SectionDots({
  ref,
  sections,
  container,
  side = "right",
  onActiveChange,
  label = "Sections",
  className,
}: SectionDotsProps) {
  const motionSafe = useMotionSafe();

  const [activeId, setActiveId] = React.useState(sections[0]?.id ?? "");
  // The observer decides against this ref, not inside a state updater: an
  // updater can run during render, and reporting to the parent from there is
  // a cross-component update React refuses.
  const activeRef = React.useRef(activeId);
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // A stable key for the effect: the caller may rebuild the array every render,
  // and re-observing on every one of those would thrash the observer.
  const idKey = sections.map((section) => section.id).join(" ");

  const changeRef = React.useRef(onActiveChange);
  React.useEffect(() => {
    changeRef.current = onActiveChange;
  }, [onActiveChange]);

  React.useEffect(() => {
    const root = container.current;
    if (!root) return;
    const ids = idKey.split(" ").filter(Boolean);
    const nodes = ids
      .map((id) => root.querySelector<HTMLElement>(`#${CSS.escape(id)}`))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId = "";
        let best = 0;
        for (const id of ids) {
          const ratio = ratios.get(id) ?? 0;
          if (ratio > best) {
            best = ratio;
            bestId = id;
          }
        }
        if (!bestId || bestId === activeRef.current) return;
        activeRef.current = bestId;
        setActiveId(bestId);
        changeRef.current?.(bestId);
      },
      { root, threshold: THRESHOLDS },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [container, idKey]);

  const activeIndex = Math.max(
    0,
    sections.findIndex((section) => section.id === activeId),
  );
  const anchor = focusIndex ?? activeIndex;

  const scrollTo = (id: string) => {
    const root = container.current;
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!root || !target) return;
    const top =
      target.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop;
    root.scrollTo({ top, behavior: motionSafe ? "smooth" : "auto" });
  };

  const focusAt = (to: number) => {
    const clamped = Math.min(sections.length - 1, Math.max(0, to));
    setFocusIndex(clamped);
    buttonRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(sections.length - 1);
        break;
      default:
        break;
    }
  };

  // The label leaves the rail inward, so it never travels off the container.
  const inward = side === "right" ? distances.step : -distances.step;

  return (
    <nav
      ref={ref}
      aria-label={label}
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 flex items-center px-2",
        side === "right" ? "right-0" : "left-0",
        className,
      )}
    >
      <ul className="pointer-events-auto flex flex-col gap-1">
        {sections.map((section, index) => {
          const isActive = section.id === activeId;
          const isRevealed = revealed === section.id;
          return (
            <li key={section.id} className="relative flex">
              <button
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                type="button"
                aria-label={section.label}
                aria-current={isActive ? "true" : undefined}
                tabIndex={index === anchor ? 0 : -1}
                onClick={() => scrollTo(section.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onFocus={() => {
                  setFocusIndex(index);
                  setRevealed(section.id);
                }}
                onBlur={() => setRevealed(null)}
                onPointerEnter={() => setRevealed(section.id)}
                onPointerLeave={() => setRevealed(null)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <motion.span
                  aria-hidden
                  layout={motionSafe}
                  transition={springs.snap}
                  className={cn(
                    "block rounded-full",
                    isActive ? "h-4 w-1.5 bg-primary" : "size-1.5 bg-ink-3/60",
                  )}
                />
              </button>

              <AnimatePresence>
                {isRevealed ? (
                  <motion.span
                    aria-hidden
                    initial={
                      motionSafe
                        ? { opacity: 0, x: inward, y: "-50%" }
                        : { opacity: 0, y: "-50%" }
                    }
                    animate={{ opacity: 1, x: 0, y: "-50%" }}
                    exit={{
                      opacity: 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.enter,
                    }}
                    className={cn(
                      "pointer-events-none absolute top-1/2 max-w-32 truncate rounded-full border border-hairline bg-popover px-2 py-0.5 text-[11px] font-medium text-popover-foreground shadow-sm",
                      side === "right" ? "right-full mr-1" : "left-full ml-1",
                    )}
                  >
                    {section.label}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
