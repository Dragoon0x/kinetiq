"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ReadAlongCursor = "underline" | "caret" | "none";
export type ReadAlongPace = "length" | "even";
export type ReadAlongElement = "p" | "div" | "span" | "h2" | "h3" | "h4";

export type ReadAlongProps = {
  /** The paragraph. It stays real text, read and copied in order. */
  text: string;
  /** The element the paragraph renders as. @default "p" */
  as?: ReadAlongElement;
  /** How faint unread words are, as opacity 0 to 1. @default 0.2 */
  faint?: number;
  /** Where reading ends, as a share of the viewport's height below `start`: the paragraph is read once its bottom edge has risen to `start − range`. 0.1 to 1. @default 0.5 */
  range?: number;
  /** Where reading begins: the paragraph's top at this fraction of the viewport's height from its top. @default 0.85 */
  start?: number;
  /** What marks the reading position: a soft underline drawn through the word, a caret, or nothing. @default "underline" */
  cursor?: ReadAlongCursor;
  /** The cursor's colour. @default "var(--accent-bright)" */
  cursorColor?: string;
  /** How many characters the darkening front is spread over. @default 8 */
  softness?: number;
  /** Whether a long word takes longer to read (`length`) or every word the same (`even`). @default "length" */
  pace?: ReadAlongPace;
  /** Glide the reading position between scroll events. @default true */
  smooth?: boolean;
  /** Drive the reading yourself, 0 to 1; overrides scrolling. */
  progress?: number;
  /** The scroll container to read; defaults to the nearest scrollable ancestor, or the window. */
  scrollContainer?: React.RefObject<HTMLElement | null>;
  /** How far through the paragraph reading is, 0 to 1 in steps of 0.01, as it changes. */
  onProgressChange?: (progress: number) => void;
  /** The word being read changed: its index among the paragraph's words. Also reported on arrival. */
  onWordChange?: (index: number) => void;
  /** The paragraph has been read to its end (again). */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The nearest ancestor that scrolls vertically, or null for the window. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if (
      overflow === "auto" ||
      overflow === "scroll" ||
      overflow === "overlay"
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

type Word = {
  text: string;
  /** Where the word starts and how long it takes, in reading units. */
  at: number;
  span: number;
};

type Box = { left: number; top: number; width: number; height: number };

function wordsOf(text: string, pace: ReadAlongPace) {
  const tokens = text.split(/\s+/).filter((w) => w.length > 0);
  const words: Word[] = [];
  let at = 0;
  for (const token of tokens) {
    const span = pace === "even" ? 4 : Array.from(token).length;
    words.push({ text: token, at, span });
    // The space after a word is part of reading it.
    at += span + 1;
  }
  return { words, total: Math.max(1, at - 1) };
}

/** The word the front is in (or the last one it has passed). */
function wordAt(words: Word[], front: number): number {
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((words[mid]?.at ?? 0) <= front) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function ReadWord({
  word,
  front,
  faint,
  soft,
  bind,
}: {
  word: Word;
  front: MotionValue<number>;
  faint: number;
  soft: number;
  bind: (node: HTMLSpanElement | null) => void;
}) {
  const opacity = useTransform(front, (f) =>
    r3(faint + (1 - faint) * clamp01((f - word.at) / (word.span + soft))),
  );
  return (
    // Whole words only: a hyphenated word never splits across two lines.
    <motion.span ref={bind} className="whitespace-nowrap" style={{ opacity }}>
      {word.text}
    </motion.span>
  );
}

type Api = {
  read: () => void;
  measure: () => void;
  place: (f: number) => void;
};

/**
 * Scroll-reveal for long paragraphs. Every word starts in faint ink and the
 * words darken in reading order as the paragraph scrolls past the reading
 * line, a long word taking longer than a short one; the front is spread over a
 * few characters, so two or three words are always on their way. The reading
 * position glides on the glide spring between scroll events, so a wheel notch
 * never jumps and scrolling back reverses it just as smoothly.
 *
 * A soft underline draws itself through the word being read — its head is
 * the reading position, its tail follows the word's start on glide, so
 * between words it slides on like a finger under the line — or a caret marks
 * the position instead. Progress is read from the nearest scroll container (or
 * the window, or `scrollContainer`) only while the paragraph is near view;
 * `progress` drives it directly. The words stay real text in order, read and
 * copied as written. Under reduced motion the position does not glide and the
 * underline does not slide; the words still darken with the scroll.
 */
export function ReadAlong({
  text,
  as = "p",
  faint = 0.2,
  range = 0.5,
  start = 0.85,
  cursor = "underline",
  cursorColor = "var(--accent-bright)",
  softness = 8,
  pace = "length",
  smooth = true,
  progress,
  scrollContainer,
  onProgressChange,
  onWordChange,
  onComplete,
  className,
}: ReadAlongProps) {
  const motionSafe = useMotionSafe();
  const { words, total } = React.useMemo(
    () => wordsOf(text, pace),
    [text, pace],
  );
  const raw = useMotionValue(clamp01(progress ?? 0));
  const glided = useSpring(raw, springs.glide);
  const gliding = smooth && motionSafe;
  const level = gliding ? glided : raw;
  const front = useTransform(level, (p) => r3(clamp01(p) * total));

  const headX = useMotionValue(0);
  const tailX = useMotionValue(0);
  const lineY = useMotionValue(0);
  const lineH = useMotionValue(0);
  const shown = useMotionValue(0);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const wordNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const boxes = React.useRef<(Box | null)[]>([]);
  const reading = React.useRef(-1);
  const sliding = React.useRef<AnimationPlaybackControls | null>(null);
  const reported = React.useRef({ progress: -1, word: -1, done: false });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onProgressChange, onWordChange, onComplete });

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
  }, []);

  /** The cursor at a reading position: under the word it is in. */
  const place = (f: number) => {
    const i = wordAt(words, f);
    const word = words[i];
    const box = boxes.current[i];
    if (!word || !box) return;
    const u = clamp01((f - word.at) / word.span);
    headX.set(r2(box.left + box.width * u));
    const prev = boxes.current[reading.current];
    if (i !== reading.current) {
      const newLine = !prev || Math.abs(prev.top - box.top) > box.height / 2;
      sliding.current?.stop();
      if (newLine || !gliding) {
        tailX.jump(r2(box.left));
      } else {
        sliding.current = animate(tailX, r2(box.left), springs.glide);
      }
      lineY.set(r2(box.top));
      lineH.set(r2(box.height));
      reading.current = i;
      if (reported.current.word !== i) {
        reported.current.word = i;
        report.current.onWordChange?.(i);
      }
    }
    // In over the first characters, out over the last: nothing marks a
    // paragraph that is not being read.
    shown.set(r3(clamp01(f / 2) * clamp01((total - f) / 3)));
  };

  const settle = (p: number) => {
    const value = r3(clamp01(p));
    raw.set(value);
    const step = Math.round(value * 100) / 100;
    if (step !== reported.current.progress) {
      reported.current.progress = step;
      report.current.onProgressChange?.(step);
    }
    if (value >= 1 && !reported.current.done) {
      reported.current.done = true;
      report.current.onComplete?.();
    } else if (value < 1) {
      reported.current.done = false;
    }
  };

  const read = () => {
    if (progress !== undefined) {
      settle(progress);
      return;
    }
    const node = rootRef.current;
    if (!node) return;
    const container = scrollContainer?.current ?? scrollParent(node);
    const box = node.getBoundingClientRect();
    let top = 0;
    let height = window.innerHeight;
    if (container) {
      const view = container.getBoundingClientRect();
      top = view.top + container.clientTop;
      height = container.clientHeight;
    }
    if (height <= 0) return;
    // Read from the moment the top reaches the start line until the bottom
    // reaches the end line, so a long paragraph takes longer than a short one.
    settle(
      (clamp01(start) * height - (box.top - top)) /
        (clamp(range, 0.1, 1) * height + box.height),
    );
  };

  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    boxes.current = words.map((_, i) => {
      const node = wordNodes.current.get(i);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {
        left: r.left - rect.left - root.clientLeft,
        top: r.top - rect.top - root.clientTop,
        width: r.width,
        height: r.height,
      };
    });
    reading.current = -1;
    place(front.get());
  };

  React.useLayoutEffect(() => {
    api.current = { read, measure, place };
    report.current = { onProgressChange, onWordChange, onComplete };
  });

  // The cursor follows the front, wherever the front is coming from.
  React.useEffect(
    () => front.on("change", (f) => api.current?.place(f)),
    [front],
  );

  // Scroll, resize and the paragraph coming near view re-read the position;
  // far from view the listener does no work.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || progress !== undefined) return;
    const container = scrollContainer?.current ?? scrollParent(node);
    let near = false;
    const onScroll = () => {
      if (near) api.current?.read();
    };
    const target: HTMLElement | Window = container ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        near = Boolean(entry?.isIntersecting);
        api.current?.read();
      },
      { root: container, rootMargin: "25% 0px" },
    );
    watcher.observe(node);
    const sizer = new ResizeObserver(() => {
      api.current?.measure();
      api.current?.read();
    });
    sizer.observe(node);
    if (container) sizer.observe(container);
    void document.fonts?.ready.then(() => api.current?.measure());
    api.current?.read();
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      watcher.disconnect();
      sizer.disconnect();
    };
  }, [scrollContainer, progress]);

  React.useEffect(() => {
    api.current?.read();
  }, [progress, range, start]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [words]);

  React.useEffect(() => {
    const s = sliding;
    return () => s.current?.stop();
  }, []);

  const bindWord = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) wordNodes.current.set(i, node);
    else wordNodes.current.delete(i);
  };

  const width = useTransform(
    [headX, tailX] as MotionValue<number>[],
    ([h = 0, t = 0]: number[]) => r2(Math.max(0, h - t)),
  );
  const underlineY = useTransform(
    [lineY, lineH] as MotionValue<number>[],
    ([y = 0, h = 0]: number[]) => r2(y + h - 2),
  );
  const caretX = useTransform(headX, (x) => r2(x - 1));
  const opacity = useTransform(shown, (v) => r3(v));

  const soft = Math.max(0.5, softness);
  const ink = clamp01(faint);
  const Tag = as;

  return (
    <Tag ref={bindRoot} className={cn("relative", className)}>
      {words.map((word, i) => (
        <React.Fragment key={i}>
          {i > 0 ? " " : null}
          <ReadWord
            word={word}
            front={front}
            faint={ink}
            soft={soft}
            bind={bindWord(i)}
          />
        </React.Fragment>
      ))}
      {cursor === "underline" ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 h-[max(2px,0.09em)] rounded-full"
          style={{
            x: tailX,
            y: underlineY,
            width,
            opacity,
            backgroundImage: `linear-gradient(to right, color-mix(in oklab, ${cursorColor} 0%, transparent), color-mix(in oklab, ${cursorColor} 55%, transparent) 55%, ${cursorColor})`,
          }}
        />
      ) : cursor === "caret" ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 w-[2px] rounded-full"
          style={{
            x: caretX,
            y: lineY,
            height: lineH,
            opacity,
            backgroundColor: cursorColor,
          }}
        />
      ) : null}
    </Tag>
  );
}
