"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BiasStripesPalette = "ember" | "tide" | "orchard" | "dusk";

export type BiasStripesProps = {
  /** Content on top of the cloth: a headline, a product line, a call to action. */
  children?: React.ReactNode;
  /** The bias: the stripes' angle from horizontal, in degrees. @default 45 */
  angle?: number;
  /** How hard the hand draws the cloth, and how big a ripple is, 0 to 1. @default 0.6 */
  pull?: number;
  /** The dye set, four colours repeating. @default "ember" */
  palette?: BiasStripesPalette;
  /** Colours of your own, repeating in order; overrides `palette`. */
  colors?: string[];
  /** Band width, in px. @default 26 */
  stripe?: number;
  /** How far the pull reaches, in px; held under 45 % of the shorter side. @default 110 */
  reach?: number;
  /** How much a moving hand drags the bias along with it, 0 to 1. @default 0.4 */
  drag?: number;
  /** How far the cloth overshoots past flat when the hand lets go, 0 (none) to 1 (a visible bounce). @default 0.5 */
  springiness?: number;
  /** A click or tap snaps a ripple through the cloth. @default true */
  ripple?: boolean;
  /** A fine twill over the bands and soft fold shading where the cloth is pulled. @default true */
  texture?: boolean;
  /** The pointer and keys pull the cloth. @default true */
  interactive?: boolean;
  /** Fires when a click, tap or key sends a ripple, with its centre in px from the top left. */
  onRipple?: (x: number, y: number) => void;
  /** The cloth's accessible name, for the keyboard's way in. @default "Striped cloth" */
  label?: string;
  /** Shows the cloth but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the cloth; it fills its parent by default. */
  className?: string;
};

/** Dyes at fixed lightness, so a palette is the same cloth in either theme. */
const PALETTES: Record<BiasStripesPalette, string[]> = {
  ember: [
    "oklch(from var(--danger) 0.55 0.12 calc(h + 6))",
    "oklch(from var(--warn) 0.8 0.09 calc(h - 22))",
    "oklch(from var(--warn) 0.94 0.03 calc(h + 10))",
    "oklch(from var(--danger) 0.36 0.07 calc(h - 2))",
  ],
  tide: [
    "oklch(from var(--accent) 0.38 0.09 calc(h - 22))",
    "oklch(from var(--signal) 0.68 0.08 calc(h + 30))",
    "oklch(from var(--warn) 0.93 0.035 h)",
    "oklch(from var(--accent) 0.62 0.08 calc(h - 40))",
  ],
  orchard: [
    "oklch(from var(--success) 0.48 0.09 calc(h - 22))",
    "oklch(from var(--warn) 0.84 0.1 calc(h + 16))",
    "oklch(from var(--warn) 0.95 0.03 h)",
    "oklch(from var(--success) 0.32 0.05 calc(h - 34))",
  ],
  dusk: [
    "oklch(from var(--accent) 0.34 0.1 calc(h + 30))",
    "oklch(from var(--danger) 0.7 0.09 calc(h - 10))",
    "oklch(from var(--warn) 0.91 0.05 calc(h - 22))",
    "oklch(from var(--accent) 0.55 0.1 calc(h + 52))",
  ],
};

const STEP = 1 / 120;
const SAMPLE = 8;
/** The pull is held under this so the cloth never folds through itself. */
const MAX_PULL = 0.68;
const RIPPLE_SPEED = 520;
const RIPPLE_WAVE = 64;
const RIPPLE_LIFE = 1.1;
const KEY_STEP = 24;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Geometry = {
  w: number;
  h: number;
  /** Along the stripes, and across them. */
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  band: number;
  /** The first boundary's index and how many there are. */
  k0: number;
  count: number;
  /** The run of each boundary line, along the stripes. */
  t0: number;
  t1: number;
  reach: number;
};

function geometryOf(
  w: number,
  h: number,
  angle: number,
  band: number,
  reach: number,
): Geometry {
  const a = (clamp(angle, -89, 89) * Math.PI) / 180;
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  const nx = -ty;
  const ny = tx;
  const R = clamp(reach, 24, Math.min(w, h) * 0.45);
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ] as const;
  let s0 = Infinity;
  let s1 = -Infinity;
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const [x, y] of corners) {
    const s = x * nx + y * ny;
    const t = x * tx + y * ty;
    s0 = Math.min(s0, s);
    s1 = Math.max(s1, s);
    t0 = Math.min(t0, t);
    t1 = Math.max(t1, t);
  }
  // Cloth from beyond the edge can be drawn in, so the bands run past it.
  const margin = R * 0.9;
  const W = Math.max(6, band);
  const k0 = Math.floor((s0 - margin) / W);
  const k1 = Math.ceil((s1 + margin) / W);
  return {
    w,
    h,
    tx,
    ty,
    nx,
    ny,
    band: W,
    k0,
    count: k1 - k0 + 1,
    t0: t0 - margin,
    t1: t1 + margin,
    reach: R,
  };
}

/** Band k between boundaries k and k+1, as straight cloth. */
function restBand(g: Geometry, k: number): string {
  const s = (g.k0 + k) * g.band;
  const e = s + g.band;
  const p = (sv: number, tv: number) =>
    `${r1(sv * g.nx + tv * g.tx)} ${r1(sv * g.ny + tv * g.ty)}`;
  return `M ${p(s, g.t0)} L ${p(s, g.t1)} L ${p(e, g.t1)} L ${p(e, g.t0)} Z`;
}

type Ripple = { x: number; y: number; t: number; amp: number };

type Cloth = {
  /** The hand's target, where it is, and how fast it is moving. */
  tx: number;
  ty: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The pull, its rate, and where it is heading. */
  a: number;
  va: number;
  present: boolean;
  ring: boolean;
  source: "pointer" | "key" | null;
  ripples: Ripple[];
};

/**
 * Bands of colour across the frame at `angle`, like fabric cut on the bias,
 * that reach toward the hand. The cloth is a displacement field: every point
 * is drawn toward the hand by a Gaussian pull, so the stripes bend toward
 * it, the band under the hand is drawn thin and its neighbours bunch beside
 * it while the bands further out stretch to reach in; a moving hand drags the
 * bias along a little. The hand follows the pointer on the springs.glide
 * constants and the pull rises on them too; when the hand leaves, the pull
 * relaxes on a softer spring that overshoots past flat by `springiness` and
 * settles. A click snaps a ripple through: a wave packet leaving the click at
 * 520 px/s that kinks every band it crosses and falls away over a second.
 *
 * One SVG polygon per band, each boundary sampled every 8 px and pushed
 * through the field only while something moves; settled, the bands are exact
 * four-point polygons and nothing runs. The keyboard's way in is a
 * transparent button behind the content: arrow keys move a ringed hand,
 * Enter or Space ripples from it, Escape lets go. Under reduced motion the
 * cloth takes the pull's shape directly and a ripple is a fading ring.
 */
export function BiasStripes({
  children,
  angle = 45,
  pull = 0.6,
  palette = "ember",
  colors,
  stripe = 26,
  reach = 110,
  drag = 0.4,
  springiness = 0.5,
  ripple = true,
  texture = true,
  interactive = true,
  onRipple,
  label = "Striped cloth",
  disabled = false,
  className,
}: BiasStripesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const [box, setBox] = React.useState({ w: 720, h: 208 });
  const dyes =
    colors && colors.length > 0
      ? colors
      : (PALETTES[palette] ?? PALETTES.ember);
  const geo = React.useMemo(
    () => geometryOf(box.w, box.h, angle, stripe, reach),
    [box.w, box.h, angle, stripe, reach],
  );
  const live = interactive && !disabled;

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const surfaceRef = React.useRef<HTMLButtonElement | null>(null);
  const bandRefs = React.useRef<(SVGPathElement | null)[]>([]);
  const foldRef = React.useRef<SVGCircleElement | null>(null);
  const ringRef = React.useRef<SVGCircleElement | null>(null);
  const flashRef = React.useRef<SVGCircleElement | null>(null);
  const cloth = React.useRef<Cloth>({
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    a: 0,
    va: 0,
    present: false,
    ring: false,
    source: null,
    ripples: [],
  });
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const carry = React.useRef(0);
  const visible = React.useRef(false);
  const flat = React.useRef(true);
  const xs = React.useRef(new Float32Array(0));
  const ys = React.useRef(new Float32Array(0));

  const latest = React.useRef({ geo, pull, drag, springiness, motionSafe });
  React.useEffect(() => {
    latest.current = { geo, pull, drag, springiness, motionSafe };
  });

  /** Where the cloth at (x, y) is drawn to, written into out[0..1]. */
  const displace = (
    x: number,
    y: number,
    c: Cloth,
    R2: number,
    dragX: number,
    dragY: number,
    out: number[],
  ) => {
    let ox = x;
    let oy = y;
    if (c.a !== 0 || dragX !== 0 || dragY !== 0) {
      const dx = c.x - x;
      const dy = c.y - y;
      const g = Math.exp(-(dx * dx + dy * dy) / R2);
      ox += (c.a * dx + dragX) * g;
      oy += (c.a * dy + dragY) * g;
    }
    for (const rp of c.ripples) {
      const ex = x - rp.x;
      const ey = y - rp.y;
      const r = Math.sqrt(ex * ex + ey * ey);
      if (r < 0.001) continue;
      const front = rp.t * RIPPLE_SPEED;
      const d = r - front;
      if (d > RIPPLE_WAVE * 1.6 || d < -RIPPLE_WAVE * 1.6) continue;
      const env = Math.exp(-((d / (RIPPLE_WAVE * 0.6)) ** 2));
      const k =
        rp.amp *
        Math.exp(-rp.t / (RIPPLE_LIFE * 0.5)) *
        env *
        Math.sin((2 * Math.PI * d) / RIPPLE_WAVE);
      ox += (ex / r) * k;
      oy += (ey / r) * k;
    }
    out[0] = ox;
    out[1] = oy;
  };

  const pt = [0, 0];

  /** Writes every band through the field, or straight when the cloth is flat. */
  const write = () => {
    const g = latest.current.geo;
    const c = cloth.current;
    const ms = latest.current.motionSafe;
    const settledFlat =
      Math.abs(c.a) < 0.0005 &&
      c.ripples.length === 0 &&
      Math.abs(c.vx) + Math.abs(c.vy) < 1;
    if (settledFlat || !ms) {
      if (settledFlat && !flat.current) {
        for (let k = 0; k < g.count - 1; k += 1) {
          bandRefs.current[k]?.setAttribute("d", restBand(g, k));
        }
        flat.current = true;
      }
      if (settledFlat) return;
    }
    flat.current = false;
    const R = g.reach;
    const R2 = R * R;
    const dragK = ms ? 0.07 * clamp(latest.current.drag) : 0;
    const dragX = clamp(c.vx * dragK, -R * 0.5, R * 0.5);
    const dragY = clamp(c.vy * dragK, -R * 0.5, R * 0.5);
    const steps = Math.ceil((g.t1 - g.t0) / SAMPLE);
    const per = steps + 1;
    const need = g.count * per;
    if (xs.current.length < need) {
      xs.current = new Float32Array(need);
      ys.current = new Float32Array(need);
    }
    const X = xs.current;
    const Y = ys.current;
    const handS = c.x * g.nx + c.y * g.ny;
    const handT = c.x * g.tx + c.y * g.ty;
    const wide = c.ripples.length > 0;
    const near = R * 2.6 + Math.abs(dragX) + Math.abs(dragY);
    for (let k = 0; k < g.count; k += 1) {
      const s = (g.k0 + k) * g.band;
      const base = k * per;
      const straight = !wide && Math.abs(s - handS) > near;
      for (let i = 0; i < per; i += 1) {
        const t = g.t0 + Math.min(g.t1 - g.t0, i * SAMPLE);
        const x = s * g.nx + t * g.tx;
        const y = s * g.ny + t * g.ty;
        if (straight || (!wide && Math.abs(t - handT) > near)) {
          X[base + i] = x;
          Y[base + i] = y;
          continue;
        }
        displace(x, y, c, R2, dragX, dragY, pt);
        X[base + i] = pt[0] ?? x;
        Y[base + i] = pt[1] ?? y;
      }
    }
    for (let k = 0; k < g.count - 1; k += 1) {
      const node = bandRefs.current[k];
      if (!node) continue;
      const a = k * per;
      const b = (k + 1) * per;
      let d = `M ${r1(X[a] ?? 0)} ${r1(Y[a] ?? 0)}`;
      for (let i = 1; i < per; i += 1) {
        d += ` L ${r1(X[a + i] ?? 0)} ${r1(Y[a + i] ?? 0)}`;
      }
      for (let i = per - 1; i >= 0; i -= 1) {
        d += ` L ${r1(X[b + i] ?? 0)} ${r1(Y[b + i] ?? 0)}`;
      }
      node.setAttribute("d", `${d} Z`);
    }
  };

  /** The fold shading, the keyboard ring and the reduced-motion flash. */
  const writeMarks = () => {
    const c = cloth.current;
    const g = latest.current.geo;
    const fold = foldRef.current;
    if (fold) {
      fold.setAttribute("cx", String(r1(c.x)));
      fold.setAttribute("cy", String(r1(c.y)));
      fold.setAttribute("r", String(r1(g.reach * 1.5)));
      fold.setAttribute("opacity", String(r3(clamp(Math.abs(c.a) / MAX_PULL))));
    }
    const ring = ringRef.current;
    if (ring) {
      ring.setAttribute("cx", String(r1(c.x)));
      ring.setAttribute("cy", String(r1(c.y)));
      ring.setAttribute("opacity", c.ring && c.present ? "1" : "0");
    }
    const flash = flashRef.current;
    if (flash) {
      const rp = latest.current.motionSafe ? null : c.ripples[0];
      if (rp) {
        flash.setAttribute("cx", String(r1(rp.x)));
        flash.setAttribute("cy", String(r1(rp.y)));
        flash.setAttribute("opacity", String(r3(clamp(1 - rp.t / 0.24) * 0.6)));
      } else flash.setAttribute("opacity", "0");
    }
  };

  const integrate = (dt: number): boolean => {
    const c = cloth.current;
    const l = latest.current;
    const target = c.present ? MAX_PULL * clamp(l.pull) : 0;
    if (c.ripples.length > 0) {
      for (const rp of c.ripples) rp.t += dt;
      const life = l.motionSafe ? RIPPLE_LIFE : 0.24;
      if (c.ripples.some((rp) => rp.t >= life)) {
        c.ripples = c.ripples.filter((rp) => rp.t < life);
      }
    }
    if (!l.motionSafe) {
      c.x = c.tx;
      c.y = c.ty;
      c.vx = 0;
      c.vy = 0;
      c.a = target;
      c.va = 0;
      return c.ripples.length > 0;
    }
    // The hand lags the pointer on glide's constants.
    const k = springs.glide.stiffness / springs.glide.mass;
    const damp = springs.glide.damping / springs.glide.mass;
    const ax = k * (c.tx - c.x) - damp * c.vx;
    const ay = k * (c.ty - c.y) - damp * c.vy;
    c.vx += ax * dt;
    c.vy += ay * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    // The pull arrives on glide's constants and lets go on a softer spring
    // whose damping sets how far the cloth swings past flat.
    const letting = target < c.a || (target === 0 && c.a !== 0);
    const pk = letting ? 160 : k;
    const zeta = letting ? 0.85 - 0.5 * clamp(l.springiness) : 0.98;
    const pa = pk * (target - c.a) - 2 * zeta * Math.sqrt(pk) * c.va;
    c.va += pa * dt;
    c.a += c.va * dt;
    const handStill =
      Math.abs(c.tx - c.x) + Math.abs(c.ty - c.y) < 0.1 &&
      Math.abs(c.vx) + Math.abs(c.vy) < 1;
    const pullStill = Math.abs(target - c.a) < 0.0006 && Math.abs(c.va) < 0.004;
    if (handStill) {
      c.x = c.tx;
      c.y = c.ty;
      c.vx = 0;
      c.vy = 0;
    }
    if (pullStill) {
      c.a = target;
      c.va = 0;
    }
    return !(handStill && pullStill) || c.ripples.length > 0;
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const dt = last.current
      ? Math.min(1 / 30, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    carry.current += dt;
    let moving = false;
    let steps = 0;
    while (carry.current >= STEP && steps < 6) {
      carry.current -= STEP;
      steps += 1;
      if (integrate(STEP)) moving = true;
    }
    if (steps === 0) moving = true;
    write();
    writeMarks();
    if (moving) frame.current = window.requestAnimationFrame(tick);
    else {
      last.current = 0;
      carry.current = 0;
    }
  };

  const kick = () => {
    if (frame.current) return;
    if (!visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(tick);
  };

  const api = React.useRef({ kick, write, writeMarks });
  React.useEffect(() => {
    api.current = { kick, write, writeMarks };
  });

  // New geometry renders straight bands; a cloth still pulled is redrawn.
  React.useEffect(() => {
    flat.current = true;
    api.current.kick();
  }, [geo]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frame;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
    };
  }, []);

  React.useEffect(() => {
    if (live) return;
    const c = cloth.current;
    c.present = false;
    c.ring = false;
    c.source = null;
    api.current.kick();
  }, [live]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const w = Math.round(node.clientWidth);
      const h = Math.round(node.clientHeight);
      if (w < 1 || h < 1) return;
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) api.current.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const holdAt = (x: number, y: number, source: "pointer" | "key") => {
    const c = cloth.current;
    // A hand arriving on flat cloth starts where it is, not where it last was.
    if (!c.present && Math.abs(c.a) < 0.02) {
      c.x = x;
      c.y = y;
      c.vx = 0;
      c.vy = 0;
    }
    c.tx = x;
    c.ty = y;
    c.present = true;
    c.source = source;
    c.ring = source === "key";
    kick();
  };

  const letGo = (source: "pointer" | "key") => {
    const c = cloth.current;
    if (c.source !== source) return;
    c.present = false;
    c.ring = false;
    c.source = null;
    kick();
  };

  const sendRipple = (x: number, y: number) => {
    if (!ripple) return;
    const c = cloth.current;
    c.ripples.push({ x, y, t: 0, amp: 9 + 14 * clamp(pull) });
    if (c.ripples.length > 3) c.ripples.shift();
    kick();
    onRipple?.(r1(x), r1(y));
  };

  const down = React.useRef<{ id: number; x: number; y: number } | null>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const c = cloth.current;
    const step = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const fromX = c.present ? c.tx : geo.w / 2;
      const fromY = c.present ? c.ty : geo.h / 2;
      holdAt(
        clamp(fromX + move[0], 0, geo.w),
        clamp(fromY + move[1], 0, geo.h),
        "key",
      );
      return;
    }
    if (event.key === "Escape" && c.present && c.source === "key") {
      event.preventDefault();
      letGo("key");
      setSaid((s) => ({ n: s.n + 1, text: "Let go." }));
    }
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (!live) return;
        if (event.pointerType === "touch" && event.buttons === 0) return;
        const at = local(event.clientX, event.clientY);
        holdAt(at.x, at.y, "pointer");
      }}
      onPointerDown={(event) => {
        if (!live) return;
        const target = event.target instanceof Element ? event.target : null;
        const hit = target?.closest(INTERACTIVE);
        // The content's own controls keep their presses.
        if (
          hit &&
          hit !== surfaceRef.current &&
          rootRef.current?.contains(hit)
        ) {
          return;
        }
        down.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        if (event.pointerType === "touch") {
          const at = local(event.clientX, event.clientY);
          holdAt(at.x, at.y, "pointer");
        }
      }}
      onPointerUp={(event) => {
        const start = down.current;
        down.current = null;
        if (event.pointerType === "touch") letGo("pointer");
        if (!live || !start || start.id !== event.pointerId) return;
        // A press that did not travel is a click: a ripple where it landed.
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
          return;
        }
        const at = local(event.clientX, event.clientY);
        sendRipple(at.x, at.y);
      }}
      onPointerCancel={() => {
        down.current = null;
        letGo("pointer");
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") letGo("pointer");
      }}
      className={cn(
        "group/bias-stripes relative isolate h-full w-full overflow-clip rounded-3 [contain:paint] select-none",
        live ? "touch-none" : "touch-auto",
        disabled && "opacity-70",
        className,
      )}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        viewBox={`0 0 ${geo.w} ${geo.h}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id={`${uid}-fold`}>
            <stop offset="0" stopColor="black" stopOpacity={0.2} />
            <stop offset="0.38" stopColor="black" stopOpacity={0.04} />
            <stop offset="0.62" stopColor="white" stopOpacity={0.1} />
            <stop offset="1" stopColor="white" stopOpacity={0} />
          </radialGradient>
        </defs>
        {Array.from({ length: geo.count - 1 }, (_, k) => {
          const dye =
            dyes[(((geo.k0 + k) % dyes.length) + dyes.length) % dyes.length];
          return (
            <path
              key={k}
              ref={(node) => {
                bandRefs.current[k] = node;
              }}
              d={restBand(geo, k)}
              // A hairline of the band's own colour closes the seam that
              // anti-aliasing leaves between neighbouring bands.
              style={{ fill: dye, stroke: dye }}
              strokeWidth={0.8}
              strokeLinejoin="round"
            />
          );
        })}
        {texture ? (
          <circle
            ref={foldRef}
            cx={0}
            cy={0}
            r={r1(geo.reach * 1.5)}
            opacity={0}
            fill={`url(#${uid}-fold)`}
          />
        ) : null}
        <circle
          ref={flashRef}
          cx={0}
          cy={0}
          r={r1(geo.reach * 0.6)}
          opacity={0}
          fill="none"
          strokeWidth={2}
          stroke="white"
        />
        <circle
          ref={ringRef}
          cx={0}
          cy={0}
          r={18}
          opacity={0}
          fill="none"
          strokeWidth={1.5}
          style={{ stroke: "var(--ring)" }}
        />
      </svg>
      {texture ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light"
          style={{
            backgroundImage: `repeating-linear-gradient(${Math.round(angle + 135)}deg, color-mix(in oklab, white 22%, transparent) 0 1px, transparent 1px 3px), repeating-linear-gradient(${Math.round(angle + 45)}deg, color-mix(in oklab, black 14%, transparent) 0 1px, transparent 1px 4px)`,
          }}
        />
      ) : null}
      <div className="relative z-10 size-full">{children}</div>
      <button
        ref={surfaceRef}
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={!live}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (!live || !event.currentTarget.matches(":focus-visible")) return;
          const c = cloth.current;
          holdAt(
            c.present ? c.tx : geo.w / 2,
            c.present ? c.ty : geo.h / 2,
            "key",
          );
        }}
        onBlur={() => letGo("key")}
        onClick={(event) => {
          if (!live || event.detail !== 0) return;
          const c = cloth.current;
          if (!c.present) holdAt(geo.w / 2, geo.h / 2, "key");
          sendRipple(c.tx, c.ty);
          setSaid((s) => ({
            n: s.n + 1,
            text: "A ripple runs through the cloth.",
          }));
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        The stripes reach toward your hand. Arrow keys move a hand that pulls
        the cloth, Shift for larger steps; Enter or Space sends a ripple from
        it; Escape lets go.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
