"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LoadHemPage<T> = {
  items: T[];
  hasMore: boolean;
};

export type LoadHemProps<T> = {
  ref?: React.Ref<HTMLDivElement>;
  /** The first page, already loaded. It is page 0; the hem asks for page 1 next. */
  initial: T[];
  /** Fetches a page. Rejecting shows the hem's Retry rather than losing the list. */
  onLoadMore: (page: number) => Promise<LoadHemPage<T>>;
  /** Row renderer; the hem supplies the row box and its hairline. */
  renderItem: (item: T) => React.ReactNode;
  /** Scroll container the sentinel is watched in. Defaults to the list's own. */
  container?: React.RefObject<HTMLElement | null>;
  /** Names the list for assistive technology. */
  label?: string;
  /** The stamp at the end of the list. @default "That is everything" */
  endLabel?: string;
  className?: string;
};

type HemStatus = "idle" | "loading" | "error" | "done";

/** The hem starts asking this far before it is actually on screen, so a fast
 *  scroll meets rows rather than a loader. */
const LOOKAHEAD = "0px 0px 96px 0px";

/** Walks up to the element that actually scrolls, which is what the sentinel
 *  must be measured against; falling back to the viewport. */
const scrollParentOf = (node: HTMLElement | null): HTMLElement | null => {
  let current = node?.parentElement ?? null;
  while (current && current !== document.body) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return null;
};

/**
 * Infinite scroll done honestly. A sentinel sits at the list's hem and an
 * IntersectionObserver — not a scroll handler — decides when the next page is
 * due, so an idle list costs nothing and a list whose hem is off screen never
 * fetches on mount. The observer is rebuilt after each page, which is what lets
 * a hem that is still in view ask for one more; a status flag guards the
 * crossing, so one page is never fetched twice.
 *
 * Arriving rows cascade in from `distances.step` on `glide` — a list growing is
 * a layout settling, not a switch — and the sentinel is carried down by them.
 * The last page retires the loader and stamps the end on `recoil`. A page that
 * fails keeps everything already loaded and offers Retry: the observer stays
 * quiet until a person asks again, because retrying a broken request on scroll
 * is how a list hammers a server.
 *
 * Pages, failures and the end are announced in a polite live region. Under
 * reduced motion rows simply appear and the loader stops sweeping, while the
 * loading and end states still show — that a list is still loading is
 * information, not decoration.
 */
export function LoadHem<T>({
  ref,
  initial,
  onLoadMore,
  renderItem,
  container,
  label,
  endLabel = "That is everything",
  className,
}: LoadHemProps<T>) {
  const motionSafe = useMotionSafe();

  // The first page is captured once. A list that reset itself whenever the
  // caller rebuilt the array would throw away every page below it.
  const [pages, setPages] = React.useState<T[][]>(() => [initial]);
  const [status, setStatus] = React.useState<HemStatus>("idle");
  const [announcement, setAnnouncement] = React.useState("");

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const mountedRef = React.useRef(true);

  // The observer reads these rather than the rendered values: it is created
  // once per page, and a closure over state would be a page behind.
  const statusRef = React.useRef<HemStatus>("idle");
  const pageRef = React.useRef(1);
  const countRef = React.useRef(initial.length);

  const loadRef = React.useRef(onLoadMore);
  React.useEffect(() => {
    loadRef.current = onLoadMore;
  }, [onLoadMore]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const move = React.useCallback((next: HemStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const requestPage = React.useCallback(
    (asked: boolean) => {
      const state = statusRef.current;
      if (state === "loading" || state === "done") return;
      // A page that failed waits to be asked for: re-running a broken request
      // every time the hem crosses the fold is how a list hammers a server.
      if (state === "error" && !asked) return;
      const page = pageRef.current;
      move("loading");
      // The fetch is started from the crossing or the press that caused it,
      // never from inside a state updater, which React may run more than once.
      loadRef.current(page).then(
        (result) => {
          if (!mountedRef.current) return;
          pageRef.current = page + 1;
          countRef.current += result.items.length;
          setPages((current) => [...current, result.items]);
          move(result.hasMore ? "idle" : "done");
          setAnnouncement(
            result.hasMore
              ? `Page ${page + 1} loaded. ${countRef.current} rows so far.`
              : `Page ${page + 1} loaded. ${countRef.current} rows, end of list.`,
          );
        },
        () => {
          if (!mountedRef.current) return;
          move("error");
          setAnnouncement(
            `Page ${page + 1} could not load. Retry is available.`,
          );
        },
      );
    },
    [move],
  );

  const loaded = pages.length;
  const retired = status === "done";

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || retired) return;
    const root = container?.current ?? scrollParentOf(sentinel);

    const observer = new IntersectionObserver(
      (entries) => {
        // A hem that is not on screen is not a request. The observer reports
        // the current state as soon as it observes, so this is also what keeps
        // a long first page from fetching the moment it mounts.
        if (!entries.some((entry) => entry.isIntersecting)) return;
        requestPage(false);
      },
      { root, rootMargin: LOOKAHEAD, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // Re-observing after each page is what asks for the next one when the hem
    // is still in view; without it a tall container stops after one page.
  }, [container, requestPage, loaded, retired]);

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <ul aria-label={label} aria-busy={status === "loading"}>
        {pages.flatMap((rows, pageIndex) =>
          rows.map((item, index) => (
            <motion.li
              key={`${pageIndex}-${index}`}
              className="border-b border-hairline px-3 py-2.5"
              // The first page is already on the page when it mounts; only the
              // pages the hem fetched arrive, so only those cascade.
              initial={
                pageIndex === 0
                  ? false
                  : motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? { ...springs.glide, delay: index * cascade(rows.length) }
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              {renderItem(item)}
            </motion.li>
          )),
        )}
      </ul>

      {/* The hem itself. It holds no height of its own when there is nothing to
          say, so a finished list ends at its last row. */}
      <div ref={sentinelRef} className="flex flex-col items-center px-3">
        {status === "loading" ? (
          <div className="flex w-full flex-col items-center gap-2 py-3">
            <span className="relative h-px w-full overflow-hidden bg-hairline">
              {motionSafe ? (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1/3 bg-cobalt-bright"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{
                    duration: durations.page,
                    ease: easings.linear,
                    repeat: Infinity,
                  }}
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1/3 bg-cobalt-bright"
                />
              )}
            </span>
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Loading
            </span>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="flex w-full flex-wrap items-center justify-center gap-2 py-3">
            <span className="text-xs text-ink-2">That page did not load.</span>
            <button
              type="button"
              onClick={() => requestPage(true)}
              className="inline-flex h-8 items-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Retry
            </button>
          </div>
        ) : null}

        {retired ? (
          <div className="flex w-full items-center gap-2 py-3">
            <span aria-hidden className="h-px flex-1 bg-hairline" />
            <motion.span
              className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              // Only the words stamp: scaling a full-width row would push the
              // container into a horizontal scroll for the length of the spring.
              initial={motionSafe ? { scale: 1.2, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                motionSafe
                  ? {
                      ...springs.recoil,
                      opacity: { duration: durations.blink },
                    }
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              {endLabel}
            </motion.span>
            <span aria-hidden className="h-px flex-1 bg-hairline" />
          </div>
        ) : null}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
