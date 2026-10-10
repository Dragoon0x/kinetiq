"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { createVelocityTracker, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ContourMarqueeCurve = "wave" | "arch" | "loop";
export type ContourMarqueeSize = "sm" | "md" | "lg";
export type ContourMarqueeElement = "p" | "h1" | "h2" | "h3" | "span" | "div";

export type ContourMarqueeProps = {
  /** The sentence that rides the curve. */
  text: string;
  /** The element that carries the sentence for assistive technology. @default "p" */
  as?: ContourMarqueeElement;
  /** The rail: a preset, or any SVG path `d` drawn in `viewBox`. @default "wave" */
  curve?: ContourMarqueeCurve | (string & {});
  /** The coordinate box of a custom path; it also sets the box's proportions. @default "0 0 800 200" */
  viewBox?: string;
  /** Cruising speed along the curve, em per second. @default 2.5 */
  speed?: number;
  /** Which way the sentence travels along the path. @default "forward" */
  direction?: "forward" | "backward";
  /** Type scale against the inherited font size: 0.75, 1 or 1.35em. @default "md" */
  size?: ContourMarqueeSize;
  /** Share of `speed` kept while the pointer is over the line or it has keyboard focus, 0 to 1. @default 0.2 */
  hoverSpeed?: number;
  /** How long a flick carries before it eases back to cruise, 0 (brief) to 1 (long). @default 0.5 */
  coast?: number;
  /** The mark between copies, drawn in `accent`. @default "·" */
  separator?: string;
  /** Letter spacing, em. @default 0.02 */
  spacing?: number;
  /** Draw the rail under the type. @default true */
  guide?: boolean;
  /** Share of the width faded out at each end, 0 to 0.3. @default 0.1 */
  fade?: number;
  /** Type colour, any CSS colour. @default "var(--foreground)" */
  color?: string;
  /** The separator's colour, and the rail's while it is held. @default "var(--accent-bright)" */
  accent?: string;
  /** Controlled pause. */
  paused?: boolean;
  /** Initial pause when uncontrolled. @default false */
  defaultPaused?: boolean;
  /** Fires from the press or key that paused or resumed the line, with the new state. */
  onPausedChange?: (paused: boolean) => void;
  /** Fires when a drag along the line begins (true) and when it lets go (false). */
  onScrubChange?: (scrubbing: boolean) => void;
  /** Wait this long after first coming into view before cruising, ms. @default 0 */
  delay?: number;
  /** No scrubbing or pausing; the line still cruises. @default false */
  disabled?: boolean;
  className?: string;
};

type Pt = readonly [number, number];
type Box4 = readonly [number, number, number, number];

const SCALE: Record<ContourMarqueeSize, number> = { sm: 0.75, md: 1, lg: 1.35 };
/** Room above a level rail for ascenders and the lift, em. */
const ABOVE = 1.1;
/** Room under it for descenders and the rail's own weight, em. */
const BELOW = 0.4;
/** The baselines ride this far off the rail, em: ruled paper, not a strike. */
const LIFT = 0.2;
const WAVE_AMP = 0.5;
const ARCH_RISE = 1.6;
/** The loop: a trochoid x = a(t − k·sin t), y = b·cos t, stretched sideways to round it. */
const LOOP_A = 0.58;
const LOOP_K = 2.5;
const LOOP_B = LOOP_A * LOOP_K;
const LOOP_STRETCH = 1.4;
/** Each preset's depth in em. The loop's foot carries upside-down glyphs that hang outside it. */
const DEPTH: Record<ContourMarqueeCurve, number> = {
  wave: ABOVE + 2 * WAVE_AMP + BELOW,
  arch: ABOVE + ARCH_RISE + BELOW,
  loop: ABOVE + 2 * LOOP_B + ABOVE,
};
/** Before the box is measured: the server's guess, corrected on arrival. */
const GUESS_WIDTH = 640;
const GUESS_FONT = 16;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (v: number, m: number) => ((v % m) + m) % m;

const isPreset = (c: string): c is ContourMarqueeCurve =>
  c === "wave" || c === "arch" || c === "loop";

function parseViewBox(raw: string): Box4 {
  const n = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((v) => Number.isFinite(v));
  const [x = 0, y = 0, w = 800, h = 200] = n.length === 4 ? n : [];
  return [x, y, w > 0 ? w : 800, h > 0 ? h : 200];
}

/**
 * Smooth strands through points (a cardinal spline as cubic curves), so the rail's
 * tangent — which every glyph turns to — never jumps between samples. `cuts`
 * split the one curve into consecutive strands that meet with the same
 * tangent, so text carried across a cut never kinks.
 */
function strands(points: Pt[], k: number, cuts: number[] = []): string[] {
  const f = (p: Pt) => `${r2(p[0] * k)} ${r2(p[1] * k)}`;
  const first = points[0];
  if (!first) return [""];
  const out: string[] = [];
  let d = `M ${f(first)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i] ?? first;
    const p0 = points[i - 1] ?? p1;
    const p2 = points[i + 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    if (cuts.includes(i)) {
      out.push(d);
      d = `M ${f(p1)}`;
    }
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  out.push(d);
  return out;
}

/** A level run of points from a to b at about half-em spacing. */
function run(points: Pt[], a: number, b: number, y: number) {
  const n = Math.max(1, Math.round(Math.abs(b - a) / 0.5));
  for (let i = 0; i <= n; i += 1) points.push([lerp(a, b, i / n), y]);
}

/**
 * A preset rail for a box `w` em wide, drawn in px at `k` px per em, as one
 * strand — or two for the loop, which crosses itself.
 */
function presetStrands(
  curve: ContourMarqueeCurve,
  w: number,
  k: number,
): string[] {
  if (curve === "arch") {
    // A circular arc rising ARCH_RISE over its chord: text on its outside.
    const y = ABOVE + ARCH_RISE;
    const radius = (w * w) / 4 / (2 * ARCH_RISE) + ARCH_RISE / 2;
    return [
      `M 0 ${r2(y * k)} A ${r2(radius * k)} ${r2(radius * k)} 0 0 1 ${r2(w * k)} ${r2(y * k)}`,
    ];
  }
  if (curve === "loop") {
    // A level rail with one loop hung under its middle: a stretched trochoid,
    // travelled clockwise so the glyphs ride its outside instead of crowding
    // its inside. The rail dips into the loop and climbs out of it, so the
    // strands cross steeply at one knot; the curve is cut at the loop's foot,
    // far from the knot, so the climb out can be drawn over the dive in.
    const top = ABOVE;
    const cx = w / 2;
    const half = LOOP_STRETCH * LOOP_A * Math.PI;
    const points: Pt[] = [];
    run(points, 0, cx - half, top);
    points.pop();
    const steps = 44;
    for (let i = 0; i <= steps; i += 1) {
      const t = -Math.PI + (i / steps) * Math.PI * 2;
      points.push([
        cx + LOOP_STRETCH * LOOP_A * (t - LOOP_K * Math.sin(t)),
        top + LOOP_B + LOOP_B * Math.cos(t),
      ]);
    }
    const foot = points.length - 1 - steps / 2;
    const tail: Pt[] = [];
    run(tail, cx + half, w, top);
    points.push(...tail.slice(1));
    return strands(points, k, [foot]);
  }
  // About one crest per 13em, so a phone shows one and a desk two or three.
  const crests = Math.max(1, Math.round(w / 13));
  const mid = ABOVE + WAVE_AMP;
  const steps = crests * 12;
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * w;
    points.push([x, mid - WAVE_AMP * Math.sin((2 * Math.PI * crests * x) / w)]);
  }
  return strands(points, k);
}

/** A critically damped spring that settles in about the time `coast` asks for: drift at 0.5. */
const coastSpring = (coast: number) => {
  const stiffness = 120 * Math.pow(4, (0.5 - clamp(coast, 0, 1)) * 2);
  const mass = 1.2;
  return {
    type: "spring" as const,
    stiffness: r2(stiffness),
    damping: r2(2 * Math.sqrt(stiffness * mass)),
    mass,
  };
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Metrics = {
  /** Whole rail length, and the first strand's, user units. */
  length: number;
  first: number;
  /** One copy (sentence and separator) and the sentence alone, user units. */
  copy: number;
  bare: number;
  /** User units per em. */
  unit: number;
  /** x, y, arc length per sample. */
  samples: Float32Array;
  count: number;
  box: Box4;
};

type Api = {
  ease: (target: number) => void;
  wake: () => void;
  halt: () => void;
  tick: (now: number) => void;
};

/**
 * A marquee whose rail is a curve. The sentence and an accent separator are
 * repeated end to end along one SVG path and set on it with `textPath`, so
 * each glyph stands on the curve and turns with it; a hairline rail runs a
 * fifth of an em under the baselines, and both ends fade through a mask.
 * Presets are a wave, an arch and a loop that turns the type upside down at
 * its foot — drawn as two strands so the climb out passes over the dive in,
 * the lower strand masked by the upper one's glyphs like a ribbon crossing
 * itself; any other `curve` is a path drawn in `viewBox`.
 *
 * One phase, in em along the path, is integrated each frame from a velocity
 * that is only ever animated, never set: it eases to cruise, to a crawl while
 * hovered or focused, and to rest when paused, on a critically damped spring
 * (drift at the default `coast`). Grabbing the line scrubs it 1:1 along the
 * curve — the pointer is projected onto the sampled path — and a flick hands
 * its velocity back to that spring, which carries the sentence on and settles
 * it into its pace. The rail is a real button: a press or Space pauses (moving
 * text must be stoppable), Left and Right glide a word on springs.glide and
 * Shift a sentence, Home re-centres it. The sentence is read once from an
 * sr-only copy. Under reduced motion it rests centred on the curve, scrubbing
 * still follows the hand and nothing coasts.
 */
export function ContourMarquee({
  text,
  as: Tag = "p",
  curve = "wave",
  viewBox = "0 0 800 200",
  speed = 2.5,
  direction = "forward",
  size = "md",
  hoverSpeed = 0.2,
  coast = 0.5,
  separator = "·",
  spacing = 0.02,
  guide = true,
  fade = 0.1,
  color = "var(--foreground)",
  accent = "var(--accent-bright)",
  paused,
  defaultPaused = false,
  onPausedChange,
  onScrubChange,
  delay = 0,
  disabled = false,
  className,
}: ContourMarqueeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const pathId = `${uid}-rail`;
  const maskId = `${uid}-fade`;
  const knotId = `${uid}-knot`;
  const rampId = `${uid}-ramp`;
  const hintId = `${uid}-hint`;
  const preset = isPreset(curve) ? curve : null;
  const scale = SCALE[size] ?? 1;
  const edge = clamp(fade, 0, 0.3);

  const [ownPaused, setOwnPaused] = React.useState(defaultPaused);
  const isPaused = paused ?? ownPaused;
  const [measured, setMeasured] = React.useState<{
    width: number;
    font: number;
  } | null>(null);
  const [copies, setCopies] = React.useState(6);
  const [held, setHeld] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [onScreen, setOnScreen] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const running = onScreen && !hidden;

  // Geometry is pure in the box and the font: the server draws its guess, the
  // client redraws for the real box before the line starts to move.
  const width = measured?.width ?? GUESS_WIDTH;
  const font = measured?.font ?? GUESS_FONT * scale;
  let box: Box4;
  let parts: string[];
  let unit: number;
  if (preset) {
    const w = width / font;
    box = [0, 0, r2(width), r2(DEPTH[preset] * font)];
    parts = presetStrands(preset, w, font);
    unit = font;
  } else {
    box = parseViewBox(viewBox);
    parts = [curve];
    unit = font / (width / box[2]);
  }
  const knotted = parts.length > 1;
  const d = parts.join(" ");
  const u = r3(unit);
  const sep = `\u2002${separator}\u2002`;
  const words = Math.max(1, text.trim().split(/\s+/).length);

  const velocity = useMotionValue(0);
  const shift = React.useRef(0);
  const metrics = React.useRef<Metrics | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const pathRefs = React.useRef<(SVGPathElement | null)[]>([]);
  /** The first strand's text, the second's, and the second's knot mask. */
  const textPathRefs = React.useRef<(SVGTextPathElement | null)[]>([]);
  const copyRef = React.useRef<SVGTextElement | null>(null);
  const bareRef = React.useRef<SVGTextElement | null>(null);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const easing = React.useRef<AnimationPlaybackControls | null>(null);
  const nudge = React.useRef<{
    run: AnimationPlaybackControls;
    to: number;
  } | null>(null);
  const grab = React.useRef({ on: false, s0: 0, shift0: 0, at: -1 });
  const tracker = React.useRef(createVelocityTracker());
  const api = React.useRef<Api | null>(null);
  /** Every frame goes through the latest render's tick, never a stale one. */
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const target =
    !motionSafe || !started || isPaused
      ? 0
      : speed *
        (hovered || focused ? clamp(hoverSpeed, 0, 1) : 1) *
        (direction === "backward" ? -1 : 1);

  /** The one attribute that moves: where the first copy starts on the rail. */
  const write = () => {
    const m = metrics.current;
    if (!m) return;
    // Phase 0 is the sentence centred on the curve: the still a reduced-motion
    // visitor sees, and where Home returns.
    const base = (m.length - m.bare) / 2;
    const offset = mod(base + shift.current * m.unit, m.copy) - m.copy;
    // The second strand carries on exactly where the first one ends.
    textPathRefs.current.forEach((node, i) => {
      node?.setAttribute(
        "startOffset",
        (i === 0 ? offset : offset - m.first).toFixed(2),
      );
    });
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!live.current) {
      last.current = 0;
      return;
    }
    const dt = last.current ? Math.min(0.05, (now - last.current) / 1000) : 0;
    last.current = now;
    const m = metrics.current;
    if (!grab.current.on && !nudge.current) {
      shift.current += velocity.get() * dt;
      // Keep the phase small: one copy is one period of the whole line.
      const period = m ? m.copy / m.unit : 0;
      if (period > 0 && Math.abs(shift.current) > period * 64) {
        shift.current = mod(shift.current, period);
      }
    }
    write();
    // A held line is written by the hand; the release wakes the loop again.
    const moving = Math.abs(velocity.get()) > 1e-3 || velocity.isAnimating();
    if (moving && !grab.current.on) {
      frame.current = window.requestAnimationFrame(loop);
    } else {
      last.current = 0;
    }
  };

  const wake = () => {
    if (frame.current || !live.current) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  const halt = () => {
    if (frame.current) window.cancelAnimationFrame(frame.current);
    frame.current = 0;
    last.current = 0;
  };

  /** The velocity eases to a new pace; it is never set mid-flight. */
  const ease = (to: number) => {
    easing.current?.stop();
    if (!motionSafe) {
      velocity.jump(0);
      return;
    }
    easing.current = animate(velocity, to, coastSpring(coast));
    wake();
  };

  const glideTo = (to: number) => {
    nudge.current?.run.stop();
    if (!motionSafe) {
      nudge.current = null;
      shift.current = to;
      write();
      return;
    }
    const controls = animate(shift.current, to, {
      ...springs.glide,
      onUpdate: (v) => {
        shift.current = v;
        write();
      },
      onComplete: () => {
        nudge.current = null;
      },
    });
    nudge.current = { run: controls, to };
  };

  const setPaused = (next: boolean) => {
    if (paused === undefined) setOwnPaused(next);
    onPausedChange?.(next);
  };

  /** Client px to path user units, through the SVG's meet scaling. */
  const toUser = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    const m = metrics.current;
    if (!svg || !m) return null;
    const r = svg.getBoundingClientRect();
    const s = Math.min(r.width / m.box[2], r.height / m.box[3]);
    if (!(s > 0)) return null;
    const ox = r.left + (r.width - m.box[2] * s) / 2;
    const oy = r.top + (r.height - m.box[3] * s) / 2;
    return [m.box[0] + (clientX - ox) / s, m.box[1] + (clientY - oy) / s];
  };

  /**
   * The arc length nearest a point. Searched in a window round the last
   * answer while a drag is under way, so the loop's crossing never hands the
   * finger to the other branch; past either end it carries on along the end's
   * tangent, so a long pull keeps scrubbing.
   */
  const arcAt = (p: Pt, hint: number): number => {
    const m = metrics.current;
    if (!m) return 0;
    const S = m.samples;
    const n = m.count;
    const x = (i: number) => S[i * 3] ?? 0;
    const y = (i: number) => S[i * 3 + 1] ?? 0;
    const s = (i: number) => S[i * 3 + 2] ?? 0;
    const near = (lo: number, hi: number) => {
      let best = lo;
      let bestD = Infinity;
      for (let i = lo; i <= hi; i += 1) {
        const dd = (x(i) - p[0]) ** 2 + (y(i) - p[1]) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
      return { best, bestD };
    };
    let found =
      hint >= 0
        ? near(Math.max(0, hint - 24), Math.min(n - 1, hint + 24))
        : near(0, n - 1);
    // Lost the line entirely (a fast swipe): look everywhere.
    if (hint >= 0 && found.bestD > (m.unit * 2.5) ** 2) found = near(0, n - 1);
    const i = found.best;
    grab.current.at = i;
    // Refine on whichever neighbouring segment the point falls along.
    const along = (a: number, b: number) => {
      const ex = x(b) - x(a);
      const ey = y(b) - y(a);
      const len2 = ex * ex + ey * ey;
      if (len2 <= 0) return { t: 0, len: 0 };
      return {
        t: ((p[0] - x(a)) * ex + (p[1] - y(a)) * ey) / len2,
        len: Math.sqrt(len2),
      };
    };
    if (i < n - 1) {
      const f = along(i, i + 1);
      if (f.t > 0 || i === 0) {
        const t = i === 0 ? Math.min(1, f.t) : clamp(f.t, 0, 1);
        return s(i) + t * f.len;
      }
    }
    if (i > 0) {
      const b = along(i - 1, i);
      const t = i === n - 1 ? Math.max(0, b.t) : clamp(b.t, 0, 1);
      return s(i - 1) + t * b.len;
    }
    return s(i);
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, offset }) => {
      const p = toUser(point.x - offset.x, point.y - offset.y);
      if (!p) return;
      easing.current?.stop();
      nudge.current?.run.stop();
      nudge.current = null;
      const g = grab.current;
      g.on = true;
      g.at = -1;
      g.s0 = arcAt(p, -1);
      g.shift0 = shift.current;
      tracker.current.reset();
      setHeld(true);
      onScrubChange?.(true);
    },
    onMove: ({ point, event }) => {
      const g = grab.current;
      const m = metrics.current;
      const p = toUser(point.x, point.y);
      if (!g.on || !m || !p) return;
      shift.current = g.shift0 + (arcAt(p, g.at) - g.s0) / m.unit;
      tracker.current.push(shift.current, 0, event.timeStamp);
      write();
    },
    onEnd: () => {
      const g = grab.current;
      if (!g.on) return;
      g.on = false;
      setHeld(false);
      onScrubChange?.(false);
      // The flick's speed along the curve, not the pointer's, goes back to
      // the line: the spring then carries it home to cruise.
      const v = motionSafe ? clamp(tracker.current.velocity().x, -48, 48) : 0;
      velocity.jump(r3(v));
      ease(target);
    },
    onCancel: () => {
      const g = grab.current;
      if (!g.on) return;
      g.on = false;
      setHeld(false);
      onScrubChange?.(false);
      velocity.jump(0);
      ease(target);
    },
    onTap: () => setPaused(!isPaused),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const m = metrics.current;
    if (disabled || !m) return;
    const period = m.copy / m.unit;
    const from = nudge.current?.to ?? shift.current;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        const step = event.shiftKey ? period : period / (words + 1);
        glideTo(from + (event.key === "ArrowRight" ? step : -step));
        break;
      }
      case "Home":
        glideTo(Math.round(from / period) * period);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // Every render: the latest closures for the effects and the frame loop.
  React.useLayoutEffect(() => {
    api.current = { ease, wake, halt, tick };
    live.current = running;
  });

  // The geometry the browser has laid out: lengths, samples, and how many
  // copies it takes to keep the rail full with one to spare.
  React.useLayoutEffect(() => {
    const paths = pathRefs.current.slice(0, parts.length);
    const one = copyRef.current;
    const bare = bareRef.current;
    if (!one || !bare || paths.some((p) => !p)) return;
    let lengths: number[] = [];
    let copy = 0;
    let bareLength = 0;
    try {
      lengths = paths.map((p) => p?.getTotalLength() ?? 0);
      copy = one.getComputedTextLength();
      bareLength = bare.getComputedTextLength();
    } catch {
      return;
    }
    const length = lengths.reduce((a, b) => a + b, 0);
    if (!(length > 0) || !(copy > 0)) return;
    // One sampled copy of the whole rail, strand after strand, for scrubbing.
    const n = Math.round(clamp(length / 3, 60, 600));
    const samples = new Float32Array((n + 1) * 3);
    let strand = 0;
    let before = 0;
    for (let i = 0; i <= n; i += 1) {
      const at = (length * i) / n;
      while (
        strand < paths.length - 1 &&
        at > before + (lengths[strand] ?? 0)
      ) {
        before += lengths[strand] ?? 0;
        strand += 1;
      }
      const pt = paths[strand]?.getPointAtLength(at - before);
      samples[i * 3] = pt?.x ?? 0;
      samples[i * 3 + 1] = pt?.y ?? 0;
      samples[i * 3 + 2] = at;
    }
    metrics.current = {
      length,
      first: lengths[0] ?? length,
      copy,
      bare: bareLength,
      unit,
      samples,
      count: n + 1,
      box,
    };
    const need = Math.min(80, Math.ceil(length / copy) + 2);
    if (need !== copies) setCopies(need);
    write();
    // The box tuple is rebuilt every render; its parts are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, u, text, sep, spacing, copies, box[0], box[1], box[2], box[3]]);

  // The velocity follows its target from wherever it is.
  React.useEffect(() => {
    if (grab.current.on) return;
    api.current?.ease(target);
  }, [target, coast, motionSafe]);

  // On screen and in a visible page the frame loop may run; otherwise it
  // stops where it is and the velocity keeps its value for the return.
  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
  }, [running]);

  // Cruising begins `delay` after the line first comes into view.
  React.useEffect(() => {
    if (started || !onScreen) return;
    const timer = window.setTimeout(() => setStarted(true), Math.max(0, delay));
    return () => window.clearTimeout(timer);
  }, [started, onScreen, delay]);

  React.useEffect(() => {
    const run = easing;
    const glide = nudge;
    return () => {
      run.current?.stop();
      glide.current?.run.stop();
      api.current?.halt();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const w = node.clientWidth;
      const f = parseFloat(getComputedStyle(node).fontSize) || GUESS_FONT;
      if (w <= 0) return;
      setMeasured((prev) =>
        prev && Math.abs(prev.width - w) < 0.5 && prev.font === f
          ? prev
          : { width: Math.round(w * 100) / 100, font: f },
      );
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const fontSize = u;
  const tracking = r3(spacing * unit);
  const lift = r2(-LIFT * unit);
  const rail = r2(Math.max(1, unit * 0.045));
  const depth = preset ? DEPTH[preset] : null;

  const railStroke = !guide
    ? "transparent"
    : held
      ? accent
      : "var(--hairline-strong)";

  /** Every copy of the sentence; the first glyph lifts the line off the rail. */
  const copiesOf = (paint: boolean) =>
    Array.from({ length: copies }, (_, k) => (
      <React.Fragment key={k}>
        <tspan dy={k === 0 ? lift : undefined}>{text}</tspan>
        <tspan style={paint ? { fill: accent } : undefined}>{sep}</tspan>
      </React.Fragment>
    ));

  const strand = (i: number) => (
    <>
      <path
        ref={(node) => {
          pathRefs.current[i] = node;
        }}
        id={`${pathId}-${i}`}
        d={parts[i]}
        fill="none"
        strokeWidth={rail}
        strokeLinecap="round"
        className="transition-[stroke] duration-150"
        style={{ stroke: railStroke }}
      />
      <text
        fontSize={fontSize}
        letterSpacing={tracking}
        style={{ fill: color, whiteSpace: "pre" }}
      >
        <textPath
          ref={(node) => {
            textPathRefs.current[i] = node;
          }}
          href={`#${pathId}-${i}`}
        >
          {copiesOf(true)}
        </textPath>
      </text>
    </>
  );

  // The rail's box is fixed at its final depth; the frame around it glides,
  // and an inner clip (not the button, whose focus ring must show) trims it.
  const svg = (
    <svg
      ref={svgRef}
      aria-hidden
      viewBox={box.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      className="block w-full"
      style={{ height: depth !== null ? `${depth}em` : "100%" }}
    >
      <defs>
        {edge > 0 ? (
          <>
            <linearGradient
              id={rampId}
              gradientUnits="userSpaceOnUse"
              x1={box[0]}
              x2={r2(box[0] + box[2])}
              y1={0}
              y2={0}
            >
              <stop offset={0} stopColor="black" />
              <stop offset={edge} stopColor="white" />
              <stop offset={r3(1 - edge)} stopColor="white" />
              <stop offset={1} stopColor="black" />
            </linearGradient>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x={box[0]}
              y={box[1]}
              width={box[2]}
              height={box[3]}
            >
              <rect
                x={box[0]}
                y={box[1]}
                width={box[2]}
                height={box[3]}
                fill={`url(#${rampId})`}
              />
            </mask>
          </>
        ) : null}
        {knotted ? (
          // The upper strand's glyphs and rail, fattened, punched out of the
          // lower strand: the line passes behind itself with a clean gap.
          <mask
            id={knotId}
            maskUnits="userSpaceOnUse"
            x={box[0]}
            y={box[1]}
            width={box[2]}
            height={box[3]}
          >
            <rect
              x={box[0]}
              y={box[1]}
              width={box[2]}
              height={box[3]}
              fill="white"
            />
            <path
              d={parts[1]}
              fill="none"
              stroke="black"
              strokeWidth={r2(unit * 0.3)}
            />
            <text
              fontSize={fontSize}
              letterSpacing={tracking}
              stroke="black"
              strokeWidth={r2(unit * 0.2)}
              strokeLinejoin="round"
              style={{ fill: "black", whiteSpace: "pre" }}
            >
              <textPath
                ref={(node) => {
                  textPathRefs.current[2] = node;
                }}
                href={`#${pathId}-1`}
              >
                {copiesOf(false)}
              </textPath>
            </text>
          </mask>
        ) : null}
      </defs>
      <g mask={edge > 0 ? `url(#${maskId})` : undefined}>
        {knotted ? (
          <>
            <g mask={`url(#${knotId})`}>{strand(0)}</g>
            {strand(1)}
          </>
        ) : (
          strand(0)
        )}
      </g>
      {/* Measured, never seen: one copy, and the sentence alone. */}
      <text
        ref={copyRef}
        visibility="hidden"
        fontSize={fontSize}
        letterSpacing={tracking}
        style={{ whiteSpace: "pre" }}
      >
        <tspan>{text}</tspan>
        <tspan>{sep}</tspan>
      </text>
      <text
        ref={bareRef}
        visibility="hidden"
        fontSize={fontSize}
        letterSpacing={tracking}
        style={{ whiteSpace: "pre" }}
      >
        {text}
      </text>
    </svg>
  );

  return (
    <div
      ref={bindRoot}
      className={cn("relative w-full", className)}
      style={{ fontSize: `${scale}em` }}
    >
      <Tag className="sr-only">{text}</Tag>
      <motion.div
        initial={false}
        animate={depth !== null ? { height: `${depth}em` } : undefined}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="relative w-full"
        style={
          depth === null ? { aspectRatio: `${box[2]} / ${box[3]}` } : undefined
        }
      >
        <button
          type="button"
          aria-label="Pause the moving text"
          aria-pressed={isPaused}
          aria-describedby={hintId}
          aria-disabled={disabled || undefined}
          onClick={(event) => {
            // Pointer presses arrive through the drag's tap. A click with no
            // pointer behind it — Space, Enter, assistive technology — pauses.
            if (event.detail === 0 && !disabled) setPaused(!isPaused);
          }}
          onKeyDown={onKeyDown}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") setHovered(true);
          }}
          onPointerLeave={() => setHovered(false)}
          onFocus={(event) =>
            setFocused(event.currentTarget.matches(":focus-visible"))
          }
          onBlur={() => setFocused(false)}
          {...drag}
          className={cn(
            "relative block size-full touch-pan-y rounded-2 text-left outline-none select-none [-webkit-touch-callout:none]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-default"
              : held
                ? "cursor-grabbing"
                : "cursor-grab",
          )}
        >
          <span className="absolute inset-0 overflow-clip rounded-2">
            {svg}
          </span>
        </button>
      </motion.div>
      <span id={hintId} className="sr-only">
        Drag along the line to scrub it. Left and Right move it by a word, Shift
        with an arrow by a whole sentence, Home centres it.
      </span>
    </div>
  );
}
