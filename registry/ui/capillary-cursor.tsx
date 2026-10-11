"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CapillaryInk = "cobalt" | "iron" | "sepia" | "carmine";

export type CapillaryCursorProps = {
  /** The area the drop lives in. Its buttons, links and fields keep every click, focus and key. */
  children?: React.ReactNode;
  /** The ink: a named ink or any CSS colour. @default "cobalt" */
  inkColor?: CapillaryInk | (string & {});
  /** How fast the ink runs along an outline, px per second. @default 520 */
  wickSpeed?: number;
  /** The drop's diameter when it is full, px. @default 14 */
  dotSize?: number;
  /** How strongly the ink floods the inside of a control, 0 to 1. @default 0.16 */
  strength?: number;
  /** The wicked outline's thickness, px. @default 1.75 */
  lineWidth?: number;
  /** Fill the inside of a control, not only its outline. @default true */
  flood?: boolean;
  /** How far the drop draws out when it moves fast, 0 to 1. @default 0.5 */
  stretch?: number;
  /** How far the draining thread stretches before it lets go, 0 to 1. @default 0.5 */
  cling?: number;
  /** What the ink fills, as a CSS selector. @default "button, a[href], [role='button'], input, select, textarea, [data-ink]" */
  targets?: string;
  /** The drop replaces the system cursor inside the box (never over text fields, never after a key). @default true */
  hideCursor?: boolean;
  /** Keyboard focus moves the ink to the focused control. @default true */
  followFocus?: boolean;
  /** The pointer leads the drop (mouse and pen; a tap inks the tapped control). @default true */
  interactive?: boolean;
  /** The control holding the ink changed: that control, or null. */
  onTargetChange?: (target: HTMLElement | null) => void;
  /** Classes for the box. */
  className?: string;
};

const INKS: Record<CapillaryInk, string> = {
  // Inks are pigment — a hue at a fixed lightness reads on either page —
  // except iron gall, which follows the ink of the theme, dark on paper and
  // pale at night.
  cobalt: "oklch(from var(--accent) 0.57 0.19 h)",
  iron: "color-mix(in oklab, var(--ink) 82%, oklch(0.5 0.12 265))",
  sepia: "oklch(0.56 0.1 55)",
  carmine: "oklch(0.56 0.2 18)",
};

const DEFAULT_TARGETS =
  "button, a[href], [role='button'], input, select, textarea, [data-ink]";

/** Stains that can be on the page at once: one filling, the rest draining. */
const SLOTS = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const f1 = (v: number) => String(Math.round(v * 10) / 10);
const f3 = (v: number) => String(Math.round(v * 1000) / 1000);
const HALF_PI = Math.PI / 2;

type Geo = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radii: top-left, top-right, bottom-right, bottom-left. */
  r: [number, number, number, number];
  /** Perimeter, and the length at which each of the eight runs begins. */
  P: number;
  at: number[];
};

const EMPTY: Geo = { x: 0, y: 0, w: 0, h: 0, r: [0, 0, 0, 0], P: 0, at: [] };

/** A corner radius as computed, in px, whatever form the stylesheet gave it. */
function radiusOf(value: string, w: number, h: number): number {
  const first = value.split(" ")[0] ?? "0";
  const n = parseFloat(first);
  if (!Number.isFinite(n)) return 0;
  return first.endsWith("%") ? (Math.min(w, h) * n) / 100 : n;
}

/** A control's outline: its border box and its own four corner radii. */
function geoOf(el: HTMLElement, root: HTMLElement): Geo {
  const rect = el.getBoundingClientRect();
  const base = root.getBoundingClientRect();
  const style = getComputedStyle(el);
  const w = rect.width;
  const h = rect.height;
  let r: [number, number, number, number] = [
    radiusOf(style.borderTopLeftRadius, w, h),
    radiusOf(style.borderTopRightRadius, w, h),
    radiusOf(style.borderBottomRightRadius, w, h),
    radiusOf(style.borderBottomLeftRadius, w, h),
  ];
  // Radii that overrun a side are scaled down together, as the browser does.
  const fit = Math.min(
    1,
    w / Math.max(1e-6, r[0] + r[1]),
    w / Math.max(1e-6, r[3] + r[2]),
    h / Math.max(1e-6, r[0] + r[3]),
    h / Math.max(1e-6, r[1] + r[2]),
  );
  r = r.map((v) => v * fit) as [number, number, number, number];
  const runs = [
    w - r[0] - r[1],
    HALF_PI * r[1],
    h - r[1] - r[2],
    HALF_PI * r[2],
    w - r[2] - r[3],
    HALF_PI * r[3],
    h - r[3] - r[0],
    HALF_PI * r[0],
  ];
  const at: number[] = [];
  let P = 0;
  for (const run of runs) {
    at.push(P);
    P += Math.max(0, run);
  }
  return { x: rect.left - base.left, y: rect.top - base.top, w, h, r, P, at };
}

/** The outline as a path, clockwise from just after the top-left corner. */
function pathOf(g: Geo): string {
  const { x, y, w, h } = g;
  const [tl, tr, br, bl] = g.r;
  return [
    `M${f1(x + tl)} ${f1(y)}`,
    `H${f1(x + w - tr)}`,
    `A${f1(tr)} ${f1(tr)} 0 0 1 ${f1(x + w)} ${f1(y + tr)}`,
    `V${f1(y + h - br)}`,
    `A${f1(br)} ${f1(br)} 0 0 1 ${f1(x + w - br)} ${f1(y + h)}`,
    `H${f1(x + bl)}`,
    `A${f1(bl)} ${f1(bl)} 0 0 1 ${f1(x)} ${f1(y + h - bl)}`,
    `V${f1(y + tl)}`,
    `A${f1(tl)} ${f1(tl)} 0 0 1 ${f1(x + tl)} ${f1(y)}`,
    "Z",
  ].join(" ");
}

/** The point at length s along the outline. */
function pointAt(g: Geo, s: number): { x: number; y: number } {
  if (g.P <= 0) return { x: g.x, y: g.y };
  const t = ((s % g.P) + g.P) % g.P;
  const { x, y, w, h } = g;
  const [tl, tr, br, bl] = g.r;
  let k = 7;
  while (k > 0 && t < (g.at[k] ?? 0)) k -= 1;
  const u = t - (g.at[k] ?? 0);
  const arc = (cx: number, cy: number, r: number, a0: number) => {
    const a = a0 + (r > 0 ? u / r : 0);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  switch (k) {
    case 0:
      return { x: x + tl + u, y };
    case 1:
      return arc(x + w - tr, y + tr, tr, -HALF_PI);
    case 2:
      return { x: x + w, y: y + tr + u };
    case 3:
      return arc(x + w - br, y + h - br, br, 0);
    case 4:
      return { x: x + w - br - u, y: y + h };
    case 5:
      return arc(x + bl, y + h - bl, bl, HALF_PI);
    case 6:
      return { x, y: y + h - bl - u };
    default:
      return arc(x + tl, y + tl, tl, Math.PI);
  }
}

/** The length along the outline of the point on it nearest (px, py). */
function nearestOn(g: Geo, px: number, py: number): number {
  // Sampled finely, then the outline is short enough that the error is under
  // a pixel; the outline changes rarely and this runs once per contact.
  if (g.P <= 0) return 0;
  const steps = Math.max(32, Math.ceil(g.P / 2));
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < steps; i += 1) {
    const s = (i / steps) * g.P;
    const p = pointAt(g, s);
    const d = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** The signed shortest way round from a to b on a loop of length P. */
const around = (a: number, b: number, P: number) => {
  let d = (((b - a) % P) + P) % P;
  if (d > P / 2) d -= P;
  return d;
};

type Stain = {
  el: HTMLElement | null;
  geo: Geo;
  key: string;
  /** Centre of the wet stretch of outline, and half its length. */
  c: number;
  L: number;
  /** How far the flood has seeped in from the outline, px. */
  d: number;
  phase: "wick" | "drain" | "fade" | "off";
  /** Where on the outline the ink drains back out. */
  exit: number;
  /** Reduced motion: the whole stain's fade. */
  alpha: number;
  thread: boolean;
};

const stainOf = (): Stain => ({
  el: null,
  geo: EMPTY,
  key: "",
  c: 0,
  L: 0,
  d: 0,
  phase: "off",
  exit: 0,
  alpha: 0,
  thread: false,
});

type Nodes = {
  clip: SVGPathElement;
  flood: SVGPathElement;
  wick: SVGPathElement;
  thread: SVGPathElement;
};

/**
 * Inside its own box the pointer is a single drop of ink, exactly at the
 * pointer and drawn out a little along fast travel. Touch a button, a link or
 * a field and the drop gives up its ink to it: from the point of contact the
 * ink wicks along the control's real outline — its border box and its own
 * four corner radii — in both directions, the two fronts slowing as they
 * spread the way capillary flow does; behind them it seeps inward from the
 * wet edge at low strength until the control is filled, taking its exact
 * shape. The drop pays for it — it shrinks as the ink leaves it.
 *
 * Leave, and the flood recedes to the outline and the outline drains back
 * along itself toward the point you left by, while a thread of ink stretches
 * from that point to the drop, thinning as it pulls, and the drop swells as
 * the ink comes home. Pull away far enough and the thread pinches off and
 * what is left on the outline fades.
 *
 * The painted layer never takes a click, and the system cursor returns over
 * text fields, outside the box and on any key. Keyboard focus moves the ink:
 * the focused control wicks from the side nearest the last one and the last
 * drains toward it. A tap inks the tapped control. One loop runs only while
 * ink is moving and halts off screen and in hidden tabs. Under reduced motion
 * the drop keeps its size and a touched control's ink fades in and out whole.
 */
export function CapillaryCursor({
  children,
  inkColor = "cobalt",
  wickSpeed = 520,
  dotSize = 14,
  strength = 0.16,
  lineWidth = 1.75,
  flood = true,
  stretch = 0.5,
  cling = 0.5,
  targets = DEFAULT_TARGETS,
  hideCursor = true,
  followFocus = true,
  interactive = true,
  onTargetChange,
  className,
}: CapillaryCursorProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ink =
    typeof inkColor === "string" && inkColor in INKS
      ? INKS[inkColor as CapillaryInk]
      : inkColor;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dropRef = React.useRef<SVGGElement | null>(null);
  const bodyRef = React.useRef<SVGEllipseElement | null>(null);
  const shineRef = React.useRef<SVGEllipseElement | null>(null);
  const slotRefs = React.useRef<(Partial<Nodes> | undefined)[]>([]);
  const api = React.useRef<{ wake: () => void } | null>(null);

  const params = React.useRef({
    wickSpeed,
    dotSize,
    strength,
    lineWidth,
    flood,
    stretch,
    cling,
    targets,
    hideCursor,
    followFocus,
    interactive,
    motionSafe,
    onTargetChange,
  });
  React.useEffect(() => {
    params.current = {
      wickSpeed,
      dotSize,
      strength,
      lineWidth,
      flood,
      stretch,
      cling,
      targets,
      hideCursor,
      followFocus,
      interactive,
      motionSafe,
      onTargetChange,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const drop = dropRef.current;
    const body = bodyRef.current;
    const shine = shineRef.current;
    if (!root || !drop || !body || !shine) return;

    const stains = Array.from({ length: SLOTS }, stainOf);
    const pointer = { x: 0, y: 0, vx: 0, vy: 0, t: 0, inside: false };
    let keyboard = false;
    let current = -1;
    let reported: HTMLElement | null | undefined = undefined;
    let size = params.current.dotSize;
    let shown = 0;
    let raf = 0;
    let last = 0;
    let inView = true;
    let overField = false;
    let focusFrom: { x: number; y: number } | null = null;

    const nodes = (k: number) => slotRefs.current[k];

    const report = (el: HTMLElement | null) => {
      if (el === reported) return;
      reported = el;
      params.current.onTargetChange?.(el);
    };

    const setCursor = () => {
      const p = params.current;
      const on =
        p.hideCursor &&
        p.interactive &&
        pointer.inside &&
        !keyboard &&
        !overField;
      if (on) root.dataset.ink = "on";
      else delete root.dataset.ink;
    };

    const match = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) return null;
      try {
        const el = node.closest(params.current.targets);
        return el instanceof HTMLElement && el !== root && root.contains(el)
          ? el
          : null;
      } catch {
        return null;
      }
    };

    /** The deepest a flood can seep: to the middle of the control. */
    const depthOf = (g: Geo) => Math.min(g.w, g.h) / 2 + 2;

    /** Starts (or resumes) the ink on a control from a point of contact. */
    const ink = (el: HTMLElement, from: { x: number; y: number }) => {
      let k = stains.findIndex((s) => s.el === el && s.phase !== "off");
      if (k < 0) {
        k = stains.findIndex((s) => s.phase === "off");
        if (k < 0) {
          // Every slot busy: the faintest one gives way.
          let low = Infinity;
          stains.forEach((s, i) => {
            const amount = s.L + s.d;
            if (i !== current && amount < low) {
              low = amount;
              k = i;
            }
          });
        }
        const s = stains[k] as Stain;
        s.el = el;
        s.geo = geoOf(el, root);
        s.key = "";
        s.c = nearestOn(s.geo, from.x, from.y);
        s.L = 0;
        s.d = 0;
        s.alpha = 0;
      }
      const s = stains[k] as Stain;
      s.phase = "wick";
      s.thread = false;
      current = k;
      report(el);
    };

    /** The current stain drains back toward a point. */
    const drain = (
      toward: { x: number; y: number } | null,
      thread: boolean,
    ) => {
      if (current < 0) return;
      const s = stains[current] as Stain;
      current = -1;
      if (s.phase === "off") return;
      s.geo = s.el && s.el.isConnected ? geoOf(s.el, root) : s.geo;
      s.exit = toward ? nearestOn(s.geo, toward.x, toward.y) : s.c;
      // A full ring has no ends: it drains from wherever it is left.
      if (s.L >= s.geo.P / 2 - 0.5) s.c = s.exit;
      s.phase = "drain";
      s.thread = thread && params.current.motionSafe;
      report(null);
    };

    /** How much of the drop's ink is out on the controls, 0 to 1. */
    const spent = () => {
      let used = 0;
      for (const s of stains) {
        if (s.phase === "off" || s.phase === "fade" || s.geo.P <= 0) continue;
        const wet = clamp01((2 * s.L) / s.geo.P);
        const soak = params.current.flood ? clamp01(s.d / depthOf(s.geo)) : 0;
        used += wet * 0.4 + soak * 0.6;
      }
      return Math.min(1, used);
    };

    const draw = () => {
      const p = params.current;
      const still = !p.motionSafe;
      stains.forEach((s, k) => {
        const n = nodes(k);
        if (!n?.clip || !n.flood || !n.wick || !n.thread) return;
        if (s.phase === "off" || s.geo.P <= 0) {
          n.wick.setAttribute("opacity", "0");
          n.flood.setAttribute("opacity", "0");
          n.thread.setAttribute("d", "");
          return;
        }
        const g = s.geo;
        const key = `${f1(g.x)},${f1(g.y)},${f1(g.w)},${f1(g.h)},${g.r.map(f1).join(",")}`;
        if (key !== s.key) {
          s.key = key;
          const d = pathOf(g);
          n.clip.setAttribute("d", d);
          n.flood.setAttribute("d", d);
          n.wick.setAttribute("d", d);
        }
        const P = g.P;
        const L = Math.min(s.L, P / 2);
        const start = s.c - L;
        const fade = still ? s.alpha : s.phase === "fade" ? s.alpha : 1;
        // The wet stretch is one dash a perimeter long, so it wraps the start
        // of the path the way the ink wraps the corner.
        n.wick.setAttribute(
          "stroke-dasharray",
          `${f1(2 * L)} ${f1(Math.max(0, P - 2 * L) + 0.01)}`,
        );
        n.wick.setAttribute("stroke-dashoffset", f1(-start));
        n.wick.setAttribute("stroke-width", f1(p.lineWidth));
        n.wick.setAttribute("opacity", f3(L > 0.2 ? 0.92 * fade : 0));
        if (p.flood) {
          const band = s.d;
          // The flood trails the wick: its cap's roundness keeps it inside
          // the wet stretch.
          const Lf = L >= P / 2 - 0.5 ? P / 2 : Math.max(0, L - band);
          n.flood.setAttribute(
            "stroke-dasharray",
            `${f1(2 * Lf)} ${f1(Math.max(0, P - 2 * Lf) + 0.01)}`,
          );
          n.flood.setAttribute("stroke-dashoffset", f1(-(s.c - Lf)));
          n.flood.setAttribute("stroke-width", f1(2 * band));
          n.flood.setAttribute(
            "opacity",
            f3(band > 0.3 ? clamp01(p.strength) * fade : 0),
          );
        } else {
          n.flood.setAttribute("opacity", "0");
        }
        // The thread from the exit point to the drop, thinning as it pulls.
        if (s.thread && pointer.inside && !keyboard) {
          const a = pointAt(g, s.exit);
          const dx = pointer.x - a.x;
          const dy = pointer.y - a.y;
          const dist = Math.hypot(dx, dy);
          const reach = (1.5 + 5 * clamp01(p.cling)) * p.dotSize;
          const pull = 1 - dist / reach;
          if (pull <= 0 || L <= 0.2) {
            s.thread = false;
            n.thread.setAttribute("d", "");
            if (pull <= 0) s.phase = "fade";
          } else {
            const ux = dist > 1e-3 ? dx / dist : 0;
            const uy = dist > 1e-3 ? dy / dist : 0;
            const nx = -uy;
            const ny = ux;
            const wa = p.lineWidth * (1 + pull);
            const wb = size * 0.55 * pull + 0.6;
            const wm = Math.max(0.35, Math.min(wa, wb) * pull * 0.6);
            const mx = (a.x + pointer.x) / 2;
            const my = (a.y + pointer.y) / 2;
            n.thread.setAttribute(
              "d",
              `M${f1(a.x + (nx * wa) / 2)} ${f1(a.y + (ny * wa) / 2)}` +
                ` Q${f1(mx + (nx * wm) / 2)} ${f1(my + (ny * wm) / 2)} ${f1(pointer.x + (nx * wb) / 2)} ${f1(pointer.y + (ny * wb) / 2)}` +
                ` L${f1(pointer.x - (nx * wb) / 2)} ${f1(pointer.y - (ny * wb) / 2)}` +
                ` Q${f1(mx - (nx * wm) / 2)} ${f1(my - (ny * wm) / 2)} ${f1(a.x - (nx * wa) / 2)} ${f1(a.y - (ny * wa) / 2)} Z`,
            );
          }
        } else {
          n.thread.setAttribute("d", "");
        }
      });
      // The drop: at the pointer, its area what is left of its ink, drawn
      // out along fast travel the way a falling drop is.
      const speed = Math.hypot(pointer.vx, pointer.vy);
      const pull = still
        ? 0
        : clamp01(p.stretch) * 0.6 * Math.min(1, speed / 1400);
      const rx = (size / 2) * (1 + pull);
      const ry = size / 2 / (1 + pull);
      const angle = (Math.atan2(pointer.vy, pointer.vx) * 180) / Math.PI;
      body.setAttribute("cx", f1(pointer.x));
      body.setAttribute("cy", f1(pointer.y));
      body.setAttribute("rx", f1(rx));
      body.setAttribute("ry", f1(ry));
      body.setAttribute(
        "transform",
        `rotate(${f1(speed > 20 ? angle : 0)} ${f1(pointer.x)} ${f1(pointer.y)})`,
      );
      shine.setAttribute("cx", f1(pointer.x - size * 0.14));
      shine.setAttribute("cy", f1(pointer.y - size * 0.16));
      shine.setAttribute("rx", f1(size * 0.13));
      shine.setAttribute("ry", f1(size * 0.09));
      drop.setAttribute("opacity", f3(shown));
    };

    /** Advances every stain and the drop by dt seconds; returns whether anything moves. */
    const step = (dt: number) => {
      const p = params.current;
      const still = !p.motionSafe;
      let busy = false;
      for (const s of stains) {
        if (s.phase === "off") continue;
        if (s.el && s.el.isConnected) s.geo = geoOf(s.el, root);
        const P = s.geo.P;
        if (P <= 0) continue;
        const deep = depthOf(s.geo);
        if (still) {
          // Still: the whole stain fades in or out; nothing travels.
          s.L = P / 2;
          s.d = p.flood ? deep : 0;
          const goal = s.phase === "wick" ? 1 : 0;
          s.alpha += (goal - s.alpha) * Math.min(1, (dt / durations.base) * 3);
          if (Math.abs(goal - s.alpha) < 0.01) {
            s.alpha = goal;
            if (goal === 0) s.phase = "off";
          } else busy = true;
          continue;
        }
        if (s.phase === "wick") {
          // Capillary flow: the longer the column, the slower its front.
          const speed = p.wickSpeed / Math.sqrt(1 + (2 * s.L) / P);
          s.L = Math.min(P / 2, s.L + speed * dt);
          const goal = p.flood ? deep : 0;
          // The flood seeps in behind the fronts at a slower, easing rate.
          const seep = Math.max(1.2, p.wickSpeed / 150);
          s.d +=
            (goal - s.d) *
            (1 - Math.exp(-seep * dt)) *
            clamp01((2 * s.L) / P + 0.25);
          if (s.L < P / 2 - 0.01 || Math.abs(goal - s.d) > 0.3) busy = true;
        } else if (s.phase === "drain") {
          const speed = p.wickSpeed * 1.15;
          s.c += clamp(around(s.c, s.exit, P), -speed * dt, speed * dt);
          s.L = Math.max(0, s.L - speed * dt);
          s.d *= Math.exp(-6 * dt);
          if (s.L <= 0.2 && s.d < 0.3) {
            s.phase = "off";
            s.el = null;
          } else busy = true;
        } else if (s.phase === "fade") {
          s.alpha = s.alpha === 0 ? 1 : s.alpha;
          s.alpha = Math.max(0, s.alpha - dt / durations.slow);
          s.d *= Math.exp(-3 * dt);
          if (s.alpha <= 0) {
            s.phase = "off";
            s.el = null;
            s.alpha = 0;
          } else busy = true;
        }
      }
      const want = p.dotSize * (still ? 1 : Math.sqrt(1 - 0.55 * spent()));
      size += (want - size) * Math.min(1, dt / 0.06);
      if (Math.abs(want - size) > 0.05) busy = true;
      const visible =
        pointer.inside && !keyboard && !overField && p.interactive ? 1 : 0;
      shown += (visible - shown) * Math.min(1, dt / 0.08);
      if (Math.abs(visible - shown) < 0.01) shown = visible;
      else busy = true;
      if (performance.now() - pointer.t > 40) {
        pointer.vx *= Math.exp(-dt / 0.03);
        pointer.vy *= Math.exp(-dt / 0.03);
      }
      if (Math.hypot(pointer.vx, pointer.vy) > 4) busy = true;
      return busy;
    };

    const canRun = () => inView && !document.hidden;
    const tick = (t: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      const busy = step(dt);
      draw();
      if (busy && canRun()) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (raf || !canRun()) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const local = (clientX: number, clientY: number) => {
      const b = root.getBoundingClientRect();
      return { x: clientX - b.left, y: clientY - b.top };
    };

    const onMove = (event: PointerEvent) => {
      const p = params.current;
      if (!p.interactive || event.pointerType === "touch") return;
      const pt = local(event.clientX, event.clientY);
      const now = performance.now();
      if (pointer.inside && now - pointer.t < 100) {
        const dt = Math.max(1 / 240, (now - pointer.t) / 1000);
        pointer.vx = pointer.vx * 0.5 + ((pt.x - pointer.x) / dt) * 0.5;
        pointer.vy = pointer.vy * 0.5 + ((pt.y - pointer.y) / dt) * 0.5;
      } else {
        pointer.vx = 0;
        pointer.vy = 0;
      }
      pointer.x = pt.x;
      pointer.y = pt.y;
      pointer.t = now;
      pointer.inside = true;
      keyboard = false;
      const target = event.target;
      overField =
        target instanceof Element &&
        Boolean(target.closest("input, textarea, select, [contenteditable]"));
      setCursor();
      const over = match(event.target);
      const holding = current >= 0 ? (stains[current] as Stain).el : null;
      if (over && over !== holding) {
        if (holding) drain(pt, true);
        ink(over, pt);
      } else if (!over && holding) {
        drain(pt, true);
      }
      // The cursor answers in the same frame as the pointer.
      draw();
      wake();
    };

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const pt = local(event.clientX, event.clientY);
      pointer.inside = false;
      pointer.vx = 0;
      pointer.vy = 0;
      setCursor();
      if (current >= 0) drain(pt, false);
      wake();
    };

    const onDown = (event: PointerEvent) => {
      if (!params.current.interactive || event.pointerType !== "touch") return;
      // No hover on glass: a tap inks the tapped control, and it stays.
      const pt = local(event.clientX, event.clientY);
      const over = match(event.target);
      const holding = current >= 0 ? (stains[current] as Stain).el : null;
      if (over === holding) return;
      if (holding) drain(pt, false);
      if (over) ink(over, pt);
      wake();
    };

    const onKey = () => {
      if (keyboard) return;
      keyboard = true;
      setCursor();
      wake();
    };

    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || !params.current.followFocus) return;
      if (!el.matches(":focus-visible")) return;
      const over = match(el);
      if (!over) return;
      keyboard = true;
      setCursor();
      const g = geoOf(over, root);
      const centre = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
      // The ink arrives from the side of the last control it was on.
      const from = focusFrom ?? { x: g.x, y: centre.y };
      const holding = current >= 0 ? (stains[current] as Stain).el : null;
      if (holding && holding !== over) drain(centre, false);
      ink(over, from);
      focusFrom = centre;
      wake();
    };

    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      if (!keyboard) return;
      focusFrom = null;
      drain(null, false);
      wake();
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerover", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const sizer = new ResizeObserver(() => wake());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    draw();
    api.current = {
      wake: () => {
        setCursor();
        wake();
      },
    };

    return () => {
      halt();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerover", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      delete root.dataset.ink;
      api.current = null;
    };
  }, []);

  React.useEffect(() => {
    api.current?.wake();
  }, [
    wickSpeed,
    dotSize,
    strength,
    lineWidth,
    flood,
    stretch,
    cling,
    targets,
    hideCursor,
    followFocus,
    interactive,
    motionSafe,
  ]);

  const bindSlot =
    (k: number, part: keyof Nodes) => (node: SVGPathElement | null) => {
      const slot = (slotRefs.current[k] ??= {});
      if (node) slot[part] = node;
      else delete slot[part];
    };

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate overflow-clip",
        // While the drop leads it is the cursor — except over text fields,
        // where a caret has to show where typing will go.
        "data-[ink=on]:cursor-none data-[ink=on]:[&_*]:cursor-none",
        "data-[ink=on]:[&_:is(input,textarea,select,[contenteditable])]:cursor-text",
        className,
      )}
    >
      <div className="relative z-0 size-full">{children}</div>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full"
        style={{ color: ink }}
      >
        <defs>
          {Array.from({ length: SLOTS }, (_, k) => (
            <clipPath key={k} id={`${uid}-ink-${k}`}>
              <path ref={bindSlot(k, "clip")} />
            </clipPath>
          ))}
        </defs>
        {Array.from({ length: SLOTS }, (_, k) => (
          <g key={k}>
            <path
              ref={bindSlot(k, "flood")}
              clipPath={`url(#${uid}-ink-${k})`}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              opacity={0}
            />
            <path
              ref={bindSlot(k, "wick")}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              opacity={0}
            />
            <path ref={bindSlot(k, "thread")} fill="currentColor" />
          </g>
        ))}
        <g ref={dropRef} opacity={0}>
          <ellipse ref={bodyRef} fill="currentColor" />
          <ellipse
            ref={shineRef}
            className="fill-primary-foreground"
            fillOpacity={0.55}
          />
        </g>
      </svg>
    </div>
  );
}
