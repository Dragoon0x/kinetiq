"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LetterGroup = {
  letter: string;
  items: string[];
};

export type LetterIndexProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Sections that exist; every other letter of the rail is muted. */
  groups: LetterGroup[];
  /**
   * The scrolling list. Each section header inside it must carry
   * `data-letter="A"` so the rail can find what to scroll to.
   */
  container: React.RefObject<HTMLElement | null>;
  /** Fires when the rail jumps the list to a letter. */
  onSelect?: (letter: string) => void;
  /** Names the rail for assistive technology. */
  label?: string;
  className?: string;
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * The A–Z rail beside a long list. Dragging it pops the letter under the
 * pointer out into a bubble on `recoil` — ζ0.53, two visible bounces, the
 * physics of something landing rather than sliding — while the list itself
 * jumps instantly, because the list is following your thumb and a smooth scroll
 * would lag behind it. Letters with no entries are muted and the pick falls to
 * the nearest letter that has some, so the rail never dead-ends.
 *
 * Pointer capture waits for 4px of travel, so a tap on a letter is still a tap.
 * The rail is a listbox: it takes one tab stop, Up and Down move the active
 * letter (skipping the muted ones), Home and End jump to the first and last
 * letter with entries, and Enter or Space scrolls the list there. Under reduced
 * motion the bubble appears instead of popping.
 */
export function LetterIndex({
  ref,
  groups,
  container,
  onSelect,
  label = "Jump to letter",
  className,
}: LetterIndexProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [active, setActive] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<{ y: number; captured: boolean } | null>(null);
  // A fast drag can fire two moves inside one render, so the last letter is
  // held in a ref: state would still read the previous one and jump twice.
  const lastLetter = React.useRef<string | null>(null);

  const available = new Set(
    groups
      .filter((group) => group.items.length > 0)
      .map((group) => group.letter),
  );

  const nearestAvailable = (index: number): number => {
    if (available.has(ALPHABET[index] ?? "")) return index;
    for (let step = 1; step < ALPHABET.length; step += 1) {
      const before = index - step;
      if (before >= 0 && available.has(ALPHABET[before] ?? "")) return before;
      const after = index + step;
      if (after < ALPHABET.length && available.has(ALPHABET[after] ?? "")) {
        return after;
      }
    }
    return -1;
  };

  const scrollToLetter = (letter: string, smooth: boolean) => {
    const root = container.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(`[data-letter="${letter}"]`);
    if (!target) return;
    const top =
      target.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop;
    root.scrollTo({ top, behavior: smooth && motionSafe ? "smooth" : "auto" });
  };

  const jump = (index: number, smooth: boolean) => {
    const settled = nearestAvailable(index);
    const letter = ALPHABET[settled];
    if (settled < 0 || !letter) return;
    lastLetter.current = letter;
    setActive(letter);
    scrollToLetter(letter, smooth);
    onSelect?.(letter);
  };

  /** Which letter sits under a client Y, read from the rail's own box. */
  const letterAt = (clientY: number): number => {
    const rail = railRef.current;
    if (!rail) return -1;
    const box = rail.getBoundingClientRect();
    if (box.height === 0) return -1;
    const ratio = (clientY - box.top) / box.height;
    return Math.min(
      ALPHABET.length - 1,
      Math.max(0, Math.floor(ratio * ALPHABET.length)),
    );
  };

  const pick = (clientY: number, smooth: boolean) => {
    const index = letterAt(clientY);
    if (index < 0) return;
    const settled = nearestAvailable(index);
    const letter = ALPHABET[settled];
    // A drag crosses many letters; only the crossings do work.
    if (settled < 0 || !letter || letter === lastLetter.current) return;
    jump(settled, smooth);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { y: event.clientY, captured: false };
    setDragging(true);
    // A fresh press always jumps, even onto the letter already showing.
    lastLetter.current = null;
    pick(event.clientY, false);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    if (!state.captured) {
      // Capture only once the gesture is a drag, or the plain tap above is
      // swallowed and a synthetic sweep has nothing to release.
      if (Math.abs(event.clientY - state.y) < 4) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      state.captured = true;
    }
    pick(event.clientY, false);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    setDragging(false);
    if (
      state.captured &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const move = (from: number, direction: 1 | -1) => {
    for (
      let i = from + direction;
      i >= 0 && i < ALPHABET.length;
      i += direction
    ) {
      const letter = ALPHABET[i];
      if (letter && available.has(letter)) {
        setActive(letter);
        return;
      }
    }
  };

  const activeIndex = active ? ALPHABET.indexOf(active) : -1;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const first = ALPHABET.findIndex((letter) => available.has(letter));
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        if (activeIndex < 0) setActive(ALPHABET[first] ?? null);
        else move(activeIndex, 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        if (activeIndex < 0) setActive(ALPHABET[first] ?? null);
        else move(activeIndex, -1);
        break;
      case "Home":
        event.preventDefault();
        setActive(ALPHABET[first] ?? null);
        break;
      case "End":
        event.preventDefault();
        setActive(
          [...ALPHABET].reverse().find((letter) => available.has(letter)) ??
            null,
        );
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (activeIndex >= 0) jump(activeIndex, true);
        break;
      default:
        break;
    }
  };

  const showBubble = (dragging || focused) && activeIndex >= 0;

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none absolute inset-y-2 right-0 z-10 flex",
        className,
      )}
    >
      <div
        ref={railRef}
        role="listbox"
        aria-label={label}
        aria-activedescendant={
          active ? `${baseId}-letter-${active}` : undefined
        }
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        className="pointer-events-auto relative flex w-6 touch-none flex-col rounded-full outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {ALPHABET.map((letter) => {
          const has = available.has(letter);
          return (
            <span
              key={letter}
              id={`${baseId}-letter-${letter}`}
              role="option"
              aria-selected={letter === active}
              aria-disabled={has ? undefined : true}
              className={cn(
                "flex min-h-0 flex-1 items-center justify-center text-[9px] leading-none font-medium tabular-nums",
                letter === active
                  ? "font-semibold text-primary"
                  : has
                    ? "text-ink-3"
                    : "text-ink-3/40",
              )}
            >
              {letter}
            </span>
          );
        })}
      </div>

      <AnimatePresence>
        {showBubble ? (
          <motion.span
            key="bubble"
            aria-hidden
            initial={
              motionSafe
                ? { opacity: 0, scale: 0.6, y: "-50%" }
                : { opacity: 0, y: "-50%" }
            }
            animate={{ opacity: 1, scale: 1, y: "-50%" }}
            exit={{
              opacity: 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? springs.recoil
                : { duration: durations.fast, ease: easings.enter }
            }
            style={{
              top: `${((activeIndex + 0.5) / ALPHABET.length) * 100}%`,
            }}
            className="pointer-events-none absolute right-full mr-1 flex size-10 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground shadow-raised"
          >
            {active}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
