"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useSpring } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DitherCurtainMatrix = "2x2" | "4x4" | "8x8";
export type DitherCurtainTrigger = "mount" | "inView" | "hover" | "manual";
export type DitherCurtainOrigin =
  "left" | "right" | "top" | "bottom" | "center" | "pointer";

export type DitherCurtainProps = {
  /** The content behind the veil. It stays fully interactive and in the accessibility tree throughout. */
  children: React.ReactNode;
  /** The ordered-dither matrix: 2×2 is a coarse check, 8×8 a fine, even screen. @default "4x4" */
  matrix?: DitherCurtainMatrix;
  /** The finest dot, in CSS pixels. @default 4 */
  scale?: number;
  /** How much the dots coarsen toward the middle of the dissolving edge, 0 (one size) to 1 (up to 8× `scale`). @default 0.6 */
  coarsen?: number;
  /** Square cells, or round dots that grow until a full veil is solid. @default "square" */
  shape?: "square" | "round";
  /** The veil's colour, any CSS colour; resolved on the element so it follows the theme. @default "var(--accent)" */
  color?: string;
  /** When the veil draws back: on mount, when scrolled into view, on hover or keyboard focus, or when `revealed` turns true. @default "inView" */
  trigger?: DitherCurtainTrigger;
  /** For `trigger="manual"`: true draws the veil back, false brings it over again. */
  revealed?: boolean;
  /** Reveal only once; false lets the veil come back when the piece leaves the view (inView) or the pointer and focus leave (hover). @default true */
  once?: boolean;
  /** Where the dissolve starts. @default "left" ("pointer" when `trigger` is "hover") */
  origin?: DitherCurtainOrigin;
  /** How long the reveal takes, ms; covering again takes 0.6× as long. @default 900 */
  duration?: number;
  /** Wait before a mount or in-view reveal, ms. @default 120 */
  delay?: number;
  /** How wide the dithered band at the edge is, 0 to 1. @default 0.4 */
  softness?: number;
  /** How ragged the edge is, 0 (a straight line) to 1. @default 0.4 */
  ragged?: number;
  /** The radius of the hole a mouse or pen pushes through the veil, px; 0 turns it off. @default 64 */
  holeRadius?: number;
  /** The pointer pushes a hole through the veil (mouse and pen only), and with `trigger="hover"` the wrapper takes keyboard focus. @default true */
  interactive?: boolean;
  /** Seed for the edge's raggedness. @default 11 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when a reveal or a re-cover completes, with whether the content is now revealed. */
  onRevealChange?: (revealed: boolean) => void;
  /** Classes for the wrapper; give it the content's radius so the veil follows it. */
  className?: string;
};

const SIDE: Record<DitherCurtainMatrix, number> = {
  "2x2": 2,
  "4x4": 4,
  "8x8": 8,
};

/** A Bayer matrix of side `n`, as thresholds in (0, 1), row-major. */
function bayer(n: number): Float32Array {
  let m = [0];
  let size = 1;
  while (size < n) {
    const w = size * 2;
    const next = new Array<number>(w * w).fill(0);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const v = (m[y * size + x] ?? 0) * 4;
        next[y * w + x] = v;
        next[y * w + x + size] = v + 2;
        next[(y + size) * w + x] = v + 3;
        next[(y + size) * w + x + size] = v + 1;
      }
    }
    m = next;
    size = w;
  }
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = ((m[i] ?? 0) + 0.5) / (size * size);
  }
  return out;
}

const BAYER: Record<number, Float32Array> = {};
const thresholdsFor = (n: number) => (BAYER[n] ??= bayer(n));

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const hash = (x: number, y: number, seed: number) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const NOISE_CELL = 56;

/** The hole trails the pointer on the glide spring. */
const FOLLOW = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
};

/**
 * A veil of ordered dots over any content. Where the veil is partly drawn
 * back, cells switch on and off by a Bayer threshold, so the content shows
 * through a regular screen of dots rather than a blur; the cell size steps up
 * through nested grids toward the middle of the dissolving band — the edge
 * coarsens into big dots and resolves back to fine ones — and because the
 * grids nest, the steps never misalign. Solid and clear regions are filled or
 * skipped whole; only the band is subdivided.
 *
 * The reveal is a tween (a dissolve is a clip, not a body), the re-cover a
 * shorter exit tween. While veiled, a mouse or pen pushes a soft hole through
 * it that trails the pointer on the glide spring and opens on it too; with
 * `trigger="hover"` the reveal grows outward from that hole, and keyboard
 * focus anywhere inside does the same from the focused element. Under reduced
 * motion the veil is a solid layer that cross-fades away.
 */
export function DitherCurtain({
  children,
  matrix = "4x4",
  scale = 4,
  coarsen = 0.6,
  shape = "square",
  color = "var(--accent)",
  trigger = "inView",
  revealed,
  once = true,
  origin,
  duration = 900,
  delay = 120,
  softness = 0.4,
  ragged = 0.4,
  holeRadius = 64,
  interactive = true,
  seed = 11,
  dpr = 2,
  onRevealChange,
  className,
}: DitherCurtainProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [painted, setPainted] = React.useState(false);

  const startOpen = trigger === "manual" && revealed === true;
  // 0 is a full veil, 1 is clear; `fade` is the reduced-motion cross-fade.
  const progress = useMotionValue(startOpen ? 1 : 0);
  const fade = useMotionValue(startOpen ? 0 : 1);
  const holeX = useMotionValue(0);
  const holeY = useMotionValue(0);
  const hx = useSpring(holeX, FOLLOW);
  const hy = useSpring(holeY, FOLLOW);
  const hr = useMotionValue(0);

  const from = origin ?? (trigger === "hover" ? "pointer" : "left");
  const params = React.useRef({
    matrix,
    scale,
    coarsen,
    shape,
    color,
    from,
    softness,
    ragged,
    seed,
    dpr,
  });
  const events = React.useRef({ onRevealChange });
  React.useEffect(() => {
    params.current = {
      matrix,
      scale,
      coarsen,
      shape,
      color,
      from,
      softness,
      ragged,
      seed,
      dpr,
    };
    events.current = { onRevealChange };
  });

  // The dissolve's own origin point (px), for "pointer" and focus reveals.
  const point = React.useRef<{ x: number; y: number } | null>(null);
  const goal = React.useRef(startOpen);
  const running = React.useRef<{ stop: () => void } | null>(null);
  const api = React.useRef<{
    draw: () => void;
    recolour: () => void;
    relayout: () => void;
  } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // No canvas to draw a veil on: never hide the content behind a
      // fallback that cannot lift.
      const id = requestAnimationFrame(() => setPainted(true));
      return () => cancelAnimationFrame(id);
    }
    const g = ctx;
    let w = 0;
    let h = 0;
    let raf = 0;
    let inView = true;
    let dirty = true;
    let shown = false;
    let ink = "rgb(80, 90, 220)";
    let noise = new Float32Array(1);
    let cols = 1;
    let rows = 1;
    // Per-frame state the field reads; set at the top of each draw so the
    // recursion allocates nothing.
    let side = 4;
    let thresholds = thresholdsFor(4);
    let band = 0.1;
    let nz = 0;
    let front = 0;
    let hole = 0;
    let holeCx = 0;
    let holeCy = 0;
    let ox = 0;
    let oy = 0;
    let reach = 1;
    let half = 1;
    let dir: DitherCurtainOrigin = "left";
    let levels = 1;
    let round = false;

    const readColour = () => {
      const probe = probeRef.current;
      if (!probe) return;
      probe.style.color = params.current.color;
      ink = getComputedStyle(probe).color;
    };

    const layout = () => {
      w = root.clientWidth;
      h = root.clientHeight;
      if (w < 1 || h < 1) return false;
      const ratio = Math.min(
        2,
        Math.max(1, params.current.dpr),
        window.devicePixelRatio || 1,
      );
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      // The ragged edge: seeded value noise on a coarse grid, read bilinearly.
      cols = Math.ceil(w / NOISE_CELL) + 2;
      rows = Math.ceil(h / NOISE_CELL) + 2;
      noise = new Float32Array(cols * rows);
      const s = params.current.seed;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) noise[y * cols + x] = hash(x, y, s);
      }
      return true;
    };

    const lattice = (cx: number, cy: number) =>
      noise[clamp(cy, 0, rows - 1) * cols + clamp(cx, 0, cols - 1)] ?? 0.5;

    const noiseAt = (x: number, y: number) => {
      const gx = x / NOISE_CELL;
      const gy = y / NOISE_CELL;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const a = lattice(ix, iy);
      const b = lattice(ix + 1, iy);
      const c = lattice(ix, iy + 1);
      const d = lattice(ix + 1, iy + 1);
      const top = a + (b - a) * sx;
      return top + (c + (d - c) * sx - top) * sy;
    };

    /** Coverage at a point: 1 is solid veil, 0 is clear. */
    const field = (px: number, py: number) => {
      // Cells on the right and bottom edges overhang the box; they are
      // judged by the edge they sit on, not by the space past it.
      const x = clamp(px, 0, w);
      const y = clamp(py, 0, h);
      let d: number;
      if (dir === "left") d = x / w;
      else if (dir === "right") d = 1 - x / w;
      else if (dir === "top") d = y / h;
      else if (dir === "bottom") d = 1 - y / h;
      else if (dir === "center") d = Math.hypot(x - w / 2, y - h / 2) / half;
      else d = Math.hypot(x - ox, y - oy) / reach;
      d += (noiseAt(x, y) - 0.5) * 2 * nz;
      let f = clamp((d - front + band) / (2 * band), 0, 1);
      if (hole > 0.5) {
        const q = Math.hypot(x - holeCx, y - holeCy);
        const inner = hole * 0.45;
        const t =
          q <= inner ? 1 : q >= hole ? 0 : 1 - (q - inner) / (hole - inner);
        f *= 1 - t * t * (3 - 2 * t);
      }
      return f;
    };

    const dot = (x: number, y: number, size: number, f: number) => {
      const ix = Math.floor(x / size + 0.5);
      const iy = Math.floor(y / size + 0.5);
      const t =
        thresholds[
          (((iy % side) + side) % side) * side + (((ix % side) + side) % side)
        ] ?? 0.5;
      if (t >= f) return;
      if (!round) {
        g.rect(x, y, size, size);
        return;
      }
      const r = size * (0.36 + 0.36 * f);
      g.moveTo(x + size / 2 + r, y + size / 2);
      g.arc(x + size / 2, y + size / 2, r, 0, Math.PI * 2);
    };

    const cell = (x: number, y: number, size: number, level: number) => {
      const fc = field(x + size / 2, y + size / 2);
      if (level > 0) {
        const a = field(x, y);
        const b = field(x + size, y);
        const c = field(x, y + size);
        const e = field(x + size, y + size);
        if (Math.min(a, b, c, e, fc) >= 0.999) {
          g.rect(x, y, size, size);
          return;
        }
        if (Math.max(a, b, c, e, fc) <= 0.001) return;
        // The coarsest dots sit mid-band and resolve toward both ends.
        if (level > (levels - 1) * (1 - Math.abs(2 * fc - 1))) {
          const s2 = size / 2;
          cell(x, y, s2, level - 1);
          cell(x + s2, y, s2, level - 1);
          cell(x, y + s2, s2, level - 1);
          cell(x + s2, y + s2, s2, level - 1);
          return;
        }
      } else if (fc >= 0.999) {
        g.rect(x, y, size, size);
        return;
      } else if (fc <= 0.001) {
        return;
      }
      dot(x, y, size, fc);
    };

    const draw = () => {
      raf = 0;
      if (!inView) {
        dirty = true;
        return;
      }
      dirty = false;
      if (w < 1 || h < 1) return;
      const p = params.current;
      side = SIDE[p.matrix] ?? 4;
      thresholds = thresholdsFor(side);
      band = 0.04 + clamp(p.softness, 0, 1) * 0.3;
      nz = clamp(p.ragged, 0, 1) * 0.15;
      front = clamp(progress.get(), 0, 1) * (1 + 2 * band + 2 * nz) - band - nz;
      hole = Math.max(0, hr.get());
      holeCx = hx.get();
      holeCy = hy.get();
      const o = point.current;
      ox = o ? o.x : w / 2;
      oy = o ? o.y : h / 2;
      reach = Math.max(
        Math.hypot(ox, oy),
        Math.hypot(w - ox, oy),
        Math.hypot(ox, h - oy),
        Math.hypot(w - ox, h - oy),
        1,
      );
      half = Math.hypot(w / 2, h / 2) || 1;
      dir = p.from;
      levels = 1 + Math.round(clamp(p.coarsen, 0, 1) * 3);
      round = p.shape === "round";
      const top = Math.max(1, p.scale) * Math.pow(2, levels - 1);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.restore();
      g.fillStyle = ink;
      g.beginPath();
      for (let y = 0; y < h; y += top) {
        for (let x = 0; x < w; x += top) cell(x, y, top, levels - 1);
      }
      g.fill();
      if (!shown) {
        shown = true;
        setPainted(true);
      }
    };

    const request = () => {
      if (raf) return;
      raf = requestAnimationFrame(draw);
    };

    api.current = {
      draw: request,
      recolour: () => {
        readColour();
        request();
      },
      relayout: () => {
        if (layout()) request();
      },
    };

    readColour();
    const sizer = new ResizeObserver(() => {
      if (layout()) request();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView && dirty) request();
    });
    watcher.observe(root);
    const unsubs = [progress, hx, hy, hr].map((mv) => mv.on("change", request));

    return () => {
      if (raf) cancelAnimationFrame(raf);
      sizer.disconnect();
      watcher.disconnect();
      for (const off of unsubs) off();
      api.current = null;
    };
  }, [progress, hx, hy, hr]);

  React.useEffect(() => {
    api.current?.recolour();
  }, [color]);
  React.useEffect(() => {
    api.current?.relayout();
  }, [seed, dpr]);
  React.useEffect(() => {
    api.current?.draw();
  }, [matrix, scale, coarsen, shape, softness, ragged, from]);

  const settle = React.useCallback(
    (to: boolean) => {
      running.current?.stop();
      goal.current = to;
      const done = () => events.current.onRevealChange?.(to);
      if (!motionSafe) {
        // Reduced motion: no front, no hole — the solid veil cross-fades.
        progress.jump(0);
        running.current = animate(fade, to ? 0 : 1, {
          duration: durations.slow,
          ease: to ? easings.enter : easings.exit,
          onComplete: done,
        });
        return;
      }
      fade.jump(1);
      const seconds = Math.max(0, duration) / 1000;
      running.current = to
        ? animate(progress, 1, {
            duration: seconds,
            ease: easings.move,
            onComplete: done,
          })
        : animate(progress, 0, { ...exitFor(seconds), onComplete: done });
    },
    [duration, fade, motionSafe, progress],
  );

  // Triggers.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let timer = 0;
    if (trigger === "mount") {
      if (!goal.current) {
        timer = window.setTimeout(() => settle(true), Math.max(0, delay));
      }
    } else if (trigger === "manual") {
      if (revealed !== undefined && revealed !== goal.current) settle(revealed);
    } else if (trigger === "inView") {
      const watcher = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          window.clearTimeout(timer);
          if (entry.isIntersecting && !goal.current) {
            timer = window.setTimeout(() => settle(true), Math.max(0, delay));
          } else if (!entry.isIntersecting && goal.current && !once) {
            settle(false);
          }
        },
        { threshold: 0.35 },
      );
      watcher.observe(root);
      return () => {
        window.clearTimeout(timer);
        watcher.disconnect();
      };
    }
    return () => window.clearTimeout(timer);
  }, [trigger, revealed, once, delay, settle]);

  React.useEffect(() => () => running.current?.stop(), []);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const peek = interactive && motionSafe && holeRadius > 0;
  const hoverable = trigger === "hover" && interactive;

  const onPointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    if (peek) {
      holeX.jump(at.x);
      holeY.jump(at.y);
      hx.jump(at.x);
      hy.jump(at.y);
      animate(hr, holeRadius, springs.glide);
    }
    if (hoverable) {
      if (!goal.current) point.current = at;
      settle(true);
    }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || !peek) return;
    const at = local(event.clientX, event.clientY);
    holeX.set(at.x);
    holeY.set(at.y);
  };
  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    if (peek) animate(hr, 0, exitFor());
    if (hoverable && !once) {
      if (!rootRef.current?.contains(document.activeElement)) settle(false);
    }
  };
  // A touch-only visitor has no hover: a tap draws the veil back for good.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (hoverable && event.pointerType === "touch" && !goal.current) {
      point.current = local(event.clientX, event.clientY);
      settle(true);
    }
  };
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!hoverable || goal.current) return;
    const root = rootRef.current;
    const target = event.target as HTMLElement;
    if (root && target !== root) {
      const r = target.getBoundingClientRect();
      point.current = local(r.left + r.width / 2, r.top + r.height / 2);
    } else {
      point.current = null;
    }
    settle(true);
  };
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!hoverable || once) return;
    const root = rootRef.current;
    const next = event.relatedTarget as Node | null;
    if (root && next && root.contains(next)) return;
    if (root?.matches(":hover")) return;
    settle(false);
  };

  return (
    <div
      ref={rootRef}
      tabIndex={hoverable ? 0 : undefined}
      aria-describedby={hoverable ? hintId : undefined}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "relative isolate overflow-clip [contain:paint]",
        hoverable &&
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      {children}
      <motion.canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full"
        style={{ opacity: fade }}
      />
      {/* The veil before the first frame (and the server's markup): solid,
          so the content never flashes before the canvas covers it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{ background: color, opacity: painted || startOpen ? 0 : 1 }}
      />
      {hoverable ? (
        <span id={hintId} className="sr-only">
          Hover or focus to lift the veil.
        </span>
      ) : null}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.recolour()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </div>
  );
}
