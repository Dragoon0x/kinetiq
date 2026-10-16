"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import { Check, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type EaseCheckTrackStyle = "string" | "cord" | "beads";
export type EaseCheckTone = "accent" | "score" | "ink";

export type EaseCheckProps = {
  /** The question, asked right after the task. @default "How easy was that export?" */
  question?: string;
  /** The finished task this asks about. Each task is asked once: answered or dismissed, it never returns. @default "waylight-export-q3" */
  taskId?: string;
  /** Points on the scale, 3 to 10: ticks, labels and keyboard steps. @default 7 */
  stepCount?: number;
  /** One label per point, hardest first. @default generated from the end labels */
  labels?: string[];
  /** The hard end's label. @default "Very hard" */
  minLabel?: string;
  /** The easy end's label. @default "Very easy" */
  maxLabel?: string;
  /** Scores at or below this open the why field. @default ⌊(stepCount − 1) / 2⌋ */
  lowThreshold?: number;
  /** Controlled score, 1 to `stepCount`, or null before an answer. */
  value?: number | null;
  /** Initial score when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the release, tap or key that chose a score. */
  onValueChange?: (value: number) => void;
  /** An answer was sent: on release, a tap, Enter or Send. */
  onAnswer?: (score: number, taskId: string) => void;
  /** The why field was sent, with the score it explains. */
  onComment?: (text: string, score: number, taskId: string) => void;
  /** The question was dismissed without an answer. */
  onDismiss?: (taskId: string) => void;
  /** What the slider is made of: a fine string that rings fast, a thick cord that sways slowly, or beads on a thread, one per point. @default "string" */
  trackStyle?: EaseCheckTrackStyle;
  /** The filled run and thumb: cobalt; a colour that warms from red at the hard end to green at the easy end; or ink. @default "accent" */
  tone?: EaseCheckTone;
  /** How taut the string is, 0 to 1: tighter rings faster and settles sooner. @default 0.5 */
  tension?: number;
  /** The why field's prompt. @default "What got in the way?" */
  whyPrompt?: string;
  /** How long the thanks shows before the question folds away, ms. @default 1800 */
  thanksMs?: number;
  /** Also remember asked tasks in localStorage, across visits. @default false */
  persist?: boolean;
  /** The slider and buttons do nothing. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                         Tasks that were asked once                       */
/* ----------------------------------------------------------------------- */

const STORE_KEY = "kinetiq-ease-check";
const asked = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getVersion = () => version;
const getServerVersion = () => 0;

/** A task, once answered or dismissed, is never asked again on this page. */
function remember(taskId: string, persist: boolean) {
  asked.add(taskId);
  version += 1;
  if (persist) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify([...asked]));
    } catch {
      // Storage can be blocked; the page still remembers.
    }
  }
  for (const fn of listeners) fn();
}

function recall() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return;
    let added = false;
    for (const id of list) {
      if (typeof id === "string" && !asked.has(id)) {
        asked.add(id);
        added = true;
      }
    }
    if (added) {
      version += 1;
      for (const fn of listeners) fn();
    }
  } catch {
    // Nothing stored, or storage blocked.
  }
}

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Peg inset, string rest line and the SVG's height, px. */
const PEG = 10;
const REST = 18;
const SVG_H = 44;
/** The give before the string resists, px; rubber-banding takes it to ~12. */
const BEND = 6;
/** The press that rests the finger on the string. */
const SAG = 2.5;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const LABELS: Record<number, string[]> = {
  3: ["Hard", "Neither", "Easy"],
  5: ["Very hard", "Hard", "Neither", "Easy", "Very easy"],
  7: [
    "Very hard",
    "Hard",
    "Fairly hard",
    "Neither",
    "Fairly easy",
    "Easy",
    "Very easy",
  ],
};

function labelsFor(count: number, minLabel: string, maxLabel: string) {
  const preset = LABELS[count];
  if (preset && minLabel === "Very hard" && maxLabel === "Very easy") {
    return preset;
  }
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? minLabel : i === count - 1 ? maxLabel : `${i + 1} of ${count}`,
  );
}

/**
 * The string's spring: the house landing spring's character, tuned by what
 * the track is made of. A fine string is stiff and lightly damped, so it
 * rings quickly through straight; a cord is slack and damped, so it sways;
 * beads sit between. `tension` scales the stiffness.
 */
function pluckSpring(style: EaseCheckTrackStyle, tension: number) {
  const t = clamp(tension, 0, 1);
  const base = springs.recoil.stiffness;
  const k =
    style === "string"
      ? base * lerp(1.1, 2.6, t)
      : style === "cord"
        ? base * lerp(0.35, 0.8, t)
        : base * lerp(0.7, 1.5, t);
  const ratio = style === "string" ? 0.26 : style === "cord" ? 0.5 : 0.38;
  return {
    type: "spring" as const,
    stiffness: Math.round(k),
    damping: r2(2 * ratio * Math.sqrt(k)),
    mass: 1,
  };
}

/* ----------------------------------------------------------------------- */
/*                               The component                              */
/* ----------------------------------------------------------------------- */

/** `ringing`: answered, the string still sounding before the thanks. */
type Phase = "ask" | "ringing" | "why" | "thanks" | "gone";

/**
 * A one-row question for right after a task. The effort slider is a string
 * between two pegs: pressing it rests the finger on the string, dragging
 * moves the thumb 1:1 along it while dragging up or down bends the string
 * under the thumb — two straight runs from the pegs with a rounded apex,
 * rubber-banded — and letting go settles the thumb on its step on
 * `springs.snap` and plucks the string, which rings through straight on a
 * spring with the house landing's character, its stiffness set by
 * `trackStyle` and `tension`, carrying the release velocity.
 *
 * A release, a tap or Enter sends the answer. Low scores open a short why
 * field; any other answer says thanks and folds the question away. A task is
 * asked once. It is a real `role="slider"`: arrows step (each step plucks
 * the string lightly), Page keys move two, Home and End jump. Under reduced
 * motion the string stays straight and the thumb moves at once; the value,
 * the fill and the why field still change.
 */
export function EaseCheck({
  question = "How easy was that export?",
  taskId = "waylight-export-q3",
  stepCount = 7,
  labels,
  minLabel = "Very hard",
  maxLabel = "Very easy",
  lowThreshold,
  value,
  defaultValue = null,
  onValueChange,
  onAnswer,
  onComment,
  onDismiss,
  trackStyle = "string",
  tone = "accent",
  tension = 0.5,
  whyPrompt = "What got in the way?",
  thanksMs = 1800,
  persist = false,
  disabled = false,
  className,
}: EaseCheckProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const questionId = `${uid}-q`;
  const hintId = `${uid}-hint`;
  const whyId = `${uid}-why`;
  const count = clamp(Math.round(stepCount), 3, 10);
  const names =
    labels && labels.length === count
      ? labels
      : labelsFor(count, minLabel, maxLabel);
  const low = clamp(
    Math.round(lowThreshold ?? Math.floor((count - 1) / 2)),
    0,
    count,
  );

  /* -------------------------------- state -------------------------------- */

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const score =
    (value === undefined ? own : value) === null
      ? null
      : clamp(Math.round((value === undefined ? own : value) ?? 1), 1, count);
  const [phase, setPhase] = React.useState<Phase>("ask");
  const [ownedTask, setOwnedTask] = React.useState<string | null>(null);
  const [live, setLive] = React.useState<number | null>(null);
  const [pressed, setPressed] = React.useState(false);
  const [keyed, setKeyed] = React.useState(false);
  const [why, setWhy] = React.useState("");
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // A new task asks again; the same task never does.
  const [seenTask, setSeenTask] = React.useState(taskId);
  if (seenTask !== taskId) {
    setSeenTask(taskId);
    setPhase("ask");
    setOwnedTask(null);
    setKeyed(false);
    setWhy("");
    if (value === undefined) setOwn(defaultValue);
  }

  const storeVersion = React.useSyncExternalStore(
    subscribe,
    getVersion,
    getServerVersion,
  );
  // Asked elsewhere (or on an earlier visit) and not by this instance: say
  // nothing at all. Read through the store's version so the server and the
  // hydrating render agree.
  const blocked = storeVersion > 0 && asked.has(taskId) && ownedTask !== taskId;

  React.useEffect(() => {
    if (persist) recall();
  }, [persist]);

  /* ------------------------------ geometry ------------------------------- */

  const [width, setWidth] = React.useState(0);
  const [track, setTrack] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!track) return;
    const measure = () => setWidth(Math.round(track.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [track]);

  const left = PEG;
  const right = Math.max(PEG + 1, width - PEG);
  const stepX = (s: number) =>
    r2(left + ((s - 1) / Math.max(1, count - 1)) * (right - left));
  const nearest = (x: number) =>
    clamp(
      Math.round(((x - left) / Math.max(1, right - left)) * (count - 1)) + 1,
      1,
      count,
    );
  const middle = Math.ceil(count / 2);

  const tx = useMotionValue(0);
  const bend = useMotionValue(0);
  const radius = useMotionValue(7);
  const d = useMotionValue("");
  const fillW = useMotionValue(0);
  const ty = useMotionValue(REST);
  const beadsOn = useMotionValue("");
  const beadsOff = useMotionValue("");
  const labelX = useMotionValue(0);
  const labelShift = useMotionValue("-50%");
  const geo = React.useRef({ left, right, count, width });
  React.useEffect(() => {
    geo.current = { left, right, count, width };
  });

  /**
   * The string, rebuilt from the thumb and the bend: straight from each peg
   * to a rounded apex under the thumb — a plucked string's shape. Read from
   * the latest geometry on every change rather than closed over, so a resize
   * or a StrictMode rehearsal never leaves it drawing a stale width.
   */
  const draw = React.useCallback(() => {
    const g = geo.current;
    if (!g.width) return;
    const L = g.left;
    const R = g.right;
    const x = clamp(tx.get(), L - 24, R + 24);
    const xc = clamp(x, L + 0.5, R - 0.5);
    const b = bend.get();
    const r = Math.max(0, Math.min(9, (xc - L) / 2, (R - xc) / 2));
    const yl = REST + b * ((xc - r - L) / Math.max(0.5, xc - L));
    const yr = REST + b * ((R - xc - r) / Math.max(0.5, R - xc));
    const apex = REST + b;
    d.set(
      `M ${L} ${REST} L ${r2(xc - r)} ${r2(yl)} Q ${r2(xc)} ${r2(apex)} ${r2(xc + r)} ${r2(yr)} L ${R} ${REST}`,
    );
    ty.set(r2(0.25 * yl + 0.5 * apex + 0.25 * yr));
    fillW.set(r2(Math.max(0, x)));
    const at = (X: number) =>
      X <= xc
        ? REST + b * ((X - L) / Math.max(0.5, xc - L))
        : REST + b * ((R - X) / Math.max(0.5, R - xc));
    let on = "";
    let off = "";
    for (let i = 0; i < g.count; i += 1) {
      const X = r2(L + (i / Math.max(1, g.count - 1)) * (R - L));
      const Y = r2(at(X));
      const dot = `M ${r2(X - 3)} ${Y} a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0 `;
      if (X <= x + 0.5) on += dot;
      else off += dot;
    }
    beadsOn.set(on);
    beadsOff.set(off);
    const f = clamp((x - L) / Math.max(1, R - L), 0, 1);
    labelX.set(r2(clamp(x, L, R)));
    labelShift.set(`-${Math.round(f * 100)}%`);
  }, [tx, bend, d, ty, fillW, beadsOn, beadsOff, labelX, labelShift]);

  React.useEffect(() => {
    const offs = [tx.on("change", draw), bend.on("change", draw)];
    return () => {
      for (const off of offs) off();
    };
  }, [tx, bend, draw]);

  // The thumb sits on its step whenever the width or the score changes
  // without a gesture: first measure, a resize, a host-set value.
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const halt = () => {
    for (const c of running.current) c.stop();
    running.current = [];
  };
  const dragging = React.useRef(false);
  const placed = React.useRef<{
    width: number;
    count: number;
    score: number | null;
  } | null>(null);
  React.useEffect(() => {
    if (!width || dragging.current) return;
    const s = score ?? Math.ceil(count / 2);
    const target = r2(
      PEG + ((s - 1) / Math.max(1, count - 1)) * (width - 2 * PEG),
    );
    const prev = placed.current;
    placed.current = { width, count, score };
    if (!prev || prev.width !== width || prev.count !== count || !motionSafe) {
      tx.jump(target);
      draw();
      return;
    }
    if (prev.score !== score) {
      const c = animate(tx, target, springs.snap);
      return () => c.stop();
    }
  }, [width, score, count, motionSafe, tx, draw]);

  React.useEffect(() => () => halt(), []);

  /* ------------------------------- actions ------------------------------- */

  const pluck = (velocity: number, from?: number) => {
    if (!motionSafe) {
      bend.jump(0);
      return;
    }
    if (from !== undefined) bend.jump(from);
    running.current.push(
      animate(bend, 0, { ...pluckSpring(trackStyle, tension), velocity }),
    );
  };

  const choose = (next: number, viaKey: boolean) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    if (viaKey) setKeyed(true);
  };

  const finish = (s: number) => {
    remember(taskId, persist);
    setOwnedTask(taskId);
    setKeyed(false);
    onAnswer?.(s, taskId);
    if (s <= low) {
      setPhase("why");
      say(`Answered ${s} of ${count}, ${names[s - 1] ?? ""}. ${whyPrompt}`);
    } else {
      // The row stays a beat so the string can be seen ringing out.
      setPhase("ringing");
      say(`Thanks. Answered ${s} of ${count}, ${names[s - 1] ?? ""}.`);
    }
  };

  /** The answer, from a release or a tap: the thumb settles, the string rings. */
  const release = (x: number, vx: number, vy: number, from?: number) => {
    const s = nearest(project(x, vx, 0.99));
    halt();
    // This gesture moves the thumb itself, with the throw's velocity; the
    // placement effect must not restart it without one.
    placed.current = { width, count, score: s };
    if (motionSafe) {
      running.current.push(
        animate(tx, stepX(s), { ...springs.snap, velocity: vx }),
      );
    } else {
      tx.jump(stepX(s));
    }
    pluck(vy, from);
    radius.set(7);
    setLive(null);
    choose(s, false);
    finish(s);
  };

  const press = (on: boolean) => {
    setPressed(on);
    if (!motionSafe) return;
    running.current.push(animate(radius, on ? 8.5 : 7, springs.flick));
    // Down rests the finger on the string. Up leaves the bend alone: the
    // release that follows plucks it.
    if (on) running.current.push(animate(bend, SAG, springs.flick));
  };

  const xOf = (clientX: number) => {
    const rect = track?.getBoundingClientRect();
    return rect ? clientX - rect.left : left;
  };

  const drag = useDrag({
    threshold: 3,
    disabled: disabled || phase === "thanks" || phase === "ringing",
    onStart: () => {
      dragging.current = true;
      halt();
    },
    onMove: ({ point, offset }) => {
      const x = rubberClamp(xOf(point.x), left, right, 24);
      tx.set(r2(x));
      if (motionSafe) {
        bend.set(r2(rubberClamp(offset.y * 0.6 + SAG, -BEND, BEND, 7)));
      }
      const s = nearest(x);
      if (s !== live) setLive(s);
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      setPressed(false);
      release(tx.get(), velocity.x, velocity.y * 0.6);
    },
    onCancel: () => {
      dragging.current = false;
      setPressed(false);
      setLive(null);
      halt();
      const c = animate(tx, stepX(score ?? middle), springs.snap);
      running.current.push(c);
      pluck(0);
      radius.set(7);
    },
    onTap: (event) => {
      setPressed(false);
      // A tap plucks: the thumb goes to the step under the finger and the
      // string springs up from the press.
      release(xOf(event.clientX), 0, -120, SAG);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || phase === "ringing" || phase === "thanks") return;
    const from = score ?? middle;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = from + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = from - 1;
    else if (event.key === "PageUp") next = from + 2;
    else if (event.key === "PageDown") next = from - 2;
    else if (event.key === "Home") next = 1;
    else if (event.key === "End") next = count;
    else if (event.key === "Enter") {
      event.preventDefault();
      finish(from);
      if (score === null) choose(from, false);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    // With no answer yet the ghost thumb waits in the middle; keys start
    // from there.
    const s = clamp(next, 1, count);
    if (s === score) return;
    choose(s, true);
    halt();
    pluck(s > from ? -70 : 70);
    if (phase === "why" && s > low) setPhase("ask");
  };

  const dismiss = () => {
    remember(taskId, persist);
    setOwnedTask(taskId);
    setPhase("gone");
    onDismiss?.(taskId);
    say("Dismissed. This will not be asked again for this task.");
  };

  const sendWhy = () => {
    const text = why.trim();
    if (text && score !== null) onComment?.(text, score, taskId);
    setPhase("thanks");
    say(text ? "Thanks, your note was sent." : "Thanks.");
  };

  React.useEffect(() => {
    if (phase !== "ringing") return;
    const t = window.setTimeout(
      () => setPhase("thanks"),
      motionSafe ? 650 : 250,
    );
    return () => window.clearTimeout(t);
  }, [phase, motionSafe]);

  // Thanks stays a moment, then the question folds away.
  React.useEffect(() => {
    if (phase !== "thanks") return;
    const t = window.setTimeout(() => setPhase("gone"), Math.max(0, thanksMs));
    return () => window.clearTimeout(t);
  }, [phase, thanksMs]);

  /* ------------------------------- render -------------------------------- */

  const fraction = score === null ? 0.5 : (score - 1) / Math.max(1, count - 1);
  const ink =
    tone === "ink"
      ? "var(--foreground)"
      : tone === "score"
        ? fraction < 0.5
          ? `color-mix(in oklch, var(--danger) ${Math.round((1 - fraction * 2) * 100)}%, var(--warn))`
          : `color-mix(in oklch, var(--warn) ${Math.round((2 - fraction * 2) * 100)}%, var(--success))`
        : "var(--accent-bright)";
  const shownStep = live ?? score;
  const shownLabel =
    shownStep === null ? "" : `${shownStep} · ${names[shownStep - 1] ?? ""}`;
  const thick = trackStyle === "cord" ? 4 : trackStyle === "beads" ? 1 : 1.5;
  const answered = score !== null || pressed || live !== null;
  const gone = phase === "gone" || blocked;

  // The whole question is one measured box: the why field opens on glide,
  // and the fold-away closes it to nothing.
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const [innerH, setInnerH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!inner) return;
    const ro = new ResizeObserver(() => setInnerH(inner.offsetHeight));
    ro.observe(inner);
    return () => ro.disconnect();
  }, [inner]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const claimWhy = (node: HTMLInputElement | null) => {
    if (node && phase === "why" && !node.dataset.claimed) {
      node.dataset.claimed = "1";
      node.focus({ preventScroll: true });
    }
  };

  const slider = (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-labelledby={questionId}
      aria-describedby={hintId}
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={score ?? middle}
      aria-valuetext={
        score === null
          ? "Not answered yet"
          : `${score} of ${count}, ${(names[score - 1] ?? "").toLowerCase()}`
      }
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-2 @min-[48rem]/ease-check:max-w-[22.5rem]",
        FOCUS_RING,
      )}
    >
      <div className="relative h-4">
        <motion.span
          aria-hidden
          className="absolute top-0 left-0 font-mono text-[10px] leading-4 whitespace-nowrap text-ink-2 tabular-nums"
          style={{ x: labelX }}
          initial={false}
          animate={{ opacity: shownLabel && phase !== "thanks" ? 1 : 0 }}
          transition={{ duration: durations.fast }}
        >
          <motion.span className="inline-block" style={{ x: labelShift }}>
            {shownLabel || " "}
          </motion.span>
        </motion.span>
      </div>
      <div
        ref={setTrack}
        {...drag}
        onPointerDown={(event) => {
          if (disabled || phase === "thanks" || phase === "ringing") return;
          drag.onPointerDown(event);
          press(true);
        }}
        onPointerUp={(event) => {
          drag.onPointerUp(event);
          if (pressed) press(false);
        }}
        onPointerCancel={(event) => {
          drag.onPointerCancel(event);
          if (pressed) {
            press(false);
            pluck(0);
          }
        }}
        className={cn(
          "relative touch-none select-none",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
        style={{ height: SVG_H }}
      >
        {width === 0 ? (
          // Before the first measure (and on the server): the string at rest,
          // drawn in HTML so it needs no width to be right.
          <span aria-hidden className="absolute inset-0">
            <span
              className="absolute h-px bg-hairline-strong"
              style={{ left: PEG, right: PEG, top: REST }}
            />
            <span
              className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline-strong bg-card"
              style={{ left: `${r2(fraction * 100)}%`, top: REST }}
            />
          </span>
        ) : (
          <svg
            aria-hidden
            width={width}
            height={SVG_H}
            viewBox={`0 0 ${width} ${SVG_H}`}
            className="absolute inset-0 block overflow-visible"
          >
            <defs>
              <clipPath id={`${uid}-run`}>
                <motion.rect x={0} y={-20} height={SVG_H + 40} width={fillW} />
              </clipPath>
            </defs>
            {Array.from({ length: count }, (_, i) => {
              const x = stepX(i + 1);
              const big = i === 0 || i === count - 1;
              return trackStyle === "beads" ? null : (
                <line
                  key={i}
                  x1={x}
                  x2={x}
                  y1={REST + 16}
                  y2={REST + (big ? 22 : 20)}
                  strokeWidth={1}
                  className="stroke-hairline-strong"
                />
              );
            })}
            <circle cx={left} cy={REST} r={2} className="fill-ink-3" />
            <circle cx={right} cy={REST} r={2} className="fill-ink-3" />
            <motion.path
              d={d}
              fill="none"
              strokeWidth={thick}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-hairline-strong"
            />
            {/* The tone shows before an answer too: the run waits in it at
                half strength and the ghost thumb's ring wears it. */}
            <g style={{ color: ink }}>
              {trackStyle === "beads" ? (
                <>
                  <motion.path d={beadsOn} fill="currentColor" />
                  <motion.path
                    d={beadsOff}
                    strokeWidth={1.25}
                    className="fill-card stroke-hairline-strong"
                  />
                </>
              ) : (
                <motion.path
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={thick}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  clipPath={`url(#${uid}-run)`}
                  opacity={answered ? 1 : 0.4}
                />
              )}
              <motion.circle
                cx={tx}
                cy={ty}
                r={radius}
                strokeWidth={answered ? 0 : 1.5}
                stroke={answered ? undefined : "currentColor"}
                className={answered ? "" : "fill-card"}
                fill={answered ? "currentColor" : undefined}
              />
              <motion.circle
                cx={tx}
                cy={ty}
                r={2.25}
                className={answered ? "fill-card" : "fill-current"}
              />
            </g>
          </svg>
        )}
      </div>
      {keyed && phase === "ask" ? (
        // After a key the answer waits for Enter; the line under the string
        // says so, where it costs no width at 316px.
        <p
          aria-hidden
          className="pt-1 text-center font-mono text-[10px] leading-3 text-cobalt-bright"
        >
          Enter to send
        </p>
      ) : (
        <div
          aria-hidden
          className="hidden justify-between px-0.5 pt-1 text-[10px] leading-3 text-ink-3 @min-[30rem]/ease-check:flex"
        >
          <span>{names[0]}</span>
          <span>{names[count - 1]}</span>
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={cn("@container/ease-check w-full outline-none", className)}
    >
      <motion.div
        initial={false}
        animate={{
          height: gone ? 0 : (innerH ?? "auto"),
          opacity: gone ? 0 : 1,
        }}
        transition={
          motionSafe
            ? { height: springs.glide, opacity: { duration: durations.fast } }
            : { duration: 0 }
        }
        onAnimationComplete={() => {
          if (gone && rootRef.current?.contains(document.activeElement)) {
            rootRef.current.focus({ preventScroll: true });
          }
        }}
        className="overflow-clip"
        style={{ overflowClipMargin: 4 }}
        aria-hidden={gone || undefined}
        inert={gone}
      >
        <div
          ref={setInner}
          role="group"
          aria-labelledby={questionId}
          className="rounded-3 border border-hairline bg-card px-3 py-2.5"
        >
          <div className="grid items-center">
            <div
              className={cn(
                "flex items-center gap-3 transition-opacity duration-200 [grid-area:1/1] @min-[34rem]/ease-check:gap-5",
                phase === "thanks" ? "invisible opacity-0" : "opacity-100",
              )}
            >
              <p
                id={questionId}
                className="w-[6.5rem] shrink-0 text-[12.5px] leading-[1.3] font-medium text-foreground @min-[30rem]/ease-check:w-auto @min-[30rem]/ease-check:max-w-[13rem]"
              >
                {question}
              </p>
              {slider}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Dismiss the question"
                  onClick={dismiss}
                  disabled={disabled}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
            </div>
            <div
              aria-hidden={phase !== "thanks" || undefined}
              className={cn(
                "flex items-center justify-center gap-2 text-[13px] text-foreground transition-opacity duration-200 [grid-area:1/1]",
                phase === "thanks" ? "opacity-100" : "invisible opacity-0",
              )}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success">
                <Check aria-hidden className="size-3.5" />
              </span>
              Thanks — that helps.
            </div>
          </div>

          <AnimatePresence initial={false}>
            {phase === "why" ? (
              <motion.form
                key="why"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendWhy();
                }}
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        y: springs.glide,
                        opacity: { duration: durations.base },
                      }
                    : { duration: durations.fast }
                }
                className="mt-2.5 flex items-center gap-1.5 border-t border-hairline pt-2.5 @min-[30rem]/ease-check:gap-2"
              >
                <label htmlFor={whyId} className="sr-only">
                  {whyPrompt}
                </label>
                <input
                  ref={claimWhy}
                  id={whyId}
                  value={why}
                  placeholder={whyPrompt}
                  disabled={disabled}
                  onChange={(event) => {
                    const text = event.currentTarget.value;
                    setWhy(text);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setPhase("thanks");
                      say("Thanks.");
                    }
                  }}
                  className={cn(
                    "h-8 min-w-0 flex-1 rounded-2 border border-hairline-strong bg-surface-0 px-2.5 text-[13px] text-foreground placeholder:text-ink-3",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPhase("thanks");
                      say("Thanks.");
                    }}
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    Skip
                  </button>
                  <button
                    type="submit"
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 bg-primary px-3 text-[12px] font-medium text-primary-foreground",
                      FOCUS_RING,
                    )}
                  >
                    Send
                  </button>
                </div>
              </motion.form>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <p id={hintId} className="sr-only">
        Arrow keys choose, Page Up and Page Down move two, Home and End jump to
        the ends, Enter sends.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
