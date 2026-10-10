"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CaptionCorrection = {
  /** Which word of the segment's `text` was misheard, from 0. */
  word: number;
  /** What the recogniser heard first. */
  heard: string;
};

export type CaptionSegment = {
  /** The sentence as finally captioned: the correct words. */
  text: string;
  /** Who is speaking; shown as a small label when the speaker changes. */
  speaker?: string;
  /** Words the recogniser gets wrong at first and then revises. */
  corrections?: CaptionCorrection[];
};

export type CaptionLiveElement = "div" | "section" | "article" | "figure";
export type CaptionLiveTrigger = "mount" | "inView" | "hover" | "manual";

export type CaptionLiveProps = {
  /** The captions, sentence by sentence. */
  script: CaptionSegment[];
  /** The element that holds the captions. @default "div" */
  as?: CaptionLiveElement;
  /** Speaking rate, words a minute. @default 165 */
  pace?: number;
  /** How sure the recogniser is, 0 to 1: lower shows more words shimmering in draft ink. @default 0.7 */
  confidence?: number;
  /** Play the recogniser's corrections. False lands every word already right. @default true */
  revise?: boolean;
  /** At least how long a misheard word stands before it is corrected, ms. @default 600 */
  reviseDelay?: number;
  /** Pause after a sentence's last word before it settles into solid ink, ms. @default 380 */
  settleDelay?: number;
  /** How many lines of captions show before the oldest rolls up and away, 1 to 4. @default 2 */
  lines?: number;
  /** Play the script again after it ends. @default true */
  loop?: boolean;
  /** Rest after the last sentence settles before the script starts over, ms. @default 2600 */
  loopDelay?: number;
  /** Keep a faint dotted underline under words that were corrected. @default true */
  marks?: boolean;
  /** Low-confidence words shimmer until their sentence settles. @default true */
  shimmer?: boolean;
  /** Show a speaker label when the speaker changes. @default true */
  speakers?: boolean;
  /** Settled ink, any CSS colour. @default "var(--foreground)" */
  ink?: string;
  /** Draft ink for words still being heard, any CSS colour. @default "var(--ink-3)" */
  draftInk?: string;
  /** Seed for the speaking rhythm and the confidence draw. @default 0 */
  seed?: number;
  /** Hold the captions where they are. @default false */
  paused?: boolean;
  /** When the captions start. @default "inView" */
  trigger?: CaptionLiveTrigger;
  /** Start once, or again each time the captions re-enter view or are hovered. @default true */
  once?: boolean;
  /** Wait before the first word, ms. @default 0 */
  delay?: number;
  /** With trigger "manual": true starts the captions, false clears them. @default false */
  play?: boolean;
  /** A sentence has settled: its index in `script`. */
  onSegment?: (index: number) => void;
  /** The script has played through once more. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Line height of the captions, em: the box is sized from it. */
const LEADING = 1.5;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Token = {
  seg: number;
  /** Order within its sentence, for the settle wash. */
  order: number;
  count: number;
  final: string;
  heard: string | null;
  uncertain: boolean;
  /** A speaker label shown before this word. */
  label: string | null;
  /** This word begins a new speaker's line. */
  breaks: boolean;
  arrive: number;
  reviseAt: number;
};

type CaptionEvent = {
  t: number;
  kind: "arrive" | "revise" | "settle" | "end" | "fade" | "restart";
  index: number;
};

type Plan = {
  tokens: Token[];
  events: CaptionEvent[];
  /** Event index at which each sentence settles. */
  settles: number[];
  fadeAt: number;
};

function planOf(
  script: CaptionSegment[],
  pace: number,
  confidence: number,
  revise: boolean,
  reviseDelay: number,
  settleDelay: number,
  loop: boolean,
  loopDelay: number,
  speakers: boolean,
  seed: number,
): Plan {
  const rand = lcg(hash(script.map((s) => s.text).join("\n")) ^ seed);
  const base = 60 / clamp(pace, 40, 400);
  const tokens: Token[] = [];
  const timed: CaptionEvent[] = [];
  let t = 0.25;
  let lastSpeaker: string | undefined;
  script.forEach((segment, seg) => {
    const words = segment.text.split(/\s+/).filter(Boolean);
    const fixes = new Map<number, string>();
    for (const c of segment.corrections ?? []) fixes.set(c.word, c.heard);
    const changed =
      speakers && segment.speaker && segment.speaker !== lastSpeaker;
    lastSpeaker = segment.speaker ?? lastSpeaker;
    const first = tokens.length;
    let lastArrive = t;
    let lastRevise = 0;
    words.forEach((word, i) => {
      const jitter = 0.85 + 0.3 * rand();
      const sure = rand();
      const heard = revise ? (fixes.get(i) ?? null) : null;
      tokens.push({
        seg,
        order: i,
        count: words.length,
        final: word,
        heard: heard && heard !== word ? heard : null,
        uncertain: heard !== null || sure > confidence,
        label: i === 0 && changed ? (segment.speaker ?? null) : null,
        breaks: i === 0 && Boolean(changed) && first > 0,
        arrive: t,
        reviseAt: -1,
      });
      timed.push({ t, kind: "arrive", index: tokens.length - 1 });
      lastArrive = t;
      const letters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
      t += base * (0.55 + 0.075 * letters) * jitter;
      if (/[,;:—–]$/.test(word)) t += base * (1.4 + 0.8 * rand());
      if (/[.!?…]["”’)]?$/.test(word)) t += base * (2.6 + 1.2 * rand());
    });
    // A correction lands once the recogniser has heard a little more:
    // two words on, and never sooner than the revise delay.
    tokens.slice(first).forEach((token, i) => {
      if (token.heard === null) return;
      const later = tokens[first + i + 2]?.arrive ?? lastArrive + base;
      token.reviseAt = Math.max(token.arrive + reviseDelay / 1000, later);
      lastRevise = Math.max(lastRevise, token.reviseAt);
      timed.push({ t: token.reviseAt, kind: "revise", index: first + i });
    });
    const settle = Math.max(
      lastArrive + base * 0.6 + settleDelay / 1000,
      lastRevise + 0.25,
    );
    timed.push({ t: settle, kind: "settle", index: seg });
    t = Math.max(t, settle - base);
  });
  const lastSettle = timed.reduce(
    (m, e) => (e.kind === "settle" ? Math.max(m, e.t) : m),
    0,
  );
  timed.push({ t: lastSettle + 0.01, kind: "end", index: -1 });
  if (loop) {
    const fade = lastSettle + Math.max(0.2, loopDelay / 1000);
    timed.push({ t: fade, kind: "fade", index: -1 });
    timed.push({ t: fade + 0.35, kind: "restart", index: -1 });
  }
  // Stable: events at the same moment keep their written order.
  const events = timed
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map(({ e }) => e);
  const settles: number[] = [];
  let fadeAt = -1;
  events.forEach((e, i) => {
    if (e.kind === "settle") settles[e.index] = i;
    if (e.kind === "fade") fadeAt = i;
  });
  return { tokens, events, settles, fadeAt };
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

const SHIMMER =
  "linear-gradient(100deg, transparent 20%, color-mix(in oklab, var(--caption-ink) 38%, transparent) 50%, transparent 80%)";

function CaptionWord({
  token,
  revised,
  settled,
  marks,
  shimmer,
  phase,
  ink,
  draftInk,
  motionSafe,
}: {
  token: Token;
  revised: boolean;
  settled: boolean;
  marks: boolean;
  shimmer: boolean;
  phase: MotionValue<number>;
  ink: string;
  draftInk: string;
  motionSafe: boolean;
}) {
  const solid = useMotionValue(0);
  const width = useMotionValue(-1);
  const [swapped, setSwapped] = React.useState(false);
  const heardRef = React.useRef<HTMLSpanElement | null>(null);
  const finalRef = React.useRef<HTMLSpanElement | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);

  const color = useTransform(
    solid,
    (v) => `color-mix(in oklab, ${ink} ${Math.round(v * 100)}%, ${draftInk})`,
  );
  const widthStyle = useTransform(width, (w) =>
    w < 0 ? "auto" : `${r2(w)}px`,
  );
  // Each word's glint runs a beat after the word before it, so the shimmer
  // travels along the line instead of flickering word by word.
  const sheen = useTransform(phase, (p) => {
    const u = (((p - token.order * 0.09) % 1) + 1) % 1;
    return `${r2(150 - u * 200)}% 0%`;
  });

  // The sentence settling: a left-to-right wash into solid ink.
  React.useEffect(() => {
    const run = animate(solid, settled ? 1 : 0, {
      duration: settled ? durations.slow : 0,
      delay: settled ? token.order * cascade(token.count) : 0,
      ease: easings.enter,
    });
    return () => run.stop();
  }, [settled, solid, token.order, token.count]);

  // The correction: the box springs from the old word's width to the new
  // one's, so the rest of the line reflows instead of jumping.
  React.useLayoutEffect(() => {
    if (!revised || token.heard === null) return;
    const from = heardRef.current?.offsetWidth ?? 0;
    const to = finalRef.current?.offsetWidth ?? from;
    let alive = true;
    width.jump(from);
    const run = animate(
      width,
      to,
      motionSafe ? springs.glide : { duration: 0 },
    );
    runs.current.push(run);
    void run.then(() => {
      // A re-run (StrictMode, a theme flip) measures again; only the run
      // that finishes hands the word its own width back.
      if (!alive) return;
      width.jump(-1);
      setSwapped(true);
    });
    return () => {
      alive = false;
      for (const r of runs.current) r.stop();
      runs.current = [];
    };
  }, [revised, token.heard, width, motionSafe]);

  const showsHeard = token.heard !== null && !swapped;
  const live = shimmer && motionSafe && token.uncertain && !settled;
  const marked = marks && settled && token.heard !== null;
  const shown = revised || token.heard === null ? token.final : token.heard;

  return (
    <motion.span
      className={cn(
        "relative inline-block whitespace-nowrap",
        marked &&
          "underline decoration-dotted decoration-[0.06em] underline-offset-[0.24em]",
      )}
      style={{
        width: widthStyle,
        color,
        textDecorationColor: marked
          ? `color-mix(in oklab, ${ink} 45%, transparent)`
          : undefined,
      }}
      initial={
        motionSafe ? { opacity: 0, y: -distances.nudge } : { opacity: 0 }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        opacity: { duration: durations.fast, ease: easings.enter },
        y: springs.snap,
      }}
    >
      {showsHeard ? (
        <>
          <motion.span
            ref={heardRef}
            className={cn("inline-block", revised && "select-none")}
            initial={false}
            animate={
              revised
                ? { opacity: 0, y: motionSafe ? -distances.nudge : 0 }
                : { opacity: 1, y: 0 }
            }
            transition={exitFor(durations.base)}
          >
            {token.heard}
          </motion.span>
          <motion.span
            ref={finalRef}
            className={cn(
              "absolute top-0 left-0 inline-block",
              !revised && "select-none",
            )}
            initial={false}
            animate={
              revised
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: motionSafe ? distances.nudge : 0 }
            }
            transition={{
              opacity: { duration: durations.base, ease: easings.enter },
              y: springs.snap,
            }}
          >
            {token.final}
          </motion.span>
        </>
      ) : (
        token.final
      )}
      {live ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-clip-text text-transparent select-none"
          style={{
            backgroundImage: SHIMMER,
            backgroundSize: "300% 100%",
            backgroundPosition: sheen,
            opacity: revised && token.heard !== null && !swapped ? 0 : 1,
          }}
        >
          {shown}
        </motion.span>
      ) : null}
    </motion.span>
  );
}

/**
 * Live captions as they really behave. A script plays at a speaking rhythm
 * seeded from its own words — longer words take longer, commas pause, full
 * stops pause longer — and each word lands in draft ink with a small drop on
 * the snap spring. Words the recogniser is unsure of shimmer faintly; a word
 * it mishears lands wrong and, once it has heard two more words, revises in
 * place, the old word lifting away as the right one rises in while the
 * word's box springs to its new width on glide so the line reflows rather
 * than jumps. When a sentence is complete it settles: a left-to-right wash
 * into solid ink, and a corrected word keeps a faint dotted mark. The box
 * shows a set number of lines and rolls up like broadcast captions as text
 * runs past its last line.
 *
 * The visual captions are hidden from assistive technology; each sentence is
 * added once, as it settles, to a polite log, so a screen reader hears the
 * corrected sentence and never a word in flight. One timer walks the seeded
 * event list, on screen, in a visible page, unpaused; nothing renders per
 * frame. Under reduced motion the words fade in without travel, corrections
 * cross-fade at their final width, nothing shimmers and the roll-up jumps.
 */
export function CaptionLive({
  script,
  as = "div",
  pace = 165,
  confidence = 0.7,
  revise = true,
  reviseDelay = 600,
  settleDelay = 380,
  lines = 2,
  loop = true,
  loopDelay = 2600,
  marks = true,
  shimmer = true,
  speakers = true,
  ink = "var(--foreground)",
  draftInk = "var(--ink-3)",
  seed = 0,
  paused = false,
  trigger = "inView",
  once = true,
  delay = 0,
  play = false,
  onSegment,
  onComplete,
  className,
}: CaptionLiveProps) {
  const motionSafe = useMotionSafe();
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const rows = clamp(Math.round(lines), 1, 4);

  const plan = React.useMemo(
    () =>
      planOf(
        script,
        pace,
        clamp(confidence, 0, 1),
        revise,
        Math.max(0, reviseDelay),
        Math.max(0, settleDelay),
        loop,
        Math.max(0, loopDelay),
        speakers,
        seed,
      ),
    [
      script,
      pace,
      confidence,
      revise,
      reviseDelay,
      settleDelay,
      loop,
      loopDelay,
      speakers,
      seed,
    ],
  );

  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);
  const active = started && onScreen && !hidden && !paused;

  // The cursor belongs to a plan and an entrance: a new plan (a tweak) or a
  // fresh start begins the script again without an effect resetting state.
  const [walk, setWalk] = React.useState({
    plan,
    run: entrance.n,
    cursor: 0,
    pass: 0,
  });
  const current = walk.plan === plan && walk.run === entrance.n && started;
  const cursor = current ? walk.cursor : 0;
  const pass = current ? walk.pass : 0;

  const clock = React.useRef({
    base: 0,
    since: null as number | null,
    plan: null as Plan | null,
    run: -1,
    pass: -1,
  });
  const report = React.useRef({ onSegment, onComplete });
  React.useLayoutEffect(() => {
    report.current = { onSegment, onComplete };
  });

  React.useEffect(() => {
    const c = clock.current;
    if (c.plan !== plan || c.run !== entrance.n || c.pass !== pass) {
      c.plan = plan;
      c.run = entrance.n;
      c.pass = pass;
      c.base = 0;
      c.since = null;
    }
    if (!active) return;
    const event = plan.events[cursor];
    if (!event) return;
    c.since = performance.now();
    const wait = Math.max(0, event.t * 1000 - c.base);
    const id = window.setTimeout(() => {
      c.base = event.t * 1000;
      c.since = null;
      if (event.kind === "settle") report.current.onSegment?.(event.index);
      if (event.kind === "end") report.current.onComplete?.();
      setWalk({
        plan,
        run: entrance.n,
        cursor: event.kind === "restart" ? 0 : cursor + 1,
        pass: event.kind === "restart" ? pass + 1 : pass,
      });
    }, wait);
    return () => {
      window.clearTimeout(id);
      if (c.since !== null) {
        c.base += performance.now() - c.since;
        c.since = null;
      }
    };
  }, [active, cursor, pass, plan, entrance.n]);

  // Which events have happened, as indices into the plan.
  const arrivedUpTo = React.useMemo(() => {
    const arrive: number[] = plan.tokens.map(() => Infinity);
    const revised: number[] = plan.tokens.map(() => Infinity);
    plan.events.forEach((e, i) => {
      if (e.kind === "arrive") arrive[e.index] = i;
      if (e.kind === "revise") revised[e.index] = i;
    });
    return { arrive, revised };
  }, [plan]);

  const visible = plan.tokens
    .map((token, i) => ({ token, i }))
    .filter(({ i }) => (arrivedUpTo.arrive[i] ?? Infinity) < cursor);
  const settledSeg = (seg: number) => (plan.settles[seg] ?? Infinity) < cursor;
  const fading = plan.fadeAt >= 0 && plan.fadeAt < cursor;
  const shimmering =
    shimmer &&
    motionSafe &&
    visible.some(({ token }) => token.uncertain && !settledSeg(token.seg));

  // One phase drives every shimmering word, and only while one shows.
  const phase = useMotionValue(0);
  React.useEffect(() => {
    if (!shimmering || !onScreen || hidden || paused) return;
    const run = animate(phase, [0, 1], {
      duration: 1.7,
      ease: "linear",
      repeat: Infinity,
    });
    return () => run.stop();
  }, [shimmering, onScreen, hidden, paused, phase]);

  // Roll-up: the text block rises as it runs past the last line.
  const y = useMotionValue(0);
  const [rolled, setRolled] = React.useState(false);
  const roll = React.useRef<AnimationPlaybackControls | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const safeRef = React.useRef(motionSafe);
  React.useLayoutEffect(() => {
    safeRef.current = motionSafe;
  });
  const bindBlock = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      // A fresh pass starts at the top: the old roll does not carry over.
      roll.current?.stop();
      y.jump(0);
      const sizer = new ResizeObserver(() => {
        const view = viewRef.current;
        if (!view) return;
        const over = Math.max(0, node.offsetHeight - view.clientHeight);
        setRolled(over > 1);
        roll.current?.stop();
        roll.current = animate(
          y,
          -over,
          safeRef.current && over > 0 ? springs.glide : { duration: 0 },
        );
      });
      sizer.observe(node);
      return () => {
        sizer.disconnect();
        roll.current?.stop();
      };
    },
    [y],
  );

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback((restart: boolean, wait: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, wait);
  }, []);
  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false, delay);
    if (trigger === "manual") {
      if (play) begin(true, delay);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, delay, begin, reset]);

  const seen = React.useRef({ trigger, once, delay, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once, delay };
    if (started) seen.current.played = true;
  });

  const bindRoot = React.useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const isVisible = Boolean(entry?.isIntersecting);
        setOnScreen(isVisible);
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (isVisible) begin(false, t.delay);
        else if (!t.once && t.played) reset();
      });
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [begin, reset],
  );

  const Tag = as;
  const said = script
    .map((segment, i) => ({ segment, i }))
    .filter(({ i }) => settledSeg(i));

  return (
    <Tag
      ref={bindRoot}
      className={cn("relative block w-full", className)}
      onPointerEnter={() => {
        if (trigger === "hover") begin(!once, delay);
      }}
      style={{ "--caption-ink": ink } as React.CSSProperties}
    >
      <div
        ref={viewRef}
        aria-hidden
        className={cn(
          "relative overflow-clip",
          rolled &&
            "[mask-image:linear-gradient(to_bottom,transparent,black_0.75em)]",
        )}
        style={{
          height: `${r2(rows * LEADING + 0.3)}em`,
          lineHeight: LEADING,
        }}
      >
        <motion.div
          key={`${entrance.n}:${pass}`}
          ref={bindBlock}
          className="py-[0.15em]"
          style={{ y }}
          initial={false}
          animate={{ opacity: fading ? 0 : 1 }}
          transition={fading ? exitFor(durations.slow) : { duration: 0 }}
        >
          {visible.map(({ token, i }, k) => (
            <React.Fragment key={i}>
              {token.breaks ? <br /> : k > 0 ? " " : null}
              {token.label ? (
                <motion.span
                  className="mr-[0.5em] inline-block align-[0.12em] font-mono text-[0.62em] tracking-[0.08em] uppercase select-none"
                  style={{ color: draftInk }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.fast }}
                >
                  {token.label}
                </motion.span>
              ) : null}
              <CaptionWord
                token={token}
                revised={(arrivedUpTo.revised[i] ?? Infinity) < cursor}
                settled={settledSeg(token.seg)}
                marks={marks}
                shimmer={shimmer}
                phase={phase}
                ink={ink}
                draftInk={draftInk}
                motionSafe={motionSafe}
              />
            </React.Fragment>
          ))}
        </motion.div>
      </div>
      <div role="log" aria-live="polite" className="sr-only">
        {said.map(({ segment, i }) => (
          <p key={`${pass}:${i}`}>
            {segment.speaker ? `${segment.speaker}: ` : ""}
            {segment.text}
          </p>
        ))}
      </div>
    </Tag>
  );
}
