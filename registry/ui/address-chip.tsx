"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AddressChipProps = {
  ref?: React.Ref<HTMLSpanElement>;
  /** The full address. Copied verbatim — the clipboard never gets the abbreviation. */
  address: string;
  /** Characters kept before the collapsed middle. @default 6 */
  head?: number;
  /** Characters kept after it. @default 4 */
  tail?: number;
  /** Names the chip for assistive technology. @default "Address" */
  label?: string;
  /** Forces the middle open (or shut) regardless of hover and focus. */
  expanded?: boolean;
  /** Fires from the hover, focus, or Escape that changed the middle's state. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Fires from the copy press once the clipboard has answered. */
  onCopy?: (address: string, ok: boolean) => void;
  className?: string;
};

/** How long the stamp sits over the chip before it lifts. */
const STAMP_MS = 1200;

/**
 * An address written the way people actually check one: head, a middle nobody
 * reads, tail. The middle is a real zero-width box, not an ellipsis standing in
 * for one — its natural width is measured by a ResizeObserver on the inner run
 * and handed back as a `width` target on `glide`, because an element making
 * room for more of itself is a layout shift and layout shifts glide. Hover or
 * focus opens it; the three dots close as the characters arrive.
 *
 * Nothing is reserved and nothing overhangs: the address lives in its own
 * `overflow-x-auto` strip with edge fades, so an address longer than the card
 * scrolls inside the chip rather than pushing the page sideways.
 *
 * The chip is one real button that copies the whole address — never the
 * abbreviation — with the full string in its `aria-label` so a screen reader
 * never has to reconstruct the middle. Enter or Space copies, Escape shuts the
 * middle without giving up focus. Copying draws a tick on `flick` and stamps a
 * pill over the chip on `recoil`; a refused clipboard says so instead of
 * pretending. Under reduced motion the middle appears at full width and the
 * stamp fades in square, because that the clipboard took it is information.
 */
export function AddressChip({
  ref,
  address,
  head = 6,
  tail = 4,
  label = "Address",
  expanded,
  onExpandedChange,
  onCopy,
  className,
}: AddressChipProps) {
  const motionSafe = useMotionSafe();
  const [hover, setHover] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [copy, setCopy] = React.useState<"idle" | "done" | "failed">("idle");
  const [middleWidth, setMiddleWidth] = React.useState(0);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const middleRef = React.useRef<HTMLSpanElement | null>(null);
  const scrollerRef = React.useRef<HTMLSpanElement | null>(null);
  const reportedRef = React.useRef(false);

  const isControlled = expanded !== undefined;
  const open = isControlled ? expanded : (hover || focused) && !dismissed;

  const headText = address.slice(
    0,
    Math.max(0, Math.min(head, address.length)),
  );
  const tailCount = Math.max(
    0,
    Math.min(tail, address.length - headText.length),
  );
  const tailText =
    tailCount > 0 ? address.slice(address.length - tailCount) : "";
  const middleText = address.slice(headText.length, address.length - tailCount);

  // The inner run is sized by its own content, so it keeps reporting the width
  // the middle would need even while the box around it is clipped to zero.
  React.useEffect(() => {
    const node = middleRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setMiddleWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [middleText]);

  // Fades only where there is more address to reach; measuring from the
  // observer keeps the first paint honest without reading layout in render.
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
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (copy === "idle") return;
    const timer = window.setTimeout(() => setCopy("idle"), STAMP_MS);
    return () => window.clearTimeout(timer);
  }, [copy]);

  /** Reports from the handler that caused the change — never from render. */
  const report = (next: {
    hover?: boolean;
    focused?: boolean;
    dismissed?: boolean;
  }) => {
    if (next.hover !== undefined) setHover(next.hover);
    if (next.focused !== undefined) setFocused(next.focused);
    if (next.dismissed !== undefined) setDismissed(next.dismissed);
    if (isControlled) return;
    const nextOpen =
      ((next.hover ?? hover) || (next.focused ?? focused)) &&
      !(next.dismissed ?? dismissed);
    if (nextOpen === reportedRef.current) return;
    reportedRef.current = nextOpen;
    onExpandedChange?.(nextOpen);
  };

  const runCopy = () => {
    const clipboard =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      setCopy("failed");
      onCopy?.(address, false);
      return;
    }
    clipboard.writeText(address).then(
      () => {
        setCopy("done");
        onCopy?.(address, true);
      },
      () => {
        setCopy("failed");
        onCopy?.(address, false);
      },
    );
  };

  // Reduced motion gets an instant swap rather than a shorter glide: the
  // middle is either there or not, and a width that still travels is a travel.
  const glide = motionSafe ? springs.glide : { duration: 0 };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <span
      ref={ref}
      className={cn("inline-flex max-w-full min-w-0 flex-col", className)}
    >
      <button
        type="button"
        aria-label={`Copy ${label} ${address}`}
        onClick={runCopy}
        onPointerEnter={() => report({ hover: true })}
        onPointerLeave={() => report({ hover: false, dismissed: false })}
        onFocus={() => report({ focused: true })}
        onBlur={() => report({ focused: false, dismissed: false })}
        onKeyDown={(event) => {
          // Only swallow Escape when there is a middle to shut, so the chip
          // never eats the key a surrounding dialog is waiting for.
          if (event.key !== "Escape" || !open) return;
          event.preventDefault();
          event.stopPropagation();
          report({ dismissed: true });
        }}
        className={cn(
          "relative flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-2 border border-input bg-surface-1 py-0 pr-1.5 pl-2.5 text-left transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span aria-hidden className="relative min-w-0 flex-1">
          <span
            ref={scrollerRef}
            className="block overflow-x-auto overflow-y-hidden"
          >
            <span className="flex w-max items-center font-mono text-[11px] whitespace-pre text-foreground tabular-nums">
              {headText}
              <motion.span
                className="inline-block overflow-hidden"
                initial={false}
                animate={{ width: open ? middleWidth : 0 }}
                transition={glide}
              >
                <span ref={middleRef} className="inline-block w-max">
                  {middleText}
                </span>
              </motion.span>
              {middleText.length > 0 ? (
                <motion.span
                  className="inline-block overflow-hidden text-ink-3"
                  initial={false}
                  animate={{
                    width: open ? "0em" : "1.5em",
                    opacity: open ? 0 : 1,
                  }}
                  transition={{ ...glide, opacity: fade }}
                >
                  <span className="inline-block w-max">…</span>
                </motion.span>
              ) : null}
              {tailText}
            </span>
          </span>

          {edges.start ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-linear-to-r from-surface-1 to-surface-1/0"
            />
          ) : null}
          {edges.end ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-linear-to-l from-surface-1 to-surface-1/0"
            />
          ) : null}
        </span>

        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center text-ink-3"
        >
          <motion.svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            className="col-start-1 row-start-1 size-4"
            initial={false}
            animate={{ opacity: copy === "done" ? 0 : 1 }}
            transition={fade}
          >
            <rect x="5.25" y="5.25" width="8" height="8" rx="1.6" />
            <path d="M10.75 2.75h-8v8" strokeLinecap="round" />
          </motion.svg>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="col-start-1 row-start-1 size-4 text-success"
          >
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              initial={false}
              animate={{ pathLength: copy === "done" ? 1 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        </span>

        {/* The stamp covers the chip it belongs to: nothing in the row moves
            and no sibling is overlapped while it sits there. */}
        <AnimatePresence>
          {copy === "idle" ? null : (
            <motion.span
              key={copy}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 rounded-2 border bg-surface-0 text-[11px] font-medium",
                copy === "done"
                  ? "border-success text-success"
                  : "border-warn text-warn",
              )}
              initial={
                motionSafe
                  ? { scale: 1.25, rotate: -3, opacity: 0 }
                  : { opacity: 0 }
              }
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      ...springs.recoil,
                      opacity: { duration: durations.blink },
                    }
                  : { duration: durations.fast }
              }
            >
              {copy === "done" ? "Copied" : "Copy blocked"}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <span role="status" className="sr-only">
        {copy === "done"
          ? `${label} copied`
          : copy === "failed"
            ? "Copy blocked — select the address and copy it manually"
            : ""}
      </span>
    </span>
  );
}
