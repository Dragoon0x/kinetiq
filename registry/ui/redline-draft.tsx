"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RedlineInk = "red" | "blue" | "green";
export type RedlineMarks = "few" | "many";

export type RedlineDraftProps = {
  /** The status phrases, each drafted, marked up and set clean, cycled in order. */
  phrases: string[];
  /** The rough draft each phrase starts as, index for index. Without it a draft is made from the phrase. */
  drafts?: string[];
  /** Editing. False sets `doneText` clean and stops. @default true */
  active?: boolean;
  /** What stays once inactive. @default the last phrase */
  doneText?: string;
  /** How fast the draft is typed, marked and rested, 0.5 to 2. @default 1 */
  speed?: number;
  /** The editor's pen. @default "red" */
  ink?: RedlineInk;
  /** How rough a made draft is: one or two edits, or three or four. @default "few" */
  marks?: RedlineMarks;
  /** Play the visitor's strikes and ticks. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep editing, but the visitor cannot strike. */
  disabled?: boolean;
  /** A phrase began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  className?: string;
};

/** The pen's ink: text tokens, so every mark reads in both themes. */
const INKS: Record<RedlineInk, string> = {
  red: "var(--danger)",
  blue: "var(--accent-bright)",
  green: "var(--success)",
};

/** Stronger words a draft is written without: the phrase's word, then the weaker one. */
const WEAKER: Record<string, string> = {
  checking: "looking at",
  drafting: "writing up",
  preparing: "getting ready",
  sending: "passing",
  fetching: "grabbing",
  loading: "getting",
  syncing: "updating",
  verifying: "checking on",
  building: "making",
  compiling: "gathering",
  uploading: "putting up",
  saving: "keeping",
  reviewing: "going over",
  finishing: "wrapping up",
  analysing: "looking into",
  analyzing: "looking into",
  confirming: "making sure of",
  processing: "handling",
  generating: "making",
  settling: "sorting out",
  scheduling: "setting up",
  figures: "numbers",
  summary: "overview",
  report: "write-up",
  results: "numbers",
  totals: "sums",
  invoice: "bill",
  receipt: "slip",
  review: "a look",
  details: "bits",
  transfer: "payment",
  securely: "safely",
  almost: "nearly",
};

/** Small words a hurried draft leaves out. */
const DROPPABLE = new Set([
  "the",
  "your",
  "a",
  "an",
  "to",
  "for",
  "and",
  "of",
  "it",
  "in",
  "on",
  "our",
  "this",
]);

/** Seconds at speed 1. */
const READ = 0.4;
const ARRIVE = 0.18;
const CURL = 0.12;
const CARET = 0.12;
const GAP = 0.14;
const REVIEW = 0.35;
const SETTLE = 0.5;
const HOLD = 1.8;
/** A strike must cover this share of a word to take it. */
const TAKE = 0.6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same draft and the same hand every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Tok =
  | { id: string; kind: "keep"; text: string }
  | { id: string; kind: "del"; text: string }
  | { id: string; kind: "rep"; old: string; text: string }
  | { id: string; kind: "ins"; text: string };

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
const keyOf = (word: string) => word.toLowerCase().replace(/[^\p{L}]/gu, "");

/** A weaker word in the phrase word's own case and punctuation. */
function weakerOf(word: string): string | null {
  const weak = WEAKER[keyOf(word)];
  if (!weak) return null;
  const tail = /[^\p{L}]+$/u.exec(word)?.[0] ?? "";
  const cased =
    word[0] && word[0] !== word[0].toLowerCase()
      ? weak.charAt(0).toUpperCase() + weak.slice(1)
      : weak;
  return cased + tail;
}

/**
 * A rough draft of the phrase, as edits against it: weaker word choices, a
 * small word left out, a filler to strike. Seeded by the phrase, so the same
 * phrase always gets the same draft.
 */
function draftOf(clean: string, marks: RedlineMarks): Tok[] {
  const words = wordsOf(clean);
  const rand = lcg(hash(clean) ^ (marks === "many" ? 0x5bd1e995 : 0));
  type Cand = { at: number; kind: "rep" | "ins" | "del"; rank: number };
  const cands: Cand[] = [];
  words.forEach((word, i) => {
    const key = keyOf(word);
    if (weakerOf(word)) cands.push({ at: i, kind: "rep", rank: rand() });
    if (i > 0 && i < words.length - 1 && DROPPABLE.has(key)) {
      cands.push({ at: i, kind: "ins", rank: 1 + rand() });
    }
    // "all the figures": a filler before a plural, struck out.
    const after = words[i + 1];
    if (
      (key === "the" || key === "your" || key === "our") &&
      after &&
      /s$/i.test(keyOf(after))
    ) {
      cands.push({ at: i, kind: "del", rank: 2 + rand() });
    }
  });
  const last = words[words.length - 1] ?? "";
  if (/\p{L}$/u.test(last)) {
    cands.push({ at: words.length, kind: "del", rank: 2.5 + rand() });
  }
  cands.sort((a, b) => a.rank - b.rank);
  const want =
    marks === "many" ? 3 + (rand() < 0.5 ? 0 : 1) : 1 + (rand() < 0.5 ? 0 : 1);
  const picked = new Map<number, Cand>();
  for (const c of cands) {
    if (picked.size >= want) break;
    if (picked.has(c.at)) continue;
    // Two words missing side by side read as a torn page, not a draft.
    if (
      c.kind === "ins" &&
      [c.at - 1, c.at + 1].some((k) => picked.get(k)?.kind === "ins")
    ) {
      continue;
    }
    picked.set(c.at, c);
  }
  const toks: Tok[] = [];
  let n = 0;
  const id = () => String((n += 1));
  words.forEach((word, i) => {
    const edit = picked.get(i);
    if (edit?.kind === "del") {
      toks.push({ id: id(), kind: "del", text: i === 0 ? "All" : "all" });
      toks.push({ id: id(), kind: "keep", text: word });
    } else if (edit?.kind === "rep") {
      toks.push({
        id: id(),
        kind: "rep",
        old: weakerOf(word) ?? word,
        text: word,
      });
    } else if (edit?.kind === "ins") {
      toks.push({ id: id(), kind: "ins", text: word });
    } else {
      toks.push({ id: id(), kind: "keep", text: word });
    }
  });
  if (picked.get(words.length)?.kind === "del") {
    toks.push({ id: id(), kind: "del", text: "now" });
  }
  return toks;
}

/** A given draft against its phrase: a word diff, grouped into edits. */
function diffOf(draft: string, clean: string): Tok[] {
  const a = wordsOf(draft);
  const b = wordsOf(clean);
  const same = (x: string, y: string) =>
    keyOf(x) === keyOf(y) && keyOf(x) !== "";
  const L = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = L[i] as number[];
      row[j] = same(a[i] ?? "", b[j] ?? "")
        ? (L[i + 1]?.[j + 1] ?? 0) + 1
        : Math.max(L[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const toks: Tok[] = [];
  let n = 0;
  const id = () => String((n += 1));
  let dels: string[] = [];
  let inss: string[] = [];
  const flush = () => {
    if (dels.length && inss.length) {
      toks.push({
        id: id(),
        kind: "rep",
        old: dels.join(" "),
        text: inss.join(" "),
      });
    } else if (dels.length) {
      toks.push({ id: id(), kind: "del", text: dels.join(" ") });
    } else if (inss.length) {
      toks.push({ id: id(), kind: "ins", text: inss.join(" ") });
    }
    dels = [];
    inss = [];
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && same(a[i] ?? "", b[j] ?? "")) {
      flush();
      toks.push({ id: id(), kind: "keep", text: b[j] ?? "" });
      i += 1;
      j += 1;
    } else if (
      j < b.length &&
      (i >= a.length || (L[i]?.[j + 1] ?? 0) >= (L[i + 1]?.[j] ?? 0))
    ) {
      inss.push(b[j] ?? "");
      j += 1;
    } else {
      dels.push(a[i] ?? "");
      i += 1;
    }
  }
  flush();
  return toks;
}

/** What the draft line shows of a token, before any marks. */
const draftText = (tok: Tok) =>
  tok.kind === "rep" ? tok.old : tok.kind === "ins" ? "" : tok.text;

type Timeline = {
  /** Per token, per character: when it is typed. */
  typed: number[][];
  typedEnd: number;
  arrive: number[];
  strike: number[];
  strikeDur: number[];
  curl: number[];
  caret: number[];
  write: number[];
  writeDur: number[];
  /** The editor's order of work: token indices. */
  order: number[];
  marksStart: number;
  marksEnd: number;
  cleanAt: number;
  holdEnd: number;
};

function timelineOf(
  toks: Tok[],
  taken: ReadonlySet<string>,
  motionSafe: boolean,
  seed: number,
): Timeline {
  const rand = lcg(seed);
  const n = toks.length;
  const none = () => new Array<number>(n).fill(-1);
  const arrive = none();
  const strike = none();
  const strikeDur = none();
  const curl = none();
  const caret = none();
  const write = none();
  const writeDur = none();
  const chars = toks.reduce(
    (sum, t) => sum + Array.from(draftText(t)).length,
    0,
  );
  // Long drafts are typed a little faster, so none takes more than ~1.3s.
  const step = Math.min(0.045, 1.3 / Math.max(1, chars));
  let t = 0.15;
  const typed = toks.map((tok) => {
    const times = Array.from(draftText(tok)).map(() => {
      const at = motionSafe ? t : 0.1;
      t += step * (0.7 + rand() * 0.6);
      return at;
    });
    if (times.length) t += step * 1.2;
    return times;
  });
  const typedEnd = motionSafe ? t : 0.1 + 0.25 + Math.min(1.3, chars * step);
  t = typedEnd + READ;
  const marksStart = t;
  const order: number[] = [];
  toks.forEach((tok, i) => {
    if (tok.kind === "keep" || taken.has(tok.id)) return;
    order.push(i);
    arrive[i] = t;
    if (motionSafe) t += ARRIVE;
    if (tok.kind === "del" || tok.kind === "rep") {
      const len = Array.from(tok.kind === "rep" ? tok.old : tok.text).length;
      strike[i] = t;
      strikeDur[i] = motionSafe ? Math.min(0.42, 0.16 + len * 0.018) : 0.2;
      if (motionSafe) t += strikeDur[i] as number;
    }
    if (tok.kind === "del") {
      curl[i] = t;
      if (motionSafe) t += CURL;
    }
    if (tok.kind === "rep" || tok.kind === "ins") {
      caret[i] = t;
      if (motionSafe) t += CARET;
      write[i] = t;
      writeDur[i] = motionSafe
        ? Math.min(0.6, 0.1 + Array.from(tok.text).length * 0.045)
        : 0.2;
      if (motionSafe) t += writeDur[i] as number;
    }
    t += motionSafe ? GAP : 0.55;
  });
  const marksEnd = t;
  const cleanAt = marksEnd + REVIEW;
  return {
    typed,
    typedEnd,
    arrive,
    strike,
    strikeDur,
    curl,
    caret,
    write,
    writeDur,
    order,
    marksStart,
    marksEnd,
    cleanAt,
    holdEnd: cleanAt + SETTLE + HOLD,
  };
}

const sweepOf = (at: number, dur: number, t: number) =>
  at < 0 ? 0 : clamp01((t - at) / Math.max(0.01, dur));

type Hand = {
  /** The visitor's strike across this word, as shares of its width. */
  a: MotionValue<number>;
  b: MotionValue<number>;
  on: MotionValue<number>;
  /** A taken edit's caret and word, written at once. */
  write: MotionValue<number>;
  /** Stet: the note that answers a strike on a good word. */
  stet: MotionValue<number>;
  /** A written word moved right, clear of the one before it on its line. */
  nudge: MotionValue<number>;
};

type Flip = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  ink: MotionValue<number>;
  shown: MotionValue<number>;
};

type Slot = { n: number; index: number; text: string; final: boolean };

const STRIKE_PATH = "M0 6 C18 3.5 32 7.5 50 5.2 S82 3.2 100 5.6";
const CURL_PATH = "M1 9 C4 2 10 1 10 5 C10 9 5 9 5 6 C5 3 9 0 13 1";
const CARET_PATH = "M1 9 L6 1.5 L11 9";

type DraftTokenProps = {
  tok: Tok;
  at: number;
  clock: MotionValue<number>;
  tl: Timeline;
  hand: Hand;
  motionSafe: boolean;
  lit: boolean;
  gone: boolean;
  bindWord: (node: HTMLSpanElement | null) => void;
  bindAbove: (node: HTMLSpanElement | null) => void;
};

function TypedChar({
  ch,
  at,
  next,
  clock,
  motionSafe,
}: {
  ch: string;
  at: number;
  next: number;
  clock: MotionValue<number>;
  motionSafe: boolean;
}) {
  const opacity = useTransform(clock, (t) =>
    motionSafe ? (t >= at ? 1 : 0) : r2(clamp01((t - at) / 0.25)),
  );
  // The text cursor sits after the last character typed, and blinks while
  // the draft is read over.
  const cursor = useTransform(clock, (t) =>
    motionSafe && t >= at && t < next
      ? next - at > 0.3
        ? Math.floor((t - at) * 2.4) % 2 === 0
          ? 1
          : 0
        : 1
      : 0,
  );
  return (
    <motion.span className="relative" style={{ opacity }}>
      {ch}
      <motion.span
        aria-hidden
        className="absolute top-[0.18em] -right-px h-[0.78em] w-px bg-current"
        style={{ opacity: cursor }}
      />
    </motion.span>
  );
}

function DraftToken({
  tok,
  at,
  clock,
  tl,
  hand,
  motionSafe,
  lit,
  gone,
  bindWord,
  bindAbove,
}: DraftTokenProps) {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `strike-${uid}`;
  const text = draftText(tok);
  const chars = Array.from(text);
  const times = tl.typed[at] ?? [];

  // The strike: the editor's sweep, or the visitor's own stroke.
  const span = useTransform(
    [clock, hand.a, hand.b, hand.on],
    ([t = 0, a = 0, b = 0, on = 0]: number[]) => {
      if (on > 0) return { a, b, o: on };
      const s = sweepOf(tl.strike[at] ?? -1, tl.strikeDur[at] ?? 1, t);
      return { a: 0, b: motionSafe ? s : s > 0 ? 1 : 0, o: s > 0 ? 1 : 0 };
    },
  );
  const clipX = useTransform(span, (s) => r1(s.a * 100));
  const clipW = useTransform(span, (s) => r1(Math.max(0, s.b - s.a) * 100));
  const strikeOn = useTransform(span, (s) => r2(s.o));
  const curl = useTransform([clock, hand.write], ([t = 0, w = 0]: number[]) =>
    Math.max(sweepOf(tl.curl[at] ?? -1, CURL, t), w),
  );
  const curlW = useTransform(curl, (c) =>
    r1((motionSafe ? c : c > 0 ? 1 : 0) * 14),
  );
  const caret = useTransform([clock, hand.write], ([t = 0, w = 0]: number[]) =>
    Math.max(sweepOf(tl.caret[at] ?? -1, CARET, t), clamp01(w * 3)),
  );
  const caretW = useTransform(caret, (c) =>
    r1((motionSafe ? c : c > 0 ? 1 : 0) * 12),
  );
  const written = useTransform(
    [clock, hand.write],
    ([t = 0, w = 0]: number[]) =>
      Math.max(
        sweepOf(tl.write[at] ?? -1, tl.writeDur[at] ?? 1, t),
        clamp01((w - 0.25) / 0.75),
      ),
  );
  const aboveClip = useTransform(written, (w) =>
    !motionSafe || w >= 1
      ? "none"
      : `inset(-30% ${r1(100 - w * 100)}% -30% -10%)`,
  );
  const aboveOpacity = useTransform(written, (w) =>
    gone ? 0 : motionSafe ? (w > 0 ? 1 : 0) : r2(w),
  );
  const struckInk = useTransform(span, (s) =>
    s.o > 0 && s.b - s.a > 0.5 ? 0.55 : 1,
  );

  const hasStrike =
    tok.kind === "del" || tok.kind === "rep" || tok.kind === "keep";
  const hasCaret = tok.kind === "rep" || tok.kind === "ins";

  return (
    <span
      data-tok={tok.id}
      className={cn(
        "relative inline-flex shrink-0 whitespace-nowrap",
        tok.kind === "ins" && "-ml-[0.3em] w-0",
      )}
    >
      {lit && tok.kind !== "ins" ? (
        <span
          aria-hidden
          className="absolute inset-x-[-0.18em] top-[0.95em] bottom-[0.85em] rounded-1"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--redline) 13%, transparent)",
          }}
        />
      ) : null}
      <motion.span
        ref={bindWord}
        className="relative"
        style={{ opacity: gone && tok.kind === "keep" ? 0 : struckInk }}
      >
        {chars.map((ch, k) => (
          <TypedChar
            key={k}
            ch={ch}
            at={times[k] ?? 0}
            next={
              times[k + 1] ??
              tl.typed.slice(at + 1).find((row) => row.length)?.[0] ??
              tl.marksStart
            }
            clock={clock}
            motionSafe={motionSafe}
          />
        ))}
      </motion.span>
      {hasStrike ? (
        <motion.svg
          aria-hidden
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          className="pointer-events-none absolute top-[1.36em] -left-[0.1em] h-[0.34em] w-[calc(100%+0.2em)] overflow-visible"
          style={{ opacity: strikeOn, color: "var(--redline)" }}
        >
          <defs>
            <clipPath id={clipId}>
              <motion.rect x={clipX} y={-10} width={clipW} height={30} />
            </clipPath>
          </defs>
          <path
            d={STRIKE_PATH}
            clipPath={`url(#${clipId})`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </motion.svg>
      ) : null}
      {tok.kind === "del" ? (
        <svg
          aria-hidden
          viewBox="0 0 14 10"
          className="pointer-events-none absolute top-[1.05em] left-[calc(100%+0.02em)] h-[0.62em] w-[0.86em] overflow-visible"
          style={{ color: "var(--redline)" }}
        >
          <defs>
            <clipPath id={`${clipId}-curl`}>
              <motion.rect x={0} y={-4} width={curlW} height={18} />
            </clipPath>
          </defs>
          <path
            d={CURL_PATH}
            clipPath={`url(#${clipId}-curl)`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      {hasCaret ? (
        <svg
          aria-hidden
          viewBox="0 0 12 10"
          className="pointer-events-none absolute top-[1.86em] left-1/2 h-[0.46em] w-[0.56em] -translate-x-1/2 overflow-visible"
          style={{ color: "var(--redline)" }}
        >
          <defs>
            <clipPath id={`${clipId}-caret`}>
              <motion.rect x={0} y={-4} width={caretW} height={18} />
            </clipPath>
          </defs>
          <path
            d={CARET_PATH}
            clipPath={`url(#${clipId}-caret)`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      {hasCaret ? (
        <motion.span
          ref={bindAbove}
          className="pointer-events-none absolute top-[0.2em] left-1/2 -translate-x-1/2 -rotate-2 text-[0.78em] leading-none font-medium whitespace-nowrap italic"
          style={{
            color: "var(--redline)",
            clipPath: aboveClip,
            opacity: aboveOpacity,
            x: hand.nudge,
          }}
        >
          {tok.text}
        </motion.span>
      ) : null}
      {tok.kind === "keep" ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[1.98em] flex flex-col items-center gap-[0.12em]"
          style={{ opacity: hand.stet, color: "var(--redline)" }}
        >
          <span className="h-[0.16em] w-full [background-image:radial-gradient(circle,currentColor_42%,transparent_46%)] [background-size:0.32em_100%] bg-repeat-x" />
          <span className="text-[0.56em] leading-none italic">stet</span>
        </motion.span>
      ) : null}
    </span>
  );
}

type CleanTokenProps = {
  tok: Tok;
  flip: Flip;
  fresh: boolean;
  bind: (node: HTMLSpanElement | null) => void;
};

function CleanToken({ tok, flip, fresh, bind }: CleanTokenProps) {
  const inkOpacity = useTransform(flip.ink, (v) => r2(v));
  const textOpacity = useTransform(flip.ink, (v) => r2(1 - v * 0.9));
  return (
    <motion.span
      ref={bind}
      className="relative inline-flex shrink-0 whitespace-nowrap"
      style={{
        x: flip.x,
        y: flip.y,
        scale: flip.scale,
        originX: 0,
        originY: 0,
        opacity: flip.shown,
      }}
    >
      {fresh ? (
        <>
          <motion.span style={{ opacity: textOpacity }}>{tok.text}</motion.span>
          <motion.span
            aria-hidden
            className="absolute inset-0 -rotate-2 font-medium whitespace-nowrap italic"
            style={{ color: "var(--redline)", opacity: inkOpacity }}
          >
            {tok.text}
          </motion.span>
        </>
      ) : (
        tok.text
      )}
    </motion.span>
  );
}

function Nib() {
  return (
    <svg
      viewBox="0 0 16 26"
      className="absolute -top-[26px] -left-[8px] h-[26px] w-[16px] overflow-visible"
    >
      <path
        d="M8 26 L2.6 12.5 Q2.2 6 8 1.2 Q13.8 6 13.4 12.5 Z"
        fill="currentColor"
        stroke="color-mix(in oklab, currentColor 60%, black)"
        strokeWidth={0.6}
      />
      <line
        x1={8}
        x2={8}
        y1={25.4}
        y2={12.5}
        stroke="var(--card)"
        strokeWidth={0.9}
      />
      <circle cx={8} cy={11.4} r={1.5} fill="var(--card)" />
    </svg>
  );
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Box = { left: number; top: number; width: number; height: number };

type Api = {
  play: () => void;
  halt: () => void;
  measure: () => void;
};

/**
 * A status line with an editor at work. Each phrase arrives as a rough
 * draft, typed in behind a text cursor. Then a pen goes through it: weak
 * words are struck through and better ones written above with a caret, a
 * missing word is put in over a caret, and a filler is struck with the
 * delete curl. Then the clean version slides into place — struck words and
 * marks fade where they are, kept words glide to their new places, and each
 * written word comes down from above the line into its slot as its ink
 * turns to text — and the clean phrase is announced.
 *
 * The visitor can edit too: dragging across words strikes them under the
 * pointer, a tap or Enter strikes one. A weak word struck is taken at once
 * and its better word written; a good word struck is marked stet and stands.
 * One clock per phrase drives the typing and every mark through motion
 * values. Under reduced motion the draft appears whole, each edit appears
 * in turn without a sweep, and the clean line cross-fades in.
 */
export function RedlineDraft({
  phrases,
  drafts,
  active = true,
  doneText,
  speed = 1,
  ink = "red",
  marks = "few",
  sound = false,
  disabled = false,
  onPhraseChange,
  className,
}: RedlineDraftProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rate = clamp(speed, 0.5, 2);
  const inkColour = INKS[ink] ?? INKS.red;
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
  const [stage, setStage] = React.useState<{ n: number; clean: boolean }>(
    () => ({
      n: slot.n,
      clean: slot.final,
    }),
  );
  const clean = stage.n === slot.n ? stage.clean : slot.final;
  const [taken, setTaken] = React.useState<{ n: number; ids: string[] }>({
    n: -1,
    ids: [],
  });
  const [said, setSaid] = React.useState(() => (slot.final ? slot.text : ""));
  const [reading, setReading] = React.useState({ n: 0, text: "" });
  const [cursor, setCursor] = React.useState(-1);
  const [hover, setHover] = React.useState<string | null>(null);
  const [keyed, setKeyed] = React.useState(false);
  const [height, setHeight] = React.useState<number | null>(null);

  const draftSource = slot.index >= 0 ? drafts?.[slot.index] : undefined;
  const toks = React.useMemo<Tok[]>(() => {
    if (slot.final) {
      return wordsOf(slot.text).map((text, i) => ({
        id: String(i + 1),
        kind: "keep",
        text,
      }));
    }
    return draftSource
      ? diffOf(draftSource, slot.text)
      : draftOf(slot.text, marks);
    // A slot is drafted once: a new `marks` applies from the next phrase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, draftSource]);
  const takenSet = React.useMemo(
    () => new Set(taken.n === slot.n ? taken.ids : []),
    [taken, slot.n],
  );
  const tl = React.useMemo(
    () => timelineOf(toks, takenSet, motionSafe, hash(slot.text)),
    [toks, takenSet, motionSafe, slot.text],
  );
  const hands = React.useMemo(
    () =>
      toks.map((): Hand => ({
        a: motionValue(0),
        b: motionValue(0),
        on: motionValue(0),
        write: motionValue(0),
        stet: motionValue(0),
        nudge: motionValue(0),
      })),
    [toks],
  );
  const flips = React.useMemo(
    () =>
      toks.map((): Flip => ({
        x: motionValue(0),
        y: motionValue(0),
        scale: motionValue(1),
        ink: motionValue(0),
        shown: motionValue(1),
      })),
    [toks],
  );

  const [firstT] = React.useState(() => (slot.final ? 1e4 : 0));
  const clock = useMotionValue(firstT);
  const layoutTick = useMotionValue(0);

  const lineRef = React.useRef<HTMLDivElement | null>(null);
  const wordNodes = React.useRef(new Map<string, HTMLSpanElement>());
  const aboveNodes = React.useRef(new Map<string, HTMLSpanElement>());
  const cleanNodes = React.useRef(new Map<string, HTMLSpanElement>());
  const boxes = React.useRef(new Map<string, Box>());
  const clockRun = React.useRef<AnimationPlaybackControls | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const loop = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef<number | null>(null);
  const pen = React.useRef<{
    x0: number;
    y: number;
    x: number;
    t: number;
    ids: string[];
  } | null>(null);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onPhraseChange);
  const shownN = React.useRef(slot.n);

  const keyOfTok = (id: string) => `${slot.n}:${id}`;

  const halt = () => {
    clockRun.current?.stop();
    clockRun.current = null;
  };

  const quiet = () => {
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = null;
    loop.current?.stop();
    loop.current = null;
  };

  const advance = () => {
    halt();
    let next: Slot | null;
    if (!active) {
      next = slot.final
        ? null
        : { n: slot.n + 1, index: -1, text: done, final: true };
    } else {
      const index = slot.final ? 0 : (slot.index + 1) % list.length;
      next = { n: slot.n + 1, index, text: list[index] ?? "", final: false };
    }
    if (!next) return;
    for (const c of runs.current) c.stop();
    runs.current = [];
    quiet();
    pen.current = null;
    setHover(null);
    setSlot(next);
    if (next.final) setSaid(next.text);
    report.current?.(next.index);
  };

  /** Runs the phrase's clock to the clean-up, then to the end of its rest. */
  const play = () => {
    halt();
    if (!running) return;
    const t = clock.get();
    if (slot.final) {
      if (active) advance();
      return;
    }
    if (!active) {
      advance();
      return;
    }
    const target = clean ? tl.holdEnd : tl.cleanAt;
    if (t < target - 1e-3) {
      clockRun.current = animate(clock, target, {
        duration: (target - t) / rate,
        ease: "linear",
        onComplete: () => api.current?.play(),
      });
      return;
    }
    if (!clean) {
      setStage({ n: slot.n, clean: true });
      setSaid(slot.text);
      return;
    }
    // A strike in the visitor's hand finishes before the line moves on.
    if (pen.current) return;
    advance();
  };

  /** Word boxes in the line, for the pen and the visitor's strikes. */
  const measure = () => {
    const line = lineRef.current;
    if (!line) return;
    const lr = line.getBoundingClientRect();
    const out = new Map<string, Box>();
    const put = (key: string, node: HTMLElement | undefined) => {
      if (!node) return;
      const r = node.getBoundingClientRect();
      out.set(key, {
        left: r2(r.left - lr.left),
        top: r2(r.top - lr.top),
        width: r2(r.width),
        height: r2(r.height),
      });
    };
    for (const tok of toks) {
      put(`w${tok.id}`, wordNodes.current.get(keyOfTok(tok.id)));
      const node = wordNodes.current.get(keyOfTok(tok.id))?.parentElement;
      if (node) put(`t${tok.id}`, node);
    }
    // Written words never sit on each other: each goes right of the one
    // before it on its line, the way an editor writes where there is room.
    // Their boxes come from layout, centred on the token, so the nudge
    // already applied never feeds back into the next one.
    let prev: Box | null = null;
    toks.forEach((tok, i) => {
      const h = hands[i];
      const shell = out.get(`t${tok.id}`);
      const note = aboveNodes.current.get(keyOfTok(tok.id));
      if (!h || !shell || !note) return;
      const natural: Box = {
        left: r2(shell.left + note.offsetLeft - note.offsetWidth / 2),
        top: r2(shell.top + note.offsetTop),
        width: note.offsetWidth,
        height: note.offsetHeight,
      };
      const nudge =
        prev && Math.abs(prev.top - natural.top) < 6
          ? Math.max(0, prev.left + prev.width + 6 - natural.left)
          : 0;
      h.nudge.set(r2(nudge));
      const placed = { ...natural, left: r2(natural.left + nudge) };
      out.set(`a${tok.id}`, placed);
      prev = placed;
    });
    boxes.current = out;
    layoutTick.set(layoutTick.get() + 1);
  };

  React.useLayoutEffect(() => {
    api.current = { play, halt, measure };
    report.current = onPhraseChange;
  });

  // The first phrase is state too: the host hears it from the first commit.
  React.useEffect(() => {
    report.current?.(slot.index);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new phrase: its clock starts from nothing before it paints.
  React.useLayoutEffect(() => {
    if (shownN.current === slot.n) return;
    shownN.current = slot.n;
    clock.set(slot.final ? 1e4 : 0);
    setCursor(-1);
    api.current?.measure();
  }, [slot.n, slot.final, clock]);

  // The clean version slides into place: every clean word starts where its
  // draft stood — a kept word on its old spot, a written word on its note
  // above the line — and glides home as its ink turns to text.
  React.useLayoutEffect(() => {
    if (!clean || slot.final) return;
    const line = lineRef.current;
    if (!line) return;
    const lr = line.getBoundingClientRect();
    toks.forEach((tok, i) => {
      const flip = flips[i];
      const node = cleanNodes.current.get(keyOfTok(tok.id));
      if (!flip || !node || tok.kind === "del") return;
      const nat = node.getBoundingClientRect();
      const from =
        tok.kind === "keep"
          ? boxes.current.get(`w${tok.id}`)
          : boxes.current.get(`a${tok.id}`);
      const fresh = tok.kind !== "keep";
      if (!motionSafe || !from || nat.width < 1) {
        flip.shown.set(0);
        runs.current.push(
          animate(flip.shown, 1, {
            duration: durations.base,
            ease: easings.enter,
          }),
        );
        return;
      }
      flip.x.jump(r2(lr.left + from.left - nat.left));
      flip.y.jump(r2(lr.top + from.top - nat.top));
      flip.scale.jump(fresh ? r2(from.width / nat.width) : 1);
      flip.ink.jump(fresh ? 1 : 0);
      runs.current.push(
        animate(flip.x, 0, springs.glide),
        animate(flip.y, 0, springs.glide),
        animate(flip.scale, 1, springs.glide),
        animate(flip.ink, 0, { duration: durations.slow, ease: easings.enter }),
      );
    });
    // Once per clean-up of a phrase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clean, slot.n]);

  // Anything that changes where the clock may run restarts it from where it
  // stands: a new phrase or stage, the page or the element coming and going,
  // a speed, a taken edit, the host.
  React.useEffect(() => {
    api.current?.play();
    return () => api.current?.halt();
  }, [slot, clean, running, active, rate, tl]);

  React.useEffect(() => {
    const anims = runs;
    const scratch = loop;
    const hushed = hush;
    return () => {
      for (const c of anims.current) c.stop();
      if (hushed.current !== null) window.clearTimeout(hushed.current);
      scratch.current?.stop();
      scratch.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => watcher.disconnect();
  }, []);

  // The line's own height, so the page grows and shrinks on glide as
  // phrases wrap; and its word boxes, whenever it changes size.
  const bindLine = React.useCallback((node: HTMLDivElement | null) => {
    lineRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setHeight(Math.round(node.offsetHeight));
      api.current?.measure();
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const bindWord = (id: string) => (node: HTMLSpanElement | null) => {
    if (node) wordNodes.current.set(keyOfTok(id), node);
    else wordNodes.current.delete(keyOfTok(id));
  };
  const bindAbove = (id: string) => (node: HTMLSpanElement | null) => {
    if (node) aboveNodes.current.set(keyOfTok(id), node);
    else aboveNodes.current.delete(keyOfTok(id));
  };
  const bindClean = (id: string) => (node: HTMLSpanElement | null) => {
    if (node) cleanNodes.current.set(keyOfTok(id), node);
    else cleanNodes.current.delete(keyOfTok(id));
  };

  // The editor's pen: its point heads for the mark being made, a stiff
  // spring gives it a hand's lag, and a writing wiggle rides on top.
  const target = useTransform([clock, layoutTick], ([t = 0]: number[]) => {
    const b = boxes.current;
    const i =
      tl.order.find((k) => {
        const tok = toks[k];
        if (!tok) return false;
        const end = Math.max(
          (tl.strike[k] ?? -1) + (tl.strikeDur[k] ?? 0),
          (tl.curl[k] ?? -1) + CURL,
          (tl.write[k] ?? -1) + (tl.writeDur[k] ?? 0),
        );
        return end > t;
      }) ?? tl.order[tl.order.length - 1];
    const tok = i === undefined ? undefined : toks[i];
    if (i === undefined || !tok) return { x: 0, y: 0, dy: 0 };
    const word = b.get(`w${tok.id}`) ?? b.get(`t${tok.id}`);
    const shell = b.get(`t${tok.id}`) ?? word;
    const above = b.get(`a${tok.id}`);
    if (!word || !shell) return { x: 0, y: 0, dy: 0 };
    const strikeY = shell.top + shell.height * 0.53;
    const caretY = shell.top + shell.height * 0.68;
    const mid = shell.left + shell.width / 2;
    const strikeAt = tl.strike[i] ?? -1;
    const w = tl.write[i] ?? -1;
    if (w >= 0 && t >= w && above) {
      const u = sweepOf(w, tl.writeDur[i] ?? 1, t);
      return {
        x: above.left + above.width * u,
        y: above.top + above.height * 0.8,
        dy: Math.sin(u * Math.PI * 7) * 1.6,
      };
    }
    const c = tl.caret[i] ?? -1;
    if (c >= 0 && t >= c) return { x: mid, y: caretY, dy: 0 };
    const cu = tl.curl[i] ?? -1;
    if (cu >= 0 && t >= cu) {
      return { x: shell.left + shell.width + 6, y: strikeY - 3, dy: 0 };
    }
    if (strikeAt >= 0) {
      const u = sweepOf(strikeAt, tl.strikeDur[i] ?? 1, t);
      return { x: shell.left + shell.width * u, y: strikeY, dy: 0 };
    }
    return { x: mid, y: caretY, dy: 0 };
  });
  const follow = {
    stiffness: springs.flick.stiffness,
    damping: springs.flick.damping,
    mass: springs.flick.mass,
  };
  const targetX = useTransform(target, (p) => r2(p.x));
  const targetY = useTransform(target, (p) => r2(p.y));
  const wiggle = useTransform(target, (p) => r2(p.dy));
  const springX = useSpring(targetX, follow);
  const springY = useSpring(targetY, follow);
  const penX = useTransform(springX, (x) => r2(x));
  const penY = useTransform([springY, wiggle], ([y = 0, dy = 0]: number[]) =>
    r2(y + dy),
  );
  const penOn = useTransform(clock, (t) =>
    tl.order.length === 0 || !motionSafe
      ? 0
      : r2(
          Math.min(
            clamp01((t - (tl.marksStart - 0.2)) / 0.2),
            1 - clamp01((t - tl.marksEnd) / 0.3),
          ),
        ),
  );

  const strikable = toks
    .map((tok, i) => (tok.kind === "ins" ? -1 : i))
    .filter((i) => i >= 0);

  const say = (text: string) => setReading((r) => ({ n: r.n + 1, text }));

  const panOf = (i: number) => {
    const tok = toks[i];
    const line = lineRef.current;
    const box = tok ? boxes.current.get(`t${tok.id}`) : undefined;
    if (!line || !box) return 0;
    const rect = line.getBoundingClientRect();
    return panFrom(rect.left + box.left + box.width / 2, line);
  };

  const typedOf = (i: number) => {
    const times = tl.typed[i] ?? [];
    return times.length === 0 || clock.get() >= (times[times.length - 1] ?? 0);
  };

  /** What a finished strike across a word does: take it, stet it, or nothing. */
  const settleStrike = (i: number) => {
    const tok = toks[i];
    const h = hands[i];
    if (!tok || !h) return;
    const t = clock.get();
    const full = () =>
      runs.current.push(
        animate(h.a, 0, springs.flick),
        animate(h.b, 1, springs.flick),
      );
    const editorHas = (tl.strike[i] ?? -1) >= 0 && t >= (tl.strike[i] ?? 0);
    if (clean || !typedOf(i)) {
      runs.current.push(animate(h.on, 0, exitFor(durations.fast)));
      return;
    }
    if (
      (tok.kind === "del" || tok.kind === "rep") &&
      !editorHas &&
      !takenSet.has(tok.id)
    ) {
      full();
      setTaken((c) => {
        const ids = c.n === slot.n ? c.ids : [];
        return ids.includes(tok.id) ? c : { n: slot.n, ids: [...ids, tok.id] };
      });
      runs.current.push(
        animate(h.write, 1, {
          duration: motionSafe ? 0.45 / rate : durations.base,
          ease: "linear",
        }),
      );
      audio.play("tick", { pitch: 1.3, gain: 0.5, pan: panOf(i) });
      say(
        tok.kind === "rep"
          ? `${tok.old} struck; ${tok.text} written above.`
          : `${tok.text} struck out.`,
      );
      return;
    }
    if (tok.kind === "keep") {
      full();
      const stet = h.stet;
      runs.current.push(
        animate(stet, 1, {
          duration: durations.base,
          ease: easings.enter,
          delay: motionSafe ? 0.25 : 0,
          onComplete: () => {
            runs.current.push(
              animate(stet, 0, { ...exitFor(durations.slow), delay: 1 }),
              animate(h.on, 0, { ...exitFor(durations.slow), delay: 1 }),
            );
          },
        }),
      );
      audio.play("tick", { pitch: 0.8, gain: 0.35, pan: panOf(i) });
      say(`Stet: ${tok.text} stands.`);
      return;
    }
    // Already struck by the editor: the visitor's stroke draws back.
    runs.current.push(animate(h.on, 0, exitFor(durations.fast)));
    audio.play("tick", { pitch: 1, gain: 0.2, pan: panOf(i) });
    say(`${draftText(tok)} is already struck.`);
  };

  /** A tap or a key: one quick stroke across the word, then its outcome. */
  const strikeOne = (i: number) => {
    const h = hands[i];
    const tok = toks[i];
    if (disabled || !h || !tok) return;
    if (clean) {
      audio.play("tick", { pitch: 1, gain: 0.2, pan: panOf(i) });
      say("The line is clean.");
      return;
    }
    if (!typedOf(i)) {
      say(`${draftText(tok)} is not written yet.`);
      return;
    }
    quiet();
    loop.current = audio.start("scratch", {
      pitch: 1.1,
      gain: 0.45,
      pan: panOf(i),
    });
    h.a.set(0);
    h.b.set(0);
    h.on.set(1);
    runs.current.push(
      animate(h.b, 1, {
        duration: motionSafe ? 0.18 : 0.01,
        ease: easings.move,
        onComplete: () => {
          quiet();
          settleStrike(i);
        },
      }),
    );
  };

  /** The visitor's pen, following the pointer along one line of words. */
  const coverage = (x0: number, x1: number, y: number) => {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    const out: { i: number; a: number; b: number }[] = [];
    toks.forEach((tok, i) => {
      if (tok.kind === "ins") return;
      const box = boxes.current.get(`w${tok.id}`);
      if (!box || box.width < 1) return;
      if (y < box.top - 4 || y > box.top + box.height + 4) return;
      const a = clamp01((lo - box.left) / box.width);
      const b = clamp01((hi - box.left) / box.width);
      if (b > a) out.push({ i, a, b });
    });
    return out;
  };

  const localOf = (clientX: number, clientY: number) => {
    const rect = lineRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const voice = (speedPx: number, clientX: number) => {
    loop.current?.set({
      pitch: r2(0.8 + Math.min(0.8, speedPx / 900)),
      gain: r2(Math.min(0.55, 0.15 + speedPx / 1600)),
      pan: panFrom(clientX, lineRef.current),
    });
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = window.setTimeout(() => loop.current?.set({ gain: 0 }), 60);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || clean,
    onStart: ({ point, offset, event }) => {
      measure();
      const start = localOf(point.x - offset.x, point.y - offset.y);
      pen.current = {
        x0: start.x,
        y: start.y,
        x: start.x,
        t: event.timeStamp,
        ids: [],
      };
      quiet();
      loop.current = audio.start("scratch", {
        pitch: 1,
        gain: 0,
        pan: panFrom(point.x, lineRef.current),
      });
    },
    onMove: ({ point, event }) => {
      const p = pen.current;
      const line = lineRef.current;
      if (!p || !line) return;
      const raw = localOf(point.x, point.y).x;
      const w = line.clientWidth;
      // Past the line's ends the stroke gives, and gives less the further.
      const x =
        raw < 0
          ? rubberband(raw, w)
          : raw > w
            ? w + rubberband(raw - w, w)
            : raw;
      const covered = coverage(p.x0, x, p.y);
      const now = new Set(covered.map((c) => c.i));
      covered.forEach(({ i, a, b }) => {
        const h = hands[i];
        if (!h || !typedOf(i)) return;
        h.a.set(r2(a));
        h.b.set(r2(b));
        h.on.set(1);
      });
      p.ids.forEach((id) => {
        const i = toks.findIndex((tok) => tok.id === id);
        const h = hands[i];
        if (h && !now.has(i) && h.write.get() === 0 && h.stet.get() === 0)
          h.on.set(0);
      });
      p.ids = covered.map((c) => toks[c.i]?.id ?? "");
      const dt = Math.max(8, event.timeStamp - p.t);
      voice((Math.abs(x - p.x) / dt) * 1000, point.x);
      p.x = x;
      p.t = event.timeStamp;
    },
    onEnd: () => {
      const p = pen.current;
      pen.current = null;
      quiet();
      if (!p) return;
      const covered = coverage(p.x0, p.x, p.y);
      covered.forEach(({ i, a, b }) => {
        const h = hands[i];
        if (!h) return;
        if (b - a >= TAKE && typedOf(i)) settleStrike(i);
        else
          runs.current.push(
            animate(h.b, h.a.get(), exitFor(durations.fast)),
            animate(h.on, 0, exitFor(durations.fast)),
          );
      });
      api.current?.play();
    },
    onCancel: () => {
      const p = pen.current;
      pen.current = null;
      quiet();
      p?.ids.forEach((id) => {
        const h = hands[toks.findIndex((tok) => tok.id === id)];
        if (h) runs.current.push(animate(h.on, 0, exitFor(durations.fast)));
      });
      api.current?.play();
    },
    onTap: (event) => {
      const node =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-tok]")
          : null;
      const i = toks.findIndex((tok) => tok.id === node?.dataset.tok);
      if (i < 0 || toks[i]?.kind === "ins") return;
      setCursor(i);
      strikeOne(i);
    },
  });

  const cursorAt =
    cursor >= 0 && strikable.includes(cursor) ? cursor : (strikable[0] ?? -1);
  const showCursor = keyed && !disabled && !clean && cursorAt >= 0;

  const moveCursor = (to: number) => {
    if (strikable.length === 0) return;
    const i = strikable[clamp(to, 0, strikable.length - 1)] as number;
    setCursor(i);
    setKeyed(true);
    const tok = toks[i];
    if (!tok) return;
    audio.play("tick", { pitch: 1.1, gain: 0.2, pan: panOf(i) });
    say(
      typedOf(i)
        ? `${draftText(tok)}, word ${strikable.indexOf(i) + 1} of ${strikable.length}.`
        : `Word ${strikable.indexOf(i) + 1} of ${strikable.length}, not written yet.`,
    );
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (clean) return;
    const k = strikable.indexOf(cursorAt);
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveCursor(k + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveCursor(k - 1);
        return;
      case "Home":
        event.preventDefault();
        moveCursor(0);
        return;
      case "End":
        event.preventDefault();
        moveCursor(strikable.length - 1);
        return;
    }
  };

  const lit = (i: number) => {
    const tok = toks[i];
    if (!tok || clean) return false;
    if (hover) return hover === tok.id;
    return showCursor && cursorAt === i;
  };

  const lineClass =
    "flex flex-wrap items-start gap-x-[0.3em] text-lg leading-[2.9] text-foreground";

  return (
    <>
      <div
        ref={bindRoot}
        className={cn("relative w-full", className)}
        aria-busy={active || undefined}
        style={{ "--redline": inkColour } as React.CSSProperties}
      >
        <button
          type="button"
          aria-label="Strike a word"
          aria-describedby={hintId}
          disabled={disabled}
          onClick={(event) => {
            // Pointer strikes arrive through the drag. A click with no
            // pointer behind it — Space, Enter, assistive technology —
            // strikes the chosen word.
            if (event.detail !== 0) return;
            setKeyed(true);
            if (cursorAt >= 0) strikeOne(cursorAt);
          }}
          onKeyDown={onKeyDown}
          onFocus={(event) =>
            setKeyed(event.currentTarget.matches(":focus-visible"))
          }
          onBlur={() => setKeyed(false)}
          {...drag}
          onPointerMove={(event) => {
            drag.onPointerMove(event);
            if (event.pointerType !== "mouse" || disabled) return;
            const node =
              event.target instanceof Element
                ? event.target.closest<HTMLElement>("[data-tok]")
                : null;
            const id = node?.dataset.tok ?? null;
            if (id !== hover) setHover(id);
          }}
          onPointerLeave={() => setHover(null)}
          className={cn(
            "relative block w-full touch-pan-y overflow-clip rounded-3 border border-hairline bg-card text-left outline-none select-none [-webkit-touch-callout:none]",
            "shadow-[0_1px_2px_color-mix(in_oklab,black_8%,transparent)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-default"
              : clean
                ? "cursor-default"
                : "cursor-text",
          )}
        >
          {/* The margin rule of a draft page. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3 w-px"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--redline) 28%, transparent)",
            }}
          />
          <motion.div
            initial={false}
            animate={{ height: height ?? "auto" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            className="relative"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={slot.n}
                ref={bindLine}
                aria-hidden
                className="relative px-6 py-1"
                initial={slot.final ? { opacity: 0 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? -distances.nudge : 0,
                  transition: exitFor(durations.base),
                }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                {!slot.final ? (
                  <motion.div
                    className={cn(
                      lineClass,
                      clean && "pointer-events-none absolute inset-x-6 top-1",
                    )}
                    initial={false}
                    animate={{ opacity: clean ? 0 : 1 }}
                    transition={
                      clean
                        ? { duration: durations.fast, ease: easings.exit }
                        : { duration: 0 }
                    }
                  >
                    {toks.map((tok, i) => (
                      <DraftToken
                        key={tok.id}
                        tok={tok}
                        at={i}
                        clock={clock}
                        tl={tl}
                        hand={hands[i] as Hand}
                        motionSafe={motionSafe}
                        lit={lit(i)}
                        gone={clean}
                        bindWord={bindWord(tok.id)}
                        bindAbove={bindAbove(tok.id)}
                      />
                    ))}
                  </motion.div>
                ) : null}
                {clean ? (
                  <div className={lineClass}>
                    {toks.map((tok, i) =>
                      tok.kind === "del" ? null : (
                        <CleanToken
                          key={tok.id}
                          tok={tok}
                          flip={flips[i] as Flip}
                          fresh={tok.kind !== "keep" && !slot.final}
                          bind={bindClean(tok.id)}
                        />
                      ),
                    )}
                  </div>
                ) : null}
              </motion.div>
            </AnimatePresence>
            {motionSafe ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 size-0 -rotate-[32deg]"
                style={{
                  x: penX,
                  y: penY,
                  opacity: penOn,
                  color: "var(--redline)",
                }}
              >
                <Nib />
              </motion.span>
            ) : null}
          </motion.div>
        </button>
        <span id={hintId} className="sr-only">
          Arrow keys choose a word. Enter strikes it: a weak word is rewritten,
          a good one is marked stet.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {said}
      </p>
      <p role="status" className="sr-only">
        <span key={reading.n}>{reading.text}</span>
      </p>
    </>
  );
}
