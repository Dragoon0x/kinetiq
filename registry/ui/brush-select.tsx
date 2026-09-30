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
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useDrag, type DragInfo } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BrushSelectItem = { id: string; label: string };
export type BrushSelectMode = "set" | "toggle";
export type BrushSelectLayout = "wrap" | "grid";

export type BrushSelectProps = {
  items: BrushSelectItem[];
  /** The chip set's accessible name. */
  label: string;
  /** Controlled selection: the selected ids. */
  value?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires on the release of a stroke, on a tap and on each key, with the new selection in item order. */
  onValueChange?: (value: string[]) => void;
  /** Paint the first chip's new state onto every chip passed, or flip each one. @default "set" */
  mode?: BrushSelectMode;
  /** Pills in wrapping rows, or equal cells in a grid. @default "wrap" */
  layout?: BrushSelectLayout;
  /** A round indicator that fills and draws a check when a chip turns on. @default true */
  check?: boolean;
  /** A tick per chip painted, climbing a scale through the stroke. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
/** The edge the paint comes in from. */
type From = "left" | "right" | "top" | "bottom" | "centre";
type Mark = { from: From; pulse: number; delay: number };

type Stroke = {
  /** The paint, once the first chip has decided it; unused when toggling. */
  brush: boolean | null;
  base: string[];
  state: Map<string, boolean>;
  painted: Set<string>;
  last: Pt | null;
  /** Chips passed so far: the step of the scale. */
  count: number;
};

type KeySweep = { brush: boolean; count: number };

/** A pentatonic climb, an octave at most, one step per chip painted. */
const STEPS = [0, 2, 4, 7, 9, 12];
/** A stroke is sampled this often along its path, so a flick misses nothing. */
const SAMPLE = 4;
/** The dip a chip takes as the brush passes, as a starting speed in scale/s. */
const IMPULSE = -2.2;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const keyOf = (ids: string[]) => ids.join("\u0000");
const NO_MARK: Mark = { from: "centre", pulse: 0, delay: 0 };
const SHOWN = { top: 0, right: 0, bottom: 0, left: 0 };

/** Where the on face starts hidden when paint comes in from `from`. */
const hiddenFrom = (from: From) => ({
  top: from === "bottom" ? 100 : 0,
  right: from === "left" ? 100 : from === "centre" ? 50 : 0,
  bottom: from === "top" ? 100 : 0,
  left: from === "right" ? 100 : from === "centre" ? 50 : 0,
});

/** Where it goes when paint is wiped off travelling away from `from`. */
const erasedFrom = (from: From) => ({
  top: from === "top" ? 100 : 0,
  right: from === "right" ? 100 : from === "centre" ? 50 : 0,
  bottom: from === "bottom" ? 100 : 0,
  left: from === "left" ? 100 : from === "centre" ? 50 : 0,
});

const fromDelta = (dx: number, dy: number): From =>
  Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0
      ? "left"
      : "right"
    : dy >= 0
      ? "top"
      : "bottom";

const FROM_KEY: Record<string, From> = {
  ArrowRight: "left",
  ArrowLeft: "right",
  ArrowDown: "top",
  ArrowUp: "bottom",
  End: "left",
  Home: "right",
};

/** The on face's indicator: a check drawn by `drawn`, 0 to 1. */
function Check({ drawn }: { drawn: MotionValue<number> }) {
  // A round cap at zero length is a dot; the stroke only shows once it runs.
  const opacity = useTransform(drawn, [0, 0.12], [0, 1]);
  return (
    <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-primary-foreground text-primary">
      <svg aria-hidden viewBox="0 0 14 14" className="size-3.5">
        <motion.path
          d="M4 7.3l2.1 2.1 4-4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pathLength: drawn, opacity }}
        />
      </svg>
    </span>
  );
}

type ChipProps = {
  item: BrushSelectItem;
  on: boolean;
  mark: Mark;
  pressed: boolean;
  check: boolean;
  layout: BrushSelectLayout;
  motionSafe: boolean;
  focusable: boolean;
  disabled: boolean;
  register: (id: string, node: HTMLDivElement | null) => void;
  onFocus: (id: string) => void;
};

/**
 * One chip: an off face in the flow and a whole on face laid over it,
 * shown through a clip. Paint is the clip travelling across the chip in
 * the direction the brush came from — a clip is a tween — and the brush's
 * pressure is an impulse on a spring: the chip is started at rest with a
 * downward speed, dips and comes back.
 */
function Chip({
  item,
  on,
  mark,
  pressed,
  check,
  layout,
  motionSafe,
  focusable,
  disabled,
  register,
  onFocus,
}: ChipProps) {
  const top = useMotionValue(0);
  const right = useMotionValue(on ? 0 : 100);
  const bottom = useMotionValue(0);
  const left = useMotionValue(0);
  const faceOpacity = useMotionValue(1);
  const drawn = useMotionValue(on ? 1 : 0);
  const scale = useMotionValue(1);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const shownOn = React.useRef(on);
  const pulseSeen = React.useRef(mark.pulse);
  const round = layout === "grid" ? "6px" : "999px";

  const clip = useTransform(
    [top, right, bottom, left] as MotionValue<number>[],
    ([t, r, b, l]) =>
      `inset(${r2(t as number)}% ${r2(r as number)}% ${r2(b as number)}% ${r2(l as number)}% round ${round})`,
  );

  const insets = React.useCallback(
    (v: { top: number; right: number; bottom: number; left: number }) => {
      top.set(v.top);
      right.set(v.right);
      bottom.set(v.bottom);
      left.set(v.left);
    },
    [bottom, left, right, top],
  );

  // A change of reduced-motion mid-life puts the face straight into the
  // representation that mode uses: a clip under full motion, opacity under
  // reduced.
  React.useEffect(() => {
    for (const c of runs.current) c.stop();
    runs.current = [];
    drawn.set(shownOn.current ? 1 : 0);
    if (motionSafe) {
      faceOpacity.set(1);
      insets(shownOn.current ? SHOWN : hiddenFrom("left"));
    } else {
      insets(SHOWN);
      faceOpacity.set(shownOn.current ? 1 : 0);
    }
  }, [drawn, faceOpacity, insets, motionSafe]);

  React.useEffect(() => {
    if (shownOn.current === on) return;
    shownOn.current = on;
    for (const c of runs.current) c.stop();
    runs.current = [];
    // A run from the keyboard lands chip by chip; a change that came with
    // no fresh mark (the host's answer) lands now.
    const delay = pulseSeen.current === mark.pulse ? 0 : mark.delay;
    if (!motionSafe) {
      runs.current.push(
        animate(faceOpacity, on ? 1 : 0, {
          duration: durations.fast,
          ease: easings.enter,
          delay,
        }),
        animate(drawn, on ? 1 : 0, { duration: 0, delay }),
      );
      return;
    }
    // The check draws once the wipe has uncovered it, on the flick.
    runs.current.push(
      animate(drawn, on ? 1 : 0, {
        ...springs.flick,
        delay: on ? delay + 0.1 : delay,
      }),
    );
    const tween = { duration: durations.base, ease: easings.enter, delay };
    const target = on ? SHOWN : erasedFrom(mark.from);
    if (on) insets(hiddenFrom(mark.from));
    runs.current.push(
      animate(top, target.top, tween),
      animate(right, target.right, tween),
      animate(bottom, target.bottom, tween),
      animate(left, target.left, tween),
    );
  }, [
    bottom,
    drawn,
    faceOpacity,
    insets,
    left,
    mark.delay,
    mark.from,
    mark.pulse,
    motionSafe,
    on,
    right,
    top,
  ]);

  // The brush passing: a dip that springs back.
  React.useEffect(() => {
    if (pulseSeen.current === mark.pulse) return;
    pulseSeen.current = mark.pulse;
    if (!motionSafe) return;
    if (mark.delay === 0) scale.set(Math.min(scale.get(), 0.99));
    runs.current.push(
      animate(scale, 1, {
        ...springs.snap,
        velocity: IMPULSE,
        delay: mark.delay,
      }),
    );
  }, [mark.delay, mark.pulse, motionSafe, scale]);

  // Held under the finger before a stroke begins, the chip sits down.
  React.useEffect(() => {
    if (!motionSafe) return;
    const run = animate(
      scale,
      pressed ? 0.95 : 1,
      pressed ? springs.flick : springs.snap,
    );
    return () => run.stop();
  }, [motionSafe, pressed, scale]);

  React.useEffect(
    () => () => {
      for (const c of runs.current) c.stop();
    },
    [],
  );

  const shape =
    layout === "grid"
      ? "h-9 w-full justify-center rounded-2"
      : "h-8 rounded-full";
  const face = cn(
    "flex items-center gap-1.5 border px-3 text-[13px] leading-none whitespace-nowrap",
    shape,
  );

  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => register(item.id, node)}
      role="option"
      aria-selected={on}
      aria-disabled={disabled || undefined}
      tabIndex={focusable ? 0 : -1}
      data-brush-chip={item.id}
      onFocus={() => onFocus(item.id)}
      style={{ scale }}
      className={cn(
        "group/brush-select relative outline-none",
        layout === "grid"
          ? "flex w-full rounded-2"
          : "inline-flex rounded-full",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          face,
          "border-hairline-strong bg-surface-1 text-ink-2 transition-colors duration-150",
          !disabled &&
            "group-hover/brush-select:border-ink-3/60 group-hover/brush-select:text-foreground",
        )}
      >
        {check ? (
          <span className="size-3.5 shrink-0 rounded-full border border-current opacity-50" />
        ) : null}
        {item.label}
      </span>
      <motion.span
        aria-hidden
        className={cn(
          face,
          "absolute inset-0 border-primary bg-primary text-primary-foreground",
        )}
        style={{ clipPath: clip, opacity: faceOpacity }}
      >
        {check ? <Check drawn={drawn} /> : null}
        {item.label}
      </motion.span>
    </motion.div>
  );
}

/**
 * Chips you select by painting. A click still toggles one chip, but press
 * on a chip and drag and the press becomes a brush: the chip you started on
 * flips, its new state is the paint, and every chip the stroke passes is set
 * to it (`mode="set"`) or flips (`mode="toggle"`) — once per stroke, however
 * often the stroke crosses it. The paint wipes across each chip from the
 * side the brush came in, the chip dips under the bristles, and every chip
 * ticks a step higher up a scale than the last (a step lower when the paint
 * is taking chips off). The stroke is reported once, on release.
 *
 * It is a multi-select `role="listbox"`. Arrow keys move, Space or Enter
 * toggles the focused chip — the first dab of the brush — and Shift+Arrow
 * carries its state onto the next chip with the same wipe and the next tick
 * of the scale; Shift+Home/End paints a whole run and Cmd/Ctrl+A paints
 * everything. Under reduced motion the on face cross-fades instead of
 * wiping and nothing dips; the painting, the ticks and the result are the
 * same.
 */
export function BrushSelect({
  items,
  label,
  value,
  defaultValue,
  onValueChange,
  mode = "set",
  layout = "wrap",
  check = true,
  sound = false,
  disabled = false,
  className,
}: BrushSelectProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();

  const [own, setOwn] = React.useState<string[]>(() => defaultValue ?? []);
  const raw = value ?? own;
  const selected = React.useMemo(
    () => items.filter((it) => raw.includes(it.id)).map((it) => it.id),
    [items, raw],
  );
  const selectedKey = keyOf(selected);
  const [draft, setDraft] = React.useState<string[] | null>(null);
  const shown = draft ?? selected;

  const [marks, setMarks] = React.useState<Record<string, Mark>>({});
  const [pressed, setPressed] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const stop = items.find((it) => it.id === focusId)?.id ?? items[0]?.id;

  const [said, setSaid] = React.useState<{ key: string; text: string } | null>(
    null,
  );
  const spoken = said && said.key === selectedKey ? said.text : "";

  const [group, setGroup] = React.useState<HTMLDivElement | null>(null);
  const chips = React.useRef(new Map<string, HTMLDivElement>());
  const rects = React.useRef<Record<string, Rect>>({});
  const stroke = React.useRef<Stroke | null>(null);
  const sweep = React.useRef<KeySweep | null>(null);
  const timers = React.useRef<number[]>([]);

  const register = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) chips.current.set(id, node);
      else chips.current.delete(id);
    },
    [],
  );

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  /** Chip boxes from layout, so a dipping chip never moves its hit box. */
  const measure = () => {
    const next: Record<string, Rect> = {};
    for (const it of items) {
      const el = chips.current.get(it.id);
      if (!el) continue;
      next[it.id] = {
        x: el.offsetLeft,
        y: el.offsetTop,
        w: el.offsetWidth,
        h: el.offsetHeight,
      };
    }
    rects.current = next;
  };

  const local = (clientX: number, clientY: number): Pt => {
    if (!group) return { x: 0, y: 0 };
    const r = group.getBoundingClientRect();
    const sx = group.offsetWidth > 0 ? r.width / group.offsetWidth : 1;
    const sy = group.offsetHeight > 0 ? r.height / group.offsetHeight : 1;
    return {
      x: (clientX - r.left) / (sx || 1),
      y: (clientY - r.top) / (sy || 1),
    };
  };

  const panOf = (id: string) => {
    const box = rects.current[id];
    if (!group || !box) return 0;
    const r = group.getBoundingClientRect();
    const sx = group.offsetWidth > 0 ? r.width / group.offsetWidth : 1;
    return panFrom(r.left + (box.x + box.w / 2) * sx, group);
  };

  const chipAt = (p: Pt): string | null => {
    for (const it of items) {
      const b = rects.current[it.id];
      if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
        return it.id;
    }
    return null;
  };

  /** One step of the scale: up for paint going on, down for paint coming off. */
  const tick = (id: string, step: number, on: boolean, changed = true) => {
    const n = STEPS[Math.min(step, STEPS.length - 1)] ?? 0;
    audio.play("tick", {
      pitch: r3(0.72 * semitones(on ? n : -n)),
      gain: changed ? 0.32 : 0.14,
      pan: panOf(id),
    });
  };

  const say = (next: string[]) =>
    setSaid({
      key: keyOf(next),
      text:
        next.length === 0
          ? "None selected"
          : `${next.length} of ${items.length} selected`,
    });

  const commit = (next: string[]) => {
    const ordered = items
      .filter((it) => next.includes(it.id))
      .map((it) => it.id);
    say(ordered);
    if (keyOf(ordered) === selectedKey) return;
    if (value === undefined) setOwn(ordered);
    onValueChange?.(ordered);
  };

  const markAll = (changes: { id: string; from: From; delay: number }[]) =>
    setMarks((prev) => {
      const next = { ...prev };
      for (const c of changes) {
        const was = prev[c.id] ?? NO_MARK;
        next[c.id] = { from: c.from, pulse: was.pulse + 1, delay: c.delay };
      }
      return next;
    });

  /** Paints every chip the segment from `a` to `b` crosses, in order. */
  const paintAlong = (s: Stroke, a: Pt, b: Pt) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SAMPLE));
    const from = fromDelta(dx, dy);
    const changes: { id: string; from: From; delay: number }[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const id = chipAt({
        x: a.x + (dx * i) / steps,
        y: a.y + (dy * i) / steps,
      });
      if (!id || s.painted.has(id)) continue;
      s.painted.add(id);
      const was = s.base.includes(id);
      if (mode === "set" && s.brush === null) s.brush = !was;
      const next = mode === "toggle" ? !was : (s.brush ?? !was);
      s.state.set(id, next);
      tick(id, s.count, next, next !== was);
      s.count += 1;
      changes.push({ id, from, delay: 0 });
    }
    if (changes.length === 0) return;
    markAll(changes);
    setDraft(
      items
        .filter((it) => s.state.get(it.id) ?? s.base.includes(it.id))
        .map((it) => it.id),
    );
  };

  const beginStroke = (info: DragInfo) => {
    if (disabled) return;
    setPressed(null);
    sweep.current = null;
    clearTimers();
    measure();
    const start = local(
      info.point.x - info.offset.x,
      info.point.y - info.offset.y,
    );
    const s: Stroke = {
      brush: null,
      base: selected,
      state: new Map(),
      painted: new Set(),
      last: start,
      count: 0,
    };
    stroke.current = s;
    paintAlong(s, start, local(info.point.x, info.point.y));
    s.last = local(info.point.x, info.point.y);
  };

  const moveStroke = (info: DragInfo) => {
    const s = stroke.current;
    if (!s) return;
    const p = local(info.point.x, info.point.y);
    paintAlong(s, s.last ?? p, p);
    s.last = p;
  };

  const endStroke = (cancelled: boolean) => {
    const s = stroke.current;
    if (!s) return;
    stroke.current = null;
    setDraft(null);
    if (cancelled || s.painted.size === 0) return;
    commit(
      items
        .filter((it) => s.state.get(it.id) ?? s.base.includes(it.id))
        .map((it) => it.id),
    );
  };

  const flip = (id: string, from: From) => {
    const on = !selected.includes(id);
    measure();
    tick(id, 0, on);
    markAll([{ id, from, delay: 0 }]);
    commit(on ? [...selected, id] : selected.filter((s) => s !== id));
    return on;
  };

  const drag = useDrag({
    disabled,
    onStart: beginStroke,
    onMove: moveStroke,
    onEnd: () => endStroke(false),
    onCancel: () => endStroke(true),
    onTap: (event) => {
      setPressed(null);
      if (disabled) return;
      const el =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-brush-chip]")
          : null;
      const id = el?.dataset.brushChip;
      if (!id) return;
      sweep.current = null;
      flip(id, "centre");
    },
  });

  // Escape takes back a stroke in flight wherever focus is, and claims the
  // key so the page does not also act on it.
  const cancelRef = React.useRef(() => {});
  React.useEffect(() => {
    cancelRef.current = () => endStroke(true);
  });
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !stroke.current) return;
      event.preventDefault();
      cancelRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const focusChip = (id: string) => {
    setFocusId(id);
    chips.current.get(id)?.focus();
  };

  /** The nearest chip in the row above or below, by centre. */
  const vertical = (id: string, down: boolean): string | null => {
    const here = rects.current[id];
    if (!here) return null;
    const rows = items
      .map((it) => rects.current[it.id]?.y)
      .filter((y): y is number => y !== undefined)
      .filter((y) => (down ? y > here.y + 2 : y < here.y - 2));
    if (rows.length === 0) return null;
    const row = down ? Math.min(...rows) : Math.max(...rows);
    const cx = here.x + here.w / 2;
    let best: string | null = null;
    let gap = Infinity;
    for (const it of items) {
      const b = rects.current[it.id];
      if (!b || Math.abs(b.y - row) > 2) continue;
      const d = Math.abs(b.x + b.w / 2 - cx);
      if (d < gap) {
        gap = d;
        best = it.id;
      }
    }
    return best;
  };

  /** A painted run from the keyboard: each wipe and its tick on one beat. */
  const run = (
    ids: string[],
    brush: boolean,
    from: From,
    startStep: number,
  ) => {
    clearTimers();
    const beat = cascade(ids.length);
    const next = new Set(selected);
    const changes: { id: string; from: From; delay: number }[] = [];
    ids.forEach((id, i) => {
      const was = next.has(id);
      const on = mode === "toggle" ? !was : brush;
      if (on) next.add(id);
      else next.delete(id);
      const delay = r3(i * beat);
      changes.push({ id, from, delay });
      const play = () => tick(id, startStep + i, on, on !== was);
      if (delay === 0) play();
      else
        timers.current.push(window.setTimeout(play, Math.round(delay * 1000)));
    });
    markAll(changes);
    commit([...next]);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented || stroke.current) return;
    const el =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-brush-chip]")
        : null;
    const id = el?.dataset.brushChip;
    const i = items.findIndex((it) => it.id === id);
    if (!id || i < 0) return;
    const { key } = event;
    measure();

    if (key === " " || key === "Enter") {
      event.preventDefault();
      if (disabled || event.repeat) return;
      const on = flip(id, "centre");
      sweep.current = { brush: on, count: 1 };
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "a") {
      event.preventDefault();
      if (disabled) return;
      const all = items.map((it) => it.id);
      const fill = selected.length < items.length;
      run(
        all.filter((x) => selected.includes(x) !== fill),
        fill,
        "left",
        0,
      );
      sweep.current = null;
      return;
    }

    let to: string | null = null;
    if (key === "ArrowRight") to = items[i + 1]?.id ?? null;
    else if (key === "ArrowLeft") to = items[i - 1]?.id ?? null;
    else if (key === "ArrowDown") to = vertical(id, true);
    else if (key === "ArrowUp") to = vertical(id, false);
    else if (key === "Home") to = items[0]?.id ?? null;
    else if (key === "End") to = items[items.length - 1]?.id ?? null;
    else return;
    event.preventDefault();
    if (!to || to === id) return;
    focusChip(to);
    if (!event.shiftKey || disabled) {
      sweep.current = null;
      return;
    }
    const s = sweep.current ?? { brush: selected.includes(id), count: 1 };
    sweep.current = s;
    const from = FROM_KEY[key] ?? "left";
    if (key === "Home" || key === "End") {
      const j = items.findIndex((it) => it.id === to);
      const span =
        j > i ? items.slice(i + 1, j + 1) : items.slice(j, i).reverse();
      run(
        span.map((it) => it.id),
        s.brush,
        from,
        s.count,
      );
      s.count += span.length;
      return;
    }
    const was = selected.includes(to);
    const on = mode === "toggle" ? !was : s.brush;
    tick(to, s.count, on, on !== was);
    s.count += 1;
    markAll([{ id: to, from, delay: 0 }]);
    commit(on ? [...selected, to] : selected.filter((x) => x !== to));
  };

  const handlers = {
    ...drag,
    onPointerDown: (event: React.PointerEvent) => {
      drag.onPointerDown(event);
      if (disabled || (event.pointerType === "mouse" && event.button !== 0))
        return;
      const el =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-brush-chip]")
          : null;
      setPressed(el?.dataset.brushChip ?? null);
    },
    onPointerUp: (event: React.PointerEvent) => {
      drag.onPointerUp(event);
      setPressed(null);
    },
    onPointerCancel: (event: React.PointerEvent) => {
      drag.onPointerCancel(event);
      setPressed(null);
    },
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={setGroup}
        role="listbox"
        aria-multiselectable="true"
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        {...handlers}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key === "Shift") sweep.current = null;
        }}
        className={cn(
          "relative touch-none select-none",
          layout === "grid"
            ? "grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2"
            : "flex flex-wrap gap-2",
        )}
      >
        {items.map((it) => (
          <Chip
            key={it.id}
            item={it}
            on={shown.includes(it.id)}
            mark={marks[it.id] ?? NO_MARK}
            pressed={pressed === it.id}
            check={check}
            layout={layout}
            motionSafe={motionSafe}
            focusable={it.id === stop}
            disabled={disabled}
            register={register}
            onFocus={setFocusId}
          />
        ))}
      </div>
      <span id={hintId} className="sr-only">
        Space toggles a chip. Shift with an arrow key paints its state onto the
        next chip; Shift with Home or End paints to the end. Control or Command
        A paints every chip.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
