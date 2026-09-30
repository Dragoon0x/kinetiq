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
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MorseStatusProps = {
  /** The status phrases, tapped out one after another and cycled in order. */
  phrases: string[];
  /** Sending. False clears the line, spells `doneText` and stops. @default true */
  active?: boolean;
  /** What stays spelled once inactive. @default the last phrase */
  doneText?: string;
  /** How fast the code is sent, 0.5 to 2: one unit is 50ms at 1. @default 1 */
  speed?: number;
  /** A signal lamp that flashes with the code and lights the mark being drawn. @default true */
  lamp?: boolean;
  /** How long the marks stay lit on the track, 0 (a fading ghost) to 1 (until the word is spelled). @default 0.6 */
  trail?: number;
  /** Play the key under the visitor's hand. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep sending, but the key cannot be pressed. */
  disabled?: boolean;
  /** A phrase began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  /** A word of the phrase began to be sent: its index in the phrase. */
  onWordChange?: (word: number) => void;
  className?: string;
};

/** One unit at speed 1, s: 24 words a minute. */
const UNIT = 0.05;
/** Track px per unit, at most; less when a word's code would not fit. */
const PX = 4;
/** A word space is at least this long, s at speed 1: spaced timing, the elements stay at full speed. */
const WORD_GAP = 0.5;
/** A spelled phrase's rest, s at speed 1. */
const HOLD = 1.8;
/** The spelled phrase fading before the next, s at speed 1. */
const CLEAR = 0.32;
/** The longest mark a held key draws, units. */
const LONGEST = 7;
/** The rail sits this far above the bottom of each line box, px. */
const RAIL = 7;
/** Where marks decay to at `trail` 0, and how fast, s. */
const GHOST = 0.18;
const DECAY = 0.25;
/** Everything, as a count: a spelled phrase shows all its words. */
const ALL = Number.MAX_SAFE_INTEGER;

// The lamp is a lens of amber glass: pigment, the same in both themes.
const AMBER = "oklch(0.84 0.16 75)";
const AMBER_GLOW = "oklch(0.84 0.16 75 / 0.55)";
const LENS =
  "radial-gradient(circle at 38% 34%, oklch(0.97 0.06 90), oklch(0.86 0.16 75) 45%, oklch(0.7 0.17 55))";
const GLASS =
  "radial-gradient(circle at 38% 34%, color-mix(in oklab, var(--ink-3) 30%, var(--card)), color-mix(in oklab, var(--ink-3) 55%, var(--card)))";

const MORSE: Record<string, string> = {
  a: ".-",
  b: "-...",
  c: "-.-.",
  d: "-..",
  e: ".",
  f: "..-.",
  g: "--.",
  h: "....",
  i: "..",
  j: ".---",
  k: "-.-",
  l: ".-..",
  m: "--",
  n: "-.",
  o: "---",
  p: ".--.",
  q: "--.-",
  r: ".-.",
  s: "...",
  t: "-",
  u: "..-",
  v: "...-",
  w: ".--",
  x: "-..-",
  y: "-.--",
  z: "--..",
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "'": ".----.",
  "!": "-.-.--",
  "/": "-..-.",
  "(": "-.--.",
  ")": "-.--.-",
  "&": ".-...",
  ":": "---...",
  ";": "-.-.-.",
  "=": "-...-",
  "+": ".-.-.",
  "-": "-....-",
  '"': ".-..-.",
  "@": ".--.-.",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

type MarkDef = { start: number; end: number };
type LetterDef = {
  /** The letter's index in the phrase. */
  at: number;
  /** Its code's span on the word's clock, units; empty for a letter Morse has no code for. */
  start: number;
  end: number;
  marks: MarkDef[];
};
type WordDef = {
  key: number;
  at: number[];
  letters: LetterDef[];
  /** The clock at the word's last mark. */
  units: number;
};
type Plan = {
  chars: string[];
  words: WordDef[];
  /** One clock per word, in units: each stays where it stopped once sent. */
  clocks: MotionValue<number>[];
};

/**
 * A phrase in International Morse with real ratios: a dot is one unit, a
 * dash three, the gap inside a letter one and between letters three.
 */
function planOf(text: string, sent: boolean): Plan {
  const chars = Array.from(text);
  const words: WordDef[] = [];
  const build = (at: number[], key: number) => {
    let t = 0;
    let any = false;
    const letters = at.map((i): LetterDef => {
      const code = MORSE[(chars[i] ?? "").toLowerCase()] ?? "";
      if (!code) return { at: i, start: t, end: t, marks: [] };
      if (any) t += 3;
      any = true;
      const start = t;
      const marks: MarkDef[] = [];
      Array.from(code).forEach((symbol, k) => {
        if (k > 0) t += 1;
        const len = symbol === "-" ? 3 : 1;
        marks.push({ start: t, end: t + len });
        t += len;
      });
      return { at: i, start, end: t, marks };
    });
    words.push({ key, at, letters, units: t });
  };
  let current: number[] = [];
  chars.forEach((ch, i) => {
    if (ch.trim() === "") {
      if (current.length) build(current, i);
      current = [];
      return;
    }
    current.push(i);
  });
  if (current.length) build(current, chars.length);
  return {
    chars,
    words,
    clocks: words.map((w) => motionValue(sent ? w.units + 3 : 0)),
  };
}

type Box = { x: number; y: number; w: number };
type Run = { x0: number; u: number; rail: number };
type Layout = {
  width: number;
  lineH: number;
  boxes: (Box | null)[];
  rails: number[];
  runs: (Run | null)[];
};

type Slot = { n: number; index: number; text: string; final: boolean };
type View = { resolved: number; sending: number; leaving: boolean };

type Phase = "send" | "gap" | "hold" | "clear" | "done";
type Engine = {
  phase: Phase;
  word: number;
  timer: number | null;
  /** When the pending beat is due (performance.now ms); kept across a pause. */
  until: number | null;
  /** What was left of that wait when the line was paused, ms. */
  left: number | null;
};

type Visit = {
  id: number;
  x: number;
  y: number;
  /** The word it was drawn over, or -1 for a mark on an idle line. */
  word: number;
  w: MotionValue<number>;
  o: MotionValue<number>;
  dy: MotionValue<number>;
};

type Api = {
  resume: () => void;
  pause: () => void;
  resolveWord: () => void;
  nextWord: () => void;
  clear: () => void;
  advance: () => void;
  turn: (on: boolean) => void;
  follow: (c: number) => void;
  settleHead: () => void;
  measure: () => void;
  fadeIdle: () => void;
  keyUp: (source: string) => void;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

const litAt = (word: WordDef | undefined, c: number) => {
  if (!word) return false;
  for (const letter of word.letters) {
    if (c < letter.start || c >= letter.end) continue;
    for (const m of letter.marks) if (c >= m.start && c < m.end) return true;
  }
  return false;
};

/** One dot or dash, drawn by the head as the clock passes over it. */
function Mark({
  clock,
  mark,
  letterStart,
  u,
  thick,
  floor,
  rate,
  lamp,
  motionSafe,
}: {
  clock: MotionValue<number>;
  mark: MarkDef;
  letterStart: number;
  u: number;
  thick: number;
  floor: number;
  rate: number;
  lamp: boolean;
  motionSafe: boolean;
}) {
  const len = mark.end - mark.start;
  // Under reduced motion a letter's code appears whole when its time comes.
  const width = useTransform(clock, (c) =>
    motionSafe
      ? r2(clamp(c - mark.start, 0, len) * u)
      : c >= letterStart
        ? r2(len * u)
        : 0,
  );
  // A mark is a record of light: it decays toward `floor` as it ages.
  const opacity = useTransform(clock, (c) => {
    const age = ((c - mark.end) * UNIT) / rate;
    if (age <= 0) return 1;
    return r2(floor + (1 - floor) * Math.exp(-age / DECAY));
  });
  const lit = useTransform(clock, (c) =>
    lamp && motionSafe && c >= mark.start && c < mark.end ? 1 : 0,
  );
  const background = useTransform(lit, (l) =>
    l > 0.5 ? AMBER : "var(--foreground)",
  );
  const boxShadow = useTransform(lit, (l) =>
    l > 0.5 ? `0 0 6px 1px ${AMBER_GLOW}` : "none",
  );
  return (
    <motion.span
      className="absolute top-0 rounded-full"
      style={{
        left: r2((mark.start - letterStart) * u),
        height: thick,
        width,
        opacity,
        background,
        boxShadow,
      }}
    />
  );
}

function Lamp({ glow }: { glow: MotionValue<number> }) {
  const shine = useTransform(glow, (g) =>
    g > 0.01
      ? `0 0 ${r2(4 + 8 * g)}px ${r2(1 + 2 * g)}px ${AMBER_GLOW}`
      : "none",
  );
  return (
    <span
      aria-hidden
      className="relative mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline-strong bg-surface-2 @md:mt-2"
    >
      <span
        className="size-3.5 rounded-full shadow-[inset_0_1px_1px_oklch(0_0_0/0.25)]"
        style={{ background: GLASS }}
      />
      <motion.span
        className="absolute size-3.5 rounded-full"
        style={{ opacity: glow, background: LENS, boxShadow: shine }}
      />
    </span>
  );
}

/**
 * A status line sent in Morse before it is spelled. A signal lamp taps each
 * word out with real Morse ratios — a dot one unit, a dash three, a letter
 * space three, a word space seven or more — and a head travelling the track
 * under the line draws each element as it is sent, so a dash is three dots
 * long because the lamp was on three times as long. When a word is complete
 * each letter's marks lift off the track and condense into the printed
 * letter on the glide spring while the letter resolves out of them; the head
 * glides on to the next word. A spelled phrase rests, fades, and the next is
 * sent.
 *
 * The telegraph key is a real button: pressed, its lever dips on flick and
 * springs back on snap, the lamp lights, and the visitor's own mark is drawn
 * at the head for as long as it is held — a tap is a dot, a hold a dash. Space
 * and Enter do the same, held or tapped. Every mark derives from one clock per
 * word; it runs only while the line is on screen in a visible page. The
 * phrase is in a polite live region, announced once. Under reduced motion the
 * lamp glows steadily, each letter's code appears whole, and letters resolve
 * with a fade.
 */
export function MorseStatus({
  phrases,
  active = true,
  doneText,
  speed = 1,
  lamp = true,
  trail = 0.6,
  sound = false,
  disabled = false,
  onPhraseChange,
  onWordChange,
  className,
}: MorseStatusProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rate = clamp(speed, 0.5, 2);
  const unitSec = UNIT / rate;
  const persist = clamp(trail, 0, 1);
  const floor = r2(GHOST + (1 - GHOST) * persist);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const list = phrases.length > 0 ? phrases : [doneText ?? ""];
  const done = doneText ?? list[list.length - 1] ?? "";

  const [slot, setSlot] = React.useState<Slot>(() =>
    active
      ? { n: 0, index: 0, text: list[0] ?? "", final: false }
      : { n: 0, index: -1, text: done, final: true },
  );
  const plan = React.useMemo(() => planOf(slot.text, slot.final), [slot]);
  const [view, setView] = React.useState<View>(() =>
    slot.final
      ? { resolved: ALL, sending: -1, leaving: false }
      : { resolved: 0, sending: 0, leaving: false },
  );
  const [layout, setLayout] = React.useState<Layout | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  const [visits, setVisits] = React.useState<Visit[]>([]);

  const headX = useMotionValue(0);
  const headY = useMotionValue(0);
  const streak = useMotionValue(0);
  const glow = useMotionValue(0);
  const lever = useMotionValue(0);
  const pressed = useMotionValue(0);

  const textRef = React.useRef<HTMLDivElement | null>(null);
  const keyRef = React.useRef<HTMLButtonElement | null>(null);
  const letters = React.useRef(new Map<string, HTMLSpanElement>());
  const engine = React.useRef<Engine>({
    phase: slot.final ? "done" : "send",
    word: 0,
    timer: null,
    until: null,
    left: null,
  });
  const clockRun = React.useRef<AnimationPlaybackControls | null>(null);
  const headRun = React.useRef<AnimationPlaybackControls[]>([]);
  const leverRun = React.useRef<AnimationPlaybackControls | null>(null);
  const extras = React.useRef(new Set<AnimationPlaybackControls>());
  const autoLit = React.useRef(false);
  const held = React.useRef<{
    source: string;
    visit: Visit;
    grow: AnimationPlaybackControls;
    off: (() => void) | null;
  } | null>(null);
  const park = React.useRef<number | null>(null);
  const idleTimer = React.useRef<number | null>(null);
  const tapTimer = React.useRef<number | null>(null);
  const keyUpAt = React.useRef(-Infinity);
  const detach = React.useRef<(() => void) | null>(null);
  const counter = React.useRef(0);
  const placed = React.useRef(-1);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onPhraseChange, onWordChange });
  const wasActive = React.useRef(active);

  const track = (controls: AnimationPlaybackControls) => {
    const all = extras.current;
    all.add(controls);
    // Finished ones are harmless to stop; only the newest few can be live.
    if (all.size > 48) {
      const oldest = all.values().next().value;
      if (oldest) all.delete(oldest);
    }
    return controls;
  };

  const stopClock = () => {
    clockRun.current?.stop();
    clockRun.current = null;
  };

  const clearTimer = () => {
    const e = engine.current;
    if (e.timer !== null) window.clearTimeout(e.timer);
    e.timer = null;
  };

  const paintLamp = () => {
    const sending = engine.current.phase === "send" && !slot.final;
    glow.set(
      held.current
        ? 1
        : motionSafe
          ? autoLit.current
            ? 1
            : 0
          : sending
            ? 0.7
            : 0,
    );
  };

  const moveHead = (x: number, y: number, glide: boolean) => {
    for (const c of headRun.current) c.stop();
    headRun.current = [];
    streak.set(0);
    if (!glide || !motionSafe) {
      headX.set(r2(x));
      headY.set(r2(y));
      return;
    }
    headRun.current = [
      animate(headX, r2(x), springs.glide),
      animate(headY, r2(y), springs.glide),
    ];
  };

  /** Drops the visitor's marks: over a spelled word, or all of them. */
  const shed = (which: (v: Visit) => boolean, fall: boolean) => {
    for (const v of visits) {
      if (!which(v)) continue;
      if (fall && motionSafe) {
        track(
          animate(v.dy, 5, { duration: durations.base, ease: easings.exit }),
        );
      }
      track(
        animate(v.o, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: () =>
            setVisits((all) => all.filter((x) => x.id !== v.id)),
        }),
      );
    }
  };

  /** The line's next move, from where it stands. */
  const schedule = () => {
    clearTimer();
    stopClock();
    if (!running || !layout) return;
    const e = engine.current;
    const beat = (seconds: number, then: () => void) => {
      const now = performance.now();
      if (e.until === null) {
        e.until = now + (e.left ?? (seconds / rate) * 1000);
        e.left = null;
      }
      e.timer = window.setTimeout(
        () => {
          e.timer = null;
          e.until = null;
          e.left = null;
          then();
        },
        Math.max(0, Math.round(e.until - now)),
      );
    };
    switch (e.phase) {
      case "done":
        return;
      case "send": {
        const word = plan.words[e.word];
        const clock = plan.clocks[e.word];
        if (!word || !clock) {
          e.phase = "hold";
          schedule();
          return;
        }
        paintLamp();
        // The word runs on through the letter space after its last mark.
        const end = word.units + 3;
        const from = clock.get();
        e.until = null;
        e.left = null;
        if (from >= end - 1e-6) {
          resolveWord();
          return;
        }
        clockRun.current = animate(clock, end, {
          duration: (end - from) * unitSec,
          ease: "linear",
          onComplete: () => api.current?.resolveWord(),
        });
        return;
      }
      case "gap":
        beat(Math.max(4 * UNIT, WORD_GAP), () => api.current?.nextWord());
        return;
      case "hold":
        beat(HOLD, () => api.current?.clear());
        return;
      case "clear":
        beat(CLEAR, () => api.current?.advance());
        return;
    }
  };

  /** The word is spelled: its marks condense into the letters. */
  const resolveWord = () => {
    const e = engine.current;
    if (e.phase !== "send") return;
    stopClock();
    e.phase = "gap";
    e.until = null;
    e.left = null;
    autoLit.current = false;
    paintLamp();
    const w = e.word;
    setView((v) => ({ ...v, resolved: Math.max(v.resolved, w + 1) }));
    shed((v) => v.word === w, true);
    const next = layout?.runs[w + 1];
    const rest = next ? { x: next.x0, y: next.rail } : restAt();
    if (rest) moveHead(rest.x, rest.y, true);
    schedule();
  };

  const nextWord = () => {
    const e = engine.current;
    if (e.word + 1 < plan.words.length) {
      e.word += 1;
      e.phase = "send";
      e.until = null;
      e.left = null;
      plan.clocks[e.word]?.set(0);
      const w = e.word;
      setView((v) => ({ ...v, sending: w }));
      report.current.onWordChange?.(w);
      paintLamp();
      schedule();
      return;
    }
    e.phase = "hold";
    e.until = null;
    e.left = null;
    schedule();
  };

  const clear = () => {
    const e = engine.current;
    stopClock();
    clearTimer();
    e.phase = "clear";
    e.until = null;
    e.left = null;
    autoLit.current = false;
    paintLamp();
    setView((v) => ({ ...v, leaving: true }));
    shed(() => true, false);
    schedule();
  };

  const advance = () => {
    clearTimer();
    stopClock();
    const next: Slot = !active
      ? { n: slot.n + 1, index: -1, text: done, final: true }
      : (() => {
          const index = slot.final ? 0 : (slot.index + 1) % list.length;
          return {
            n: slot.n + 1,
            index,
            text: list[index] ?? "",
            final: false,
          };
        })();
    engine.current = {
      phase: next.final ? "done" : "send",
      word: 0,
      timer: null,
      until: null,
      left: null,
    };
    autoLit.current = false;
    setSlot(next);
    setView(
      next.final
        ? { resolved: ALL, sending: -1, leaving: false }
        : { resolved: 0, sending: 0, leaving: false },
    );
    report.current.onPhraseChange?.(next.index);
    if (!next.final) report.current.onWordChange?.(0);
  };

  const turn = (on: boolean) => {
    const e = engine.current;
    if (e.phase === "clear") return;
    if (on ? slot.final : !slot.final) clear();
  };

  /** The head rides the clock of the word being sent. */
  const follow = (c: number) => {
    const e = engine.current;
    const run = layout?.runs[e.word];
    const word = plan.words[e.word];
    if (!run || !word || e.phase !== "send") return;
    for (const h of headRun.current) h.stop();
    headRun.current = [];
    const along = Math.min(c, word.units) * run.u;
    headX.set(r2(run.x0 + along));
    headY.set(run.rail);
    streak.set(r2(Math.min(persist * 44, along)));
    const lit = litAt(word, c);
    if (lit !== autoLit.current) {
      autoLit.current = lit;
      paintLamp();
    }
  };

  /** After a layout or a new phrase: the head goes where the clock says. */
  const settleHead = () => {
    const e = engine.current;
    if (!layout) return;
    if (e.phase === "send") {
      const run = layout.runs[e.word];
      const word = plan.words[e.word];
      const c = plan.clocks[e.word]?.get() ?? 0;
      if (!run || !word) return;
      const x = run.x0 + Math.min(c, word.units) * run.u;
      moveHead(x, run.rail, placed.current !== slot.n && c <= 0);
      placed.current = slot.n;
      return;
    }
    // Spelled: the head rests after the last word.
    const rest = restAt();
    if (rest && placed.current !== slot.n) {
      moveHead(rest.x, rest.y, false);
      placed.current = slot.n;
    }
  };

  /** Just past the phrase's last letter, on its rail. */
  const restAt = () => {
    const lastWord = plan.words[plan.words.length - 1];
    const box = lastWord
      ? layout?.boxes[lastWord.at[lastWord.at.length - 1] ?? -1]
      : null;
    if (!layout || !box) return null;
    return {
      x: Math.min(layout.width - 4, box.x + box.w + 8),
      y: box.y + layout.lineH - RAIL,
    };
  };

  const measure = () => {
    const block = textRef.current;
    if (!block) return;
    const rect = block.getBoundingClientRect();
    const width = r2(block.clientWidth);
    const lineH = parseFloat(getComputedStyle(block).lineHeight) || 44;
    const boxes = plan.chars.map((_, i): Box | null => {
      const node = letters.current.get(`${slot.n}:${i}`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {
        x: r2(r.left - rect.left),
        y: r2(r.top - rect.top),
        w: r2(r.width),
      };
    });
    const tops = new Set<number>();
    for (const b of boxes) if (b) tops.add(Math.round(b.y));
    const runs = plan.words.map((word): Run | null => {
      const first = boxes[word.at[0] ?? -1];
      if (!first) return null;
      // The code starts under the word's first letter, shifted left only as
      // far as it must to stay inside the line; a long word packs tighter.
      const u = r2(clamp((width - 4) / Math.max(1, word.units), 1.2, PX));
      const x0 = r2(clamp(first.x, 0, Math.max(0, width - word.units * u - 2)));
      return { x0, u, rail: r2(first.y + lineH - RAIL) };
    });
    setLayout({
      width,
      lineH,
      boxes,
      rails: [...tops].sort((a, b) => a - b).map((t) => r2(t + lineH - RAIL)),
      runs,
    });
  };

  /** Marks drawn on an idle line fade, and the head goes home. */
  const fadeIdle = () => {
    idleTimer.current = null;
    if (held.current) return;
    shed((v) => v.word < 0, false);
    if (park.current !== null && engine.current.phase !== "send") {
      moveHead(park.current, headY.get(), true);
    }
    park.current = null;
  };

  // --- The key ---------------------------------------------------------

  const unitOf = () => {
    const run = layout?.runs[Math.max(0, engine.current.word)];
    return run?.u ?? PX;
  };

  const keyDown = (source: string) => {
    if (disabled || held.current) return;
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = null;
    const e = engine.current;
    const sending = e.phase === "send" && !slot.final;
    const u = unitOf();
    counter.current += 1;
    const visit: Visit = {
      id: counter.current,
      x: r2(headX.get()),
      y: r2(headY.get()),
      word: sending ? e.word : -1,
      w: motionValue(0),
      o: motionValue(1),
      dy: motionValue(0),
    };
    // Held, the key draws for as long as the line is closed, at the tape's
    // own speed, so the visitor's dash is as long as the operator's.
    const grow = animate(visit.w, r2(LONGEST * u), {
      duration: LONGEST * unitSec,
      ease: "linear",
    });
    let off: (() => void) | null = null;
    if (!sending) {
      // An idle line's tape moves only while the key is down.
      for (const h of headRun.current) h.stop();
      headRun.current = [];
      if (park.current === null) park.current = headX.get();
      off = visit.w.on("change", (w) => headX.set(r2(visit.x + w)));
    }
    held.current = { source, visit, grow, off };
    setVisits((all) => [...all.slice(-24), visit]);
    paintLamp();
    leverRun.current?.stop();
    if (motionSafe) leverRun.current = animate(lever, -8, springs.flick);
    pressed.set(1);
    const pan = keyRef.current
      ? panFrom(keyRef.current.getBoundingClientRect().left + 22, null)
      : 0;
    audio.play("click", { pitch: 1, gain: 0.5, pan });
  };

  const keyUp = (source: string) => {
    const h = held.current;
    if (!h || h.source !== source) return;
    held.current = null;
    h.grow.stop();
    h.off?.();
    const u = unitOf();
    if (h.visit.w.get() < u) h.visit.w.set(r2(u));
    if (h.visit.word < 0) {
      headX.set(r2(h.visit.x + h.visit.w.get() + u));
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(
        () => api.current?.fadeIdle(),
        Math.round(1100 / rate),
      );
    }
    paintLamp();
    leverRun.current?.stop();
    if (motionSafe) leverRun.current = animate(lever, 0, springs.snap);
    pressed.set(0);
    const pan = keyRef.current
      ? panFrom(keyRef.current.getBoundingClientRect().left + 22, null)
      : 0;
    audio.play("tick", { pitch: 0.8, gain: 0.35, pan });
  };

  React.useLayoutEffect(() => {
    api.current = {
      resume: schedule,
      pause: () => {
        clearTimer();
        stopClock();
        // Off screen or hidden, a wait is frozen, not spent.
        const e = engine.current;
        if (e.until !== null) {
          e.left = Math.max(0, e.until - performance.now());
          e.until = null;
        }
      },
      resolveWord,
      nextWord,
      clear,
      advance,
      turn,
      follow,
      settleHead,
      measure,
      fadeIdle,
      keyUp,
    };
    report.current = { onPhraseChange, onWordChange };
  });

  // The first phrase and word are state too: reported from the first commit.
  React.useEffect(() => {
    report.current.onPhraseChange?.(slot.index);
    if (!slot.final) report.current.onWordChange?.(0);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (wasActive.current === active) return;
    wasActive.current = active;
    api.current?.turn(active);
  }, [active]);

  const ready = layout !== null;
  React.useEffect(() => {
    api.current?.resume();
    return () => api.current?.pause();
  }, [slot, view.sending, view.resolved, view.leaving, running, rate, ready]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [plan]);

  React.useLayoutEffect(() => {
    api.current?.settleHead();
  }, [layout]);

  React.useEffect(() => {
    const clock = plan.clocks[view.sending];
    if (!clock) return;
    return clock.on("change", (c) => api.current?.follow(c));
  }, [plan, view.sending]);

  // A key held when the page goes away, or the key being disabled, lets go.
  React.useEffect(() => {
    const letGo = () => {
      const h = held.current;
      if (h) api.current?.keyUp(h.source);
    };
    const onVisibility = () => {
      if (document.hidden) letGo();
    };
    window.addEventListener("blur", letGo);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", letGo);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    const h = held.current;
    if (disabled && h) api.current?.keyUp(h.source);
  }, [disabled]);

  React.useEffect(() => {
    const running = extras.current;
    return () => {
      clockRun.current?.stop();
      clockRun.current = null;
      for (const c of headRun.current) c.stop();
      headRun.current = [];
      leverRun.current?.stop();
      for (const c of running) c.stop();
      running.clear();
      held.current?.grow.stop();
      held.current?.off?.();
      held.current = null;
      detach.current?.();
      detach.current = null;
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
      tapTimer.current = null;
      const e = engine.current;
      if (e.timer !== null) window.clearTimeout(e.timer);
      e.timer = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const bindText = React.useCallback((node: HTMLDivElement | null) => {
    textRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setHeight(Math.round(node.offsetHeight));
      api.current?.measure();
    });
    sizer.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => sizer.disconnect();
  }, []);

  const bindLetter = (key: string) => (node: HTMLSpanElement | null) => {
    if (node) letters.current.set(key, node);
    else letters.current.delete(key);
  };

  const headLeft = useTransform(headX, (x) => r2(x - 3.5));
  const headTop = useTransform(headY, (y) => r2(y - 3.5));
  const streakLeft = useTransform(
    [headX, streak] as MotionValue<number>[],
    ([x = 0, s = 0]: number[]) => r2(x - s),
  );
  const streakTop = useTransform(headY, (y) => r2(y - 1));
  const headFill = useTransform(glow, (g) =>
    lamp && g > 0.5 ? AMBER : "var(--foreground)",
  );
  const headShine = useTransform(glow, (g) =>
    lamp && g > 0.5 ? `0 0 8px 2px ${AMBER_GLOW}` : "none",
  );
  const contact = useTransform(pressed, (p) => r2(p));
  const knob = useTransform(pressed, (p) => r2(1 - 0.25 * p));

  const sendingNow =
    !slot.final && !view.leaving && view.resolved < plan.words.length;
  const streakFill = lamp
    ? `linear-gradient(90deg, transparent, ${AMBER_GLOW})`
    : "linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 40%, transparent))";

  return (
    <>
      <div
        ref={bindRoot}
        className={cn("@container relative w-full", className)}
        aria-busy={active || undefined}
      >
        <div className="flex items-start gap-3 overflow-clip rounded-3 border border-hairline bg-card px-3 py-1 @md:gap-4 @md:px-4">
          {lamp ? <Lamp glow={glow} /> : null}
          <motion.div
            aria-hidden
            className="relative min-w-0 flex-1"
            initial={false}
            animate={{ height: height ?? "auto" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <div
              key={slot.n}
              ref={bindText}
              className="relative text-[16px] leading-[40px] text-foreground @md:text-[18px] @md:leading-[44px]"
            >
              {layout?.rails.map((y) => (
                <span
                  key={y}
                  className="pointer-events-none absolute inset-x-0 h-px bg-hairline-strong"
                  style={{ top: y }}
                />
              ))}
              {layout
                ? plan.words.map((word, k) => {
                    const run = layout.runs[k];
                    const clock = plan.clocks[k];
                    if (k > view.sending || !run || !clock || slot.final) {
                      return null;
                    }
                    const isResolved = k < view.resolved;
                    const thick = r2(clamp(run.u, 2.5, 4));
                    const n = word.letters.length;
                    return word.letters.map((letter, j) => {
                      const box = layout.boxes[letter.at];
                      if (!letter.marks.length || !box) return null;
                      const gx = run.x0 + letter.start * run.u;
                      const gw = Math.max(
                        1,
                        (letter.end - letter.start) * run.u,
                      );
                      const delay = motionSafe
                        ? r2(j * Math.min(0.035, cascade(n)))
                        : 0;
                      return (
                        <motion.span
                          key={`${k}:${j}`}
                          className="pointer-events-none absolute"
                          style={{
                            left: r2(gx),
                            top: r2(run.rail - thick / 2),
                            width: r2(gw),
                            height: thick,
                          }}
                          initial={false}
                          animate={
                            isResolved
                              ? motionSafe
                                ? {
                                    x: r2(box.x + box.w / 2 - (gx + gw / 2)),
                                    y: r2(box.y + layout.lineH / 2 - run.rail),
                                    scaleX: r2(Math.min(1, (box.w * 0.7) / gw)),
                                    opacity: 0,
                                  }
                                : { opacity: 0 }
                              : view.leaving
                                ? { opacity: 0 }
                                : { x: 0, y: 0, scaleX: 1, opacity: 1 }
                          }
                          transition={
                            isResolved
                              ? {
                                  default: { ...springs.glide, delay },
                                  opacity: {
                                    duration: durations.slow,
                                    ease: easings.exit,
                                    delay: r2(delay + 0.08),
                                  },
                                }
                              : exitFor(durations.base)
                          }
                        >
                          {letter.marks.map((mark) => (
                            <Mark
                              key={mark.start}
                              clock={clock}
                              mark={mark}
                              letterStart={letter.start}
                              u={run.u}
                              thick={thick}
                              floor={floor}
                              rate={rate}
                              lamp={lamp}
                              motionSafe={motionSafe}
                            />
                          ))}
                        </motion.span>
                      );
                    });
                  })
                : null}
              {visits.map((v) => (
                <motion.span
                  key={v.id}
                  className="pointer-events-none absolute h-1 rounded-full bg-cobalt-bright"
                  style={{
                    left: v.x,
                    top: r2(v.y - 2),
                    width: v.w,
                    opacity: v.o,
                    y: v.dy,
                  }}
                />
              ))}
              {layout && motionSafe ? (
                <>
                  <motion.span
                    className="pointer-events-none absolute top-0 left-0 h-0.5 rounded-full"
                    style={{
                      x: streakLeft,
                      y: streakTop,
                      width: streak,
                      opacity: sendingNow ? 0.8 : 0,
                      background: streakFill,
                    }}
                  />
                  <motion.span
                    className="pointer-events-none absolute top-0 left-0 size-[7px] rounded-full"
                    style={{
                      x: headLeft,
                      y: headTop,
                      background: headFill,
                      boxShadow: headShine,
                      opacity: sendingNow ? 1 : 0.4,
                    }}
                  />
                </>
              ) : null}
              {plan.words.map((word, k) => {
                const shown = !view.leaving && k < view.resolved;
                const n = word.at.length;
                return (
                  <React.Fragment key={word.key}>
                    {k > 0 ? " " : null}
                    <span className="inline-block whitespace-nowrap">
                      {word.at.map((i, j) => (
                        <motion.span
                          key={i}
                          ref={bindLetter(`${slot.n}:${i}`)}
                          className="inline-block"
                          initial={false}
                          // The blur is always animated, so a page that
                          // arrives with reduced motion drops the blur the
                          // server drew instead of keeping it.
                          animate={{
                            opacity: shown ? 1 : 0,
                            filter:
                              shown || !motionSafe ? "blur(0px)" : "blur(3px)",
                          }}
                          transition={
                            shown
                              ? {
                                  duration: durations.base,
                                  ease: easings.enter,
                                  delay: motionSafe
                                    ? r2(0.08 + j * Math.min(0.035, cascade(n)))
                                    : 0,
                                }
                              : exitFor(durations.base)
                          }
                        >
                          {plan.chars[i]}
                        </motion.span>
                      ))}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </motion.div>
          <button
            ref={keyRef}
            type="button"
            aria-label="Telegraph key"
            aria-describedby={hintId}
            disabled={disabled}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              const id = event.pointerId;
              detach.current?.();
              const up = (e: PointerEvent) => {
                if (e.pointerId !== id) return;
                detach.current?.();
                detach.current = null;
                api.current?.keyUp("pointer");
              };
              window.addEventListener("pointerup", up);
              window.addEventListener("pointercancel", up);
              detach.current = () => {
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", up);
              };
              keyDown("pointer");
            }}
            onKeyDown={(event) => {
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              if (!event.repeat) keyDown("key");
            }}
            onKeyUp={(event) => {
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              keyUpAt.current = performance.now();
              keyUp("key");
            }}
            onBlur={() => keyUp("key")}
            onClick={(event) => {
              // A click with no pointer and no key behind it — assistive
              // technology — sends one dot.
              if (event.detail !== 0 || held.current) return;
              if (performance.now() - keyUpAt.current < 80) return;
              keyDown("assist");
              if (tapTimer.current !== null) {
                window.clearTimeout(tapTimer.current);
              }
              tapTimer.current = window.setTimeout(
                () => {
                  tapTimer.current = null;
                  api.current?.keyUp("assist");
                },
                Math.round(unitSec * 1000),
              );
            }}
            onContextMenu={(event) => event.preventDefault()}
            className={cn(
              "mt-0.5 flex h-9 w-11 shrink-0 touch-manipulation items-center justify-center rounded-2 outline-none select-none [-webkit-touch-callout:none] @md:mt-1",
              "transition-colors hover:bg-surface-2",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
              !disabled && "cursor-pointer",
            )}
          >
            <svg
              aria-hidden
              width={44}
              height={36}
              viewBox="0 0 44 36"
              className="block"
            >
              <rect
                x={3}
                y={29.5}
                width={38}
                height={4}
                rx={2}
                className="fill-surface-2 stroke-hairline-strong"
              />
              <rect
                x={6}
                y={25.5}
                width={32}
                height={4.5}
                rx={1.5}
                className="fill-ink-3/35"
              />
              <rect
                x={31}
                y={15.5}
                width={5}
                height={10.5}
                rx={1}
                className="fill-ink-3/70"
              />
              <rect
                x={9.5}
                y={23}
                width={5}
                height={3}
                rx={0.8}
                className="fill-ink-3/70"
              />
              <motion.circle
                cx={12}
                cy={23}
                r={2.2}
                style={{
                  opacity: contact,
                  fill: lamp ? AMBER : "var(--accent-bright)",
                }}
              />
              {/* The lever turns about its pivot: the origin is the pivot's
                  place in the group's box, which the clear rect fixes. */}
              <motion.g
                style={{
                  rotate: lever,
                  originX: 0.8125,
                  originY: 0.8,
                }}
              >
                <rect x={1} y={6} width={40} height={15} fill="transparent" />
                <rect
                  x={8}
                  y={16.5}
                  width={30}
                  height={3}
                  rx={1.5}
                  className="fill-ink-2"
                />
                <rect
                  x={11}
                  y={12}
                  width={2}
                  height={5}
                  className="fill-ink-2"
                />
                <motion.ellipse
                  cx={12}
                  cy={10}
                  rx={6.5}
                  ry={3.6}
                  className="fill-foreground"
                  style={{ opacity: knob }}
                />
                <ellipse
                  cx={10.4}
                  cy={8.9}
                  rx={2.8}
                  ry={1.1}
                  className="fill-background/35"
                />
              </motion.g>
              <circle cx={33.5} cy={18} r={1.3} className="fill-surface-2" />
            </svg>
          </button>
        </div>
        <span id={hintId} className="sr-only">
          Press to send a dot; hold for a dash.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {slot.text}
      </p>
    </>
  );
}
