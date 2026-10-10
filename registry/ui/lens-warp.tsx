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
import { cn } from "@/registry/lib/utils";

export type LensWarpTrigger = "mount" | "inView" | "hover" | "manual";
export type LensWarpElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "div";

export type LensWarpProps = {
  /** The headline under the glass. */
  text: string;
  /** The text element rendered. @default "h2" */
  as?: LensWarpElement;
  /** The bead's radius, px — never more than 1.5 times the type size. The piece reserves room above and below the words for it. @default 52 */
  radius?: number;
  /** Magnification and bulge, 0 to 1. @default 0.55 */
  power?: number;
  /** The highlight riding the bead, 0 to 1. @default 0.6 */
  specular?: number;
  /** How much the letters at the bead's rim are squeezed, 0 to 1. @default 0.5 */
  rim?: number;
  /** How much the type wobbles as it relaxes when the bead leaves, 0 (none) to 1. @default 0.5 */
  wobble?: number;
  /** Draw the glass disc itself; off leaves only the letters bending. @default true */
  bead?: boolean;
  /** The colour letters lean toward at the bead's centre. @default "var(--accent-bright)" */
  tint?: string;
  /** The pointer and the keyboard move the bead. @default true */
  interactive?: boolean;
  /** When the bead makes its one pass across the words: on mount, when scrolled into view, never (hover only), or when `active` turns true. @default "inView" */
  trigger?: LensWarpTrigger;
  /** Make the pass only the first time. @default true */
  once?: boolean;
  /** Wait before the pass, ms. @default 250 */
  delay?: number;
  /** How long the pass takes to cross the words, ms. @default 1600 */
  duration?: number;
  /** For `trigger="manual"`: true runs the pass. */
  active?: boolean;
  /** Fires when the pass is over and the type has relaxed. */
  onComplete?: () => void;
  /** Fires when the visitor moves the bead onto another word — by pointer or keys — and with null when it lifts. The automatic pass is not reported. */
  onWordChange?: (word: string | null) => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** While the bead is on the words, letters track it on the snap spring. */
const TRACK_K = springs.snap.stiffness / springs.snap.mass;
const TRACK_C = springs.snap.damping / springs.snap.mass;
/** When it leaves, they relax on a softer spring whose damping `wobble` sets. */
const RELAX_K = 420;
/** The largest bead, in em of the type. */
const REACH = 1.5;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const graphemes = (text: string): string[] =>
  segmenter
    ? Array.from(segmenter.segment(text), (s) => s.segment)
    : Array.from(text);

type Glyph = {
  char: string;
  word: number;
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  tint: MotionValue<number>;
};

type Layout = {
  glyphs: Glyph[];
  words: { at: number[]; key: number }[];
};

function layoutOf(text: string): Layout {
  const glyphs: Glyph[] = [];
  const words: Layout["words"] = [];
  let current: number[] = [];
  graphemes(text).forEach((char, i) => {
    if (char.trim() === "") {
      if (current.length) words.push({ at: current, key: i });
      current = [];
      return;
    }
    current.push(glyphs.length);
    glyphs.push({
      char,
      word: words.length,
      x: motionValue(0),
      y: motionValue(0),
      scale: motionValue(1),
      tint: motionValue(0),
    });
  });
  if (current.length) words.push({ at: current, key: text.length });
  return { glyphs, words };
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Letter({ g, tint }: { g: Glyph; tint: string }) {
  const color = useTransform(g.tint, (t) =>
    t <= 0.005
      ? "currentColor"
      : `color-mix(in oklab, ${tint} ${Math.round(clamp01(t) * 100)}%, currentColor)`,
  );
  // A magnified letter is lifted above its neighbours.
  const z = useTransform(g.scale, (s) => (s > 1.02 ? 2 : s < 0.98 ? 0 : 1));
  return (
    <motion.span
      className="relative inline-block"
      style={{ x: g.x, y: g.y, scale: g.scale, color, zIndex: z }}
    >
      {g.char}
    </motion.span>
  );
}

type Sim = {
  frame: number;
  last: number;
  /** Per letter: rest centre, then the spring's own state for x, y and scale (unrounded: the motion values carry rounded copies). */
  cx: Float32Array;
  cy: Float32Array;
  px: Float32Array;
  py: Float32Array;
  ps: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vs: Float32Array;
  em: number;
  width: number;
  height: number;
  /** The pass is under way, or waiting to report it is done. */
  passing: boolean;
  reportRest: boolean;
  played: boolean;
  timer: number | null;
  /** Which word the keyboard's bead is on, or -1. */
  word: number;
  /** The bead is held by the pointer or the keyboard. */
  held: "none" | "pointer" | "keys" | "pass";
};

type Api = {
  frame: (now: number) => void;
  wake: () => void;
  measure: () => void;
  pass: () => void;
  startPass: () => void;
};

/**
 * A headline under a moving glass bead. Letters near the bead's centre
 * magnify and are pushed outward with a smooth radial falloff — the barrel
 * bulge of a convex lens — while letters at its rim are squeezed and drawn in
 * a little, and the whole bead carries a faint highlight. Every letter's
 * offset and scale follow their targets through its own spring, integrated in
 * one loop: on the snap spring while the bead is on the words, so the type
 * tracks it crisply, and on a softer, under-damped spring when it leaves, so
 * the type relaxes with a visible wobble. No filters: per-letter transforms
 * only, so the type stays sharp and selectable.
 *
 * The bead follows a mouse or pen 1:1, comes down under a finger, and makes
 * one pass across the words on its own when the trigger fires. The piece is
 * focusable: focus brings the bead to the first word, Left and Right walk it
 * word by word on the glide spring, Home and End jump, and Escape lifts it.
 * The text is read once from an sr-only copy. Under reduced motion nothing
 * moves or scales: the bead appears in place and the letters under it lean
 * toward `tint` by the same falloff.
 */
export function LensWarp({
  text,
  as = "h2",
  radius = 52,
  power = 0.55,
  specular = 0.6,
  rim = 0.5,
  wobble = 0.5,
  bead = true,
  tint = "var(--accent-bright)",
  interactive = true,
  trigger = "inView",
  once = true,
  delay = 250,
  duration = 1600,
  active,
  onComplete,
  onWordChange,
  className,
}: LensWarpProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const [spoken, setSpoken] = React.useState("");

  const layout = React.useMemo(() => layoutOf(text), [text]);
  const n = layout.glyphs.length;

  const bx = useMotionValue(0);
  const by = useMotionValue(0);
  const presence = useMotionValue(0);
  const size = useMotionValue(radius);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLSpanElement>());
  const runs = React.useRef<{
    presence: AnimationPlaybackControls | null;
    move: AnimationPlaybackControls[];
  }>({ presence: null, move: [] });
  const sim = React.useRef<Sim>({
    frame: 0,
    last: 0,
    cx: new Float32Array(0),
    cy: new Float32Array(0),
    px: new Float32Array(0),
    py: new Float32Array(0),
    ps: new Float32Array(0),
    vx: new Float32Array(0),
    vy: new Float32Array(0),
    vs: new Float32Array(0),
    em: 16,
    width: 0,
    height: 0,
    passing: false,
    reportRest: false,
    played: false,
    timer: null,
    word: -1,
    held: "none",
  });
  const api = React.useRef<Api | null>(null);
  const done = React.useRef(onComplete);
  const told = React.useRef<{ word: number; report: typeof onWordChange }>({
    word: -1,
    report: onWordChange,
  });
  const pump = React.useCallback((now: number) => {
    sim.current.frame = 0;
    api.current?.frame(now);
  }, []);

  const R = () =>
    Math.max(12, Math.min(radius, REACH * (sim.current.em || 16)));

  const stopMoves = () => {
    for (const c of runs.current.move) c.stop();
    runs.current.move = [];
  };

  /** The bead comes down onto the words. */
  const lower = () => {
    runs.current.presence?.stop();
    runs.current.presence = motionSafe
      ? animate(presence, 1, springs.snap)
      : animate(presence, 1, { duration: durations.fast });
    wake();
  };

  /** Tells the host which word sits under the bead's centre, when it changes. */
  const tell = (w: number) => {
    const t = told.current;
    if (t.word === w) return;
    t.word = w;
    const word = layout.words[w];
    t.report?.(
      word ? word.at.map((i) => layout.glyphs[i]?.char ?? "").join("") : null,
    );
  };

  /** The word nearest the bead's centre, within half its radius. */
  const wordAt = (x: number, y: number) => {
    const S = sim.current;
    const reach = R() * 0.5;
    let best = -1;
    let bestD = reach;
    layout.glyphs.forEach((g, i) => {
      const d = Math.hypot((S.cx[i] ?? 0) - x, (S.cy[i] ?? 0) - y);
      if (d < bestD) {
        bestD = d;
        best = g.word;
      }
    });
    return best;
  };

  /** The bead lifts off and the type relaxes. */
  const lift = () => {
    tell(-1);
    runs.current.presence?.stop();
    runs.current.presence = animate(presence, 0, {
      duration: motionSafe ? durations.fast : durations.base,
      ease: easings.exit,
    });
    wake();
  };

  const frame = (now: number) => {
    const S = sim.current;
    const dt = S.last ? Math.min(0.032, (now - S.last) / 1000) : 1 / 60;
    S.last = now;
    const p = clamp01(presence.get());
    const r = R();
    const x0 = bx.get();
    const y0 = by.get();
    const amp = clamp01(power);
    const squeeze = clamp01(rim);
    const tracking = p > 0.02 && S.held !== "none";
    const k = tracking ? TRACK_K : RELAX_K;
    const c = tracking
      ? TRACK_C
      : 2 * lerp(0.9, 0.38, clamp01(wobble)) * Math.sqrt(RELAX_K);
    let busy = p > 0.001;
    const h = dt / 2;
    for (let i = 0; i < n; i += 1) {
      const g = layout.glyphs[i];
      if (!g) continue;
      const dx = (S.cx[i] ?? 0) - x0;
      const dy = (S.cy[i] ?? 0) - y0;
      const d = Math.hypot(dx, dy) || 0.001;
      const u = d / r;
      let tx = 0;
      let ty = 0;
      let ts = 1;
      let tt = 0;
      if (p > 0.001) {
        if (u < 1) {
          const core = (1 - u * u) ** 2;
          ts += 0.9 * amp * core * p;
          const push = r * amp * 0.34 * u * (1 - u) ** 2 * 3 * p;
          tx += (dx / d) * push;
          ty += (dy / d) * push;
          tt = core * p * 0.38;
        }
        const bump = Math.exp(-(((u - 1.05) / 0.2) ** 2));
        ts -= squeeze * amp * 0.22 * bump * p;
        const pull = r * 0.05 * amp * squeeze * bump * p;
        tx -= (dx / d) * pull;
        ty -= (dy / d) * pull;
      }
      if (!motionSafe) {
        g.tint.set(r3(tt * 1.6));
        continue;
      }
      g.tint.set(r3(tt));
      // Each letter's own spring, two half steps a frame.
      let x = S.px[i] ?? 0;
      let y = S.py[i] ?? 0;
      let s = S.ps[i] ?? 1;
      let vx = S.vx[i] ?? 0;
      let vy = S.vy[i] ?? 0;
      let vs = S.vs[i] ?? 0;
      for (let step = 0; step < 2; step += 1) {
        vx += (k * (tx - x) - c * vx) * h;
        vy += (k * (ty - y) - c * vy) * h;
        vs += (k * (ts - s) - c * vs) * h;
        x += vx * h;
        y += vy * h;
        s += vs * h;
      }
      S.vx[i] = vx;
      S.vy[i] = vy;
      S.vs[i] = vs;
      const still =
        Math.abs(x - tx) < 0.05 &&
        Math.abs(y - ty) < 0.05 &&
        Math.abs(s - ts) < 0.002 &&
        Math.abs(vx) + Math.abs(vy) < 1 &&
        Math.abs(vs) < 0.02;
      if (still && p <= 0.001) {
        x = tx;
        y = ty;
        s = ts;
        S.vx[i] = 0;
        S.vy[i] = 0;
        S.vs[i] = 0;
      } else {
        busy = true;
      }
      S.px[i] = x;
      S.py[i] = y;
      S.ps[i] = s;
      g.x.set(r2(x));
      g.y.set(r2(y));
      g.scale.set(r3(s));
    }
    if (busy) {
      S.frame = window.requestAnimationFrame(pump);
      return;
    }
    S.last = 0;
    if (S.reportRest) {
      S.reportRest = false;
      done.current?.();
    }
  };

  const wake = () => {
    const S = sim.current;
    if (S.frame || !running) return;
    S.last = 0;
    S.frame = window.requestAnimationFrame(pump);
  };

  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const S = sim.current;
    const rect = root.getBoundingClientRect();
    S.width = rect.width;
    S.height = rect.height;
    const first = nodes.current.get(0);
    S.em = first ? parseFloat(getComputedStyle(first).fontSize) || 16 : 16;
    if (S.cx.length !== n) {
      S.cx = new Float32Array(n);
      S.cy = new Float32Array(n);
      S.px = new Float32Array(n);
      S.py = new Float32Array(n);
      S.ps = new Float32Array(n).fill(1);
      S.vx = new Float32Array(n);
      S.vy = new Float32Array(n);
      S.vs = new Float32Array(n);
    }
    // Rest centres from layout offsets, which transforms never touch.
    for (let i = 0; i < n; i += 1) {
      const node = nodes.current.get(i);
      if (!node) continue;
      let left = node.offsetWidth / 2;
      let top = node.offsetHeight / 2;
      let el: HTMLElement | null = node;
      while (el && el !== root) {
        left += el.offsetLeft;
        top += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      S.cx[i] = left;
      S.cy[i] = top;
    }
    size.set(R());
  };

  /** The centre of word `w`, for the keyboard's bead. */
  const wordCentre = (w: number) => {
    const S = sim.current;
    let lo = Infinity;
    let hi = -Infinity;
    let y = 0;
    let count = 0;
    layout.glyphs.forEach((g, i) => {
      if (g.word !== w) return;
      lo = Math.min(lo, S.cx[i] ?? 0);
      hi = Math.max(hi, S.cx[i] ?? 0);
      y += S.cy[i] ?? 0;
      count += 1;
    });
    if (!count) return null;
    return { x: (lo + hi) / 2, y: y / count };
  };

  const moveTo = (x: number, y: number, glide: boolean) => {
    stopMoves();
    if (glide && motionSafe) {
      runs.current.move = [
        animate(bx, x, springs.glide),
        animate(by, y, springs.glide),
      ];
    } else {
      bx.set(r2(x));
      by.set(r2(y));
    }
    wake();
  };

  const walk = (w: number) => {
    const S = sim.current;
    const count = layout.words.length;
    if (!count) return;
    const to = clamp(w, 0, count - 1);
    const c = wordCentre(to);
    if (!c) return;
    const fresh = S.held !== "keys" || presence.get() < 0.5;
    S.word = to;
    S.held = "keys";
    S.passing = false;
    moveTo(c.x, c.y, !fresh);
    lower();
    tell(to);
    const word = layout.words[to];
    setSpoken(
      word ? word.at.map((i) => layout.glyphs[i]?.char ?? "").join("") : "",
    );
  };

  /** One pass across the words, on its own, then the bead lifts. */
  const startPass = () => {
    const S = sim.current;
    S.timer = null;
    if (S.held === "pointer" || S.held === "keys") return;
    measure();
    if (!motionSafe) {
      // No travel: the first word takes the tint for a moment.
      const c = wordCentre(0);
      if (!c) return;
      S.held = "pass";
      moveTo(c.x, c.y, false);
      lower();
      S.timer = window.setTimeout(() => {
        S.timer = null;
        if (S.held !== "pass") return;
        S.held = "none";
        S.reportRest = true;
        lift();
      }, 900);
      return;
    }
    const r = R();
    const startX = -r * 0.6;
    const endX = S.width + r * 0.6;
    const midY = S.height / 2;
    S.held = "pass";
    S.passing = true;
    bx.set(r2(startX));
    by.set(r2(midY));
    lower();
    stopMoves();
    runs.current.move = [
      animate(0, 1, {
        duration: Math.max(0.4, duration / 1000),
        ease: easings.move,
        onUpdate: (t) => {
          const x = lerp(startX, endX, t);
          // A gentle arc, as a hand would carry it.
          const y = midY - Math.sin(Math.PI * t) * r * 0.18;
          bx.set(r2(x));
          by.set(r2(y));
        },
        onComplete: () => {
          const s = sim.current;
          s.passing = false;
          if (s.held !== "pass") return;
          s.held = "none";
          s.reportRest = true;
          api.current?.wake();
          lift();
        },
      }),
    ];
  };

  const pass = () => {
    const S = sim.current;
    if (S.timer !== null) window.clearTimeout(S.timer);
    S.played = true;
    S.timer = window.setTimeout(
      () => api.current?.startPass(),
      Math.max(0, delay),
    );
  };

  React.useLayoutEffect(() => {
    api.current = {
      frame,
      wake,
      measure,
      pass,
      startPass,
    };
    done.current = onComplete;
    told.current.report = onWordChange;
  });

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [layout, radius]);

  React.useEffect(() => {
    if (trigger === "mount") api.current?.pass();
  }, [trigger]);

  React.useEffect(() => {
    if (trigger === "manual" && active) api.current?.pass();
  }, [trigger, active]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    const S = sim.current;
    return () => {
      if (S.frame) window.cancelAnimationFrame(S.frame);
      S.frame = 0;
      S.last = 0;
    };
  }, [running, motionSafe]);

  React.useEffect(() => {
    const S = sim.current;
    const r = runs.current;
    return () => {
      if (S.timer !== null) window.clearTimeout(S.timer);
      S.timer = null;
      r.presence?.stop();
      for (const c of r.move) c.stop();
      r.move = [];
    };
  }, []);

  const latestTrigger = React.useRef({ trigger, once });
  React.useEffect(() => {
    latestTrigger.current = { trigger, once };
  });

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        setOnScreen(entry.isIntersecting);
        const { trigger: t, once: o } = latestTrigger.current;
        if (t !== "inView") return;
        if (entry.intersectionRatio >= 0.6 && (!sim.current.played || !o)) {
          api.current?.pass();
        }
      },
      { threshold: [0, 0.6] },
    );
    watcher.observe(node);
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      watcher.disconnect();
      sizer.disconnect();
    };
  }, []);

  const bindGlyph = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) nodes.current.set(i, node);
    else nodes.current.delete(i);
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  /** The pointer takes the bead, wherever it was. */
  const take = (clientX: number, clientY: number) => {
    const S = sim.current;
    const { x, y } = local(clientX, clientY);
    const fresh = S.held !== "pointer";
    if (S.passing || S.held === "pass") {
      S.passing = false;
      S.reportRest = false;
      stopMoves();
    }
    if (S.timer !== null && S.held === "pass") {
      window.clearTimeout(S.timer);
      S.timer = null;
    }
    S.held = "pointer";
    stopMoves();
    bx.set(r2(x));
    by.set(r2(y));
    if (fresh || presence.get() < 1) lower();
    tell(wordAt(x, y));
    wake();
  };

  const release = () => {
    const S = sim.current;
    if (S.held !== "pointer") return;
    S.held = "none";
    lift();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const S = sim.current;
    const count = layout.words.length;
    let to: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        to = S.held === "keys" ? S.word + 1 : 0;
        break;
      case "ArrowLeft":
        to = S.held === "keys" ? S.word - 1 : count - 1;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = count - 1;
        break;
      case "Escape":
        if (S.held !== "keys") return;
        S.held = "none";
        lift();
        setSpoken("");
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    walk(clamp(to, 0, count - 1));
  };

  const beadX = useTransform([bx, size], ([x = 0, r = 0]: number[]) =>
    r2(x - r),
  );
  const beadY = useTransform([by, size], ([y = 0, r = 0]: number[]) =>
    r2(y - r),
  );
  const beadSize = useTransform(size, (r) => r2(r * 2));
  const beadScale = useTransform(presence, (p) =>
    motionSafe ? r3(0.86 + 0.14 * p) : 1,
  );
  const beadOpacity = useTransform(presence, (p) => r3(clamp01(p)));
  const glint = clamp01(specular);

  const Tag = as as "h2";

  return (
    <div
      ref={bindRoot}
      role={interactive ? "group" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-describedby={interactive ? hintId : undefined}
      onPointerEnter={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        take(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!interactive) return;
        if (event.pointerType === "touch" && sim.current.held !== "pointer") {
          return;
        }
        take(event.clientX, event.clientY);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") release();
      }}
      onPointerDown={(event) => {
        if (!interactive || event.pointerType !== "touch") return;
        take(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") release();
      }}
      onPointerCancel={release}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.currentTarget.matches(":focus-visible")) walk(0);
      }}
      onBlur={() => {
        const S = sim.current;
        if (S.held !== "keys") return;
        S.held = "none";
        lift();
        setSpoken("");
      }}
      // Room for the bead above and below the words, in the same terms as
      // its radius, so the glass is never cut by the piece's own edge.
      style={{
        paddingBlock: `max(0.3em, calc(min(${Math.max(12, radius)}px, ${REACH}em) - 0.55em))`,
      }}
      className={cn(
        "relative overflow-clip px-[0.3em]",
        interactive &&
          "touch-pan-y rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <Tag className="relative m-0" style={{ font: "inherit" }}>
        <span className="sr-only select-none">{text}</span>
        <span aria-hidden className="relative block">
          {layout.words.map((word, w) => (
            <React.Fragment key={word.key}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {word.at.map((i) => (
                  <span key={i} ref={bindGlyph(i)} className="inline-block">
                    <Letter g={layout.glyphs[i] as Glyph} tint={tint} />
                  </span>
                ))}
              </span>
            </React.Fragment>
          ))}
        </span>
      </Tag>
      {bead ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 block rounded-full"
          style={{
            x: beadX,
            y: beadY,
            width: beadSize,
            height: beadSize,
            scale: beadScale,
            opacity: beadOpacity,
            // Glass: clear in the middle, a refracting edge darker toward
            // the rim, a thin bright lip, and a soft shadow under it.
            backgroundImage:
              "radial-gradient(circle at 50% 50%, transparent 58%, color-mix(in oklab, var(--foreground) 5%, transparent) 78%, color-mix(in oklab, var(--foreground) 13%, transparent) 97%, transparent 100%)",
            boxShadow:
              "inset 0 0 0 1px color-mix(in oklab, var(--foreground) 14%, transparent), inset 0 1px 0 1px oklch(1 0 0 / 0.35), 0 10px 24px -14px color-mix(in oklab, black 40%, transparent)",
          }}
        >
          {glint > 0 ? (
            <span
              className="absolute inset-0 rounded-full"
              style={{
                opacity: glint,
                // A small window glint up and to the left, and the light
                // that comes through the glass catching its lower right lip.
                backgroundImage:
                  "radial-gradient(ellipse 20% 11% at 33% 22%, oklch(1 0 0 / 0.85), oklch(1 0 0 / 0.25) 55%, transparent 100%)",
                boxShadow: "inset -2px -3px 4px -3px oklch(1 0 0 / 0.55)",
              }}
            />
          ) : null}
        </motion.span>
      ) : null}
      {interactive ? (
        <span id={hintId} className="sr-only">
          Use Left and Right to move the lens across the words; Escape lifts it.
        </span>
      ) : null}
      <span role="status" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
