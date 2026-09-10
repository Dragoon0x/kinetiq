"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GalleryPhoto = {
  id: string;
  /** Draws the picture. The same seed always draws the same quay. */
  seed: number;
  caption: string;
};

export type GalleryStripProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The pictures, in the strip's order. */
  photos: GalleryPhoto[];
  /** Own messages sit on the right. @default "peer" */
  from?: "me" | "peer";
  /** A line above the strip. */
  text?: string;
  /** Printed under the message, already formatted. */
  time?: string;
  /** Controlled open picture; null closes the viewer. */
  openId?: string | null;
  /** Initial open picture for uncontrolled usage. @default null */
  defaultOpenId?: string | null;
  /** Fires when the viewer opens, moves or closes. */
  onOpenChange?: (id: string | null) => void;
  /** Fires as the cursor moves along the strip, viewer or not. */
  onActiveChange?: (id: string) => void;
  /** The other person; the meta line names them. @default "Them" */
  peerName?: string;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const r3 = (value: number) => Number(value.toFixed(3));

/** Integer ops only, so the server and the browser draw the same quay. */
function stream(seed: number) {
  let state = (Math.floor(seed) * 0x9e3779b1) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CRATE_TINTS = ["fill-cobalt", "fill-warn", "fill-success"] as const;

/**
 * One drawing serves both sizes: a 4:3 viewBox sliced to a square in the strip
 * and shown whole in the viewer, so opening a picture enlarges it rather than
 * swapping it for a different one.
 */
function Quay({ seed, gradientId }: { seed: number; gradientId: string }) {
  const next = stream(seed);
  const quayLine = r3(76 + next() * 8);
  const crates = [0, 1, 2, 3, 4].map((index) => {
    const width = r3(14 + next() * 12);
    const height = r3(10 + next() * 22);
    return {
      x: r3(6 + index * 30 + next() * 6),
      y: r3(quayLine - height),
      width,
      height,
      tint: CRATE_TINTS[index % CRATE_TINTS.length] ?? "fill-cobalt",
    };
  });
  const mast = r3(96 + next() * 40);
  const jib = r3(24 + next() * 20);

  return (
    <svg
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="block size-full"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-cobalt-wash)" />
          <stop offset="1" stopColor="var(--color-surface-0)" />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill={`url(#${gradientId})`} />
      <rect
        y={r3(quayLine + 6)}
        width="160"
        height={r3(120 - quayLine - 6)}
        className="fill-ink"
        opacity="0.16"
      />
      <path
        d={`M${mast},${jib} v${r3(quayLine - jib)} M${r3(mast - 30)},${jib} h44`}
        className="stroke-ink"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.35"
      />
      {crates.map((crate, index) => (
        <rect
          key={`crate-${index}`}
          x={crate.x}
          y={crate.y}
          width={crate.width}
          height={crate.height}
          rx="1.5"
          className={crate.tint}
          opacity={0.4 + (index % 3) * 0.12}
        />
      ))}
      <path
        d={`M0,${quayLine} h160`}
        className="stroke-ink"
        strokeWidth="1.5"
        opacity="0.3"
      />
    </svg>
  );
}

/** Binds a ResizeObserver to the viewer's content as it arrives. */
function useMeasuredHeight() {
  const [height, setHeight] = React.useState<number | null>(null);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  const attach = React.useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  React.useEffect(() => () => observerRef.current?.disconnect(), []);
  return [attach, height] as const;
}

function ArrowButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    // aria-disabled rather than disabled: an arrow that disables itself under
    // the pointer that just pressed it would drop the focus to the body.
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        onPress();
      }}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline-strong text-ink-2 transition-colors outline-none",
        "hover:bg-accent hover:text-foreground active:bg-cobalt-wash",
        "aria-disabled:pointer-events-none aria-disabled:opacity-40",
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
        strokeLinejoin="round"
        className="size-4 shrink-0"
      >
        {children}
      </svg>
    </button>
  );
}

/**
 * Several pictures, one strip. The strip is a real `overflow-x-auto` box
 * inside the bubble — it scrolls itself rather than pushing the thread wide —
 * and a fade sits at whichever end still has pictures behind it, each fade
 * following a measured edge on a `durations.fast` tween. Every thumbnail is
 * drawn from its seed, never loaded.
 *
 * Pressing one opens a viewer in flow beneath the strip: its inner height is
 * read by a ResizeObserver bound to the node as it arrives and the fold glides
 * from 0 to that height on `glide`, so the viewer takes room from the thread
 * rather than floating over whatever the host drew around it. Inside, the
 * picture changes with a cross-fade and a 4px nudge on `snap` whose direction
 * follows the index delta, while the counter swaps outright in `tabular-nums`,
 * because a reading that must keep up with held arrow keys should not animate.
 * The strip follows: the active thumbnail is driven to the centre by `animate`
 * on `glide`. A roving tabindex runs the strip — Left and Right step, Home and
 * End jump, Enter opens — and Escape closes the viewer and returns focus to
 * the thumbnail it grew from. Under reduced motion the viewer still opens and
 * the strip still scrolls, instantly, because both are the information.
 */
export function GalleryStrip({
  ref,
  photos,
  from = "peer",
  text,
  time,
  openId,
  defaultOpenId = null,
  onOpenChange,
  onActiveChange,
  peerName = "Them",
  label,
  className,
}: GalleryStripProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const own = from === "me";
  const count = photos.length;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState<string | null>(
    defaultOpenId,
  );
  const isControlled = openId !== undefined;
  const open = isControlled ? openId : uncontrolledOpen;
  const openIndex = photos.findIndex((photo) => photo.id === open);

  const [focusIndex, setFocusIndex] = React.useState(0);
  // With the viewer up, the open picture is the cursor: arrowing the strip
  // moves what is being viewed rather than leaving the two out of step.
  const cursor = openIndex >= 0 ? openIndex : Math.min(focusIndex, count - 1);
  const active = photos[cursor] ?? null;
  const [direction, setDirection] = React.useState(1);

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [viewerRef, viewerHeight] = useMeasuredHeight();
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const thumbId = (id: string) => `${baseId}-thumb-${id}`;

  // Fades only where there is more strip to reach; measured from the observer
  // so the first paint is honest without reading layout during render.
  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const measure = () => {
      const overflow = node.scrollWidth - node.clientWidth;
      setEdges({
        start: node.scrollLeft > 1,
        end: node.scrollLeft < overflow - 1,
      });
    };
    // The observer fires once on observe, which is the first measurement —
    // calling it here as well would set state from inside the effect body.
    node.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [count]);

  // The strip follows the cursor. Driving scrollLeft through `animate` keeps
  // the glide in the house physics instead of the browser's smooth scroll.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    const node = scroller?.querySelector<HTMLElement>(
      `[data-cursor="${cursor}"]`,
    );
    if (!scroller || !node) return;
    const limit = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const target = Math.round(
      Math.min(
        limit,
        Math.max(
          0,
          node.offsetLeft - (scroller.clientWidth - node.offsetWidth) / 2,
        ),
      ),
    );
    if (!motionSafe) {
      scroller.scrollLeft = target;
      return;
    }
    const controls = animate(scroller.scrollLeft, target, {
      ...springs.glide,
      onUpdate: (value) => {
        scroller.scrollLeft = Math.round(value);
      },
    });
    return () => controls.stop();
  }, [cursor, motionSafe]);

  const setOpen = (next: string | null) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // The sentence is frozen at the change, so the region speaks the hop rather
  // than whatever a later re-render computes.
  const [spoken, setSpoken] = React.useState({ open, message: "" });
  if (spoken.open !== open) {
    const index = photos.findIndex((photo) => photo.id === open);
    const photo = photos[index];
    setSpoken({
      open,
      message:
        photo === undefined
          ? "Viewer closed"
          : `Picture ${index + 1} of ${count}, ${photo.caption}`,
    });
  }

  const moveTo = (index: number, moveFocus: boolean) => {
    const clamped = Math.min(count - 1, Math.max(0, index));
    const photo = photos[clamped];
    if (!photo) return;
    setDirection(clamped >= cursor ? 1 : -1);
    setFocusIndex(clamped);
    if (openIndex >= 0) setOpen(photo.id);
    onActiveChange?.(photo.id);
    if (moveFocus) document.getElementById(thumbId(photo.id))?.focus();
  };

  const close = () => {
    const photo = photos[cursor];
    setOpen(null);
    setFocusIndex(cursor);
    if (photo) document.getElementById(thumbId(photo.id))?.focus();
  };

  const onStripKeys = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTo(cursor + 1, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTo(cursor - 1, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(count - 1, true);
    } else if (event.key === "Escape" && openIndex >= 0) {
      event.preventDefault();
      close();
    }
  };

  const onViewerKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTo(cursor + 1, false);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTo(cursor - 1, false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <ol
        role="list"
        aria-label={label}
        className="flex flex-col gap-1 px-0.5 pb-0.5"
      >
        <li
          className={cn(
            "flex w-full flex-col gap-1",
            own ? "items-end" : "items-start",
          )}
        >
          <div
            className={cn(
              "w-[94%] max-w-72 rounded-3 border p-2",
              own
                ? "rounded-br-1 border-transparent bg-primary text-primary-foreground"
                : "rounded-bl-1 border-hairline bg-surface-2 text-foreground",
            )}
          >
            {text ? (
              <p className="px-1 pb-2 text-sm leading-snug wrap-break-word">
                {text}
              </p>
            ) : null}

            <div className="relative">
              <div
                ref={scrollerRef}
                className="overflow-x-auto overflow-y-hidden"
              >
                <ul
                  role="list"
                  aria-label={`${count} pictures`}
                  onKeyDown={onStripKeys}
                  className="flex w-max items-center gap-2 p-1"
                >
                  {photos.map((photo, index) => {
                    const isOpen = photo.id === open;
                    return (
                      <li key={photo.id} className="shrink-0">
                        <button
                          type="button"
                          id={thumbId(photo.id)}
                          data-cursor={index}
                          tabIndex={index === cursor ? 0 : -1}
                          aria-current={isOpen || undefined}
                          onClick={() => {
                            setDirection(index >= cursor ? 1 : -1);
                            setFocusIndex(index);
                            onActiveChange?.(photo.id);
                            setOpen(isOpen ? null : photo.id);
                          }}
                          aria-label={`${isOpen ? "Close" : "Open"} picture ${index + 1} of ${count}: ${photo.caption}, from ${own ? "you" : peerName}`}
                          className={cn(
                            "block size-16 overflow-hidden rounded-2 border transition-colors outline-none",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            isOpen
                              ? "border-cobalt-bright ring-2 ring-cobalt-bright"
                              : "border-hairline hover:border-hairline-strong",
                          )}
                        >
                          <Quay
                            seed={photo.seed}
                            gradientId={`${baseId}-sky-${photo.id}`}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <motion.span
                aria-hidden
                initial={false}
                animate={{ opacity: edges.start ? 1 : 0 }}
                transition={FADE}
                className={cn(
                  "pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r",
                  own ? "from-primary" : "from-surface-2",
                  "to-transparent",
                )}
              />
              <motion.span
                aria-hidden
                initial={false}
                animate={{ opacity: edges.end ? 1 : 0 }}
                transition={FADE}
                className={cn(
                  "pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l",
                  own ? "from-primary" : "from-surface-2",
                  "to-transparent",
                )}
              />
            </div>

            <motion.div
              initial={false}
              animate={{
                height: open === null ? 0 : (viewerHeight ?? "auto"),
              }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.move }
              }
              className="overflow-hidden"
            >
              <div ref={viewerRef}>
                <AnimatePresence initial={false}>
                  {active && open !== null ? (
                    <motion.div
                      key="viewer"
                      role="group"
                      aria-label={`Picture ${cursor + 1} of ${count}: ${active.caption}`}
                      onKeyDown={onViewerKeys}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={FADE}
                      className="pt-2"
                    >
                      {/* The viewer keeps its own surface, so its text reads
                          on an own bubble's primary field as well as a peer's. */}
                      <div className="flex flex-col gap-2 rounded-2 border border-hairline bg-surface-0 p-2 text-foreground">
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2 border border-hairline bg-surface-1">
                          <AnimatePresence initial={false}>
                            <motion.span
                              key={active.id}
                              initial={
                                motionSafe
                                  ? {
                                      opacity: 0,
                                      x: direction * distances.nudge,
                                    }
                                  : { opacity: 0 }
                              }
                              animate={{ opacity: 1, x: 0 }}
                              exit={{
                                opacity: 0,
                                transition: exitFor(durations.fast),
                              }}
                              transition={motionSafe ? springs.snap : FADE}
                              className="absolute inset-0"
                            >
                              <Quay
                                seed={active.seed}
                                gradientId={`${baseId}-view-${active.id}`}
                              />
                            </motion.span>
                          </AnimatePresence>
                        </div>

                        <div className="flex items-center gap-2">
                          <ArrowButton
                            label="Previous picture"
                            disabled={cursor <= 0}
                            onPress={() => moveTo(cursor - 1, false)}
                          >
                            <path d="M10 3.5 5.5 8l4.5 4.5" />
                          </ArrowButton>
                          <ArrowButton
                            label="Next picture"
                            disabled={cursor >= count - 1}
                            onPress={() => moveTo(cursor + 1, false)}
                          >
                            <path d="m6 3.5 4.5 4.5L6 12.5" />
                          </ArrowButton>
                          <span className="min-w-0 flex-1 truncate text-xs text-ink-2">
                            {active.caption}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                            {cursor + 1}/{count}
                          </span>
                          <button
                            type="button"
                            onClick={close}
                            className={cn(
                              "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none",
                              "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-cobalt-wash",
                            )}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          <span className="flex items-center gap-1.5 px-1 text-[11px] text-ink-3">
            <span>
              {own ? "You" : peerName} · {count} pictures
            </span>
            {time ? <span className="tabular-nums">{time}</span> : null}
          </span>
        </li>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.message}
      </span>
    </div>
  );
}
