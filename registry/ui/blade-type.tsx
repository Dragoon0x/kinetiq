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
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BladeTypeTrigger = "mount" | "inView" | "manual";
export type BladeTypeElement = "h1" | "h2" | "h3" | "p" | "div";

export type BladeTypeProps = {
  /** The headline. */
  text: string;
  /** The element rendered. @default "h2" */
  as?: BladeTypeElement;
  /** How far the cut pieces slide down the cut and drop, 0 to 1. @default 0.5 */
  gravity?: number;
  /** How long the pieces stay apart before they draw back together, ms. @default 900 */
  healDelay?: number;
  /** Depth of the card's cut edge, px. @default 2 */
  thickness?: number;
  /** Face colour of the card. @default "currentColor" */
  ink?: string;
  /** Colour of the card's edge. @default the ink mixed toward the page */
  edgeColor?: string;
  /** Colour of the mended seam. @default a gold pigment from the warn token */
  seamColor?: string;
  /** How long the faint mark stays after mending, ms; 0 leaves none. @default 3200 */
  scar?: number;
  /** Slope of the keyboard's and the arrival's diagonal cut, degrees; flattened when needed so it crosses every line. @default 14 */
  angle?: number;
  /** When the arrival cut runs, to show what the headline does. @default "inView" */
  trigger?: BladeTypeTrigger;
  /** Run the arrival cut once, or on every return to view. @default true */
  once?: boolean;
  /** Wait before the arrival cut, ms. @default 350 */
  delay?: number;
  /** Any change runs the diagonal cut. */
  replayKey?: string | number;
  /** Dragging, tapping and keys cut the headline. @default true */
  interactive?: boolean;
  /** Nothing cuts. @default false */
  disabled?: boolean;
  /** A swish for each stroke the visitor makes. Off unless asked for. @default false */
  sound?: boolean;
  /** A stroke finished: how many letters it split. */
  onCut?: (letters: number) => void;
  /** Every open cut has mended. */
  onHeal?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(clamp01(v) * 100);

/** The keyboard's blade crosses the headline in this long, s. */
const SWEEP = 0.32;
/** How strong the mark stays once mended, 0 to 1. */
const MARK = 0.32;

/** Splits text into graphemes, so emoji and combining marks stay whole. */
function graphemes(text: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (!Segmenter) return Array.from(text);
  return Array.from(
    new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (s) => s.segment,
  );
}

type Pt = { x: number; y: number };

/** Keeps the part of a polygon on the positive side of a line (one Sutherland–Hodgman pass). */
function clipPoly(poly: Pt[], p: Pt, n: Pt, keep: 1 | -1): Pt[] {
  const side = (q: Pt) => keep * ((q.x - p.x) * n.x + (q.y - p.y) * n.y);
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i] as Pt;
    const b = poly[(i + 1) % poly.length] as Pt;
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const polygon = (pts: Pt[]) =>
  `polygon(${pts.map((q) => `${r2(q.x)}px ${r2(q.y)}px`).join(", ")})`;

/** Where a segment a→b crosses a box: its entry and exit as fractions, or null. */
function crossing(
  a: Pt,
  b: Pt,
  box: { x: number; y: number; w: number; h: number },
): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.w - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.h - a.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

type Cell = {
  /** Distance the upper piece has slid down the cut, px. */
  slide: MotionValue<number>;
  /** How far it has dropped, px, and tipped, degrees. */
  drop: MotionValue<number>;
  tip: MotionValue<number>;
  /** The slide's direction. */
  ux: MotionValue<number>;
  uy: MotionValue<number>;
  /** The staying piece's flinch away from the blade, px, and its direction. */
  flinch: MotionValue<number>;
  nx: MotionValue<number>;
  ny: MotionValue<number>;
  /** Whether the upper piece shows apart from the rest. */
  open: MotionValue<number>;
  /** The seam's strength, and how hot it glows. */
  seam: MotionValue<number>;
  heat: MotionValue<number>;
  clipStay: MotionValue<string>;
  clipSlide: MotionValue<string>;
  clipSeam: MotionValue<string>;
};

function Letter({
  char,
  cell,
  face,
  seamColor,
  bind,
}: {
  char: string;
  cell: Cell;
  face: string;
  seamColor: string;
  bind: (node: HTMLSpanElement | null) => void;
}) {
  const x = useTransform([cell.slide, cell.ux], ([s = 0, u = 0]: number[]) =>
    r2(s * u),
  );
  const y = useTransform(
    [cell.slide, cell.uy, cell.drop],
    ([s = 0, u = 0, d = 0]: number[]) => r2(s * u + d),
  );
  const fx = useTransform([cell.flinch, cell.nx], ([f = 0, n = 0]: number[]) =>
    r2(-f * n),
  );
  const fy = useTransform([cell.flinch, cell.ny], ([f = 0, n = 0]: number[]) =>
    r2(-f * n),
  );
  const glow = useTransform(cell.heat, (h) =>
    h <= 0.01
      ? seamColor
      : `color-mix(in oklab, ${seamColor}, white ${pct(h * 0.7)}%)`,
  );
  return (
    <span ref={bind} className="relative inline-block">
      <motion.span
        className="relative block"
        style={{ clipPath: cell.clipStay, x: fx, y: fy, textShadow: face }}
      >
        {char}
      </motion.span>
      <motion.span
        className="absolute inset-0 block"
        style={{
          clipPath: cell.clipSlide,
          opacity: cell.open,
          x,
          y,
          rotate: cell.tip,
          originX: 0.5,
          originY: 0.5,
          textShadow: face,
        }}
      >
        {char}
      </motion.span>
      <motion.span
        className="pointer-events-none absolute inset-0 block"
        style={{
          clipPath: cell.clipSeam,
          opacity: cell.seam,
          color: glow,
        }}
      >
        {char}
      </motion.span>
    </span>
  );
}

type Box = { x: number; y: number; w: number; h: number };

type Stroke = {
  pts: Pt[];
  entry: Map<number, Pt>;
  cut: Set<number>;
  voiced: boolean;
  speed: number;
  last: Pt;
  t: number;
};

type Api = {
  arrive: () => void;
  sweep: (voiced: boolean) => void;
  stop: () => void;
};

/**
 * A headline cut from stiff card — each letter has a card edge `thickness`
 * deep — that a drag cuts like a blade. A bright streak follows the pointer,
 * and every letter it passes through splits exactly along the line where the
 * blade entered and left it, a curved slash cutting each letter along its own
 * chord. The upper piece slides down the cut on springs.glide, taking the
 * blade's speed, its cut edge staying on the line, then drops a little and
 * tips on springs.recoil; the staying piece flinches a pixel on
 * springs.flick, and the fresh seam shows along the cut. After `healDelay`
 * the pieces draw back together on springs.snap — one crisp overshoot as they
 * meet — and the seam flashes and cools to a faint mark that fades away.
 *
 * Enter or Space makes one diagonal cut across the whole headline, a tap
 * nicks the letter under it, and on arrival one silent diagonal cut shows
 * what the headline does. Each letter is three clipped copies of itself
 * driven by motion values; nothing renders per frame. Under reduced motion
 * nothing moves: a cut draws its seam, which fades to the mark and away.
 */
export function BladeType({
  text,
  as = "h2",
  gravity = 0.5,
  healDelay = 900,
  thickness = 2,
  ink = "currentColor",
  edgeColor,
  seamColor = "oklch(from var(--warn) 0.8 0.13 h)",
  scar = 3200,
  angle = 14,
  trigger = "inView",
  once = true,
  delay = 350,
  replayKey,
  interactive = true,
  disabled = false,
  sound = false,
  onCut,
  onHeal,
  className,
}: BladeTypeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [onScreen, setOnScreen] = React.useState(false);
  const live = interactive && !disabled;

  const words = React.useMemo(() => {
    const clean = text.replace(/\s+/g, " ").trim();
    let at = 0;
    return (clean ? clean.split(" ") : []).map((word) =>
      graphemes(word).map((char) => ({ char, at: at++ })),
    );
  }, [text]);
  const count = words.reduce((n, w) => n + w.length, 0);
  const cells = React.useMemo(
    () =>
      Array.from({ length: count }, (): Cell => ({
        slide: motionValue(0),
        drop: motionValue(0),
        tip: motionValue(0),
        ux: motionValue(0),
        uy: motionValue(0),
        flinch: motionValue(0),
        nx: motionValue(0),
        ny: motionValue(0),
        open: motionValue(0),
        seam: motionValue(0),
        heat: motionValue(0),
        clipStay: motionValue("none"),
        clipSlide: motionValue("none"),
        clipSeam: motionValue("none"),
      })),
    [count],
  );

  const t = clamp(thickness, 0, 8);
  const edge =
    edgeColor ?? `color-mix(in oklab, ${ink} 55%, var(--background))`;
  const face = React.useMemo(() => {
    if (t <= 0) return "none";
    const layers: string[] = [];
    for (let d = 0.5; d <= t + 1e-6; d += 0.5) {
      layers.push(`${r2(d * 0.7)}px ${r2(d)}px 0 ${edge}`);
    }
    return layers.join(", ");
  }, [t, edge]);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const trailRef = React.useRef<SVGPathElement | null>(null);
  const haloRef = React.useRef<SVGPathElement | null>(null);
  const letters = React.useRef(new Map<number, HTMLSpanElement>());
  const boxes = React.useRef<Box[]>([]);
  const stroke = React.useRef<Stroke | null>(null);
  const runs = React.useRef(new Map<number, AnimationPlaybackControls[]>());
  const timers = React.useRef(new Map<number, number[]>());
  const openCuts = React.useRef(new Set<number>());
  const trailOpacity = useMotionValue(0);
  const trail = React.useRef<{
    fade: AnimationPlaybackControls | null;
    sweep: AnimationPlaybackControls | null;
  }>({ fade: null, sweep: null });
  const arrived = React.useRef(false);
  const lastReplay = React.useRef(replayKey);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onCut, onHeal });

  const stopLetter = (i: number) => {
    for (const c of runs.current.get(i) ?? []) c.stop();
    runs.current.delete(i);
    for (const id of timers.current.get(i) ?? []) window.clearTimeout(id);
    timers.current.delete(i);
  };

  /** Back to one whole letter, at once. */
  const whole = (i: number) => {
    const cell = cells[i];
    stopLetter(i);
    if (!cell) return;
    cell.slide.jump(0);
    cell.drop.jump(0);
    cell.tip.jump(0);
    cell.flinch.jump(0);
    cell.open.jump(0);
    cell.seam.jump(0);
    cell.heat.jump(0);
    cell.clipStay.set("none");
    cell.clipSlide.set("none");
    cell.clipSeam.set("none");
  };

  const healed = (i: number) => {
    if (!openCuts.current.delete(i)) return;
    if (openCuts.current.size === 0) report.current.onHeal?.();
  };

  const run = (i: number, c: AnimationPlaybackControls) => {
    const list = runs.current.get(i) ?? [];
    list.push(c);
    runs.current.set(i, list);
  };

  const after = (i: number, ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, Math.max(0, Math.round(ms)));
    const list = timers.current.get(i) ?? [];
    list.push(id);
    timers.current.set(i, list);
  };

  /** The mark cools and, after `scar`, fades away; then the letter is whole. */
  const fadeMark = (i: number) => {
    const cell = cells[i];
    if (!cell) return;
    healed(i);
    const hold = Math.max(0, scar);
    after(i, hold, () => {
      run(
        i,
        animate(cell.seam, 0, {
          duration: hold > 0 ? 1.2 : durations.base,
          ease: easings.exit,
          onComplete: () => whole(i),
        }),
      );
    });
  };

  /** The pieces draw back together and the seam flashes as it heals. */
  const mend = (i: number) => {
    const cell = cells[i];
    if (!cell) return;
    if (!motionSafe) {
      run(
        i,
        animate(cell.seam, MARK, {
          duration: durations.slow,
          ease: easings.enter,
        }),
      );
      fadeMark(i);
      return;
    }
    let met = false;
    const meet = () => {
      if (met) return;
      met = true;
      cell.seam.jump(1);
      cell.heat.jump(1);
      run(
        i,
        animate(cell.heat, 0, {
          duration: durations.page,
          ease: easings.enter,
        }),
      );
      run(
        i,
        animate(cell.seam, MARK, {
          duration: durations.page,
          ease: easings.enter,
        }),
      );
      fadeMark(i);
    };
    run(
      i,
      animate(cell.slide, 0, {
        ...springs.snap,
        onUpdate: (v) => {
          if (Math.abs(v) < 0.4) meet();
        },
        onComplete: () => {
          // Whole again: one piece of card, with only the mark left on it.
          cell.open.jump(0);
          cell.clipStay.set("none");
          cell.clipSlide.set("none");
          meet();
        },
      }),
    );
    run(i, animate(cell.drop, 0, springs.snap));
    run(i, animate(cell.tip, 0, springs.snap));
  };

  /**
   * Splits letter `i` along the line through `a` and `b` (root px), the
   * blade travelling from a to b at `speed` px/s.
   */
  const split = (i: number, a: Pt, b: Pt, speed: number) => {
    const cell = cells[i];
    const box = boxes.current[i];
    if (!cell || !box) return false;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 2) return false;
    whole(i);
    const d = { x: dx / len, y: dy / len };
    // The side the upper piece is on: above the cut, or right of an upright one.
    let n = { x: d.y, y: -d.x };
    if (Math.abs(n.y) > 0.15 ? n.y > 0 : n.x < 0) n = { x: -n.x, y: -n.y };
    // It slides downhill along the cut — or with the blade on a level one.
    let u = d.y >= 0 ? d : { x: -d.x, y: -d.y };
    if (Math.abs(u.y) < 0.12) u = d;
    const em =
      parseFloat(getComputedStyle(rootRef.current ?? document.body).fontSize) ||
      16;
    const m = em * 0.3;
    const p = { x: a.x - box.x, y: a.y - box.y };
    const rect: Pt[] = [
      { x: -m, y: -m },
      { x: box.w + m, y: -m },
      { x: box.w + m, y: box.h + m },
      { x: -m, y: box.h + m },
    ];
    const upper = clipPoly(rect, p, n, 1);
    const lower = clipPoly(rect, p, n, -1);
    if (upper.length < 3 || lower.length < 3) return false;
    // The seam: a thin band along the cut.
    const w = 0.75;
    const band = clipPoly(
      clipPoly(rect, { x: p.x + n.x * w, y: p.y + n.y * w }, n, -1),
      { x: p.x - n.x * w, y: p.y - n.y * w },
      n,
      1,
    );
    cell.clipSeam.set(band.length >= 3 ? polygon(band) : "none");
    // Under reduced motion nothing comes apart: only the seam is drawn.
    if (motionSafe) {
      cell.clipStay.set(polygon(lower));
      cell.clipSlide.set(polygon(upper));
    }
    cell.ux.jump(r2(u.x));
    cell.uy.jump(r2(u.y));
    cell.nx.jump(r2(n.x));
    cell.ny.jump(r2(n.y));
    openCuts.current.add(i);
    const g = clamp01(gravity);
    if (!motionSafe) {
      run(
        i,
        animate(cell.seam, 0.9, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
      after(i, healDelay, () => mend(i));
      return true;
    }
    cell.open.jump(1);
    cell.seam.jump(0.9);
    cell.heat.jump(0.5);
    run(i, animate(cell.heat, 0, { duration: durations.slow }));
    run(i, animate(cell.seam, 0.6, { duration: durations.slow }));
    const fast = clamp01(speed / 1800);
    const reach = em * (0.06 + g * (0.08 + 0.3 * Math.abs(u.y)) + 0.05 * fast);
    run(
      i,
      animate(cell.slide, r2(reach), {
        ...springs.glide,
        velocity: r2(speed * 0.25 * Math.abs(u.x * d.x + u.y * d.y)),
      }),
    );
    // Gravity takes over once it has slid: a small drop and a tip, landing.
    const lean = (u.x >= 0 ? 1 : -1) * g * (2 + 3 * Math.abs(u.x));
    run(
      i,
      animate(cell.drop, r2(em * g * 0.12), { ...springs.recoil, delay: 0.12 }),
    );
    run(i, animate(cell.tip, r2(lean), { ...springs.recoil, delay: 0.12 }));
    // The staying piece flinches away from the blade, a pixel, and back.
    run(
      i,
      animate(cell.flinch, 1, {
        duration: 0.04,
        ease: easings.enter,
        onComplete: () => run(i, animate(cell.flinch, 0, springs.flick)),
      }),
    );
    after(i, healDelay, () => mend(i));
    return true;
  };

  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const out: Box[] = [];
    for (let i = 0; i < count; i += 1) {
      const node = letters.current.get(i);
      const r = node?.getBoundingClientRect();
      out.push(
        r
          ? {
              x: r.left - rect.left,
              y: r.top - rect.top,
              w: r.width,
              h: r.height,
            }
          : { x: -1e4, y: -1e4, w: 0, h: 0 },
      );
    }
    boxes.current = out;
  };

  const drawTrail = (pts: Pt[]) => {
    const recent = pts.slice(-40);
    const d = recent.length
      ? `M ${recent.map((q) => `${r2(q.x)} ${r2(q.y)}`).join(" L ")}`
      : "";
    trailRef.current?.setAttribute("d", d);
    haloRef.current?.setAttribute("d", d);
  };

  const showTrail = () => {
    trail.current.fade?.stop();
    trailOpacity.jump(motionSafe ? 0.9 : 0.6);
  };

  const fadeTrail = () => {
    const tr = trail.current;
    tr.fade?.stop();
    tr.fade = animate(trailOpacity, 0, {
      duration: motionSafe ? 0.22 : durations.slow,
      ease: easings.exit,
    });
  };

  const begin = (start: Pt, voiced: boolean) => {
    measure();
    stroke.current = {
      pts: [start],
      entry: new Map(),
      cut: new Set(),
      voiced,
      speed: 0,
      last: start,
      t: performance.now(),
    };
    showTrail();
    drawTrail([start]);
  };

  /** The blade moves from its last point to `to`, cutting what it leaves. */
  const advance = (to: Pt, now: number) => {
    const s = stroke.current;
    if (!s) return;
    const from = s.last;
    const dt = Math.max(8, now - s.t);
    s.speed = (Math.hypot(to.x - from.x, to.y - from.y) / dt) * 1000;
    s.last = to;
    s.t = now;
    s.pts.push(to);
    drawTrail(s.pts);
    boxes.current.forEach((box, i) => {
      if (s.cut.has(i) || box.w <= 0) return;
      const hit = crossing(from, to, box);
      if (!hit) return;
      const [t0, t1] = hit;
      if (!s.entry.has(i)) {
        s.entry.set(i, {
          x: from.x + (to.x - from.x) * t0,
          y: from.y + (to.y - from.y) * t0,
        });
      }
      if (t1 >= 1) return;
      const exit = {
        x: from.x + (to.x - from.x) * t1,
        y: from.y + (to.y - from.y) * t1,
      };
      const entry = s.entry.get(i) as Pt;
      if (split(i, entry, exit, s.speed)) {
        if (s.cut.size === 0 && s.voiced) {
          const root = rootRef.current;
          audio.play("swish", {
            pitch: r2(clamp(0.8 + s.speed / 3000, 0.8, 1.5)),
            gain: r2(0.25 + 0.35 * clamp01(s.speed / 2000)),
            pan: root
              ? panFrom(root.getBoundingClientRect().left + exit.x, root)
              : 0,
          });
        }
        s.cut.add(i);
      }
    });
  };

  const end = () => {
    const s = stroke.current;
    if (!s) return;
    // A blade that stopped inside a letter cuts it from entry to where it stopped.
    for (const [i, entry] of s.entry) {
      if (s.cut.has(i)) continue;
      if (Math.hypot(s.last.x - entry.x, s.last.y - entry.y) < 3) continue;
      if (split(i, entry, s.last, s.speed)) s.cut.add(i);
    }
    stroke.current = null;
    fadeTrail();
    if (s.cut.size > 0) report.current.onCut?.(s.cut.size);
  };

  const local = (clientX: number, clientY: number): Pt => {
    const r = rootRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };

  /** One diagonal cut across the whole headline, the blade sweeping through. */
  const sweep = (voiced: boolean) => {
    const root = rootRef.current;
    if (!root || count === 0) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    // At most `angle`, and flat enough to cross every line of the box.
    const steep = Math.tan((clamp(angle, -40, 40) * Math.PI) / 180);
    const fit = (0.62 * h) / Math.max(1, w);
    const slope = Math.sign(steep) * Math.min(Math.abs(steep), fit);
    const yAt = (x: number) => h / 2 + (x - w / 2) * slope;
    const x0 = -12;
    const x1 = w + 12;
    trail.current.sweep?.stop();
    stroke.current = null;
    begin({ x: x0, y: yAt(x0) }, voiced);
    const started = performance.now();
    if (!motionSafe) {
      advance({ x: x1, y: yAt(x1) }, started + SWEEP * 1000);
      end();
      return;
    }
    trail.current.sweep = animate(0, 1, {
      duration: SWEEP,
      ease: easings.move,
      onUpdate: (v) => {
        const x = x0 + (x1 - x0) * v;
        advance({ x, y: yAt(x) }, performance.now());
      },
      onComplete: () => end(),
    });
  };

  /** A tap nicks the letter under it on a short diagonal. */
  const nick = (p: Pt) => {
    measure();
    const i = boxes.current.findIndex(
      (b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h,
    );
    if (i < 0) return;
    const box = boxes.current[i] as Box;
    const reach = Math.max(box.w, box.h);
    const a = { x: p.x - reach * 0.6, y: p.y - reach * 0.35 };
    const b = { x: p.x + reach * 0.6, y: p.y + reach * 0.35 };
    if (split(i, a, b, 900)) {
      if (sound) {
        const root = rootRef.current;
        audio.play("swish", {
          pitch: 1.2,
          gain: 0.3,
          pan: root
            ? panFrom(root.getBoundingClientRect().left + p.x, root)
            : 0,
        });
      }
      report.current.onCut?.(1);
    }
  };

  const drag = useDrag({
    threshold: 3,
    disabled: !live,
    onStart: ({ point, offset }) => {
      trail.current.sweep?.stop();
      begin(local(point.x - offset.x, point.y - offset.y), true);
    },
    onMove: ({ point, event }) =>
      advance(local(point.x, point.y), event.timeStamp),
    onEnd: () => end(),
    onCancel: () => end(),
    onTap: (event) => nick(local(event.clientX, event.clientY)),
  });

  const stopAll = () => {
    for (let i = 0; i < count; i += 1) stopLetter(i);
    trail.current.sweep?.stop();
    trail.current.fade?.stop();
  };

  React.useLayoutEffect(() => {
    api.current = {
      arrive: () => sweep(false),
      sweep,
      stop: stopAll,
    };
    report.current = { onCut, onHeal };
  });

  // The arrival cut: once in view (or on mount, or never), again on each
  // return when `once` is off.
  const ready =
    trigger === "mount" ? true : trigger === "inView" ? onScreen : false;
  React.useEffect(() => {
    if (!ready) {
      if (!once) arrived.current = false;
      return;
    }
    if (arrived.current) return;
    const id = window.setTimeout(
      () => {
        arrived.current = true;
        api.current?.arrive();
      },
      Math.max(0, delay),
    );
    return () => window.clearTimeout(id);
  }, [ready, once, delay]);

  React.useEffect(() => {
    if (lastReplay.current === replayKey) return;
    lastReplay.current = replayKey;
    api.current?.sweep(false);
  }, [replayKey]);

  // Unmounting, or a new text: everything stops where it is and is let go.
  React.useEffect(() => {
    const cuts = openCuts.current;
    return () => {
      api.current?.stop();
      cuts.clear();
    };
  }, [cells]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        setOnScreen(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.5 },
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const bindLetter = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) letters.current.set(i, node);
    else letters.current.delete(i);
  };

  const Tag: React.ElementType = as;

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={live ? 0 : undefined}
        aria-describedby={live ? hintId : undefined}
        {...(live ? drag : {})}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (!live) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (!event.repeat) api.current?.sweep(true);
        }}
        className={cn(
          "relative block",
          live &&
            "cursor-crosshair touch-pan-y rounded-2 outline-none select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
        style={ink === "currentColor" ? undefined : { color: ink }}
      >
        <span className="sr-only">{text}</span>
        <span aria-hidden className="block">
          {words.map((word, w) => (
            <React.Fragment key={w}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {word.map(({ char, at }) => (
                  <Letter
                    key={at}
                    char={char}
                    cell={cells[at] as Cell}
                    face={face}
                    seamColor={seamColor}
                    bind={bindLetter(at)}
                  />
                ))}
              </span>
            </React.Fragment>
          ))}
        </span>
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-hidden"
        >
          <motion.g style={{ opacity: trailOpacity }}>
            <path
              ref={haloRef}
              fill="none"
              stroke="color-mix(in oklab, currentColor 16%, transparent)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              ref={trailRef}
              fill="none"
              stroke={seamColor}
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>
        </svg>
      </Tag>
      {live ? (
        <span id={hintId} className="sr-only">
          Drag across the headline to cut it, or press Enter for a diagonal cut.
        </span>
      ) : null}
    </>
  );
}
