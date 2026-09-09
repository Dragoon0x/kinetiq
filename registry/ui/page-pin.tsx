"use client";

import * as React from "react";

import { animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PagePinCitation = {
  id: string;
  /** The claim, as the pin reads it. */
  label: string;
  /** The page the claim came from, counted from 1. */
  page: number;
  /** The first and last line cited on that page, counted from 0. */
  lines: [number, number];
};

export type PagePinProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The document's name in the header. */
  title: string;
  /** How many sheets the preview draws. */
  pageCount: number;
  /** The pinned claims and the lines they cite. */
  citations: PagePinCitation[];
  /** Controlled chosen citation id. */
  value?: string | null;
  /** Initial chosen citation id for uncontrolled usage. */
  defaultValue?: string | null;
  onValueChange?: (id: string) => void;
  /** Fires when the page under the header changes, by pin or by hand. */
  onPageChange?: (page: number) => void;
  /** Bars drawn per sheet. @default 12 */
  linesPerPage?: number;
  /** Names the preview for assistive technology. */
  label: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Bar widths as a share of the sheet, offset per page so no two sheets read alike. */
const WIDTHS = [92, 78, 88, 64, 95, 70, 84, 58, 90, 76, 82, 46] as const;
/** Sheet geometry in px: a bar, the row it sits in, and the sheet's padding. */
const BAR = 6;
const ROW = 12;
const PAD = 12;

/**
 * Digits that roll to their value on `snap`: the column is ten digits tall, so
 * a `y` percentage moves exactly one. Hidden; the header's text carries the page.
 */
function RollingNumber({
  value,
  width,
  motionSafe,
}: {
  value: string;
  width: number;
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-end tabular-nums"
      style={{ width: `${width}ch` }}
    >
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when
        // the number gains a digit.
        const key = value.length - index;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${Math.max(0, digit) * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Pinned to the page it came from. The source is drawn, not embedded: sheets
 * of seeded text bars in a scroller, under a header that reads the page with
 * rolling digits. Choosing a pin animates the scroller to the cited page on
 * `glide` — no overshoot; the sheet comes to rest — and as pages pass under the
 * header the number rolls on `snap`. When the scroll settles a wash wipes
 * across the cited lines on the enter ease. Scrolling by hand rolls the number
 * too: the header reports where the reader is, not where the pin was.
 *
 * The pins are a radio group with a roving tabindex (arrows move and choose,
 * Home and End jump) and the scroller is a focusable region the keyboard
 * scrolls natively. Under reduced motion the scroller jumps, the digits swap
 * in place and the wash fades in.
 */
export function PagePin({
  ref,
  title,
  pageCount,
  citations,
  value,
  defaultValue = null,
  onValueChange,
  onPageChange,
  linesPerPage = 12,
  label,
  className,
}: PagePinProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const chosen = isControlled ? value : uncontrolled;
  const chosenCitation = citations.find((c) => c.id === chosen) ?? null;

  const [currentPage, setCurrentPage] = React.useState(1);
  const [settledFor, setSettledFor] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [pressSeq, setPressSeq] = React.useState(0);

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const pageNodes = React.useRef<(HTMLDivElement | null)[]>([]);
  const pinButtons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const lastPage = React.useRef(1);

  const pages = Math.max(1, Math.floor(pageCount));
  const digits = String(pages).length;

  // The page under the header is read off the scroll position; sheets share a
  // height, so one stride is the distance between the first two.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const read = () => {
      const first = pageNodes.current[0];
      const second = pageNodes.current[1];
      if (!first) return;
      const stride = second
        ? second.offsetTop - first.offsetTop
        : first.offsetHeight;
      if (stride <= 0) return;
      const page = Math.min(
        pages,
        Math.max(1, Math.round(scroller.scrollTop / stride) + 1),
      );
      if (page === lastPage.current) return;
      lastPage.current = page;
      setCurrentPage(page);
      onPageChange?.(page);
    };
    scroller.addEventListener("scroll", read, { passive: true });
    return () => scroller.removeEventListener("scroll", read);
  }, [pages, onPageChange]);

  // A chosen pin carries the scroller to its page. The wash waits for the
  // settle, so the wipe reads as arriving rather than as chasing the scroll.
  React.useEffect(() => {
    const chosenCitation = citations.find((c) => c.id === chosen);
    if (!chosenCitation) return;
    const scroller = scrollerRef.current;
    const node = pageNodes.current[chosenCitation.page - 1];
    if (!scroller || !node) return;
    const target = Math.max(
      0,
      Math.min(
        node.offsetTop - 8,
        scroller.scrollHeight - scroller.clientHeight,
      ),
    );
    const id = chosenCitation.id;
    const settle = () => {
      setSettledFor(id);
      setAnnounce(
        `Page ${chosenCitation.page} of ${pages}, ${chosenCitation.label}`,
      );
    };
    if (!motionSafe) {
      scroller.scrollTop = target;
      const timer = window.setTimeout(settle, 0);
      return () => window.clearTimeout(timer);
    }
    const controls = animate(scroller.scrollTop, target, {
      ...springs.glide,
      onUpdate: (top) => {
        scroller.scrollTop = top;
      },
      onComplete: settle,
    });
    return () => controls.stop();
  }, [chosen, citations, pressSeq, pages, motionSafe]);

  const choose = (citation: PagePinCitation) => {
    setSettledFor(null);
    setPressSeq((seq) => seq + 1);
    if (citation.id === chosen) return;
    if (!isControlled) setUncontrolled(citation.id);
    onValueChange?.(citation.id);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(citations.length - 1, Math.max(0, index));
    const citation = citations[clamped];
    if (!citation) return;
    pinButtons.current[clamped]?.focus();
    choose(citation);
  };

  // Activation follows focus: an arrow both moves and chooses, as a radio does.
  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: citations.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    focusAt(next);
  };

  const focusIndex = Math.max(
    0,
    citations.findIndex((c) => c.id === chosen),
  );
  const showWash = chosenCitation !== null && settledFor === chosenCitation.id;
  // The cited lines, clamped to the sheet, computed once for the chosen pin.
  const last = linesPerPage - 1;
  const from = Math.min(last, Math.max(0, chosenCitation?.lines[0] ?? 0));
  const to = Math.min(last, Math.max(from, chosenCitation?.lines[1] ?? 0));

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div
        role="radiogroup"
        aria-label="Citations"
        className="flex flex-wrap items-center gap-1.5"
      >
        {citations.map((citation, index) => {
          const checked = citation.id === chosen;
          return (
            <button
              key={citation.id}
              ref={(node) => {
                pinButtons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${citation.label}, page ${citation.page}`}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => choose(citation)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "border-cobalt-bright/60 bg-cobalt-wash text-foreground"
                  : "border-hairline bg-surface-0 text-ink-2 hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="truncate">{citation.label}</span>
              <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                p. {citation.page}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span
          id={labelId}
          title={title}
          className="min-w-0 truncate text-sm font-medium"
        >
          {title}
        </span>
        <span className="flex shrink-0 items-center font-mono text-xs text-ink-3">
          <span className="mr-1">p.</span>
          <span className="font-medium text-foreground">
            <RollingNumber
              value={String(currentPage)}
              width={digits}
              motionSafe={motionSafe}
            />
          </span>
          <span className="ml-1">of {pages}</span>
          <span className="sr-only">
            , page {currentPage} of {pages}
          </span>
        </span>
      </div>

      <div
        ref={scrollerRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className={cn(
          "relative flex h-56 flex-col gap-2 overflow-y-auto rounded-2 border border-hairline bg-surface-2 p-2 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {Array.from({ length: pages }, (_, pageIndex) => {
          const page = pageIndex + 1;
          const cited =
            chosenCitation && chosenCitation.page === page
              ? chosenCitation
              : null;
          return (
            <div
              key={page}
              ref={(node) => {
                pageNodes.current[pageIndex] = node;
              }}
              role="img"
              aria-label={`Page ${page}`}
              className="relative shrink-0 rounded-1 border border-hairline bg-surface-0"
              style={{ padding: PAD }}
            >
              {cited && showWash ? (
                <motion.span
                  key={`wash-${cited.id}-${pressSeq}`}
                  aria-hidden
                  className="pointer-events-none absolute right-2 left-2 origin-left rounded-1 bg-cobalt-wash"
                  style={{
                    top: PAD + from * ROW - (ROW - BAR) / 2,
                    height: (to - from + 1) * ROW,
                  }}
                  initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ duration: durations.slow, ease: easings.enter }}
                />
              ) : null}
              <span
                aria-hidden
                className="relative flex flex-col"
                style={{ gap: ROW - BAR }}
              >
                {Array.from({ length: linesPerPage }, (_, line) => {
                  const width =
                    WIDTHS[(line + pageIndex) % WIDTHS.length] ?? 80;
                  const lit = cited !== null && line >= from && line <= to;
                  return (
                    <span
                      key={line}
                      className={cn(
                        "block rounded-full transition-colors",
                        lit ? "bg-cobalt-bright/70" : "bg-hairline-strong",
                      )}
                      style={{ height: BAR, width: `${width}%` }}
                    />
                  );
                })}
              </span>
              <span
                aria-hidden
                className="mt-2 block text-right font-mono text-[10px] text-ink-3 tabular-nums"
              >
                {page}
              </span>
            </div>
          );
        })}
      </div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
