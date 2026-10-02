"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { Check, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ComparisonSide = "a" | "b";
export type ComparisonChoice = "a" | "b" | "tie";
export type ComparisonDiff = "phrases" | "sentences" | "off";
export type ComparisonScale = "pick" | "scale";
export type ComparisonStatus = "ready" | "loading" | "error";

export type ComparisonVote = {
  choice: ComparisonChoice;
  /** 1 is better, 2 is much better. Always 1 on the three-stop bar and for a tie. */
  margin: 1 | 2;
  /** Why, from `reasons`. Never set for a tie. */
  reason?: string;
};

export type ComparisonAnswer = {
  id: string;
  /** The model's name, shown over its column. */
  model: string;
  /** The whole answer. Blank lines split paragraphs. */
  text: string;
  /** Time to the first token, ms. */
  latencyMs: number;
  /** Streaming rate once it starts. */
  tokensPerSecond: number;
  /** Set it to drive the column yourself (pass the text as it arrives); leave it unset and the column plays `text` in at its own pace. */
  status?: "streaming" | "done" | "error";
};

export type ComparisonStats = {
  firstTokenMs: number;
  totalMs: number;
  tokens: number;
  tokensPerSecond: number;
};

export type SideBySideProps = {
  /** Playback speed of the two streams, as a multiple of real time. Stats always read in real time. @default 1 */
  speed?: number;
  /** What the highlight marks once both finish: runs of differing words, whole sentences the other answer lacks, or nothing. @default "phrases" */
  diff?: ComparisonDiff;
  /** The vote bar: three stops (A better, tie, B better), or five with "much better" at each end. @default "pick" */
  vote?: ComparisonScale;
  /** The prompt both models answered. @default defaultComparisonPrompt */
  prompt?: string;
  /** The two answers, left and right. @default defaultComparisonAnswers */
  answers?: [ComparisonAnswer, ComparisonAnswer];
  /** Start streaming when the surface first scrolls into view. Off: both answers show complete. @default true */
  autoPlay?: boolean;
  /** Controlled vote. */
  value?: ComparisonVote | null;
  /** Initial vote when uncontrolled. @default null */
  defaultValue?: ComparisonVote | null;
  /** Fires from the drag, key or press that changed the vote or its reason. */
  onValueChange?: (vote: ComparisonVote | null) => void;
  /** Why a winner won: offered after a vote for a side. */
  reasons?: string[];
  /** "Run again" was pressed: both streams replay and an uncontrolled vote clears. */
  onRerun?: () => void;
  /** Retry was pressed on a column whose answer failed. */
  onRetry?: (answerId: string) => void;
  /** A column finished, with its stats. */
  onFinish?: (answerId: string, stats: ComparisonStats) => void;
  /** Whether the run has data yet. @default "ready" */
  status?: ComparisonStatus;
  /** The two columns' short names. @default { a: "A", b: "B" } */
  labels?: { a: string; b: string };
  /** The surface's accessible name. @default "Model comparison" */
  label?: string;
  /** Play the ticks and the chime. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

export const defaultComparisonPrompt =
  "Why can a retry with exponential backoff still overload a service that is coming back up?";

export const defaultComparisonAnswers: [ComparisonAnswer, ComparisonAnswer] = [
  {
    id: "fernworks",
    model: "Fernworks Model 3",
    latencyMs: 420,
    tokensPerSecond: 48,
    text: [
      "Because backoff spaces out each client's retries, not the crowd's. If thousands of uploads failed at the same moment, they all wait 1 s, then 2 s, then 4 s together, so every retry lands as one synchronised wave just as the service starts to recover.",
      "Add jitter so each client picks a random point inside its window, cap the delay, and limit attempts. The waves flatten into a steady trickle the service can absorb.",
    ].join("\n\n"),
  },
  {
    id: "gaugeworks",
    model: "Gaugeworks Reasoner",
    latencyMs: 1150,
    tokensPerSecond: 34,
    text: [
      "Exponential backoff slows each client down, but it does not spread clients apart. When a whole fleet fails at once, every client computes the same delays, so their retries arrive together in waves that hit the service as it comes back.",
      "The fix is full jitter: wait a random time between zero and the capped delay. Also cap the delay and the number of attempts, and honour any retry hint the service sends.",
    ].join("\n\n"),
  },
];

const DEFAULT_REASONS = [
  "More accurate",
  "Clearer",
  "More concise",
  "Safer advice",
];

type Stop = { choice: ComparisonChoice; margin: 1 | 2 };

const STOPS: Record<ComparisonScale, Stop[]> = {
  pick: [
    { choice: "a", margin: 1 },
    { choice: "tie", margin: 1 },
    { choice: "b", margin: 1 },
  ],
  scale: [
    { choice: "a", margin: 2 },
    { choice: "a", margin: 1 },
    { choice: "tie", margin: 1 },
    { choice: "b", margin: 1 },
    { choice: "b", margin: 2 },
  ],
};

/** Column hues: A is the house cobalt, B the same light turned 70° toward magenta. */
const HUE = {
  a: "var(--accent-bright)",
  b: "oklch(from var(--accent-bright) l c calc(h + 70))",
} as const;
const WASH = {
  a: "color-mix(in oklab, var(--accent-bright) 24%, transparent)",
  b: "color-mix(in oklab, oklch(from var(--accent-bright) l c calc(h + 70)) 26%, transparent)",
} as const;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Tokens the way a model emits them: words, long ones in pieces of five. */
const tokenize = (text: string) => text.match(/\s*\S{1,5}/g) ?? [];

const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

type Word = { start: number; end: number; stem: string; filler: boolean };

/** Words that carry no claim of their own: they join a run, never start one. */
const FILLER = new Set(
  "a about after all also an and any are as at be because been but by can could do does each every for from has have how if in into is it its just more most much no not now of on once one only or other our out over same should so some such than that the their them then there these they this those through to too up very was we were what when where which while who why will with would you your".split(
    " ",
  ),
);

/** Crude but stable: case, punctuation and the common endings fall away. */
const stemOf = (w: string) =>
  w
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/(ing|ed|es|s)$/u, "");

const wordsOf = (text: string): Word[] =>
  [...text.matchAll(/\S+/g)].map((m) => {
    const stem = stemOf(m[0]);
    return {
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      stem,
      filler:
        stem === "" ||
        FILLER.has(m[0].toLowerCase().replace(/[^\p{L}']/gu, "")),
    };
  });

/**
 * What each side says that the other does not: a word is shared when its
 * stem appears anywhere in the other answer, whatever the order — two
 * answers rarely make the same point in the same sequence.
 */
function common(a: Word[], b: Word[]): [boolean[], boolean[]] {
  const inA = new Set(a.filter((w) => !w.filler).map((w) => w.stem));
  const inB = new Set(b.filter((w) => !w.filler).map((w) => w.stem));
  return [
    a.map((w) => w.filler || inB.has(w.stem)),
    b.map((w) => w.filler || inA.has(w.stem)),
  ];
}

type Range = { start: number; end: number };

/**
 * Runs of differing words, never across a paragraph break. Filler words
 * between two differing words stay inside the run; at its edges they drop.
 */
function phraseRanges(text: string, words: Word[], kept: boolean[]): Range[] {
  const runs: { range: Range; size: number }[] = [];
  let cur: { range: Range; size: number } | null = null;
  words.forEach((w, i) => {
    if (w.filler) return;
    if (kept[i]) {
      cur = null;
      return;
    }
    if (cur && !text.slice(cur.range.end, w.start).includes("\n")) {
      cur.range.end = w.end;
      cur.size += 1;
    } else {
      cur = { range: { start: w.start, end: w.end }, size: 1 };
      runs.push(cur);
    }
  });
  // A lone reworded word is paraphrase, not a different point: a run needs
  // two words the other answer never uses.
  return runs.filter((r) => r.size >= 2).map((r) => r.range);
}

/** Sentences with fewer than half their words in common. */
function sentenceRanges(text: string, words: Word[], kept: boolean[]): Range[] {
  const out: Range[] = [];
  for (const m of text.matchAll(/[^.!?\n]+[.!?]*["')\]]*/g)) {
    const start = (m.index ?? 0) + (m[0].length - m[0].trimStart().length);
    const end = (m.index ?? 0) + m[0].trimEnd().length;
    if (end <= start) continue;
    let total = 0;
    let shared = 0;
    words.forEach((w, i) => {
      if (!w.filler && w.start >= start && w.end <= end) {
        total += 1;
        if (kept[i]) shared += 1;
      }
    });
    if (total > 0 && shared / total < 0.5) out.push({ start, end });
  }
  return out;
}

type Phase = "idle" | "playing" | "done";

/**
 * Two models answering one prompt, side by side. Each answer streams into
 * its own column at its own pace — its time to first token, then its token
 * rate, both scaled by `speed` — with a live clock and a progress hairline in
 * the header and a Done stamp that lands on flick. Playback starts when the
 * surface first scrolls into view and pauses while the page is hidden.
 *
 * Once both finish, what differs is marked: a highlighter stroke sweeps
 * across each differing phrase (or sentence) in reading order, both columns
 * at once, each in its column's hue. Underneath, the stats tally: first
 * token, total time, length and rate, with bars that grow on glide and a dot
 * on the better value.
 *
 * Then you vote. The puck on the vote bar drags 1:1, rubber-bands past the
 * ends and settles on snap at the stop the throw was heading for; a fill
 * grows from the centre toward the side you picked, that column's header
 * takes its hue and a Preferred badge lands on recoil. Reason chips arrive
 * on snap, and the one you choose moves into the vote's summary on glide.
 * The stops are a radio group on the arrow keys. Under reduced motion the
 * text still streams and the vote still lands, without sweeps, springs or
 * travel.
 */
export function SideBySide({
  speed = 1,
  diff = "phrases",
  vote = "pick",
  prompt = defaultComparisonPrompt,
  answers = defaultComparisonAnswers,
  autoPlay = true,
  value,
  defaultValue = null,
  onValueChange,
  reasons = DEFAULT_REASONS,
  onRerun,
  onRetry,
  onFinish,
  status = "ready",
  labels = { a: "A", b: "B" },
  label = "Model comparison",
  sound = false,
  disabled = false,
  className,
}: SideBySideProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const rate = clamp(speed, 0.1, 10);
  const [answerA, answerB] = answers;
  const sides: [ComparisonSide, ComparisonAnswer][] = [
    ["a", answerA],
    ["b", answerB],
  ];

  const tokens = React.useMemo(
    () => [tokenize(answerA.text), tokenize(answerB.text)] as const,
    [answerA.text, answerB.text],
  );
  const hosted = [answerA.status !== undefined, answerB.status !== undefined];

  /* ------------------------------- playback ------------------------------- */

  const [phase, setPhase] = React.useState<Phase>(autoPlay ? "idle" : "done");
  const [counts, setCounts] = React.useState<[number, number]>(() =>
    autoPlay ? [0, 0] : [tokens[0].length, tokens[1].length],
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const clock = React.useRef(0);
  const finished = React.useRef<[boolean, boolean]>([!autoPlay, !autoPlay]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const elapsedA = useMotionValue(0);
  const elapsedB = useMotionValue(0);
  const elapsed: [MotionValue<number>, MotionValue<number>] = [
    elapsedA,
    elapsedB,
  ];
  const api = React.useRef<{
    tick: (dt: number) => boolean;
  } | null>(null);

  const doneAt = (i: 0 | 1) => {
    const ans = answers[i];
    const n = tokens[i].length;
    return (
      ans.latencyMs +
      (Math.max(1, n) - 1) * (1000 / Math.max(1, ans.tokensPerSecond))
    );
  };
  const statsOf = (i: 0 | 1): ComparisonStats => {
    const ans = answers[i];
    return {
      firstTokenMs: Math.round(ans.latencyMs),
      totalMs: Math.round(doneAt(i)),
      tokens: tokens[i].length,
      tokensPerSecond: Math.round(ans.tokensPerSecond),
    };
  };

  const shown = (i: 0 | 1) => (hosted[i] ? tokens[i].length : (counts[i] ?? 0));
  const isDone = (i: 0 | 1) =>
    hosted[i]
      ? answers[i].status === "done" || answers[i].status === "error"
      : phase === "done" || (counts[i] ?? 0) >= tokens[i].length;
  const bothDone = status === "ready" && isDone(0) && isDone(1);

  // One frame of the clock: counts change only when a token lands.
  const tick = (dt: number) => {
    clock.current += dt * rate;
    const t = clock.current;
    const next: [number, number] = [0, 0];
    for (const i of [0, 1] as const) {
      const ans = answers[i];
      const n = tokens[i].length;
      next[i] =
        t < ans.latencyMs
          ? 0
          : Math.min(
              n,
              1 +
                Math.floor(((t - ans.latencyMs) * ans.tokensPerSecond) / 1000),
            );
      elapsed[i].set(Math.round(Math.min(t, doneAt(i))));
      if (!hosted[i] && next[i] >= n && !finished.current[i]) {
        finished.current[i] = true;
        const s = statsOf(i);
        setSaid((x) => ({
          n: x.n + 1,
          text: `${ans.model} finished in ${(s.totalMs / 1000).toFixed(1)} seconds.`,
        }));
        onFinish?.(ans.id, s);
      }
    }
    setCounts((c) => (c[0] === next[0] && c[1] === next[1] ? c : next));
    // A column the host drives is never waited for.
    const over =
      (finished.current[0] || hosted[0]) && (finished.current[1] || hosted[1]);
    if (over) setPhase("done");
    return !over;
  };

  React.useEffect(() => {
    api.current = { tick };
  });

  // Whether any of the surface is on screen: the clock only runs while it is.
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setInView(last.isIntersecting);
    });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // It plays the first time it comes into view; a re-run plays at once.
  if (phase === "idle" && inView && status === "ready") setPhase("playing");

  // The clock runs only while playing, on screen and on a visible page. A
  // re-run of this effect (StrictMode, scrolling back) carries on from where
  // the clock stands.
  React.useEffect(() => {
    if (phase !== "playing" || !inView) return;
    let raf = 0;
    let last = -1;
    const loop = (t: number) => {
      if (document.hidden) {
        last = -1;
        raf = requestAnimationFrame(loop);
        return;
      }
      const dt = last < 0 ? 0 : Math.min(64, t - last);
      last = t;
      if (api.current?.tick(dt) !== false) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, inView]);

  const rerun = () => {
    if (disabled) return;
    clock.current = 0;
    finished.current = [false, false];
    elapsedA.set(0);
    elapsedB.set(0);
    setCounts([0, 0]);
    setPhase("playing");
    if (value === undefined) setOwnVote(null);
    setSaid((x) => ({ n: x.n + 1, text: "Running both models again." }));
    onRerun?.();
  };

  /* ---------------------------------- diff -------------------------------- */

  const marks = React.useMemo(() => {
    if (diff === "off") return [[], []] as [Range[], Range[]];
    const wa = wordsOf(answerA.text);
    const wb = wordsOf(answerB.text);
    const [ka, kb] = common(wa, wb);
    return diff === "sentences"
      ? ([
          sentenceRanges(answerA.text, wa, ka),
          sentenceRanges(answerB.text, wb, kb),
        ] as [Range[], Range[]])
      : ([
          phraseRanges(answerA.text, wa, ka),
          phraseRanges(answerB.text, wb, kb),
        ] as [Range[], Range[]]);
  }, [answerA.text, answerB.text, diff]);
  const markCount = marks[0].length + marks[1].length;
  const showMarks = bothDone && diff !== "off";
  const [announcedMarks, setAnnouncedMarks] = React.useState(false);
  if (showMarks !== announcedMarks) {
    setAnnouncedMarks(showMarks);
    if (showMarks && markCount > 0) {
      const unit = diff === "sentences" ? "sentence" : "phrase";
      setSaid((x) => ({
        n: x.n + 1,
        text:
          markCount === 1
            ? `1 ${unit} differs.`
            : `${markCount} ${unit}s differ.`,
      }));
    }
  }

  /* ---------------------------------- vote -------------------------------- */

  const [ownVote, setOwnVote] = React.useState<ComparisonVote | null>(
    defaultValue,
  );
  const current = value === undefined ? ownVote : value;
  const stops = STOPS[vote] ?? STOPS.pick;
  const k = stops.length;
  const tieIndex = Math.floor(k / 2);
  const indexOf = (v: ComparisonVote | null) => {
    if (!v) return -1;
    if (v.choice === "tie") return tieIndex;
    const want = vote === "scale" ? v.margin : 1;
    return stops.findIndex((s) => s.choice === v.choice && s.margin === want);
  };
  const chosen = indexOf(current);
  const pctOf = (i: number) => r3((i / (k - 1)) * 100);
  const voting = bothDone && !disabled;

  const posPct = useMotionValue(pctOf(chosen === -1 ? tieIndex : chosen));
  const posAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const posAim = React.useRef(pctOf(chosen === -1 ? tieIndex : chosen));
  /** Sends the puck to a stop; a second call for the same stop keeps the first spring. */
  const aim = (target: number, velocity = 0) => {
    if (target === posAim.current && posAnim.current) return;
    posAim.current = target;
    posAnim.current?.stop();
    posAnim.current = null;
    if (!motionSafe) {
      posPct.set(target);
      return;
    }
    posAnim.current = animate(posPct, target, {
      ...springs.snap,
      velocity,
      onComplete: () => {
        posAnim.current = null;
      },
    });
  };
  // Bumped after a vote is offered to a controlled host: once it has had its
  // turn, the puck goes wherever its value says, even back.
  const [sync, setSync] = React.useState(0);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const [railW, setRailW] = React.useState(0);
  const [grab, setGrab] = React.useState<number | null>(null);
  const grip = React.useRef<{ from: number; near: number } | null>(null);

  const commitVote = (i: number, velocity = 0) => {
    const stop = stops[i];
    if (!stop) return;
    const same =
      current &&
      current.choice === stop.choice &&
      (vote !== "scale" || current.margin === stop.margin);
    const next: ComparisonVote = {
      choice: stop.choice,
      margin: vote === "scale" ? stop.margin : 1,
      ...(same && current?.reason && stop.choice !== "tie"
        ? { reason: current.reason }
        : {}),
    };
    aim(pctOf(i), velocity);
    if (same) return;
    if (value !== undefined) React.startTransition(() => setSync((n) => n + 1));
    if (value === undefined) setOwnVote(next);
    audio.play("chime", {
      pitch:
        stop.choice === "tie"
          ? 1
          : stop.choice === "a"
            ? stop.margin === 2
              ? 0.8
              : 0.9
            : stop.margin === 2
              ? 1.25
              : 1.12,
      gain: 0.5,
    });
    setSaid((x) => ({ n: x.n + 1, text: `Voted: ${stopName(stop)}.` }));
    onValueChange?.(next);
  };

  // The spoken name always begins with the visible one.
  const stopName = (s: Stop) =>
    s.choice === "tie"
      ? "Tie"
      : `${s.choice === "a" ? labels.a : labels.b} ${s.margin === 2 ? "much better" : "better"}`;
  const stopShort = (s: Stop) =>
    s.choice === "tie"
      ? "Tie"
      : `${s.choice === "a" ? labels.a : labels.b}${s.margin === 2 ? " much" : ""}`;

  // The host's vote (or a re-run that cleared it) moves the puck too.
  React.useEffect(() => {
    if (grip.current) return;
    aim(pctOf(chosen === -1 ? tieIndex : chosen));
    // aim and pctOf read only k, motionSafe and the motion value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, k, tieIndex, motionSafe, sync]);

  React.useEffect(
    () => () => {
      posAnim.current?.stop();
    },
    [],
  );

  React.useEffect(() => {
    const node = railRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setRailW(node.clientWidth));
    ro.observe(node);
    return () => ro.disconnect();
  }, [status]);

  const gesture = useDrag({
    axis: "x",
    threshold: 3,
    disabled: !voting || railW === 0,
    onStart: () => {
      posAnim.current?.stop();
      posAnim.current = null;
      const near = chosen === -1 ? tieIndex : chosen;
      grip.current = { from: (posPct.get() / 100) * railW, near };
      setGrab(near);
    },
    onMove: ({ offset }) => {
      const g = grip.current;
      if (!g || railW === 0) return;
      const raw = g.from + offset.x;
      const x = motionSafe
        ? rubberClamp(raw, 0, railW, railW * 0.18)
        : clamp(raw, 0, railW);
      posPct.set(r3((x / railW) * 100));
      const near = clamp(Math.round((x / railW) * (k - 1)), 0, k - 1);
      if (near !== g.near) {
        g.near = near;
        setGrab(near);
        audio.play("tick", {
          pitch: r2(0.85 + (0.4 * near) / (k - 1)),
          gain: 0.4,
        });
      }
    },
    onEnd: ({ velocity }) => {
      const g = grip.current;
      grip.current = null;
      setGrab(null);
      if (!g || railW === 0) return;
      const at = (posPct.get() / 100) * railW;
      const landing = project(at, velocity.x, 0.99);
      const i = clamp(Math.round((landing / railW) * (k - 1)), 0, k - 1);
      commitVote(i, r2((velocity.x / railW) * 100));
    },
    onCancel: () => {
      grip.current = null;
      setGrab(null);
      posAim.current = -1;
      aim(pctOf(chosen === -1 ? tieIndex : chosen));
    },
  });

  const lean = grab ?? chosen;
  const leanStop = stops[lean];
  const fillLeft = useTransform(posPct, (p) => `${r3(Math.min(50, p))}%`);
  const fillWidth = useTransform(posPct, (p) => `${r3(Math.abs(p - 50))}%`);
  const fillColor = useTransform(posPct, (p) =>
    p < 49.5 ? HUE.a : p > 50.5 ? HUE.b : "var(--ink-3)",
  );
  const puckLeft = useTransform(posPct, (p) => `${r3(p)}%`);
  const preferred: ComparisonSide | null =
    current && current.choice !== "tie" ? current.choice : null;

  const pickReason = (r: string) => {
    if (!current || current.choice === "tie" || disabled) return;
    const next: ComparisonVote = {
      ...current,
      ...(current.reason === r ? { reason: undefined } : { reason: r }),
    };
    if (next.reason === undefined) delete next.reason;
    if (value === undefined) setOwnVote(next);
    audio.play("tick", { pitch: 1.2, gain: 0.45 });
    setSaid((x) => ({
      n: x.n + 1,
      text: next.reason ? `Reason: ${next.reason}.` : "Reason cleared.",
    }));
    onValueChange?.(next);
  };

  /* -------------------------------- layout -------------------------------- */

  const [narrow, setNarrow] = React.useState(false);
  const [tab, setTab] = React.useState<ComparisonSide>("a");
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setNarrow(node.clientWidth < 480));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  /* -------------------------------- render -------------------------------- */

  const renderText = (i: 0 | 1, side: ComparisonSide) => {
    const ans = answers[i];
    const all = tokens[i];
    const n = shown(i);
    const streaming = hosted[i]
      ? ans.status === "streaming"
      : !isDone(i) && phase !== "idle";
    if (ans.status === "error") {
      return (
        <div className="flex flex-col items-start gap-2 text-[13px] text-danger">
          <span className="inline-flex items-center gap-1.5">
            <TriangleAlert aria-hidden className="size-4" />
            This model did not answer.
          </span>
          {onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(ans.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Retry
            </button>
          ) : null}
        </div>
      );
    }
    if (n === 0) {
      return (
        <p className="text-[13px] text-ink-3">
          {phase === "idle" ? "Waiting to start" : "Thinking"}
          {streaming ? <Dots motionSafe={motionSafe} /> : null}
        </p>
      );
    }

    if (showMarks) {
      return (
        <Marked
          text={ans.text}
          ranges={marks[i]}
          wash={WASH[side]}
          total={markCount}
          motionSafe={motionSafe}
        />
      );
    }

    // The newest tokens fade in; everything before them is plain text, and
    // a paragraph break always settles at once.
    let fresh = streaming ? Math.min(10, n) : 0;
    for (let q = n - fresh; q < n; q += 1) {
      if (/\n\s*\n/.test(all[q] ?? "")) fresh = n - q - 1;
    }
    const settled = all.slice(0, n - fresh).join("");
    const recent = all.slice(n - fresh, n);
    const fade = Math.min(
      durations.fast,
      8 / Math.max(1, answers[i].tokensPerSecond * rate),
    );
    const paras = settled.split(/\n{2,}/);
    return (
      <div className="flex flex-col gap-3">
        {paras.map((p, j) => (
          <p key={j} className="whitespace-pre-line">
            {p.replace(/^\n+/, "")}
            {j === paras.length - 1 ? (
              <>
                {recent.map((t, q) => (
                  <motion.span
                    key={n - fresh + q}
                    initial={{ opacity: motionSafe ? 0 : 1 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: fade, ease: "linear" }}
                  >
                    {t}
                  </motion.span>
                ))}
                {streaming ? <Caret motionSafe={motionSafe} /> : null}
              </>
            ) : null}
          </p>
        ))}
      </div>
    );
  };

  const column = (i: 0 | 1) => {
    const [side, ans] = sides[i] ?? ["a", answerA];
    const n = shown(i);
    const total = tokens[i].length;
    const done = isDone(i);
    const prefer = preferred === side;
    const progress = total > 0 ? n / total : 0;
    const asTab = narrow;
    return (
      <section
        key={side}
        id={`${uid}-panel-${side}`}
        role={asTab ? "tabpanel" : "region"}
        aria-labelledby={asTab ? `${uid}-tab-${side}` : `${uid}-head-${side}`}
        className={cn(
          "flex flex-col overflow-clip rounded-3 border bg-surface-1 transition-colors duration-200",
          prefer ? "border-transparent" : "border-hairline",
          // On a phone only the chosen tab's answer shows.
          side !== tab && "@max-[30rem]:hidden",
        )}
        style={prefer ? { boxShadow: `0 0 0 1.5px ${HUE[side]}` } : undefined}
      >
        <header className="relative flex h-9 shrink-0 items-center gap-2 border-b border-hairline px-3">
          <SideBadge side={side} label={side === "a" ? labels.a : labels.b} />
          <span
            id={`${uid}-head-${side}`}
            className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
            title={ans.model}
          >
            {ans.model}
          </span>
          <AnimatePresence initial={false}>
            {prefer ? (
              <motion.span
                key="preferred"
                initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
                className="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-medium text-primary-foreground"
                style={{ background: HUE[side] }}
              >
                Preferred
              </motion.span>
            ) : null}
          </AnimatePresence>
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-ink-3 tabular-nums">
            {done && !hosted[i] ? (
              <motion.span
                key="done"
                className="inline-flex items-center gap-1 text-foreground"
                initial={{ opacity: 0, scale: motionSafe ? 0.7 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
              >
                <Check aria-hidden className="size-3 text-success" />
                {seconds(doneAt(i))}
              </motion.span>
            ) : hosted[i] ? (
              <span>{done ? "Done" : "Streaming"}</span>
            ) : (
              <Clock value={elapsed[i]} />
            )}
          </span>
          <span
            aria-hidden
            className="absolute inset-x-0 -bottom-px h-px origin-left"
            style={{
              background: HUE[side],
              transform: `scaleX(${r3(done ? 1 : progress)})`,
              opacity: done ? 0.35 : 1,
            }}
          />
        </header>
        <Follow
          label={`${ans.model} answer`}
          active={!done}
          className="px-3 py-2.5 text-[13px] leading-[1.6] text-foreground @min-[30rem]:text-[13.5px]"
        >
          {renderText(i, side)}
        </Follow>
      </section>
    );
  };

  const statRows: {
    label: string;
    a: number;
    b: number;
    text: (v: number) => string;
    better?: "low" | "high";
  }[] = [
    {
      label: "First token",
      a: statsOf(0).firstTokenMs,
      b: statsOf(1).firstTokenMs,
      text: (v) => `${(v / 1000).toFixed(2)} s`,
      better: "low",
    },
    {
      label: "Total",
      a: statsOf(0).totalMs,
      b: statsOf(1).totalMs,
      text: (v) => seconds(v),
      better: "low",
    },
    {
      label: "Length",
      a: statsOf(0).tokens,
      b: statsOf(1).tokens,
      text: (v) => `${v} tok`,
    },
    {
      label: "Rate",
      a: statsOf(0).tokensPerSecond,
      b: statsOf(1).tokensPerSecond,
      text: (v) => `${v}/s`,
      better: "high",
    },
  ];

  const stats = (
    <div
      role="group"
      aria-label="Stats"
      className="grid grid-cols-2 gap-2 @min-[30rem]:grid-cols-4 @min-[64rem]:grid-cols-1"
    >
      {statRows.map((row, ri) => {
        const max = Math.max(row.a, row.b, 1);
        const win =
          bothDone && row.better && row.a !== row.b
            ? (row.better === "low") === row.a < row.b
              ? "a"
              : "b"
            : null;
        return (
          <div
            key={row.label}
            className="rounded-2 border border-hairline bg-surface-1 px-2.5 py-2"
          >
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {row.label}
            </p>
            <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-1">
              {(["a", "b"] as const).map((side, si) => {
                const v = side === "a" ? row.a : row.b;
                const live = !isDone(si === 0 ? 0 : 1);
                const started = shown(si === 0 ? 0 : 1) > 0;
                const text =
                  row.label === "Length"
                    ? `${live ? shown(si === 0 ? 0 : 1) : v} tok`
                    : row.label === "First token" && started
                      ? row.text(v)
                      : live
                        ? "—"
                        : row.text(v);
                return (
                  <React.Fragment key={side}>
                    <span
                      aria-hidden
                      className="font-mono text-[10px] font-semibold"
                      style={{ color: HUE[side] }}
                    >
                      {side === "a" ? labels.a : labels.b}
                    </span>
                    <span className="h-1.5 overflow-clip rounded-full bg-surface-2">
                      <motion.span
                        className="block h-full origin-left rounded-full"
                        style={{
                          background: HUE[side],
                          opacity: win && win !== side ? 0.45 : 0.85,
                        }}
                        initial={false}
                        animate={{ scaleX: bothDone ? r3(v / max) : 0 }}
                        transition={
                          motionSafe
                            ? { ...springs.glide, delay: ri * cascade(4) }
                            : { duration: 0 }
                        }
                      />
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-mono text-[11px] tabular-nums",
                        win === side ? "text-foreground" : "text-ink-2",
                      )}
                    >
                      <span className="sr-only">
                        {side === "a" ? answerA.model : answerB.model}:{" "}
                      </span>
                      {text}
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          win === side ? "bg-success" : "bg-transparent",
                        )}
                      />
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const reasonOn =
    current?.choice !== "tie" && current ? current.reason : undefined;
  const voteBar = (
    <div className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <p
          id={`${uid}-vote`}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Which answer is better
        </p>
        {!bothDone ? (
          <span className="text-[11px] text-ink-3">Vote when both finish</span>
        ) : null}
      </div>

      <div
        className={cn(
          "relative h-9 rounded-full bg-surface-2 transition-opacity",
          !voting && "opacity-50",
        )}
      >
        <div
          ref={railRef}
          className="absolute inset-y-0 right-[18px] left-[18px]"
        >
          {stops.map((s, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                i === tieIndex ? "bg-ink-3" : "bg-hairline-strong",
              )}
              style={{ left: `${pctOf(i)}%` }}
            />
          ))}
          <motion.span
            aria-hidden
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
            style={{
              left: fillLeft,
              width: fillWidth,
              background: fillColor,
              opacity: current || grab !== null ? 1 : 0,
            }}
          />
          <motion.div
            aria-hidden
            {...gesture}
            className={cn(
              "absolute top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 touch-pan-y items-center justify-center rounded-full border font-mono text-[11px] font-semibold shadow-[0_2px_8px_color-mix(in_oklab,black_16%,transparent)] select-none",
              voting
                ? "cursor-grab active:cursor-grabbing"
                : "cursor-not-allowed",
              current || grab !== null
                ? "border-transparent text-primary-foreground"
                : "border-dashed border-hairline-strong bg-card text-ink-3",
            )}
            style={{
              left: puckLeft,
              ...(current || grab !== null ? { background: fillColor } : {}),
            }}
          >
            {leanStop
              ? leanStop.choice === "tie"
                ? "="
                : leanStop.choice === "a"
                  ? labels.a
                  : labels.b
              : "?"}
          </motion.div>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={`${uid}-vote`}
        aria-disabled={!voting || undefined}
        className="relative h-6"
      >
        {stops.map((s, i) => {
          const on = i === chosen;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={stopName(s)}
              aria-disabled={!voting || undefined}
              tabIndex={(chosen === -1 ? i === tieIndex : on) ? 0 : -1}
              onClick={() => {
                if (voting) commitVote(i);
              }}
              onKeyDown={(e) => {
                const keys: Record<string, number> = {
                  ArrowLeft: i - 1,
                  ArrowUp: i - 1,
                  ArrowRight: i + 1,
                  ArrowDown: i + 1,
                  Home: 0,
                  End: k - 1,
                };
                const to = keys[e.key];
                if (to === undefined) return;
                e.preventDefault();
                const j = clamp(to, 0, k - 1);
                const group = e.currentTarget.parentElement;
                group
                  ?.querySelectorAll<HTMLButtonElement>("[role=radio]")
                  [j]?.focus();
                if (voting && j !== i) commitVote(j);
              }}
              className={cn(
                "absolute top-0 inline-flex h-6 -translate-x-1/2 items-center rounded-2 px-1.5 text-[11px] whitespace-nowrap transition-colors",
                on ? "text-foreground" : "text-ink-3",
                voting ? "hover:text-foreground" : "cursor-not-allowed",
                FOCUS_RING,
              )}
              style={{
                left: `calc(18px + (100% - 36px) * ${r3(i / (k - 1))})`,
              }}
            >
              {stopShort(s)}
            </button>
          );
        })}
      </div>

      <LayoutGroup id={`${uid}-reasons`}>
        <AnimatePresence initial={false}>
          {preferred ? (
            <motion.div
              key="reasons"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, transition: exitFor() }}
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
              className="overflow-clip"
              style={{ overflowClipMargin: 6 }}
            >
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-ink-2">
                  {preferred === "a" ? labels.a : labels.b} because
                </span>
                {reasonOn ? (
                  <ReasonChip
                    key={reasonOn}
                    layoutId={`${uid}-reason-${reasonOn}`}
                    text={reasonOn}
                    on
                    side={preferred}
                    motionSafe={motionSafe}
                    onClick={() => pickReason(reasonOn)}
                  />
                ) : (
                  <span className="text-[11px] text-ink-3">pick a reason</span>
                )}
              </div>
              <div
                role="radiogroup"
                aria-label="Reason"
                className="flex flex-wrap gap-1.5 pt-1.5"
              >
                {reasons
                  .filter((r) => r !== reasonOn)
                  .map((r, i) => (
                    <ReasonChip
                      key={r}
                      layoutId={`${uid}-reason-${r}`}
                      text={r}
                      on={false}
                      side={preferred}
                      motionSafe={motionSafe}
                      delay={i * cascade(reasons.length)}
                      onClick={() => pickReason(r)}
                    />
                  ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );

  const loadingView = (
    <div aria-busy="true" className="grid gap-3 p-3 @min-[30rem]:grid-cols-2">
      <p className="sr-only">Waiting for both models.</p>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="flex h-48 flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3"
        >
          <div className="h-4 w-1/2 rounded-1 bg-surface-2" />
          <div className="h-3 w-full rounded-1 bg-surface-2" />
          <div className="h-3 w-5/6 rounded-1 bg-surface-2" />
          <div className="h-3 w-2/3 rounded-1 bg-surface-2" />
        </div>
      ))}
    </div>
  );

  const errorView = (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <TriangleAlert aria-hidden className="size-5 text-danger" />
      <p className="text-sm text-foreground">This comparison did not run.</p>
      <button
        type="button"
        onClick={rerun}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Run again
      </button>
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={label}
      className={cn(
        "@container h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      {/* A container query never matches its own element: the layout that
          changes with the width lives one level in. On a phone the whole
          surface scrolls; from 30rem it fits the box and the answers scroll. */}
      <div className="grid grid-rows-[auto_auto] @min-[30rem]:h-full @min-[30rem]:grid-rows-[auto_minmax(0,1fr)]">
        <div className="flex items-start gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Prompt
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-foreground">
              {prompt}
            </p>
          </div>
          <button
            type="button"
            onClick={rerun}
            disabled={disabled || status !== "ready" || phase === "playing"}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            <span className="@max-[24rem]:sr-only">Run again</span>
          </button>
        </div>

        {status === "loading" ? (
          loadingView
        ) : status === "error" ? (
          errorView
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 @min-[30rem]:grid-cols-2 @min-[30rem]:grid-rows-[minmax(0,1fr)_auto] @min-[64rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18.75rem] @min-[64rem]:grid-rows-[minmax(0,1fr)]">
            {/* Phone: the two answers are tabs over one panel. */}
            <div
              role={narrow ? "tablist" : undefined}
              aria-label={narrow ? "Answers" : undefined}
              className="grid grid-cols-2 gap-1 rounded-2 bg-surface-2 p-0.5 @min-[30rem]:hidden"
            >
              {sides.map(([side, ans], i) => {
                const on = tab === side;
                const n = shown(i === 0 ? 0 : 1);
                const total = tokens[i]?.length ?? 1;
                const done = isDone(i === 0 ? 0 : 1);
                return (
                  <button
                    key={side}
                    id={`${uid}-tab-${side}`}
                    type="button"
                    role={narrow ? "tab" : undefined}
                    aria-selected={narrow ? on : undefined}
                    aria-controls={narrow ? `${uid}-panel-${side}` : undefined}
                    tabIndex={narrow ? (on ? 0 : -1) : undefined}
                    onClick={() => setTab(side)}
                    onKeyDown={(e) => {
                      if (
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          e.key,
                        )
                      )
                        return;
                      e.preventDefault();
                      const next: ComparisonSide =
                        e.key === "Home"
                          ? "a"
                          : e.key === "End"
                            ? "b"
                            : side === "a"
                              ? "b"
                              : "a";
                      setTab(next);
                      document.getElementById(`${uid}-tab-${next}`)?.focus();
                    }}
                    className={cn(
                      "relative flex h-9 min-w-0 items-center gap-1.5 overflow-clip rounded-[5px] px-2 text-left text-xs transition-colors",
                      on
                        ? "bg-card text-foreground shadow-[0_1px_3px_color-mix(in_oklab,black_12%,transparent)]"
                        : "text-ink-2",
                      FOCUS_RING,
                    )}
                  >
                    <SideBadge
                      side={side}
                      label={side === "a" ? labels.a : labels.b}
                    />
                    <span className="min-w-0 flex-1 truncate">{ans.model}</span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                      {done
                        ? "Done"
                        : `${Math.round((n / Math.max(1, total)) * 100)}%`}
                    </span>
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-0.5 origin-left"
                      style={{
                        background: HUE[side],
                        transform: `scaleX(${r3(done ? 1 : n / Math.max(1, total))})`,
                        opacity: done ? 0.35 : 1,
                      }}
                    />
                  </button>
                );
              })}
            </div>
            {column(0)}
            {column(1)}
            <div className="flex flex-col gap-3 @min-[30rem]:col-span-2 @min-[64rem]:col-span-1 @min-[64rem]:overflow-y-auto @min-[64rem]:overscroll-contain">
              {stats}
              {voteBar}
            </div>
          </div>
        )}
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

function SideBadge({ side, label }: { side: ComparisonSide; label: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-1 font-mono text-[10px] font-semibold text-primary-foreground"
      style={{ background: HUE[side] }}
    >
      {label.charAt(0)}
    </span>
  );
}

/** A live clock read from a motion value: no React render per frame. */
function Clock({ value }: { value: MotionValue<number> }) {
  const text = useTransform(value, (v) => seconds(v));
  return <motion.span>{text}</motion.span>;
}

function Caret({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] rounded-full bg-cobalt-bright"
      animate={motionSafe ? { opacity: [1, 0, 1] } : { opacity: 1 }}
      transition={
        motionSafe
          ? { duration: 1, repeat: Infinity, ease: "linear" }
          : { duration: 0 }
      }
    />
  );
}

function Dots({ motionSafe }: { motionSafe: boolean }) {
  return (
    <span aria-hidden className="ml-1 inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={motionSafe ? { opacity: [0.25, 1, 0.25] } : { opacity: 0.6 }}
          transition={
            motionSafe
              ? {
                  duration: 1,
                  repeat: Infinity,
                  ease: "linear",
                  delay: i * 0.16,
                }
              : { duration: 0 }
          }
        >
          .
        </motion.span>
      ))}
    </span>
  );
}

/**
 * Text kept in step with its stream: while `active`, the box follows the
 * newest line unless you have scrolled up to read.
 */
function Follow({
  label,
  active,
  className,
  children,
}: {
  label: string;
  active: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const pinned = React.useRef(true);
  React.useEffect(() => {
    if (!node || !active) return;
    const inner = node.firstElementChild;
    if (!inner) return;
    const ro = new ResizeObserver(() => {
      if (pinned.current) node.scrollTop = node.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [node, active]);
  return (
    <div
      ref={setNode}
      tabIndex={0}
      role="group"
      aria-label={label}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className={cn(
        "h-60 [scrollbar-width:thin] overflow-y-auto overscroll-contain @min-[30rem]:h-auto @min-[30rem]:flex-1",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <div>{children}</div>
    </div>
  );
}

/** The answer with its differing runs swept in by a highlighter, in reading order. */
function Marked({
  text,
  ranges,
  wash,
  total,
  motionSafe,
}: {
  text: string;
  ranges: Range[];
  wash: string;
  total: number;
  motionSafe: boolean;
}) {
  const step = cascade(Math.max(2, Math.ceil(total / 2)));
  const paras: { start: number; end: number }[] = [];
  for (const m of text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]*)*/g)) {
    paras.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return (
    <div className="flex flex-col gap-3">
      {paras.map((p, pi) => {
        const parts: React.ReactNode[] = [];
        let at = p.start;
        ranges.forEach((r, ri) => {
          if (r.end <= p.start || r.start >= p.end) return;
          const s = Math.max(r.start, p.start);
          const e = Math.min(r.end, p.end);
          if (s > at) parts.push(text.slice(at, s));
          parts.push(
            <motion.mark
              key={`${pi}-${ri}`}
              className="rounded-[2px] bg-no-repeat text-inherit"
              style={{
                backgroundColor: "transparent",
                backgroundImage: `linear-gradient(${wash}, ${wash})`,
                backgroundPosition: "0 0",
                color: "inherit",
              }}
              initial={{
                backgroundSize: motionSafe ? "0% 100%" : "100% 100%",
                opacity: motionSafe ? 1 : 0.4,
              }}
              animate={{ backgroundSize: "100% 100%", opacity: 1 }}
              transition={{
                duration: motionSafe ? durations.slow : durations.fast,
                ease: easings.enter,
                delay: motionSafe ? Math.min(ri * step, 0.6) : 0,
              }}
            >
              {text.slice(s, e)}
            </motion.mark>,
          );
          at = e;
        });
        if (at < p.end) parts.push(text.slice(at, p.end));
        return <p key={pi}>{parts}</p>;
      })}
    </div>
  );
}

function ReasonChip({
  layoutId,
  text,
  on,
  side,
  motionSafe,
  delay = 0,
  onClick,
}: {
  layoutId: string;
  text: string;
  on: boolean;
  side: ComparisonSide;
  motionSafe: boolean;
  delay?: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      layout={motionSafe ? "position" : false}
      layoutId={motionSafe ? layoutId : undefined}
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? {
              layout: springs.glide,
              y: { ...springs.snap, delay },
              opacity: { duration: durations.fast, delay },
            }
          : { duration: durations.fast }
      }
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-2.5 text-xs transition-colors",
        on
          ? "border-transparent text-primary-foreground"
          : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
        FOCUS_RING,
      )}
      style={on ? { background: HUE[side] } : undefined}
    >
      {text}
    </motion.button>
  );
}
