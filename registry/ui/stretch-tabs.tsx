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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StretchTabsItem = {
  /** Reported by onValueChange; unique within the control. */
  value: string;
  /** What the segment shows. */
  label: React.ReactNode;
  /** The segment's accessible name when its label is terse ("1M" → "1 month"). */
  ariaLabel?: string;
  /** The id of the panel this tab shows (tablist semantics). */
  controls?: string;
  disabled?: boolean;
};

export type StretchTabsSize = "sm" | "md" | "lg";

export type StretchTabsProps = {
  /** The segments, in order. */
  items: StretchTabsItem[];
  /** Controlled selected value. */
  value?: string;
  /** Initial value when uncontrolled. @default the first item */
  defaultValue?: string;
  /** Fires from the press, key or drag that changed it, with the new value. */
  onValueChange?: (value: string) => void;
  /** The control's accessible name. */
  label: string;
  /** How many of the items are shown, from the first. @default all of them */
  segments?: number;
  /** The rubber, 0 to 1: rigid (one spring, no stretch) to very elastic. @default 0.5 */
  elastic?: number;
  /** @default "md" */
  size?: StretchTabsSize;
  /** Tabs that show panels, or a radio group that picks a value. @default "tablist" */
  semantics?: "tablist" | "radiogroup";
  /** Arrow keys select as they move ("auto"), or only move focus ("manual"). @default "auto" */
  activation?: "auto" | "manual";
  /** The pill can be dragged along the track. @default true */
  draggable?: boolean;
  /** The pill's colour, any CSS colour. @default "var(--foreground)" */
  pill?: string;
  /** The selected label's colour, on the pill. @default "var(--background)" */
  pillText?: string;
  /** A tick on every change and every segment a drag crosses. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = { height: number; text: string; pad: string };

const SIZES: Record<StretchTabsSize, Geometry> = {
  sm: { height: 32, text: "text-xs", pad: "min-w-9 px-2" },
  md: { height: 36, text: "text-[13px]", pad: "min-w-10 px-2.5" },
  lg: { height: 44, text: "text-sm", pad: "min-w-11 px-3" },
};

/** The track's inner padding around the pill, in px. */
const PAD = 3;
/** The shortest a pill squashed against an end gets, in segments. */
const MIN_LENGTH = 0.62;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** A length along the track's inner width, `units` segments of `n`. */
const along = (units: number, n: number) =>
  `(100% - ${2 * PAD}px) * ${r3(units)} / ${n}`;

/**
 * A segmented control whose pill is made of rubber. Choosing another segment
 * does not slide the pill as one piece: its two edges are separate springs.
 * The leading edge reaches out first and lands with a slight overshoot; the
 * trailing edge holds for a beat, then lets go on a softer spring, dragged
 * along once the pill is stretched as far as it will go. The pill thins as
 * it stretches, and the selected label's colour is a copy of the labels
 * clipped to the pill's exact shape, so the change sweeps across each letter
 * with the rubber edge. `elastic` is the material, from rigid to very soft.
 *
 * The pill can be dragged: its leading edge is 1:1 under the finger, its
 * trailing edge follows on a short spring, past either end it rubber-bands,
 * and a release projects the throw and snaps to the nearest segment with the
 * release velocity. Positions are segment units drawn with CSS calc() against
 * the track, so the server renders the pill exactly where it belongs and no
 * width is measured at rest.
 *
 * Tablist (with aria-controls) or radiogroup semantics, a roving tabindex,
 * arrows that move and wrap, Home and End. Under reduced motion the pill
 * moves in one piece, jumping to the new segment with a short fade-in.
 */
export function StretchTabs({
  items,
  value,
  defaultValue,
  onValueChange,
  label,
  segments,
  elastic = 0.5,
  size = "md",
  semantics = "tablist",
  activation = "auto",
  draggable = true,
  pill = "var(--foreground)",
  pillText = "var(--background)",
  sound = false,
  disabled = false,
  className,
}: StretchTabsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const g = SIZES[size] ?? SIZES.md;
  const shown = items.slice(
    0,
    Math.max(1, Math.round(segments ?? items.length)),
  );
  const n = Math.max(1, shown.length);
  const e = clamp01(elastic);
  const tabs = semantics === "tablist";

  const [own, setOwn] = React.useState(
    () => defaultValue ?? items[0]?.value ?? "",
  );
  const current = value ?? own;
  const index = shown.findIndex((it) => it.value === current);
  const [focusValue, setFocusValue] = React.useState(current);
  const rover =
    activation === "manual" && tabs
      ? shown.some((it) => it.value === focusValue)
        ? focusValue
        : current
      : current;

  const start = Math.max(0, index);
  const left = useMotionValue(start);
  const right = useMotionValue(start + 1);
  const dir = useMotionValue(0);
  const blink = useMotionValue(index >= 0 ? 1 : 0);

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const placed = React.useRef(index);
  const drag = React.useRef({
    mode: "none" as "none" | "pill" | "scrub",
    onPill: false,
    seg: 0,
    startC: 0,
    c: 0,
    detent: -1,
    suppress: false,
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const haltAll = () => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
  };

  const maxLength = 1 + lerp(0.5, 1.6, e);

  /** The pill's edges as drawn: the trailing one is dragged past maxLength. */
  const edges = (l: number, r: number, d: number) => {
    let a = l;
    let b = r;
    if (d > 0) a = Math.max(a, b - maxLength);
    else if (d < 0) b = Math.min(b, a + maxLength);
    // The track's ends are walls: an edge driven into one stops there and
    // the pill squashes against it instead of leaving the track.
    if (b > n) {
      a = Math.min(a + (b - n) * 0.6, n - MIN_LENGTH);
      b = n;
    }
    if (a < 0) {
      b = Math.max(b + a * 0.6, MIN_LENGTH);
      a = 0;
    }
    return [Math.min(a, b), Math.max(a, b)] as const;
  };

  /** Sends the pill to segment `to`, edges on their own springs. */
  const go = (to: number, velocity = 0) => {
    if (to < 0) return;
    placed.current = to;
    // A trailing edge that was being dragged along starts from where it is
    // drawn; an edge already free keeps its velocity.
    const [a, b] = edges(left.get(), right.get(), dir.get());
    if (Math.abs(a - left.get()) > 1e-3) left.jump(a);
    if (Math.abs(b - right.get()) > 1e-3) right.jump(b);
    if (!motionSafe) {
      haltAll();
      left.jump(to);
      right.jump(to + 1);
      blink.jump(0.6);
      run(
        "blink",
        animate(blink, 1, { duration: durations.fast, ease: easings.enter }),
      );
      return;
    }
    if (blink.get() < 1) {
      run(
        "blink",
        animate(blink, 1, { duration: durations.fast, ease: easings.enter }),
      );
    }
    const from = (a + b) / 2;
    const d = Math.sign(to + 0.5 - from);
    if (e < 0.02 || d === 0) {
      // Rigid: the indicator is one piece on the snap spring.
      run("left", animate(left, to, { ...springs.snap, velocity }));
      run("right", animate(right, to + 1, { ...springs.snap, velocity }));
      return;
    }
    dir.set(d);
    const lead = d > 0 ? right : left;
    const trail = d > 0 ? left : right;
    const leadTo = d > 0 ? to + 1 : to;
    const trailTo = d > 0 ? to : to + 1;
    run(
      d > 0 ? "right" : "left",
      animate(lead, leadTo, {
        ...spring(lerp(640, 480, e), lerp(0.83, 0.68, e)),
        velocity,
      }),
    );
    run(
      d > 0 ? "left" : "right",
      animate(trail, trailTo, {
        ...spring(lerp(640, 260, e), lerp(0.83, 0.9, e)),
        delay: lerp(0, 0.09, e),
        velocity: velocity * 0.4,
      }),
    );
  };

  const tick = (i: number) => {
    const node = buttons.current.get(shown[i]?.value ?? "");
    const rect = node?.getBoundingClientRect();
    audio.play("tick", {
      pitch: r2(0.9 + (i / Math.max(1, n - 1)) * 0.35),
      gain: 0.45,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  /** A choice made by the visitor: reported, then drawn. */
  const select = (i: number, velocity = 0) => {
    const item = shown[i];
    if (!item || item.disabled || disabled) {
      go(placed.current, velocity);
      return;
    }
    if (item.value !== current) {
      tick(i);
      if (value === undefined) setOwn(item.value);
      onValueChange?.(item.value);
    }
    setFocusValue(item.value);
    go(i, velocity);
  };

  // A value the host set, or a segment count that moved the selection.
  React.useEffect(() => {
    if (index === placed.current) return;
    if (index < 0) {
      placed.current = -1;
      run(
        "blink",
        animate(blink, 0, { duration: durations.fast, ease: easings.exit }),
      );
      return;
    }
    if (placed.current < 0) {
      left.jump(index);
      right.jump(index + 1);
      placed.current = index;
      run(
        "blink",
        animate(blink, 1, { duration: durations.fast, ease: easings.enter }),
      );
      return;
    }
    go(index);
    // `go` is rebuilt each render; the index is what this watches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const enabled = (i: number) => !!shown[i] && !shown[i]?.disabled;
  const step = (from: number, delta: number) => {
    for (let k = 1; k <= n; k += 1) {
      const i = (((from + delta * k) % n) + n) % n;
      if (enabled(i)) return i;
    }
    return from;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const from = Math.max(
      0,
      shown.findIndex((it) => it.value === rover),
    );
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      to = step(from, 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = step(from, -1);
    else if (event.key === "Home") to = step(-1, 1);
    else if (event.key === "End") to = step(n, -1);
    if (to < 0) return;
    event.preventDefault();
    const item = shown[to];
    if (!item) return;
    buttons.current.get(item.value)?.focus();
    if (activation === "manual" && tabs) setFocusValue(item.value);
    else select(to);
  };

  const gesture = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || !draggable,
    onStart: () => {
      const s = drag.current;
      const track = trackRef.current;
      if (!track) return;
      s.seg = Math.max(1, (track.clientWidth - 2 * PAD) / n);
      s.suppress = true;
      if (!s.onPill || index < 0) {
        s.mode = "scrub";
        return;
      }
      s.mode = "pill";
      haltAll();
      const [a, b] = edges(left.get(), right.get(), dir.get());
      left.jump(a);
      right.jump(b);
      s.startC = (a + b) / 2;
      s.c = s.startC;
      s.detent = Math.floor(s.startC);
    },
    onMove: ({ offset, delta }) => {
      const s = drag.current;
      if (s.mode !== "pill") return;
      const raw = s.startC + offset.x / s.seg;
      const lo = 0.5;
      const hi = n - 0.5;
      const c =
        raw < lo
          ? lo + rubberband((raw - lo) * s.seg, s.seg) / s.seg
          : raw > hi
            ? hi + rubberband((raw - hi) * s.seg, s.seg) / s.seg
            : raw;
      s.c = c;
      const d = delta.x > 0.3 ? 1 : delta.x < -0.3 ? -1 : dir.get();
      dir.set(d);
      // The edge the pull is heading for is under the finger; the other
      // follows on a short spring, so the pill stretches with the pull.
      const lead = d > 0 ? right : left;
      const trail = d > 0 ? left : right;
      lead.set(r3(c + (d > 0 ? 0.5 : -0.5)));
      const trailTo = r3(c + (d > 0 ? -0.5 : 0.5));
      if (motionSafe) {
        run("trail", animate(trail, trailTo, spring(lerp(1100, 380, e), 0.9)));
      } else trail.set(trailTo);
      const seg = clamp(Math.floor(c), 0, n - 1);
      if (seg !== s.detent) {
        s.detent = seg;
        tick(seg);
      }
    },
    onEnd: ({ velocity, point }) => {
      const s = drag.current;
      const track = trackRef.current;
      if (s.mode === "pill") {
        const v = velocity.x / s.seg;
        const landing = project(s.c, v, 0.99);
        let to = clamp(Math.round(landing - 0.5), 0, n - 1);
        if (!enabled(to)) to = placed.current;
        select(to, v);
      } else if (s.mode === "scrub" && track) {
        const rect = track.getBoundingClientRect();
        const at = Math.floor((point.x - rect.left - PAD) / s.seg);
        if (at >= 0 && at < n) select(at);
      }
      s.mode = "none";
    },
    onCancel: () => {
      const s = drag.current;
      if (s.mode === "pill") go(placed.current);
      s.mode = "none";
    },
  });

  const shape = useTransform(
    [left, right, dir] as MotionValue<number>[],
    ([l = 0, r = 1, d = 0]: number[]) => {
      const [a, b] = edges(l, r, d);
      const inner = g.height - 2 * PAD;
      const thin = Math.min(
        inner * 0.18,
        Math.max(0, b - a - 1) * inner * lerp(0.05, 0.13, e),
      );
      return { a, b, thin: motionSafe ? r2(thin) : 0 };
    },
  );
  const pillLeft = useTransform(
    shape,
    (s) => `calc(${PAD}px + ${along(s.a, n)})`,
  );
  const pillWidth = useTransform(shape, (s) => `calc(${along(s.b - s.a, n)})`);
  const pillInset = useTransform(shape, (s) => PAD + s.thin);
  const clip = useTransform(shape, (s) => {
    const y = r2(PAD + s.thin);
    return `inset(${y}px calc(${PAD}px + ${along(n - s.b, n)}) ${y}px calc(${PAD}px + ${along(s.a, n)}) round 999px)`;
  });

  const labelOf = (it: StretchTabsItem) => (
    <span className="pointer-events-none">{it.label}</span>
  );

  return (
    <div
      ref={trackRef}
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      aria-orientation={tabs ? "horizontal" : undefined}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(event) => {
        const s = drag.current;
        s.suppress = false;
        const track = trackRef.current;
        if (!track || index < 0) {
          s.onPill = false;
          return;
        }
        const rect = track.getBoundingClientRect();
        const seg = (rect.width - 2 * PAD) / n;
        const c = (event.clientX - rect.left - PAD) / seg;
        const [a, b] = edges(left.get(), right.get(), dir.get());
        s.onPill = c >= a - 0.05 && c <= b + 0.05;
      }}
      {...gesture}
      className={cn(
        "relative inline-grid auto-cols-fr grid-flow-col rounded-full bg-surface-2 select-none",
        draggable && !disabled && "touch-pan-y",
        disabled && "opacity-50",
        className,
      )}
      style={
        {
          height: g.height,
          padding: PAD,
          ["--stretch-pill" as string]: pill,
          ["--stretch-pill-text" as string]: pillText,
        } as React.CSSProperties
      }
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full border border-hairline"
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute z-[1] rounded-full bg-(--stretch-pill) shadow-[0_1px_2px_color-mix(in_oklab,black_16%,transparent)]"
        style={{
          left: pillLeft,
          width: pillWidth,
          top: pillInset,
          bottom: pillInset,
          opacity: blink,
        }}
      />
      {shown.map((it, i) => {
        const selected = i === index;
        return (
          <button
            key={it.value}
            ref={(node) => {
              if (node) buttons.current.set(it.value, node);
              else buttons.current.delete(it.value);
            }}
            type="button"
            role={tabs ? "tab" : "radio"}
            aria-selected={tabs ? selected : undefined}
            aria-checked={tabs ? undefined : selected}
            aria-controls={tabs ? it.controls : undefined}
            aria-label={it.ariaLabel}
            tabIndex={it.value === rover || (index < 0 && i === 0) ? 0 : -1}
            disabled={disabled || it.disabled}
            onClick={(event) => {
              // A click with no pointer behind it (Enter, Space) always counts.
              if (event.detail !== 0 && drag.current.suppress) {
                drag.current.suppress = false;
                return;
              }
              select(i);
            }}
            onFocus={() => setFocusValue(it.value)}
            className={cn(
              "relative inline-flex h-full items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              g.text,
              g.pad,
              it.disabled
                ? "cursor-not-allowed text-ink-3/50"
                : selected
                  ? "cursor-grab text-ink-2 active:cursor-grabbing"
                  : "cursor-pointer text-ink-2 hover:text-foreground",
            )}
          >
            {labelOf(it)}
          </button>
        );
      })}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] grid auto-cols-fr grid-flow-col text-(--stretch-pill-text)"
        style={{ padding: PAD, clipPath: clip }}
      >
        {shown.map((it) => (
          <span
            key={it.value}
            className={cn(
              "inline-flex h-full items-center justify-center font-medium whitespace-nowrap",
              g.text,
              g.pad,
            )}
          >
            {labelOf(it)}
          </span>
        ))}
      </motion.span>
    </div>
  );
}
