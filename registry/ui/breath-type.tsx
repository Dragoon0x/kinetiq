"use client";

import * as React from "react";

import {
  animate,
  frame,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BreathTypeAxis = "width" | "weight" | "optical";
export type BreathTypeFalloff = "linear" | "smooth" | "sharp";
export type BreathTypeTrigger = "mount" | "inView" | "hover" | "manual";
export type BreathTypeElement =
  "span" | "div" | "p" | "h1" | "h2" | "h3" | "h4";

export type BreathTypeProps = {
  /** The text. Plain text: it is read once and stays copyable. */
  children: string;
  /** The root element. @default "span" */
  as?: BreathTypeElement;
  /** How far the breath reaches from its point, em. @default 2.5 */
  radius?: number;
  /** The curve from the breath point out to the radius. @default "smooth" */
  falloff?: BreathTypeFalloff;
  /** What breathes besides the tracking: the font's width, its weight, or its optical size. @default "width" */
  axis?: BreathTypeAxis;
  /** How deep the breath is, 0 to 1. @default 0.7 */
  depth?: number;
  /** Extra tracking at the breath point, em. @default 0.1 */
  spread?: number;
  /** How far the breath trails the pointer, 0 (none) to 1. @default 0.35 */
  lag?: number;
  /** When the intro breath plays: once in view, on mount, never (hover), or on `breathKey`. @default "inView" */
  trigger?: BreathTypeTrigger;
  /** Play the intro breath only the first time. @default true */
  once?: boolean;
  /** Wait before the intro breath, ms. @default 250 */
  delay?: number;
  /** Length of the intro breath, ms. @default 1800 */
  duration?: number;
  /** Each change plays the intro breath: the host's own trigger. */
  breathKey?: string | number;
  /** A slow resting breath while on screen and untouched. @default false */
  breathing?: boolean;
  /** A tab stop with a keyboard path: arrows move the breath, Escape lets it go. @default true */
  focusable?: boolean;
  /** Ignore the pointer and the keys. @default false */
  disabled?: boolean;
  /** The letter at the breath point changed, by index in the text's graphemes; null once exhaled. */
  onBreathChange?: (index: number | null) => void;
  /** The intro breath finished. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const CURVES: Record<BreathTypeFalloff, (u: number) => number> = {
  linear: (u) => 1 - u,
  smooth: (u) => 0.5 + 0.5 * Math.cos(Math.PI * u),
  sharp: (u) => (1 - u) ** 3,
};

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

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Cell = {
  x: MotionValue<number>;
  scaleX: MotionValue<number>;
  scaleY: MotionValue<number>;
  fvs: MotionValue<string>;
  stroke: MotionValue<string>;
  opacity: MotionValue<number>;
};

type Spot = { cx: number; cy: number; w: number; line: number };

/** The axes the font has, with the range each may travel. */
type Axes = {
  wdth: [number, number] | null;
  wght: [number, number] | null;
  opsz: boolean;
};

const REST = "normal";

type Scratch = {
  f: Float64Array;
  room: Float64Array;
  lineSum: Float64Array;
  lineCount: Float64Array;
  roomSum: Float64Array;
  run: Float64Array;
};

const scratchOf = (n: number): Scratch => ({
  f: new Float64Array(n),
  room: new Float64Array(n),
  lineSum: new Float64Array(n),
  lineCount: new Float64Array(n),
  roomSum: new Float64Array(n),
  run: new Float64Array(n),
});

/**
 * A word that breathes toward the pointer. Letters within the radius open
 * their tracking and grow — along the inherited font's width axis, its weight
 * or its optical size — while letters further away compress, and the line's
 * total width is conserved: the space the near letters take is given up by
 * the far ones, so the word draws breath toward the cursor and gives it back
 * as the pointer leaves. Tracking is laid out as transforms around letters
 * that keep their rest width, so nothing ever reflows.
 *
 * The breath is asymmetric, like breathing: it fills on the glide spring and
 * empties on the slower drift spring, and its point trails the pointer on a
 * spring set by `lag`. On its trigger one breath passes along the line. Mouse:
 * move over the text; touch: press and drag along it; keyboard: focus breathes
 * in at the middle, Left and Right walk the breath a letter at a time, Home
 * and End jump, Escape lets it go. The text is read once and stays copyable.
 * Under reduced motion only the font's own axes change, nothing travels.
 */
export function BreathType({
  children,
  as = "span",
  radius = 2.5,
  falloff = "smooth",
  axis = "width",
  depth = 0.7,
  spread = 0.1,
  lag = 0.35,
  trigger = "inView",
  once = true,
  delay = 250,
  duration = 1800,
  breathKey,
  breathing = false,
  focusable = true,
  disabled = false,
  onBreathChange,
  onComplete,
  className,
}: BreathTypeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [axes, setAxes] = React.useState<Axes>({
    wdth: null,
    wght: null,
    opsz: false,
  });
  const [sized, setSized] = React.useState<{
    text: string;
    widths: number[];
  } | null>(null);
  const [intros, setIntros] = React.useState(0);
  const [engaged, setEngaged] = React.useState(false);

  const letters = React.useMemo(() => graphemes(children), [children]);
  const cells = React.useMemo(
    () =>
      letters.map((): Cell => ({
        x: motionValue(0),
        scaleX: motionValue(1),
        scaleY: motionValue(1),
        fvs: motionValue(REST),
        stroke: motionValue("0px transparent"),
        opacity: motionValue(1),
      })),
    [letters],
  );
  const widths = sized && sized.text === children ? sized.widths : null;

  // Words stay whole: the line wraps between them, never inside one.
  const words = React.useMemo(() => {
    const out: { at: number[]; key: number }[] = [];
    let current: number[] = [];
    letters.forEach((ch, i) => {
      if (ch.trim() === "") {
        if (current.length) out.push({ at: current, key: i });
        current = [];
        return;
      }
      current.push(i);
    });
    if (current.length) out.push({ at: current, key: letters.length });
    return out;
  }, [letters]);

  const pointX = useMotionValue(0);
  const pointY = useMotionValue(0);
  const presence = useMotionValue(0);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLSpanElement>());
  const spots = React.useRef<(Spot | null)[]>([]);
  const metrics = React.useRef({
    font: 16,
    weight: 400,
    stretch: 100,
    rtl: false,
  });
  const runs = React.useRef<{
    point: AnimationPlaybackControls[];
    presence: AnimationPlaybackControls | null;
    intro: AnimationPlaybackControls | null;
    rest: AnimationPlaybackControls | null;
  }>({ point: [], presence: null, intro: null, rest: null });
  const shownIndex = React.useRef<number | null>(null);
  const keyIndex = React.useRef<number | null>(null);
  const pointer = React.useRef<"mouse" | "touch" | null>(null);
  const lastKey = React.useRef(breathKey);
  /** The intro has played since the line last came into view. */
  const played = React.useRef(false);
  const api = React.useRef<{
    compute: () => void;
    measure: () => void;
    probe: () => void;
    intro: () => void;
    rest: (on: boolean) => void;
  } | null>(null);
  const latest = React.useRef({ onBreathChange, onComplete });

  const d = clamp01(depth);
  const curve = CURVES[falloff] ?? CURVES.smooth;

  // Scratch for the per-frame pass, grown only when the text does: nothing
  // is allocated while the breath moves.
  const scratch = React.useRef<Scratch | null>(null);

  /** One pass: every letter's tracking, size and axis from the breath. */
  const compute = () => {
    const m = metrics.current;
    const size = Math.max(1, cells.length);
    let k = scratch.current;
    if (!k || k.f.length < size) {
      k = scratchOf(size);
      scratch.current = k;
    }
    const p = presence.get();
    const px = pointX.get();
    const py = pointY.get();
    const reach = Math.max(0.5, radius) * m.font;
    const n = Math.min(cells.length, k.f.length);
    k.lineSum.fill(0);
    k.lineCount.fill(0);
    k.roomSum.fill(0);
    k.run.fill(0);
    for (let i = 0; i < n; i += 1) {
      const spot = spots.current[i];
      if (!spot) {
        k.f[i] = 0;
        continue;
      }
      const dist = Math.hypot(spot.cx - px, (spot.cy - py) * 1.3);
      const v = p > 0.0005 ? p * curve(clamp01(dist / reach)) : 0;
      k.f[i] = v;
      k.lineSum[spot.line] = (k.lineSum[spot.line] ?? 0) + v;
      k.lineCount[spot.line] = (k.lineCount[spot.line] ?? 0) + 1;
    }
    // Each letter's share of the breath against its line's mean, its look,
    // and the room it asks for: its tracking plus what its glyph really
    // grows by (an axis clamped at the font's end does not grow). The room is
    // made zero-sum per line, which is the conservation.
    for (let i = 0; i < n; i += 1) {
      const spot = spots.current[i];
      if (!spot) {
        k.room[i] = 0;
        continue;
      }
      const mean = (k.lineSum[spot.line] ?? 0) / (k.lineCount[spot.line] || 1);
      const gi = (k.f[i] ?? 0) - mean;
      k.f[i] = gi;
      let grow = 0;
      if (axis === "width") {
        grow = axes.wdth
          ? ((clamp(m.stretch + 50 * d * gi, axes.wdth[0], axes.wdth[1]) -
              m.stretch) /
              m.stretch) *
            0.85
          : 0.3 * d * gi;
      } else if (axis === "weight") {
        grow = axes.wght
          ? ((clamp(m.weight + 400 * d * gi, axes.wght[0], axes.wght[1]) -
              m.weight) /
              m.weight) *
            0.12
          : 0;
      } else {
        grow = 0.2 * d * gi;
      }
      // Near letters also lift a little toward a larger size.
      if (axis !== "optical") grow += 0.08 * d * Math.max(0, gi);
      const ri = spread * m.font * d * gi + spot.w * grow;
      k.room[i] = ri;
      k.roomSum[spot.line] = (k.roomSum[spot.line] ?? 0) + ri;
    }
    const dir = m.rtl ? -1 : 1;
    for (let i = 0; i < n; i += 1) {
      const cell = cells[i];
      const spot = spots.current[i];
      if (!cell || !spot) continue;
      const ri =
        (k.room[i] ?? 0) -
        (k.roomSum[spot.line] ?? 0) / (k.lineCount[spot.line] || 1);
      const before = k.run[spot.line] ?? 0;
      k.run[spot.line] = before + ri;
      const gi = k.f[i] ?? 0;
      const thin = r3(1 - 0.45 * d * Math.max(0, -gi));
      let x = motionSafe ? r2(dir * (before + ri / 2)) : 0;
      let sx = 1;
      let sy = 1;
      let fvs = REST;
      let stroke = "0px transparent";
      let opacity = 1;
      const lift = motionSafe ? r3(1 + 0.08 * d * Math.max(0, gi)) : 1;
      if (axis === "width") {
        sy = lift;
        sx = lift;
        if (axes.wdth) {
          fvs = `"wdth" ${r2(clamp(m.stretch + 50 * d * gi, axes.wdth[0], axes.wdth[1]))}`;
        } else if (motionSafe) {
          sx = r3(lift * (1 + 0.3 * d * gi));
        } else {
          opacity = thin;
        }
      } else if (axis === "weight") {
        sx = lift;
        sy = lift;
        if (axes.wght) {
          fvs = `"wght" ${r2(clamp(m.weight + 400 * d * gi, axes.wght[0], axes.wght[1]))}`;
        } else {
          if (gi > 0) stroke = `${r3(0.035 * d * gi)}em currentColor`;
          opacity = thin;
        }
      } else {
        const scale = motionSafe ? r3(1 + 0.2 * d * gi) : 1;
        sx = scale;
        sy = scale;
        if (axes.opsz) fvs = `"opsz" ${r2(clamp(m.font * scale, 6, 144))}`;
        else if (!motionSafe) opacity = thin;
      }
      if (Object.is(x, -0)) x = 0;
      cell.x.set(x);
      cell.scaleX.set(sx);
      cell.scaleY.set(sy);
      cell.fvs.set(fvs);
      cell.stroke.set(stroke);
      cell.opacity.set(opacity);
    }
  };

  /** Letter centres and lines, read from layout (never per frame). */
  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const style = getComputedStyle(root);
    const m = metrics.current;
    m.font = parseFloat(style.fontSize) || 16;
    m.weight = parseFloat(style.fontWeight) || 400;
    m.stretch = parseFloat(style.fontStretch) || 100;
    m.rtl = style.direction === "rtl";
    const tops: number[] = [];
    spots.current = letters.map((ch, i) => {
      const node = nodes.current.get(i);
      if (!node || ch.trim() === "") return null;
      const top = Math.round(node.offsetTop);
      let line = tops.findIndex((t) => Math.abs(t - top) < m.font * 0.5);
      if (line < 0) {
        tops.push(top);
        line = tops.length - 1;
      }
      return {
        cx: node.offsetLeft + node.offsetWidth / 2,
        cy: node.offsetTop + node.offsetHeight / 2,
        w: node.offsetWidth,
        line,
      };
    });
    if (!widths) {
      // Rest widths in em, so the boxes scale with the type and an axis can
      // change a glyph without moving its neighbours.
      setSized({
        text: children,
        widths: letters.map(
          (_, i) =>
            Math.round(
              ((nodes.current.get(i)?.offsetWidth ?? 0) / m.font) * 10000,
            ) / 10000,
        ),
      });
    }
    compute();
  };

  /**
   * Which axes the inherited font really has. A face declared with a weight
   * or stretch range is variable along it (that is how variable fonts are
   * served); anything else must prove itself by changing the width of a
   * hidden probe between the axis's extremes.
   */
  const probe = () => {
    const root = rootRef.current;
    if (!root) return;
    const family = (getComputedStyle(root).fontFamily.split(",")[0] ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");
    const rangeOf = (value: string): [number, number] | null => {
      const parts = value
        .trim()
        .split(/\s+/)
        .map((v) => parseFloat(v));
      const [lo, hi] = parts;
      return parts.length === 2 && lo !== undefined && hi !== undefined
        ? [Math.min(lo, hi), Math.max(lo, hi)]
        : null;
    };
    let wghtRange: [number, number] | null = null;
    let wdthRange: [number, number] | null = null;
    document.fonts?.forEach((face) => {
      if (face.family.replace(/^["']|["']$/g, "") !== family) return;
      wghtRange ??= rangeOf(face.weight);
      wdthRange ??= rangeOf(face.stretch);
    });
    const span = document.createElement("span");
    span.textContent = children.slice(0, 24) || "Breath";
    span.style.cssText =
      "position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;left:0;top:0";
    root.appendChild(span);
    const widthAt = (settings: string) => {
      span.style.fontVariationSettings = settings;
      return span.getBoundingClientRect().width;
    };
    const moves = (a: string, b: string) =>
      Math.abs(widthAt(a) - widthAt(b)) > 0.5;
    const next: Axes = {
      wdth: wdthRange ?? (moves('"wdth" 60', '"wdth" 100') ? [50, 150] : null),
      wght:
        wghtRange ?? (moves('"wght" 200', '"wght" 800') ? [100, 900] : null),
      opsz: moves('"opsz" 8', '"opsz" 96'),
    };
    span.remove();
    const same = (a: [number, number] | null, b: [number, number] | null) =>
      a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1]);
    setAxes((a) =>
      same(a.wdth, next.wdth) && same(a.wght, next.wght) && a.opsz === next.opsz
        ? a
        : next,
    );
  };

  const stopPoint = () => {
    for (const r of runs.current.point) r.stop();
    runs.current.point = [];
  };

  /** The breath point moves; it trails by `lag` on a critically damped spring. */
  const aim = (x: number, y: number, instant = false) => {
    stopPoint();
    if (instant || !motionSafe || lag <= 0.01) {
      pointX.set(r2(x));
      pointY.set(r2(y));
      return;
    }
    const stiffness = lerp(1400, 90, clamp01(lag));
    const follow = {
      type: "spring" as const,
      stiffness,
      damping: 2 * Math.sqrt(stiffness),
      mass: 1,
    };
    runs.current.point = [
      animate(pointX, x, follow),
      animate(pointY, y, follow),
    ];
  };

  /** Breathe in (glide) or out (drift): breathing is asymmetric. */
  const breathe = (to: number) => {
    runs.current.presence?.stop();
    if (!motionSafe) {
      runs.current.presence = animate(presence, to, {
        duration: durations.fast,
        ease: easings.enter,
      });
      return;
    }
    runs.current.presence = animate(
      presence,
      to,
      to > presence.get() ? springs.glide : springs.drift,
    );
  };

  const nearest = (x: number, y: number) => {
    let best: number | null = null;
    let bestD = Infinity;
    spots.current.forEach((spot, i) => {
      if (!spot) return;
      const dist = Math.hypot(spot.cx - x, (spot.cy - y) * 1.3);
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    });
    return best;
  };

  const report = (index: number | null) => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    latest.current.onBreathChange?.(index);
  };

  const stopIntro = () => {
    runs.current.intro?.stop();
    runs.current.intro = null;
  };

  const stopRest = () => {
    runs.current.rest?.stop();
    runs.current.rest = null;
  };

  /** The visitor takes the breath to a point. */
  const engage = (x: number, y: number) => {
    stopIntro();
    stopRest();
    if (!engaged) setEngaged(true);
    aim(x, y, presence.get() < 0.02);
    breathe(1);
    report(nearest(x, y));
  };

  const release = () => {
    pointer.current = null;
    keyIndex.current = null;
    setEngaged(false);
    breathe(0);
    report(null);
  };

  /** One breath along the line, first letter to last. */
  const intro = () => {
    if (!motionSafe) return;
    const live = spots.current.filter((s): s is Spot => Boolean(s));
    const first = live[0];
    const last = live[live.length - 1];
    if (!first || !last) return;
    stopIntro();
    stopPoint();
    played.current = true;
    const rtl = metrics.current.rtl;
    const from = rtl ? last : first;
    const to = rtl ? first : last;
    runs.current.presence?.stop();
    runs.current.intro = animate(0, 1, {
      duration: Math.max(0.4, duration / 1000),
      ease: easings.move,
      onUpdate: (t) => {
        pointX.set(r2(lerp(from.cx, to.cx, t)));
        pointY.set(r2(lerp(from.cy, to.cy, t)));
        presence.set(r3(Math.sin(Math.PI * t) ** 0.8));
      },
      onComplete: () => {
        runs.current.intro = null;
        presence.set(0);
        setIntros((k) => k + 1);
        latest.current.onComplete?.();
      },
    });
  };

  /** The resting breath: a slow swell at the middle of the line. */
  const rest = (on: boolean) => {
    stopRest();
    if (!on) return;
    const live = spots.current.filter((s): s is Spot => Boolean(s));
    const mid = live[Math.floor(live.length / 2)];
    if (!mid) return;
    pointX.set(r2(mid.cx));
    pointY.set(r2(mid.cy));
    runs.current.rest = animate(presence, [0, 0.4, 0], {
      duration: 5.2,
      ease: easings.move,
      repeat: Infinity,
    });
  };

  React.useLayoutEffect(() => {
    api.current = { compute, measure, probe, intro, rest };
    latest.current = { onBreathChange, onComplete };
  });

  // One compute per frame while anything that drives the breath is moving.
  React.useEffect(() => {
    const schedule = () => frame.update(run);
    const run = () => api.current?.compute();
    const offs = [
      pointX.on("change", schedule),
      pointY.on("change", schedule),
      presence.on("change", schedule),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [pointX, pointY, presence]);

  // New text, new boxes, a new axis or tweak: measure and recompute.
  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [letters, widths, axis, axes, radius, depth, spread, falloff, motionSafe]);

  React.useEffect(() => {
    const r = runs;
    return () => {
      for (const c of r.current.point) c.stop();
      r.current.presence?.stop();
      r.current.intro?.stop();
      r.current.rest?.stop();
    };
  }, []);

  const running = onScreen && !hidden;
  const introArmed =
    motionSafe &&
    running &&
    (trigger === "mount" || trigger === "inView") &&
    !(once && intros > 0) &&
    !engaged;

  React.useEffect(() => {
    if (!introArmed || played.current) return;
    const timer = window.setTimeout(
      () => api.current?.intro(),
      Math.max(0, delay),
    );
    // A finished intro re-arms only when `once` is off and the line comes
    // back into view, never on its own count changing.
    return () => window.clearTimeout(timer);
  }, [introArmed, delay]);

  React.useEffect(() => {
    if (lastKey.current === breathKey) return;
    lastKey.current = breathKey;
    if (!engaged) api.current?.intro();
  }, [breathKey, engaged]);

  const resting = breathing && motionSafe && running && !engaged;
  React.useEffect(() => {
    if (!resting) return;
    const timer = window.setTimeout(() => api.current?.rest(true), 600);
    return () => {
      window.clearTimeout(timer);
      api.current?.rest(false);
    };
  }, [resting]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const seen = Boolean(entry?.isIntersecting);
      // Leaving the view re-arms the intro (when `once` is off).
      if (!seen) played.current = false;
      setOnScreen(seen);
    });
    watcher.observe(node);
    api.current?.probe();
    void document.fonts?.ready.then(() => {
      api.current?.probe();
      api.current?.measure();
    });
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindLetter = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) nodes.current.set(i, node);
    else nodes.current.delete(i);
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const rect = root.getBoundingClientRect();
    return {
      x: clientX - rect.left - root.clientLeft,
      y: clientY - rect.top - root.clientTop,
    };
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onMove: ({ point }) => {
      if (pointer.current !== "touch") return;
      const at = local(point.x, point.y);
      engage(at.x, at.y);
    },
    onEnd: () => {
      if (pointer.current === "touch") release();
    },
    onTap: () => {
      if (pointer.current === "touch") release();
    },
    onCancel: () => {
      if (pointer.current === "touch") release();
    },
  });

  const keyTo = (index: number) => {
    const spot = spots.current[index];
    if (!spot) return;
    keyIndex.current = index;
    engage(spot.cx, spot.cy);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    const order = spots.current
      .map((s, i) => (s ? i : -1))
      .filter((i) => i >= 0);
    if (!order.length) return;
    const at = order.indexOf(keyIndex.current ?? -1);
    const rtl = metrics.current.rtl;
    let to: number | undefined;
    switch (event.key) {
      case "ArrowRight":
        to =
          order[
            clamp(
              (at < 0 ? order.length >> 1 : at) + (rtl ? -1 : 1),
              0,
              order.length - 1,
            )
          ];
        break;
      case "ArrowLeft":
        to =
          order[
            clamp(
              (at < 0 ? order.length >> 1 : at) + (rtl ? 1 : -1),
              0,
              order.length - 1,
            )
          ];
        break;
      case "Home":
        to = order[0];
        break;
      case "End":
        to = order[order.length - 1];
        break;
      case "Escape":
        if (presence.get() > 0.01 || keyIndex.current !== null) {
          event.preventDefault();
          release();
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    if (to !== undefined) keyTo(to);
  };

  return React.createElement(
    as,
    {
      ref: bindRoot,
      tabIndex: focusable && !disabled ? 0 : undefined,
      "aria-describedby": focusable ? hintId : undefined,
      onKeyDown,
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        if (disabled || event.target !== event.currentTarget) return;
        if (pointer.current) return;
        // Focus breathes in at the middle of the line.
        const order = spots.current
          .map((s, i) => (s ? i : -1))
          .filter((i) => i >= 0);
        const mid = order[order.length >> 1];
        if (mid !== undefined) keyTo(mid);
      },
      onBlur: () => {
        if (keyIndex.current !== null) release();
      },
      onPointerEnter: (event: React.PointerEvent) => {
        if (disabled || event.pointerType !== "mouse") return;
        pointer.current = "mouse";
        const at = local(event.clientX, event.clientY);
        engage(at.x, at.y);
      },
      onPointerMove: (event: React.PointerEvent) => {
        drag.onPointerMove(event);
        if (disabled || event.pointerType !== "mouse") return;
        pointer.current = "mouse";
        const at = local(event.clientX, event.clientY);
        engage(at.x, at.y);
      },
      onPointerLeave: (event: React.PointerEvent) => {
        if (event.pointerType === "mouse" && pointer.current === "mouse") {
          release();
        }
      },
      onPointerDown: (event: React.PointerEvent) => {
        drag.onPointerDown(event);
        if (disabled || event.pointerType === "mouse") return;
        // A finger breathes in where it lands, and the drag carries it.
        pointer.current = "touch";
        const at = local(event.clientX, event.clientY);
        engage(at.x, at.y);
      },
      onPointerUp: drag.onPointerUp,
      onPointerCancel: drag.onPointerCancel,
      onLostPointerCapture: drag.onLostPointerCapture,
      className: cn(
        "relative touch-pan-y rounded-1 outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      ),
    },
    <span key="text" className="sr-only select-none">
      {children}
    </span>,
    <span key="letters" aria-hidden>
      {words.map((word, w) => (
        <React.Fragment key={word.key}>
          {w > 0 ? " " : null}
          <span className="inline-block whitespace-nowrap">
            {word.at.map((i) => {
              const cell = cells[i] as Cell;
              return (
                <motion.span
                  key={i}
                  ref={bindLetter(i)}
                  className="inline-flex justify-center"
                  style={{
                    width: widths ? `${widths[i] ?? 0}em` : undefined,
                    x: cell.x,
                    scaleX: cell.scaleX,
                    scaleY: cell.scaleY,
                    originY: "80%",
                    fontVariationSettings: cell.fvs,
                    WebkitTextStroke: cell.stroke,
                    opacity: cell.opacity,
                  }}
                >
                  {letters[i]}
                </motion.span>
              );
            })}
          </span>
        </React.Fragment>
      ))}
    </span>,
    focusable ? (
      // Hidden, not visually hidden: the description is still read, but it
      // must not join the text of a heading this sits in.
      <span key="hint" id={hintId} hidden>
        Move along the text, or use Left and Right, to move the breath; Escape
        lets it go.
      </span>
    ) : null,
  );
}
