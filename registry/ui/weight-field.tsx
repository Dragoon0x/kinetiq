"use client";

import * as React from "react";

import {
  motion,
  motionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type WeightFieldElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type WeightFieldTrigger = "mount" | "inView" | "hover" | "manual";

export type WeightFieldProps = {
  /** The line, as a string. Wins over `text`. */
  children?: string;
  /** The line, when it is not given as children. */
  text?: string;
  /** The element that carries the line. @default "p" */
  as?: WeightFieldElement;
  /** How far the pointer's pull reaches, em of the text size. @default 2.5 */
  radius?: number;
  /** Weight of a relaxed letter, on the font's `wght` axis. @default 400 */
  minWeight?: number;
  /** Weight of a fully swollen letter. @default 700 */
  maxWeight?: number;
  /** Width of a relaxed letter, on the font's `wdth` axis (100 is normal). @default 80 */
  minWidth?: number;
  /** Width of a fully swollen letter. @default 100 */
  maxWidth?: number;
  /** How hard the pointer leans, 0 to 1. @default 1 */
  lean?: number;
  /** How slowly the swell relaxes behind the pointer: 0 snaps back, 1 leaves a long wake (the drift spring). @default 0.55 */
  relax?: number;
  /** Which way the swell is drawn: the font's own axes, a scale-and-stroke fallback, or whichever the font supports. @default "auto" */
  axes?: "auto" | "variable" | "scale";
  /** Where the relaxed line sits in the room the swollen line needs. @default "center" */
  align?: "start" | "center" | "end";
  /** The pointer, a touch drag and the keys lean on the letters. @default true */
  interactive?: boolean;
  /** When the flex wave runs across the line. @default "inView" */
  trigger?: WeightFieldTrigger;
  /** Run the wave once, or each time the line re-enters view or is hovered. @default true */
  once?: boolean;
  /** Wait before the wave, ms. @default 0 */
  delay?: number;
  /** How long the wave takes to cross the line, ms. @default 1100 */
  duration?: number;
  /** With trigger "manual": true runs the wave, false lets the line rest. @default false */
  play?: boolean;
  /** The letter the field is centred on changed, from the pointer or the keys; null when it lets go. */
  onLean?: (index: number | null) => void;
  /** The flex wave has crossed the line and relaxed. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** A smooth bell: full at the centre, nothing at the rim. */
const bell = (u: number) => (u >= 1 ? 0 : (1 - u * u) * (1 - u * u));

const STEP = 1 / 240;
/** Rough advance of a letter, em: turns the em radius into letters for the wave. */
const LETTER_EM = 0.56;

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

type Model = {
  chars: string[];
  /** Words as runs of letter indices; spaces are not letters. */
  words: number[][];
  /** Letter index → grapheme. */
  letters: string[];
  cells: MotionValue<number>[];
};

function modelOf(text: string): Model {
  const chars = graphemes(text.trim());
  const words: number[][] = [];
  const letters: string[] = [];
  let word: number[] = [];
  for (const ch of chars) {
    if (/\s/.test(ch)) {
      if (word.length) words.push(word);
      word = [];
      continue;
    }
    word.push(letters.length);
    letters.push(ch);
  }
  if (word.length) words.push(word);
  return { chars, words, letters, cells: letters.map(() => motionValue(0)) };
}

type Axes = { wght: boolean; wdth: boolean };

type Body = {
  t: Float64Array;
  v: Float64Array;
  /** Rest centres, px from the root's top-left. */
  x: Float64Array;
  y: Float64Array;
  em: number;
  measured: boolean;
  /** Re-measure once the line is relaxed. */
  stale: boolean;
  /** The pointer, px; null when away. */
  at: { x: number; y: number } | null;
  pressed: boolean;
  pressure: number;
  /** The keyboard's letter, -1 when none. */
  key: number;
  /** Wave position in letters; NaN when no wave runs. */
  wave: number;
  waveEnd: number;
  waveSpeed: number;
  nearest: number;
};

const bodyOf = (n: number): Body => ({
  t: new Float64Array(n),
  v: new Float64Array(n),
  x: new Float64Array(n),
  y: new Float64Array(n),
  em: 16,
  measured: false,
  stale: true,
  at: null,
  pressed: false,
  pressure: 1,
  key: -1,
  wave: Number.NaN,
  waveEnd: 0,
  waveSpeed: 0,
  nearest: -1,
});

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Letter({
  char,
  cell,
  draw,
  bind,
}: {
  char: string;
  cell: MotionValue<number>;
  draw: {
    axes: Axes;
    minWeight: number;
    maxWeight: number;
    minWidth: number;
    maxWidth: number;
  };
  bind: (node: HTMLSpanElement | null) => void;
}) {
  const { axes, minWeight, maxWeight, minWidth, maxWidth } = draw;
  const settings = useTransform(cell, (t) => {
    const parts: string[] = [];
    if (axes.wght) parts.push(`"wght" ${r1(lerp(minWeight, maxWeight, t))}`);
    if (axes.wdth) parts.push(`"wdth" ${r1(lerp(minWidth, maxWidth, t))}`);
    return parts.length ? parts.join(", ") : "normal";
  });
  // Without a width axis the letter is stretched, and padded by what the
  // stretch adds, so the line still makes room rather than overlapping.
  const stretch = Math.max(1, maxWidth / Math.max(1, minWidth));
  const scaleX = useTransform(cell, (t) =>
    axes.wdth ? 1 : r3(lerp(1, stretch, Math.max(0, t))),
  );
  const pad = useTransform(cell, (t) =>
    axes.wdth
      ? "0em"
      : `${r3((lerp(1, stretch, Math.max(0, t)) - 1) * LETTER_EM * 0.5)}em`,
  );
  // Without a weight axis the weight is a stroke in the letter's own colour.
  const heavy = Math.max(0, maxWeight - minWeight) / 300;
  const stroke = useTransform(cell, (t) =>
    axes.wght ? "0" : `${r3(Math.max(0, t) * 0.045 * heavy)}em`,
  );
  return (
    <motion.span
      ref={bind}
      className="inline-block [-webkit-text-stroke-color:currentColor]"
      style={{
        fontVariationSettings: settings,
        scaleX,
        paddingInline: pad,
        WebkitTextStrokeWidth: stroke,
      }}
    >
      {char}
    </motion.span>
  );
}

type Api = {
  wake: () => void;
  halt: () => void;
  wave: (on: boolean) => void;
  measure: () => void;
};

/**
 * Text pressure with a body. Each letter carries a tension, drawn through
 * the inherited variable font as weight and width, and the pointer is a
 * field: letters near it swell along a smooth bell of the distance, so the
 * word bulks up like a muscle under the pointer. The physics is a muscle's:
 * a letter tenses on the snap spring — one crisp flex — and relaxes on a
 * spring between snap and drift, so moving across the word leaves a wake of
 * weight relaxing behind the pointer. A press leans harder and wider; on
 * touch a press-and-drag does the same, and pen pressure counts. On arrival
 * a flex wave runs once across the line.
 *
 * The axes are found on the client by measuring a hidden probe at their
 * extremes; where a font lacks one, the swell falls back to a stroke for
 * weight and a stretch for width. An invisible copy set at the maximum
 * reserves the line's box, so nothing around it moves. The line is read once
 * from an sr-only copy; the letters are hidden from assistive technology and
 * copy as the real words. A keyboard handle leans on the letters one at a
 * time with the arrow keys. One loop integrates every letter and stops when
 * they are all at rest. Under reduced motion there is no wave and no spring:
 * the weight follows the pointer and keys directly.
 */
export function WeightField({
  children,
  text,
  as = "p",
  radius = 2.5,
  minWeight = 400,
  maxWeight = 700,
  minWidth = 80,
  maxWidth = 100,
  lean = 1,
  relax = 0.55,
  axes = "auto",
  align = "center",
  interactive = true,
  trigger = "inView",
  once = true,
  delay = 0,
  duration = 1100,
  play = false,
  onLean,
  onComplete,
  className,
}: WeightFieldProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const line = (typeof children === "string" ? children : text) ?? "";
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const [found, setFound] = React.useState<Axes | null>(null);
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);
  const [leanOn, setLeanOn] = React.useState(-1);

  const model = React.useMemo(() => modelOf(line), [line]);
  const n = model.letters.length;
  const used: Axes =
    axes === "variable"
      ? { wght: true, wdth: true }
      : axes === "scale"
        ? { wght: false, wdth: false }
        : (found ?? { wght: true, wdth: true });
  const draw = React.useMemo(
    () => ({
      axes: used,
      minWeight,
      maxWeight,
      minWidth,
      maxWidth,
    }),
    // The axes object is rebuilt each render; its two flags are what count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [used.wght, used.wdth, minWeight, maxWeight, minWidth, maxWidth],
  );

  const rootRef = React.useRef<HTMLElement | null>(null);
  const letterNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const body = React.useRef<Body>(bodyOf(0));
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    radius,
    lean,
    relax,
    duration,
    motionSafe,
    onLean,
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

  /** Rest centres of the letters, read while the line is relaxed. */
  const measure = () => {
    const root = rootRef.current;
    const b = body.current;
    if (!root) return;
    const moving = Array.from(b.t).some((t) => Math.abs(t) > 1e-3);
    if (moving) {
      b.stale = true;
      return;
    }
    const rect = root.getBoundingClientRect();
    b.em = parseFloat(getComputedStyle(root).fontSize) || 16;
    for (let i = 0; i < b.t.length; i += 1) {
      const node = letterNodes.current.get(i);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      b.x[i] = r.left - rect.left + r.width / 2;
      b.y[i] = r.top - rect.top + r.height / 2;
    }
    b.measured = true;
    b.stale = false;
  };

  /** Advances every letter by dt seconds; returns whether anything moves. */
  const step = (dt: number): boolean => {
    const b = body.current;
    const c = cfg.current;
    const count = b.t.length;
    if (!b.measured) measure();
    const safe = c.motionSafe;
    const reachPx = Math.max(0.25, c.radius) * b.em;
    const press = b.pressed ? 1.25 : 1;
    const strength = clamp01(c.lean) * (b.pressed ? 1 : 0.92) * b.pressure;
    let waving = false;
    if (!Number.isNaN(b.wave)) {
      b.wave += b.waveSpeed * dt;
      if (b.wave > b.waveEnd) b.wave = Number.NaN;
      else waving = true;
    }
    const reachLetters = Math.max(0.5, c.radius / LETTER_EM);
    const r = clamp01(c.relax);
    const kIn = springs.snap.stiffness / springs.snap.mass;
    const cIn = springs.snap.damping / springs.snap.mass;
    const kOut = lerp(
      springs.snap.stiffness / springs.snap.mass,
      springs.drift.stiffness / springs.drift.mass,
      r,
    );
    const cOut = lerp(
      springs.snap.damping / springs.snap.mass,
      springs.drift.damping / springs.drift.mass,
      r,
    );
    const at =
      b.key >= 0 && b.key < count
        ? { x: b.x[b.key] ?? 0, y: b.y[b.key] ?? 0 }
        : b.at;
    let busy = waving;
    let nearest = -1;
    let nearestD = Infinity;
    for (let i = 0; i < count; i += 1) {
      let target = 0;
      if (at) {
        const dx = (b.x[i] ?? 0) - at.x;
        // A line above or below is further away than the same distance
        // along the line: the pull stays on the line the pointer is on.
        const dy = ((b.y[i] ?? 0) - at.y) * 1.8;
        const d = Math.hypot(dx, dy);
        if (d < nearestD) {
          nearestD = d;
          nearest = i;
        }
        target = strength * bell(d / (reachPx * press));
      }
      if (waving) {
        target = Math.max(
          target,
          0.95 * bell(Math.abs(i - b.wave) / reachLetters),
        );
      }
      let t = b.t[i] ?? 0;
      let v = b.v[i] ?? 0;
      if (!safe) {
        t = target;
        v = 0;
      } else {
        const k = target > t ? kIn : kOut;
        const damp = target > t ? cIn : cOut;
        let left = dt;
        while (left > 1e-7) {
          const h = Math.min(STEP, left);
          left -= h;
          const a = -k * (t - target) - damp * v;
          v += a * h;
          t += v * h;
        }
      }
      b.t[i] = t;
      b.v[i] = v;
      if (Math.abs(t - target) > 1e-3 || Math.abs(v) > 1e-3) busy = true;
      model.cells[i]?.set(r3(t));
    }
    const leaning = b.key >= 0 ? b.key : at ? nearest : -1;
    if (leaning !== b.nearest) {
      b.nearest = leaning;
      c.onLean?.(leaning < 0 ? null : leaning);
    }
    if (!busy && b.stale && !at) measure();
    if (!busy && !waving && Number.isNaN(b.wave) && b.waveSpeed > 0) {
      b.waveSpeed = 0;
      c.onComplete?.();
    }
    return busy;
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const busy = step(dt);
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
    }
  };

  const wave = (on: boolean) => {
    const b = body.current;
    if (!on || !cfg.current.motionSafe) {
      b.wave = Number.NaN;
      if (on && b.waveSpeed === 0) cfg.current.onComplete?.();
      b.waveSpeed = 0;
      wake();
      return;
    }
    const reachLetters = Math.max(0.5, cfg.current.radius / LETTER_EM);
    const count = b.t.length;
    b.wave = -reachLetters;
    b.waveEnd = count + reachLetters;
    b.waveSpeed =
      (b.waveEnd - b.wave) / Math.max(0.2, cfg.current.duration / 1000);
    wake();
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      radius,
      lean,
      relax,
      duration,
      motionSafe,
      onLean,
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

  React.useEffect(() => {
    api.current?.wave(started);
  }, [started, entrance.n, model]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  React.useEffect(() => {
    body.current.stale = true;
    api.current?.wake();
  }, [radius, lean, relax, draw, motionSafe]);

  // Which axes the inherited font really has: a hidden probe measured at
  // each axis's extremes, once the font is in.
  React.useEffect(() => {
    if (axes !== "auto") return;
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    const probe = () => {
      if (cancelled) return;
      const span = document.createElement("span");
      span.textContent = "Hamburgefonstiv";
      span.setAttribute("aria-hidden", "true");
      span.style.cssText =
        "position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0;pointer-events:none";
      root.appendChild(span);
      const widthAt = (settings: string) => {
        span.style.fontVariationSettings = settings;
        return span.getBoundingClientRect().width;
      };
      const w0 = widthAt(`"wght" ${minWeight}`);
      const w1 = widthAt(`"wght" ${maxWeight}`);
      const d0 = widthAt(`"wdth" ${minWidth}`);
      const d1 = widthAt(`"wdth" ${maxWidth}`);
      span.remove();
      const differs = (a: number, b: number) =>
        Math.abs(a - b) > Math.max(0.5, 0.01 * Math.max(a, b));
      const next = { wght: differs(w0, w1), wdth: differs(d0, d1) };
      setFound((prev) =>
        prev?.wght === next.wght && prev.wdth === next.wdth ? prev : next,
      );
      // The font is in: the rest centres are worth reading again.
      body.current.stale = true;
      api.current?.measure();
    };
    // Fonts load lazily, so `ready` can resolve before this one has begun:
    // every finished load probes and measures again.
    const fonts = document.fonts;
    if (fonts?.ready) void fonts.ready.then(probe);
    else window.setTimeout(probe, 0);
    fonts?.addEventListener?.("loadingdone", probe);
    return () => {
      cancelled = true;
      fonts?.removeEventListener?.("loadingdone", probe);
    };
  }, [axes, minWeight, maxWeight, minWidth, maxWidth, line]);

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback((restart: boolean, wait: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, wait);
  }, []);
  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false, delay);
    if (trigger === "manual") {
      if (play) begin(true, delay);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, delay, begin, reset]);

  const seen = React.useRef({ trigger, once, delay, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once, delay };
    if (started) seen.current.played = true;
  });

  const bindRoot = React.useCallback(
    (node: HTMLElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const remeasure = () => {
        body.current.stale = true;
        api.current?.measure();
      };
      const sizer = new ResizeObserver(remeasure);
      sizer.observe(node);
      document.fonts?.addEventListener?.("loadingdone", remeasure);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (visible) begin(false, t.delay);
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

  const pointAt = (clientX: number, clientY: number, pressure?: number) => {
    const root = rootRef.current;
    const b = body.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    b.at = { x: clientX - rect.left, y: clientY - rect.top };
    b.pressure =
      pressure && pressure > 0 && pressure !== 0.5
        ? 0.6 + 0.4 * clamp01(pressure)
        : 1;
    wake();
  };

  const letGo = () => {
    const b = body.current;
    b.at = null;
    b.pressed = false;
    wake();
  };

  const drag = useDrag({
    axis: "x",
    threshold: 2,
    disabled: !interactive,
    onMove: ({ point, event }) => {
      if (event.pointerType !== "touch") return;
      pointAt(point.x, point.y, "pressure" in event ? event.pressure : 1);
    },
    onEnd: ({ event }) => {
      if (event.pointerType === "touch") letGo();
    },
    onCancel: letGo,
    onTap: (event) => {
      if (event.pointerType === "touch") letGo();
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (n === 0) return;
    let to: number | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        to = leanOn < 0 ? 0 : Math.min(n - 1, leanOn + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        to = leanOn < 0 ? n - 1 : Math.max(0, leanOn - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      case "Escape":
        if (leanOn < 0) return;
        event.preventDefault();
        setLeanOn(-1);
        body.current.key = -1;
        wake();
        return;
      default:
        return;
    }
    event.preventDefault();
    setLeanOn(to);
    body.current.key = to;
    wake();
  };

  const Wrapper = as === "span" ? "span" : "div";
  const Tag = as;
  const most = [
    used.wght ? `"wght" ${maxWeight}` : "",
    used.wdth ? `"wdth" ${maxWidth}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const rest = [
    used.wght ? `"wght" ${minWeight}` : "",
    used.wdth ? `"wdth" ${minWidth}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const justify =
    align === "start"
      ? "justify-self-start"
      : align === "end"
        ? "justify-self-end"
        : "justify-self-center";

  return (
    <Wrapper
      ref={bindRoot}
      className={cn(
        "relative",
        as === "span" ? "inline-block" : "block",
        interactive && "touch-pan-y",
        className,
      )}
      onPointerEnter={() => {
        if (trigger === "hover") begin(!once, delay);
      }}
      onPointerDown={(event) => {
        drag.onPointerDown(event);
        if (!interactive) return;
        if (event.pointerType === "touch") {
          pointAt(event.clientX, event.clientY, event.pressure);
        } else {
          body.current.pressed = true;
          pointAt(event.clientX, event.clientY, event.pressure);
        }
      }}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (!interactive || event.pointerType === "touch") return;
        pointAt(event.clientX, event.clientY, event.pressure);
      }}
      onPointerUp={(event) => {
        drag.onPointerUp(event);
        body.current.pressed = false;
        if (event.pointerType === "touch") letGo();
        else wake();
      }}
      onPointerCancel={(event) => {
        drag.onPointerCancel(event);
        letGo();
      }}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        letGo();
      }}
    >
      <Tag className={cn("m-0", as === "span" ? "inline-grid" : "grid")}>
        <span className="sr-only select-none">{line}</span>
        {/* The swollen line's room, so nothing around the line moves. */}
        <span
          aria-hidden
          className="invisible select-none [grid-area:1/1]"
          style={{ fontVariationSettings: most || undefined }}
        >
          {model.words.map((word, w) => (
            <React.Fragment key={w}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {word.map((i) => (
                  <span
                    key={i}
                    className="inline-block"
                    style={
                      used.wdth
                        ? undefined
                        : {
                            paddingInline: `${r3((Math.max(1, maxWidth / Math.max(1, minWidth)) - 1) * LETTER_EM * 0.5)}em`,
                          }
                    }
                  >
                    {model.letters[i]}
                  </span>
                ))}
              </span>
            </React.Fragment>
          ))}
        </span>
        <span
          aria-hidden
          className={cn("[grid-area:1/1]", justify)}
          style={{ fontVariationSettings: rest || undefined }}
        >
          {model.words.map((word, w) => (
            <React.Fragment key={w}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {word.map((i) => (
                  <Letter
                    key={i}
                    char={model.letters[i] ?? ""}
                    cell={model.cells[i] as MotionValue<number>}
                    draw={draw}
                    bind={bindLetter(i)}
                  />
                ))}
              </span>
            </React.Fragment>
          ))}
        </span>
      </Tag>
      {interactive && n > 0 ? (
        <>
          <span
            role="slider"
            tabIndex={0}
            aria-label="Lean"
            aria-describedby={hintId}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={n}
            aria-valuenow={leanOn + 1}
            aria-valuetext={
              leanOn < 0
                ? "Relaxed"
                : `Leaning on “${model.letters[leanOn] ?? ""}”, letter ${leanOn + 1} of ${n}`
            }
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (trigger === "hover") begin(!once, delay);
            }}
            onBlur={() => {
              setLeanOn(-1);
              body.current.key = -1;
              wake();
            }}
            className="pointer-events-none absolute inset-0 rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Left and Right lean on the letters one at a time; Escape lets go.
          </span>
        </>
      ) : null}
    </Wrapper>
  );
}
