"use client";

import * as React from "react";

import { motion, useInView } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const HIDDEN = { opacity: 0.4, y: 6, filter: "blur(8px)" };
const VISIBLE = { opacity: 1, y: 0, filter: "blur(0px)" };

export type FocusTextProps = {
  /** The copy to resolve. Plain string only — it is split into units. */
  children: string;
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3" | "h4";
  by?: "word" | "char";
  trigger?: "inView" | "mount";
  /** Play once (default) or re-blur when the block scrolls back out. */
  once?: boolean;
  /** Seconds between units. Defaults to cascade(count) under the 600ms budget. */
  stagger?: number;
  /** Seconds before the first unit starts resolving. */
  startDelay?: number;
  className?: string;
};

/**
 * Copy that resolves under the lens: each unit starts blurred (8px), dimmed,
 * and 6px low, then focus-pulls to sharp — position springs on `glide` while
 * blur and opacity tween on `enter` — cascading across words or characters
 * within the 600ms choreography budget. Screen readers get the clean string;
 * reduced motion fades the whole block in one fast step.
 */
export function FocusText({
  children,
  as = "span",
  by = "word",
  trigger = "inView",
  once = true,
  stagger,
  startDelay = 0,
  className,
}: FocusTextProps) {
  const motionSafe = useMotionSafe();
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once, margin: "-10%" });
  const started = trigger === "mount" ? true : inView;

  // Tokens keep their whitespace; each animated token knows the index of its
  // first unit so delays stay a pure function of position.
  const { parts, unitCount } = React.useMemo(() => {
    const tokens = children.split(/(\s+)/);
    const split: { token: string; position: number; start: number }[] = [];
    let index = 0;
    for (let position = 0; position < tokens.length; position += 1) {
      const token = tokens[position] ?? "";
      if (token.trim() === "") {
        split.push({ token, position, start: -1 });
        continue;
      }
      split.push({ token, position, start: index });
      index += by === "char" ? Array.from(token).length : 1;
    }
    return { parts: split, unitCount: index };
  }, [children, by]);
  const stepDelay = stagger ?? cascade(unitCount);

  const transitionFor = (index: number) => {
    // Un-resolving (scrolled back out with once={false}) is an exit: tween out.
    if (!started) return exitFor(durations.base);
    const delay = startDelay + index * stepDelay;
    const tween = { duration: durations.base, ease: easings.enter, delay };
    return { ...springs.glide, delay, opacity: tween, filter: tween };
  };

  const renderUnit = (text: string, key: React.Key, index: number) => (
    <motion.span
      key={key}
      className="inline-block"
      initial={HIDDEN}
      animate={started ? VISIBLE : HIDDEN}
      transition={transitionFor(index)}
    >
      {text}
    </motion.span>
  );

  const content = parts.map(({ token, position, start }) => {
    // Whitespace stays plain text so the browser can wrap lines naturally.
    if (start === -1) return token;
    if (by === "word") return renderUnit(token, `w${position}`, start);
    return (
      <span key={`w${position}`} className="inline-block">
        {Array.from(token).map((ch, c) => renderUnit(ch, c, start + c))}
      </span>
    );
  });

  return React.createElement(
    as,
    { ref, className: cn(className) },
    <span key="sr" className="sr-only">
      {children}
    </span>,
    motionSafe ? (
      <span key="units" aria-hidden>
        {content}
      </span>
    ) : (
      <motion.span
        key="fade"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: started ? 1 : 0 }}
        transition={{ duration: durations.fast, ease: easings.enter }}
      >
        {children}
      </motion.span>
    ),
  );
}
