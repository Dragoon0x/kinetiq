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
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { semitones, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PatternLockGrid = 3 | 4 | "3" | "4";

/** `true` accepts, `false` refuses, nothing records the pattern neutrally. */
export type PatternLockVerdict = boolean | void;

export type PatternLockProps = {
  /** The pad's accessible name, e.g. "Unlock pattern". */
  label: string;
  /** Controlled pattern: dot numbers from 1 (reading order), in drawing order. */
  value?: number[];
  /** Initial pattern when uncontrolled. @default [] */
  defaultValue?: number[];
  /** Fires from the catch that added a dot, the key that removed one, and the clear. */
  onValueChange?: (pattern: number[]) => void;
  /**
   * Called when a pattern of at least `minLength` dots is finished (the finger
   * lifts, or Enter). Return `true` to accept it, `false` to refuse it, nothing
   * to record it — or a promise of one of those while the pad waits.
   */
  onComplete?: (
    pattern: number[],
  ) => PatternLockVerdict | Promise<PatternLockVerdict>;
  /** Fewer dots than this are refused before `onComplete` is asked. @default 4 */
  minLength?: number;
  /** Dots per side. @default "3" */
  grid?: PatternLockGrid;
  /** Draw the line and keep caught dots lit. Off, only a flash and the melody show each catch. @default true */
  path?: boolean;
  /** The line's weight in px, 2 to 10. @default 4 */
  line?: number;
  /** How long a wrong, short or recorded pattern stays before it fades, in ms. @default 800 */
  clearDelay?: number;
  /** The pad's side in px. @default 216 */
  size?: number;
  /** Play a rising note per dot, a chord on success and a buzz on a miss. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Phase =
  | "idle"
  | "drawing"
  | "checking"
  | "accepted"
  | "rejected"
  | "short"
  | "recorded";

type Point = { x: number; y: number };

/**
 * The melody: the major pentatonic from C4 upward, as semitones from C5 (the
 * register of the `note` voice). Every step climbs, so any pattern plays a
 * phrase that rises; sixteen steps end on C7, the voice's ceiling.
 */
const MELODY = [-12, -10, -8, -5, -3, 0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
/** Dots caught in one instant are heard as a run this far apart, in ms. */
const ARPEGGIO_MS = 45;
/** A head shaking no: big, then smaller, then still. */
const SHAKE = [0, -10, 9, -7, 5, -2, 0];
const SHAKE_SECONDS = 0.42;
/** How long one dot's ring takes to travel out, in seconds. */
const RIPPLE_SECONDS = 0.7;
/** The live end rubber-bands this far inside the pad's edge. */
const EDGE = 8;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const dotsWord = (n: number) => `${n} ${n === 1 ? "dot" : "dots"}`;

const JUDGED: readonly Phase[] = ["accepted", "rejected", "short", "recorded"];

/** Free dots lying exactly on the straight grid line from `a` to `b`. */
function between(a: number, b: number, n: number): number[] {
  const ar = Math.floor((a - 1) / n);
  const ac = (a - 1) % n;
  const dr = Math.floor((b - 1) / n) - ar;
  const dc = ((b - 1) % n) - ac;
  const g = gcd(Math.abs(dr), Math.abs(dc));
  const out: number[] = [];
  for (let k = 1; k < g; k += 1) {
    out.push((ar + (dr / g) * k) * n + ac + (dc / g) * k + 1);
  }
  return out;
}

/** Where along segment a→b the point c is closest (0–1), and how far it is. */
function closest(a: Point, b: Point, c: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t =
    len === 0 ? 0 : clamp01(((c.x - a.x) * dx + (c.y - a.y) * dy) / len);
  return { t, d: Math.hypot(a.x + dx * t - c.x, a.y + dy * t - c.y) };
}

/** Dot numbers grouped by distance from the pad's centre, nearest first. */
const RINGS: Record<3 | 4, number[][]> = {
  3: [[5], [2, 4, 6, 8], [1, 3, 7, 9]],
  4: [
    [6, 7, 10, 11],
    [2, 3, 5, 8, 9, 12, 14, 15],
    [1, 4, 13, 16],
  ],
};

const isThenable = (v: unknown): v is PromiseLike<PatternLockVerdict> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

/**
 * A pattern pad for unlocking, or for setting an unlock pattern. The finger
 * draws: the live end of the line is 1:1 under it, and every dot its path
 * crosses is caught — along with any free dot lying straight between the last
 * one and the new one, so a jump from corner to corner passes the middle. Each
 * catch pops the dot and plays the next note of a rising pentatonic phrase, so
 * the pattern is also a short melody that always climbs.
 *
 * Lifting the finger asks the host through `onComplete`. A refused (or too
 * short) pattern shakes like a head saying no, turns danger and fades after
 * `clearDelay`; an accepted one turns success and locks with a ripple that
 * runs along the path in the order it was drawn, with a chord. Nothing
 * returned records it neutrally, which is the first step of setting a pattern.
 *
 * Every dot is a real button: Arrow keys move between them, Space adds the
 * focused dot, number keys add a dot by number, Backspace takes the last one
 * back, Enter finishes exactly as a lift does and Escape clears. Under
 * reduced motion the line still follows the finger, but nothing pops, shakes
 * or travels: colours, rings, notes and verdicts carry the same news.
 */
export function PatternLock({
  label,
  value,
  defaultValue,
  onValueChange,
  onComplete,
  minLength = 4,
  grid = "3",
  path = true,
  line = 4,
  clearDelay = 800,
  size = 216,
  sound = false,
  disabled = false,
  className,
}: PatternLockProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();

  const n = Number(grid) === 4 ? 4 : 3;
  const total = n * n;
  const spacing = size / n;
  const hitRadius = spacing * 0.32;
  const dotRadius = r2(Math.max(3.5, spacing * 0.075));
  const ringRadius = r2(spacing * 0.27);
  const buttonSize = Math.round(Math.min(44, spacing - 8));
  const weight = Math.min(10, Math.max(2, line));
  const need = Math.max(1, Math.round(minLength));
  const centre = React.useCallback(
    (k: number): Point => ({
      x: r2((((k - 1) % n) + 0.5) * spacing),
      y: r2((Math.floor((k - 1) / n) + 0.5) * spacing),
    }),
    [n, spacing],
  );

  // What the pad holds, and what it is doing, are kept with the grid they
  // belong to: a pattern on a 4 × 4 pad means nothing on a 3 × 3 one, so a
  // grid change reads as empty without an effect having to clear it.
  const [own, setOwn] = React.useState(() => ({
    n,
    dots: defaultValue ?? [],
  }));
  const [phaseState, setPhaseState] = React.useState<{
    n: number;
    phase: Phase;
  }>({ n, phase: "idle" });
  const phase = phaseState.n === n ? phaseState.phase : "idle";
  const [focusIndex, setFocusIndex] = React.useState(0);
  const focused = Math.min(focusIndex, total - 1);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const raw = value ?? (own.n === n ? own.dots : []);
  const shown = raw.filter(
    (k, i) =>
      Number.isInteger(k) && k >= 1 && k <= total && raw.indexOf(k) === i,
  );
  const empty = shown.length === 0;

  const padRef = React.useRef<HTMLDivElement | null>(null);
  const buttons = React.useRef(new Map<number, HTMLButtonElement>());
  const draft = React.useRef<number[]>([]);
  const phaseRef = React.useRef<Phase>("idle");
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const pops = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const attempt = React.useRef(0);
  const lastPopAt = React.useRef(0);
  const lastPoint = React.useRef<Point>({ x: 0, y: 0 });
  const scaleToPad = React.useRef(1);
  const origin = React.useRef<Point>({ x: 0, y: 0 });

  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);
  const fromX = useMotionValue(0);
  const fromY = useMotionValue(0);
  const tailOn = useMotionValue(0);
  const shakeX = useMotionValue(0);
  const dim = useMotionValue(1);
  const ripple = useMotionValue(0);
  // One pulse per dot, made once for the largest pad: hooks cannot be called
  // per dot when the dot count is a prop that changes.
  const [pulses] = React.useState(() =>
    Array.from({ length: 16 }, () => motionValue(0)),
  );

  // Timers and the async verdict outlive the render that started them; they
  // read the host's current callbacks and the pad's current picture here.
  const latest = React.useRef({
    onValueChange,
    onComplete,
    shown,
    controlled: value !== undefined,
    disabled,
    n,
  });
  React.useEffect(() => {
    latest.current = {
      onValueChange,
      onComplete,
      shown,
      controlled: value !== undefined,
      disabled,
      n,
    };
  });

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  React.useEffect(
    () => () => {
      halt();
      // A verdict still on its way lands on nothing.
      attempt.current += 1;
      for (const c of pops.current) c.stop();
      pops.current = [];
    },
    [halt],
  );

  // A new grid is a new pad: nothing half-drawn or waiting carries over.
  React.useEffect(() => {
    halt();
    attempt.current += 1;
    draft.current = [];
    phaseRef.current = "idle";
    tailOn.set(0);
    shakeX.set(0);
    ripple.set(0);
    dim.set(1);
  }, [n, halt, tailOn, shakeX, ripple, dim]);

  // The fade leaves the pattern layer transparent; once the pad is empty it
  // can come back, with nothing lit to flash.
  React.useEffect(() => {
    if (empty) dim.set(1);
  }, [empty, dim]);

  const enter = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState({ n, phase: next });
  };

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const report = (next: number[]) => {
    draft.current = next;
    if (!latest.current.controlled) setOwn({ n: latest.current.n, dots: next });
    latest.current.onValueChange?.(next);
  };

  const panOf = (k: number) =>
    Number((((centre(k).x / size) * 2 - 1) * 0.6).toFixed(3));

  const pop = (k: number) => {
    const mv = pulses[k - 1];
    if (!mv) return;
    // A catch is a flick up and a snap back: one crisp overshoot, never a
    // wobble, because the next dot may already be on its way.
    const up = motionSafe
      ? { duration: 0.06, ease: easings.enter }
      : { duration: durations.blink, ease: easings.enter };
    const down = motionSafe
      ? springs.snap
      : { duration: durations.slow, ease: easings.exit };
    pops.current = pops.current.slice(-24);
    pops.current.push(
      animate(mv, 1, {
        ...up,
        onComplete: () => {
          pops.current.push(animate(mv, 0, down));
        },
      }),
    );
  };

  const startPattern = () => {
    halt();
    attempt.current += 1;
    shakeX.set(0);
    ripple.set(0);
    dim.set(1);
    tailOn.set(0);
    lastPopAt.current = 0;
    const had = latest.current.shown.length > 0 || draft.current.length > 0;
    draft.current = [];
    enter("drawing");
    if (had) report([]);
  };

  /** Adds `k` and any free dot straight between it and the last one. */
  const catchDot = (k: number): number[] => {
    const used = draft.current;
    if (used.includes(k)) return [];
    const last = used[used.length - 1];
    const run =
      last === undefined
        ? [k]
        : [...between(last, k, n).filter((m) => !used.includes(m)), k];
    const next = [...used, ...run];
    for (const m of run) {
      const step = next.indexOf(m);
      const now = performance.now();
      const at = Math.max(now, lastPopAt.current + ARPEGGIO_MS);
      lastPopAt.current = at;
      const fire = () => {
        pop(m);
        audio.play("note", {
          pitch: semitones(MELODY[step] ?? 24),
          gain: 0.5,
          pan: panOf(m),
        });
      };
      if (at - now < 4) fire();
      else timers.current.push(window.setTimeout(fire, Math.round(at - now)));
    }
    const c = centre(k);
    fromX.set(c.x);
    fromY.set(c.y);
    report(next);
    return run;
  };

  const catchAlong = (a: Point, b: Point) => {
    const hits: { k: number; t: number }[] = [];
    for (let k = 1; k <= total; k += 1) {
      if (draft.current.includes(k)) continue;
      const { t, d } = closest(a, b, centre(k));
      if (d <= hitRadius) hits.push({ k, t });
    }
    hits.sort((p, q) => p.t - q.t);
    let caught = 0;
    for (const hit of hits) caught += catchDot(hit.k).length;
    if (caught > 0) tailOn.set(1);
  };

  const fadeAndClear = () => {
    running.current.push(
      animate(dim, 0, {
        duration: durations.base,
        ease: easings.exit,
        onComplete: () => clearNow(),
      }),
    );
  };

  const clearNow = () => {
    tailOn.set(0);
    const had = latest.current.shown.length > 0 || draft.current.length > 0;
    draft.current = [];
    enter("idle");
    if (had) report([]);
  };

  const shake = () => {
    if (!motionSafe) return;
    running.current.push(
      animate(shakeX, SHAKE, { duration: SHAKE_SECONDS, ease: easings.move }),
    );
  };

  const refuse = (kind: "rejected" | "short") => {
    enter(kind);
    say(
      kind === "short"
        ? `Connect at least ${dotsWord(need)}. Try again.`
        : "Wrong pattern. Try again.",
    );
    // The buzz belongs to the first swing of the shake: same frame.
    audio.play("buzz", { gain: kind === "short" ? 0.35 : 0.5 });
    shake();
    // With no path on show, every dot blinks, so a refusal is still seen
    // without giving the pattern away.
    if (!path) for (let k = 1; k <= total; k += 1) pop(k);
    timers.current.push(
      window.setTimeout(fadeAndClear, Math.max(0, clearDelay)),
    );
  };

  const accept = (pattern: number[]) => {
    enter("accepted");
    say("Pattern accepted.");
    audio.play("chord", { gain: 0.55 });
    if (!motionSafe) {
      // No ring travels; with no path on show, every dot blinks success.
      if (!path) for (let k = 1; k <= total; k += 1) pop(k);
      return;
    }
    const steps = Math.max(1, path ? pattern.length : RINGS[n].length);
    const span = (steps - 1) * cascade(steps) + RIPPLE_SECONDS;
    ripple.set(0);
    running.current.push(
      animate(ripple, 1, { duration: span, ease: easings.linear }),
    );
  };

  const record = (pattern: number[]) => {
    enter("recorded");
    say(`Pattern recorded, ${dotsWord(pattern.length)}.`);
    timers.current.push(
      window.setTimeout(fadeAndClear, Math.max(0, clearDelay)),
    );
  };

  const judge = (verdict: PatternLockVerdict, pattern: number[]) => {
    if (verdict === true) accept(pattern);
    else if (verdict === false) refuse("rejected");
    else record(pattern);
  };

  const finish = () => {
    if (phaseRef.current !== "drawing") return;
    tailOn.set(0);
    const pattern = draft.current.slice();
    if (latest.current.disabled) {
      clearNow();
      return;
    }
    if (pattern.length === 0) {
      enter("idle");
      return;
    }
    if (pattern.length < need) {
      refuse("short");
      return;
    }
    const token = attempt.current;
    const verdict = latest.current.onComplete?.(pattern);
    if (!isThenable(verdict)) {
      judge(verdict, pattern);
      return;
    }
    enter("checking");
    const settle = (v: PatternLockVerdict) => {
      // A new press (or unmount) while the host was thinking wins.
      if (attempt.current !== token || phaseRef.current !== "checking") return;
      judge(v, pattern);
    };
    verdict.then(settle, () => settle(false));
  };

  const toPad = (clientX: number, clientY: number): Point => ({
    x: (clientX - origin.current.x) * scaleToPad.current,
    y: (clientY - origin.current.y) * scaleToPad.current,
  });

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, offset }) => {
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      scaleToPad.current = rect.width > 0 ? size / rect.width : 1;
      origin.current = { x: rect.left, y: rect.top };
      startPattern();
      // The drag reports only after a few px of travel; the path starts where
      // the finger went down, so a dot under the press is caught too.
      lastPoint.current = toPad(point.x - offset.x, point.y - offset.y);
    },
    onMove: ({ point }) => {
      if (phaseRef.current !== "drawing") return;
      const p = toPad(point.x, point.y);
      catchAlong(lastPoint.current, p);
      lastPoint.current = p;
      tipX.set(r2(rubberClamp(p.x, EDGE, size - EDGE, EDGE)));
      tipY.set(r2(rubberClamp(p.y, EDGE, size - EDGE, EDGE)));
    },
    onEnd: () => finish(),
    onCancel: () => {
      if (phaseRef.current !== "drawing") return;
      halt();
      clearNow();
    },
    onTap: () => {
      // A tap on a judged pad skips the wait.
      if (!JUDGED.includes(phaseRef.current)) return;
      halt();
      clearNow();
    },
  });

  const focusDot = (index: number) => {
    const i = Math.min(total - 1, Math.max(0, index));
    setFocusIndex(i);
    buttons.current.get(i + 1)?.focus();
  };

  const keyAdd = (k: number) => {
    if (disabled || phaseRef.current === "checking") return;
    if (phaseRef.current !== "drawing") startPattern();
    if (draft.current.includes(k)) {
      say(`Dot ${k} is already in the pattern.`);
      return;
    }
    const run = catchDot(k);
    // A jump over a free dot takes it too; say so, or the count is a riddle.
    const named =
      run.length > 1
        ? `Dots ${run.slice(0, -1).join(", ")} and ${k}`
        : `Dot ${k}`;
    say(`${named}. ${dotsWord(draft.current.length)}.`);
  };

  const removeLast = () => {
    if (phaseRef.current !== "drawing" || draft.current.length === 0) return;
    const next = draft.current.slice(0, -1);
    const gone = draft.current[draft.current.length - 1];
    const last = next[next.length - 1];
    if (last !== undefined) {
      const c = centre(last);
      fromX.set(c.x);
      fromY.set(c.y);
    }
    report(next);
    say(`Removed dot ${gone}. ${dotsWord(next.length)}.`);
  };

  const onDotKeyDown = (event: React.KeyboardEvent, k: number) => {
    const i = k - 1;
    const row = Math.floor(i / n);
    const col = i % n;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        if (col < n - 1) focusDot(i + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (col > 0) focusDot(i - 1);
        return;
      case "ArrowDown":
        event.preventDefault();
        if (row < n - 1) focusDot(i + n);
        return;
      case "ArrowUp":
        event.preventDefault();
        if (row > 0) focusDot(i - n);
        return;
      case "Home":
        event.preventDefault();
        focusDot(0);
        return;
      case "End":
        event.preventDefault();
        focusDot(total - 1);
        return;
      case "Backspace":
      case "Delete":
        event.preventDefault();
        removeLast();
        return;
      case "Enter":
        // Enter is the lift: it finishes the pattern rather than clicking
        // the focused dot.
        event.preventDefault();
        if (event.repeat) return;
        if (phaseRef.current === "drawing") finish();
        else if (!disabled && phaseRef.current === "idle") {
          say("No dots yet. Space adds the focused dot.");
        }
        return;
      case "Escape":
        if (phaseRef.current === "idle" && latest.current.shown.length === 0) {
          return;
        }
        event.preventDefault();
        halt();
        clearNow();
        say("Pattern cleared.");
        return;
    }
    if (/^[1-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey) {
      const d = Number(event.key);
      if (d > total) return;
      event.preventDefault();
      if (event.repeat) return;
      keyAdd(d);
      focusDot(d - 1);
    }
  };

  // Ripple order: along the path as it was drawn, or — with no path on show —
  // from the centre of the pad outward, so success reveals nothing.
  const orderOf = new Map<number, number>();
  if (phase === "accepted") {
    if (path) shown.forEach((k, i) => orderOf.set(k, i));
    else RINGS[n].forEach((ring, i) => ring.forEach((k) => orderOf.set(k, i)));
  }
  const rippleSteps = Math.max(1, path ? shown.length : RINGS[n].length);
  const stagger = cascade(rippleSteps);
  const rippleSpan = (rippleSteps - 1) * stagger + RIPPLE_SECONDS;

  const stepOf = new Map(shown.map((k, i) => [k, i] as const));
  const tone =
    phase === "accepted"
      ? "text-success"
      : phase === "rejected" || phase === "short"
        ? "text-danger"
        : "text-cobalt-bright";
  const committed = shown
    .map((k, i) => {
      const c = centre(k);
      return `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`;
    })
    .join(" ");

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-clip rounded-4 border border-hairline bg-surface-2",
        disabled && "opacity-50",
        className,
      )}
      style={{ width: size + 2, height: size + 2 }}
    >
      <div
        ref={padRef}
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        aria-busy={phase === "checking" || undefined}
        aria-disabled={disabled || undefined}
        {...drag}
        className={cn(
          "absolute inset-0 touch-none select-none [-webkit-touch-callout:none]",
          disabled ? "cursor-not-allowed" : "cursor-crosshair",
        )}
      >
        <motion.div className="absolute inset-0" style={{ x: shakeX }}>
          <svg
            aria-hidden
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={cn("absolute inset-0 block transition-colors", tone)}
          >
            {path ? (
              <motion.g
                style={{ opacity: dim }}
                className={phase === "checking" ? "animate-pulse" : undefined}
              >
                <g opacity={0.55}>
                  {shown.length > 1 ? (
                    <path
                      d={committed}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={weight}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  <motion.line
                    x1={fromX}
                    y1={fromY}
                    x2={tipX}
                    y2={tipY}
                    stroke="currentColor"
                    strokeWidth={weight}
                    strokeLinecap="round"
                    style={{ opacity: tailOn }}
                  />
                </g>
              </motion.g>
            ) : null}
            {Array.from({ length: total }, (_, i) => {
              const k = i + 1;
              const c = centre(k);
              const order = orderOf.get(k);
              return (
                <Dot
                  key={k}
                  cx={c.x}
                  cy={c.y}
                  dotRadius={dotRadius}
                  ringRadius={ringRadius}
                  rippleRadius={r2(spacing * 0.5)}
                  lit={path && stepOf.has(k)}
                  strong={phase === "accepted"}
                  flash={!path}
                  pulse={pulses[i] ?? ripple}
                  ripple={ripple}
                  rippleAt={order === undefined ? -1 : order * stagger}
                  rippleSpan={rippleSpan}
                  dim={dim}
                  motionSafe={motionSafe}
                />
              );
            })}
          </svg>
          {Array.from({ length: total }, (_, i) => {
            const k = i + 1;
            const c = centre(k);
            const step = stepOf.get(k);
            return (
              <button
                key={k}
                ref={(node) => {
                  if (node) buttons.current.set(k, node);
                  else buttons.current.delete(k);
                }}
                type="button"
                tabIndex={i === focused ? 0 : -1}
                disabled={disabled}
                aria-label={
                  step === undefined
                    ? `Dot ${k}`
                    : `Dot ${k}, step ${step + 1} of the pattern`
                }
                onFocus={() => setFocusIndex(i)}
                onKeyDown={(event) => onDotKeyDown(event, k)}
                onClick={(event) => {
                  // Pointer presses belong to the drawing. A click with no
                  // pointer behind it — Space, assistive technology — adds
                  // the dot, pop and note included.
                  if (event.detail === 0) keyAdd(k);
                }}
                className="absolute cursor-[inherit] rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                style={{
                  width: buttonSize,
                  height: buttonSize,
                  left: r2(c.x - buttonSize / 2),
                  top: r2(c.y - buttonSize / 2),
                }}
              />
            );
          })}
        </motion.div>
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys move between dots. Space adds the focused dot; number keys 1
        to 9 add a dot by number. Backspace removes the last dot, Enter
        finishes, Escape clears.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

function Dot({
  cx,
  cy,
  dotRadius,
  ringRadius,
  rippleRadius,
  lit,
  strong,
  flash,
  pulse,
  ripple,
  rippleAt,
  rippleSpan,
  dim,
  motionSafe,
}: {
  cx: number;
  cy: number;
  dotRadius: number;
  ringRadius: number;
  rippleRadius: number;
  lit: boolean;
  /** Accepted: the halo fills in, which is the lock under reduced motion. */
  strong: boolean;
  flash: boolean;
  pulse: MotionValue<number>;
  ripple: MotionValue<number>;
  /** When this dot's ring leaves, in seconds into the ripple; -1: it does not. */
  rippleAt: number;
  rippleSpan: number;
  dim: MotionValue<number>;
  motionSafe: boolean;
}) {
  // One ripple value drives every dot; each reads its own slice of it.
  const local = useTransform(ripple, (p) =>
    rippleAt < 0 ? 0 : clamp01((p * rippleSpan - rippleAt) / RIPPLE_SECONDS),
  );
  const ringOut = useTransform(local, (t) =>
    r2(ringRadius + (rippleRadius - ringRadius) * easeOut(t)),
  );
  const ringOpacity = useTransform(local, (t) =>
    t <= 0 || t >= 1 ? 0 : r2(0.7 * (1 - t)),
  );
  const scale = useTransform(
    [pulse, local] as MotionValue<number>[],
    ([p, t]) =>
      motionSafe
        ? r2(1 + 0.5 * (p as number) + 0.35 * Math.sin(Math.PI * (t as number)))
        : 1,
  );
  const flashOpacity = useTransform(pulse, (p) => r2(clamp01(p) * 0.8));
  const halo = useTransform(dim, (d) => (lit ? r2(d) : 0));

  return (
    <g>
      <motion.circle
        cx={cx}
        cy={cy}
        r={ringRadius}
        fill="currentColor"
        fillOpacity={strong ? 0.24 : 0.12}
        stroke="currentColor"
        strokeOpacity={0.45}
        strokeWidth={1.5}
        style={{ opacity: halo }}
      />
      {flash ? (
        <motion.circle
          cx={cx}
          cy={cy}
          r={ringRadius}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          style={{ opacity: flashOpacity }}
        />
      ) : null}
      <motion.circle
        cx={cx}
        cy={cy}
        r={ringOut}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        style={{ opacity: ringOpacity }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={dotRadius}
        className={cn("transition-colors", lit ? "fill-current" : "fill-ink-3")}
        style={{ scale, originX: 0.5, originY: 0.5 }}
      />
    </g>
  );
}
