"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Hand,
  Mic,
  Phone,
  PhoneOff,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type VoiceRole = "user" | "assistant";
export type VoiceOrb = "blob" | "rings" | "dots";
export type VoiceCaptions = "transcript" | "live" | "off";
export type VoicePhase =
  "connecting" | "listening" | "thinking" | "speaking" | "ended";
export type VoiceStatus = "ready" | "connecting" | "error";

export type VoiceTurn = {
  /** Unique within the call. */
  id: string;
  role: VoiceRole;
  /** What was said, as it would be transcribed. */
  text: string;
};

export type VoiceModeProps = {
  /** How the orb draws the voice: a rippling blob, a disc with two trailing rings, or a ring of dots. @default "blob" */
  orb?: VoiceOrb;
  /** What is shown of the words: the whole conversation as lines, only the current utterance under the orb, or nothing. @default "transcript" */
  captions?: VoiceCaptions;
  /** How far the orb swells with the voice, 0 to 1. 0 keeps it round and still. @default 0.6 */
  level?: number;
  /** The conversation, played at speaking pace. Append turns as they are transcribed and the call goes on. @default defaultVoiceTurns */
  turns?: VoiceTurn[];
  /** Controlled: the call is on. Turning it back on starts the conversation again. */
  live?: boolean;
  /** Initial state when uncontrolled. @default true */
  defaultLive?: boolean;
  /** Fires from End and Call again. */
  onLiveChange?: (live: boolean) => void;
  /** Controlled mute. */
  muted?: boolean;
  /** Initial mute when uncontrolled. @default false */
  defaultMuted?: boolean;
  /** Fires from the Mute button. */
  onMutedChange?: (muted: boolean) => void;
  /** The reply was cut off: the turn, and the words of it already said. */
  onInterrupt?: (turn: VoiceTurn, spoken: string) => void;
  /** The call moved between listening, thinking, speaking and ended. */
  onPhaseChange?: (phase: VoicePhase) => void;
  /** Reads the live input level, 0 to 1, each frame while listening (an analyser on the microphone). Without it, a seeded voice is simulated. */
  meter?: () => number;
  /** Speaking pace, in words a second. @default 2.6 */
  pace?: number;
  /** Who is on the other end: the header, the captions and the names. @default "Coldbrook Assist" */
  agent?: string;
  /** The line is still connecting, or the microphone could not be reached. @default "ready" */
  status?: VoiceStatus;
  /** Retry was pressed after an error. */
  onRetry?: () => void;
  /** The surface's accessible name. @default "Voice call with <agent>" */
  label?: string;
  /** Play the controls. Off unless asked for. @default false */
  sound?: boolean;
  /** The controls do nothing; the call still plays. */
  disabled?: boolean;
  /** Classes for the root. It is 540px tall by default; pass a height class to change it. */
  className?: string;
};

/** A Coldbrook Bank card line: a charge the caller did not make. */
export const defaultVoiceTurns: VoiceTurn[] = [
  {
    id: "t1",
    role: "user",
    text: "Hi, I think someone used my card at a fuel station this morning.",
  },
  {
    id: "t2",
    role: "assistant",
    text: "I can see a charge of 64.20 at Basinworks Fuel at 7:42 today. I have frozen your card, so nothing else can go through. Do you recognise any other payments from today?",
  },
  {
    id: "t3",
    role: "user",
    text: "No, just that one. Everything else is mine.",
  },
  {
    id: "t4",
    role: "assistant",
    text: "Then I will dispute the 64.20 and send you a new card. It should arrive in three to five working days, and the money will be back in your account while we look into it.",
  },
  {
    id: "t5",
    role: "user",
    text: "Can I still pay with my phone until then?",
  },
  {
    id: "t6",
    role: "assistant",
    text: "Yes. Your new card number is already in the app, so phone payments work straight away.",
  },
];

type Mode = "gap" | "think" | "talk" | "idle";

/** Where the call is: the turn, how many of its words are out, and what it is doing. */
type Step = { turn: number; words: number; mode: Mode; run: number };

type Line = {
  turn: VoiceTurn;
  text: string;
  live: boolean;
  /** Cut off by Interrupt: what was said of it ("" if it never started). */
  cut?: string;
};

type Api = {
  advance: () => void;
};

/** What the per-frame loop needs to know about who is talking. */
type Voice = {
  source: "user" | "assistant" | "think" | "ambient" | "muted";
  seed: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A seeded number in [0, 1) for syllable `k` of a voice. */
const noise = (seed: number, k: number) =>
  (Math.imul(seed ^ Math.imul(k + 1, 2654435761), 1597334677) >>> 0) /
  4294967296;

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

/** How long a word takes to say at `pace`, and the breath after it. */
function wordMs(word: string, pace: number) {
  const base = 1000 / Math.max(0.5, pace);
  const said = base * (0.55 + (0.45 * word.replace(/[^\w]/g, "").length) / 5.5);
  const pause = /[.?!]$/.test(word) ? 380 : /[,;:]$/.test(word) ? 180 : 0;
  return { said: Math.round(said), pause };
}

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Resting size of the orb in each state, in viewBox px (the box is 240). */
const REST: Record<VoicePhase, number> = {
  connecting: 46,
  listening: 64,
  thinking: 56,
  speaking: 70,
  ended: 26,
};

/** Pigments, not text colours: the orb is a filled object. */
const PIGMENT: Record<VoicePhase | "muted", string> = {
  connecting: "oklch(from var(--ink-3) 0.62 c h)",
  listening: "oklch(from var(--accent-bright) 0.66 c h)",
  thinking: "oklch(from var(--accent) 0.54 c h)",
  speaking: "oklch(from var(--signal) 0.74 c h)",
  ended: "oklch(from var(--ink-3) 0.6 c h)",
  muted: "oklch(from var(--ink-3) 0.68 c h)",
};

const C = 120;
const pt = (r: number, a: number) =>
  [r2(C + r * Math.cos(a)), r2(C + r * Math.sin(a))] as const;

/** A closed curve through points, as cubic Béziers (Catmull-Rom tangents). */
function smoothClosed(points: (readonly [number, number])[]): string {
  const n = points.length;
  if (n < 3) return "";
  const at = (i: number) => points[((i % n) + n) % n] ?? [C, C];
  let d = `M ${at(0)[0]} ${at(0)[1]}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = r2(p1[0] + (p2[0] - p0[0]) / 6);
    const c1y = r2(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = r2(p2[0] - (p3[0] - p1[0]) / 6);
    const c2y = r2(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return `${d} Z`;
}

const circlePath = (cx: number, cy: number, r: number) => {
  const rr = r2(Math.max(0, r));
  return `M ${r2(cx - rr)} ${r2(cy)} a ${rr} ${rr} 0 1 0 ${r2(2 * rr)} 0 a ${rr} ${rr} 0 1 0 ${r2(-2 * rr)} 0 Z`;
};

const DOTS = 28;
const DOT_PHASE = Array.from({ length: DOTS }, (_, i) =>
  r2(noise(0x5eed, i) * Math.PI * 2),
);

type OrbValues = {
  rest: MotionValue<number>;
  fast: MotionValue<number>;
  mid: MotionValue<number>;
  slow: MotionValue<number>;
  time: MotionValue<number>;
  arc: MotionValue<number>;
  arcOpacity: MotionValue<number>;
};

/**
 * The orb's three drawings. Every shape is rebuilt each frame from motion
 * values as plain path data, so nothing is blurred and nothing re-renders.
 */
function Orb({
  kind,
  gain,
  values,
  motionSafe,
}: {
  kind: VoiceOrb;
  gain: number;
  values: OrbValues;
  motionSafe: boolean;
}) {
  const { rest, fast, mid, slow, time, arc, arcOpacity } = values;
  const g = clamp01(gain);
  const live = motionSafe ? 1 : 0;

  const blob = useTransform(
    [rest, fast, mid, time] as MotionValue<number>[],
    ([r = 64, l1 = 0, l2 = 0, c = 0]: number[]) => {
      const amp = g * l1 * live;
      const swell = r * (1 + 0.16 * g * l2 * live);
      const pts: (readonly [number, number])[] = [];
      for (let i = 0; i < 48; i += 1) {
        const a = (i / 48) * Math.PI * 2;
        const wave =
          0.085 * Math.sin(3 * a + 1.7 * c) +
          0.06 * Math.sin(5 * a - 1.1 * c + 1.3) +
          0.035 * Math.sin(8 * a + 2.3 * c + 0.4);
        pts.push(pt(swell * (1 + amp * wave), a));
      }
      return smoothClosed(pts);
    },
  );

  const core = useTransform(
    [rest, fast] as MotionValue<number>[],
    ([r = 64, l = 0]: number[]) =>
      r2(r * (kind === "dots" ? 0.66 : 0.8) * (1 + 0.24 * g * l * live)),
  );
  const ringA = useTransform(
    [rest, mid] as MotionValue<number>[],
    ([r = 64, l = 0]: number[]) => r2(r * (0.98 + 0.3 * g * l * live)),
  );
  const ringB = useTransform(
    [rest, slow] as MotionValue<number>[],
    ([r = 64, l = 0]: number[]) => r2(r * (1.13 + 0.42 * g * l * live)),
  );
  const ringBOpacity = useTransform(slow, (l) => r2(0.22 + 0.45 * g * l));

  const dots = useTransform(
    [rest, fast, mid, time] as MotionValue<number>[],
    ([r = 64, l1 = 0, l2 = 0, c = 0]: number[]) => {
      let d = "";
      for (let i = 0; i < DOTS; i += 1) {
        const a = (i / DOTS) * Math.PI * 2 - Math.PI / 2;
        const ph = DOT_PHASE[i] ?? 0;
        const push =
          g * l2 * live * 0.36 * (0.55 + 0.45 * Math.sin(ph + c * 3.1));
        const dr =
          2.2 + 2.4 * g * l1 * live * (0.5 + 0.5 * Math.sin(ph * 1.7 + c * 4));
        const [x, y] = pt(r * (0.94 + push), a);
        d += circlePath(x, y, dr);
      }
      return d;
    },
  );

  const halo = useTransform(
    [rest, mid] as MotionValue<number>[],
    ([r = 64, l = 0]: number[]) => r2(r * (1.32 + 0.3 * g * l * live)),
  );
  // Under reduced motion the level still shows, as the halo's strength.
  const haloOpacity = useTransform(mid, (l) =>
    r2(motionSafe ? 0.5 + 0.5 * g * l : 0.25 + 0.75 * clamp01(l * 1.6)),
  );

  const arcPath = useTransform(
    [rest, arc] as MotionValue<number>[],
    ([r = 64, a = 0]: number[]) => {
      const rr = r + 16;
      const from = (a * Math.PI) / 180;
      const to = from + (70 * Math.PI) / 180;
      const [x1, y1] = pt(rr, from);
      const [x2, y2] = pt(rr, to);
      return `M ${x1} ${y1} A ${r2(rr)} ${r2(rr)} 0 0 1 ${x2} ${y2}`;
    },
  );

  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fill = `voice-fill-${uid}`;
  const glow = `voice-glow-${uid}`;

  return (
    <>
      <defs>
        <radialGradient id={fill} cx="0.38" cy="0.34" r="0.75">
          <stop
            offset="0"
            style={{
              stopColor: "color-mix(in oklab, currentColor 62%, white)",
            }}
          />
          <stop offset="0.55" style={{ stopColor: "currentColor" }} />
          <stop
            offset="1"
            style={{
              stopColor: "color-mix(in oklab, currentColor 78%, black)",
            }}
          />
        </radialGradient>
        <radialGradient id={glow}>
          <stop offset="0.45" stopColor="currentColor" stopOpacity="0.32" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.circle
        cx={C}
        cy={C}
        r={halo}
        fill={`url(#${glow})`}
        style={{ opacity: haloOpacity }}
      />
      {kind === "blob" ? (
        <motion.path d={blob} fill={`url(#${fill})`} />
      ) : kind === "rings" ? (
        <>
          <motion.circle
            cx={C}
            cy={C}
            r={ringB}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            style={{ opacity: ringBOpacity }}
          />
          <motion.circle
            cx={C}
            cy={C}
            r={ringA}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            opacity={0.6}
          />
          <motion.circle cx={C} cy={C} r={core} fill={`url(#${fill})`} />
        </>
      ) : (
        <>
          <motion.circle cx={C} cy={C} r={core} fill={`url(#${fill})`} />
          <motion.path d={dots} fill="currentColor" opacity={0.85} />
        </>
      )}
      <motion.path
        d={arcPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{ opacity: arcOpacity }}
      />
    </>
  );
}

/**
 * A voice call with an assistant. An orb breathes with whoever is talking:
 * one level, smoothed each frame with a fast attack and a slower release,
 * drives the shape, while the orb's resting size moves between listening,
 * thinking and speaking on snap and its pigment cross-fades. The level is
 * simulated from a seed (a syllable envelope per voice) unless `meter`
 * reads a real microphone.
 *
 * The conversation plays from `turns` at speaking pace: the caller's words
 * arrive in light ink and firm when the line settles, the surface thinks
 * for a seeded moment, then the reply is spoken word by word. Interrupt
 * halts the reply mid-word — the reveal is tracked to the character — and
 * the orb drops back to listening. Mute greys and stills the orb and holds
 * the caller's turn; End shrinks it away on glide and offers Call again.
 *
 * The call only runs while the surface is on screen and the page visible.
 * Lines are announced once each, never per word. Under reduced motion the
 * orb keeps its shape and shows the level as the strength of its halo;
 * words still arrive and Interrupt still cuts them, because the
 * conversation is information.
 */
export function VoiceMode({
  orb = "blob",
  captions = "transcript",
  level = 0.6,
  turns = defaultVoiceTurns,
  live,
  defaultLive = true,
  onLiveChange,
  muted,
  defaultMuted = false,
  onMutedChange,
  onInterrupt,
  onPhaseChange,
  meter,
  pace = 2.6,
  agent = "Coldbrook Assist",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: VoiceModeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const listId = `${uid}-lines`;

  const [ownLive, setOwnLive] = React.useState(defaultLive);
  const isLive = live ?? ownLive;
  const [ownMuted, setOwnMuted] = React.useState(defaultMuted);
  const isMuted = muted ?? ownMuted;

  const [step, setStep] = React.useState<Step>({
    turn: 0,
    words: 0,
    mode: "gap",
    run: 0,
  });
  const [cuts, setCuts] = React.useState<Record<string, string>>({});
  const [seconds, setSeconds] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // A call switched back on starts the conversation from the top.
  const [seenLive, setSeenLive] = React.useState(isLive);
  if (seenLive !== isLive) {
    setSeenLive(isLive);
    if (isLive) {
      setStep((s) => ({ turn: 0, words: 0, mode: "gap", run: s.run + 1 }));
      setCuts({});
      setSeconds(0);
    }
  }
  // Turns appended after the conversation ran out are picked up.
  if (step.mode === "idle" && step.turn < turns.length) {
    setStep({ ...step, mode: "gap" });
  }

  const current = turns[step.turn];
  const phase: VoicePhase =
    status === "connecting"
      ? "connecting"
      : !isLive
        ? "ended"
        : step.mode === "think"
          ? "thinking"
          : step.mode === "talk" && current?.role === "assistant"
            ? "speaking"
            : "listening";
  const look: VoicePhase | "muted" =
    isMuted && phase === "listening" ? "muted" : phase;

  /* ------------------------------ visibility ----------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [onScreen, setOnScreen] = React.useState(true);
  const [pageVisible, setPageVisible] = React.useState(true);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setOnScreen(entry.isIntersecting);
    });
    io.observe(root);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const running = onScreen && pageVisible && isLive && status === "ready";

  /* -------------------------------- engine ------------------------------- */

  const wordAt = React.useRef(0);
  const shownPhase = React.useRef<VoicePhase>(phase);
  const api = React.useRef<Api | null>(null);

  const report = (next: VoicePhase) => {
    if (shownPhase.current === next) return;
    shownPhase.current = next;
    onPhaseChange?.(next);
  };

  const phaseAt = (s: Step): VoicePhase => {
    const t = turns[s.turn];
    if (s.mode === "think") return "thinking";
    if (s.mode === "talk" && t?.role === "assistant") return "speaking";
    return "listening";
  };

  const after = (s: Step, turn: number): Step => {
    const next = turns[turn];
    return {
      turn,
      words: 0,
      mode: !next ? "idle" : next.role === "assistant" ? "think" : "gap",
      run: s.run,
    };
  };

  const advance = () => {
    const s = step;
    const t = turns[s.turn];
    let next: Step;
    if (!t) next = { ...s, mode: "idle", words: 0 };
    else if (s.mode === "gap") {
      next =
        t.role === "assistant"
          ? { ...s, mode: "think" }
          : { ...s, mode: "talk", words: 1 };
    } else if (s.mode === "think") next = { ...s, mode: "talk", words: 1 };
    else if (s.words < wordsOf(t.text).length) {
      next = { ...s, words: s.words + 1 };
    } else {
      // The line settles, and is announced once, whole.
      say(`${t.role === "user" ? "You" : agent}: ${t.text}`);
      next = after(s, s.turn + 1);
    }
    setStep(next);
    report(phaseAt(next));
  };

  React.useLayoutEffect(() => {
    api.current = { advance };
  });

  const turnKey = current
    ? `${current.id}:${current.role}:${current.text}`
    : "";

  // One timer at a time, re-armed on every step. A muted caller's turn
  // waits; so does a conversation that has run out of turns.
  React.useEffect(() => {
    if (!running) return;
    const t = turns[step.turn];
    let delay: number | null = null;
    if (step.mode === "gap") {
      delay =
        t?.role === "user" && isMuted ? null : step.turn === 0 ? 700 : 1100;
    } else if (step.mode === "think") {
      delay = 700 + (hash(t?.id ?? "") % 400);
    } else if (step.mode === "talk" && t) {
      if (t.role === "user" && isMuted) delay = null;
      else {
        const w = wordsOf(t.text)[step.words - 1] ?? "";
        const { said: ms, pause } = wordMs(w, pace);
        delay = ms + pause;
      }
    }
    wordAt.current = performance.now();
    if (delay === null) return;
    const id = window.setTimeout(() => api.current?.advance(), delay);
    return () => window.clearTimeout(id);
    // Keyed on what the current turn says, not on the array's identity, so a
    // host re-rendering the same turns never restarts a word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, step, turnKey, isMuted, pace]);

  // The call's clock, which also only runs while it is seen.
  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  /* ------------------------------- controls ------------------------------ */

  const canInterrupt =
    isLive &&
    status === "ready" &&
    current?.role === "assistant" &&
    (step.mode === "talk" || step.mode === "think");

  const interrupt = () => {
    if (disabled || !canInterrupt || !current) return;
    audio.play("blup", { pitch: 0.78, gain: 0.6 });
    let spoken = "";
    if (step.mode === "talk") {
      const words = wordsOf(current.text);
      const word = words[step.words - 1] ?? "";
      const { said: ms } = wordMs(word, pace);
      const into = performance.now() - wordAt.current;
      const head = words.slice(0, Math.max(0, step.words - 1));
      if (into < ms && word.length > 2) {
        const chars = Math.min(
          word.length - 1,
          Math.max(1, Math.round((word.length * into) / ms)),
        );
        spoken = [...head, word.slice(0, chars)].join(" ");
      } else {
        spoken = [...head, word].join(" ");
      }
    }
    setCuts((c) => ({ ...c, [current.id]: spoken }));
    const next = after(step, step.turn + 1);
    setStep(next);
    report(phaseAt(next));
    say(spoken ? `You interrupted ${agent}.` : `Reply cancelled.`);
    onInterrupt?.(current, spoken);
  };

  const toggleMute = () => {
    if (disabled || !isLive) return;
    const next = !isMuted;
    audio.play("click", { pitch: next ? 0.85 : 1.15, gain: 0.5 });
    if (muted === undefined) setOwnMuted(next);
    onMutedChange?.(next);
    say(next ? "Muted." : "Unmuted.");
  };

  const setCall = (next: boolean) => {
    if (disabled) return;
    audio.play("click", { pitch: next ? 1.2 : 0.7, gain: 0.55 });
    if (live === undefined) setOwnLive(next);
    onLiveChange?.(next);
    say(next ? `Calling ${agent}.` : `Call ended after ${clock(seconds)}.`);
    report(next ? "listening" : "ended");
  };

  /* --------------------------------- orb --------------------------------- */

  const rest = useMotionValue(REST[phase]);
  const fast = useMotionValue(0);
  const mid = useMotionValue(0);
  const slow = useMotionValue(0);
  const time = useMotionValue(0);
  const arc = useMotionValue(-90);
  const arcOpacity = useMotionValue(
    phase === "thinking" || phase === "connecting" ? 1 : 0,
  );
  const voice = React.useRef<Voice>({ source: "ambient", seed: 0 });

  React.useLayoutEffect(() => {
    voice.current = {
      source: isMuted
        ? "muted"
        : phase === "speaking"
          ? "assistant"
          : phase === "thinking" || phase === "connecting"
            ? "think"
            : step.mode === "talk" && current?.role === "user"
              ? "user"
              : "ambient",
      seed: hash(`${current?.id ?? ""}:${step.run}`),
    };
  });

  // The resting size moves on snap between states; ending shrinks on glide.
  React.useEffect(() => {
    const to =
      isMuted && phase === "listening" ? REST.listening - 6 : REST[phase];
    if (!motionSafe) {
      rest.set(to);
      return;
    }
    const c = animate(
      rest,
      to,
      phase === "ended" ? springs.glide : springs.snap,
    );
    return () => c.stop();
  }, [phase, isMuted, motionSafe, rest]);

  React.useEffect(() => {
    const on = phase === "thinking" || phase === "connecting";
    const c = animate(arcOpacity, on ? 1 : 0, {
      duration: durations.base,
      ease: on ? easings.enter : easings.exit,
    });
    return () => c.stop();
  }, [phase, arcOpacity]);

  // Ended or errored, the level drains away and the loop below stops.
  const looping =
    onScreen &&
    pageVisible &&
    status !== "error" &&
    (isLive || status === "connecting");
  React.useEffect(() => {
    if (looping) return;
    const cs = [fast, mid, slow].map((v) =>
      animate(v, 0, { duration: durations.slow, ease: easings.exit }),
    );
    return () => {
      for (const c of cs) c.stop();
    };
  }, [looping, fast, mid, slow]);

  // The orb's frame loop: it runs only while the call is on and seen.
  React.useEffect(() => {
    if (!looping) return;
    let raf = 0;
    let last = performance.now();
    let l1 = fast.get();
    let l2 = mid.get();
    let l3 = slow.get();
    const ease = (
      v: number,
      to: number,
      dt: number,
      up: number,
      down: number,
    ) => v + (to - v) * (1 - Math.exp(-dt / (to > v ? up : down)));
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = time.get() + dt;
      const v = voice.current;
      let target = 0.05 + 0.03 * Math.sin(c * 1.3);
      if (v.source === "muted") target = 0;
      else if (v.source === "think") target = 0.12 + 0.05 * Math.sin(c * 2.2);
      else if (v.source === "assistant" || v.source === "user") {
        const rate = v.source === "assistant" ? 4.6 : 4.1;
        const k = Math.floor(c * rate);
        const frac = c * rate - k;
        const strength = 0.35 + 0.65 * noise(v.seed, k);
        target =
          (v.source === "assistant" ? 0.95 : 0.8) *
          strength *
          Math.pow(Math.sin(Math.PI * frac), 0.8);
      }
      if (meter && (v.source === "user" || v.source === "ambient")) {
        target = clamp01(meter());
      }
      l1 = ease(l1, target, dt, 0.04, 0.12);
      l2 = ease(l2, target, dt, 0.12, 0.3);
      l3 = ease(l3, target, dt, 0.3, 0.7);
      time.set(Number(c.toFixed(4)));
      fast.set(Number(l1.toFixed(4)));
      mid.set(Number(l2.toFixed(4)));
      slow.set(Number(l3.toFixed(4)));
      if (motionSafe)
        arc.set(Number(((arc.get() + dt * 150) % 360).toFixed(2)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [looping, meter, motionSafe, fast, mid, slow, time, arc]);

  /* -------------------------------- lines -------------------------------- */

  const lines: Line[] = [];
  for (let i = 0; i < turns.length && i <= step.turn; i += 1) {
    const t = turns[i];
    if (!t) continue;
    if (i < step.turn) {
      const cut = cuts[t.id];
      lines.push({ turn: t, text: cut ?? t.text, live: false, cut });
    } else if (step.mode === "talk") {
      lines.push({
        turn: t,
        text: wordsOf(t.text).slice(0, step.words).join(" "),
        live: true,
      });
    }
  }
  const latest = lines[lines.length - 1];
  const waitingOnYou =
    isLive &&
    isMuted &&
    current?.role === "user" &&
    (step.mode === "gap" || step.mode === "talk");

  const listRef = React.useRef<HTMLOListElement | null>(null);
  const stuck = React.useRef(true);
  const reveal = `${lines.length}:${step.words}:${step.run}`;
  React.useEffect(() => {
    const list = listRef.current;
    if (list && stuck.current) list.scrollTop = list.scrollHeight;
  }, [reveal]);

  const name = (t: VoiceTurn) => (t.role === "user" ? "You" : agent);
  const gain = clamp01(level);
  const split = captions === "transcript";

  const chip: Record<VoicePhase | "muted", string> = {
    connecting: "Connecting",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    ended: "Ended",
    muted: "Muted",
  };
  const orbName =
    phase === "speaking"
      ? `${agent} is speaking`
      : phase === "thinking"
        ? `${agent} is thinking`
        : phase === "ended"
          ? "Call ended"
          : phase === "connecting"
            ? "Connecting"
            : isMuted
              ? "Muted"
              : "Listening";

  const lineText = (l: Line) => {
    if (l.cut === undefined) return l.text;
    if (!l.cut) return "";
    return /[.?!]$/.test(l.cut) ? l.cut : `${l.cut}—`;
  };

  const control = cn(
    "group/voice-mode flex w-16 flex-col items-center gap-1.5 rounded-3 text-[11px] text-ink-2 transition-opacity",
    "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
    FOCUS,
  );
  const disc =
    "flex size-14 items-center justify-center rounded-full border transition-colors";

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label ?? `Voice call with ${agent}`}
      className={cn(
        "@container flex h-[540px] w-full flex-col overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full transition-colors",
            isLive && status === "ready" ? "bg-success" : "bg-ink-3",
          )}
        />
        <span className="min-w-0 truncate text-[13px] font-medium">
          {agent}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {isLive ? clock(seconds) : `Call ended · ${clock(seconds)}`}
        </span>
        <span className="ml-auto inline-grid shrink-0">
          <AnimatePresence initial={false}>
            <motion.span
              key={look}
              className="col-start-1 row-start-1 inline-flex h-6 items-center gap-1.5 justify-self-end rounded-full border border-hairline px-2 text-[11px] text-ink-2"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast, ease: easings.enter },
              }}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: PIGMENT[look] }}
              />
              {chip[look]}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div
        className={cn(
          "grid flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden",
          split &&
            "@min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] @min-[40rem]:grid-rows-[minmax(0,1fr)_auto] @min-[60rem]:grid-cols-[minmax(0,1fr)_28rem]",
        )}
      >
        {/* The orb. */}
        <div
          className={cn(
            "flex items-center justify-center pt-3",
            split ? "@min-[40rem]:pt-0" : "row-span-1",
            captions === "off" && "row-span-2",
          )}
        >
          <svg
            role="img"
            aria-label={orbName}
            viewBox="0 0 240 240"
            className={cn(
              "block shrink-0 transition-[color] duration-500",
              captions === "off"
                ? "size-[220px] @min-[40rem]:size-[240px]"
                : "size-[168px] @min-[40rem]:size-[220px]",
            )}
            style={{ color: PIGMENT[look] }}
          >
            <Orb
              kind={orb}
              gain={gain}
              motionSafe={motionSafe}
              values={{ rest, fast, mid, slow, time, arc, arcOpacity }}
            />
          </svg>
        </div>

        {/* The words. */}
        {captions === "off" ? null : (
          <div
            className={cn(
              "relative overflow-hidden",
              split &&
                "@min-[40rem]:col-start-2 @min-[40rem]:row-span-2 @min-[40rem]:row-start-1 @min-[40rem]:border-l @min-[40rem]:border-hairline",
            )}
          >
            {status === "error" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <TriangleAlert aria-hidden className="size-5 text-danger" />
                <p className="text-[13px] text-foreground">
                  Can&apos;t reach the microphone.
                </p>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onRetry}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors enabled:hover:bg-surface-2",
                    FOCUS,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Retry
                </button>
              </div>
            ) : status === "connecting" ? (
              <p className="flex h-full items-center justify-center text-[13px] text-ink-3">
                Connecting…
              </p>
            ) : captions === "transcript" ? (
              <ol
                ref={listRef}
                id={listId}
                role="list"
                aria-label="Transcript"
                onScroll={(event) => {
                  const t = event.currentTarget;
                  stuck.current =
                    t.scrollHeight - t.scrollTop - t.clientHeight < 24;
                }}
                className="flex h-full [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_20px)] px-4 py-3"
              >
                <AnimatePresence initial={false}>
                  {lines.map((l, i) => {
                    const older = i < lines.length - 2;
                    const words = wordsOf(lineText(l));
                    return (
                      <motion.li
                        key={`${step.run}:${l.turn.id}`}
                        className="flex flex-col gap-0.5 @min-[60rem]:grid @min-[60rem]:grid-cols-[6.5rem_minmax(0,1fr)] @min-[60rem]:gap-3"
                        initial={{
                          opacity: 0,
                          y: motionSafe ? distances.step : 0,
                        }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          y: motionSafe ? springs.snap : { duration: 0 },
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                        }}
                      >
                        <span className="truncate text-[11px] text-ink-3 @min-[60rem]:pt-0.5">
                          {name(l.turn)}
                        </span>
                        {l.cut === "" ? (
                          <span className="text-[13px] text-ink-3 italic">
                            Reply cancelled
                          </span>
                        ) : (
                          <p
                            className={cn(
                              "text-[14px] leading-6 transition-colors duration-300",
                              l.live && l.turn.role === "user"
                                ? "text-ink-3"
                                : older
                                  ? "text-ink-2"
                                  : "text-foreground",
                            )}
                          >
                            {l.live
                              ? words.map((w, wi) => (
                                  <motion.span
                                    key={wi}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{
                                      duration: durations.blink,
                                      ease: easings.enter,
                                    }}
                                  >
                                    {wi ? " " : ""}
                                    {w}
                                  </motion.span>
                                ))
                              : lineText(l)}
                            {l.cut ? (
                              <span className="ml-2 inline-flex h-5 items-center rounded-full border border-hairline px-1.5 align-[1px] text-[10px] text-ink-3">
                                Interrupted
                              </span>
                            ) : null}
                          </p>
                        )}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
                {waitingOnYou ? (
                  <li className="text-[12px] text-warn">
                    You are muted. Unmute to answer.
                  </li>
                ) : null}
                {phase === "thinking" ? (
                  <li aria-hidden className="text-[12px] text-ink-3">
                    {agent} is thinking…
                  </li>
                ) : null}
              </ol>
            ) : (
              <div className="grid h-full grid-rows-[minmax(0,1fr)] px-5 pt-2 pb-3">
                <AnimatePresence initial={false}>
                  {latest ? (
                    <motion.div
                      key={`${step.run}:${latest.turn.id}`}
                      className="col-start-1 row-start-1 flex flex-col justify-end overflow-clip [mask-image:linear-gradient(to_bottom,transparent,black_28px)] text-center"
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.step : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        y: motionSafe ? -distances.step : 0,
                        transition: exitFor(durations.base),
                      }}
                      transition={{
                        y: motionSafe ? springs.glide : { duration: 0 },
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }}
                    >
                      <span className="text-[11px] text-ink-3">
                        {name(latest.turn)}
                      </span>
                      <p
                        className={cn(
                          "text-[17px] leading-7 transition-colors duration-300",
                          latest.live && latest.turn.role === "user"
                            ? "text-ink-3"
                            : latest.live
                              ? "text-foreground"
                              : "text-ink-2",
                        )}
                      >
                        {latest.cut === ""
                          ? "Reply cancelled"
                          : lineText(latest)}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {waitingOnYou ? (
                  <p className="col-start-1 row-start-1 self-start text-center text-[12px] text-warn">
                    You are muted. Unmute to answer.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* The controls. */}
        <div
          className={cn(
            "flex items-start justify-center gap-5 border-t border-hairline px-3 pt-3 pb-4",
            split &&
              "@min-[40rem]:border-t-0 @min-[40rem]:pt-0 @min-[40rem]:pb-6",
          )}
        >
          <button
            type="button"
            aria-pressed={isMuted}
            aria-label="Mute"
            disabled={disabled}
            inert={!isLive}
            onClick={toggleMute}
            className={cn(control, !isLive && "hidden")}
          >
            <span
              className={cn(
                disc,
                isMuted
                  ? "border-warn/40 bg-warn/10 text-warn"
                  : "border-hairline-strong bg-surface-2 text-foreground group-hover/voice-mode:border-ink-3",
              )}
            >
              <span aria-hidden className="relative inline-grid size-5">
                <Mic className="col-start-1 row-start-1 size-5" />
                <svg
                  viewBox="0 0 24 24"
                  className="col-start-1 row-start-1 size-5 overflow-visible"
                >
                  <motion.line
                    x1={3}
                    y1={3}
                    x2={21}
                    y2={21}
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    initial={false}
                    animate={{
                      pathLength: isMuted ? 1 : 0,
                      opacity: isMuted ? 1 : 0,
                    }}
                    transition={
                      motionSafe
                        ? {
                            pathLength: springs.flick,
                            opacity: { duration: durations.blink },
                          }
                        : { duration: 0 }
                    }
                  />
                </svg>
              </span>
            </span>
            <span aria-hidden>Mute</span>
          </button>

          <button
            type="button"
            aria-disabled={!canInterrupt || undefined}
            disabled={disabled}
            inert={!isLive}
            onClick={interrupt}
            className={cn(
              control,
              !isLive && "hidden",
              !canInterrupt && isLive && "opacity-45",
            )}
          >
            <span
              className={cn(
                disc,
                canInterrupt
                  ? "border-transparent bg-foreground text-background"
                  : "border-hairline-strong bg-surface-2 text-ink-2",
              )}
            >
              <Hand aria-hidden className="size-5" />
            </span>
            Interrupt
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => setCall(!isLive)}
            className={control}
          >
            <span
              className={cn(
                disc,
                isLive
                  ? "border-transparent bg-danger text-destructive-foreground"
                  : "border-transparent bg-success text-primary-foreground",
              )}
            >
              {isLive ? (
                <PhoneOff aria-hidden className="size-5" />
              ) : (
                <Phone aria-hidden className="size-5" />
              )}
            </span>
            <span className="inline-grid whitespace-nowrap">
              <span
                aria-hidden={!isLive}
                className={cn(
                  "col-start-1 row-start-1",
                  !isLive && "invisible",
                )}
              >
                End
              </span>
              <span
                aria-hidden={isLive}
                className={cn("col-start-1 row-start-1", isLive && "invisible")}
              >
                Call again
              </span>
            </span>
          </button>
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
