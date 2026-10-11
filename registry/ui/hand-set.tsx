"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HandSetElement = "p" | "div" | "blockquote";
export type HandSetJustify = "full" | "left" | "center";
export type HandSetTrigger = "mount" | "inView" | "hover" | "manual";

export type HandSetProps = {
  /** The paragraph, as a string. Wins over `text`. */
  children?: string;
  /** The paragraph, when it is not given as children. */
  text?: string;
  /** The element that carries the paragraph. @default "p" */
  as?: HandSetElement;
  /** Line length, in ch; never wider than the box. @default 46 */
  measure?: number;
  /** Time between words, ms; a comma or a full stop holds the stick a little longer. @default 170 */
  pace?: number;
  /** How the lines are set: justified to the measure, ragged right, or centred. @default "full" */
  justify?: HandSetJustify;
  /** The widest a gap may open while a line is still short, em, so two words never sit at opposite ends. @default 1.6 */
  maxSpread?: number;
  /** How uneven the hand is, 0 (a metronome) to 1. @default 0.35 */
  jitter?: number;
  /** The pause after a line locks before the next begins, ms. @default 320 */
  linePause?: number;
  /** Draw a faint rule under each line as it locks. @default true */
  rules?: boolean;
  /** The rule's colour. @default "var(--hairline-strong)" */
  ruleColor?: string;
  /** The colour of words still in the stick; a locked line takes the paragraph's own colour. @default "var(--ink-3)" */
  setColor?: string;
  /** Opacity of the copy still waiting to be set, 0 (hidden) to 0.5. @default 0.24 */
  proof?: number;
  /** What starts the setting. @default "inView" */
  trigger?: HandSetTrigger;
  /** Set once, or start again each time the paragraph re-enters view or is hovered. @default true */
  once?: boolean;
  /** With trigger "manual": true sets the paragraph, false clears it back to the copy. @default false */
  play?: boolean;
  /** Wait before the first word, ms. @default 0 */
  delay?: number;
  /** A line has locked: its index and how many lines there are. */
  onLineSet?: (line: number, lines: number) => void;
  /** The whole paragraph is set. */
  onComplete?: () => void;
  className?: string;
};

const DEFAULT_TEXT =
  "Every line in this issue was set by hand. A word goes into the stick, the spacing opens to take it, and when the line is full it is locked up and the next one begins. Slow work, but you can feel it in the reading.";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** A small seeded generator, so the same paragraph is set by the same hand. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

type Line = { start: number; end: number; top: number; height: number };

type Geo = {
  /** Each word's final left edge and width, as the browser set it. */
  x: number[];
  w: number[];
  line: number[];
  lines: Line[];
  /** The measure's width, a natural space, and the em. */
  width: number;
  space: number;
  em: number;
};

let probe: CanvasRenderingContext2D | null = null;
function spaceWidth(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const size = parseFloat(style.fontSize) || 16;
  if (!probe) probe = document.createElement("canvas").getContext("2d");
  if (!probe) return size * 0.27;
  probe.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const w = probe.measureText(" ").width;
  const word = parseFloat(style.wordSpacing);
  return (w > 0 ? w : size * 0.27) + (Number.isFinite(word) ? word : 0);
}

/** Reads the paragraph the browser laid out: every word's place and the lines they fall into. */
function readGeo(para: HTMLElement, words: (HTMLElement | null)[]): Geo | null {
  if (!words.length || words.some((w) => !w)) return null;
  const x: number[] = [];
  const w: number[] = [];
  const line: number[] = [];
  const lines: Line[] = [];
  let top = -Infinity;
  words.forEach((node, i) => {
    if (!node) return;
    const t = node.offsetTop;
    if (Math.abs(t - top) > 2) {
      lines.push({ start: i, end: i, top: t, height: node.offsetHeight });
      top = t;
    } else {
      const cur = lines[lines.length - 1];
      if (cur) cur.end = i;
    }
    x.push(node.offsetLeft);
    w.push(node.offsetWidth);
    line.push(lines.length - 1);
  });
  const em = parseFloat(getComputedStyle(para).fontSize) || 16;
  return {
    x,
    w,
    line,
    lines,
    width: para.clientWidth,
    space: spaceWidth(para),
    em,
  };
}

/**
 * Where the words of a line sit with `n` of them in the stick, as offsets
 * from their final places. A justified line spreads what it has across the
 * measure, each gap capped at `cap`, so the gaps close up as words arrive;
 * a centred one re-centres; a ragged one simply fills from the left. With
 * every word in, the line takes the browser's own setting.
 */
function offsetsFor(
  geo: Geo,
  lineIndex: number,
  n: number,
  justify: HandSetJustify,
  cap: number,
): number[] {
  const L = geo.lines[lineIndex];
  if (!L) return [];
  const k = L.end - L.start + 1;
  const out: number[] = [];
  if (n >= k || justify === "left") {
    for (let j = 0; j < Math.min(n, k); j += 1) out.push(0);
    return out;
  }
  let sum = 0;
  for (let j = 0; j < n; j += 1) sum += geo.w[L.start + j] ?? 0;
  const last = lineIndex === geo.lines.length - 1;
  let gap = geo.space;
  let at = geo.x[L.start] ?? 0;
  if (justify === "center") {
    at = (geo.width - (sum + (n - 1) * gap)) / 2;
  } else if (!last && n > 1) {
    gap = clamp((geo.width - at - sum) / (n - 1), geo.space, cap);
  }
  for (let j = 0; j < n; j += 1) {
    const i = L.start + j;
    out.push(at - (geo.x[i] ?? 0));
    at += (geo.w[i] ?? 0) + gap;
  }
  return out;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/**
 * A paragraph composed word by word, as if set by hand in a compositor's
 * stick. The browser lays the paragraph out once at its final measure and
 * alignment, so the box is reserved from the first paint and nothing
 * shifts; the copy waits as a faint proof, and the words are carried by
 * transforms alone.
 *
 * Each word slides in at the end of the line on the snap spring, and as it
 * lands the line's spacing re-spreads on the same spring: a justified line
 * spreads what it has across the measure, so the gaps tighten with every
 * word — with one small overshoot, a breath — and open a little again when
 * the line is full and takes its true justification. Then the line locks: a
 * faint rule draws in beneath it, its ink deepens, and the next begins. The
 * hand has a seeded unevenness and lingers after a comma or a full stop.
 * The words are real text, selectable, and the paragraph is read once from
 * an unseen copy. Under reduced motion it is simply set.
 */
export function HandSet({
  children,
  text,
  as = "p",
  measure = 46,
  pace = 170,
  justify = "full",
  maxSpread = 1.6,
  jitter = 0.35,
  linePause = 320,
  rules = true,
  ruleColor = "var(--hairline-strong)",
  setColor = "var(--ink-3)",
  proof = 0.24,
  trigger = "inView",
  once = true,
  play = false,
  delay = 0,
  onLineSet,
  onComplete,
  className,
}: HandSetProps) {
  const motionSafe = useMotionSafe();
  const copy = (typeof children === "string" ? children : text) ?? DEFAULT_TEXT;
  const words = React.useMemo(() => copy.split(/\s+/).filter(Boolean), [copy]);
  const total = words.length;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );

  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [count, setCount] = React.useState(0);
  const [locked, setLocked] = React.useState(0);
  const [started, setStarted] = React.useState(false);
  // The hand rests while the paragraph is off screen, and picks up where it was.
  const [onScreen, setOnScreen] = React.useState(true);

  const paraRef = React.useRef<HTMLSpanElement | null>(null);
  const nodes = React.useRef<(HTMLElement | null)[]>([]);
  const xs = React.useMemo(() => words.map(() => motionValue(0)), [words]);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timer = React.useRef(0);
  const next = React.useRef(0);
  const callbacks = React.useRef({ onLineSet, onComplete });
  const knobs = React.useRef({ pace, jitter, linePause, justify, maxSpread });
  const geoRef = React.useRef<Geo | null>(null);
  const seen = React.useRef({ trigger, once, played: false });
  const done = React.useRef(false);
  const kickoff = React.useRef(0);
  /** State changes a prop asks for are made a beat later, outside the effect. */
  const later = React.useCallback((fn: () => void) => {
    window.clearTimeout(kickoff.current);
    kickoff.current = window.setTimeout(() => {
      kickoff.current = 0;
      fn();
    }, 0);
  }, []);

  React.useLayoutEffect(() => {
    callbacks.current = { onLineSet, onComplete };
    knobs.current = { pace, jitter, linePause, justify, maxSpread };
    seen.current = { ...seen.current, trigger, once };
  });

  const settled = !motionSafe;
  const lineCount = geo?.lines.length ?? 0;
  const shownCount = settled ? total : count;
  const shownLocked = settled ? lineCount : locked;

  const stopAll = React.useCallback(() => {
    for (const r of running.current) r.stop();
    running.current = [];
  }, []);

  const measureNow = React.useCallback(() => {
    const para = paraRef.current;
    if (!para) return;
    const g = readGeo(para, nodes.current.slice(0, total));
    if (!g) return;
    geoRef.current = g;
    setGeo((was) => {
      if (
        was &&
        was.width === g.width &&
        was.lines.length === g.lines.length &&
        was.x.every((v, i) => v === g.x[i]) &&
        was.w.every((v, i) => v === g.w[i])
      ) {
        return was;
      }
      return g;
    });
  }, [total]);

  /** Puts every word where the current count says, at once (a resize, a reset). */
  const pose = React.useCallback(
    (n: number) => {
      const g = geoRef.current;
      stopAll();
      if (!g) return;
      const k = knobs.current;
      const current = n > 0 ? (g.line[n - 1] ?? 0) : -1;
      for (let i = 0; i < total; i += 1) xs[i]?.jump(0);
      if (current < 0) return;
      const L = g.lines[current];
      if (!L) return;
      const offs = offsetsFor(
        g,
        current,
        n - L.start,
        k.justify,
        k.maxSpread * g.em,
      );
      offs.forEach((dx, j) => xs[L.start + j]?.jump(dx));
    },
    [stopAll, total, xs],
  );

  /** The next word goes into the stick, and its line re-spreads around it. */
  const land = React.useCallback(
    (i: number) => {
      const g = geoRef.current;
      if (!g) return;
      const k = knobs.current;
      const li = g.line[i] ?? 0;
      const L = g.lines[li];
      if (!L) return;
      const n = i - L.start + 1;
      const offs = offsetsFor(g, li, n, k.justify, k.maxSpread * g.em);
      const mover = xs[i];
      const target = offs[n - 1] ?? 0;
      // The new word comes in from just past the end of the line — never
      // past the measure: a word that ends flush right simply fades in.
      const room = g.width - ((g.x[i] ?? 0) + target + (g.w[i] ?? 0));
      mover?.jump(target + clamp(room, 0, distances.shift));
      // A new animate on a value replaces the one running on it; only this
      // landing's need keeping for an unmount to stop.
      running.current = [];
      for (let j = 0; j < offs.length; j += 1) {
        const mv = xs[L.start + j];
        if (!mv) continue;
        running.current.push(animate(mv, offs[j] ?? 0, springs.snap));
      }
      setCount(i + 1);
    },
    [xs],
  );

  const reset = React.useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    next.current = 0;
    done.current = false;
    stopAll();
    for (const mv of xs) mv.jump(0);
    setCount(0);
    setLocked(0);
  }, [stopAll, xs]);

  // New copy starts from the proof again.
  const firstCopy = React.useRef(copy);
  React.useEffect(() => {
    if (firstCopy.current === copy) return;
    firstCopy.current = copy;
    later(reset);
  }, [copy, reset, later]);

  // The setting itself: one word per beat, a lock at each line's end. It
  // carries on from where it was, so a rehearsal remount or a resize never
  // starts it over.
  React.useEffect(() => {
    if (!started || !geo || !motionSafe || hidden || !onScreen) return;
    const rand = lcg(hash(copy) ^ 0x9e3779b9);
    const beats = words.map(() => rand());
    const step = () => {
      const g = geoRef.current;
      const i = next.current;
      if (!g) return;
      if (i >= total) {
        // Finished, even if a remount or a scroll interrupted the last beat.
        if (!done.current) {
          done.current = true;
          callbacks.current.onComplete?.();
        }
        return;
      }
      land(i);
      next.current = i + 1;
      const k = knobs.current;
      const li = g.line[i] ?? 0;
      const endOfLine = (g.lines[li]?.end ?? i) === i;
      if (endOfLine) {
        setLocked(li + 1);
        callbacks.current.onLineSet?.(li, g.lines.length);
        if (i + 1 >= total) {
          // The last rule draws in, then the paragraph is set.
          timer.current = window.setTimeout(step, 420);
          return;
        }
      }
      const word = words[i] ?? "";
      const breath = /[.!?]["”’)]?$/.test(word)
        ? 1.2
        : /[,;:]["”’)]?$/.test(word)
          ? 0.6
          : 0;
      const hand = 1 + clamp01(k.jitter) * ((beats[i] ?? 0.5) - 0.5) * 1.4;
      const beat = Math.max(30, k.pace) * (hand + breath);
      timer.current = window.setTimeout(
        step,
        Math.round(endOfLine ? beat + Math.max(0, k.linePause) : beat),
      );
    };
    timer.current = window.setTimeout(
      step,
      Math.round(next.current === 0 ? Math.max(0, delay) : 0),
    );
    return () => {
      window.clearTimeout(timer.current);
      timer.current = 0;
    };
  }, [
    started,
    geo,
    motionSafe,
    hidden,
    onScreen,
    copy,
    words,
    total,
    land,
    delay,
  ]);

  // Reduced motion is the set paragraph, and it is complete.
  React.useEffect(() => {
    if (motionSafe || !geo) return;
    stopAll();
    for (const mv of xs) mv.jump(0);
    if (done.current) return;
    done.current = true;
    callbacks.current.onComplete?.();
  }, [motionSafe, geo, stopAll, xs]);

  // A new layout (resize, measure, alignment) re-poses what is already set.
  React.useEffect(() => {
    if (geo) pose(next.current);
  }, [geo, justify, maxSpread, pose]);

  React.useEffect(() => () => stopAll(), [stopAll]);

  const begin = React.useCallback(
    (restart: boolean) => {
      if (restart) reset();
      setStarted(true);
      seen.current.played = true;
    },
    [reset],
  );

  React.useEffect(() => {
    if (trigger === "mount") later(() => begin(false));
    if (trigger === "manual") {
      later(() => {
        if (play) begin(false);
        else {
          setStarted(false);
          reset();
        }
      });
    }
    return () => window.clearTimeout(kickoff.current);
  }, [trigger, play, begin, reset, later]);

  const bindPara = React.useCallback(
    (node: HTMLSpanElement | null) => {
      paraRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => measureNow());
      sizer.observe(node);
      void document.fonts?.ready.then(() => measureNow());
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        setOnScreen(Boolean(entry?.isIntersecting));
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (entry?.isIntersecting) begin(false);
        else if (!t.once && t.played) {
          setStarted(false);
          reset();
        }
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
      };
    },
    [begin, measureNow, reset],
  );

  React.useLayoutEffect(() => {
    measureNow();
  }, [measureNow, measure, justify, copy]);

  const Tag = as;
  const currentLine =
    shownCount > 0 && geo ? (geo.line[shownCount - 1] ?? -1) : -1;

  return (
    <Tag
      className={cn("relative m-0", className)}
      onPointerEnter={() => {
        if (trigger === "hover") begin(!once && seen.current.played);
      }}
      onPointerLeave={() => {
        if (trigger === "hover" && !once) {
          setStarted(false);
          reset();
        }
      }}
      style={{
        maxWidth: `${clamp(measure, 8, 120)}ch`,
        ["--hand-set-proof" as string]: String(clamp(proof, 0, 0.5)),
        ["--hand-set-ink" as string]: setColor,
      }}
    >
      <span className="sr-only">{copy}</span>
      <span
        ref={bindPara}
        aria-hidden
        className="relative block"
        style={{
          textAlign: justify === "full" ? "justify" : justify,
          textAlignLast: justify === "center" ? "center" : "left",
        }}
      >
        {words.map((word, i) => {
          const line = geo?.line[i] ?? -1;
          const state =
            i < shownCount
              ? line >= 0 && line < shownLocked
                ? "locked"
                : "set"
              : line === currentLine && line >= shownLocked
                ? "waiting"
                : "proof";
          return (
            <React.Fragment key={i}>
              {i > 0 ? " " : null}
              <motion.span
                ref={(node: HTMLSpanElement | null) => {
                  nodes.current[i] = node;
                }}
                data-state={state}
                className={cn(
                  "inline-block whitespace-nowrap transition-[opacity,color] duration-300",
                  "data-[state=proof]:opacity-[var(--hand-set-proof)] data-[state=waiting]:opacity-0",
                  // Copy, waiting and set words share the stick's ink, so a
                  // word arriving only fades in; locking is the one change of ink.
                  "data-[state=proof]:text-[var(--hand-set-ink)] data-[state=set]:text-[var(--hand-set-ink)] data-[state=waiting]:text-[var(--hand-set-ink)]",
                )}
                style={{ x: xs[i] }}
              >
                {word}
              </motion.span>
            </React.Fragment>
          );
        })}
        {rules && geo
          ? geo.lines.map((line, li) => (
              <span
                key={li}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-px origin-left transition-[scale,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  top: line.top + line.height - 1,
                  background: ruleColor,
                  scale: li < shownLocked ? "1 1" : "0 1",
                  opacity: li < shownLocked ? 1 : 0,
                  // Reduced motion: the rules are simply there.
                  transitionProperty: settled ? "none" : undefined,
                  transitionDelay: settled ? "0ms" : "120ms",
                }}
              />
            ))
          : null}
      </span>
    </Tag>
  );
}
