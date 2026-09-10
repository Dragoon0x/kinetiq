"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CarouselCardItem = {
  id: string;
  /** The card's line. Written without a full stop; the spoken name adds one. */
  title: string;
  /** One quieter line under the title. */
  note?: string;
  /** Runs through `format`. */
  price?: number;
  /** A short qualifier printed beside the price. */
  meta?: string;
};

export type CarouselCardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The slides, in rail order. */
  items: CarouselCardItem[];
  /** Controlled slide index. */
  index?: number;
  /** Initial index for uncontrolled use. @default 0 */
  defaultIndex?: number;
  /** Fires from an arrow, a dot, a key, or a settled drag. */
  onIndexChange?: (index: number) => void;
  /** Fires from a slide's control with that slide's item. */
  onCardAction?: (item: CarouselCardItem) => void;
  /** The word on each slide's control. @default "View" */
  actionLabel?: string;
  /** Money formatter for `price`. */
  format?: (value: number) => string;
  /** Pixels of the next card left showing. @default 28 */
  peek?: number;
  /** Names the carousel for assistive technology. */
  label: string;
  className?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const defaultFormat = (value: number) => currency.format(value);

/** Pointer travel before a press becomes a drag, so plain taps still land. */
const DRAG_SLOP = 4;

/** The rail's gap, in pixels — `gap-2` on the track, and part of one step. */
const GAP = 8;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Capture throws on a synthetic pointer id; the gesture works without it. */
const setCapture = (element: Element, pointerId: number, on: boolean) => {
  try {
    if (on) element.setPointerCapture(pointerId);
    else if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // A sweep from the test suite has no capture target; the drag continues.
  }
};

/** One arrow. Both ends of the rail draw the same control, mirrored. */
function Step({
  back,
  disabled,
  onPress,
}: {
  back: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={back ? "Previous card" : "Next card"}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full border border-hairline-strong transition-colors hover:bg-accent disabled:opacity-40",
        focusRing,
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d={back ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} />
      </svg>
    </button>
  );
}

/** Fixed tints for the swatch's bars: literals, never a sum, because 0.2 plus
 *  0.28 does not serialise as 0.48 and a mismatched attribute is a hydration
 *  error. */
const TINTS = [0.2, 0.34, 0.48] as const;

/** FNV-1a, so a card's swatch is the same art on the server and the client. */
const hashOf = (text: string) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * Procedural card art. Every coordinate is an integer taken out of the hash by
 * shifts, so no float ever reaches an attribute and the prerender and the
 * hydration paint the same rectangles.
 */
function Swatch({ seed }: { seed: string }) {
  const hash = hashOf(seed);
  // Unsigned shifts: `>>` reads a hash above 2^31 as negative, and a negative
  // remainder drew rectangles with a negative height and a disc off the left
  // of its own viewBox.
  const bars = [0, 1, 2, 3, 4, 5].map((i) => ((hash >>> (i * 3)) % 7) + 2);
  const discX = 5 + ((hash >>> 19) % 5) * 8;

  return (
    <svg
      aria-hidden
      viewBox="0 0 48 24"
      preserveAspectRatio="none"
      className="h-14 w-full rounded-2 bg-cobalt-wash text-cobalt-bright"
    >
      <circle cx={discX} cy={6} r={3} fill="currentColor" opacity={0.35} />
      {bars.map((bar, i) => (
        <rect
          key={`bar-${i}`}
          x={i * 8 + 1}
          y={22 - bar * 2}
          width={6}
          height={bar * 2}
          rx={1}
          fill="currentColor"
          opacity={TINTS[i % 3]}
        />
      ))}
    </svg>
  );
}

/**
 * Several cards, one message. A track of equal-width slides rides inside the
 * bubble's own box and glides to the chosen one on `glide` — a rail moving is a
 * layout shift, not a toggle — while the dot row's pill travels between dots on
 * `snap` through a `useId`-prefixed `layoutId`, so one pill moves rather than
 * four dots blinking.
 *
 * A finger drags the track one-to-one with the hand — the transition drops to
 * nothing while the pointer is down, because a rail that trails the finger lies
 * about being held — and the release snaps to the nearest slide. Capture is
 * taken only after 4px of travel and inside a try/catch, so a tap on a card's
 * control still lands and a synthetic sweep never throws. Arrows step one card
 * and stop at the ends rather than wrapping, and focusing a control on a card
 * that is off to one side brings that card in, so the keyboard can never land
 * somewhere the eye cannot follow. Under reduced motion the track swaps on a
 * fast tween and the pill fills in place.
 */
export function CarouselCard({
  ref,
  items,
  index,
  defaultIndex = 0,
  onIndexChange,
  onCardAction,
  actionLabel = "View",
  format = defaultFormat,
  peek = 28,
  label,
  className,
}: CarouselCardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const pillId = `${baseId}-pill`;

  const count = items.length;
  const [uncontrolled, setUncontrolled] = React.useState(defaultIndex);
  const isControlled = index !== undefined;
  const current = Math.min(
    Math.max(0, count - 1),
    Math.max(0, isControlled ? index : uncontrolled),
  );

  const select = (next: number) => {
    const clamped = Math.min(Math.max(0, count - 1), Math.max(0, next));
    if (clamped === current) return;
    if (!isControlled) setUncontrolled(clamped);
    onIndexChange?.(clamped);
  };

  // The viewport's width is measured, never assumed: the slide is that width
  // less the peek, so the next card's shoulder always shows at any column.
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = React.useState(0);
  React.useEffect(() => {
    const node = viewportRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = Math.round(node.getBoundingClientRect().width);
      setViewport((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const slideWidth = viewport > 0 ? Math.max(120, viewport - peek) : 0;
  const step = slideWidth > 0 ? slideWidth + GAP : 0;

  const x = useMotionValue(0);
  const controls = React.useRef<{ stop: () => void } | null>(null);
  const seeded = React.useRef(false);

  const runTo = React.useCallback(
    (target: number, instant: boolean) => {
      controls.current?.stop();
      if (instant) {
        x.set(target);
        return;
      }
      controls.current = animate(
        x,
        target,
        motionSafe
          ? springs.glide
          : { duration: durations.fast, ease: easings.move },
      );
    },
    [motionSafe, x],
  );

  // The first placement is written outright: a rail that animates into its own
  // starting position on the frame it is measured reads as a glitch.
  React.useEffect(() => {
    if (step === 0) return undefined;
    const target = -current * step;
    if (seeded.current) runTo(target, false);
    else {
      seeded.current = true;
      runTo(target, true);
    }
    return () => controls.current?.stop();
  }, [current, step, runTo]);

  const drag = React.useRef({
    id: -1,
    startX: 0,
    base: 0,
    active: false,
    down: false,
  });

  const onPointerDown = (event: React.PointerEvent<HTMLUListElement>) => {
    if (step === 0 || count < 2 || event.button !== 0) return;
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      base: -current * step,
      active: false,
      down: true,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLUListElement>) => {
    const state = drag.current;
    if (!state.down || event.pointerId !== state.id) return;
    const dx = event.clientX - state.startX;
    if (!state.active) {
      if (Math.abs(dx) < DRAG_SLOP) return;
      state.active = true;
      controls.current?.stop();
      setCapture(event.currentTarget, event.pointerId, true);
    }
    // Past either end the rail resists rather than tearing off the deck.
    const raw = state.base + dx;
    const min = -(count - 1) * step;
    const clamped =
      raw > 0 ? raw * 0.35 : raw < min ? min + (raw - min) * 0.35 : raw;
    x.set(Math.round(clamped));
  };

  const endDrag = (event: React.PointerEvent<HTMLUListElement>) => {
    const state = drag.current;
    if (!state.down || event.pointerId !== state.id) return;
    const dx = event.clientX - state.startX;
    const wasActive = state.active;
    drag.current = { ...state, down: false, active: false };
    setCapture(event.currentTarget, event.pointerId, false);
    if (!wasActive) return;
    const moved = dx < -step / 3 ? 1 : dx > step / 3 ? -1 : 0;
    const next = Math.min(count - 1, Math.max(0, current + moved));
    if (next === current) runTo(-current * step, !motionSafe);
    else select(next);
  };

  const focusDot = (next: number) => {
    const clamped = Math.min(Math.max(0, count - 1), Math.max(0, next));
    document.getElementById(`${baseId}-dot-${clamped}`)?.focus();
    select(clamped);
  };

  const onDotKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const jumps: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowDown: current + 1,
      ArrowLeft: current - 1,
      ArrowUp: current - 1,
      Home: 0,
      End: count - 1,
    };
    const next = jumps[event.key];
    if (next === undefined) return;
    event.preventDefault();
    focusDot(next);
  };

  const active = items[current];
  // Frozen at the moment of the change, in one string, so a fast run of
  // presses cannot leave the reading a card behind.
  const spokenKey = `${current}:${active?.id ?? ""}`;
  const [spoken, setSpoken] = React.useState(() => ({
    key: spokenKey,
    text: "",
  }));
  if (spoken.key !== spokenKey) {
    setSpoken({
      key: spokenKey,
      text: active ? `Card ${current + 1} of ${count}, ${active.title}.` : "",
    });
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      {/* Clipped, not hidden: a hidden overflow is still a scroll container,
          and the deck's own width propagated out to the page, which then
          scrolled sideways by the length of the whole deck. */}
      <div
        ref={viewportRef}
        className="relative -mx-1 overflow-clip px-1 [contain:paint]"
      >
        <motion.ul
          role="list"
          style={{ x, touchAction: "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex gap-2"
        >
          {items.map((item, i) => (
            <li
              key={item.id}
              aria-current={i === current ? "true" : undefined}
              style={{
                flex: slideWidth > 0 ? `0 0 ${slideWidth}px` : "0 0 100%",
              }}
              className="flex flex-col gap-2 rounded-2 border border-hairline bg-surface-0 p-2.5"
            >
              <span className="sr-only">
                {`Card ${i + 1} of ${count}, ${item.title}${
                  item.price === undefined ? "" : `, ${format(item.price)}`
                }.`}
              </span>
              <Swatch seed={item.id} />
              <span aria-hidden className="flex min-w-0 flex-col">
                <span
                  className="truncate text-sm font-medium"
                  title={item.title}
                >
                  {item.title}
                </span>
                {item.note ? (
                  <span
                    title={item.note}
                    className="truncate text-[11px] leading-snug text-ink-3"
                  >
                    {item.note}
                  </span>
                ) : null}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span
                  aria-hidden
                  className="min-w-0 truncate font-mono text-xs text-ink-2 tabular-nums"
                >
                  {item.price === undefined ? "" : format(item.price)}
                  {item.meta ? (
                    <span className="text-ink-3"> · {item.meta}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  // One string, so the accessible name cannot gain a stray
                  // space where the two halves meet.
                  aria-label={`${actionLabel} ${item.title}.`}
                  onClick={() => onCardAction?.(item)}
                  // Bringing the card in first means the keyboard never lands
                  // on a control the eye cannot follow.
                  onFocus={() => select(i)}
                  className={cn(
                    "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors hover:bg-accent",
                    focusRing,
                  )}
                >
                  {actionLabel}
                </button>
              </div>
            </li>
          ))}
        </motion.ul>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Step
          back
          disabled={current === 0}
          onPress={() => select(current - 1)}
        />

        <div className="flex min-w-0 flex-wrap items-center justify-center gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              id={`${baseId}-dot-${i}`}
              tabIndex={i === current ? 0 : -1}
              aria-current={i === current ? "true" : undefined}
              aria-label={`Show card ${i + 1} of ${count}, ${item.title}.`}
              onClick={() => select(i)}
              onKeyDown={onDotKeyDown}
              className={cn("grid h-4 place-items-center px-0.5", focusRing)}
            >
              <span
                aria-hidden
                className={cn(
                  "relative block h-1.5 rounded-full transition-colors",
                  i === current
                    ? "w-5 bg-transparent"
                    : "w-1.5 bg-hairline-strong",
                )}
              >
                {i === current ? (
                  motionSafe ? (
                    <motion.span
                      layoutId={pillId}
                      transition={springs.snap}
                      className="absolute inset-0 rounded-full bg-cobalt-bright"
                    />
                  ) : (
                    <span className="absolute inset-0 rounded-full bg-cobalt-bright" />
                  )
                ) : null}
              </span>
            </button>
          ))}
        </div>

        <Step
          back={false}
          disabled={current >= count - 1}
          onPress={() => select(current + 1)}
        />
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.text}
      </span>
    </div>
  );
}
