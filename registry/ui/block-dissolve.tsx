"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BlockDissolveValue = "first" | "second";
export type BlockDissolveOrder = "random" | "diagonal" | "pointer";
export type BlockDissolveTrigger = "hover" | "press" | "manual";

export type BlockDissolveProps = {
  /** Exactly two children: the first state, then the second. Any content — images, cards, charts. */
  children: React.ReactNode;
  /** Which state shows (controlled). */
  value?: BlockDissolveValue;
  /** Which state shows to begin with. @default "first" */
  defaultValue?: BlockDissolveValue;
  /** The state changed, from the hover, press or key that changed it. */
  onValueChange?: (value: BlockDissolveValue) => void;
  /** What swaps the states: hovering (keys and taps toggle), pressing, or only `value`. @default "hover" */
  trigger?: BlockDissolveTrigger;
  /** Coarse block size, px; the run refines to halves and quarters of it. @default 24 */
  block?: number;
  /** The order the blocks flip in: seeded scatter, a diagonal sweep, or outward from the pointer. @default "pointer" */
  order?: BlockDissolveOrder;
  /** How long the whole dissolve takes, ms. @default 800 */
  duration?: number;
  /** How many sizes the blocks refine through, 1 to 3. @default 3 */
  levels?: 1 | 2 | 3;
  /** Brightness of the glint on freshly flipped blocks, 0 to 1. @default 0.3 */
  glint?: number;
  /** Colour of the glint. @default "var(--accent-bright)" */
  glintColor?: string;
  /** Seed for the block order and the coarse-to-fine split. @default 7 */
  seed?: number;
  /** Accessible name of the toggle, e.g. "Show the night view". @default "Swap view" */
  label?: string;
  /** No swapping; the toggle says it is unavailable. @default false */
  disabled?: boolean;
  /** A dissolve finished on this state. */
  onComplete?: (value: BlockDissolveValue) => void;
  /** Classes for the box — give it a size or an aspect ratio and a radius. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Unsigned hash of a few integers, 0..1. */
function hash(seed: number, a: number, b: number, c: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (a + 0x632be5ab), 0xc2b2ae35);
  h = Math.imul(h ^ (b + 0x27d4eb2f), 0x165667b1);
  h = Math.imul(h ^ (c + 0x85ebca77), 0x9e3779b1);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

type Units = {
  count: number;
  x: Int16Array;
  y: Int16Array;
  w: Int16Array;
  h: Int16Array;
  t: Float32Array;
};

const HIDDEN = "inset(50%)";
/** Share of the run during which a flipped block still carries the glint. */
const FRESH = 0.07;

/**
 * Cuts the box into a seeded quadtree of blocks. Each coarse block flips
 * whole or splits into halves; each half flips whole or splits into
 * quarters. Every unit's time is its place in the order plus a little
 * seeded jitter, lagged by its size — coarse first, quarters last — so the
 * front breaks through in big blocks and the holes behind it fill in ever
 * finer ones. Each unit flips exactly once.
 */
function buildUnits(
  w: number,
  h: number,
  block: number,
  levels: number,
  order: BlockDissolveOrder,
  origin: { x: number; y: number },
  seed: number,
  reverse: boolean,
): Units {
  const size = Math.max(4, Math.round(block));
  const cols = Math.max(1, Math.ceil(w / size));
  const rows = Math.max(1, Math.ceil(h / size));
  // Never finer than 4 px: below that a block is a smear, and the path
  // only grows.
  const deepest = Math.min(
    clamp(Math.round(levels), 1, 3) - 1,
    Math.max(0, Math.floor(Math.log2(size / 4))),
  );
  const cap = cols * rows * (deepest === 2 ? 16 : deepest === 1 ? 4 : 1);
  const u: Units = {
    count: 0,
    x: new Int16Array(cap),
    y: new Int16Array(cap),
    w: new Int16Array(cap),
    h: new Int16Array(cap),
    t: new Float32Array(cap),
  };
  const lagSpan = deepest === 0 ? 0 : 0.35;
  const far = Math.max(
    1,
    Math.hypot(
      Math.max(origin.x, w - origin.x),
      Math.max(origin.y, h - origin.y),
    ),
  );
  const add = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    level: number,
  ) => {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const jitter = hash(seed, Math.round(cx), Math.round(cy), 11 + level);
    let base: number;
    if (order === "random") base = jitter;
    else {
      const d =
        order === "diagonal"
          ? (cx / Math.max(1, w) + cy / Math.max(1, h)) / 2
          : Math.hypot(cx - origin.x, cy - origin.y) / far;
      base = clamp(d * 0.86 + (jitter - 0.5) * 0.16 + 0.07, 0, 1);
    }
    const lag = deepest === 0 ? 0 : (level / deepest) * lagSpan;
    let t = clamp(base * (1 - lagSpan) + lag, 0.001, 1);
    // Going back from the second state, the blocks nearest the origin and
    // the coarse ones must go first — the same rule, read from the far end.
    if (reverse) t = clamp(1 - t, 0, 0.999);
    const i = u.count;
    u.x[i] = x0;
    u.y[i] = y0;
    u.w[i] = x1 - x0;
    u.h[i] = y1 - y0;
    u.t[i] = t;
    u.count += 1;
  };
  const edge = (k: number, step: number) => Math.round(k * step);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = c * size;
      const y0 = r * size;
      if (deepest === 0 || hash(seed, c, r, 1) < 0.45) {
        add(x0, y0, x0 + size, y0 + size, 0);
        continue;
      }
      for (let q = 0; q < 4; q += 1) {
        const hx = x0 + edge(q % 2, size / 2);
        const hy = y0 + edge(q >> 1, size / 2);
        const hx1 = x0 + edge((q % 2) + 1, size / 2);
        const hy1 = y0 + edge((q >> 1) + 1, size / 2);
        if (
          deepest === 1 ||
          hash(seed, c * 2 + (q % 2), r * 2 + (q >> 1), 2) < 0.5
        ) {
          add(hx, hy, hx1, hy1, 1);
          continue;
        }
        const half = hx1 - hx;
        for (let k = 0; k < 4; k += 1) {
          add(
            hx + edge(k % 2, half / 2),
            hy + edge(k >> 1, half / 2),
            hx + edge((k % 2) + 1, half / 2),
            hy + edge((k >> 1) + 1, half / 2),
            2,
          );
        }
      }
    }
  }
  return u;
}

/**
 * Two states of anything, swapped through a cascade of blocks. Both children
 * share one grid cell; during a dissolve each is clipped by a
 * `clip-path: path()` rebuilt every frame — the first to the blocks not yet
 * flipped, the second to the blocks that have — so even transparent content
 * never shows through. The blocks come from a seeded quadtree and flip in
 * the chosen order with coarse blocks first and finer ones filling in, so
 * the block size eases from coarse to fine as the dissolve finishes; a faint
 * glint rides on the blocks that have just flipped. Progress is one tween
 * on the move ease; turning back mid-way runs back over the same blocks.
 *
 * With `hover` or `press` it is one tab stop, a toggle button that Enter
 * and Space work and touch taps toggle; only the state on show is exposed
 * to assistive technology. Reduced motion: the two states cross-fade.
 */
export function BlockDissolve({
  children,
  value,
  defaultValue = "first",
  onValueChange,
  trigger = "hover",
  block = 24,
  order = "pointer",
  duration = 800,
  levels = 3,
  glint = 0.3,
  glintColor = "var(--accent-bright)",
  seed = 7,
  label = "Swap view",
  disabled = false,
  onComplete,
  className,
}: BlockDissolveProps) {
  const motionSafe = useMotionSafe();
  const [own, setOwn] = React.useState<BlockDissolveValue>(defaultValue);
  const current = value ?? own;
  // The markup's resting clips come from the first render only; after that
  // the clips are the dissolve's to write, so a re-render never undoes one.
  const [initial] = React.useState(current);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const firstRef = React.useRef<HTMLDivElement | null>(null);
  const secondRef = React.useRef<HTMLDivElement | null>(null);
  const glintRef = React.useRef<HTMLDivElement | null>(null);
  const progress = useMotionValue(initial === "second" ? 1 : 0);
  const units = React.useRef<Units | null>(null);
  const origin = React.useRef<{ x: number; y: number } | null>(null);
  const pointerKind = React.useRef("mouse");
  const params = React.useRef({
    block,
    levels,
    order,
    seed,
    glint,
    motionSafe,
  });
  React.useEffect(() => {
    params.current = { block, levels, order, seed, glint, motionSafe };
  });
  const completeRef = React.useRef(onComplete);
  React.useEffect(() => {
    completeRef.current = onComplete;
  });

  const [first, second] = React.Children.toArray(children);

  // Paint the clips for a progress value. Strings are the only thing built
  // per frame; the units live in typed arrays made once per dissolve.
  const paint = React.useCallback((p: number, forward: boolean) => {
    const a = firstRef.current;
    const b = secondRef.current;
    const g = glintRef.current;
    const u = units.current;
    if (!a || !b || !g) return;
    if (!params.current.motionSafe || !u) {
      a.style.clipPath = "none";
      b.style.clipPath = "none";
      g.style.clipPath = HIDDEN;
      a.style.opacity = String(Math.round((1 - p) * 1000) / 1000);
      b.style.opacity = String(Math.round(p * 1000) / 1000);
      return;
    }
    let shown = "";
    let held = "";
    let fresh = "";
    for (let i = 0; i < u.count; i += 1) {
      const t = u.t[i] ?? 1;
      const rect = `M${u.x[i]} ${u.y[i]}h${u.w[i]}v${u.h[i]}h${-(u.w[i] ?? 0)}z`;
      if (t <= p) {
        shown += rect;
        if (forward ? t > p - FRESH : false) fresh += rect;
      } else {
        held += rect;
        if (!forward && t < p + FRESH) fresh += rect;
      }
    }
    a.style.opacity = "";
    b.style.opacity = "";
    a.style.clipPath = held ? `path("${held}")` : HIDDEN;
    b.style.clipPath = shown ? `path("${shown}")` : HIDDEN;
    g.style.clipPath = fresh ? `path("${fresh}")` : HIDDEN;
  }, []);

  const rest = React.useCallback((at: BlockDissolveValue) => {
    const a = firstRef.current;
    const b = secondRef.current;
    const g = glintRef.current;
    if (!a || !b || !g) return;
    a.style.opacity = "";
    b.style.opacity = "";
    a.style.clipPath = at === "first" ? "none" : HIDDEN;
    b.style.clipPath = at === "second" ? "none" : HIDDEN;
    g.style.clipPath = HIDDEN;
    units.current = null;
  }, []);

  // The dissolve: toward whichever state is current. From rest it builds
  // the blocks for this run (origin and order fixed for its whole life);
  // mid-run it turns back over the same blocks. A re-run (StrictMode, a
  // prop change) carries on from where the last one stopped.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const target = current === "second" ? 1 : 0;
    const from = progress.get();
    if (from === target) {
      rest(current);
      return;
    }
    const p = params.current;
    if (!units.current && p.motionSafe) {
      const box = root.getBoundingClientRect();
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      units.current = buildUnits(
        w,
        h,
        p.block,
        p.levels,
        p.order,
        origin.current ?? { x: w / 2, y: h / 2 },
        p.seed,
        target === 0,
      );
    }
    const forward = target === 1;
    const glintLayer = glintRef.current;
    if (glintLayer) glintLayer.style.opacity = String(clamp(p.glint, 0, 1));
    const unsub = progress.on("change", (v) => paint(v, forward));
    paint(from, forward);
    const span = Math.abs(target - from);
    const c: AnimationPlaybackControls = animate(progress, target, {
      duration: p.motionSafe
        ? Math.max(0.12, (duration / 1000) * span)
        : durations.slow * span,
      ease: easings.move,
    });
    let cancelled = false;
    c.finished.then(
      () => {
        if (cancelled) return;
        rest(current);
        completeRef.current?.(current);
      },
      () => {},
    );
    return () => {
      cancelled = true;
      unsub();
      c.stop();
    };
  }, [current, duration, paint, progress, rest]);

  const set = (next: BlockDissolveValue, at?: { x: number; y: number }) => {
    if (disabled || next === current) return;
    const root = rootRef.current;
    if (root && progress.get() % 1 === 0) {
      // A new run starts where the hand is (or the centre, from the keys).
      const box = root.getBoundingClientRect();
      origin.current = at
        ? { x: at.x - box.left, y: at.y - box.top }
        : { x: box.width / 2, y: box.height / 2 };
    }
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  const toggle = (at?: { x: number; y: number }) =>
    set(current === "first" ? "second" : "first", at);

  const interactive = trigger !== "manual";

  return (
    <div
      ref={rootRef}
      role={interactive ? "button" : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-pressed={interactive ? current === "second" : undefined}
      aria-label={interactive ? label : undefined}
      aria-disabled={interactive && disabled ? true : undefined}
      onPointerDown={(event) => {
        pointerKind.current = event.pointerType;
      }}
      onPointerEnter={(event) => {
        pointerKind.current = event.pointerType;
        if (trigger !== "hover" || event.pointerType === "touch") return;
        set("second", { x: event.clientX, y: event.clientY });
      }}
      onPointerLeave={(event) => {
        if (trigger !== "hover" || event.pointerType === "touch") return;
        set("first", { x: event.clientX, y: event.clientY });
      }}
      onClick={(event) => {
        if (!interactive) return;
        // Hover has no touch equivalent, so a tap toggles; a mouse click on
        // a hover dissolve leaves it to the pointer.
        if (trigger === "hover" && pointerKind.current !== "touch") return;
        toggle({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (event.repeat) return;
        toggle();
      }}
      className={cn(
        "relative isolate grid overflow-hidden",
        interactive &&
          "cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled && "cursor-not-allowed",
        className,
      )}
    >
      <div
        ref={firstRef}
        aria-hidden={current !== "first" || undefined}
        inert={current !== "first" || undefined}
        className="relative size-full [grid-area:1/1]"
        style={{ clipPath: initial === "first" ? undefined : HIDDEN }}
      >
        {first}
      </div>
      <div
        ref={secondRef}
        aria-hidden={current !== "second" || undefined}
        inert={current !== "second" || undefined}
        className="relative size-full [grid-area:1/1]"
        style={{ clipPath: initial === "second" ? undefined : HIDDEN }}
      >
        {second}
      </div>
      <div
        ref={glintRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          clipPath: HIDDEN,
          backgroundColor: glintColor,
          opacity: clamp(glint, 0, 1),
        }}
      />
    </div>
  );
}
