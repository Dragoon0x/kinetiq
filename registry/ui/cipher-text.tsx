"use client";

import * as React from "react";

import { motion, useInView } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const DEFAULT_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·-";

/** Noise runs this long before the first character locks in. */
const LEAD_IN_MS = 200;

/** djb2 — deterministic per text + cell, so SSR and client agree on every glyph. */
const djb2 = (input: string): number => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(hash, 33) + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
};

type CipherCell = { char: string; cell: number; seed: number };

type CipherPart = {
  token: string;
  position: number;
  /** null marks whitespace, kept as plain text so lines wrap naturally. */
  cells: CipherCell[] | null;
};

type ScrambleFrame = {
  /** Which run produced this frame; 0 means no run has started. */
  run: number;
  /** Shared scramble clock — every unlocked cell indexes the charset by it. */
  tick: number;
  /** How many cells (in lock order) have locked to their true glyph. */
  resolved: number;
  /** The text this frame was computed for — frames for stale text are ignored. */
  text: string;
};

const IDLE_FRAME: ScrambleFrame = { run: 0, tick: 0, resolved: 0, text: "" };

export type CipherTextProps = Omit<
  React.ComponentPropsWithoutRef<"span">,
  "children"
> & {
  /** The copy to resolve. Plain string only — it is split into cells. */
  children: string;
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3" | "h4";
  /** Glyph pool unlocked cells cycle through. */
  charset?: string;
  /**
   * "inView" scrambles once when scrolled into view (default), "mount"
   * scrambles immediately, "hover" re-scrambles on every pointerenter/focus.
   */
  trigger?: "inView" | "mount" | "hover";
  /** Lock-in sequence: left-to-right, or shuffled by a content hash. */
  order?: "ltr" | "random";
  /** Milliseconds per scramble tick (min 16). */
  speed?: number;
};

/**
 * Characters lock in from the noise. On trigger every cell cycles through a
 * charset on one shared time-based rAF clock (~30ms/tick), then locks to its
 * true glyph in sequence — `cascade(n)` intervals keep the whole resolve
 * inside the 600ms budget after a ~200ms lead-in — and each lock flashes
 * `var(--signal, var(--primary))`, fading back over `durations.fast`. Every
 * scramble glyph derives from a djb2 hash of text + cell + tick, so the
 * sequence is deterministic; SSR and no-JS render the finished text, and
 * screen readers only ever see the clean string. The clock pauses while the
 * document is hidden. Reduced motion swaps the scramble for one fast fade
 * (and hover does nothing).
 */
export function CipherText({
  children,
  as = "span",
  charset = DEFAULT_CHARSET,
  trigger = "inView",
  order = "ltr",
  speed = 30,
  className,
  onPointerEnter,
  onFocus,
  ...props
}: CipherTextProps) {
  const motionSafe = useMotionSafe();
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });

  // Cells carry their scramble seed; whitespace stays plain text.
  const { parts, total } = React.useMemo(() => {
    const tokens = children.split(/(\s+)/);
    const list: CipherPart[] = [];
    let cellIndex = 0;
    for (let position = 0; position < tokens.length; position += 1) {
      const token = tokens[position] ?? "";
      if (token === "") continue;
      if (token.trim() === "") {
        list.push({ token, position, cells: null });
        continue;
      }
      const cells = Array.from(token).map((char) => {
        const cell = cellIndex;
        cellIndex += 1;
        return { char, cell, seed: djb2(`${children}:${cell}`) };
      });
      list.push({ token, position, cells });
    }
    return { parts: list, total: cellIndex };
  }, [children]);

  const glyphs = React.useMemo(() => Array.from(charset), [charset]);

  // "random" locks in hash-shuffled order; identical on server and client.
  const lockRank = React.useMemo(() => {
    if (order !== "random") return null;
    const sorted = Array.from({ length: total }, (_, cell) => cell).sort(
      (a, b) => {
        const ha = djb2(`${children}@${a}`);
        const hb = djb2(`${children}@${b}`);
        return ha === hb ? a - b : ha - hb;
      },
    );
    const ranks = Array.from({ length: total }, () => 0);
    sorted.forEach((cell, position) => {
      ranks[cell] = position;
    });
    return ranks;
  }, [children, order, total]);

  const [frame, setFrame] = React.useState<ScrambleFrame>(IDLE_FRAME);
  const [manualRuns, setManualRuns] = React.useState(0);

  const autoArmed =
    trigger === "mount" || (trigger === "inView" && inView) ? 1 : 0;
  const runKey = manualRuns + autoArmed;

  // One shared clock per run: elapsed time (not frames) drives both the
  // scramble tick and the lock count, and stalls while the tab is hidden.
  React.useEffect(() => {
    if (!motionSafe || runKey === 0 || total === 0) return;
    const tickMs = Math.max(16, speed);
    const lockMs = cascade(total) * 1000;
    let raf = 0;
    let last: number | null = null;
    let elapsed = 0;
    let settled = false;

    const step = (now: number) => {
      raf = 0;
      if (last !== null) elapsed += now - last;
      last = now;
      const tick = Math.floor(elapsed / tickMs);
      const resolved =
        elapsed < LEAD_IN_MS
          ? 0
          : Math.min(total, Math.floor((elapsed - LEAD_IN_MS) / lockMs) + 1);
      setFrame((previous) =>
        previous.run === runKey &&
        previous.tick === tick &&
        previous.resolved === resolved &&
        previous.text === children
          ? previous
          : { run: runKey, tick, resolved, text: children },
      );
      if (resolved >= total) {
        settled = true;
        return;
      }
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (settled || raf) return;
      last = null;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motionSafe, runKey, total, speed, children]);

  // Frames from an earlier text (or before any run) read as "all locked".
  const active = frame.run > 0 && frame.text === children ? frame : null;

  const rescramble = () => {
    if (!motionSafe || trigger !== "hover") return;
    setManualRuns((count) => count + 1);
  };
  const handlePointerEnter = (event: React.PointerEvent<HTMLSpanElement>) => {
    onPointerEnter?.(event);
    rescramble();
  };
  const handleFocus = (event: React.FocusEvent<HTMLSpanElement>) => {
    onFocus?.(event);
    rescramble();
  };

  const renderCell = ({ char, cell, seed }: CipherCell) => {
    const rank = lockRank === null ? cell : (lockRank[cell] ?? cell);
    const locked = active === null || rank < active.resolved;
    const glyph =
      locked || glyphs.length === 0
        ? char
        : (glyphs[(seed + active.tick) % glyphs.length] ?? char);
    return (
      <span
        key={cell}
        className={cn(
          "relative inline-block",
          !locked && "text-muted-foreground",
        )}
      >
        {glyph}
        {/* Lock pulse: the true glyph lands in signal, then hands back. */}
        {active !== null && locked && (
          <motion.span
            key={active.run}
            className="pointer-events-none absolute inset-0"
            style={{ color: "var(--signal, var(--primary))" }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.fast, ease: easings.exit }}
          >
            {char}
          </motion.span>
        )}
      </span>
    );
  };

  const content = parts.map((part) =>
    part.cells === null ? (
      part.token
    ) : (
      <span key={`w${part.position}`} className="inline-block">
        {part.cells.map(renderCell)}
      </span>
    ),
  );

  return React.createElement(
    as,
    {
      ...props,
      ref,
      className: cn("font-mono tabular-nums", className),
      onPointerEnter: handlePointerEnter,
      onFocus: handleFocus,
    },
    <span key="sr" className="sr-only">
      {children}
    </span>,
    motionSafe ? (
      <span key="cipher" aria-hidden>
        {content}
      </span>
    ) : (
      <motion.span
        key="fade"
        aria-hidden
        initial={{ opacity: trigger === "hover" ? 1 : 0 }}
        animate={{ opacity: trigger === "hover" || runKey > 0 ? 1 : 0 }}
        transition={{ duration: durations.fast, ease: easings.enter }}
      >
        {children}
      </motion.span>
    ),
  );
}
