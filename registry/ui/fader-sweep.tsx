"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FaderSweepProps = {
  /** Controlled values, one per band, each between -range and +range. */
  value?: number[];
  /** Initial values when uncontrolled. Missing bands start at 0. */
  defaultValue?: number[];
  /** Fires from the stroke, drag or key that changed it, with every band. */
  onValueChange?: (value: number[]) => void;
  /**
   * How many faders, 2 to 10. A value array of another length is resampled
   * by relative position, so the shape survives a change of count. @default 7
   */
  bands?: number;
  /**
   * How soft the paint brush is, 0 to 1. At 0 each fader keeps exactly the
   * height the stroke gave it; higher, the faders behind the finger relax
   * toward their painted neighbours and the untouched ones beyond the stroke
   * feather toward it. @default 0.35
   */
  smoothing?: number;
  /** Draw the smooth curve through the knobs, over a faint fill. @default true */
  curve?: boolean;
  /** How far each fader reaches either side of 0. @default 12 */
  range?: number;
  /** The value's resolution and one arrow key's move. @default 0.5 */
  step?: number;
  /** The bank's accessible name. @default "Equalizer" */
  label?: string;
  /** One name per band, shown under it and spoken as its name. @default log-spaced frequencies from 63 Hz to 16 kHz */
  labels?: string[];
  /** A band's spoken value. @default "Boosted by 3 decibels", "Cut by 1.5 decibels" or "Flat" */
  format?: (value: number) => string;
  /** A note per fader as the stroke catches it, pitched by its value. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

export type FaderSweepBand = {
  /** What is printed under the fader: "63", "1k", "16k". */
  label: string;
  /** Its accessible name: "63 hertz", "1 kilohertz". */
  spoken: string;
};

const MAX_BANDS = 10;
const MIN_BANDS = 2;
/** Knob travel, px. */
const TRACK = 108;
/** Room above and below the travel: half a knob and the rubber band's give. */
const PAD = 16;
const BANK_H = TRACK + PAD * 2;
const KNOB_H = 12;
/** How far a knob gives past an end, at most (it never quite gets there). */
const GIVE = 8;
/** A knob's centre never goes nearer the edge than this: the flash fits too. */
const EDGE = KNOB_H / 2 + 3;
/** Release speed a knob keeps to itself before it counts as a throw, px/s. */
const DEAD_ZONE = 400;
/** C major pentatonic from C4 to C6, as semitones from C5. */
const SCALE = [-12, -10, -8, -5, -3, 0, 2, 4, 7, 9, 12];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const trim = (v: number) => String(Number(Math.abs(v).toFixed(2)));

/** Two significant figures, the way a frequency is printed on a panel. */
function band(f: number): FaderSweepBand {
  const mag = Math.pow(10, Math.floor(Math.log10(f)) - 1);
  const v = Math.round(f / mag) * mag;
  if (v >= 1000) {
    const k = Number((v / 1000).toFixed(1));
    return { label: `${k}k`, spoken: `${k} kilohertz` };
  }
  const hz = Math.round(v);
  return { label: String(hz), spoken: `${hz} hertz` };
}

/** The default band names for `count` bands: log-spaced, 63 Hz to 16 kHz. */
export function faderSweepBands(count: number): FaderSweepBand[] {
  const n = Math.max(1, Math.round(count));
  return Array.from({ length: n }, (_, i) =>
    band(n === 1 ? 1000 : 63 * Math.pow(16000 / 63, i / (n - 1))),
  );
}

/** Linear resampling by relative position, so a shape keeps its shape. */
function resample(values: readonly number[], n: number): number[] {
  if (values.length === n) return values.slice();
  if (values.length === 0) return Array.from({ length: n }, () => 0);
  const last = values.length - 1;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : (i / (n - 1)) * last;
    const a = Math.floor(t);
    const va = values[a] ?? 0;
    const vb = values[Math.min(last, a + 1)] ?? va;
    return va + (vb - va) * (t - a);
  });
}

const describe = (v: number) =>
  v === 0
    ? "Flat"
    : v > 0
      ? `Boosted by ${trim(v)} decibels`
      : `Cut by ${trim(v)} decibels`;

const yOf = (v: number, range: number) =>
  PAD + ((range - v) / (2 * range)) * TRACK;
const vOf = (y: number, range: number) =>
  range - ((y - PAD) / TRACK) * 2 * range;
const centreY = (v: number, range: number) =>
  clamp(yOf(v, range), EDGE, BANK_H - EDGE);

/** Past an end, a value gives like a rubber band, in px of travel. */
function rubberValue(v: number, range: number): number {
  const perPx = (2 * range) / TRACK;
  if (v > range) return range + rubberband((v - range) / perPx, GIVE) * perPx;
  if (v < -range) {
    return -range + rubberband((v + range) / perPx, GIVE) * perPx;
  }
  return v;
}

/**
 * The paint brush. `base` is the bank as the stroke found it, `touched` what
 * the stroke has given each band it reached, `current` the band under the
 * finger — which is never smoothed, so it stays 1:1. Every other band is a
 * raised-cosine blend of the painted bands within `smoothing × 2` bands; an
 * untouched band counts its own value once, so it feathers rather than
 * copies. Pure, so the keyboard's carry lands exactly where a stroke would.
 */
function brush(
  base: readonly number[],
  touched: ReadonlyMap<number, number>,
  current: number | null,
  smoothing: number,
  range: number,
): number[] {
  const reach = clamp(smoothing, 0, 1) * 2 + 1;
  const weight = (d: number) =>
    d < reach ? Math.cos((Math.PI / 2) * (d / reach)) ** 2 : 0;
  return base.map((b, i) => {
    const own = touched.get(i);
    if (i === current && own !== undefined) return own;
    let num = 0;
    let den = 0;
    for (const [j, s] of touched) {
      const w = weight(Math.abs(i - j));
      num += w * s;
      den += w;
    }
    if (own === undefined) {
      if (den === 0) return b;
      num += b;
      den += 1;
    }
    return clamp(num / den, -range, range);
  });
}

/** The spline through the knob centres, flat to both edges, in band units. */
function curveOf(values: readonly number[], range: number) {
  const n = values.length;
  if (n === 0) return { line: "", area: "" };
  const ys = values.map((v) => centreY(v, range));
  const pts: [number, number][] = [
    [0, ys[0] ?? 0],
    ...ys.map((y, i): [number, number] => [i + 0.5, y]),
    [n, ys[n - 1] ?? 0],
  ];
  const f = (x: number, y: number) => `${r3(x)} ${r3(y)}`;
  let line = `M${f(0, pts[0]?.[1] ?? 0)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (!p1 || !p2) continue;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    line += `C${f(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)} ${f(
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
    )} ${f(p2[0], p2[1])}`;
  }
  const zero = r3(yOf(0, range));
  return { line, area: `${line}L${n} ${zero}L0 ${zero}Z` };
}

type Stroke = {
  mode: "knob" | "paint";
  /** The grabbed band, or the band under the finger while painting. */
  band: number;
  rect: DOMRect;
  colW: number;
  startX: number;
  startY: number;
  startValue: number;
  /** The bank as the stroke found it, clamped: the brush's base. */
  base: number[];
  touched: Map<number, number>;
  targets: number[];
  lastX: number;
  lastY: number;
  /** The scale step the moving band is on, for its notes. */
  degree: number;
  /** Where every band was when the stroke began, for Escape. */
  restore: number[];
};

type Api = {
  sync: () => void;
  cancel: () => void;
  /** Disabled mid-stroke: the stroke ends where it is. */
  interrupt: () => void;
};

/**
 * A bank of vertical faders joined by a smooth curve, painted in one stroke.
 * Press anywhere in the bank but a knob and draw across it: the fader under
 * the finger takes the finger's height, every fader you pass takes the
 * height where the stroke crossed it — the ones a fast stroke skips catch up
 * on a quick critically damped spring — and each plays a note pitched by its
 * value as it is caught, so the sweep is heard as the shape it drew. The
 * brush's `smoothing` relaxes the faders behind the finger into a smooth
 * contour and feathers into the untouched ones beyond the stroke.
 *
 * Grab a knob instead and that one fader is yours: 1:1 by offset,
 * rubber-banded past either end, thrown by a flick, settled on the glide
 * spring with the release velocity. Leave its column by a whole width and the
 * drag becomes a paint stroke from there.
 *
 * Every fader is a real vertical `role="slider"` in one roving tab stop: Up
 * and Down step it, Page keys move a quarter of the range, Home and End go to
 * the ends, Left and Right move between faders, and Shift with Left or Right
 * carries this fader's value into the next — the keyboard's stroke, through
 * the same brush, spring and note. Under reduced motion nothing springs; the
 * faders, the curve and the notes still answer, because the shape is the value.
 */
export function FaderSweep({
  value,
  defaultValue,
  onValueChange,
  bands = 7,
  smoothing = 0.35,
  curve = true,
  range = 12,
  step = 0.5,
  label = "Equalizer",
  labels,
  format = describe,
  sound = false,
  disabled = false,
  className,
}: FaderSweepProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const n = clamp(Math.round(bands), MIN_BANDS, MAX_BANDS);
  const span = Math.max(0.5, range);
  const unit = Math.max(0.01, step);

  const quant = (v: number) =>
    Number((Math.round(clamp(v, -span, span) / unit) * unit).toFixed(4)) || 0;

  const [own, setOwn] = React.useState<number[]>(() => defaultValue ?? []);
  const raw = value ?? own;
  const shown = resample(raw, n).map(quant);
  const shownKey = shown.join(",");
  const names = faderSweepBands(n).map((b, i) => {
    const custom = labels?.[i];
    return custom ? { label: custom, spoken: custom } : b;
  });

  // Ten motion values made once, the most a bank can hold: hooks cannot be
  // called per band when the band count is a prop that changes.
  const [pool] = React.useState(() =>
    Array.from({ length: MAX_BANDS }, (_, i) => motionValue(shown[i] ?? 0)),
  );
  const [flashes] = React.useState(() =>
    Array.from({ length: MAX_BANDS }, () => motionValue(0)),
  );

  const [focusIdx, setFocusIdx] = React.useState(0);
  const [active, setActive] = React.useState<number | null>(null);
  const [check, setCheck] = React.useState(0);
  // What the live region says about the last stroke, spoken only while the
  // bank still holds it, so a stroke the host refuses is never announced.
  const [said, setSaid] = React.useState<{ key: string; text: string } | null>(
    null,
  );

  const bankRef = React.useRef<HTMLDivElement | null>(null);
  const colRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const anims = React.useRef<(AnimationPlaybackControls | null)[]>([]);
  const flashAnims = React.useRef<(AnimationPlaybackControls | null)[]>([]);
  const goal = React.useRef<number[]>(shown);
  const reported = React.useRef(shownKey);
  const stroke = React.useRef<Stroke | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const api = React.useRef<Api | null>(null);

  const mvAt = (i: number) => pool[i] ?? pool[0]!;

  const stopBand = (i: number) => {
    anims.current[i]?.stop();
    anims.current[i] = null;
  };

  const setBand = (i: number, v: number) => {
    stopBand(i);
    mvAt(i).set(r3(v));
  };

  const moveBand = (
    i: number,
    to: number,
    spring: "flick" | "glide" | "snap",
    velocity?: number,
  ) => {
    const mv = mvAt(i);
    stopBand(i);
    if (!motionSafe) {
      mv.set(to);
      return;
    }
    if (Math.abs(mv.get() - to) < 1e-4 && velocity === undefined) {
      mv.set(to);
      return;
    }
    anims.current[i] = animate(mv, to, {
      ...springs[spring],
      velocity: velocity ?? mv.getVelocity(),
    });
  };

  const flash = (i: number) => {
    const f = flashes[i];
    if (!f) return;
    flashAnims.current[i]?.stop();
    f.set(1);
    flashAnims.current[i] = animate(f, 0, {
      duration: durations.slow,
      ease: easings.enter,
    });
  };

  const values = () => pool.slice(0, n).map((mv) => mv.get());
  /** Where every band is heading: what the bank says, not a frame of a spring. */
  const rest = () =>
    Array.from({ length: n }, (_, i) =>
      quant(goal.current[i] ?? mvAt(i).get()),
    );

  const degreeOf = (v: number) =>
    Math.round(clamp((v + span) / (2 * span), 0, 1) * (SCALE.length - 1));

  const panOf = (i: number) => {
    const el = bankRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return panFrom(rect.left + ((i + 0.5) / n) * rect.width, el);
  };

  const note = (i: number, v: number) => {
    audio.play("note", {
      pitch: r3(semitones(SCALE[degreeOf(v)] ?? 0)),
      gain: 0.42,
      pan: panOf(i),
    });
  };

  const report = (next: readonly number[]) => {
    const q = next.map(quant);
    const key = q.join(",");
    if (key === reported.current) return;
    reported.current = key;
    if (value === undefined) setOwn(q);
    onValueChange?.(q);
  };

  const release = () => {
    detach.current?.();
    detach.current = null;
    stroke.current = null;
    setActive(null);
  };

  /** Where the stroke's pointer is now, in the bank's own px. */
  const paintTo = (s: Stroke, x: number, y: number) => {
    const x0 = s.lastX;
    const y0 = s.lastY;
    const now = clamp(Math.floor(x / s.colW), 0, n - 1);
    const caught: number[] = [];
    // Centre lines the pointer crossed since the last event: those bands
    // take the stroke's height there, interpolated between the two samples.
    if (x !== x0) {
      const lo = Math.min(x0, x);
      const hi = Math.max(x0, x);
      for (let b = 0; b < n; b += 1) {
        if (b === now) continue;
        const cx = (b + 0.5) * s.colW;
        if (cx <= lo || cx >= hi) continue;
        const yy = y0 + ((y - y0) * (cx - x0)) / (x - x0);
        s.touched.set(b, clamp(vOf(yy, span), -span, span));
        if (b !== s.band) caught.push(b);
      }
    }
    s.touched.set(now, rubberValue(vOf(y, span), span));
    if (now !== s.band) {
      caught.push(now);
      s.band = now;
      setActive(now);
    }
    s.lastX = x;
    s.lastY = y;
    const targets = brush(s.base, s.touched, now, smoothing, span);
    targets.forEach((t, i) => {
      if (i === now) {
        setBand(i, t);
        return;
      }
      if (Math.abs((s.targets[i] ?? Infinity) - t) < 1e-4) return;
      moveBand(i, t, "flick");
    });
    s.targets = targets;
    for (const b of caught) {
      flash(b);
      note(b, targets[b] ?? 0);
    }
    const d = degreeOf(targets[now] ?? 0);
    if (d !== s.degree && !caught.includes(now)) note(now, targets[now] ?? 0);
    s.degree = d;
    report(targets);
  };

  const beginPaint = (
    s: Stroke,
    from: number,
    fromX: number,
    fromY: number,
  ) => {
    s.mode = "paint";
    s.base = rest();
    s.base[s.band] = from;
    s.targets = s.base.slice();
    s.touched = new Map([[s.band, from]]);
    s.lastX = fromX;
    s.lastY = fromY;
  };

  /** Everything lands on a step, inside the range, and is reported. */
  const settle = (s: Stroke, velocityY: number) => {
    const now = values();
    let finals: number[];
    if (s.mode === "knob") {
      const v = now[s.band] ?? 0;
      // A slow release lands where the finger lifted; only speed past the
      // dead zone is a throw, carried on a heavy surface.
      const thrown =
        Math.sign(velocityY) * Math.max(0, Math.abs(velocityY) - DEAD_ZONE);
      const px = project(0, thrown, 0.99);
      const target = quant(v - (px / TRACK) * 2 * span);
      finals = rest();
      finals[s.band] = target;
      const past = Math.abs(v) > span;
      moveBand(
        s.band,
        target,
        past ? "snap" : "glide",
        (-velocityY / TRACK) * 2 * span,
      );
    } else {
      const targets = brush(s.base, s.touched, s.band, smoothing, span);
      finals = targets.map(quant);
      finals.forEach((t, i) => {
        if (i === s.band) {
          const past = Math.abs(now[i] ?? 0) > span;
          moveBand(
            i,
            t,
            past ? "snap" : "flick",
            (-velocityY / TRACK) * 2 * span,
          );
        } else {
          moveBand(i, t, "flick");
        }
      });
      const hit = [...s.touched.keys()].sort((a, b) => a - b);
      const first = names[hit[0] ?? 0]?.spoken ?? "";
      const last = names[hit[hit.length - 1] ?? 0]?.spoken ?? "";
      setSaid({
        key: finals.join(","),
        text:
          hit.length === 1
            ? `Painted ${first}`
            : `Painted ${hit.length} bands, ${first} to ${last}`,
      });
    }
    goal.current = finals;
    report(finals);
    // A controlled host answers in the same batch: the sync that follows
    // leaves a taken change alone and glides a refused one back.
    setCheck((c) => c + 1);
  };

  const cancel = () => {
    const s = stroke.current;
    if (!s) return;
    release();
    s.restore.forEach((v, i) => moveBand(i, v, "glide"));
    goal.current = s.restore.slice();
    report(s.restore);
    setCheck((c) => c + 1);
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, offset }) => {
      const el = bankRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const colW = rect.width / n;
      const sx = point.x - offset.x - rect.left;
      const sy = point.y - offset.y - rect.top;
      const at = clamp(Math.floor(sx / colW), 0, n - 1);
      const now = values();
      const v = now[at] ?? 0;
      const onKnob = Math.abs(sy - centreY(v, span)) <= KNOB_H / 2 + 8;
      const s: Stroke = {
        mode: "knob",
        band: at,
        rect,
        colW,
        startX: sx,
        startY: sy,
        startValue: v,
        base: [],
        touched: new Map(),
        targets: [],
        lastX: sx,
        lastY: sy,
        degree: degreeOf(v),
        restore: rest(),
      };
      stroke.current = s;
      setActive(at);
      if (onKnob) {
        stopBand(at);
      } else {
        const hit = clamp(vOf(sy, span), -span, span);
        beginPaint(s, hit, sx, sy);
        flash(at);
        note(at, hit);
        s.degree = degreeOf(hit);
      }
      // Escape puts the bank back; it is claimed so the stage stays open.
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || !stroke.current) return;
        event.preventDefault();
        api.current?.cancel();
      };
      document.addEventListener("keydown", onKey);
      detach.current = () => document.removeEventListener("keydown", onKey);
    },
    onMove: ({ point }) => {
      const s = stroke.current;
      if (!s) return;
      const x = point.x - s.rect.left;
      const y = point.y - s.rect.top;
      if (s.mode === "knob") {
        if (Math.abs(x - s.startX) <= s.colW) {
          const v = rubberValue(
            s.startValue + ((s.startY - y) / TRACK) * 2 * span,
            span,
          );
          setBand(s.band, v);
          const d = degreeOf(v);
          if (d !== s.degree) note(s.band, v);
          s.degree = d;
          const next = rest();
          next[s.band] = v;
          report(next);
          return;
        }
        // Out of the grabbed column: the rest of the stroke paints, starting
        // from the knob it left.
        const v = clamp(mvAt(s.band).get(), -span, span);
        setBand(s.band, v);
        beginPaint(s, v, (s.band + 0.5) * s.colW, centreY(v, span));
      }
      paintTo(s, x, y);
    },
    onEnd: ({ velocity }) => {
      const s = stroke.current;
      if (!s) return;
      release();
      settle(s, velocity.y);
    },
    onCancel: () => {
      const s = stroke.current;
      if (!s) return;
      release();
      settle(s, 0);
    },
    onTap: (event) => {
      const el = bankRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const at = clamp(
        Math.floor(((event.clientX - rect.left) / rect.width) * n),
        0,
        n - 1,
      );
      const y = event.clientY - rect.top;
      const v = mvAt(at).get();
      if (Math.abs(y - centreY(v, span)) <= KNOB_H / 2 + 8) return;
      const target = quant(vOf(y, span));
      const next = rest();
      next[at] = target;
      goal.current = next;
      moveBand(at, target, "flick");
      flash(at);
      note(at, target);
      report(next);
    },
  });

  const onKeyDown = (i: number, event: React.KeyboardEvent) => {
    if (disabled || stroke.current) return;
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const resting = rest();
    const v = resting[i] ?? 0;
    const big = span / 4;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowUp":
        next = v + unit;
        break;
      case "ArrowDown":
        next = v - unit;
        break;
      case "PageUp":
        next = v + big;
        break;
      case "PageDown":
        next = v - big;
        break;
      case "Home":
        next = -span;
        break;
      case "End":
        next = span;
        break;
      case "ArrowLeft":
      case "ArrowRight": {
        event.preventDefault();
        const j = i + (event.key === "ArrowLeft" ? -1 : 1);
        if (j < 0 || j >= n) return;
        if (event.shiftKey) {
          // The keyboard's stroke: this band and the next, painted with the
          // brush a pointer would use, the next one under the "finger".
          const targets = brush(
            resting,
            new Map([
              [i, v],
              [j, v],
            ]),
            j,
            smoothing,
            span,
          ).map(quant);
          targets.forEach((t, k) => {
            if (t !== resting[k]) moveBand(k, t, "flick");
          });
          goal.current = targets;
          flash(j);
          note(j, v);
          report(targets);
        }
        setFocusIdx(j);
        colRefs.current[j]?.focus();
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    const q = quant(next);
    if (q === v) return;
    resting[i] = q;
    goal.current = resting;
    moveBand(i, q, Math.abs(q - v) > big ? "glide" : "flick");
    note(i, q);
    report(resting);
  };

  React.useEffect(() => {
    api.current = {
      // The host's value (or our own) is where the bands rest. A stroke in
      // progress is never interrupted by an echo of itself.
      sync: () => {
        if (stroke.current) return;
        for (let i = 0; i < n; i += 1) {
          const want = shown[i] ?? 0;
          if (goal.current[i] === want) continue;
          goal.current[i] = want;
          moveBand(i, want, "glide");
        }
        reported.current = shownKey;
      },
      cancel,
      interrupt: () => {
        const s = stroke.current;
        if (!s) return;
        release();
        settle(s, 0);
      },
    };
  });

  React.useEffect(() => {
    api.current?.sync();
  }, [shownKey, check, n]);

  React.useEffect(() => {
    if (disabled) api.current?.interrupt();
  }, [disabled]);

  React.useEffect(() => {
    const running = anims.current;
    const fading = flashAnims.current;
    return () => {
      detach.current?.();
      detach.current = null;
      // Finished, not frozen: a re-run in development must not leave a
      // knob stopped halfway to where it was going.
      for (const c of running) c?.complete();
      for (const c of fading) c?.complete();
    };
  }, []);

  const curveAll = useTransform(pool, (all: number[]) =>
    curveOf(all.slice(0, n), span),
  );
  const curveLine = useTransform(curveAll, (c) => c.line);
  const curveArea = useTransform(curveAll, (c) => c.area);

  const focusAt = Math.min(focusIdx, n - 1);
  const spoken =
    said && said.key === shownKey && active === null ? said.text : "";
  const axis = [
    { y: PAD, text: `+${trim(span)}` },
    { y: PAD + TRACK / 2, text: "0" },
    { y: PAD + TRACK, text: `−${trim(span)}` },
  ];

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex w-full flex-col gap-1.5 select-none",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex">
        <div
          aria-hidden
          className="relative w-8 shrink-0"
          style={{ height: BANK_H }}
        >
          {axis.map((a) => (
            <span
              key={a.text}
              className="absolute right-2 -translate-y-1/2 font-mono text-[10px] leading-none text-ink-3 tabular-nums"
              style={{ top: a.y }}
            >
              {a.text}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: BANK_H }}>
          <svg
            aria-hidden
            viewBox={`0 0 ${n} ${BANK_H}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <path
                key={t}
                d={`M0 ${PAD + t * TRACK}H${n}`}
                fill="none"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className={
                  t === 0.5 ? "stroke-hairline-strong" : "stroke-hairline"
                }
                opacity={t === 0.25 || t === 0.75 ? 0.6 : 1}
              />
            ))}
            {names.map((b, i) => (
              <path
                key={b.label + i}
                d={`M${i + 0.5} ${PAD}V${PAD + TRACK}`}
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-ink-3/20"
              />
            ))}
            {curve ? (
              <>
                <motion.path d={curveArea} className="fill-cobalt-bright/10" />
                <motion.path
                  d={curveLine}
                  fill="none"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-cobalt-bright"
                />
              </>
            ) : null}
          </svg>
          <div
            ref={bankRef}
            {...drag}
            onContextMenu={(event) => event.preventDefault()}
            className={cn(
              "absolute inset-0 flex touch-none [-webkit-touch-callout:none]",
              disabled ? "cursor-not-allowed" : "cursor-crosshair",
            )}
          >
            {names.map((b, i) => (
              <Fader
                key={i}
                mv={mvAt(i)}
                flash={flashes[i] ?? flashes[0]!}
                span={span}
                name={b.spoken}
                valueNow={shown[i] ?? 0}
                valueText={format(shown[i] ?? 0)}
                tabbable={i === focusAt}
                active={active === i}
                disabled={disabled}
                describedBy={hintId}
                bindRef={(el) => {
                  colRefs.current[i] = el;
                }}
                onFocus={() => setFocusIdx(i)}
                onKeyDown={(event) => onKeyDown(i, event)}
              />
            ))}
          </div>
        </div>
      </div>
      {/* A narrow panel sets its band names a size down and tighter, so
          neighbours like 2.5k and 6.4k never run together. */}
      <div aria-hidden className="@container flex">
        <span className="w-8 shrink-0" />
        {names.map((b, i) => (
          <span
            key={b.label + i}
            className={cn(
              "min-w-0 flex-1 truncate text-center font-mono text-[10px] leading-3.5 transition-colors @max-[300px]:text-[9px] @max-[300px]:tracking-[-0.04em]",
              active === i ? "text-foreground" : "text-ink-3",
            )}
          >
            {b.label}
          </span>
        ))}
      </div>
      <span id={hintId} className="sr-only">
        Up and Down set a band, Page keys a quarter of the range, Home and End
        its ends. Left and Right move between bands; with Shift they carry the
        value along.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}

function Fader({
  mv,
  flash,
  span,
  name,
  valueNow,
  valueText,
  tabbable,
  active,
  disabled,
  describedBy,
  bindRef,
  onFocus,
  onKeyDown,
}: {
  mv: MotionValue<number>;
  flash: MotionValue<number>;
  span: number;
  name: string;
  valueNow: number;
  valueText: string;
  tabbable: boolean;
  active: boolean;
  disabled: boolean;
  describedBy: string;
  bindRef: (el: HTMLDivElement | null) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const zero = PAD + TRACK / 2;
  const low = -span;
  const knobY = useTransform(mv, (v) => r2(centreY(v, span) - KNOB_H / 2));
  const fillTop = useTransform(mv, (v) => r2(Math.min(zero, centreY(v, span))));
  const fillHeight = useTransform(mv, (v) =>
    r2(Math.abs(centreY(v, span) - zero)),
  );
  const ring = useTransform(flash, (f) => r2(f));

  return (
    <div
      ref={bindRef}
      role="slider"
      tabIndex={disabled ? -1 : tabbable ? 0 : -1}
      aria-label={name}
      aria-orientation="vertical"
      aria-valuemin={low}
      aria-valuemax={span}
      aria-valuenow={valueNow}
      aria-valuetext={valueText}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className="group/fader-sweep relative h-full min-w-0 flex-1 outline-none"
    >
      <motion.span
        aria-hidden
        className="absolute left-1/2 w-1 -translate-x-1/2 rounded-full bg-cobalt-bright/70"
        style={{ top: fillTop, height: fillHeight }}
      />
      <motion.span
        aria-hidden
        className={cn(
          "absolute top-0 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-1 border bg-card shadow-sm transition-colors",
          "group-focus-visible/fader-sweep:outline-2 group-focus-visible/fader-sweep:outline-offset-2 group-focus-visible/fader-sweep:outline-ring group-focus-visible/fader-sweep:outline-solid",
          active
            ? "cursor-grabbing border-cobalt-bright"
            : "cursor-grab border-hairline-strong group-hover/fader-sweep:border-ink-3",
          disabled && "cursor-not-allowed",
        )}
        style={{
          y: knobY,
          height: KNOB_H,
          width: "min(24px, calc(100% - 8px))",
        }}
      >
        <span className="h-px w-1/2 bg-ink-3/70" />
        <motion.span
          className="pointer-events-none absolute -inset-0.75 rounded-2 border-2 border-cobalt-bright"
          style={{ opacity: ring }}
        />
      </motion.span>
    </div>
  );
}
