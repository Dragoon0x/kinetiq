"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FitPanelProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The content. Change `contentKey` to swap it. */
  children: React.ReactNode;
  /** Identifies the current content; a new value swaps the panel. */
  contentKey: string;
  /** Fires with each freshly measured height, in pixels. */
  onHeightChange?: (height: number) => void;
  /** Outer classes. Padding belongs on the content, not here. */
  className?: string;
};

/**
 * A container that is exactly as tall as what is inside it. Swap the content —
 * change `contentKey` — and the outgoing copy fades away on the exit ease, the
 * incoming fades in, and the box glides between the two measured heights on
 * `glide`, the spring for a layout finding its new size. Nothing below the
 * panel jumps, and nothing above it is held open by a reserve.
 *
 * The height is never guessed and never reserved: a ResizeObserver rides the
 * mounted content, so a list that grows in place, a font that loads late or an
 * image that finally decodes all carry the panel with them. The observer is
 * attached by the callback ref rather than an effect, because with a waiting
 * exit the content node is replaced after the key has already changed — an
 * effect keyed on the content would still be watching the node that left.
 *
 * The panel adds no semantics of its own: whatever role the content needs, it
 * brings. Under reduced motion the height simply becomes the new height and
 * the content swaps, since the content is the information.
 */
export function FitPanel({
  ref,
  children,
  contentKey,
  onHeightChange,
  className,
}: FitPanelProps) {
  const motionSafe = useMotionSafe();
  const [height, setHeight] = React.useState<number | null>(null);

  const observerRef = React.useRef<ResizeObserver | null>(null);
  const lastRef = React.useRef<number | null>(null);
  const changeRef = React.useRef(onHeightChange);
  React.useEffect(() => {
    changeRef.current = onHeightChange;
  }, [onHeightChange]);

  React.useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );

  const measure = React.useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      const next = Math.round(
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
      );
      if (lastRef.current === next) return;
      lastRef.current = next;
      setHeight(next);
      // Reported from the observer, not from inside an updater — an updater
      // can run during render, and a parent setState there is a crash.
      changeRef.current?.(next);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={false}
      // Before the first measurement the box is simply its content's size, so
      // the very first paint is never a collapsed panel.
      animate={{ height: motionSafe && height !== null ? height : "auto" }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className={cn("relative overflow-hidden", className)}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={contentKey}
          ref={measure}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.base) }}
          transition={{
            duration: motionSafe ? durations.base : durations.fast,
            ease: easings.enter,
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
