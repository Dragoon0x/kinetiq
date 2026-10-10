"use client";

import * as React from "react";

import { MoveHorizontal } from "lucide-react";
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
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DragNumberSize = "sm" | "md" | "lg";

export type DragNumberProps = {
  /** The field's name: shown on the left, and the handle you scrub. */
  label: string;
  /** Controlled value. */
  value?: number;
  /** Initial value when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the scrub, key or typed entry that changed it, with the new value. */
  onValueChange?: (value: number) => void;
  /** Lowest value. @default 0 */
  min?: number;
  /** Highest value. @default 100 */
  max?: number;
  /** The value's grid: one arrow key, one slow-scrub detent. @default 1 */
  step?: number;
  /** Decimals shown and kept; never fewer than the step needs. @default 0 */
  precision?: number;
  /** Scrub speed: one step per 6 / sensitivity px of a slow drag. @default 1 */
  sensitivity?: number;
  /** Fast drags shift to coarser steps (×10, then ×100 on long ranges). @default true */
  accelerate?: boolean;
  /** A short unit after the number, e.g. "%", "px", "°". @default "" */
  unit?: string;
  /** Show the tick bar under the value while scrubbing or stepping. @default true */
  ruler?: boolean;
  /** The spoken value. @default the value and its unit */
  valueText?: (value: number) => string;
  /** Fires when a scrub starts, changes gear (1, 10, 100) or ends. */
  onScrubChange?: (scrubbing: boolean, gear: number) => void;
  /** The needle and the grip while scrubbing. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The input's form name. */
  name?: string;
  /** @default "md" */
  size?: DragNumberSize;
  /** A tick for every value the scrub or a key passes. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  height: number;
  font: number;
  line: number;
  pad: number;
  tick: number;
  text: string;
  icon: string;
};

const SIZES: Record<DragNumberSize, Geometry> = {
  sm: {
    height: 32,
    font: 12,
    line: 16,
    pad: 10,
    tick: 6,
    text: "text-xs",
    icon: "size-3",
  },
  md: {
    height: 36,
    font: 13,
    line: 18,
    pad: 12,
    tick: 7,
    text: "text-[13px]",
    icon: "size-3.5",
  },
  lg: {
    height: 44,
    font: 15,
    line: 20,
    pad: 14,
    tick: 8,
    text: "text-sm",
    icon: "size-4",
  },
};

/** Gear thresholds in px/s; a gear is let go below KEEP × its threshold. */
const UP_10 = 700;
const UP_100 = 1800;
const KEEP = 0.55;
/** Fine ticks never sit closer than this, in px. */
const MIN_TICK = 4;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const decimalsOf = (n: number) => {
  const text = String(n);
  const exp = text.split("e-")[1];
  if (exp) return Number(exp);
  return (text.split(".")[1] ?? "").length;
};

/**
 * Where digit wheel `k` sits for a display value `a` (scaled to an integer,
 * so wheel 0 is the last shown decimal). The bottom wheel turns with the
 * value; every other wheel only turns while the part below it carries from
 * all nines to zero — a real odometer, so 99 → 100 rolls the hundreds in at
 * the very end, not halfway.
 */
const wheelAt = (a: number, k: number) => {
  if (k === 0) return a % 10;
  const p = 10 ** k;
  const base = Math.floor(a / p);
  const lower = a - base * p;
  return (base % 10) + clamp01(lower - (p - 1));
};

function Wheel({
  odo,
  k,
  line,
  lead,
}: {
  odo: MotionValue<number>;
  k: number;
  line: number;
  lead: boolean;
}) {
  const y = useTransform(odo, (d) => r2(-wheelAt(Math.abs(d), k) * line));
  // A leading column opens during the carry that brings its first digit in.
  const open = useTransform(odo, (d) =>
    lead ? r3(clamp01(Math.abs(d) - (10 ** k - 1))) : 1,
  );
  const width = useTransform(open, (o) => `${o}ch`);
  return (
    <motion.span
      className="relative inline-block shrink-0 overflow-clip"
      style={{ width, height: line, opacity: open }}
    >
      <motion.span
        className="absolute top-0 left-0 flex flex-col"
        style={{ y }}
      >
        {DIGITS.map((n, i) => (
          <span
            key={i}
            className="block text-center"
            style={{ width: "1ch", height: line, lineHeight: `${line}px` }}
          >
            {n}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
}

function Sign({ odo, line }: { odo: MotionValue<number>; line: number }) {
  const open = useTransform(odo, (d) => r3(clamp01(-d)));
  const width = useTransform(open, (o) => `${o}ch`);
  return (
    <motion.span
      className="inline-block shrink-0 overflow-clip text-center"
      style={{ width, height: line, lineHeight: `${line}px`, opacity: open }}
    >
      −
    </motion.span>
  );
}

type Ruler = { fine: string; mid: string; major: string; alpha: number };

/**
 * The tick bar: a tape that moves with the finger. Values increase to the
 * LEFT of the needle, so a drag to the right (more) carries the tape to the
 * right under the finger, 1:1 in pixels at every gear. Fine ticks fade as the
 * tape zooms out and they crowd, so a gear change never pops.
 */
function buildRuler(
  tape: number,
  zoom: number,
  reveal: number,
  width: number,
  o: {
    lo: number;
    hi: number;
    step: number;
    pxPerStep: number;
    tick: number;
    base: number;
  },
): Ruler {
  const empty = { fine: "", mid: "", major: "", alpha: 0 };
  if (width <= 0 || reveal <= 0.001) return empty;
  const ppv = o.pxPerStep / (o.step * Math.max(1, zoom));
  if (!(ppv > 0)) return empty;
  let unit = o.step;
  for (let i = 0; i < 9 && unit * ppv < MIN_TICK; i += 1) unit *= 10;
  const spacing = unit * ppv;
  const cx = width / 2;
  const from = Math.max(o.lo, tape - (width - cx) / ppv);
  const to = Math.min(o.hi, tape + cx / ppv);
  const first = Math.ceil((from - o.lo) / unit - 1e-6);
  const last = Math.floor((to - o.lo) / unit + 1e-6);
  const grow = Math.max(0, reveal);
  const fine: string[] = [];
  const mid: string[] = [];
  const major: string[] = [];
  const tick = (x: number, h: number) => `M${r2(x)} ${o.base}v${r2(-h * grow)}`;
  for (let i = first; i <= last && i - first < 400; i += 1) {
    const v = o.lo + i * unit;
    const x = cx - (v - tape) * ppv;
    if (i % 10 === 0) major.push(tick(x, o.tick));
    else if (i % 5 === 0) mid.push(tick(x, o.tick * 0.66));
    else fine.push(tick(x, o.tick * 0.42));
  }
  // The tape's two ends: taller caps, so pulling past one reads as running out.
  for (const end of [o.lo, o.hi]) {
    const x = cx - (end - tape) * ppv;
    if (x >= 0 && x <= width) major.push(tick(x, o.tick * 1.3));
  }
  return {
    fine: fine.join(""),
    mid: mid.join(""),
    major: major.join(""),
    alpha: r2(clamp01((spacing - MIN_TICK) / 8)),
  };
}

type Scrub = {
  active: boolean;
  raw: number;
  gear: number;
  speed: number;
  last: number;
  pinned: boolean;
};

/**
 * A numeric field you scrub like a dial. Dragging the label sideways moves
 * the value with a velocity-aware step: a slow drag moves one step per few
 * pixels, a fast one shifts up a gear (×10, then ×100 on long ranges) and
 * snaps to that gear's grid, and Shift held while dragging forces ×10. The
 * digits roll on real odometer wheels that follow the value on the snap
 * spring, and a tick bar appears along the bottom of the field: a tape under
 * a fixed needle that moves 1:1 with the finger at every gear, zooms about the
 * needle when the gear changes, ends at min and max, and rubber-bands past
 * them.
 *
 * It stays a real text input (`role="spinbutton"`): click the number to type,
 * Enter commits, Escape reverts, and ArrowUp/ArrowDown step (Shift ×10,
 * PageUp/PageDown ×10, Home/End to the ends) with the same tape gliding to
 * the new value. Under reduced motion the digits swap instead of rolling and
 * the tape lands without a spring, but the tape still shows and follows the
 * finger, because it is the reading.
 */
export function DragNumber({
  label,
  value,
  defaultValue = 0,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  precision = 0,
  sensitivity = 1,
  accelerate = true,
  unit = "",
  ruler = true,
  valueText,
  onScrubChange,
  accent = "var(--accent-bright)",
  name,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: DragNumberProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const inputId = `${uid}-input`;
  const hintId = `${uid}-hint`;
  const g = SIZES[size] ?? SIZES.md;

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const grid = step > 0 && Number.isFinite(step) ? step : 1;
  const places = clamp(Math.round(Math.max(precision, decimalsOf(grid))), 0, 6);
  const scale = 10 ** places;
  const pxPerStep = 6 / clamp(sensitivity, 0.05, 20);
  const fix = (v: number) => Number(v.toFixed(places));
  const snap = (v: number, cell: number) =>
    fix(clamp(lo + Math.round((v - lo) / cell) * cell, lo, hi));
  const format = (v: number) => (Object.is(v, -0) ? 0 : v).toFixed(places);

  const [own, setOwn] = React.useState(() =>
    fix(clamp(lo + Math.round((defaultValue - lo) / grid) * grid, lo, hi)),
  );
  const current = fix(clamp(value ?? own, lo, hi));

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [gear, setGear] = React.useState(1);
  const [scrubbing, setScrubbing] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);
  const [labelWidth, setLabelWidth] = React.useState(
    () => g.pad + 20 + Math.round(label.length * g.font * 0.58),
  );
  // The unit is measured, not assumed one `ch` per letter: the typed text
  // must end exactly where the wheels do.
  const [unitWidth, setUnitWidth] = React.useState(() =>
    Math.round(unit.length * g.font * 0.62),
  );
  const unitGap = Math.round(g.font * 0.3);

  const odo = useMotionValue(Math.round(current * scale));
  const tape = useMotionValue(current);
  const zoom = useMotionValue(1);
  const reveal = useMotionValue(0);
  const boxWidth = useMotionValue(0);
  const shake = useMotionValue(0);

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const labelRef = React.useRef<HTMLLabelElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef({ hide: 0, invalid: 0 });
  const reported = React.useRef(current);
  const scrub = React.useRef<Scrub>({
    active: false,
    raw: current,
    gear: 1,
    speed: 0,
    last: 0,
    pinned: false,
  });
  const rulerOn = React.useRef(false);
  const jumpNext = React.useRef(false);
  const pointerFocus = React.useRef(false);
  const suppressClick = React.useRef(false);
  const shown = React.useRef({ value: current, scale });

  const run = React.useCallback(
    (key: string, controls: AnimationPlaybackControls) => {
      anims.current.get(key)?.stop();
      anims.current.set(key, controls);
    },
    [],
  );
  const halt = React.useCallback((key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  }, []);

  const showRuler = () => {
    window.clearTimeout(timers.current.hide);
    if (!ruler) return;
    rulerOn.current = true;
    run(
      "reveal",
      animate(
        reveal,
        1,
        motionSafe ? springs.snap : { duration: durations.fast },
      ),
    );
  };

  const hideRuler = (after: number) => {
    window.clearTimeout(timers.current.hide);
    timers.current.hide = window.setTimeout(() => {
      if (scrub.current.active) return;
      run(
        "reveal",
        animate(reveal, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: () => {
            rulerOn.current = false;
            zoom.jump(1);
          },
        }),
      );
    }, after);
  };

  /** Hovering the label shows a faint, short ruler: a hint that it scrubs. */
  const peekRuler = (on: boolean) => {
    if (!ruler || disabled || rulerOn.current || scrub.current.active) return;
    run(
      "reveal",
      animate(reveal, on ? 0.4 : 0, {
        duration: on ? durations.base : durations.fast,
        ease: on ? easings.enter : easings.exit,
      }),
    );
  };

  const setZoom = (to: number) => {
    if (!motionSafe || !rulerOn.current) {
      halt("zoom");
      zoom.jump(to);
      return;
    }
    run("zoom", animate(zoom, to, springs.snap));
  };

  /** Reports a new value from the gesture or key that made it. */
  const commit = (next: number) => {
    if (next === reported.current) return false;
    reported.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    return true;
  };

  const tick = (next: number, coarse: boolean, pan = 0) => {
    const span = hi - lo || 1;
    audio.play("tick", {
      pitch: r2(coarse ? 0.78 : 0.95 + ((next - lo) / span) * 0.3),
      gain: coarse ? 0.5 : 0.34,
      pan,
    });
  };

  const flagInvalid = (shakeIt: boolean) => {
    setInvalid(true);
    window.clearTimeout(timers.current.invalid);
    timers.current.invalid = window.setTimeout(() => setInvalid(false), 900);
    if (shakeIt && motionSafe) {
      // Three or more keyframes: a tween, never a spring.
      run(
        "shake",
        animate(shake, [0, -5, 5, -3, 0], { duration: 0.32, ease: "easeOut" }),
      );
    }
  };

  /** Typed text becomes a value: clamped, on the grid, at the precision. */
  const commitDraft = () => {
    const text = draft
      .trim()
      .replace(/,/g, ".")
      .replace(/[^\d.eE+-]/g, "");
    const n = Number(text);
    setEditing(false);
    if (text === "" || !Number.isFinite(n)) {
      flagInvalid(true);
      return;
    }
    const next = snap(n, grid);
    if (n < lo || n > hi) flagInvalid(false);
    // What was typed is already on screen: the wheels take it without a roll.
    jumpNext.current = commit(next);
    halt("tape");
    tape.jump(next);
  };

  const selectSoon = () => {
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input && document.activeElement === input) input.select();
    });
  };

  const stepTo = (next: number, coarse: boolean) => {
    if (disabled) return;
    showRuler();
    setZoom(coarse ? 10 : 1);
    if (commit(next)) tick(next, coarse);
    hideRuler(900);
  };

  const finishScrub = (velocity: number) => {
    const s = scrub.current;
    if (!s.active) return;
    s.active = false;
    const target = reported.current;
    const ppv = pxPerStep / (grid * s.gear);
    if (motionSafe) {
      // The release velocity is capped: the tape nods past and settles, it
      // does not coast — a field's value has no momentum.
      const v = clamp(velocity, -600, 600) / ppv;
      run("tape", animate(tape, target, { ...springs.snap, velocity: v }));
    } else {
      halt("tape");
      tape.jump(target);
    }
    setScrubbing(false);
    setGear(1);
    onScrubChange?.(false, 1);
    hideRuler(700);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: ({ event }) => {
      if (editing) commitDraft();
      const s = scrub.current;
      s.active = true;
      s.raw = reported.current;
      s.gear = 1;
      s.speed = 0;
      s.last = event.timeStamp;
      s.pinned = false;
      suppressClick.current = true;
      halt("tape");
      tape.jump(s.raw);
      showRuler();
      setZoom(1);
      setScrubbing(true);
      setGear(1);
      onScrubChange?.(true, 1);
    },
    onMove: ({ delta, event, point }) => {
      const s = scrub.current;
      if (!s.active) return;
      const dt = Math.max(1, event.timeStamp - s.last);
      s.last = event.timeStamp;
      // Speed is a time-weighted average, so a pause lets it fall away.
      const k = Math.exp(-dt / 50);
      s.speed = s.speed * k + (Math.abs(delta.x) / dt) * 1000 * (1 - k);
      let next = s.gear;
      if (accelerate) {
        const long = (hi - lo) / grid >= 1000;
        if (next === 1 && s.speed > UP_10) next = 10;
        if (next === 10 && long && s.speed > UP_100) next = 100;
        if (next === 100 && s.speed < UP_100 * KEEP) next = 10;
        if (next === 10 && s.speed < UP_10 * KEEP) next = 1;
      } else next = 1;
      if (event.shiftKey) next = Math.max(next, 10);
      if (next !== s.gear) {
        s.gear = next;
        setGear(next);
        setZoom(next);
        onScrubChange?.(true, next);
      }
      const ppv = pxPerStep / (grid * s.gear);
      s.raw += delta.x / ppv;
      const over = s.raw > hi ? s.raw - hi : s.raw < lo ? s.raw - lo : 0;
      tape.set(
        over === 0
          ? s.raw
          : (over > 0 ? hi : lo) + rubberband(over * ppv, 64) / ppv,
      );
      const pan = panFrom(point.x, labelRef.current);
      const reading = snap(s.raw, grid * s.gear);
      if (commit(reading)) tick(reading, s.gear > 1, pan);
      if (over !== 0 && !s.pinned) {
        s.pinned = true;
        audio.play("tick", { pitch: 0.55, gain: 0.55, pan });
      } else if (over === 0) s.pinned = false;
    },
    onEnd: ({ velocity }) => finishScrub(velocity.x),
    onCancel: () => finishScrub(0),
  });

  // The wheels follow the value, whoever changed it; a typed value or a new
  // precision is already on screen, so those jump.
  React.useEffect(() => {
    const was = shown.current;
    if (was.value === current && was.scale === scale) return;
    const jump = !motionSafe || jumpNext.current || was.scale !== scale;
    jumpNext.current = false;
    shown.current = { value: current, scale };
    const target = Math.round(current * scale);
    if (jump) {
      halt("odo");
      odo.jump(target);
    } else {
      run("odo", animate(odo, target, springs.snap));
    }
    if (scrub.current.active) return;
    reported.current = current;
    if (rulerOn.current && motionSafe) {
      run("tape", animate(tape, current, springs.snap));
    } else {
      halt("tape");
      tape.jump(current);
    }
  }, [current, scale, motionSafe, halt, run, odo, tape]);

  // Typing replaces a selected value: after a step in display mode, the new
  // value is selected again.
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!editing && input && document.activeElement === input) input.select();
  }, [current, editing]);

  React.useEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    const ro = new ResizeObserver(() =>
      setLabelWidth(Math.ceil(label.getBoundingClientRect().width)),
    );
    ro.observe(label);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    const t = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      window.clearTimeout(t.hide);
      window.clearTimeout(t.invalid);
    };
  }, []);

  const unitRef = React.useCallback((node: HTMLSpanElement | null) => {
    if (!node) return;
    const measure = () => setUnitWidth(node.getBoundingClientRect().width);
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const boxRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      boxWidth.set(node.getBoundingClientRect().width);
      const ro = new ResizeObserver(() =>
        boxWidth.set(node.getBoundingClientRect().width),
      );
      ro.observe(node);
      return () => ro.disconnect();
    },
    [boxWidth],
  );

  const rulerHeight = Math.round(g.tick * 1.3) + 1;
  const paths = useTransform(
    [tape, zoom, reveal, boxWidth] as MotionValue<number>[],
    ([t = 0, z = 1, rv = 0, w = 0]: number[]) =>
      buildRuler(t, z, rv, w - 2, {
        lo,
        hi,
        step: grid,
        pxPerStep,
        tick: g.tick,
        base: rulerHeight,
      }),
  );
  const fineD = useTransform(paths, (p) => p.fine);
  const midD = useTransform(paths, (p) => p.mid);
  const majorD = useTransform(paths, (p) => p.major);
  const fineAlpha = useTransform(paths, (p) => p.alpha);
  const rulerOpacity = useTransform(reveal, (r) => r2(clamp01(r)));
  const lift = useTransform(reveal, (r) =>
    motionSafe ? r2(-1.5 * clamp01(r)) : 0,
  );

  const intDigits = Math.max(
    1,
    String(Math.floor(Math.max(Math.abs(lo), Math.abs(hi)))).length,
  );
  const wheels = intDigits + places;
  const spoken = valueText
    ? valueText(current)
    : `${format(current)}${unit ? ` ${unit}` : ""}`;

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    const key = event.key;
    const base = () => {
      if (!editing) return reported.current;
      commitDraft();
      return reported.current;
    };
    if (key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      const from = base();
      const n = (key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
      stepTo(snap(from + n * grid, grid), event.shiftKey);
      return;
    }
    if (key === "PageUp" || key === "PageDown") {
      event.preventDefault();
      const from = base();
      stepTo(snap(from + (key === "PageUp" ? 10 : -10) * grid, grid), true);
      return;
    }
    if ((key === "Home" || key === "End") && !editing) {
      event.preventDefault();
      stepTo(key === "Home" ? lo : hi, true);
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      if (editing) {
        commitDraft();
        selectSoon();
      } else {
        setDraft(format(current));
        setEditing(true);
        selectSoon();
      }
      return;
    }
    if (key === "Escape" && editing) {
      // Handled here, where focus is; the stage must not also see it.
      event.preventDefault();
      setEditing(false);
      selectSoon();
    }
  };

  return (
    <motion.div
      ref={boxRef}
      className={cn("relative w-full", className)}
      style={{ height: g.height, x: shake }}
    >
      <span id={hintId} className="sr-only">
        Drag the label sideways to scrub. Arrow keys step, Shift steps ten.
      </span>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        role="spinbutton"
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={current}
        aria-valuetext={spoken}
        aria-describedby={hintId}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={editing ? draft : format(current)}
        onChange={(event) => {
          const text = event.currentTarget.value;
          setDraft(text);
          setEditing(true);
        }}
        onPointerDown={() => {
          pointerFocus.current = true;
          if (!editing && document.activeElement === inputRef.current) {
            setDraft(format(current));
            setEditing(true);
          }
        }}
        onFocus={() => {
          // A click on the number places a caret; keyboard focus (or a tap on
          // the label) selects the value so typing replaces it.
          if (pointerFocus.current) {
            setDraft(format(current));
            setEditing(true);
          } else {
            setEditing(false);
            selectSoon();
          }
          pointerFocus.current = false;
        }}
        onBlur={() => {
          pointerFocus.current = false;
          if (editing) commitDraft();
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 block h-full w-full rounded-2 border bg-surface-2/60 text-right font-mono tabular-nums transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          invalid
            ? "border-warn"
            : scrubbing
              ? "border-ink-3/60"
              : "border-hairline-strong",
          editing
            ? "text-foreground caret-cobalt-bright"
            : "text-transparent caret-transparent selection:bg-transparent",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-text",
        )}
        style={{
          fontSize: g.font,
          lineHeight: `${g.line}px`,
          paddingLeft: labelWidth + 4,
          paddingRight: g.pad + (unit ? unitWidth + unitGap : 0),
        }}
      />

      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-px flex items-center font-mono tabular-nums",
          disabled ? "text-ink-3" : "text-foreground",
        )}
        style={{
          y: lift,
          paddingRight: g.pad,
          fontSize: g.font,
          lineHeight: `${g.line}px`,
        }}
      >
        <span className={cn("flex items-center", editing && "opacity-0")}>
          {lo < 0 ? <Sign odo={odo} line={g.line} /> : null}
          {Array.from({ length: wheels }, (_, i) => {
            const k = wheels - 1 - i;
            return (
              <React.Fragment key={k}>
                <Wheel odo={odo} k={k} line={g.line} lead={k > places} />
                {places > 0 && k === places ? (
                  <span className="inline-block w-[1ch] shrink-0 text-center">
                    .
                  </span>
                ) : null}
              </React.Fragment>
            );
          })}
        </span>
        {unit ? (
          <span
            ref={unitRef}
            className="shrink-0 text-ink-3"
            style={{ marginLeft: unitGap }}
          >
            {unit}
          </span>
        ) : null}
      </motion.span>

      {ruler ? (
        <motion.svg
          aria-hidden
          className="pointer-events-none absolute inset-x-px bottom-px block overflow-visible"
          height={rulerHeight}
          style={{
            width: "calc(100% - 2px)",
            opacity: rulerOpacity,
            maskImage:
              "linear-gradient(90deg, transparent, black 22%, black 78%, transparent)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent, black 22%, black 78%, transparent)",
          }}
        >
          <motion.path
            d={fineD}
            className="stroke-ink-3"
            strokeWidth={1}
            shapeRendering="crispEdges"
            style={{ opacity: fineAlpha }}
          />
          <motion.path
            d={midD}
            className="stroke-ink-3"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          <motion.path
            d={majorD}
            className="stroke-ink-2"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          <line
            x1="50%"
            x2="50%"
            y1={0}
            y2={rulerHeight}
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{ stroke: accent }}
          />
        </motion.svg>
      ) : null}

      <label
        ref={labelRef}
        htmlFor={inputId}
        {...drag}
        onPointerDown={(event) => {
          suppressClick.current = false;
          drag.onPointerDown(event);
        }}
        // Pressing the label never takes focus from where it is, nor starts a
        // text selection; a tap still focuses the field through the label.
        onMouseDown={(event) => event.preventDefault()}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") peekRuler(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") peekRuler(false);
        }}
        onClick={(event) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.preventDefault();
        }}
        className={cn(
          "absolute inset-y-0 left-px z-10 flex items-center gap-1.5 pr-2 select-none",
          g.text,
          disabled
            ? "cursor-not-allowed text-ink-3"
            : cn(
                "cursor-ew-resize touch-pan-y",
                scrubbing
                  ? "text-foreground"
                  : "text-ink-2 hover:text-foreground",
              ),
        )}
        style={{ paddingLeft: g.pad - 2 }}
      >
        <MoveHorizontal
          aria-hidden
          className={cn("shrink-0 transition-colors", g.icon)}
          style={{ color: scrubbing ? accent : undefined }}
        />
        <span className="truncate">{label}</span>
        <motion.span
          aria-hidden
          className="inline-block shrink-0 rounded-1 bg-cobalt-wash px-1 font-mono text-[10px] leading-4 text-cobalt-bright tabular-nums"
          initial={false}
          animate={{ opacity: gear > 1 ? 1 : 0, scale: gear > 1 ? 1 : 0.7 }}
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
        >
          ×{gear > 1 ? gear : 10}
        </motion.span>
      </label>
    </motion.div>
  );
}
