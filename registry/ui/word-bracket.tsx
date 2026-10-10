"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WordBracketElement =
  "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";

export type WordBracketProps = {
  /** The sentence. Read once by assistive technology, and copied as written. */
  text: string;
  /** The element the sentence renders as. @default "p" */
  as?: WordBracketElement;
  /** How long the frame rests on each word, ms. @default 1600 */
  interval?: number;
  /** How soft the words outside the frame are, px of blur. @default 3 */
  blur?: number;
  /** The opacity of the words outside the frame, 0 to 1. @default 0.4 */
  dim?: number;
  /** The brackets' colour, any CSS colour. @default "var(--accent-bright)" */
  frame?: string;
  /** How far the frame's trailing edge lags its leading edge on a hop, 0 (rigid) to 1 (a long stretch). @default 0.5 */
  lag?: number;
  /** Each bracket's arm, em. @default 0.3 */
  cornerSize?: number;
  /** Each bracket's stroke, px. @default 2 */
  thickness?: number;
  /** Room between the word and its frame, em. @default 0.14 */
  padding?: number;
  /** The shortest word, in letters, the cycle lands on; hover and keys reach any word. @default 1 */
  minLength?: number;
  /** The focused word, as its index among the sentence's words (controlled). */
  index?: number;
  /** The first focused word when uncontrolled. @default the first word the cycle lands on */
  defaultIndex?: number;
  /** The frame moved to a word: the cycle, the pointer or a key chose it. Also reported on arrival. */
  onIndexChange?: (index: number) => void;
  /** Hold the frame where it is. @default false */
  paused?: boolean;
  /** Wrap from the last word back to the first. @default true */
  loop?: boolean;
  /** Hovering a word, tapping it or the arrow keys take the frame; the cycle resumes after. @default true */
  hoverControl?: boolean;
  /** The cycle reached the last word (only without `loop`). */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** The trailing edge's longest wait behind the leading one, s. */
const TRAIL = 0.12;

type Box = { left: number; top: number; right: number; bottom: number };

type Word = {
  text: string;
  /** Letters and digits only: what `minLength` counts. */
  letters: number;
  blur: MotionValue<number>;
  ink: MotionValue<number>;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Hold = "pointer" | "touch" | "keys" | null;

type Api = {
  hop: (i: number, instant: boolean) => void;
  advance: () => void;
  measure: () => void;
};

function Corner({
  x,
  y,
  at,
  cornerSize,
  thickness,
  frame,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  at: "tl" | "tr" | "bl" | "br";
  cornerSize: number;
  thickness: number;
  frame: string;
}) {
  const w = `${thickness}px`;
  return (
    <motion.span
      className={cn(
        "absolute top-0 left-0 border-solid",
        at === "tl" && "rounded-tl-[2px]",
        at === "tr" && "-translate-x-full rounded-tr-[2px]",
        at === "bl" && "-translate-y-full rounded-bl-[2px]",
        at === "br" && "-translate-x-full -translate-y-full rounded-br-[2px]",
      )}
      style={{
        x,
        y,
        width: `${cornerSize}em`,
        height: `${cornerSize}em`,
        borderColor: frame,
        borderTopWidth: at[0] === "t" ? w : 0,
        borderBottomWidth: at[0] === "b" ? w : 0,
        borderLeftWidth: at[1] === "l" ? w : 0,
        borderRightWidth: at[1] === "r" ? w : 0,
      }}
    />
  );
}

/**
 * True-focus text: four corner brackets frame one word, sharp and in full
 * ink, while the rest of the sentence sits softly blurred and dimmed, and on
 * a timer the frame hops to the next word. The frame is four edges, not one
 * box, so it hops like an inchworm: the edge facing the way it is going
 * leaves first on the snap spring — the brackets bite the new word with one
 * crisp overshoot — and the trailing edge follows a beat later on glide, so
 * the frame stretches across the gap and pulls its tail in, resizing to the
 * new word as it lands. A hop to another line moves the whole frame together.
 *
 * Hovering a word takes the frame there and holds the cycle until the pointer
 * leaves; a tap does the same on touch. The sentence is focusable: Left and
 * Right move the frame a word, Home and End jump to the ends, and the cycle
 * waits while it has focus. The sentence is read once from an sr-only copy.
 * The cycle runs only on screen in a visible page. Under reduced motion the
 * frame cross-fades between words instead of travelling.
 */
export function WordBracket({
  text,
  as = "p",
  interval = 1600,
  blur = 3,
  dim = 0.4,
  frame = "var(--accent-bright)",
  lag = 0.5,
  cornerSize = 0.3,
  thickness = 2,
  padding = 0.14,
  minLength = 1,
  index,
  defaultIndex,
  onIndexChange,
  paused = false,
  loop = true,
  hoverControl = true,
  onComplete,
  className,
}: WordBracketProps) {
  const motionSafe = useMotionSafe();
  const hintId = `${React.useId()}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [hold, setHold] = React.useState<Hold>(null);
  const running = onScreen && !hidden;

  const tokens = React.useMemo(
    () => text.split(/\s+/).filter((w) => w.length > 0),
    [text],
  );
  const eligible = React.useMemo(() => {
    const counts = tokens.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length);
    const ok = tokens
      .map((_, i) => i)
      .filter((i) => (counts[i] ?? 0) >= Math.max(1, minLength));
    return ok.length ? ok : tokens.map((_, i) => i);
  }, [tokens, minLength]);

  const [own, setOwn] = React.useState(() => defaultIndex ?? eligible[0] ?? 0);
  const current = clamp(index ?? own, 0, Math.max(0, tokens.length - 1));

  const soft = Math.max(0, blur);
  const faint = clamp01(dim);
  const [focusedAtStart] = React.useState(current);
  const words = React.useMemo<Word[]>(
    () =>
      tokens.map((w, i) => ({
        text: w,
        letters: w.replace(/[^\p{L}\p{N}]/gu, "").length,
        blur: motionValue(i === focusedAtStart ? 0 : soft),
        ink: motionValue(i === focusedAtStart ? 1 : faint),
      })),
    // Each word's look is carried by its motion values from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokens],
  );

  const left = useMotionValue(0);
  const right = useMotionValue(0);
  const top = useMotionValue(0);
  const bottom = useMotionValue(0);
  const shown = useMotionValue(0);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const wordNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const boxes = React.useRef<(Box | null)[]>([]);
  const edges = React.useRef<AnimationPlaybackControls[]>([]);
  const looks = React.useRef<AnimationPlaybackControls[]>([]);
  const fader = React.useRef<AnimationPlaybackControls | null>(null);
  const placed = React.useRef(false);
  const lit = React.useRef(focusedAtStart);
  const touchTimer = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onIndexChange, onComplete });

  const choose = (i: number) => {
    if (i === current) return;
    if (index === undefined) setOwn(i);
    report.current.onIndexChange?.(i);
  };

  const advance = () => {
    const at = eligible.indexOf(current);
    const nextAt = at < 0 ? 0 : at + 1;
    if (nextAt >= eligible.length) {
      if (!loop) {
        report.current.onComplete?.();
        return;
      }
    }
    const next = eligible[nextAt % eligible.length];
    if (next !== undefined) choose(next);
  };

  /** The frame's box around a word: room on each side, kept inside the text. */
  const frameOf = (box: Box): Box => {
    const root = rootRef.current;
    const size = root ? parseFloat(getComputedStyle(root).fontSize) || 16 : 16;
    const padX = padding * size;
    const padY = padding * size * 0.45;
    const w = root?.clientWidth ?? box.right;
    const h = root?.clientHeight ?? box.bottom;
    return {
      left: r2(Math.max(0, box.left - padX)),
      right: r2(Math.min(w, box.right + padX)),
      top: r2(Math.max(0, box.top - padY)),
      bottom: r2(Math.min(h, box.bottom + padY)),
    };
  };

  const stopEdges = () => {
    for (const c of edges.current) c.stop();
    edges.current = [];
  };

  /** Sharpen the new word as the frame takes it; soften the one it leaves. */
  const light = (i: number) => {
    const was = lit.current;
    lit.current = i;
    for (const c of looks.current) c.stop();
    looks.current = [];
    const tween = (delay: number) => ({
      duration: durations.base,
      ease: easings.enter,
      delay,
    });
    words.forEach((word, k) => {
      const on = k === i;
      if (
        !on &&
        k !== was &&
        word.ink.get() === faint &&
        !word.ink.isAnimating()
      ) {
        return;
      }
      looks.current.push(
        animate(word.blur, on ? 0 : soft, tween(on ? lag * 0.06 : 0)),
        animate(word.ink, on ? 1 : faint, tween(on ? lag * 0.06 : 0)),
      );
    });
  };

  const hop = (i: number, instant: boolean) => {
    const box = boxes.current[i];
    if (!box) return;
    const to = frameOf(box);
    stopEdges();
    if (instant || !placed.current) {
      left.jump(to.left);
      right.jump(to.right);
      top.jump(to.top);
      bottom.jump(to.bottom);
      if (!placed.current) {
        placed.current = true;
        fader.current?.stop();
        fader.current = animate(shown, 1, {
          duration: durations.base,
          ease: easings.enter,
        });
      }
      return;
    }
    if (!motionSafe) {
      // No travel: the frame lets go of one word and appears on the next.
      fader.current?.stop();
      fader.current = animate(shown, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          left.jump(to.left);
          right.jump(to.right);
          top.jump(to.top);
          bottom.jump(to.bottom);
          fader.current = animate(shown, 1, {
            duration: durations.fast,
            ease: easings.enter,
          });
        },
      });
      return;
    }
    const height = bottom.get() - top.get();
    const sameLine = Math.abs(to.top - top.get()) < height * 0.5;
    if (!sameLine) {
      edges.current = [
        animate(left, to.left, springs.glide),
        animate(right, to.right, springs.glide),
        animate(top, to.top, springs.glide),
        animate(bottom, to.bottom, springs.glide),
      ];
      return;
    }
    const forward = to.left + to.right >= left.get() + right.get();
    const lead = forward ? right : left;
    const tail = forward ? left : right;
    const k = clamp01(lag);
    edges.current = [
      animate(lead, forward ? to.right : to.left, springs.snap),
      animate(tail, forward ? to.left : to.right, {
        ...(k > 0.02 ? springs.glide : springs.snap),
        delay: TRAIL * k,
      }),
      animate(top, to.top, springs.glide),
      animate(bottom, to.bottom, springs.glide),
    ];
  };

  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    boxes.current = tokens.map((_, i) => {
      const node = wordNodes.current.get(i);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const x = r.left - rect.left - root.clientLeft;
      const y = r.top - rect.top - root.clientTop;
      return { left: x, top: y, right: x + r.width, bottom: y + r.height };
    });
    // Measured afresh (a resize, new text): the frame sits on the focused word.
    hop(current, true);
    if (lit.current !== current) light(current);
  };

  React.useLayoutEffect(() => {
    api.current = {
      hop: (i, instant) => {
        hop(i, instant);
        if (i !== lit.current || instant) light(i);
      },
      advance,
      measure,
    };
    report.current = { onIndexChange, onComplete };
  });

  // The focused word is state: the host hears it from the first commit.
  React.useEffect(() => {
    report.current.onIndexChange?.(current);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The frame follows the focused word, wherever the choice came from.
  React.useEffect(() => {
    if (lit.current === current) return;
    api.current?.hop(current, false);
  }, [current]);

  // A new blur or dim restyles the words outside the frame at once.
  React.useEffect(() => {
    words.forEach((word, k) => {
      if (k === lit.current) return;
      word.blur.jump(soft);
      word.ink.jump(faint);
    });
  }, [words, soft, faint]);

  // The cycle: one interval per word, only while it can be seen and nothing
  // holds it. A hold that ends gives the reader a full interval before it moves.
  React.useEffect(() => {
    if (!running || paused || hold) return;
    const timer = window.setTimeout(
      () => api.current?.advance(),
      Math.max(200, interval),
    );
    return () => window.clearTimeout(timer);
  }, [running, paused, hold, interval, current]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [tokens, padding]);

  React.useEffect(() => {
    const e = edges;
    const l = looks;
    const f = fader;
    const t = touchTimer;
    return () => {
      for (const c of e.current) c.stop();
      for (const c of l.current) c.stop();
      f.current?.stop();
      window.clearTimeout(t.current);
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindWord = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) wordNodes.current.set(i, node);
    else wordNodes.current.delete(i);
  };

  const step = (by: number) => {
    const at = eligible.indexOf(current);
    if (at < 0) {
      // The pointer left the frame on a word the cycle skips: step from the
      // nearest word it lands on.
      const after = eligible.findIndex((i) => i > current);
      const from = by > 0 ? after : after - 1;
      const next =
        eligible[
          clamp(from < 0 ? eligible.length - 1 : from, 0, eligible.length - 1)
        ];
      if (next !== undefined) choose(next);
      return;
    }
    const next = eligible[clamp(at + by, 0, eligible.length - 1)];
    if (next !== undefined) choose(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!hoverControl) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        step(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        step(-1);
        break;
      case "Home": {
        const first = eligible[0];
        if (first !== undefined) choose(first);
        break;
      }
      case "End": {
        const last = eligible[eligible.length - 1];
        if (last !== undefined) choose(last);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  const x0 = left;
  const x1 = right;
  const y0 = top;
  const y1 = bottom;
  const frameOpacity = useTransform(shown, (v) => r2(v));

  const Tag = as;

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={hoverControl ? 0 : undefined}
        aria-describedby={hoverControl ? hintId : undefined}
        onKeyDown={onKeyDown}
        onFocus={(event: React.FocusEvent) => {
          if (hoverControl && event.target === event.currentTarget) {
            setHold("keys");
          }
        }}
        onBlur={() => {
          setHold((h) => (h === "keys" ? null : h));
        }}
        onPointerLeave={(event: React.PointerEvent) => {
          if (event.pointerType === "mouse") {
            setHold((h) => (h === "pointer" ? null : h));
          }
        }}
        className={cn(
          "relative",
          hoverControl &&
            "rounded-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
      >
        <span className="sr-only select-none">{text}</span>
        <span aria-hidden>
          {words.map((word, i) => (
            <React.Fragment key={i}>
              {i > 0 ? " " : null}
              <WordSpan
                word={word}
                bind={bindWord(i)}
                onEnter={(event) => {
                  if (!hoverControl || event.pointerType !== "mouse") return;
                  setHold("pointer");
                  choose(i);
                }}
                onDown={(event) => {
                  if (!hoverControl || event.pointerType === "mouse") return;
                  setHold("touch");
                  choose(i);
                  window.clearTimeout(touchTimer.current);
                  touchTimer.current = window.setTimeout(
                    () => setHold(null),
                    Math.max(400, interval * 2),
                  );
                }}
              />
            </React.Fragment>
          ))}
        </span>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ opacity: frameOpacity }}
        >
          <Corner
            x={x0}
            y={y0}
            at="tl"
            cornerSize={cornerSize}
            thickness={thickness}
            frame={frame}
          />
          <Corner
            x={x1}
            y={y0}
            at="tr"
            cornerSize={cornerSize}
            thickness={thickness}
            frame={frame}
          />
          <Corner
            x={x0}
            y={y1}
            at="bl"
            cornerSize={cornerSize}
            thickness={thickness}
            frame={frame}
          />
          <Corner
            x={x1}
            y={y1}
            at="br"
            cornerSize={cornerSize}
            thickness={thickness}
            frame={frame}
          />
        </motion.span>
      </Tag>
      {hoverControl ? (
        <span id={hintId} className="sr-only select-none">
          Use the arrow keys to move the focus frame between words.
        </span>
      ) : null}
    </>
  );
}

function WordSpan({
  word,
  bind,
  onEnter,
  onDown,
}: {
  word: Word;
  bind: (node: HTMLSpanElement | null) => void;
  onEnter: (event: React.PointerEvent) => void;
  onDown: (event: React.PointerEvent) => void;
}) {
  const filter = useTransform(word.blur, (b) =>
    b < 0.05 ? "none" : `blur(${r2(b)}px)`,
  );
  const opacity = useTransform(word.ink, (v) => r2(v));
  return (
    <motion.span
      ref={bind}
      className="inline-block whitespace-nowrap"
      style={{ filter, opacity }}
      onPointerEnter={onEnter}
      onPointerDown={onDown}
    >
      {word.text}
    </motion.span>
  );
}
