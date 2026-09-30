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
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GuessLinePoint = {
  /** Short and unique, e.g. "Sep". Read aloud and printed on the axis. */
  label: string;
  value: number;
};

export type GuessLineSeries = {
  /** The chart's name, e.g. "Ferry riders". */
  title: string;
  /** A few words after the title, e.g. "thousands a month". */
  caption?: string;
  /** Appended to every value, e.g. "k" or "%". */
  unit?: string;
  /** Decimal places for values. @default fitted to the keyboard step */
  decimals?: number;
  /** How many of the latest points are hidden. @default a third */
  hide?: number;
  /** One keyboard step. @default a round number near a fortieth of the range */
  step?: number;
  points: GuessLinePoint[];
};

/** One guess per hidden point, oldest first; `null` where none is drawn yet. */
export type GuessLineGuess = (number | null)[];

export type GuessLineResult = {
  /** 0 to 100: how close the guess was. */
  score: number;
  guess: number[];
  truth: number[];
};

export type GuessLineProps = {
  /** The charts on offer, by key. */
  series: Record<string, GuessLineSeries>;
  /** Which of `series` is shown. Switching clears the guess. @default the first key */
  dataset?: string;
  /** Controlled guess. */
  value?: GuessLineGuess;
  /** Initial guess when uncontrolled. @default [] */
  defaultValue?: GuessLineGuess;
  /** Fires from the move, tap or key that changed the guess, and from the reset. */
  onValueChange?: (guess: GuessLineGuess) => void;
  /** Fires when the real line has finished drawing in. */
  onReveal?: (result: GuessLineResult) => void;
  /** 0 to 1: how much the pen is steadied and the guess rounded into a curve. @default 0.5 */
  smoothing?: number;
  /** How long the real line takes to draw in, in ms. @default 1200 */
  reveal?: number;
  /** Show and say the score. Off, the gap still shades, without a number. @default true */
  score?: boolean;
  /** The plot's height in px. @default 160 */
  height?: number;
  /** Play the pencil and the reveal sweep. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Stage = "hidden" | "sweeping" | "landed";

/** The plot is drawn in a 1000-unit-wide box stretched to any width. */
const VIEW_W = 1000;
const X0 = 10;
const X1 = VIEW_W;
/** Room above and below the extremes, in px (the y axis is never scaled). */
const PAD_Y = 14;

const NONE: GuessLineGuess = [];

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A round number near `x`: 1, 2 or 5 times a power of ten. */
function nice(x: number): number {
  if (!(x > 0)) return 1;
  const e = Math.floor(Math.log10(x));
  const f = x / 10 ** e;
  const n = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return Number((n * 10 ** e).toPrecision(6));
}

const decimalsOf = (step: number) =>
  Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));

type V = { x: number; y: number };

/**
 * A curve through the points: Catmull-Rom turned into cubic Béziers, with
 * `tension` scaling the handles — 0 is a plain polyline.
 */
function curve(points: V[], tension: number): string {
  const first = points[0];
  if (!first) return "";
  let d = `M ${r2(first.x)} ${r2(first.y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (!p1 || !p2) continue;
    if (tension <= 0) {
      d += ` L ${r2(p2.x)} ${r2(p2.y)}`;
      continue;
    }
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const k = tension / 6;
    d += ` C ${r2(p1.x + (p2.x - p0.x) * k)} ${r2(p1.y + (p2.y - p0.y) * k)} ${r2(
      p2.x - (p3.x - p1.x) * k,
    )} ${r2(p2.y - (p3.y - p1.y) * k)} ${r2(p2.x)} ${r2(p2.y)}`;
  }
  return d;
}

const line = (points: V[]) => curve(points, 0);

/** Fills every gap before the last guessed point on a straight line, so the guess is one piece. */
function filled(guess: GuessLineGuess, anchor: number): GuessLineGuess {
  const out = guess.slice();
  let prevIndex = -1;
  let prevValue = anchor;
  for (let j = 0; j < out.length; j += 1) {
    const v = out[j];
    if (v === null || v === undefined) continue;
    for (let m = prevIndex + 1; m < j; m += 1) {
      const t = (m - prevIndex) / (j - prevIndex);
      out[m] = prevValue + (v - prevValue) * t;
    }
    prevIndex = j;
    prevValue = v;
  }
  return out;
}

const sameGuess = (a: GuessLineGuess, b: GuessLineGuess) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * A line chart whose latest stretch is hidden. The visible line ends at an
 * anchor; the reader draws what they think comes next across the shaded
 * band — the pen is steadied by `smoothing`, and the drawn line bends
 * through it 1:1 between the data points — and letting go with every point
 * guessed reveals the truth. The real line continues from the anchor under a
 * clip whose edge sweeps across the band (never a dash trick), the gap
 * between guess and truth shades as the edge passes, and when it lands a
 * score rolls up on `springs.recoil`. A hum follows the real line under the
 * sweep: higher values sound higher.
 *
 * Every hidden point is also a real slider on the plot, so the whole guess
 * can be made from the keyboard: Up and Down set it, Left and Right move
 * between points (carrying the last guess on, like the pen), Enter reveals and
 * Escape clears. Under reduced motion the pen still draws, and the truth and
 * the gap fade in with the score beside them instead of sweeping and rolling.
 */
export function GuessLine({
  series,
  dataset,
  value,
  defaultValue,
  onValueChange,
  onReveal,
  smoothing = 0.5,
  reveal = 1200,
  score: showScore = true,
  height = 160,
  sound = false,
  disabled = false,
  className,
}: GuessLineProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const clipId = `guess-line-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const titleId = `${clipId}-title`;
  const descId = `${clipId}-desc`;

  const keys = Object.keys(series);
  const key = dataset !== undefined && series[dataset] ? dataset : keys[0];
  const data = key === undefined ? undefined : series[key];
  const points = data?.points ?? [];
  const n = points.length;
  const hide = Math.min(
    Math.max(1, Math.round(data?.hide ?? Math.ceil(n / 3))),
    Math.max(1, n - 2),
  );
  const h0 = n - hide;
  const H = Math.max(80, height);
  const values = points.map((p) => p.value);
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 1;
  const range = Math.max(dataMax - dataMin, Math.abs(dataMax) * 0.1, 1e-6);
  let lo = dataMin - range * 0.3;
  const hi = dataMax + range * 0.3;
  if (dataMin >= 0 && lo < 0) lo = 0;
  const step = data?.step ?? nice((hi - lo) / 40);
  const decimals = data?.decimals ?? decimalsOf(step);
  const unit = data?.unit ?? "";
  const fmt = (v: number) => `${v.toFixed(decimals)}${unit}`;
  const tickStep = nice((hi - lo) / 3);
  const tickDecimals = decimalsOf(tickStep);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi; t += tickStep) {
    ticks.push(Number(t.toFixed(tickDecimals)));
  }

  const xOf = (i: number) => r2(X0 + (n > 1 ? i / (n - 1) : 0) * (X1 - X0));
  const yOf = (v: number) =>
    r2(PAD_Y + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD_Y));
  const valueAt = (y: number) =>
    lo + (1 - (y - PAD_Y) / (H - 2 * PAD_Y)) * (hi - lo);
  const tidy = (v: number) =>
    Number(Math.min(hi, Math.max(lo, v)).toFixed(Math.max(decimals, 2)));
  const anchor = points[h0 - 1];
  const anchorValue = anchor?.value ?? 0;
  const xA = xOf(h0 - 1);
  const truth = values.slice(h0);
  const tension = clamp01(smoothing);

  // The guess, and whether it has been revealed, belong to the chart they
  // were made on: a new dataset reads as a fresh chart without an effect.
  const [own, setOwn] = React.useState(() => ({
    key,
    guess: defaultValue ?? [],
  }));
  const [stageState, setStageState] = React.useState<{
    key: string | undefined;
    stage: Stage;
  }>({ key, stage: "hidden" });
  const [focusIndex, setFocusIndex] = React.useState(0);
  const focused = Math.min(focusIndex, hide - 1);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [result, setResult] = React.useState<GuessLineResult | null>(null);
  // Set once when a stroke starts and once when it ends, never per move.
  const [inking, setInking] = React.useState(false);

  const rawGuess = value ?? (own.key === key ? own.guess : NONE);
  const guess = React.useMemo<GuessLineGuess>(
    () =>
      Array.from({ length: hide }, (_, j) => {
        const v = rawGuess[j];
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      }),
    [rawGuess, hide],
  );
  // Bumped by every settled change, so a controlled host that refuses one
  // still brings the drawn line back to what it says.
  const [revision, setRevision] = React.useState(0);
  const complete = guess.every((v) => v !== null);
  const guessed = guess.filter((v) => v !== null).length;
  const stage =
    stageState.key === key && complete ? stageState.stage : "hidden";

  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const handles = React.useRef(new Map<string, HTMLDivElement>());
  const draft = React.useRef<GuessLineGuess>(guess);
  const drawing = React.useRef(false);
  const pen = React.useRef({ x: 0, value: 0, time: 0, clientX: 0 });
  const box = React.useRef({ left: 0, top: 0, width: 1, height: 1 });
  const reported = React.useRef<GuessLineGuess>(guess);
  const scratch = React.useRef<LoopHandle | null>(null);
  const hum = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef<number | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);

  const live = useMotionValue<GuessLineGuess>(guess);
  const penX = useMotionValue(0);
  const penY = useMotionValue(0);
  const penOn = useMotionValue(0);
  const sweep = useMotionValue(0);
  const revealOpacity = useMotionValue(1);
  const shownScore = useMotionValue(0);

  const latest = React.useRef({
    onValueChange,
    onReveal,
    controlled: value !== undefined,
    key,
    guess,
  });
  React.useEffect(() => {
    latest.current = {
      onValueChange,
      onReveal,
      controlled: value !== undefined,
      key,
      guess,
    };
  });

  const stopLoops = React.useCallback(() => {
    scratch.current?.stop();
    scratch.current = null;
    hum.current?.stop();
    hum.current = null;
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = null;
  }, []);

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    stopLoops();
  }, [stopLoops]);

  React.useEffect(() => halt, [halt]);

  // A new chart: nothing half-drawn or sweeping carries over.
  React.useEffect(() => {
    halt();
    drawing.current = false;
    penOn.set(0);
    sweep.set(0);
    revealOpacity.set(1);
  }, [key, halt, penOn, sweep, revealOpacity]);

  // The drawing keeps the live guess itself; at rest it mirrors what the
  // host (or the chart's own state) says.
  React.useEffect(() => {
    if (drawing.current) return;
    draft.current = guess;
    reported.current = guess;
    live.set(guess);
  }, [guess, revision, live]);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /** The guess is settled: state (when uncontrolled), the live value, the host. */
  const commit = (next: GuessLineGuess) => {
    draft.current = next;
    live.set(next);
    if (latest.current.controlled) setRevision((r) => r + 1);
    else setOwn({ key: latest.current.key, guess: next });
    if (!sameGuess(next, reported.current)) {
      reported.current = next;
      latest.current.onValueChange?.(next);
    }
  };

  /** While drawing: the live value moves, and the host hears real changes. */
  const nudge = (next: GuessLineGuess) => {
    draft.current = next;
    live.set(next);
    const before = reported.current;
    const moved =
      next.length !== before.length ||
      next.some((v, j) => {
        const b = before[j];
        if (v === null || b === null || b === undefined) return v !== b;
        return Math.abs(v - b) >= step / 2;
      });
    if (!moved) return;
    reported.current = next;
    latest.current.onValueChange?.(next);
  };

  const hideTruth = () => {
    halt();
    sweep.set(0);
    revealOpacity.set(1);
    setResult(null);
    setStageState({ key, stage: "hidden" });
  };

  /**
   * A controlled host answers in the render after the stroke. If it did not
   * take the finished guess, there is nothing to reveal: stand down before a
   * second frame of sweep (or any callback) happens.
   */
  const refused = (res: GuessLineResult) => {
    if (!latest.current.controlled) return false;
    if (sameGuess(latest.current.guess, res.guess)) return false;
    halt();
    hideTruth();
    return true;
  };

  const land = (res: GuessLineResult) => {
    if (refused(res)) return;
    setStageState({ key, stage: "landed" });
    setResult(res);
    if (motionSafe && showScore) {
      shownScore.set(0);
      running.current.push(
        animate(shownScore, res.score, {
          duration: durations.slow,
          ease: easings.enter,
        }),
      );
    } else {
      shownScore.set(res.score);
    }
    const lastLabel = points[n - 1]?.label ?? "The last point";
    const lastTruth = res.truth[res.truth.length - 1] ?? 0;
    const lastGuess = res.guess[res.guess.length - 1] ?? 0;
    say(
      `Revealed.${showScore ? ` ${res.score}% close.` : ""} ${lastLabel} was ${fmt(
        lastTruth,
      )}; you guessed ${fmt(lastGuess)}.`,
    );
    latest.current.onReveal?.(res);
  };

  const pitchOf = (v: number) => r2(1.4 + 2.2 * clamp01((v - lo) / (hi - lo)));

  const truthAtX = (x: number) => {
    const at = ((x - X0) / (X1 - X0)) * (n - 1);
    const i = Math.min(n - 2, Math.max(0, Math.floor(at)));
    const a = values[i] ?? 0;
    const b = values[i + 1] ?? a;
    return a + (b - a) * clamp01(at - i);
  };

  const startReveal = (next: GuessLineGuess) => {
    if (!next.every((v) => v !== null)) return;
    halt();
    const g = next as number[];
    const mae =
      g.reduce((s, v, j) => s + Math.abs(v - (truth[j] ?? v)), 0) /
      Math.max(1, g.length);
    const res: GuessLineResult = {
      // Against the room the reader had to draw in: 100 is exact, 0 the
      // furthest a guess on this chart could possibly be.
      score: Math.round(100 * clamp01(1 - mae / (hi - lo))),
      guess: g,
      truth,
    };
    setResult(null);
    setStageState({ key, stage: "sweeping" });
    // The sweep is heard from its first frame: a swish, then the real line
    // itself as a pitch that follows it.
    audio.play("swish", { gain: 0.45 });
    if (!motionSafe) {
      sweep.set(1);
      revealOpacity.set(0);
      running.current.push(
        animate(revealOpacity, 1, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: () => land(res),
        }),
      );
      return;
    }
    sweep.set(0);
    revealOpacity.set(1);
    hum.current = audio.start("hum", {
      gain: 0.55,
      pitch: pitchOf(anchorValue),
      pan: -0.4,
    });
    running.current.push(
      animate(sweep, 1, {
        duration: Math.max(0.2, reveal / 1000),
        ease: easings.move,
        onUpdate: (s) => {
          if (refused(res)) return;
          const x = xA + s * (X1 - xA);
          hum.current?.set({
            pitch: pitchOf(truthAtX(x)),
            pan: r2((x / VIEW_W) * 1.2 - 0.6),
          });
        },
        onComplete: () => {
          hum.current?.stop();
          hum.current = null;
          land(res);
        },
      }),
    );
  };

  const reset = (announce: boolean) => {
    hideTruth();
    commit(Array.from({ length: hide }, () => null));
    if (announce) say("Guess cleared.");
  };

  const toView = (clientX: number, clientY: number) => ({
    x: ((clientX - box.current.left) / box.current.width) * VIEW_W,
    y: ((clientY - box.current.top) / box.current.height) * H,
  });

  const columnOf = (x: number) =>
    Math.round(((x - X0) / (X1 - X0)) * (n - 1)) - h0;

  /** The pen moved from one place to another: every column it passed takes its value. */
  const drawTo = (x: number, v: number) => {
    const p = pen.current;
    const next = draft.current.slice();
    const a = Math.max(0, Math.min(hide - 1, columnOf(Math.max(xA, p.x))));
    const b = Math.max(0, Math.min(hide - 1, columnOf(Math.max(xA, x))));
    if (Math.max(p.x, x) > xA) {
      for (let j = Math.min(a, b); j <= Math.max(a, b); j += 1) {
        const xj = xOf(h0 + j);
        const t = x === p.x ? 1 : clamp01((xj - p.x) / (x - p.x));
        next[j] = tidy(p.value + (v - p.value) * t);
      }
    }
    p.x = x;
    p.value = v;
    nudge(filled(next, anchorValue));
  };

  const finishStroke = () => {
    const next = draft.current;
    commit(next);
    const left = next.filter((v) => v === null).length;
    if (left === 0) startReveal(next);
    else say(`${left} ${left === 1 ? "point" : "points"} left to guess.`);
  };

  const drag = useDrag({
    threshold: 2,
    disabled,
    onStart: ({ point, offset, event }) => {
      const el = fieldRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      box.current = {
        left: rect.left,
        top: rect.top,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      };
      if (stage !== "hidden") {
        hideTruth();
        draft.current = Array.from({ length: hide }, () => null);
      } else {
        halt();
      }
      drawing.current = true;
      setInking(true);
      const start = toView(point.x - offset.x, point.y - offset.y);
      const v = Math.min(hi, Math.max(lo, valueAt(start.y)));
      pen.current = {
        x: start.x,
        value: v,
        time: event.timeStamp,
        clientX: point.x - offset.x,
      };
      penOn.set(1);
      scratch.current = audio.start("scratch", {
        gain: 0,
        pitch: 1,
        pan: panFrom(point.x, el),
      });
    },
    onMove: ({ point, event }) => {
      if (!drawing.current) return;
      const at = toView(point.x, point.y);
      const raw = Math.min(hi, Math.max(lo, valueAt(at.y)));
      // The pen is steadied: it follows a nervous hand on a short lag.
      const keep = 1 - 0.85 * tension;
      const v = pen.current.value + (raw - pen.current.value) * keep;
      const dt = Math.max(1, event.timeStamp - pen.current.time);
      const speed = (Math.abs(point.x - pen.current.clientX) / dt) * 1000;
      pen.current.time = event.timeStamp;
      pen.current.clientX = point.x;
      drawTo(at.x, v);
      penX.set(r2(rubberClamp(at.x, 0, VIEW_W, 16)));
      penY.set(r2(rubberClamp(yOf(v), PAD_Y / 2, H - PAD_Y / 2, 6)));
      scratch.current?.set({
        gain: r2(Math.min(0.55, speed / 1500)),
        pitch: r2(0.75 + Math.min(1, speed / 1600) * 0.8),
        pan: panFrom(point.x, fieldRef.current),
      });
      if (hush.current !== null) window.clearTimeout(hush.current);
      hush.current = window.setTimeout(
        () => scratch.current?.set({ gain: 0 }),
        70,
      );
    },
    onEnd: () => {
      setInking(false);
      if (!drawing.current) return;
      drawing.current = false;
      stopLoops();
      penOn.set(0);
      finishStroke();
    },
    onCancel: () => {
      setInking(false);
      if (!drawing.current) return;
      drawing.current = false;
      stopLoops();
      penOn.set(0);
      commit(draft.current);
    },
    onTap: (event) => {
      const el = fieldRef.current;
      if (!el || disabled) return;
      const rect = el.getBoundingClientRect();
      box.current = {
        left: rect.left,
        top: rect.top,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      };
      if (stage !== "hidden") {
        hideTruth();
        draft.current = Array.from({ length: hide }, () => null);
      }
      const at = toView(event.clientX, event.clientY);
      const j = Math.max(0, Math.min(hide - 1, columnOf(Math.max(xA, at.x))));
      const next = draft.current.slice();
      next[j] = tidy(valueAt(at.y));
      draft.current = filled(next, anchorValue);
      finishStroke();
    },
  });

  const focusHandle = (j: number) => {
    const i = Math.min(hide - 1, Math.max(0, j));
    setFocusIndex(i);
    const point = points[h0 + i];
    if (point) handles.current.get(point.label)?.focus();
  };

  const onHandleKeyDown = (event: React.KeyboardEvent, j: number) => {
    if (disabled) return;
    const base = (index: number) => {
      const mine = draft.current[index];
      if (mine !== null && mine !== undefined) return mine;
      for (let m = index - 1; m >= 0; m -= 1) {
        const v = draft.current[m];
        if (v !== null && v !== undefined) return v;
      }
      return anchorValue;
    };
    const set = (index: number, v: number) => {
      if (stage !== "hidden") {
        hideTruth();
        draft.current = Array.from({ length: hide }, () => null);
      }
      const next = draft.current.slice();
      next[index] = tidy(v);
      commit(filled(next, anchorValue));
      const x = xOf(h0 + index);
      audio.play("tick", {
        pitch: r2(0.8 + 0.8 * clamp01((v - lo) / (hi - lo))),
        gain: 0.4,
        pan: r2((x / VIEW_W) * 1.2 - 0.6),
      });
    };
    const bump = (by: number) => set(j, base(j) + by);
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        bump(step);
        return;
      case "ArrowDown":
        event.preventDefault();
        bump(-step);
        return;
      case "PageUp":
        event.preventDefault();
        bump(step * 5);
        return;
      case "PageDown":
        event.preventDefault();
        bump(-step * 5);
        return;
      case "ArrowRight": {
        event.preventDefault();
        if (j >= hide - 1) return;
        const here = draft.current[j];
        // Moving on carries the guess forward, as the pen would.
        if (
          stage === "hidden" &&
          here !== null &&
          here !== undefined &&
          (draft.current[j + 1] ?? null) === null
        ) {
          set(j + 1, here);
        }
        focusHandle(j + 1);
        return;
      }
      case "ArrowLeft":
        event.preventDefault();
        focusHandle(j - 1);
        return;
      case "Home":
        event.preventDefault();
        focusHandle(0);
        return;
      case "End":
        event.preventDefault();
        focusHandle(hide - 1);
        return;
      case "Enter": {
        event.preventDefault();
        if (event.repeat || stage !== "hidden") return;
        const left = draft.current.filter((v) => v === null).length;
        if (left === 0) startReveal(draft.current);
        else say(`${left} ${left === 1 ? "point" : "points"} left to guess.`);
        return;
      }
      case "Escape":
        if (guessed === 0 && stage === "hidden") return;
        event.preventDefault();
        reset(true);
        return;
    }
  };

  // Geometry that depends on the guess at rest (the drawn line itself is
  // rebuilt from the live value, below).
  const visibleLine = line(
    points.slice(0, h0).map((p, i) => ({ x: xOf(i), y: yOf(p.value) })),
  );
  const truthLine = line(
    [anchorValue, ...truth].map((v, j) => ({
      x: xOf(h0 - 1 + j),
      y: yOf(v),
    })),
  );
  const guessCurve = (g: GuessLineGuess, tip: V | null) => {
    const verts: V[] = [{ x: xA, y: yOf(anchorValue) }];
    for (let j = 0; j < g.length; j += 1) {
      const v = g[j];
      if (v === null || v === undefined) break;
      verts.push({ x: xOf(h0 + j), y: yOf(v) });
    }
    if (tip && tip.x > xA) {
      const at = verts.findIndex((p) => p.x > tip.x);
      if (at === -1) verts.push(tip);
      else verts.splice(at, 0, tip);
    }
    return verts.length > 1 ? curve(verts, tension) : "";
  };
  const gap = complete
    ? `${guessCurve(guess, null)} L ${[...truth]
        .map((v, j) => ({ x: xOf(h0 + j), y: yOf(v) }))
        .reverse()
        .map((p) => `${p.x} ${p.y}`)
        .join(" L ")} L ${xA} ${yOf(anchorValue)} Z`
    : "";

  // Every value is read on every run, so each one is subscribed to.
  const drawn = useTransform(() => {
    const g = live.get();
    const x = penX.get();
    const y = penY.get();
    const on = penOn.get();
    return guessCurve(g, on > 0.5 ? { x, y } : null);
  });
  const clipWidth = useTransform(sweep, (s) => r2(clamp01(s) * (VIEW_W - xA)));
  const penLeft = useTransform(penX, (x) => `${r2(x / 10)}%`);
  const scoreText = useTransform(shownScore, (s) => `${Math.round(s)}%`);

  const first = points[0];
  const last = points[n - 1];
  const firstHidden = points[h0];
  const trend =
    anchor && first
      ? anchor.value > first.value
        ? "rising"
        : anchor.value < first.value
          ? "falling"
          : "holding"
      : "";
  const summary =
    first && anchor && firstHidden && last
      ? `${first.label} to ${anchor.label}: ${fmt(first.value)} ${trend} to ${fmt(anchor.value)}. ${firstHidden.label} to ${last.label} ${hide === 1 ? "is" : "are"} hidden. Draw your guess across the shaded band, or use each point's slider: Up and Down set a guess, Left and Right move between points, Enter reveals the real line, Escape clears.`
      : "";
  const tone =
    result === null
      ? ""
      : result.score >= 80
        ? "bg-success/12 text-success"
        : result.score >= 50
          ? "bg-warn/14 text-warn"
          : "bg-danger/12 text-danger";

  if (!data || n < 3) return null;

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={cn(
        "@container flex w-full min-w-0 flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex h-7 items-center justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-2">
          <span
            id={titleId}
            className="truncate text-sm font-medium text-foreground"
          >
            {data.title}
          </span>
          {data.caption ? (
            <span className="hidden truncate text-xs text-ink-3 @md:inline">
              {data.caption}
            </span>
          ) : null}
        </p>
        {stage === "landed" ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {showScore && result ? (
              <motion.span
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full px-2 font-mono text-[11px] tabular-nums",
                  tone,
                )}
                initial={
                  motionSafe ? { opacity: 0, scale: 0.8 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                transition={
                  motionSafe
                    ? springs.recoil
                    : { duration: durations.fast, ease: easings.enter }
                }
              >
                <motion.span>{scoreText}</motion.span>
                <span>close</span>
              </motion.span>
            ) : null}
            <button
              type="button"
              aria-label="Guess again"
              title="Guess again"
              disabled={disabled}
              onClick={() => {
                reset(true);
                focusHandle(0);
              }}
              className="inline-flex size-7 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed"
            >
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 shrink-0"
              >
                <path d="M3.2 8a4.8 4.8 0 1 0 1.4-3.4" />
                <path d="M3 2.6v2.6h2.6" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-1.5">
        <div aria-hidden className="relative" style={{ height: H }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 font-mono text-[10px] leading-none text-ink-3 tabular-nums"
              style={{ top: yOf(t) }}
            >
              {t.toFixed(tickDecimals)}
            </span>
          ))}
        </div>

        <div
          {...drag}
          className={cn(
            "relative touch-none overflow-clip rounded-2 [contain:paint] select-none [-webkit-touch-callout:none]",
            disabled ? "cursor-not-allowed" : "cursor-crosshair",
          )}
          style={{ height: H }}
        >
          <div ref={fieldRef} className="absolute inset-y-0 right-4 left-0">
            <div
              aria-hidden
              className="absolute inset-y-0 -right-4 border-l border-dashed border-hairline-strong bg-surface-2/60"
              style={{ left: `${r2(xA / 10)}%` }}
            >
              {stage === "hidden" ? (
                <span className="absolute top-1.5 left-2 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {guessed === 0 && !inking ? "Draw here" : "Your guess"}
                </span>
              ) : null}
            </div>

            <svg
              aria-hidden
              viewBox={`0 0 ${VIEW_W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 block size-full overflow-visible"
            >
              <defs>
                <clipPath id={clipId}>
                  <motion.rect
                    x={xA}
                    y={-PAD_Y}
                    height={H + 2 * PAD_Y}
                    width={clipWidth}
                  />
                </clipPath>
              </defs>
              {ticks.map((t) => (
                <line
                  key={t}
                  x1={0}
                  x2={VIEW_W}
                  y1={yOf(t)}
                  y2={yOf(t)}
                  vectorEffect="non-scaling-stroke"
                  className="stroke-hairline"
                  strokeWidth={1}
                />
              ))}
              {stage !== "hidden" ? (
                <motion.g
                  clipPath={`url(#${clipId})`}
                  style={{ opacity: revealOpacity }}
                >
                  <path
                    d={gap}
                    fillRule="evenodd"
                    className="fill-warn"
                    fillOpacity={0.24}
                  />
                  <path
                    d={truthLine}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-foreground"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </motion.g>
              ) : null}
              <path
                d={visibleLine}
                fill="none"
                vectorEffect="non-scaling-stroke"
                className="stroke-foreground"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <motion.path
                d={drawn}
                fill="none"
                vectorEffect="non-scaling-stroke"
                className="stroke-cobalt-bright"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <span
              aria-hidden
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
              style={{ left: `${r2(xA / 10)}%`, top: yOf(anchorValue) }}
            />

            {guess.map((v, j) => {
              const point = points[h0 + j];
              if (!point) return null;
              const actual = truth[j];
              const text =
                v === null
                  ? "not guessed yet"
                  : stage === "landed" && actual !== undefined
                    ? `guessed ${fmt(v)}, actual ${fmt(actual)}`
                    : fmt(v);
              return (
                <Handle
                  key={`${key}-${j}`}
                  ref={(node) => {
                    if (node) handles.current.set(point.label, node);
                    else handles.current.delete(point.label);
                  }}
                  index={j}
                  live={live}
                  left={`${r2(xOf(h0 + j) / 10)}%`}
                  yOf={yOf}
                  fallback={anchorValue}
                  label={`Guess for ${point.label}`}
                  min={Number(lo.toFixed(decimals))}
                  max={Number(hi.toFixed(decimals))}
                  now={v === null ? undefined : Number(v.toFixed(decimals))}
                  text={text}
                  tabIndex={disabled ? -1 : j === focused ? 0 : -1}
                  disabled={disabled}
                  onFocus={() => setFocusIndex(j)}
                  onKeyDown={(event) => onHandleKeyDown(event, j)}
                />
              );
            })}

            <motion.span
              aria-hidden
              className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-cobalt-bright"
              style={{ left: penLeft, top: penY, opacity: penOn }}
            />
          </div>
        </div>

        <div />
        <div aria-hidden className="relative mt-1 h-4 pr-4">
          <div className="relative h-full">
            {first ? (
              <span className="absolute left-0 font-mono text-[10px] leading-4 text-ink-3">
                {first.label}
              </span>
            ) : null}
            {anchor && h0 - 1 > 0 ? (
              <span
                className="absolute -translate-x-1/2 font-mono text-[10px] leading-4 text-ink-3"
                style={{ left: `${r2(xA / 10)}%` }}
              >
                {anchor.label}
              </span>
            ) : null}
            {last ? (
              <span className="absolute right-0 translate-x-1/2 font-mono text-[10px] leading-4 text-ink-3">
                {last.label}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <p id={descId} className="sr-only">
        {data.caption ? `${data.caption}. ` : ""}
        {summary}
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

type HandleProps = {
  index: number;
  live: MotionValue<GuessLineGuess>;
  left: string;
  yOf: (v: number) => number;
  fallback: number;
  label: string;
  min: number;
  max: number;
  now: number | undefined;
  text: string;
  tabIndex: number;
  disabled: boolean;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  ref: React.Ref<HTMLDivElement>;
};

/**
 * One hidden point as a slider. Its place follows the live guess (a motion
 * value) so it rides the pen without a render; its value for assistive
 * technology is the settled guess.
 */
function Handle({
  index,
  live,
  left,
  yOf,
  fallback,
  label,
  min,
  max,
  now,
  text,
  tabIndex,
  disabled,
  onFocus,
  onKeyDown,
  ref,
}: HandleProps) {
  const top = useTransform(live, (g) => {
    const mine = g[index];
    if (mine !== null && mine !== undefined) return yOf(mine);
    for (let m = index - 1; m >= 0; m -= 1) {
      const v = g[m];
      if (v !== null && v !== undefined) return yOf(v);
    }
    return yOf(fallback);
  });
  const set = useTransform(live, (g) =>
    g[index] === null || g[index] === undefined ? 0 : 1,
  );

  return (
    <motion.div
      ref={ref}
      role="slider"
      tabIndex={tabIndex}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={text}
      aria-disabled={disabled || undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className="group/handle pointer-events-none absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      style={{ left, top }}
    >
      <motion.span
        aria-hidden
        className="size-2 rounded-full bg-cobalt-bright"
        style={{ opacity: set }}
      />
      <span
        aria-hidden
        className="absolute inset-0.5 hidden rounded-full border border-dashed border-cobalt-bright group-focus-visible/handle:block"
      />
    </motion.div>
  );
}
