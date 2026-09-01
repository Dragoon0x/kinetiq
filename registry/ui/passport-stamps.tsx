"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import {
  Anchor,
  Compass,
  MapPin,
  Mountain,
  Plane,
  Ship,
  Stamp,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Destination = {
  id: string;
  name: string;
  /** A pre-formatted date string, e.g. "12 Mar 2019" — never a Date object. */
  date: string;
  shape?: "circle" | "rect" | "oval";
};

export type PassportStampsProps = {
  /** Destinations to record, visited in this fixed order. @default the built-in nine-stop itinerary */
  destinations?: Destination[];
  /** Fires the moment a page's sixth stamp lands and the turn begins, with the page number that just filled. */
  onPageComplete?: (page: number) => void;
  className?: string;
};

type Phase = "idle" | "descend" | "impact" | "lift";

/** Stamps per page — fixed, never derived from props. */
const PAGE_SIZE = 6;

const PAGE_W = 320;
const PAGE_H = 420;

/** Six scattered slot positions (page-relative percent) and their base tilt
 * — irregular on purpose, walked by hand, never laid out as a grid. */
const SLOTS = [
  { x: 24, y: 16, rotate: -8 },
  { x: 68, y: 13, rotate: 6 },
  { x: 42, y: 34, rotate: -4 },
  { x: 79, y: 46, rotate: 9 },
  { x: 21, y: 57, rotate: 4 },
  { x: 58, y: 71, rotate: -7 },
] as const;

/** Shape cycles every three stamps, ink alternates every two — both fixed
 * tables, cycled by the destination's position in the full itinerary. */
const SHAPE_CYCLE = ["circle", "rect", "oval"] as const;
const INK_CYCLE = ["var(--primary)", "var(--ink-2)"] as const;

/** A degree or two of deliberate misalignment per stamp — a mark that lands
 * dead-true against its slot reads as printed, not pressed. */
const JITTER_DEG = [1.6, -2.2, 1.1, -1.7, 2, -1.3] as const;

const ICONS: readonly React.ReactNode[] = [
  <Compass key="i-compass" className="size-3.5" />,
  <MapPin key="i-pin" className="size-3.5" />,
  <Plane key="i-plane" className="size-3.5" />,
  <Ship key="i-ship" className="size-3.5" />,
  <Mountain key="i-mountain" className="size-3.5" />,
  <Anchor key="i-anchor" className="size-3.5" />,
];

/** Four ink flecks, thrown from the impact point on fixed vectors. */
const INK_FLECKS = [
  { dx: -13, dy: -7, delay: 0 },
  { dx: 12, dy: -11, delay: 0.02 },
  { dx: -9, dy: 9, delay: 0.04 },
  { dx: 14, dy: 7, delay: 0.015 },
] as const;

/** Impact shudder — exactly three keyframes, a tween, never a spring. */
const SHUDDER_Y = [0, 3, 0] as const;
const SHUDDER_TIMES = [0, 0.5, 1] as const;
const SHUDDER_S = 0.18;

/** Choreography beats, seconds unless noted. */
const DESCEND_S = 0.35;
const DESCEND_EASE = [0.6, 0, 1, 0.45] as const;
const IMPACT_MS = 200;
const LIFT_S = 0.26;
const LIFT_MS = Math.round(LIFT_S * 1000);
const TURN_S = durations.page;
const CAPTION_MS = 1300;

const HEAD_RISE_Y = -170;
const HEAD_LIFT_Y = -90;

/** Warm paper tint, mixed against the surface so it sits in either theme. */
const PAPER_TINT =
  "color-mix(in oklab, var(--warning, #b45309) 6%, var(--card))";

/** Two faint crossed hairline sets — a guilloche-ish suggestion, not the
 * genuine engraving. */
const HAIRLINES =
  "repeating-linear-gradient(58deg, color-mix(in oklab, var(--ink) 7%, transparent) 0px, color-mix(in oklab, var(--ink) 7%, transparent) 1px, transparent 1px, transparent 15px), " +
  "repeating-linear-gradient(-58deg, color-mix(in oklab, var(--ink) 5%, transparent) 0px, color-mix(in oklab, var(--ink) 5%, transparent) 1px, transparent 1px, transparent 19px)";

const DEFAULT_DESTINATIONS: Destination[] = [
  { id: "kyoto", name: "Kyoto", date: "12 Mar 2019" },
  { id: "reykjavik", name: "Reykjavik", date: "03 Jul 2021" },
  { id: "marrakesh", name: "Marrakesh", date: "22 Nov 2021" },
  { id: "lisbon", name: "Lisbon", date: "09 Feb 2022" },
  { id: "queenstown", name: "Queenstown", date: "30 Aug 2022" },
  { id: "helsinki", name: "Helsinki", date: "14 Jan 2023" },
  { id: "hanoi", name: "Hanoi", date: "05 May 2023" },
  { id: "valparaiso", name: "Valparaiso", date: "19 Sep 2023" },
  { id: "tallinn", name: "Tallinn", date: "27 Dec 2023" },
];

const shapeFor = (
  destination: Destination,
  globalIndex: number,
): "circle" | "rect" | "oval" =>
  destination.shape ??
  SHAPE_CYCLE[globalIndex % SHAPE_CYCLE.length] ??
  "circle";

const inkFor = (globalIndex: number): string =>
  INK_CYCLE[globalIndex % INK_CYCLE.length] ?? "var(--primary)";

const jitterFor = (globalIndex: number): number =>
  JITTER_DEG[globalIndex % JITTER_DEG.length] ?? 0;

const iconFor = (globalIndex: number): React.ReactNode =>
  ICONS[globalIndex % ICONS.length] ?? <Compass className="size-3.5" />;

const dimsFor = (
  shape: "circle" | "rect" | "oval",
): { width: number; height: number; radius: string } => {
  if (shape === "circle") return { width: 76, height: 76, radius: "9999px" };
  if (shape === "rect")
    return { width: 86, height: 60, radius: "var(--radius-2)" };
  return { width: 92, height: 56, radius: "50%" };
};

/**
 * A passport page that fills with stamps as you visit places, six fixed
 * slots to a page laid out in a scattered, hand-stamped arrangement that
 * never reads as a grid. Press Visit and a stamp head drops in and presses
 * down — the page gives a small shudder, the mark punches in oversize and
 * settles on `flick`, ink flecks scatter at the edges — then the head lifts
 * away, leaving the mark at a rotation nudged a degree or two off true,
 * because a stamp that lands dead-straight reads as printed rather than
 * pressed. Every date is a fixed, pre-formatted string carried in the data
 * — this component never reads the clock — and every rotation, ink tone,
 * and scatter vector comes from a fixed table, never Math.random(). Fill
 * all six slots and the page turns: it lifts and curls away on a `scaleX`
 * tween while a fresh page underneath rises with its number incremented,
 * and the outgoing page's stamps fold into a small collected line below.
 * Hover a placed stamp and it lifts a hair, bringing its date forward for
 * anyone who looks closely. Reduced motion: the descending head, page
 * shudder, ink spread, and page turn are all skipped — a stamp lands
 * instantly at its final rotation and a full page swaps to the next one
 * directly.
 */
export function PassportStamps({
  destinations,
  onPageComplete,
  className,
}: PassportStampsProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const list =
    destinations && destinations.length > 0
      ? destinations
      : DEFAULT_DESTINATIONS;
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));

  const [visitedCount, setVisitedCount] = React.useState(0);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [completedPages, setCompletedPages] = React.useState<Destination[][]>(
    [],
  );
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [showFlecks, setShowFlecks] = React.useState(false);
  const [flashCaption, setFlashCaption] = React.useState<string | null>(null);

  const shudderY = useMotionValue<number>(0);
  const shudderAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const descendTimer = React.useRef<number | null>(null);
  const impactTimer = React.useRef<number | null>(null);
  const liftTimer = React.useRef<number | null>(null);
  const turnTimer = React.useRef<number | null>(null);
  const captionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (descendTimer.current !== null)
        window.clearTimeout(descendTimer.current);
      if (impactTimer.current !== null)
        window.clearTimeout(impactTimer.current);
      if (liftTimer.current !== null) window.clearTimeout(liftTimer.current);
      if (turnTimer.current !== null) window.clearTimeout(turnTimer.current);
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      shudderAnim.current?.stop();
    };
  }, []);

  const currentPageStart = pageIndex * PAGE_SIZE;
  const activeSlotIndex =
    activeIndex !== null ? activeIndex - currentPageStart : null;
  const activeSlot =
    activeSlotIndex !== null ? SLOTS[activeSlotIndex] : undefined;

  const handleVisit = () => {
    if (busy) return;
    const nextIndex = visitedCount;
    if (nextIndex >= list.length) return;
    const destination = list[nextIndex];
    if (!destination) return;

    const slotInPage = nextIndex % PAGE_SIZE;
    const isLastSlot = slotInPage === PAGE_SIZE - 1;
    const hasMore = nextIndex + 1 < list.length;
    const pageStart = nextIndex - slotInPage;
    const completedPageNumber = pageIndex + 1;

    if (!motionSafe) {
      setVisitedCount(nextIndex + 1);
      if (isLastSlot && hasMore) {
        setCompletedPages((pages) => [
          ...pages,
          list.slice(pageStart, pageStart + PAGE_SIZE),
        ]);
        setPageIndex((p) => p + 1);
        onPageComplete?.(completedPageNumber);
      }
      return;
    }

    setBusy(true);
    setActiveIndex(nextIndex);
    setPhase("descend");

    descendTimer.current = window.setTimeout(() => {
      setVisitedCount(nextIndex + 1);
      setPhase("impact");
      setShowFlecks(true);

      shudderAnim.current?.stop();
      shudderY.jump(0);
      shudderAnim.current = animate(shudderY, [...SHUDDER_Y], {
        duration: SHUDDER_S,
        ease: easings.move,
        times: [...SHUDDER_TIMES],
      });

      impactTimer.current = window.setTimeout(() => {
        setShowFlecks(false);
        setPhase("lift");

        liftTimer.current = window.setTimeout(() => {
          setPhase("idle");
          setActiveIndex(null);

          if (isLastSlot && hasMore) {
            setFlashCaption("page complete");
            captionTimer.current = window.setTimeout(() => {
              setFlashCaption(null);
            }, CAPTION_MS);

            setCompletedPages((pages) => [
              ...pages,
              list.slice(pageStart, pageStart + PAGE_SIZE),
            ]);
            setPageIndex((p) => p + 1);
            onPageComplete?.(completedPageNumber);

            turnTimer.current = window.setTimeout(() => {
              setBusy(false);
            }, TURN_S * 1000);
          } else {
            setBusy(false);
          }
        }, LIFT_MS);
      }, IMPACT_MS);
    }, DESCEND_S * 1000);
  };

  const renderSlot = (
    slot: (typeof SLOTS)[number],
    i: number,
  ): React.ReactNode => {
    const globalIndex = currentPageStart + i;
    const destination = list[globalIndex];
    if (!destination) return null;

    const rotate = slot.rotate + jitterFor(globalIndex);
    const shape = shapeFor(destination, globalIndex);
    const dims = dimsFor(shape);
    const stamped = globalIndex < visitedCount;

    if (!stamped) {
      return (
        <div
          key={`${destination.id}-hint`}
          aria-hidden
          className="pointer-events-none absolute border border-dashed opacity-25"
          style={{
            left: `${slot.x}%`,
            top: `${slot.y}%`,
            width: dims.width,
            height: dims.height,
            borderRadius: dims.radius,
            borderColor: "var(--ink-3)",
            transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
          }}
        />
      );
    }

    const ink = inkFor(globalIndex);
    const icon = iconFor(globalIndex);

    return (
      <div
        key={`${destination.id}-mark`}
        className="group absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
      >
        <motion.div
          className="relative flex flex-col items-center justify-center gap-0.5 border-2"
          style={{
            width: dims.width,
            height: dims.height,
            borderRadius: dims.radius,
            borderColor: ink,
            color: ink,
            rotate,
          }}
          initial={motionSafe ? { scale: 1.15, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={motionSafe ? { y: -distances.nudge } : undefined}
          transition={
            motionSafe
              ? {
                  scale: springs.flick,
                  y: springs.flick,
                  opacity: { duration: durations.fast, ease: easings.enter },
                }
              : { duration: 0 }
          }
        >
          {icon}
          <span className="px-1 text-center font-mono text-[8px] leading-tight font-semibold tracking-[0.08em] uppercase">
            {destination.name}
          </span>
        </motion.div>
        <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 font-mono text-[8px] whitespace-nowrap text-ink-3 tabular-nums opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {destination.date}
        </span>
      </div>
    );
  };

  const collectedNames = completedPages.flat().map((d) => d.name);
  const exhausted = visitedCount >= list.length;
  const liveMessage = exhausted
    ? `All ${list.length} destinations stamped.`
    : `${visitedCount} of ${list.length} stamped. ${totalPages} page${totalPages === 1 ? "" : "s"}.`;

  return (
    <div
      className={cn(
        "flex w-full max-w-sm flex-col items-center gap-3",
        className,
      )}
    >
      <div className="relative" style={{ width: PAGE_W, height: PAGE_H }}>
        <AnimatePresence initial={false}>
          <motion.div
            key={pageIndex}
            className="absolute inset-0 overflow-hidden rounded-3 border border-hairline shadow-raised"
            style={{
              backgroundColor: PAPER_TINT,
              originX: 0,
              originY: 0.5,
              zIndex: -pageIndex,
            }}
            initial={
              motionSafe ? { opacity: 0, scaleX: 0.85, rotate: -3 } : false
            }
            animate={{ opacity: 1, scaleX: 1, rotate: 0 }}
            exit={
              motionSafe
                ? {
                    opacity: 0,
                    scaleX: 0.05,
                    y: -16,
                    rotate: -7,
                    transition: { duration: TURN_S, ease: easings.exit },
                  }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={
              motionSafe
                ? { duration: TURN_S, ease: easings.enter }
                : { duration: 0 }
            }
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: HAIRLINES }}
            />

            <motion.div
              className="relative h-full w-full"
              style={{ y: shudderY }}
            >
              {SLOTS.map((slot, i) => renderSlot(slot, i))}

              {motionSafe &&
                activeIndex !== null &&
                activeSlot &&
                phase !== "descend" && (
                  <motion.span
                    key={`ring-${activeIndex}`}
                    aria-hidden
                    className="pointer-events-none absolute size-0"
                    style={{
                      left: `${activeSlot.x}%`,
                      top: `${activeSlot.y}%`,
                    }}
                    initial={{ scale: 0.4, opacity: 0.55 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{
                      duration: durations.base,
                      ease: easings.exit,
                    }}
                  >
                    <span
                      className="absolute top-0 left-0 block -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                      style={{
                        width: 70,
                        height: 70,
                        borderColor: inkFor(activeIndex),
                      }}
                    />
                  </motion.span>
                )}

              <AnimatePresence>
                {showFlecks &&
                  activeIndex !== null &&
                  activeSlot &&
                  INK_FLECKS.map((fleck, i) => (
                    <motion.span
                      key={`fleck-${activeIndex}-${i}`}
                      aria-hidden
                      className="pointer-events-none absolute block rounded-full"
                      style={{
                        left: `${activeSlot.x}%`,
                        top: `${activeSlot.y}%`,
                        width: 3,
                        height: 3,
                        backgroundColor: inkFor(activeIndex),
                      }}
                      initial={{ opacity: 1, x: 0, y: 0 }}
                      exit={{
                        opacity: 0,
                        x: fleck.dx,
                        y: fleck.dy,
                        transition: {
                          duration: durations.slow,
                          ease: easings.exit,
                          delay: fleck.delay,
                        },
                      }}
                    />
                  ))}
              </AnimatePresence>

              <span className="pointer-events-none absolute right-4 bottom-3 font-mono text-[10px] tracking-[0.08em] text-ink-3">
                — {String(pageIndex + 1).padStart(2, "0")} —
              </span>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {activeIndex !== null &&
            (phase === "descend" || phase === "impact") &&
            activeSlot && (
              <div
                key="stamp-head-anchor"
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${activeSlot.x}%`, top: `${activeSlot.y}%` }}
              >
                <motion.div
                  className="flex flex-col items-center"
                  initial={{ y: HEAD_RISE_Y, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{
                    y: HEAD_LIFT_Y,
                    opacity: 0,
                    transition: { duration: LIFT_S, ease: easings.exit },
                  }}
                  transition={{ duration: DESCEND_S, ease: DESCEND_EASE }}
                >
                  <div
                    className="h-3.5 w-5 rounded-t-1"
                    style={{
                      backgroundColor: inkFor(activeIndex),
                      opacity: 0.4,
                    }}
                  />
                  <div
                    className="grid place-items-center rounded-2 border-2 bg-card"
                    style={{
                      width: 46,
                      height: 60,
                      borderColor: inkFor(activeIndex),
                      color: inkFor(activeIndex),
                    }}
                  >
                    <Stamp className="size-5" />
                  </div>
                </motion.div>
              </div>
            )}
        </AnimatePresence>
      </div>

      <div aria-hidden className="flex h-4 items-center justify-center">
        <AnimatePresence>
          {flashCaption && (
            <motion.span
              key={flashCaption}
              className="text-label text-ink-3 normal-case"
              initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
            >
              {flashCaption}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex w-full items-center justify-between gap-3">
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {visitedCount} of {list.length} · {totalPages} page
          {totalPages === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          aria-label="Stamp the next destination"
          onClick={handleVisit}
          disabled={busy || exhausted}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 text-label text-ink-2 transition-colors hover:text-ink",
            "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          <Stamp className="size-3.5" />
          {exhausted ? "All stamped" : "Stamp"}
        </button>
      </div>

      {collectedNames.length > 0 && (
        <p className="w-full truncate text-label text-ink-3 normal-case">
          Collected — {collectedNames.join(" · ")}
        </p>
      )}

      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>
    </div>
  );
}
