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

export type PeekBlock = {
  kind: "nav" | "hero" | "heading" | "text" | "button" | "cards";
  /** Percentage of the page width, for heading, text and button blocks. */
  width?: number;
};

export type PeekSnapshot = {
  id: string;
  url: string;
  title: string;
  /** The page, top to bottom, as a procedural drawing. */
  blocks: PeekBlock[];
  /** Where the agent clicked on this page, as percentages of the page area. */
  click?: { x: number; y: number; target: string };
};

export type BrowserPeekProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The pages in visit order. */
  snapshots: PeekSnapshot[];
  /** Controlled index of the shown page. */
  index?: number;
  /** Initial index for uncontrolled usage. @default 0 */
  defaultIndex?: number;
  /** Fires from Back and Forward. */
  onIndexChange?: (index: number) => void;
  /** The agent is browsing now: a dot in the frame breathes. @default false */
  live?: boolean;
  /** Names the frame. */
  label: string;
  className?: string;
};

/** The drawing's coordinate space; the SVG scales to its container. */
const PAGE_W = 160;
const PAGE_H = 100;
const PAD = 8;
const INNER = PAGE_W - PAD * 2;

type Shape = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
  className: string;
};

const round = (value: number) => Number(value.toFixed(3));

/** Per-kind geometry: height, corner, lead and gap in page units, tone, and the default width share. */
const SIMPLE = {
  hero: { h: 26, rx: 3, lead: 0, gap: 6, share: 1, tone: "fill-cobalt-wash" },
  heading: { h: 5, rx: 1.5, lead: 0, gap: 4, share: 0.6, tone: "fill-ink-2" },
  text: {
    h: 3,
    rx: 1.5,
    lead: 0,
    gap: 3,
    share: 0.9,
    tone: "fill-hairline-strong",
  },
  button: {
    h: 8,
    rx: 2,
    lead: 2,
    gap: 6,
    share: 0.28,
    tone: "fill-cobalt-bright",
  },
} as const;

/** Lays the blocks out top to bottom; every coordinate is rounded before it reaches an attribute. */
function layout(blocks: PeekBlock[]): Shape[] {
  const shapes: Shape[] = [];
  let y = 0;
  const add = (
    key: string,
    x: number,
    w: number,
    h: number,
    rx: number,
    className: string,
  ) =>
    shapes.push({
      key,
      x: round(x),
      y: round(y),
      w: round(w),
      h,
      rx,
      className,
    });
  blocks.forEach((block, index) => {
    const id = `${index}`;
    if (block.kind === "nav") {
      add(`${id}-bar`, 0, PAGE_W, 10, 0, "fill-surface-2");
      y += 3;
      add(`${id}-logo`, PAD, 14, 4, 1, "fill-cobalt-bright");
      add(`${id}-a`, PAGE_W - PAD - 34, 12, 4, 1, "fill-hairline-strong");
      add(`${id}-b`, PAGE_W - PAD - 16, 16, 4, 1, "fill-hairline-strong");
      y += 13;
      return;
    }
    if (block.kind === "cards") {
      const w = (INNER - 8) / 3;
      for (let column = 0; column < 3; column += 1) {
        add(
          `${id}-${column}`,
          PAD + column * (w + 4),
          w,
          20,
          2,
          "fill-surface-2 stroke-hairline-strong",
        );
      }
      y += 26;
      return;
    }
    const spec = SIMPLE[block.kind];
    const share =
      block.width === undefined
        ? spec.share
        : Math.min(100, Math.max(4, block.width)) / 100;
    y += spec.lead;
    add(id, PAD, INNER * share, spec.h, spec.rx, spec.tone);
    y += spec.h + spec.gap;
  });
  return shapes;
}

/** A frame chevron; centred on the button, never on the text beside it. */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0"
    >
      <path d={dir === "left" ? "m10 4-4 4 4 4" : "m6 4 4 4-4 4"} />
    </svg>
  );
}

/** The glide settles in about 450ms; the press waits for the dot to arrive. */
const PRESS_DELAY = 0.45;

/**
 * A mini browser frame that shows what the agent is looking at. The page is a
 * procedural drawing — nav, hero, heading, text, button and card blocks laid
 * out from the snapshot's block list — never a live page. When the index
 * changes, the new address slides in from 8px below on `snap` while the old
 * one leaves upward on the exit ease, and the page area cross-fades on a
 * `durations.base` tween: a page swap is a picture changing, not a thing
 * moving. A cursor dot rides the page. It glides to the snapshot's click point
 * on `glide` and, once the glide has settled, presses with a short squash and
 * a ring that ripples out once, so the click reads as an act rather than a
 * marker. Back and Forward step the index, so the reader can walk what the
 * agent saw. The host owns the clock; the frame keeps none.
 *
 * The frame is a labelled group, the page area is an image named by the
 * page's title and address, and the status region speaks once per page.
 * Under reduced motion the address and page swap with fades, and the dot
 * appears at the click point with its ring already drawn.
 */
export function BrowserPeek({
  ref,
  snapshots,
  index,
  defaultIndex = 0,
  onIndexChange,
  live = false,
  label,
  className,
}: BrowserPeekProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState(defaultIndex);
  const isControlled = index !== undefined;
  const last = Math.max(0, snapshots.length - 1);
  const current = Math.min(
    last,
    Math.max(0, isControlled ? index : uncontrolled),
  );
  const snapshot = snapshots[current];

  const step = (next: number) => {
    const clamped = Math.min(last, Math.max(0, next));
    if (clamped === current) return;
    if (!isControlled) setUncontrolled(clamped);
    onIndexChange?.(clamped);
  };

  const click = snapshot?.click;
  const dotX = click ? Math.min(100, Math.max(0, Math.round(click.x))) : 50;
  const dotY = click ? Math.min(100, Math.max(0, Math.round(click.y))) : 50;

  const announcement = snapshot
    ? `Page ${current + 1} of ${snapshots.length}, ${snapshot.title}, ${snapshot.url}.${
        click ? ` Clicked ${click.target}.` : ""
      }`
    : "";

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const frameButton = cn(
    "flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  );

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-10 items-center gap-1.5 border-b border-hairline px-2">
        <button
          type="button"
          aria-label="Back"
          disabled={current <= 0}
          onClick={() => step(current - 1)}
          className={frameButton}
        >
          <Chevron dir="left" />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={current >= last}
          onClick={() => step(current + 1)}
          className={frameButton}
        >
          <Chevron dir="right" />
        </button>

        <span className="relative flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-full border border-hairline bg-surface-0 pr-2.5 pl-2">
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="size-3 shrink-0 text-ink-3"
          >
            <rect x="3.5" y="7" width="9" height="6" rx="1.5" />
            <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
          </svg>
          {/* The address slides in a cell of its own: the well never grows
              for a state, and the old address leaves as the new one lands. */}
          <span className="relative h-full min-w-0 flex-1">
            <AnimatePresence initial={false}>
              {snapshot ? (
                <motion.span
                  key={snapshot.id}
                  className="absolute inset-0 flex items-center pl-1.5 font-mono text-[11px] text-foreground"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: motionSafe ? -distances.step : 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe ? { ...springs.snap, opacity: fade } : fade
                  }
                >
                  <span className="min-w-0 truncate" title={snapshot.url}>
                    {snapshot.url}
                  </span>
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>
        </span>

        <AnimatePresence initial={false}>
          {live ? (
            <motion.span
              key="live"
              aria-hidden
              className="mx-1 size-1.5 shrink-0 rounded-full bg-cobalt-bright"
              initial={{ opacity: 0 }}
              animate={{ opacity: motionSafe ? [1, 0.35] : 0.6 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      duration: 0.8,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatType: "reverse",
                    }
                  : fade
              }
            />
          ) : null}
        </AnimatePresence>
      </div>

      <div
        role="img"
        aria-label={
          snapshot ? `${snapshot.title}, ${snapshot.url}` : "No page yet"
        }
        className="relative grid bg-surface-0"
      >
        <AnimatePresence initial={false}>
          {snapshot ? (
            <motion.svg
              key={snapshot.id}
              viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
              aria-hidden
              className="col-start-1 row-start-1 block h-auto w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={{
                duration: motionSafe ? durations.base : durations.fast,
                ease: easings.enter,
              }}
            >
              {layout(snapshot.blocks).map((shape) => (
                <rect
                  key={shape.key}
                  x={shape.x}
                  y={shape.y}
                  width={shape.w}
                  height={shape.h}
                  rx={shape.rx}
                  strokeWidth="0.5"
                  className={shape.className}
                />
              ))}
            </motion.svg>
          ) : (
            <span
              key="empty"
              className="col-start-1 row-start-1 px-3 py-6 text-center text-xs text-ink-3"
            >
              No page yet.
            </span>
          )}
        </AnimatePresence>

        {/* The dot's position is animated as percentages, so it lands on the
            same spot at any width; the press is keyed by page so each new
            page re-arms it. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2"
          initial={false}
          animate={{
            left: `${dotX}%`,
            top: `${dotY}%`,
            opacity: click ? 1 : 0,
          }}
          transition={
            motionSafe
              ? { ...springs.glide, opacity: fade }
              : { duration: 0, opacity: fade }
          }
        >
          {click && snapshot ? (
            <React.Fragment key={snapshot.id}>
              <motion.span
                className="absolute inset-0 rounded-full border border-cobalt-bright"
                initial={
                  motionSafe
                    ? { scale: 0.4, opacity: 0 }
                    : { scale: 2, opacity: 0.5 }
                }
                animate={
                  motionSafe
                    ? { scale: 2.4, opacity: [0.7, 0] }
                    : { scale: 2, opacity: 0.5 }
                }
                transition={{
                  delay: motionSafe ? PRESS_DELAY : 0,
                  duration: durations.slow,
                  ease: easings.enter,
                }}
              />
              <motion.span
                className="absolute inset-0 rounded-full bg-cobalt-bright shadow-raised"
                initial={{ scale: 1 }}
                animate={{ scale: motionSafe ? [1, 0.7, 1] : 1 }}
                transition={{
                  delay: PRESS_DELAY,
                  duration: durations.base,
                  ease: easings.move,
                }}
              />
            </React.Fragment>
          ) : null}
        </motion.span>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
