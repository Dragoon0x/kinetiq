"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DatamoshTypeTrigger = "mount" | "inView" | "hover" | "manual";
export type DatamoshTypeElement =
  "span" | "div" | "p" | "h1" | "h2" | "h3" | "h4";

export type DatamoshTypeProps = {
  /** The headline. Plain text: it stays real, selectable text between bursts. */
  children: string;
  /** The root element. @default "span" */
  as?: DatamoshTypeElement;
  /** How many artefacts a burst throws and how far they shift, 0 to 1. @default 0.6 */
  intensity?: number;
  /** Length of one burst, ms. @default 520 */
  burst?: number;
  /** How far apart the two colour channels drift, em. @default 0.04 */
  split?: number;
  /** The macro-block size, em. @default 0.28 */
  block?: number;
  /** How often and how far pixel runs drag, 0 to 1. @default 0.5 */
  smear?: number;
  /** The share of corrupted blocks that hold a stale frame, 0 to 1. @default 0.5 */
  freeze?: number;
  /** The codec's frame rate inside a burst, 8 to 60. @default 24 */
  fps?: number;
  /** Rest between automatic bursts, ms; 0 turns them off. @default 3600 */
  interval?: number;
  /** The two channel colours, any CSS colour. @default ["var(--danger)", "var(--accent-bright)"] */
  channels?: [string, string];
  /** Pointer entry, a tap and keyboard focus each fire a burst. @default true */
  hover?: boolean;
  /**
   * A tab stop of its own, so the keyboard can fire a burst (or, under reduced
   * motion, clear the still frame). Turn off inside a link or button, which
   * is focused instead. @default true
   */
  focusable?: boolean;
  /** When automatic bursts run. @default "inView" */
  trigger?: DatamoshTypeTrigger;
  /** One automatic burst, then rest. @default false */
  once?: boolean;
  /** Wait before the first automatic burst, ms. @default 400 */
  delay?: number;
  /** Each change fires one burst: the host's own trigger. */
  burstKey?: string | number;
  /** Seeds every burst's corruption. @default 7 */
  seed?: number;
  /** No bursts at all. @default false */
  paused?: boolean;
  /** The most device pixels per CSS pixel the canvas may use, up to 2. @default 2 */
  dpr?: number;
  /** A burst began. */
  onBurstStart?: () => void;
  /** A burst ended on a clean key frame. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Splits text into graphemes, so emoji and combining marks stay whole. */
function graphemes(text: string): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = [];
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => {
        segment: (s: string) => Iterable<{ segment: string; index: number }>;
      };
    }
  ).Segmenter;
  if (Segmenter) {
    for (const s of new Segmenter(undefined, {
      granularity: "grapheme",
    }).segment(text)) {
      out.push({ text: s.segment, at: s.index });
    }
    return out;
  }
  let at = 0;
  for (const ch of Array.from(text)) {
    out.push({ text: ch, at });
    at += ch.length;
  }
  return out;
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Glyph = { text: string; x: number; y: number; w: number; h: number };

type Scene = {
  /** CSS size of the canvas and the device pixel ratio it is drawn at. */
  w: number;
  h: number;
  d: number;
  font: string;
  fontPx: number;
  ink: string;
  chA: string;
  chB: string;
  glyphs: Glyph[];
  /** Macro-block cells that hold ink, as [column, row] pairs. */
  cells: number[];
  cell: number;
};

type Buffers = {
  view: CanvasRenderingContext2D;
  clean: CanvasRenderingContext2D;
  frame: CanvasRenderingContext2D;
  prev: CanvasRenderingContext2D;
  tintA: CanvasRenderingContext2D;
  tintB: CanvasRenderingContext2D;
  /** A few pixels square: a block is shrunk into it and blown back up. */
  mosaic: CanvasRenderingContext2D;
};

type Focus = { x: number; y: number } | null;

/** The burst's envelope: in fast, hold, and decay over the last third. */
const envelope = (p: number) =>
  p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1;

/**
 * A headline that fails the way compressed video fails. Between bursts it is
 * plain, crisp DOM text. A burst swaps it for a canvas picture of the same
 * glyphs — drawn where the browser laid each one out — and corrupts that
 * picture frame by frame at a codec's frame rate: bands of the picture slip
 * sideways, a one-pixel column drags across a run like a lost motion vector,
 * macro-blocks freeze on the previous frame, drift to a neighbour's pixels or
 * flatten to one colour, and the two colour channels split apart behind the
 * ink. The burst ramps in, holds and decays, then a clean key frame puts the
 * real text back in one frame.
 *
 * Bursts come on an interval while on screen, on pointer entry (clustered
 * where the pointer came in), on a tap, on keyboard focus within, and on each
 * change of `burstKey`. The text is always the real text for assistive
 * technology and selection; the canvas is decoration. Under reduced motion one
 * still corrupted frame stands in, and hover or focus clears it.
 */
export function DatamoshType({
  children,
  as = "span",
  intensity = 0.6,
  burst = 520,
  split = 0.04,
  block = 0.28,
  smear = 0.5,
  freeze = 0.5,
  fps = 24,
  interval = 3600,
  channels = ["var(--danger)", "var(--accent-bright)"],
  hover = true,
  focusable = true,
  trigger = "inView",
  once = false,
  delay = 400,
  burstKey,
  seed = 7,
  paused = false,
  dpr = 2,
  onBurstStart,
  onComplete,
  className,
}: DatamoshTypeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [bursts, setBursts] = React.useState(0);
  const [hot, setHot] = React.useState(false);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const buffers = React.useRef<Buffers | null>(null);
  const scene = React.useRef<Scene | null>(null);
  const run = React.useRef<{
    raf: number;
    t0: number;
    last: number;
    shown: boolean;
    rand: () => number;
    focus: Focus;
    n: number;
  } | null>(null);
  const count = React.useRef(0);
  const still = React.useRef(false);
  const api = React.useRef<{
    measure: () => void;
    start: (focus: Focus) => void;
    stop: () => void;
    showStill: () => void;
    clear: () => void;
    focus: (on: boolean) => void;
  } | null>(null);
  const lastKey = React.useRef(burstKey);

  const amount = clamp01(intensity);
  const length = clamp(burst, 120, 3000);
  const rate = clamp(fps, 8, 60);
  const smearing = clamp01(smear);
  const freezing = clamp01(freeze);

  const setTextHidden = (on: boolean) => {
    const text = textRef.current;
    if (text) text.style.color = on ? "transparent" : "";
  };

  /** Reads the layout, the font and the colours, and draws the clean picture. */
  const measure = () => {
    const root = rootRef.current;
    const text = textRef.current;
    const canvas = canvasRef.current;
    if (!root || !text || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const d = Math.min(2, Math.max(0.5, dpr), window.devicePixelRatio || 1);
    if (!buffers.current) {
      const make = () => document.createElement("canvas").getContext("2d");
      const view = canvas.getContext("2d");
      const clean = make();
      const frame = make();
      const prev = make();
      const tintA = make();
      const tintB = make();
      const mosaic = make();
      if (!view || !clean || !frame || !prev || !tintA || !tintB || !mosaic) {
        return;
      }
      mosaic.canvas.width = 8;
      mosaic.canvas.height = 8;
      buffers.current = { view, clean, frame, prev, tintA, tintB, mosaic };
    }
    const b = buffers.current;
    const pw = Math.max(1, Math.round(w * d));
    const ph = Math.max(1, Math.round(h * d));
    for (const ctx of [b.view, b.clean, b.frame, b.prev, b.tintA, b.tintB]) {
      if (ctx.canvas.width !== pw) ctx.canvas.width = pw;
      if (ctx.canvas.height !== ph) ctx.canvas.height = ph;
    }

    const style = getComputedStyle(text);
    const fontPx = parseFloat(style.fontSize) || 16;
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const ink = getComputedStyle(root).color;
    // Channel colours resolved where the component sits, so tokens follow the
    // theme of whatever wraps it.
    const resolve = (value: string) => {
      canvas.style.color = value;
      const out = getComputedStyle(canvas).color;
      canvas.style.color = "";
      return out;
    };
    const chA = resolve(channels[0]);
    const chB = resolve(channels[1]);

    const rect = root.getBoundingClientRect();
    const ox = rect.left + root.clientLeft;
    const oy = rect.top + root.clientTop;
    const glyphs: Glyph[] = [];
    const node = text.firstChild;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      const value = node.textContent ?? "";
      for (const g of graphemes(value)) {
        if (g.text.trim() === "") continue;
        range.setStart(node, g.at);
        range.setEnd(node, g.at + g.text.length);
        const r = range.getClientRects()[0];
        if (!r || r.width === 0) continue;
        glyphs.push({
          text: g.text,
          x: r.left - ox,
          y: r.top - oy,
          w: r.width,
          h: r.height,
        });
      }
    }

    const cell = Math.max(4, Math.round(clamp(block, 0.08, 1) * fontPx * d));
    const cols = Math.ceil(pw / cell);
    const inked = new Set<number>();
    for (const g of glyphs) {
      const c0 = Math.floor((g.x * d) / cell);
      const c1 = Math.floor(((g.x + g.w) * d) / cell);
      const r0 = Math.floor((g.y * d) / cell);
      const r1 = Math.floor(((g.y + g.h) * d) / cell);
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) inked.add(r * cols + c);
      }
    }
    const cells: number[] = [];
    for (const k of inked) cells.push(k % cols, Math.floor(k / cols));

    scene.current = {
      w,
      h,
      d,
      font,
      fontPx,
      ink,
      chA,
      chB,
      glyphs,
      cells,
      cell,
    };

    // The clean picture: every glyph at the exact place the browser put it.
    const c = b.clean;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw, ph);
    c.setTransform(d, 0, 0, d, 0, 0);
    c.font = font;
    c.textBaseline = "alphabetic";
    c.fillStyle = ink;
    const m = c.measureText("Hg");
    const ascent = m.fontBoundingBoxAscent || fontPx * 0.8;
    const descent = m.fontBoundingBoxDescent || fontPx * 0.2;
    for (const g of glyphs) {
      const baseline = g.y + (g.h - (ascent + descent)) / 2 + ascent;
      c.fillText(g.text, g.x, baseline);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (still.current) api.current?.showStill();
  };

  /** One corrupted frame, drawn from the clean picture and the last frame. */
  const compose = (rand: () => number, env: number, focus: Focus) => {
    const b = buffers.current;
    const s = scene.current;
    if (!b || !s) return;
    const { d, fontPx, cell } = s;
    const pw = b.view.canvas.width;
    const ph = b.view.canvas.height;
    const em = fontPx * d;
    const f = b.frame;
    const near = (centre: number, span: number, size: number) =>
      clamp(centre + (rand() + rand() - 1) * span, 0, size);

    f.globalCompositeOperation = "source-over";
    f.globalAlpha = 1;
    f.clearRect(0, 0, pw, ph);
    f.drawImage(b.clean.canvas, 0, 0);

    // Rows of macro-blocks that slip sideways: a motion vector gone wrong,
    // so the slice is grid-aligned and the shift snaps to half-blocks.
    const rows = Math.ceil(ph / cell);
    const slices =
      env < 0.15 ? 0 : 1 + Math.floor(rand() * (0.6 + amount) * env * 2);
    let streaked = false;
    for (let i = 0; i < slices; i += 1) {
      const tall = rand() < 0.3 ? 2 : 1;
      const pick = Math.floor(rand() * Math.max(1, s.cells.length / 2));
      const row = focus
        ? Math.floor(near(focus.y * d, cell, ph) / cell)
        : (s.cells[pick * 2 + 1] ?? Math.floor(rand() * rows));
      const y0 = row * cell;
      const hh = Math.min(ph - y0, cell * tall);
      if (hh <= 0) continue;
      const reach = (0.08 + rand() * 0.34) * em * env * amount;
      const dx =
        Math.round(((rand() < 0.5 ? -1 : 1) * reach) / (cell / 2)) * (cell / 2);
      if (dx === 0) continue;
      f.clearRect(0, y0, pw, hh);
      f.drawImage(b.clean.canvas, 0, y0, pw, hh, dx, y0, pw, hh);
      // The pixels the slice left behind are dragged across the gap: one
      // column stretched over a run, the codec's smear.
      if (!streaked && rand() < smearing * env && s.glyphs.length) {
        const g = s.glyphs[Math.floor(rand() * s.glyphs.length)];
        if (g) {
          streaked = true;
          const col = Math.max(1, Math.round(d));
          const sx = clamp(
            Math.round((g.x + g.w * (0.3 + 0.4 * rand())) * d),
            0,
            pw - col,
          );
          const runLength = Math.round(
            (0.3 + rand() * 1.3) * em * (0.4 + smearing),
          );
          f.globalAlpha = 0.85;
          f.drawImage(
            b.clean.canvas,
            sx,
            y0,
            col,
            hh,
            dx > 0 ? sx + dx - runLength : sx + dx,
            y0,
            runLength,
            hh,
          );
          f.globalAlpha = 1;
        }
      }
    }

    // Macro-blocks: frozen on the last frame, drifted, or flattened.
    const pairs = s.cells.length / 2;
    const blocks = pairs ? Math.round(env * amount * (6 + rand() * 12)) : 0;
    for (let i = 0; i < blocks; i += 1) {
      let k = Math.floor(rand() * pairs);
      if (focus) {
        // Prefer blocks near where the pointer came in.
        let best = k;
        let bestD = Infinity;
        for (let t = 0; t < 3; t += 1) {
          const cand = Math.floor(rand() * pairs);
          const cx = ((s.cells[cand * 2] ?? 0) + 0.5) * cell;
          const cy = ((s.cells[cand * 2 + 1] ?? 0) + 0.5) * cell;
          const dd = Math.hypot(cx - focus.x * d, cy - focus.y * d);
          if (dd < bestD) {
            bestD = dd;
            best = cand;
          }
        }
        k = best;
      }
      const x = (s.cells[k * 2] ?? 0) * cell;
      const y = (s.cells[k * 2 + 1] ?? 0) * cell;
      const wide = rand() < 0.25 ? 2 : 1;
      const bw = cell * wide;
      const roll = rand();
      if (roll < freezing * 0.6) {
        // Frozen: the block keeps what it showed a frame ago.
        f.clearRect(x, y, bw, cell);
        f.drawImage(b.prev.canvas, x, y, bw, cell, x, y, bw, cell);
      } else {
        const kind = rand();
        if (kind < 0.42) {
          // Drifted: pixels from another inked block, a vector gone astray.
          const from = Math.floor(rand() * pairs);
          const sx = (s.cells[from * 2] ?? 0) * cell;
          const sy = (s.cells[from * 2 + 1] ?? 0) * cell;
          f.clearRect(x, y, bw, cell);
          f.drawImage(b.clean.canvas, sx, sy, bw, cell, x, y, bw, cell);
        } else if (kind < 0.86) {
          // Quantised: the block shrunk to a few pixels and blown back up.
          const q = 2 + Math.floor(rand() * 3);
          const m = b.mosaic;
          m.clearRect(0, 0, 8, 8);
          m.drawImage(b.clean.canvas, x, y, bw, cell, 0, 0, q * wide, q);
          f.clearRect(x, y, bw, cell);
          f.imageSmoothingEnabled = false;
          f.drawImage(m.canvas, 0, 0, q * wide, q, x, y, bw, cell);
          f.imageSmoothingEnabled = true;
        } else {
          // Flattened: only the block's average survives.
          f.globalAlpha = 0.14 + rand() * 0.26;
          f.fillStyle = rand() < 0.5 ? s.ink : rand() < 0.5 ? s.chA : s.chB;
          f.fillRect(x, y, bw, cell);
          f.globalAlpha = 1;
        }
      }
    }

    // The frame a frozen block will hold next time.
    b.prev.globalCompositeOperation = "copy";
    b.prev.drawImage(f.canvas, 0, 0);
    b.prev.globalCompositeOperation = "source-over";

    // Channels: the frame tinted twice and split behind the ink copy.
    const v = b.view;
    v.globalCompositeOperation = "source-over";
    v.globalAlpha = 1;
    v.clearRect(0, 0, pw, ph);
    const shift = Math.round(
      clamp(split, 0, 0.5) * em * (0.5 + 0.5 * env) * (0.6 + 0.8 * rand()),
    );
    if (shift >= 1) {
      for (const [t, colour] of [
        [b.tintA, s.chA],
        [b.tintB, s.chB],
      ] as const) {
        t.globalCompositeOperation = "copy";
        t.drawImage(f.canvas, 0, 0);
        t.globalCompositeOperation = "source-in";
        t.fillStyle = colour;
        t.fillRect(0, 0, pw, ph);
        t.globalCompositeOperation = "source-over";
      }
      const lift = rand() < 0.3 ? Math.round(d) : 0;
      v.globalAlpha = 0.8;
      v.drawImage(b.tintA.canvas, -shift, 0);
      v.drawImage(b.tintB.canvas, shift, lift);
      v.globalAlpha = 1;
    }
    v.drawImage(f.canvas, 0, 0);
  };

  const clear = () => {
    const b = buffers.current;
    if (b) {
      b.view.clearRect(0, 0, b.view.canvas.width, b.view.canvas.height);
    }
    setTextHidden(false);
  };

  const stop = () => {
    const r = run.current;
    if (r) cancelAnimationFrame(r.raf);
    run.current = null;
  };

  /** One burst: a codec frame whenever one is due, then a clean key frame. */
  const start = (focus: Focus) => {
    if (!motionSafe || paused) return;
    if (!scene.current) measure();
    if (!scene.current || !buffers.current) return;
    stop();
    count.current += 1;
    const n = count.current;
    const r = {
      raf: 0,
      t0: performance.now(),
      last: -Infinity,
      shown: false,
      rand: lcg(Math.imul(seed + 1, 7919) ^ Math.imul(n, 104729)),
      focus,
      n,
    };
    const tick = (now: number) => {
      const p = (now - r.t0) / length;
      if (p >= 1) {
        run.current = null;
        api.current?.clear();
        setBursts((k) => k + 1);
        latest.current.onComplete?.();
        return;
      }
      if (now - r.last >= 1000 / rate - 2) {
        r.last = now;
        // Now and then a frame half-recovers, the way a stream catches up.
        const env = envelope(p) * (r.rand() < 0.18 ? 0.3 : 1);
        compose(r.rand, env, r.focus);
        if (!r.shown) {
          r.shown = true;
          setTextHidden(true);
        }
      }
      r.raf = requestAnimationFrame(tick);
    };
    run.current = r;
    r.raf = requestAnimationFrame(tick);
    latest.current.onBurstStart?.();
  };

  /** Reduced motion: one corrupted frame stands still. */
  const showStill = () => {
    if (!scene.current || !buffers.current) return;
    const rand = lcg(Math.imul(seed + 1, 7919));
    compose(rand, 0.7, null);
    compose(rand, 0.7, null);
    setTextHidden(true);
  };

  const fire = (focus: Focus) => {
    if (!hover || run.current) return;
    api.current?.start(focus);
  };

  const latest = React.useRef({ onBurstStart, onComplete });
  React.useLayoutEffect(() => {
    latest.current = { onBurstStart, onComplete };
    api.current = {
      measure,
      start,
      stop,
      showStill,
      clear,
      focus: (on) => {
        setHot(on);
        if (on) fire(null);
      },
    };
  });

  // The layout, font, colours or text changed: measure again.
  const [channelA, channelB] = channels;
  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [children, block, dpr, channelA, channelB]);

  // Under reduced motion the still frame stands in until hover clears it.
  React.useEffect(() => {
    if (motionSafe || hot) {
      still.current = false;
      if (!run.current) api.current?.clear();
      return;
    }
    api.current?.stop();
    still.current = true;
    api.current?.showStill();
  }, [motionSafe, hot, children, intensity, split, smear, freeze, seed]);

  const armed = trigger === "mount" || trigger === "inView";
  const running =
    motionSafe &&
    armed &&
    onScreen &&
    !hidden &&
    !paused &&
    interval > 0 &&
    !(once && bursts > 0);

  React.useEffect(() => {
    if (!running) return;
    const wait = bursts === 0 ? delay : interval;
    const timer = window.setTimeout(
      () => api.current?.start(null),
      Math.max(0, wait),
    );
    return () => window.clearTimeout(timer);
  }, [running, bursts, delay, interval]);

  // The host's own trigger.
  React.useEffect(() => {
    if (lastKey.current === burstKey) return;
    lastKey.current = burstKey;
    api.current?.start(null);
  }, [burstKey]);

  // Off screen, hidden or paused: a burst under way ends clean at once.
  React.useEffect(() => {
    if (onScreen && !hidden && !paused) return;
    if (!run.current) return;
    api.current?.stop();
    api.current?.clear();
  }, [onScreen, hidden, paused]);

  React.useEffect(
    () => () => {
      api.current?.stop();
      const b = buffers.current;
      if (b) {
        for (const ctx of [
          b.view,
          b.clean,
          b.frame,
          b.prev,
          b.tintA,
          b.tintB,
        ]) {
          ctx.canvas.width = 0;
          ctx.canvas.height = 0;
        }
      }
      buffers.current = null;
      scene.current = null;
    },
    [],
  );

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    // A headline inside a link or button is focused through its host.
    const host = node.parentElement?.closest<HTMLElement>(
      "a[href], button, [tabindex]",
    );
    const focusIn = () => api.current?.focus(true);
    const focusOut = () => api.current?.focus(false);
    host?.addEventListener("focus", focusIn);
    host?.addEventListener("blur", focusOut);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      host?.removeEventListener("focus", focusIn);
      host?.removeEventListener("blur", focusOut);
    };
  }, []);

  // A 1 ms colour transition on a hidden sentinel: when the theme around the
  // component flips, its inherited colour changes and the transition ends, so
  // the canvas re-reads its colours without ever looking at the document.
  const bindSentinel = React.useCallback((node: HTMLSpanElement | null) => {
    if (!node) return;
    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName === "color") api.current?.measure();
    };
    node.addEventListener("transitionend", onEnd);
    return () => node.removeEventListener("transitionend", onEnd);
  }, []);

  const local = (event: React.PointerEvent): Focus => {
    const root = rootRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return React.createElement(
    as,
    {
      ref: bindRoot,
      tabIndex: focusable ? 0 : undefined,
      "aria-describedby": focusable ? hintId : undefined,
      className: cn(
        "relative inline-block max-w-full",
        focusable &&
          "rounded-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      ),
      onPointerEnter: (event: React.PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        setHot(true);
        fire(local(event));
      },
      onPointerLeave: (event: React.PointerEvent) => {
        if (event.pointerType === "mouse") setHot(false);
      },
      onPointerDown: (event: React.PointerEvent) => {
        if (event.pointerType === "mouse") return;
        fire(local(event));
      },
      onFocus: () => api.current?.focus(true),
      onBlur: () => api.current?.focus(false),
    },
    <span
      key="text"
      ref={textRef}
      style={{
        transition: motionSafe ? undefined : `color ${durations.fast}s`,
      }}
    >
      {children}
    </span>,
    <canvas
      key="canvas"
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
    />,
    focusable ? (
      // Hidden, not visually hidden: read as the description, never as part
      // of the headline's own text.
      <span key="hint" id={hintId} hidden>
        Focus plays the corruption; with reduced motion it shows the clean text.
      </span>
    ) : null,
    <span
      key="sentinel"
      ref={bindSentinel}
      aria-hidden
      className="pointer-events-none absolute size-0 overflow-hidden [transition:color_1ms_linear]"
    />,
  );
}
