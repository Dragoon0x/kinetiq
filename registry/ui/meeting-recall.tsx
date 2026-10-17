"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowUp,
  AudioLines,
  CircleSlash,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type RecallSpeaker = { id: string; name: string };

export type RecallSegment = {
  id: string;
  /** A speaker id. */
  speaker: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
};

export type RecallClaim = {
  text: string;
  /** The transcript segments that support the claim; empty when nothing does. */
  refs: string[];
};

export type RecallAnswer = {
  id: string;
  question: string;
  claims: RecallClaim[];
  /** Words that ask this question when typed. @default words from the question */
  match?: string[];
};

export type MeetingRecallWaveStyle = "bars" | "mirror" | "line";
export type MeetingRecallDensity = "compact" | "regular" | "roomy";
export type MeetingRecallStatus = "ready" | "processing" | "empty" | "error";

export type MeetingRecallProps = {
  /** The meeting's name. @default "Tuesday roadmap call" */
  title?: string;
  /** Who spoke. @default defaultRecallSpeakers */
  speakers?: RecallSpeaker[];
  /** The transcript, in order. @default defaultRecallSegments */
  segments?: RecallSegment[];
  /** Loudness samples, 0 to 1, spread evenly over the recording. @default seeded from the segments */
  peaks?: number[];
  /** The questions the assistant can answer from this recording. @default defaultRecallAnswers */
  answers?: RecallAnswer[];
  /** How many of `answers` are already in the thread when it mounts. @default 1 */
  defaultAsked?: number;
  /** Where the playhead starts, in seconds. @default 0 */
  defaultTime?: number;
  /** Controlled playback. */
  playing?: boolean;
  /** Initial playback when uncontrolled. @default false */
  defaultPlaying?: boolean;
  /** Fires from the press or key that started or stopped playback. */
  onPlay?: (playing: boolean) => void;
  /** Fires when a chip, a transcript line or the scrubber moved the playhead. */
  onSeek?: (seconds: number, segmentIds: string[]) => void;
  /** A question was asked: the matching answer, or null when nothing in the recording does. */
  onAsk?: (question: string, answer: RecallAnswer | null) => void;
  /** Playback speed. @default 1 */
  rate?: number;
  /** Bars from the baseline, bars mirrored about the centre, or a filled envelope. @default "bars" */
  waveStyle?: MeetingRecallWaveStyle;
  /** Type and spacing in the thread and the transcript. @default "regular" */
  density?: MeetingRecallDensity;
  /** Chips, the played wave and the sweep — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The recording's state. @default "ready" */
  status?: MeetingRecallStatus;
  /** How far processing has got, 0 to 1, while `status` is "processing". @default 0.64 */
  progress?: number;
  /** "Try again" was pressed after the recording failed to load. */
  onRetry?: () => void;
  /** Height of the surface in px. @default 520 */
  height?: number;
  /** Read only: nothing can be asked, played or seeked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultRecallSpeakers: RecallSpeaker[] = [
  { id: "noor", name: "Noor Halvorsen" },
  { id: "tomas", name: "Tomas Reyes" },
  { id: "ada", name: "Ada Mensah" },
  { id: "kit", name: "Kit Laurent" },
];

const seg = (
  id: string,
  speaker: string,
  start: number,
  end: number,
  text: string,
): RecallSegment => ({ id, speaker, start, end, text });

/** The Waylight Tuesday roadmap call: the beta date, pricing, and the risks. */
export const defaultRecallSegments: RecallSegment[] = [
  seg(
    "s1",
    "noor",
    0,
    42,
    "Thanks for joining. Three things today: the beta date, pricing, and what's slipping.",
  ),
  seg(
    "s2",
    "tomas",
    42,
    118,
    "The sync rewrite is about two weeks behind. Conflict handling took longer than we planned.",
  ),
  seg("s3", "noor", 118, 196, "So is the 29 October beta still real?"),
  seg(
    "s4",
    "tomas",
    196,
    288,
    "Not with the rewrite in it. I'd rather ship it properly than rush the merge code.",
  ),
  seg(
    "s5",
    "noor",
    288,
    372,
    "Then let's move the beta to 12 November. That keeps the rewrite in and gives support a week.",
  ),
  seg(
    "s6",
    "kit",
    372,
    436,
    "12 November works for both pilot customers. I'll tell them today.",
  ),
  seg(
    "s7",
    "tomas",
    436,
    520,
    "Good. The two weeks of slack go straight into the sync rewrite, nothing else.",
  ),
  seg("s8", "noor", 520, 610, "Pricing next. Ada, where is the new page?"),
  seg(
    "s9",
    "ada",
    610,
    702,
    "Copy and layout are mine. A draft by Friday, with the three tiers side by side.",
  ),
  seg(
    "s10",
    "kit",
    702,
    790,
    "Before it ships I want two customers to read it. Fernworks and one other.",
  ),
  seg(
    "s11",
    "noor",
    790,
    860,
    "Agreed. Ada owns it, and Kit runs it past two customers first.",
  ),
  seg(
    "s12",
    "tomas",
    860,
    968,
    "Risk-wise, the rewrite could still slip into December if the edge cases keep coming.",
  ),
  seg(
    "s13",
    "ada",
    968,
    1060,
    "And support hasn't seen the new onboarding yet. That's on me this week.",
  ),
  seg(
    "s14",
    "noor",
    1060,
    1140,
    "Let's write those down as the two open risks. Same time next Tuesday.",
  ),
];

export const defaultRecallAnswers: RecallAnswer[] = [
  {
    id: "beta",
    question: "What did we decide about the beta date?",
    match: ["beta", "date", "launch", "decide", "ship"],
    claims: [
      {
        text: "The beta moves from 29 October to 12 November, so the sync rewrite stays in.",
        refs: ["s4", "s5"],
      },
      {
        text: "Kit confirmed the new date with both pilot customers.",
        refs: ["s6"],
      },
      {
        text: "The two weeks of slack go to the sync rewrite only.",
        refs: ["s7"],
      },
    ],
  },
  {
    id: "pricing",
    question: "Who owns the pricing page?",
    match: ["pricing", "price", "owns", "owner", "page"],
    claims: [
      {
        text: "Ada owns the copy and layout, with a draft due Friday.",
        refs: ["s9"],
      },
      {
        text: "Kit runs it past two customers before it ships.",
        refs: ["s10", "s11"],
      },
    ],
  },
  {
    id: "coldbrook",
    question: "Did anyone raise the Coldbrook migration?",
    match: ["coldbrook", "migration", "migrate"],
    claims: [
      {
        text: "Nobody mentioned a Coldbrook migration on this call.",
        refs: [],
      },
    ],
  },
  {
    id: "risks",
    question: "What are the open risks?",
    match: ["risk", "risks", "slip", "worry", "concern"],
    claims: [
      {
        text: "The sync rewrite could still slip into December.",
        refs: ["s12"],
      },
      {
        text: "Support hasn't seen the new onboarding; Ada is fixing that this week.",
        refs: ["s13"],
      },
      { text: "Both were written down as the open risks.", refs: ["s14"] },
    ],
  },
];

/** A small, fixed hash: the same loudness on every machine. */
const hash = (n: number) => {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Loudness from the transcript: speech is loud, the turn between speakers dips. */
export function peaksFrom(segments: RecallSegment[], count = 240): number[] {
  const end = segments.reduce((m, s) => Math.max(m, s.end), 1);
  return Array.from({ length: count }, (_, i) => {
    const t = ((i + 0.5) / count) * end;
    const s = segments.find((x) => t >= x.start && t < x.end);
    if (!s) return 0.06;
    const edge = Math.min(t - s.start, s.end - t);
    const turn = Math.min(1, edge / 6);
    const voice = 0.5 + (hash(s.speaker.length * 31 + s.start) - 0.5) * 0.3;
    const grain = 0.55 + hash(i * 7 + 3) * 0.45;
    return Number((0.08 + voice * grain * (0.25 + 0.75 * turn)).toFixed(3));
  });
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

const r2 = (v: number) => Math.round(v * 100) / 100;

const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const spoken = (s: number) => {
  const t = Math.max(0, Math.round(s));
  const m = Math.floor(t / 60);
  const sec = t % 60;
  const parts: string[] = [];
  if (m) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  if (sec || !m) parts.push(`${sec} ${sec === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
};

const DENSITY: Record<
  MeetingRecallDensity,
  { text: string; row: string; gap: string }
> = {
  compact: { text: "text-[12px] leading-[18px]", row: "py-1", gap: "gap-3" },
  regular: { text: "text-[13px] leading-5", row: "py-1.5", gap: "gap-4" },
  roomy: { text: "text-[14px] leading-6", row: "py-2.5", gap: "gap-5" },
};

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

function matchAnswer(
  text: string,
  answers: RecallAnswer[],
): RecallAnswer | null {
  const q = text.toLowerCase();
  let best: RecallAnswer | null = null;
  let score = 0;
  for (const a of answers) {
    const keys = a.match ?? wordsOf(a.question);
    const s = keys.filter((k) => q.includes(k.toLowerCase())).length;
    if (s > score) {
      best = a;
      score = s;
    }
  }
  return best;
}

/** The waveform as one path per layer: bars, mirrored bars or an envelope. */
function wavePath(
  peaks: number[],
  bars: number,
  style: MeetingRecallWaveStyle,
  gapless: boolean,
): string {
  if (peaks.length === 0) return "";
  const n = Math.max(8, bars);
  const pooled = Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i * peaks.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * peaks.length) / n));
    let m = 0;
    for (let k = a; k < b; k++) m = Math.max(m, peaks[k] ?? 0);
    return Math.min(1, Math.max(0, m));
  });
  const bw = 1000 / n;
  if (style === "line") {
    const pts = pooled.map(
      (p, i) => `L${r2((i + 0.5) * bw)} ${r2(100 - p * 92)}`,
    );
    return `M0 100 ${pts.join(" ")} L1000 100 Z`;
  }
  // Under ~2.5px a bar's gap only smears: drop it and draw a solid strip.
  const w = gapless ? bw : bw * 0.62;
  return pooled
    .map((p, i) => {
      const x = r2(i * bw);
      const h = Math.max(2, p * (style === "mirror" ? 96 : 92));
      const top = style === "mirror" ? r2(50 - h / 2) : r2(100 - h);
      const bottom = style === "mirror" ? r2(50 + h / 2) : 100;
      return `M${x} ${bottom}V${top}H${r2(x + w)}V${bottom}Z`;
    })
    .join("");
}

type Entry =
  | {
      kind: "answer";
      key: string;
      question: string;
      answer: RecallAnswer | null;
    }
  | { kind: "searching"; key: string; question: string };

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * Questions asked of a recorded meeting, with its waveform and transcript
 * docked beside the thread. Every claim in an answer carries a timestamp chip;
 * pressing one glides the waveform's playhead to the moment on `glide` while
 * the transcript scrolls its own box there and a highlight sweeps left to right
 * across each supporting line in turn. A claim nothing supports says so with a
 * dashed "No source" mark instead of a chip.
 *
 * The playhead is one motion value: playback advances it from a frame loop
 * that runs only while playing, on screen and visible, and the waveform's
 * played clip, the playhead and the clock are written from it without a
 * re-render per frame. Tab moves through the chips and Enter seeks; K plays
 * and pauses from anywhere outside a text field; the waveform is a slider
 * (drag, click, arrows ±5 s, Page keys ±30 s, Home/End). Under 40rem the
 * transcript is a sheet that rises on `glide` when a chip is pressed. Under
 * reduced motion the playhead and transcript jump, the highlight fades in
 * whole and the sheet fades; playback still plays.
 */
export function MeetingRecall({
  title = "Tuesday roadmap call",
  speakers = defaultRecallSpeakers,
  segments = defaultRecallSegments,
  peaks,
  answers = defaultRecallAnswers,
  defaultAsked = 1,
  defaultTime = 0,
  playing,
  defaultPlaying = false,
  onPlay,
  onSeek,
  onAsk,
  rate = 1,
  waveStyle = "bars",
  density = "regular",
  accent = "var(--accent-bright)",
  status = "ready",
  progress = 0.64,
  onRetry,
  height = 520,
  disabled = false,
  className,
}: MeetingRecallProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const clipId = `${uid}-played`.replace(/[^a-zA-Z0-9_-]/g, "");
  const d = DENSITY[density] ?? DENSITY.regular;

  const ready = status === "ready";
  const live = ready && !disabled;
  const duration = Math.max(
    1,
    segments.reduce((m, s) => Math.max(m, s.end), 0),
  );
  const levels = React.useMemo(
    () => peaks ?? peaksFrom(segments),
    [peaks, segments],
  );
  const nameOf = (id: string) => speakers.find((s) => s.id === id)?.name ?? id;

  /* -------------------------------- state -------------------------------- */

  const [entries, setEntries] = React.useState<Entry[]>(() =>
    answers.slice(0, Math.max(0, defaultAsked)).map((a) => ({
      kind: "answer",
      key: a.id,
      question: a.question,
      answer: a,
    })),
  );
  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const isPlaying = (playing ?? ownPlaying) && live;
  const [lit, setLit] = React.useState<{ n: number; ids: string[] }>({
    n: 0,
    ids: [],
  });
  const [second, setSecond] = React.useState(() =>
    Math.round(Math.min(duration, Math.max(0, defaultTime))),
  );
  const [activeSeg, setActiveSeg] = React.useState<string | null>(null);
  const [rowFocus, setRowFocus] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [narrow, setNarrow] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [bars, setBars] = React.useState({ n: 96, gapless: false });
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const time = useMotionValue(Math.min(duration, Math.max(0, defaultTime)));
  const seekAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const scrollAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const timers = React.useRef<number[]>([]);
  const counter = React.useRef(0);
  const opener = React.useRef<HTMLElement | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const threadRef = React.useRef<HTMLDivElement | null>(null);
  const transcriptRef = React.useRef<HTMLOListElement | null>(null);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const clipRect = React.useRef<SVGRectElement | null>(null);
  const headRef = React.useRef<HTMLSpanElement | null>(null);
  const clockRef = React.useRef<HTMLSpanElement | null>(null);
  const [waveNode, setWaveNode] = React.useState<HTMLDivElement | null>(null);

  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );

  /* --------------------------- the playhead write ------------------------ */

  // One subscription writes everything the playhead moves: the played clip,
  // the line, the clock. React only hears about whole seconds and segments.
  React.useEffect(() => {
    const write = (t: number) => {
      const f = Math.min(1, Math.max(0, t / duration));
      clipRect.current?.setAttribute("width", String(r2(f * 1000)));
      if (headRef.current) headRef.current.style.left = `${r2(f * 100)}%`;
      if (clockRef.current) clockRef.current.textContent = clock(t);
      setSecond(Math.round(t));
      const s = segments.find((x) => t >= x.start && t < x.end);
      setActiveSeg(s ? s.id : null);
    };
    write(time.get());
    return time.on("change", write);
  }, [time, duration, segments]);

  // The bar count follows the scrubber's width: three pixels a bar.
  React.useEffect(() => {
    if (!waveNode) return;
    const ro = new ResizeObserver(() => {
      const w = waveNode.clientWidth;
      if (w <= 0) return;
      const n = Math.max(40, Math.min(160, Math.floor(w / 3)));
      const gapless = w / n < 2.5;
      setBars((b) => (b.n === n && b.gapless === gapless ? b : { n, gapless }));
    });
    ro.observe(waveNode);
    return () => ro.disconnect();
  }, [waveNode]);

  // Narrow surfaces keep the transcript in a sheet.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      const isNarrow = node.clientWidth < 640;
      setNarrow(isNarrow);
      if (!isNarrow) setSheetOpen(false);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Playback: a frame loop that only runs while playing, on screen and visible.
  React.useEffect(() => {
    if (!isPlaying) return;
    const node = rootRef.current;
    if (!node) return;
    let raf = 0;
    let last = 0;
    let seen = true;
    const step = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (!seekAnim.current) {
        const next = Math.min(duration, time.get() + dt * Math.max(0.1, rate));
        time.set(next);
        if (next >= duration) {
          raf = 0;
          if (playing === undefined) setOwnPlaying(false);
          onPlay?.(false);
          return;
        }
      }
      raf = requestAnimationFrame(step);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (seen && !document.hidden) raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(([e]) => {
      seen = !!e?.isIntersecting;
      sync();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      cancelAnimationFrame(raf);
    };
  }, [isPlaying, duration, rate, time, playing, onPlay]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      seekAnim.current?.stop();
      scrollAnim.current?.stop();
      for (const t of list) window.clearTimeout(t);
    };
  }, []);

  // A thread opens at its newest answer.
  React.useLayoutEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [status]);

  /* ------------------------------- actions ------------------------------- */

  const glideScroll = (el: HTMLElement, top: number) => {
    scrollAnim.current?.stop();
    const target = Math.round(
      Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight)),
    );
    if (!motionSafe) {
      el.scrollTop = target;
      return;
    }
    scrollAnim.current = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = Math.round(v);
      },
    });
  };

  const setPlay = (next: boolean) => {
    if (!live && next) return;
    if (playing === undefined) setOwnPlaying(next);
    onPlay?.(next);
    say(next ? `Playing from ${spoken(time.get())}.` : "Paused.");
  };

  const seek = (to: number, ids: string[], announce = true) => {
    if (!live) return;
    const t = Math.min(duration, Math.max(0, to));
    seekAnim.current?.stop();
    seekAnim.current = null;
    if (motionSafe) {
      seekAnim.current = animate(time, t, {
        ...springs.glide,
        onComplete: () => {
          seekAnim.current = null;
        },
      });
    } else time.jump(t);
    if (announce) say(`At ${clock(t)}.`);
    onSeek?.(t, ids);
  };

  const jump = (refs: string[], from: HTMLElement | null) => {
    if (!live) return;
    const first = segments.find((s) => s.id === refs[0]);
    if (!first) return;
    seek(first.start, refs, false);
    setLit((l) => ({ n: l.n + 1, ids: refs }));
    say(
      `Jumped to ${clock(first.start)}. ${refs.length} supporting ${refs.length === 1 ? "line" : "lines"}.`,
    );
    if (narrow) {
      opener.current = from;
      setSheetOpen(true);
    }
    // The transcript scrolls its own box to the first supporting line.
    timers.current.push(
      window.setTimeout(() => {
        const list = transcriptRef.current;
        const row = list?.querySelector<HTMLElement>(
          `[data-mr-seg="${CSS.escape(first.id)}"]`,
        );
        if (list && row) glideScroll(list, row.offsetTop - 8);
        if (narrow) sheetRef.current?.focus({ preventScroll: true });
      }, 40),
    );
  };

  const closeSheet = () => {
    setSheetOpen(false);
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  };

  const ask = (text: string, answer: RecallAnswer | null) => {
    if (!live || !text.trim()) return;
    counter.current += 1;
    const key = `q${counter.current}`;
    const question = text.trim();
    setEntries((list) => [...list, { kind: "searching", key, question }]);
    onAsk?.(question, answer);
    say(`Asked: ${question}`);
    const el = threadRef.current;
    timers.current.push(
      window.setTimeout(() => {
        if (el) glideScroll(el, el.scrollHeight);
      }, 30),
    );
    timers.current.push(
      window.setTimeout(() => {
        setEntries((list) =>
          list.map((e) =>
            e.key === key ? { kind: "answer", key, question, answer } : e,
          ),
        );
        say(
          answer
            ? answer.claims.map((c) => c.text).join(" ")
            : "Nothing in this recording answers that.",
        );
        timers.current.push(
          window.setTimeout(() => {
            if (el) glideScroll(el, el.scrollHeight);
          }, 60),
        );
      }, 650),
    );
  };

  const onRootKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (e.key === "Escape" && sheetOpen) {
      e.preventDefault();
      e.stopPropagation();
      closeSheet();
      return;
    }
    if (target.closest("textarea, input")) return;
    if (
      (e.key === "k" || e.key === "K") &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      setPlay(!isPlaying);
    }
  };

  /* ------------------------------ scrubber ------------------------------- */

  const fromPointer = (clientX: number) => {
    const r = waveNode?.getBoundingClientRect();
    if (!r || r.width <= 0) return time.get();
    return ((clientX - r.left) / r.width) * duration;
  };
  const segIdsAt = (t: number) =>
    segments.filter((s) => t >= s.start && t < s.end).map((s) => s.id);

  const scrub = useDrag({
    axis: "x",
    threshold: 4,
    disabled: !live,
    onStart: () => {
      seekAnim.current?.stop();
      seekAnim.current = null;
    },
    onMove: ({ point }) => {
      // 1:1 under the finger: the playhead is set, not sprung.
      time.set(Math.min(duration, Math.max(0, fromPointer(point.x))));
    },
    onEnd: () => {
      const t = time.get();
      onSeek?.(t, segIdsAt(t));
      say(`At ${clock(t)}.`);
    },
    onTap: (e) => {
      const t = fromPointer(e.clientX);
      seek(t, segIdsAt(t));
    },
  });

  const onWaveKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const t = time.get();
    const to =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? t + 5
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? t - 5
          : e.key === "PageUp"
            ? t + 30
            : e.key === "PageDown"
              ? t - 30
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? duration
                  : null;
    if (to === null) return;
    e.preventDefault();
    seek(to, segIdsAt(Math.min(duration, Math.max(0, to))));
  };

  /* -------------------------------- render ------------------------------- */

  const path = React.useMemo(
    () =>
      status === "processing" || status === "empty"
        ? wavePath(
            levels.map(() => 0.05),
            bars.n,
            waveStyle,
            bars.gapless,
          )
        : wavePath(levels, bars.n, waveStyle, bars.gapless),
    [levels, bars, waveStyle, status],
  );
  const litSegs = segments.filter((s) => lit.ids.includes(s.id));
  const startFrac = Math.min(1, Math.max(0, time.get() / duration));

  const playButton = (
    <button
      type="button"
      aria-pressed={isPlaying}
      aria-label={isPlaying ? "Pause" : "Play"}
      aria-keyshortcuts="k"
      aria-disabled={!live || undefined}
      onClick={() => setPlay(!isPlaying)}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-(--mr-solid) text-primary-foreground transition-opacity aria-disabled:opacity-40",
        FOCUS,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={isPlaying ? "pause" : "play"}
          className="inline-flex"
          initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { scale: springs.flick, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {isPlaying ? (
            <Pause aria-hidden className="size-3.5" fill="currentColor" />
          ) : (
            <Play aria-hidden className="ml-0.5 size-3.5" fill="currentColor" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );

  const player = (
    <div className="flex items-center gap-2.5 border-b border-hairline px-3 py-2 [grid-area:player] @min-[40rem]/meeting-recall:flex-col @min-[40rem]/meeting-recall:items-stretch @min-[40rem]/meeting-recall:gap-2 @min-[40rem]/meeting-recall:py-3">
      <div className="hidden items-center justify-between font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase @min-[40rem]/meeting-recall:flex">
        <span>Recording</span>
        <span>{speakers.length} speakers</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="@min-[40rem]/meeting-recall:hidden">{playButton}</span>
        <div
          ref={setWaveNode}
          role="slider"
          tabIndex={live ? 0 : -1}
          aria-label="Position in the recording"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={second}
          aria-valuetext={`${spoken(second)} of ${spoken(duration)}`}
          aria-disabled={!live || undefined}
          onKeyDown={onWaveKey}
          {...scrub}
          className={cn(
            "relative h-9 min-w-0 flex-1 cursor-pointer touch-pan-y rounded-1 select-none @min-[40rem]/meeting-recall:h-14",
            !live && "cursor-not-allowed",
            FOCUS,
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            shapeRendering={bars.gapless ? "crispEdges" : undefined}
            className="absolute inset-0 size-full"
          >
            <defs>
              <clipPath id={clipId}>
                <rect
                  ref={clipRect}
                  x={0}
                  y={0}
                  height={100}
                  width={r2(startFrac * 1000)}
                />
              </clipPath>
            </defs>
            <AnimatePresence initial={false}>
              {litSegs.map((s) => (
                <motion.rect
                  key={`${lit.n}-${s.id}`}
                  x={r2((s.start / duration) * 1000)}
                  y={0}
                  width={r2(((s.end - s.start) / duration) * 1000)}
                  height={100}
                  className="fill-(--mr-band)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base }}
                />
              ))}
            </AnimatePresence>
            <path d={path} className="fill-ink-3/45" />
            <path
              d={path}
              clipPath={`url(#${clipId})`}
              className="fill-(--mr-accent)"
            />
          </svg>
          <span
            ref={headRef}
            aria-hidden
            className="pointer-events-none absolute -top-0.5 -bottom-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: `${r2(startFrac * 100)}%` }}
          >
            <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-foreground" />
          </span>
          {status === "processing" ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="inline-flex h-6 items-center gap-2 rounded-full border border-hairline bg-popover px-2.5 font-mono text-[10px] tracking-[0.06em] text-ink-2 uppercase">
                <span className="relative h-1 w-12 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-(--mr-accent)"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </span>
                Processing · {Math.round(progress * 100)}%
              </span>
            </span>
          ) : null}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums @min-[40rem]/meeting-recall:hidden">
          <span ref={clockRef}>{clock(time.get())}</span>
        </span>
      </div>
      <div className="hidden items-center gap-2.5 @min-[40rem]/meeting-recall:flex">
        {playButton}
        <span className="font-mono text-[11px] text-ink-2 tabular-nums">
          {clock(second)}
          <span className="text-ink-3"> / {clock(duration)}</span>
        </span>
        <span className="ml-auto font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
          K plays
        </span>
      </div>
    </div>
  );

  const rowStop =
    (rowFocus && segments.some((x) => x.id === rowFocus) ? rowFocus : null) ??
    lit.ids[0] ??
    activeSeg ??
    segments[0]?.id;

  const transcriptBody =
    status === "processing" ? (
      <p className="p-4 text-[12px] leading-5 text-ink-3">
        The transcript appears when processing finishes.
      </p>
    ) : status === "empty" || segments.length === 0 ? (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <CircleSlash aria-hidden className="size-4 text-ink-3" />
        <p className="text-[12px] text-ink-2">
          No speech was found in this recording.
        </p>
      </div>
    ) : (
      <ol
        ref={transcriptRef}
        aria-label="Transcript"
        className="relative flex flex-1 [scrollbar-width:thin] flex-col gap-0.5 overflow-y-auto overscroll-contain p-2"
      >
        {segments.map((s) => {
          const litIndex = lit.ids.indexOf(s.id);
          const now = activeSeg === s.id;
          const sweep = Math.min(0.16, 0.3 / Math.max(1, lit.ids.length - 1));
          return (
            <li
              key={s.id}
              data-mr-seg={s.id}
              aria-current={litIndex >= 0 || undefined}
              className={cn("relative rounded-2 px-2", d.row)}
            >
              {litIndex >= 0 ? (
                <motion.span
                  key={`lit-${lit.n}`}
                  aria-hidden
                  className="absolute inset-0 rounded-2 bg-(--mr-wash)"
                  initial={
                    motionSafe
                      ? { clipPath: "inset(0 100% 0 0)" }
                      : { opacity: 0 }
                  }
                  animate={
                    motionSafe
                      ? { clipPath: "inset(0 0% 0 0)" }
                      : { opacity: 1 }
                  }
                  transition={{
                    duration: motionSafe ? 0.3 : durations.base,
                    ease: easings.enter,
                    delay: motionSafe ? 0.12 + litIndex * sweep : 0,
                  }}
                />
              ) : null}
              {now ? (
                <span
                  aria-hidden
                  className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-(--mr-accent)"
                />
              ) : null}
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Play from ${spoken(s.start)}, ${nameOf(s.speaker)}`}
                  aria-disabled={!live || undefined}
                  // One tab stop for the whole transcript; arrows walk it.
                  tabIndex={s.id === rowStop ? 0 : -1}
                  data-mr-row={s.id}
                  onFocus={() => setRowFocus(s.id)}
                  onKeyDown={(e) => {
                    const i = segments.findIndex((x) => x.id === s.id);
                    const to =
                      e.key === "ArrowDown"
                        ? i + 1
                        : e.key === "ArrowUp"
                          ? i - 1
                          : e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? segments.length - 1
                              : null;
                    if (to === null) return;
                    e.preventDefault();
                    const next =
                      segments[Math.max(0, Math.min(segments.length - 1, to))];
                    if (!next) return;
                    setRowFocus(next.id);
                    transcriptRef.current
                      ?.querySelector<HTMLElement>(
                        `[data-mr-row="${CSS.escape(next.id)}"]`,
                      )
                      ?.focus();
                  }}
                  onClick={() => seek(s.start, [s.id])}
                  className={cn(
                    "inline-flex h-5 items-center rounded-1 px-1 font-mono text-[10px] text-ink-3 tabular-nums transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  {clock(s.start)}
                </button>
                <span className="truncate text-[11px] font-medium text-ink-2">
                  {nameOf(s.speaker)}
                </span>
                {now ? (
                  <span className="ml-auto font-mono text-[9px] tracking-[0.08em] text-(--mr-accent) uppercase">
                    now
                  </span>
                ) : null}
              </div>
              <p className={cn("relative pl-1 text-foreground", d.text)}>
                {s.text}
              </p>
            </li>
          );
        })}
      </ol>
    );

  const transcriptOpen = !narrow || sheetOpen;
  const transcript = (
    <motion.div
      ref={sheetRef}
      role="region"
      aria-label="Transcript"
      tabIndex={-1}
      inert={!transcriptOpen || undefined}
      aria-hidden={!transcriptOpen || undefined}
      // Closed below the surface by CSS on narrow widths, so the first paint
      // is right before anything is measured; the spring lifts it from there.
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 flex h-[68%] translate-y-full flex-col overflow-hidden rounded-t-4 border-t border-hairline-strong bg-popover outline-none",
        // The lift shadow belongs to an open sheet; a closed one casts none.
        sheetOpen &&
          "shadow-[0_-10px_30px_color-mix(in_oklab,black_16%,transparent)]",
        "@min-[40rem]/meeting-recall:static @min-[40rem]/meeting-recall:z-auto @min-[40rem]/meeting-recall:h-auto @min-[40rem]/meeting-recall:translate-y-0 @min-[40rem]/meeting-recall:rounded-none @min-[40rem]/meeting-recall:border-t-0 @min-[40rem]/meeting-recall:bg-transparent @min-[40rem]/meeting-recall:shadow-none @min-[40rem]/meeting-recall:[grid-area:transcript]",
      )}
      initial={false}
      animate={
        narrow
          ? motionSafe
            ? { y: sheetOpen ? "-100%" : "0%", opacity: 1 }
            : { y: sheetOpen ? "-100%" : "0%", opacity: sheetOpen ? 1 : 0 }
          : { y: "0%", opacity: 1 }
      }
      transition={
        motionSafe
          ? sheetOpen
            ? springs.glide
            : { duration: durations.base, ease: easings.exit }
          : { y: { duration: 0 }, opacity: { duration: durations.base } }
      }
    >
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 @min-[40rem]/meeting-recall:hidden">
        <span
          aria-hidden
          className="mx-auto h-1 w-9 rounded-full bg-hairline-strong"
        />
      </div>
      <div className="flex items-center gap-2 px-3 pb-1 @min-[40rem]/meeting-recall:pt-2">
        <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
          Transcript
        </span>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {segments.length} lines
        </span>
        <button
          type="button"
          aria-label="Close the transcript"
          onClick={closeSheet}
          className={cn(
            "ml-auto inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground @min-[40rem]/meeting-recall:hidden",
            FOCUS,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      {transcriptBody}
    </motion.div>
  );

  const avatar = (
    <span
      aria-hidden
      className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-(--mr-wash) text-(--mr-accent)"
    >
      <AudioLines className="size-3.5" />
    </span>
  );

  const claimList = (answer: RecallAnswer | null) => {
    const claims = answer?.claims ?? [
      { text: "Nothing in this recording answers that.", refs: [] },
    ];
    const step = cascade(claims.length);
    return (
      <ul className="flex flex-col gap-2">
        {claims.map((c, i) => {
          const refs = c.refs.filter((id) => segments.some((s) => s.id === id));
          const first = segments.find((s) => s.id === refs[0]);
          return (
            <motion.li
              key={i}
              className={cn("leading-5 text-foreground", d.text)}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? {
                      y: { ...springs.snap, delay: i * step },
                      opacity: { duration: durations.base, delay: i * step },
                    }
                  : { duration: durations.fast }
              }
            >
              {c.text}{" "}
              {first ? (
                <motion.button
                  type="button"
                  aria-label={`Jump to ${spoken(first.start)}, ${refs.length} supporting ${refs.length === 1 ? "line" : "lines"}`}
                  aria-disabled={!live || undefined}
                  onClick={(e) => jump(refs, e.currentTarget)}
                  whileTap={motionSafe && live ? { scale: 0.94 } : undefined}
                  transition={springs.flick}
                  className={cn(
                    "inline-flex h-5 translate-y-[-1px] items-center gap-1 rounded-full border border-(--mr-line) bg-(--mr-wash) px-1.5 align-middle font-mono text-[10px] font-medium text-(--mr-accent) tabular-nums transition-colors hover:bg-(--mr-band)",
                    FOCUS,
                  )}
                >
                  <Play aria-hidden className="size-2.5" fill="currentColor" />
                  {clock(first.start)}
                  {refs.length > 1 ? (
                    <span className="text-ink-3">+{refs.length - 1}</span>
                  ) : null}
                </motion.button>
              ) : (
                <span className="inline-flex h-5 translate-y-[-1px] items-center gap-1 rounded-full border border-dashed border-hairline-strong px-1.5 align-middle font-mono text-[10px] text-ink-3">
                  <CircleSlash aria-hidden className="size-2.5" />
                  No source
                </span>
              )}
            </motion.li>
          );
        })}
        {!answer || answer.claims.every((c) => c.refs.length === 0) ? (
          <li className="text-[11px] leading-4 text-ink-3">
            Not found in the recording, so there is nothing to jump to.
          </li>
        ) : null}
      </ul>
    );
  };

  const asked = new Set(
    entries.flatMap((e) =>
      e.kind === "answer" && e.answer ? [e.answer.id] : [],
    ),
  );
  const suggestions = answers.filter((a) => !asked.has(a.id));

  const thread =
    status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The recording did not load.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <ol
        role="list"
        aria-label="Questions and answers"
        className={cn(
          "flex flex-col px-3 pt-4 pb-6 @min-[30rem]/meeting-recall:px-4",
          d.gap,
        )}
      >
        {status === "processing" || status === "empty" ? (
          <li className="flex items-start gap-2">
            <span className="sr-only">Assistant: </span>
            {avatar}
            <p className={cn("text-ink-2", d.text)}>
              {status === "processing"
                ? `The recording is still processing (${Math.round(progress * 100)}%). Questions open when the transcript is ready.`
                : "No speech was found in this recording, so there is nothing to answer from."}
            </p>
          </li>
        ) : (
          entries.map((e) => (
            <React.Fragment key={e.key}>
              <li className="flex flex-col items-end">
                <span className="sr-only">You: </span>
                <p
                  className={cn(
                    "max-w-[86%] rounded-3 rounded-br-1 bg-(--mr-wash) px-3 py-1.5 text-foreground",
                    d.text,
                  )}
                >
                  {e.question}
                </p>
              </li>
              <li className="flex items-start gap-2">
                <span className="sr-only">Assistant: </span>
                {avatar}
                <div className="min-w-0 flex-1">
                  {e.kind === "searching" ? (
                    <span className="inline-flex h-6 items-center gap-2 text-[12px] text-ink-3">
                      <span className="inline-flex gap-1" aria-hidden>
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="size-1.5 animate-pulse rounded-full bg-ink-3 motion-reduce:animate-none"
                            style={{ animationDelay: `${i * 160}ms` }}
                          />
                        ))}
                      </span>
                      Searching the transcript
                    </span>
                  ) : (
                    claimList(e.answer)
                  )}
                </div>
              </li>
            </React.Fragment>
          ))
        )}
      </ol>
    );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={title}
      onKeyDown={onRootKey}
      className={cn(
        "@container/meeting-recall relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          height,
          "--mr-accent": accent,
          "--mr-wash": `color-mix(in oklab, ${accent} 13%, transparent)`,
          "--mr-band": `color-mix(in oklab, ${accent} 20%, transparent)`,
          "--mr-line": `color-mix(in oklab, ${accent} 40%, transparent)`,
          "--mr-solid": `oklch(from ${accent} 0.52 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 @min-[30rem]/meeting-recall:px-4">
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-(--mr-wash) text-(--mr-accent)"
        >
          <AudioLines className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-[11px] text-ink-3">
            Waylight · {clock(duration)} · {speakers.length} speakers
          </p>
        </div>
        <button
          type="button"
          aria-expanded={sheetOpen}
          onClick={() => {
            if (sheetOpen) closeSheet();
            else {
              opener.current = null;
              setSheetOpen(true);
            }
          }}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-input px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2 @min-[40rem]/meeting-recall:hidden",
            FOCUS,
          )}
        >
          <ScrollText aria-hidden className="size-3.5" />
          <span className="sr-only @min-[22rem]/meeting-recall:not-sr-only">
            Transcript
          </span>
        </button>
      </header>

      <div className="relative grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden [grid-template-areas:'player'_'thread'] @min-[40rem]/meeting-recall:grid-cols-[minmax(0,1fr)_19rem] @min-[40rem]/meeting-recall:[grid-template-areas:'thread_player'_'thread_transcript']">
        {player}
        <div
          ref={threadRef}
          className="[scrollbar-width:thin] overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_14px)] [grid-area:thread] @min-[40rem]/meeting-recall:border-r @min-[40rem]/meeting-recall:border-hairline"
        >
          {thread}
        </div>
        {transcript}
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline p-3">
        {suggestions.length && ready ? (
          <div
            role="group"
            aria-label="Suggested questions"
            className="-mx-3 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3"
          >
            {suggestions.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-disabled={!live || undefined}
                onClick={() => ask(a.question, a)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center rounded-full border border-hairline-strong bg-surface-1 px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                {a.question}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text || !live) return;
            setDraft("");
            ask(text, matchAnswer(text, answers));
          }}
        >
          <input
            type="text"
            value={draft}
            readOnly={!live}
            aria-disabled={!live || undefined}
            aria-label={`Ask about the ${title}`}
            placeholder={
              status === "processing"
                ? "Questions open when processing finishes"
                : "Ask what was decided"
            }
            onChange={(e) => {
              const text = e.currentTarget.value;
              setDraft(text);
            }}
            className={cn(
              "h-9 min-w-0 flex-1 rounded-3 border border-hairline-strong bg-surface-1 px-3 text-[13px] text-foreground placeholder:text-ink-3",
              FOCUS_IN,
            )}
          />
          <button
            type="submit"
            aria-label="Ask"
            aria-disabled={!live || !draft.trim() || undefined}
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-3 bg-(--mr-solid) text-primary-foreground transition-opacity aria-disabled:opacity-40",
              FOCUS,
            )}
          >
            <ArrowUp aria-hidden className="size-4" />
          </button>
        </form>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
