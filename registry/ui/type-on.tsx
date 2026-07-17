"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TypeOnProps = {
  /** The line to type. Changing it de-types the old line, then types the new. */
  text: string;
  /** Characters per second. @default 26 */
  speed?: number;
  /** Wrapper element. @default "p" */
  as?: "span" | "p" | "h2" | "h3";
  /** The blinking caret. @default true */
  caret?: boolean;
  className?: string;
};

/**
 * A line that types itself out behind a caret, and un-types when it is replaced.
 * One motion value holds the revealed length; the shown substring is derived
 * from it, so the whole run costs a single React render no matter how long the
 * line — the characters appear straight off the animation loop. Swapping the
 * `text` backspaces the old line to nothing and types the new one in its place.
 *
 * The full line is always present for assistive tech and search; only the
 * visible, animated copy is aria-hidden, so a screen reader is never fed one
 * character at a time. Reduced motion prints the whole line at once with a
 * steady caret and no typing.
 */
export function TypeOn({
  text,
  speed = 26,
  as = "p",
  caret = true,
  className,
}: TypeOnProps) {
  const motionSafe = useMotionSafe();
  const count = useMotionValue(motionSafe ? 0 : text.length);
  const displayRef = React.useRef(text);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const shown = useTransform(count, (c) =>
    displayRef.current.slice(0, Math.round(c)),
  );

  React.useEffect(() => {
    if (!motionSafe) {
      displayRef.current = text;
      count.set(text.length);
      return;
    }
    let cancelled = false;
    controlsRef.current?.stop();
    // Backspace the old line (a touch faster than typing), then type the new.
    const untype = animate(count, 0, {
      duration: Math.max(0.02, displayRef.current.length / (speed * 2.2)),
      ease: easings.linear,
    });
    controlsRef.current = untype;
    untype.then(() => {
      if (cancelled) return;
      displayRef.current = text;
      controlsRef.current = animate(count, text.length, {
        duration: Math.max(0.02, text.length / speed),
        ease: easings.linear,
      });
    });
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [text, speed, motionSafe, count]);

  const Tag = as;

  return (
    <Tag className={cn("inline-flex items-baseline", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex items-baseline">
        <motion.span>{shown}</motion.span>
        {caret && (
          <motion.span
            className="bg-current ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.12em]"
            animate={motionSafe ? { opacity: [1, 1, 0, 0] } : { opacity: 1 }}
            transition={
              motionSafe
                ? { duration: 1, ease: easings.linear, repeat: Infinity }
                : { duration: 0 }
            }
          />
        )}
      </span>
    </Tag>
  );
}
