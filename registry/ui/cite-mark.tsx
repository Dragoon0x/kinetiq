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

export type CiteSource = {
  id: string;
  /** The document or page the claim leans on. */
  title: string;
  /** Where it lives, printed in mono. */
  site: string;
  /** The passage the answer drew on. */
  excerpt: string;
  /** When it was published or fetched, already formatted. */
  date?: string;
};

export type CiteMarkProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer; `[n]` cites `sources[n - 1]`. */
  text: string;
  /** Sources in citation order. */
  sources: CiteSource[];
  /** Controlled ids pinned to the margin rail. */
  pinned?: string[];
  /** Initial pinned ids for uncontrolled usage. @default [] */
  defaultPinned?: string[];
  /** Fires from the press that pinned or unpinned a source. */
  onPinnedChange?: (ids: string[]) => void;
  /** Fires when hover or focus shows or hides a source card. */
  onHoverChange?: (id: string | null) => void;
  /** Names the answer region for assistive technology. */
  label: string;
  className?: string;
};

const NO_PINS: string[] = [];
const MARK = /(\[\d+\])/;

/** Widest the card grows; narrower frames take the whole width. */
const CARD_WIDTH = 256;

/** Measures an element's border-box height without reading layout in render. */
function useMeasuredHeight(): [React.RefCallback<HTMLElement>, number | null] {
  const [height, setHeight] = React.useState<number | null>(null);
  const observer = React.useRef<ResizeObserver | null>(null);
  const ref = React.useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    // Fires once on observe, so the first height lands from a callback.
    observer.current = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.current.observe(node);
  }, []);
  return [ref, height];
}

function CardBody({ source, index }: { source: CiteSource; index: number }) {
  return (
    <>
      <p className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-mono text-[10px] text-cobalt-bright tabular-nums">
          {index}
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-ink">
          {source.title}
        </span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">
        {source.excerpt}
      </p>
      <p className="mt-1.5 flex min-w-0 items-center gap-2 font-mono text-[10px] text-ink-3">
        <span className="min-w-0 truncate">{source.site}</span>
        {source.date ? (
          <span className="shrink-0 tabular-nums">{source.date}</span>
        ) : null}
      </p>
    </>
  );
}

/**
 * A citation number that knows its source. Hovering or focusing a mark lifts
 * it two pixels on `flick` and opens its source card in a slot under the
 * paragraph, anchored beneath the mark with a caret; the slot's height is
 * measured, so the card rises on `glide` instead of jumping the layout, and
 * the card itself arrives on `snap` from a nudge below. Pressing pins: the
 * card carries a `layoutId` shared with its pinned twin, so it travels on
 * `glide` — a FLIP — from under the mark into the margin rail, where pinned
 * sources stack in citation order. Pressing again, or the card's unpin
 * control, sends it back the same way.
 *
 * Marks are real buttons in a superscript, described by an always-mounted
 * line with the site and excerpt so a screen reader has the source whether or
 * not the card is showing; Enter or Space pins, Escape hides or unpins. Under
 * reduced motion the mark colours without lifting, cards fade in place, and
 * pin and unpin cross-fade with no shared travel.
 */
export function CiteMark({
  ref,
  text,
  sources,
  pinned: pinnedProp,
  defaultPinned = NO_PINS,
  onPinnedChange,
  onHoverChange,
  label,
  className,
}: CiteMarkProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [ownPinned, setOwnPinned] = React.useState(defaultPinned);
  const pinned = pinnedProp ?? ownPinned;

  const [hover, setHover] = React.useState<string | null>(null);
  // The mark's centre, in pixels from the frame's left edge, read from the
  // event that showed the card — never from a ref during render.
  const [anchor, setAnchor] = React.useState({ x: 0, frame: 0 });
  const [announcement, setAnnouncement] = React.useState("");
  const frameRef = React.useRef<HTMLDivElement | null>(null);

  const [slotRef, slotHeight] = useMeasuredHeight();
  const [railRef, railHeight] = useMeasuredHeight();

  const show = (id: string, target: HTMLElement) => {
    const frame = frameRef.current?.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    if (frame) {
      setAnchor({
        x: Math.round(rect.left - frame.left + rect.width / 2),
        frame: Math.round(frame.width),
      });
    }
    if (id !== hover) {
      setHover(id);
      onHoverChange?.(id);
    }
  };

  const hide = () => {
    if (hover === null) return;
    setHover(null);
    onHoverChange?.(null);
  };

  const markId = (id: string) => `${baseId}-mark-${id}`;

  const setPin = (
    source: CiteSource,
    index: number,
    on: boolean,
    returnFocus = false,
  ) => {
    // Pinned cards keep citation order however they were pinned, so the rail
    // reads like the paragraph does.
    const next = on
      ? sources
          .map((s) => s.id)
          .filter((id) => id === source.id || pinned.includes(id))
      : pinned.filter((id) => id !== source.id);
    if (pinnedProp === undefined) setOwnPinned(next);
    onPinnedChange?.(next);
    setAnnouncement(
      on
        ? `Pinned source ${index}, ${source.title}`
        : `Unpinned source ${index}`,
    );
    if (returnFocus) document.getElementById(markId(source.id))?.focus();
  };

  const hovered = hover ? sources.find((s) => s.id === hover) : undefined;
  const hoveredIndex = hovered ? sources.indexOf(hovered) + 1 : 0;
  const floating = hovered && !pinned.includes(hovered.id) ? hovered : null;

  // The card is sized by the frame and clamped inside it; the caret then
  // points back at the mark from wherever the card had to sit.
  const cardWidth = Math.min(CARD_WIDTH, anchor.frame || CARD_WIDTH);
  const cardLeft = Math.round(
    Math.min(
      Math.max(0, anchor.x - cardWidth / 2),
      Math.max(0, anchor.frame - cardWidth),
    ),
  );
  const caretLeft = Math.round(
    Math.min(Math.max(12, anchor.x - cardLeft), cardWidth - 12),
  );

  const pinnedSources = sources.filter((s) => pinned.includes(s.id));
  const heightSpring = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const cardClass =
    "rounded-2 border border-hairline bg-surface-1 px-3 py-2.5 shadow-raised";

  return (
    <div
      ref={ref}
      role="region"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col", className)}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <div ref={frameRef} onPointerLeave={hide} className="relative">
        <p className="text-sm leading-relaxed text-ink">
          {text.split(MARK).map((piece, pieceIndex) => {
            const match = /^\[(\d+)\]$/.exec(piece);
            const index = match ? Number(match[1]) : 0;
            const source = match ? sources[index - 1] : undefined;
            if (!source) {
              return <React.Fragment key={pieceIndex}>{piece}</React.Fragment>;
            }
            const isPinned = pinned.includes(source.id);
            const active = hover === source.id;
            return (
              <sup
                key={pieceIndex}
                className="mx-px align-baseline leading-none"
              >
                <button
                  type="button"
                  id={markId(source.id)}
                  aria-label={`Source ${index}, ${source.title}`}
                  aria-pressed={isPinned}
                  aria-describedby={`${baseId}-desc-${source.id}`}
                  onPointerEnter={(event) =>
                    show(source.id, event.currentTarget)
                  }
                  onFocus={(event) => show(source.id, event.currentTarget)}
                  onBlur={hide}
                  onClick={() => setPin(source, index, !isPinned)}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    if (isPinned) setPin(source, index, false);
                    else hide();
                  }}
                  className={cn(
                    "inline-flex h-4 min-w-4 translate-y-[-3px] items-center justify-center rounded-1 border px-1 font-mono text-[10px] tabular-nums transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isPinned
                      ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
                      : active
                        ? "border-hairline-strong bg-surface-2 text-cobalt-bright"
                        : "border-hairline bg-surface-1 text-ink-2 hover:text-ink",
                  )}
                >
                  <motion.span
                    className="inline-block"
                    initial={false}
                    animate={{
                      y: active && motionSafe ? -distances.nudge / 2 : 0,
                    }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  >
                    {index}
                  </motion.span>
                </button>
              </sup>
            );
          })}
        </p>

        {/* The floating card lives in flow under the paragraph rather than over
            whatever sits below, so nothing is covered and the demo's height
            follows it; its slot is measured and glides open. */}
        <motion.div
          aria-hidden
          initial={false}
          animate={{ height: floating ? (slotHeight ?? "auto") : 0 }}
          transition={heightSpring}
          className="overflow-hidden"
        >
          <div ref={slotRef} className="relative pt-2 pb-1">
            <AnimatePresence initial={false} mode="popLayout">
              {floating ? (
                <motion.div
                  key={floating.id}
                  layoutId={
                    motionSafe ? `${baseId}-card-${floating.id}` : undefined
                  }
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe ? { ...springs.snap, opacity: fade } : fade
                  }
                  style={{ width: cardWidth, marginLeft: cardLeft }}
                  className={cn("relative max-w-full", cardClass)}
                >
                  <span
                    style={{ left: caretLeft }}
                    className="absolute -top-1 size-2 -translate-x-1/2 rotate-45 border-t border-l border-hairline bg-surface-1"
                  />
                  <CardBody source={floating} index={hoveredIndex} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Positioned above later siblings so a card still travelling into the
          rail paints over the demo's own lines rather than under them. */}
      <motion.div
        initial={false}
        animate={{ height: railHeight ?? "auto" }}
        transition={heightSpring}
        className="relative z-10"
      >
        {/* Flex, so the header's top margin cannot collapse out of the measurement. */}
        <div ref={railRef} className="flex flex-col">
          {pinnedSources.length > 0 ? (
            <div className="mt-3 mb-2 flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Margin
              </span>
              <span className="h-px flex-1 bg-hairline" />
            </div>
          ) : null}
          <ul aria-label="Pinned sources" className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {pinnedSources.map((source) => {
                const index = sources.indexOf(source) + 1;
                return (
                  <motion.li
                    key={source.id}
                    layoutId={
                      motionSafe ? `${baseId}-card-${source.id}` : undefined
                    }
                    layout={motionSafe ? "position" : false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe ? { ...springs.glide, opacity: fade } : fade
                    }
                    className={cn(
                      "relative flex items-start gap-2",
                      cardClass,
                      hover === source.id && "border-hairline-strong",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <CardBody source={source} index={index} />
                    </div>
                    <button
                      type="button"
                      aria-label={`Unpin source ${index}`}
                      onClick={() => setPin(source, index, false, true)}
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      )}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        className="size-3.5 shrink-0"
                      >
                        <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                      </svg>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      </motion.div>

      {sources.map((source, index) => (
        <span
          key={source.id}
          id={`${baseId}-desc-${source.id}`}
          className="sr-only"
        >
          {source.site}. {source.excerpt}
          {source.date ? ` ${source.date}.` : ""}
          {pinned.includes(source.id) ? " Pinned to the margin." : ""}
          {` Source ${index + 1} of ${sources.length}.`}
        </span>
      ))}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
