"use client";

import * as React from "react";

import {
  motion,
  motionValue,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CutoutLettersElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type CutoutLettersTrigger = "mount" | "inView" | "hover" | "manual";

export type CutoutLettersTone = "cream" | "kraft" | "slate" | "blush";

export type CutoutLettersProps = {
  /** The headline, as a string. Wins over `text`. */
  children?: string;
  /** The headline, when it is not given as children. */
  text?: string;
  /** The element that carries the headline. @default "p" */
  as?: CutoutLettersElement;
  /** How far the pointer's reach extends, em. @default 2 */
  radius?: number;
  /** How far a tab folds up, degrees: under 90 they stand toward you, over 90 they tip over and show their backs. @default 120 */
  foldAngle?: number;
  /** The card stock. @default "cream" */
  paperTone?: CutoutLettersTone;
  /** How dark the raised tabs' shadows fall, 0 to 1. @default 0.6 */
  shadow?: number;
  /** How slowly tabs lie back down, 0 (the snap spring) to 1 (the drift spring). @default 0.4 */
  relax?: number;
  /** Perspective distance, em: smaller is a stronger 3D. @default 5 */
  depth?: number;
  /** When the wave of folding tabs runs across the headline. @default "inView" */
  trigger?: CutoutLettersTrigger;
  /** Run the wave once, or each time the headline re-enters view or is hovered. @default true */
  once?: boolean;
  /** With trigger "manual": true runs the wave. @default false */
  play?: boolean;
  /** Wait before the wave, ms. @default 0 */
  delay?: number;
  /** Time the wave takes from one letter to the next, ms. @default 55 */
  stagger?: number;
  /** The pointer, a touch drag and the keys lift the letters. @default true */
  interactive?: boolean;
  /** Paper sounds for the folds the visitor makes. Off unless asked for. @default false */
  sound?: boolean;
  /** The letter nearest the pointer or the keys changed; null when it lets go. */
  onFold?: (index: number | null) => void;
  /** The wave has passed and every tab lies flat. */
  onComplete?: () => void;
  className?: string;
};

type Stock = {
  /** The card's face, the stock under it, and the card's reverse. */
  paper: string;
  hole: string;
  back: string;
};

// Card is pigment: the same stock in either theme.
const STOCKS: Record<CutoutLettersTone, Stock> = {
  cream: {
    paper: "oklch(0.952 0.022 88)",
    hole: "oklch(0.43 0.035 62)",
    back: "oklch(0.988 0.004 95)",
  },
  kraft: {
    paper: "oklch(0.74 0.068 68)",
    hole: "oklch(0.35 0.045 50)",
    back: "oklch(0.84 0.045 78)",
  },
  slate: {
    paper: "oklch(0.43 0.022 250)",
    hole: "oklch(0.22 0.018 255)",
    back: "oklch(0.62 0.012 250)",
  },
  blush: {
    paper: "oklch(0.86 0.048 18)",
    hole: "oklch(0.44 0.07 12)",
    back: "oklch(0.94 0.022 25)",
  },
};

/** Card grain as an SVG noise tile: fixed art, the same in both themes. */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 0 0.2 0 0 0 -1.1 0.5'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** A smooth bell: full at the centre, nothing at the rim. */
const bell = (u: number) => (u >= 1 ? 0 : (1 - u * u) * (1 - u * u));

const STEP = 1 / 240;

/**
 * Hover is not a user activation: a sound asked for before the page has had
 * a click, tap or key would only make a context the browser will not start.
 */
const activated = (fallback: boolean) =>
  typeof navigator !== "undefined" &&
  ((navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation
    ?.hasBeenActive ??
    fallback);
/** A tab that slapped down rests this long before it can sound again, ms. */
const SOUND_COOLDOWN = 320;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/** A CSS custom property carried by a motion value (motion sets it with setProperty). */
const cssVar = (name: `--${string}`, value: MotionValue<number>) =>
  ({ [name]: value }) as MotionStyle;

type Cell = {
  angle: MotionValue<number>;
  shade: MotionValue<number>;
  face: MotionValue<number>;
};

type Model = {
  words: number[][];
  letters: string[];
  cells: Cell[];
};

function modelOf(text: string): Model {
  const words: number[][] = [];
  const letters: string[] = [];
  let word: number[] = [];
  for (const ch of graphemes(text.trim())) {
    if (/\s/.test(ch)) {
      if (word.length) words.push(word);
      word = [];
      continue;
    }
    word.push(letters.length);
    letters.push(ch);
  }
  if (word.length) words.push(word);
  return {
    words,
    letters,
    cells: letters.map(() => ({
      angle: motionValue(0),
      shade: motionValue(0),
      face: motionValue(1),
    })),
  };
}

type Body = {
  a: Float64Array;
  v: Float64Array;
  cx: Float64Array;
  cy: Float64Array;
  em: number;
  pitch: number;
  measured: boolean;
  at: { x: number; y: number } | null;
  /** The keyboard's letter, -1 when none. */
  key: number;
  /** The wave's position in letters; NaN when none runs. */
  wave: number;
  waveSpeed: number;
  /** Whether the visitor is the one folding (sounds answer only them). */
  visitor: boolean;
  /** The visitor has pressed or typed here (for browsers without userActivation). */
  pressed: boolean;
  cooled: Float64Array;
  up: Uint8Array;
  nearest: number;
};

const bodyOf = (n: number): Body => ({
  a: new Float64Array(n),
  v: new Float64Array(n),
  cx: new Float64Array(n),
  cy: new Float64Array(n),
  em: 16,
  pitch: 10,
  measured: false,
  at: null,
  key: -1,
  wave: Number.NaN,
  waveSpeed: 0,
  visitor: false,
  pressed: false,
  cooled: new Float64Array(n).fill(-Infinity),
  up: new Uint8Array(n),
  nearest: -1,
});

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Tab({
  char,
  cell,
  stock,
  shadow,
  persp,
  origin,
  bind,
}: {
  char: string;
  cell: Cell;
  stock: Stock;
  shadow: number;
  persp: MotionValue<number>;
  origin: string;
  bind: (node: HTMLSpanElement | null) => void;
}) {
  // The raised tab's shadow falls on the card below its hinge, as long as
  // the tab is tall against the light, and skews away from the top-left lamp.
  const lift = useTransform(cell.angle, (a) =>
    Math.sin((Math.min(180, Math.max(0, a)) * Math.PI) / 180),
  );
  const shadowOpacity = useTransform(lift, (s) => r3(s * shadow * 0.5));
  const shadowScale = useTransform(lift, (s) => r3(-0.06 - 0.5 * s));
  const tilt = useTransform(cell.angle, (a) => -r2(a));
  return (
    <span ref={bind} className="relative inline-block">
      {/* The hole: the darker stock under the card, shadowed by its rim. */}
      <span
        aria-hidden
        className="absolute inset-0 bg-clip-text text-transparent"
        style={{
          backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${stock.hole}, black 45%) 22%, ${stock.hole} 46%)`,
        }}
      >
        {char}
      </span>
      <motion.span
        aria-hidden
        className="absolute inset-0 blur-[0.035em]"
        style={{
          color: "oklch(0.18 0.02 60)",
          opacity: shadowOpacity,
          scaleY: shadowScale,
          skewX: -14,
          originY: origin,
        }}
      >
        {char}
      </motion.span>
      <motion.span
        className="relative block"
        style={{
          rotateX: tilt,
          transformPerspective: persp,
          originY: origin,
          transformStyle: "preserve-3d",
        }}
      >
        <motion.span
          className="block [backface-visibility:hidden]"
          style={{
            color: `color-mix(in oklab, ${stock.paper}, black calc(var(--cut-shade) * 1%))`,
            WebkitTextStroke: `0.016em color-mix(in oklab, ${stock.paper}, black 46%)`,
            textShadow: `0 -0.012em 0 color-mix(in oklab, ${stock.paper}, black 22%), 0 0.016em 0 color-mix(in oklab, ${stock.paper}, white 55%)`,
            opacity: cell.face,
            ...cssVar("--cut-shade", cell.shade),
          }}
        >
          {char}
        </motion.span>
        <span
          className="absolute inset-0 block [backface-visibility:hidden]"
          style={{
            color: stock.back,
            transform: "rotateY(180deg) scaleX(-1)",
            WebkitTextStroke: `0.012em color-mix(in oklab, ${stock.back}, black 22%)`,
          }}
        >
          {char}
        </span>
      </motion.span>
    </span>
  );
}

type Api = {
  wake: () => void;
  halt: () => void;
  wave: (on: boolean) => void;
  measure: () => void;
};

/**
 * A headline die-cut into heavy card. Each letter is a tab hinged along its
 * baseline, lying in its own hole and read by its cut line. Near the pointer
 * the tabs fold up out of their holes toward you in real 3D: the top rises and
 * grows, the face darkens as it turns from the top light, a soft shadow falls
 * on the card below, and past ninety degrees the tab tips over and lies face
 * down, showing the blank reverse of the stock while the hole shows the darker
 * card underneath. Away from the pointer they fold flat again.
 *
 * Each tab's angle is a spring: it rises on the snap calibration (card is
 * springy) and lies back on a spring between snap and drift (`relax`), and a
 * tab that comes down fast slaps into its hole with one small bounce. The
 * signature wave — on the trigger and on keyboard focus — lifts the whole
 * word one letter after another.
 *
 * A transparent slider over the headline gives the keyboard the same: Left
 * and Right lift letters one at a time, Home and End jump, Escape lays them
 * flat, Enter or Space runs the wave. Touch lifts with a press-and-drag. One
 * loop moves every tab and stops when they all lie flat. The headline is read
 * once from an sr-only copy. Under reduced motion no tab moves: lifted letters
 * show their dark holes instead, and the wave is a wave of holes.
 */
export function CutoutLetters({
  children,
  text,
  as = "p",
  radius = 2,
  foldAngle = 120,
  paperTone = "cream",
  shadow = 0.6,
  relax = 0.4,
  depth = 5,
  trigger = "inView",
  once = true,
  play = false,
  delay = 0,
  stagger = 55,
  interactive = true,
  sound = false,
  onFold,
  onComplete,
  className,
}: CutoutLettersProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const line = (typeof children === "string" ? children : text) ?? "";
  const stock = STOCKS[paperTone] ?? STOCKS.cream;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);
  const [keyOn, setKeyOn] = React.useState(-1);
  const [origin, setOrigin] = React.useState("80%");

  const model = React.useMemo(() => modelOf(line), [line]);
  const n = model.letters.length;
  const [persp] = React.useState(() => motionValue(80));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const letterNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const body = React.useRef<Body>(bodyOf(0));
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    radius,
    foldAngle,
    relax,
    stagger,
    depth,
    motionSafe,
    line,
    audio,
    onFold,
    onComplete,
  });
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  /** Rest centres of the letters (their boxes never move), and the hinge. */
  const measure = () => {
    const root = rootRef.current;
    const b = body.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const style = getComputedStyle(root);
    b.em = parseFloat(style.fontSize) || 16;
    let first = Number.NaN;
    let lastX = Number.NaN;
    let count = 0;
    for (let i = 0; i < b.a.length; i += 1) {
      const node = letterNodes.current.get(i);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      b.cx[i] = r.left - rect.left + r.width / 2;
      b.cy[i] = r.top - rect.top + r.height / 2;
      if (Number.isNaN(first)) first = b.cx[i] ?? 0;
      lastX = b.cx[i] ?? 0;
      count += 1;
    }
    b.pitch = count > 1 ? Math.max(4, (lastX - first) / (count - 1)) : b.em;
    b.measured = true;
    persp.set(Math.round(cfg.current.depth * b.em));
    // The hinge is the baseline: where it falls in a letter's box.
    const node = letterNodes.current.get(0);
    const probe = document.createElement("canvas").getContext("2d");
    if (node && probe) {
      const s = getComputedStyle(node);
      probe.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const m = probe.measureText("Hg");
      const asc = m.fontBoundingBoxAscent;
      const desc = m.fontBoundingBoxDescent;
      const box = node.getBoundingClientRect().height;
      if (asc > 0 && box > 0) {
        const base = (box - (asc + desc)) / 2 + asc;
        const next = `${Math.round(clamp01(base / box) * 1000) / 10}%`;
        setOrigin((prev) => (prev === next ? prev : next));
      }
    }
  };

  /** Advances every tab by dt seconds; returns whether anything moves. */
  const step = (dt: number, now: number): boolean => {
    const b = body.current;
    const c = cfg.current;
    const count = b.a.length;
    if (!b.measured) measure();
    const fold = clamp(c.foldAngle, 10, 178);
    const reach = Math.max(0.3, c.radius) * b.em;
    let waving = false;
    if (!Number.isNaN(b.wave)) {
      b.wave += b.waveSpeed * dt;
      if (b.wave > count + 2.5) {
        b.wave = Number.NaN;
        c.onComplete?.();
      } else waving = true;
    }
    const keyAt =
      b.key >= 0 && b.key < count
        ? { x: b.cx[b.key] ?? 0, y: b.cy[b.key] ?? 0 }
        : null;
    const at = keyAt ?? b.at;
    const kUp = springs.snap.stiffness / springs.snap.mass;
    const cUp = springs.snap.damping / springs.snap.mass;
    const r = clamp01(c.relax);
    const kDown = lerp(kUp, springs.drift.stiffness / springs.drift.mass, r);
    const cDown = lerp(cUp, springs.drift.damping / springs.drift.mass, r);
    let busy = waving;
    let nearest = -1;
    let nearestD = Infinity;
    for (let i = 0; i < count; i += 1) {
      let target = 0;
      if (at) {
        const dx = (b.cx[i] ?? 0) - at.x;
        const dy = ((b.cy[i] ?? 0) - at.y) * 1.6;
        const d = Math.hypot(dx, dy);
        if (d < nearestD) {
          nearestD = d;
          nearest = i;
        }
        target = fold * bell(d / reach);
      }
      if (waving) {
        target = Math.max(
          target,
          fold * 0.85 * bell(Math.abs(i - b.wave) / 1.8),
        );
      }
      let a = b.a[i] ?? 0;
      let v = b.v[i] ?? 0;
      if (!c.motionSafe) {
        a = target;
        v = 0;
      } else {
        let left = dt;
        while (left > 1e-7) {
          const h = Math.min(STEP, left);
          left -= h;
          const up = target > a;
          const k = up ? kUp : kDown;
          const damp = up ? cUp : cDown;
          v += (-k * (a - target) - damp * v) * h;
          a += v * h;
          // Card cannot fold back through the sheet: it slaps flat and
          // bounces once, a little.
          if (a < 0) {
            const speed = -v;
            a = 0;
            v = speed * 0.25;
            if (
              speed > 160 &&
              b.visitor &&
              activated(b.pressed) &&
              now - (b.cooled[i] ?? -Infinity) > SOUND_COOLDOWN
            ) {
              b.cooled[i] = now;
              c.audio.play("paper", {
                pitch: 0.75 + ((hash(`${c.line}${i}`) % 100) / 100) * 0.2,
                gain: r2(clamp(speed / 900, 0.12, 0.35)),
                pan: rootRef.current
                  ? panFrom(
                      rootRef.current.getBoundingClientRect().left +
                        (b.cx[i] ?? 0),
                      rootRef.current,
                    )
                  : 0,
              });
            }
          }
        }
      }
      // The crinkle of a tab coming up past half its fold.
      const half = a > fold * 0.5;
      if (
        half &&
        !b.up[i] &&
        b.visitor &&
        c.motionSafe &&
        activated(b.pressed)
      ) {
        if (now - (b.cooled[i] ?? -Infinity) > SOUND_COOLDOWN) {
          b.cooled[i] = now;
          c.audio.play("paper", {
            pitch: 1 + ((hash(`${c.line}${i}`) % 100) / 100) * 0.3,
            gain: 0.32,
            pan: rootRef.current
              ? panFrom(
                  rootRef.current.getBoundingClientRect().left + (b.cx[i] ?? 0),
                  rootRef.current,
                )
              : 0,
          });
        }
      }
      b.up[i] = half ? 1 : 0;
      b.a[i] = a;
      b.v[i] = v;
      if (Math.abs(a - target) > 0.05 || Math.abs(v) > 0.05) busy = true;
      const cell = model.cells[i];
      if (!cell) continue;
      if (c.motionSafe) {
        cell.angle.set(r2(a));
        // The face turns away from the top light as it rises.
        const turn = Math.sin((Math.min(90, a) * Math.PI) / 180);
        cell.shade.set(r2(turn * 30));
        cell.face.set(1);
      } else {
        // Still: a lifted letter shows its hole instead of moving.
        cell.angle.set(0);
        cell.shade.set(0);
        cell.face.set(r3(1 - 0.88 * clamp01(target / fold)));
      }
    }
    const leaning = b.key >= 0 ? b.key : at ? nearest : -1;
    if (leaning !== b.nearest) {
      b.nearest = leaning;
      c.onFold?.(leaning < 0 ? null : leaning);
    }
    return busy;
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const busy = step(dt, now);
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
    }
  };

  /** The wave: a bump of fold that travels the word once. */
  const wave = (on: boolean) => {
    const b = body.current;
    if (!on) {
      b.wave = Number.NaN;
      wake();
      return;
    }
    b.wave = -2.5;
    b.waveSpeed = 1000 / Math.max(15, cfg.current.stagger);
    wake();
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      radius,
      foldAngle,
      relax,
      stagger,
      depth,
      motionSafe,
      line,
      audio,
      onFold,
      onComplete,
    };
    frameRef.current = frame;
    live.current = running;
    api.current = { wake, halt, wave, measure };
  });

  React.useLayoutEffect(() => {
    body.current = bodyOf(model.cells.length);
    api.current?.measure();
  }, [model]);

  const waveTimer = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!started) return;
    waveTimer.current = window.setTimeout(() => {
      waveTimer.current = null;
      body.current.visitor = false;
      api.current?.wave(true);
    }, delay);
    return () => {
      if (waveTimer.current !== null) window.clearTimeout(waveTimer.current);
      waveTimer.current = null;
    };
    // The delay belongs to the trigger, not to a later change of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, entrance.n, model]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  React.useEffect(() => {
    api.current?.measure();
    api.current?.wake();
  }, [depth, foldAngle, radius, motionSafe]);

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback((restart: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, 0);
  }, []);
  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false);
    if (trigger === "manual") {
      if (play) begin(true);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, begin, reset]);

  const seen = React.useRef({ trigger, once, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once };
    if (started) seen.current.played = true;
  });

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const remeasure = () => api.current?.measure();
      const sizer = new ResizeObserver(remeasure);
      sizer.observe(node);
      document.fonts?.addEventListener?.("loadingdone", remeasure);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (visible) begin(false);
        else if (!t.once && t.played) reset();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        document.fonts?.removeEventListener?.("loadingdone", remeasure);
      };
    },
    [begin, reset],
  );

  const bindLetter = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) letterNodes.current.set(i, node);
    else letterNodes.current.delete(i);
  };

  const pointAt = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const b = body.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    b.at = { x: clientX - rect.left, y: clientY - rect.top };
    b.visitor = true;
    wake();
  };

  const letGo = () => {
    body.current.at = null;
    wake();
  };

  const drag = useDrag({
    axis: "x",
    threshold: 2,
    disabled: !interactive,
    onMove: ({ point, event }) => {
      if (event.pointerType === "touch") pointAt(point.x, point.y);
    },
    onEnd: ({ event }) => {
      if (event.pointerType === "touch") letGo();
    },
    onCancel: letGo,
    onTap: (event) => {
      if (event.pointerType === "touch") letGo();
    },
  });

  const lean = (to: number) => {
    const b = body.current;
    b.key = to;
    b.visitor = true;
    setKeyOn(to);
    wake();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    body.current.pressed = true;
    if (n === 0) return;
    let to: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        to = keyOn < 0 ? 0 : Math.min(n - 1, keyOn + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        to = keyOn < 0 ? n - 1 : Math.max(0, keyOn - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      case "Escape":
        if (keyOn < 0) return;
        event.preventDefault();
        lean(-1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        body.current.visitor = true;
        wave(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    lean(to);
  };

  const Tag = as;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={bindRoot}
        className={cn(
          "relative overflow-clip rounded-3 px-[0.55em] pt-[0.35em] pb-[0.6em] shadow-[0_1px_2px_oklch(0_0_0/0.12),0_8px_20px_-12px_oklch(0_0_0/0.35)] [contain:paint]",
          interactive && "touch-pan-y",
        )}
        style={{
          backgroundColor: stock.paper,
          backgroundImage: `linear-gradient(170deg, oklch(1 0 0 / 0.16), transparent 45%, oklch(0 0 0 / 0.06)), ${GRAIN}`,
          backgroundSize: "auto, 160px 160px",
        }}
        onPointerEnter={() => {
          if (trigger === "hover") begin(!once);
        }}
        onPointerDown={(event) => {
          drag.onPointerDown(event);
          if (!interactive) return;
          body.current.pressed = true;
          pointAt(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (!interactive || event.pointerType === "touch") return;
          pointAt(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          drag.onPointerUp(event);
          if (event.pointerType === "touch") letGo();
        }}
        onPointerCancel={(event) => {
          drag.onPointerCancel(event);
          letGo();
        }}
        onLostPointerCapture={drag.onLostPointerCapture}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          if (trigger === "hover" && !once) reset();
          letGo();
        }}
      >
        <Tag className="m-0 block">
          <span className="sr-only">{line}</span>
          <span aria-hidden className="block select-none">
            {model.words.map((word, w) => (
              <React.Fragment key={w}>
                {w > 0 ? " " : null}
                <span className="inline-block whitespace-nowrap">
                  {word.map((i) => (
                    <Tab
                      key={i}
                      char={model.letters[i] ?? ""}
                      cell={model.cells[i] as Cell}
                      stock={stock}
                      shadow={clamp01(shadow)}
                      persp={persp}
                      origin={origin}
                      bind={bindLetter(i)}
                    />
                  ))}
                </span>
              </React.Fragment>
            ))}
          </span>
        </Tag>
      </div>
      {interactive && n > 0 ? (
        <>
          <span
            role="slider"
            tabIndex={0}
            aria-label="Lift letters"
            aria-describedby={hintId}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={n}
            aria-valuenow={keyOn + 1}
            aria-valuetext={
              keyOn < 0
                ? "Flat"
                : `Lifting “${model.letters[keyOn] ?? ""}”, letter ${keyOn + 1} of ${n}`
            }
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              if (trigger === "hover") begin(!once);
              // Keyboard focus raises the whole word in one wave.
              if (event.currentTarget.matches(":focus-visible")) {
                body.current.visitor = true;
                wave(true);
              }
            }}
            onBlur={() => {
              if (keyOn >= 0) lean(-1);
            }}
            className="pointer-events-none absolute inset-0 rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Left and Right lift the letters one at a time; Enter runs a wave
            across; Escape lays them flat.
          </span>
        </>
      ) : null}
    </div>
  );
}
