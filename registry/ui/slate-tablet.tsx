"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SlateTabletInk = "black" | "blue" | "red";
export type SlateTabletOrientation = "landscape" | "portrait";
/** A finished stroke: points in fractions of the screen's width, from its top left. */
export type SlateTabletStroke = { x: number; y: number }[];

export type SlateTabletProps = {
  /** The screen: any content, laid out in a size container the shape of the screen. */
  children?: React.ReactNode;
  /** The device's accessible name. @default "Tablet" */
  label?: string;
  /** Controlled: whether the pencil is in its dock. */
  docked?: boolean;
  /** Initial state when uncontrolled. @default true */
  defaultDocked?: boolean;
  /** Fires from the drag, tap or key that picked the pencil up or put it back. */
  onDockedChange?: (docked: boolean) => void;
  /** Each stroke as it is finished. */
  onStroke?: (points: SlateTabletStroke) => void;
  /** The ink, and the pencil's nib. Black follows the theme's ink, as note apps invert it on dark screens. @default "black" */
  ink?: SlateTabletInk;
  /** The black glass around the screen, in px, 8 to 24. @default 14 */
  bezel?: number;
  /** Lying down with the pencil on top, or standing with it on the right. @default "landscape" */
  orientation?: SlateTabletOrientation;
  /** Play the nib on the glass and the magnet. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The tablet's long side over its short side. */
const RATIO = 1.42;
/** The pencil, in short sides of the tablet. */
const PL = 0.88;
const PT = 0.06;
/** How the held pencil sits: leaning up and right, foreshortened, nearer the eye. */
const HAND_ANGLE = -55;
const HAND_LENGTH = 0.58;
const HAND_GIRTH = 1.16;
/** Most strokes and points kept, so the ink layer always redraws quickly. */
const MOST_STROKES = 240;
const MOST_POINTS = 1500;

const ALUMINIUM = "oklch(0.8 0.004 250)";
const GLASS = "oklch(0.15 0.004 265)";
const INK_COLOURS: Record<SlateTabletInk, string> = {
  black: "var(--ink)",
  blue: "oklch(0.56 0.19 260)",
  red: "oklch(0.58 0.2 27)",
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

type Pt = { x: number; y: number };
/** A point of ink in screen-width units, with its width. */
type InkPt = { x: number; y: number; w: number };
type Stroke = { ink: SlateTabletInk; pts: InkPt[] };

type Geom = {
  /** Root box. */
  w: number;
  h: number;
  /** The docked pencil's tip, and its length and girth, in root px. */
  tipX: number;
  tipY: number;
  len: number;
  girth: number;
  /** The screen inside the root. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

type Layout = {
  s: string;
  body: React.CSSProperties;
  pencil: React.CSSProperties;
  camera: React.CSSProperties;
  dockAngle: number;
};

/** The whole tablet from one length, the short side `--s`, fitted to the box. */
const LAYOUTS: Record<SlateTabletOrientation, Layout> = {
  landscape: {
    s: `min((100cqw - 6cqmin) / ${RATIO}, (100cqh - 6cqmin) / ${r4(1 + PT)})`,
    body: {
      left: `calc(50% - var(--s) * ${r4(RATIO / 2)})`,
      top: `calc(50% - var(--s) * ${r4((1 + PT) / 2 - PT)})`,
      width: `calc(var(--s) * ${RATIO})`,
      height: "var(--s)",
    },
    pencil: {
      left: `calc(50% - var(--s) * ${r4(PL / 2)})`,
      top: `calc(50% - var(--s) * ${r4((1 + PT) / 2)})`,
    },
    camera: { left: "50%", top: "calc(var(--bezel) / 2)" },
    dockAngle: 0,
  },
  portrait: {
    s: `min((100cqw - 6cqmin) / ${r4(1 + PT)}, (100cqh - 6cqmin) / ${RATIO})`,
    body: {
      left: `calc(50% - var(--s) * ${r4((1 + PT) / 2)})`,
      top: `calc(50% - var(--s) * ${r4(RATIO / 2)})`,
      width: "var(--s)",
      height: `calc(var(--s) * ${RATIO})`,
    },
    pencil: {
      left: `calc(50% + var(--s) * ${r4((1 + PT) / 2 - PT / 2)})`,
      top: `calc(50% - var(--s) * ${r4(PL / 2 + PT / 2)})`,
    },
    camera: { left: "calc(100% - var(--bezel) / 2)", top: "50%" },
    dockAngle: 90,
  },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** One length of a stroke: a quadratic through the point before, round at both ends. */
function segment(
  ctx: CanvasRenderingContext2D,
  pts: InkPt[],
  i: number,
  scale: number,
) {
  const p = pts[i];
  const q = pts[i - 1];
  if (!p || !q) return;
  const o = pts[i - 2];
  const mid = (a: InkPt, b: InkPt) => ({
    x: ((a.x + b.x) / 2) * scale,
    y: ((a.y + b.y) / 2) * scale,
  });
  const from = o ? mid(o, q) : { x: q.x * scale, y: q.y * scale };
  const to = mid(q, p);
  ctx.lineWidth = Math.max(0.6, ((q.w + p.w) / 2) * scale);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(q.x * scale, q.y * scale, to.x, to.y);
  ctx.stroke();
}

/** The last half-segment, from the final midpoint to the final point. */
function tail(ctx: CanvasRenderingContext2D, pts: InkPt[], scale: number) {
  const p = pts[pts.length - 1];
  const q = pts[pts.length - 2];
  if (!p) return;
  if (!q) {
    ctx.beginPath();
    ctx.arc(p.x * scale, p.y * scale, (p.w * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.lineWidth = Math.max(0.6, p.w * scale);
  ctx.beginPath();
  ctx.moveTo(((p.x + q.x) / 2) * scale, ((p.y + q.y) / 2) * scale);
  ctx.lineTo(p.x * scale, p.y * scale);
  ctx.stroke();
}

type Api = {
  measure: () => void;
  repaint: () => void;
  settlePose: (docked: boolean, velocity?: Pt) => void;
};

/**
 * A tablet frame with its pencil docked on the long edge. Drag the pencil off
 * and it follows the finger, turning to the writing angle and rising toward
 * the eye as it leaves the magnet; with it out, the screen takes ink — a
 * smoothed stroke whose width follows the hand's speed, fine when fast and
 * broad when slow — and the pencil rides the pointer with its shadow closing
 * in as it writes. Bring it back to the edge and it snaps into the dock on
 * the snap spring, and the ink fades away.
 *
 * The frame is drawn from one length, a CSS `min()` of its container, so it
 * fits any box and renders the same on the server. The pencil is a real
 * toggle button: Enter picks it up and puts it back, arrow keys write while
 * it is out, Escape docks it. The ink is a canvas at no more than twice the
 * screen's resolution whose colours come from its own computed style. Under
 * reduced motion the pencil changes pose without travelling, and the ink
 * still fades when it docks.
 */
export function SlateTablet({
  children,
  label = "Tablet",
  docked,
  defaultDocked = true,
  onDockedChange,
  onStroke,
  ink = "black",
  bezel = 14,
  orientation = "landscape",
  sound = false,
  disabled = false,
  className,
}: SlateTabletProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const svgId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const layout = LAYOUTS[orientation] ?? LAYOUTS.landscape;
  const glass = Math.min(24, Math.max(8, bezel));
  const nib = INK_COLOURS[ink] ?? INK_COLOURS.black;

  const [own, setOwn] = React.useState(defaultDocked);
  const isDocked = docked ?? own;
  const [check, setCheck] = React.useState(0);
  const [geom, setGeom] = React.useState<Geom | null>(null);
  const [said, setSaid] = React.useState({ n: 0, docked: isDocked, text: "" });
  if (said.docked !== isDocked) {
    setSaid({
      n: said.n + 1,
      docked: isDocked,
      text: isDocked
        ? "Pencil docked. Ink cleared."
        : "Pencil out. Draw on the screen, or use the arrow keys.",
    });
  }

  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const held = useMotionValue(isDocked ? 0 : 1);
  const press = useMotionValue(0);
  const inkOpacity = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const screenRef = React.useRef<HTMLDivElement | null>(null);
  const pencilRef = React.useRef<HTMLButtonElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const geomRef = React.useRef<Geom | null>(null);
  const strokes = React.useRef<Stroke[]>([]);
  const live = React.useRef<{
    stroke: Stroke;
    at: Pt;
    t: number;
    speed: number;
  } | null>(null);
  const grab = React.useRef({ gx: 0, gy: 0, fromDock: true, freed: false });
  const poseDocked = React.useRef(isDocked);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const loop = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef(0);
  const follow = React.useRef<(() => void) | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  /* ------------------------------ geometry ------------------------------ */

  const measure = () => {
    const root = rootRef.current;
    const screen = screenRef.current;
    const pencil = pencilRef.current;
    if (!root || !screen || !pencil) return;
    const a = root.getBoundingClientRect();
    const b = screen.getBoundingClientRect();
    if (a.width < 1 || b.width < 1) return;
    const next: Geom = {
      w: r2(a.width),
      h: r2(a.height),
      tipX: r2(pencil.offsetLeft),
      tipY: r2(pencil.offsetTop + pencil.offsetHeight / 2),
      len: r2(pencil.offsetWidth),
      girth: r2(pencil.offsetHeight),
      sx: r2(b.left - a.left),
      sy: r2(b.top - a.top),
      sw: r2(b.width),
      sh: r2(b.height),
    };
    const was = geomRef.current;
    geomRef.current = next;
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(next.sw * dpr);
      canvas.height = Math.round(next.sh * dpr);
    }
    paint();
    if (
      !poseDocked.current &&
      (!was || was.tipX !== next.tipX || was.tipY !== next.tipY)
    ) {
      // A held pencil — from the start, or as the tablet turned under it — is
      // held over the middle of the screen.
      const c = centre(next);
      dx.set(c.x);
      dy.set(c.y);
    }
    setGeom((g) =>
      g &&
      g.w === next.w &&
      g.h === next.h &&
      g.tipX === next.tipX &&
      g.tipY === next.tipY &&
      g.sw === next.sw &&
      g.sh === next.sh
        ? g
        : next,
    );
  };

  /** The pencil's offset that holds its tip over the middle of the screen. */
  const centre = (g: Geom): Pt => ({
    x: r2(g.sx + g.sw / 2 - g.tipX),
    y: r2(g.sy + g.sh / 2 - g.tipY),
  });

  /* -------------------------------- ink --------------------------------- */

  const colours = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const style = getComputedStyle(canvas);
    return {
      black: style.color,
      blue: style.borderTopColor,
      red: style.borderBottomColor,
    } satisfies Record<SlateTabletInk, string>;
  };

  const brush = (stroke: Stroke) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const g = geomRef.current;
    const c = colours();
    if (!canvas || !ctx || !g || !c) return null;
    const dpr = canvas.width / Math.max(1, g.sw);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = c[stroke.ink];
    ctx.fillStyle = c[stroke.ink];
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return { ctx, scale: g.sw };
  };

  /** Every stroke so far, from its points: after a resize or a theme change. */
  const paint = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes.current) {
      const b = brush(stroke);
      if (!b) return;
      for (let i = 1; i < stroke.pts.length; i += 1) {
        segment(b.ctx, stroke.pts, i, b.scale);
      }
      tail(b.ctx, stroke.pts, b.scale);
    }
  };

  const addPoint = (stroke: Stroke, p: InkPt) => {
    if (stroke.pts.length >= MOST_POINTS) return;
    stroke.pts.push(p);
    const b = brush(stroke);
    if (!b) return;
    if (stroke.pts.length === 1) tail(b.ctx, stroke.pts, b.scale);
    else segment(b.ctx, stroke.pts, stroke.pts.length - 1, b.scale);
  };

  const beginStroke = (): Stroke => {
    const stroke: Stroke = { ink, pts: [] };
    strokes.current.push(stroke);
    if (strokes.current.length > MOST_STROKES) strokes.current.shift();
    return stroke;
  };

  const endStroke = (stroke: Stroke) => {
    // The last half-length, drawn round, finishes it.
    const b = brush(stroke);
    if (b && stroke.pts.length > 1) tail(b.ctx, stroke.pts, b.scale);
    onStroke?.(stroke.pts.map((p) => ({ x: r4(p.x), y: r4(p.y) })));
  };

  const clearInk = () => {
    strokes.current = [];
    live.current = null;
    paint();
  };

  /** The broadest a slow line gets, in screen widths. */
  const baseWidth = () => {
    const g = geomRef.current;
    return g ? Math.max(1.2, g.sw * 0.0085) / g.sw : 0.0085;
  };

  /* ------------------------------- sound -------------------------------- */

  const quiet = () => {
    window.clearTimeout(hush.current);
    loop.current?.stop();
    loop.current = null;
  };

  const voice = (speed: number, clientX: number) => {
    loop.current?.set({
      pitch: r2(0.85 + Math.min(1.2, speed * 0.45)),
      gain: r2(Math.min(0.55, 0.12 + speed * 0.3)),
      pan: panFrom(clientX, rootRef.current),
    });
    window.clearTimeout(hush.current);
    hush.current = window.setTimeout(() => loop.current?.set({ gain: 0 }), 60);
  };

  const snapSound = (into: boolean) => {
    const rect = pencilRef.current?.getBoundingClientRect();
    audio.play("snap", {
      pitch: into ? 1 : 1.35,
      gain: into ? 0.6 : 0.3,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  /* ------------------------------- poses -------------------------------- */

  /** Moves the pencil to the dock or into the hand; the ink fades on docking. */
  const settlePose = (toDock: boolean, velocity: Pt = { x: 0, y: 0 }) => {
    const g = geomRef.current;
    poseDocked.current = toDock;
    const target = toDock ? { x: 0, y: 0 } : g ? centre(g) : { x: 0, y: 0 };
    if (toDock) {
      run(
        "ink",
        animate(inkOpacity, 0, {
          duration: durations.page,
          ease: easings.exit,
          onComplete: () => {
            clearInk();
            inkOpacity.set(1);
          },
        }),
      );
    } else {
      halt("ink");
      inkOpacity.set(1);
    }
    if (!motionSafe) {
      for (const k of ["dx", "dy", "held"]) halt(k);
      dx.set(target.x);
      dy.set(target.y);
      held.set(toDock ? 0 : 1);
      return;
    }
    // Into the dock it snaps, carrying the throw; out of it, the hand lifts
    // it over the page on the glide.
    const spring = toDock ? springs.snap : springs.glide;
    let landed = false;
    run(
      "dx",
      animate(dx, target.x, {
        ...spring,
        velocity: velocity.x,
        onUpdate: (x) => {
          if (!toDock || landed) return;
          if (Math.abs(x) < 1.5 && Math.abs(dy.get()) < 1.5) {
            landed = true;
            snapSound(true);
          }
        },
      }),
    );
    run("dy", animate(dy, target.y, { ...spring, velocity: velocity.y }));
    run("held", animate(held, toDock ? 0 : 1, spring));
  };

  const ask = (toDock: boolean) => {
    if (toDock === isDocked) return;
    if (docked === undefined) setOwn(toDock);
    onDockedChange?.(toDock);
    // A host that refuses gets its own state back once it has had its turn.
    if (docked !== undefined)
      React.startTransition(() => setCheck((c) => c + 1));
  };

  /** A tap or a key on the pencil: out to the middle of the page, or home. */
  const toggle = () => {
    if (disabled) return;
    if (isDocked) snapSound(false);
    ask(!isDocked);
  };

  React.useEffect(() => {
    api.current = { measure, repaint: paint, settlePose };
  });

  // Whatever changed the state, the pencil goes where it says.
  React.useEffect(() => {
    if (poseDocked.current === isDocked) return;
    api.current?.settlePose(isDocked);
  }, [isDocked, check]);

  // Size and screen, bound to the nodes when they arrive.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);
  // The screen changes size with the glass and the orientation, which the
  // root's observer cannot see, so it is watched too.
  const bindScreen = React.useCallback((node: HTMLDivElement | null) => {
    screenRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(hush.current);
        loop.current?.stop();
        loop.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      follow.current?.();
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(hush.current);
      loop.current?.stop();
      loop.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // A new theme changes the canvas's colours; the 1ms transition says when.
  const repaintSoon = React.useRef(0);
  const onColours = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current?.repaint();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  /* ---------------------------- the pencil ------------------------------ */

  /** Distance from a root point to the docked pencil's line. */
  const fromDock = (g: Geom, p: Pt) => {
    const a = (layout.dockAngle * Math.PI) / 180;
    const ux = Math.round(Math.cos(a));
    const uy = Math.round(Math.sin(a));
    const t = Math.min(
      g.len,
      Math.max(0, (p.x - g.tipX) * ux + (p.y - g.tipY) * uy),
    );
    return Math.hypot(p.x - (g.tipX + ux * t), p.y - (g.tipY + uy * t));
  };

  const local = (clientX: number, clientY: number): Pt => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const pencilDrag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, offset }) => {
      const g = geomRef.current;
      if (!g) return;
      for (const k of ["dx", "dy", "held"]) halt(k);
      const start = local(point.x - offset.x, point.y - offset.y);
      grab.current = {
        gx: start.x - (g.tipX + dx.get()),
        gy: start.y - (g.tipY + dy.get()),
        fromDock: poseDocked.current,
        freed: !poseDocked.current,
      };
    },
    onMove: ({ point }) => {
      const g = geomRef.current;
      if (!g) return;
      const p = local(point.x, point.y);
      // How far out of the magnet's reach: 0 on the dock, 1 well clear of it.
      const k = smooth((fromDock(g, p) - g.girth * 0.5) / (g.girth * 3.5));
      const { gx, gy, fromDock: wasDocked } = grab.current;
      // Out of the dock the tip slides under the finger, the writing grip;
      // a held pencil keeps the grip it was picked up by.
      const hold = wasDocked ? 1 - k : 1;
      // The tip rubber-bands at the edges of the box rather than leaving it.
      const m = g.girth;
      const tx = rubberClamp(p.x - gx * hold, m, g.w - m, m * 2);
      const ty = rubberClamp(p.y - gy * hold, m, g.h - m, m * 2);
      dx.set(r2(tx - g.tipX));
      dy.set(r2(ty - g.tipY));
      held.set(r4(k));
      if (!grab.current.freed && k > 0.35) {
        grab.current.freed = true;
        snapSound(false);
      }
    },
    onEnd: ({ point, velocity }) => {
      const g = geomRef.current;
      if (!g) return;
      const p = local(point.x, point.y);
      // Where the throw would come to rest decides: back in the dock, or held.
      const rest = {
        x: project(p.x, velocity.x, 0.99),
        y: project(p.y, velocity.y, 0.99),
      };
      const home =
        fromDock(g, p) < g.girth * 2.2 || fromDock(g, rest) < g.girth * 1.5;
      if (home) {
        settlePose(true, velocity);
        ask(true);
        return;
      }
      poseDocked.current = false;
      // Let go off the glass, it comes to rest on the nearest part of it.
      const tx = g.tipX + dx.get();
      const ty = g.tipY + dy.get();
      const cx = Math.min(g.sx + g.sw, Math.max(g.sx, tx)) - g.tipX;
      const cy = Math.min(g.sy + g.sh, Math.max(g.sy, ty)) - g.tipY;
      if (motionSafe) {
        run("held", animate(held, 1, springs.glide));
        run("dx", animate(dx, r2(cx), springs.glide));
        run("dy", animate(dy, r2(cy), springs.glide));
      } else {
        held.set(1);
        dx.set(r2(cx));
        dy.set(r2(cy));
      }
      ask(false);
    },
    onCancel: () => settlePose(isDocked),
    onTap: () => toggle(),
  });

  /* ------------------------------- writing ------------------------------ */

  const screenPoint = (clientX: number, clientY: number): Pt => {
    const g = geomRef.current;
    const rect = screenRef.current?.getBoundingClientRect();
    if (!g || !rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / g.sw,
      y: (clientY - rect.top) / g.sw,
    };
  };

  /** The held pencil's tip goes where the ink is, and never off the glass. */
  const tipTo = (p: Pt) => {
    const g = geomRef.current;
    if (!g) return;
    halt("dx");
    halt("dy");
    const x = Math.min(1, Math.max(0, p.x));
    const y = Math.min(g.sh / g.sw, Math.max(0, p.y));
    dx.set(r2(g.sx + x * g.sw - g.tipX));
    dy.set(r2(g.sy + y * g.sw - g.tipY));
  };

  const pressDown = (down: boolean) => {
    if (!motionSafe) return;
    run("press", animate(press, down ? 1 : 0, springs.flick));
  };

  const writing = useDrag({
    threshold: 1,
    disabled: disabled || isDocked,
    onStart: ({ point, offset, event }) => {
      const at = screenPoint(point.x - offset.x, point.y - offset.y);
      const stroke = beginStroke();
      live.current = { stroke, at, t: event.timeStamp, speed: 0 };
      addPoint(stroke, { ...at, w: baseWidth() });
      tipTo(at);
      pressDown(true);
      quiet();
      loop.current = audio.start("scratch", {
        pitch: 0.9,
        gain: 0,
        pan: panFrom(point.x, rootRef.current),
      });
    },
    onMove: ({ point, event }) => {
      const s = live.current;
      if (!s) return;
      const at = screenPoint(point.x, point.y);
      const g = geomRef.current;
      const px = g ? g.sw : 1;
      const moved = Math.hypot(at.x - s.at.x, at.y - s.at.y) * px;
      if (moved < 1.2) return;
      const dt = Math.max(4, event.timeStamp - s.t);
      // Speed in px/ms, eased, so the width never steps.
      const speed = s.speed * 0.6 + (moved / dt) * 0.4;
      const last = s.stroke.pts[s.stroke.pts.length - 1];
      const target =
        baseWidth() * Math.min(1.6, Math.max(0.35, 1.6 - speed * 0.9));
      const w = last ? last.w * 0.55 + target * 0.45 : target;
      addPoint(s.stroke, { x: r4(at.x), y: r4(at.y), w: r4(w) });
      tipTo(at);
      voice(speed, point.x);
      live.current = { stroke: s.stroke, at, t: event.timeStamp, speed };
    },
    onEnd: () => {
      const s = live.current;
      live.current = null;
      quiet();
      pressDown(false);
      if (s) endStroke(s.stroke);
    },
    onCancel: () => {
      const s = live.current;
      live.current = null;
      quiet();
      pressDown(false);
      if (s) endStroke(s.stroke);
    },
    onTap: (event) => {
      const at = screenPoint(event.clientX, event.clientY);
      const stroke = beginStroke();
      addPoint(stroke, { x: r4(at.x), y: r4(at.y), w: r4(baseWidth() * 1.2) });
      tipTo(at);
      endStroke(stroke);
      scratchBurst();
    },
  });

  /** A short burst of the nib on the glass, for a dot or a key's line. */
  const scratchBurst = () => {
    const g = geomRef.current;
    const rect = rootRef.current?.getBoundingClientRect();
    quiet();
    loop.current = audio.start("scratch", {
      pitch: 1.1,
      gain: 0.3,
      pan:
        g && rect ? panFrom(rect.left + g.tipX + dx.get(), rootRef.current) : 0,
    });
    hush.current = window.setTimeout(quiet, 70);
  };

  /** The keyboard's pen: an arrow writes a short line, Shift moves without ink. */
  const keyWrite = (ux: number, uy: number, withInk: boolean) => {
    const g = geomRef.current;
    if (!g) return;
    const step = 0.04;
    const from = {
      x: r4((g.tipX + dx.get() - g.sx) / g.sw),
      y: r4((g.tipY + dy.get() - g.sy) / g.sw),
    };
    const to = {
      x: r4(Math.min(1, Math.max(0, from.x + ux * step))),
      y: r4(Math.min(g.sh / g.sw, Math.max(0, from.y + uy * step))),
    };
    tipTo(to);
    if (!withInk) return;
    const stroke = beginStroke();
    addPoint(stroke, { ...from, w: baseWidth() });
    addPoint(stroke, { ...to, w: baseWidth() });
    endStroke(stroke);
    scratchBurst();
  };

  /* ----------------------------- drawing it ----------------------------- */

  const poseOf = (x: number, y: number, k: number, lift = 0) => {
    const t = clamp01(k);
    const a = lerp(layout.dockAngle, HAND_ANGLE, t);
    let sx = lerp(1, HAND_LENGTH, t);
    if (geom && t > 0) {
      // Stood more upright wherever its full length would leave the box.
      const rad = (a * Math.PI) / 180;
      const cx = Math.cos(rad);
      const cy = Math.sin(rad);
      const tx = geom.tipX + x;
      const ty = geom.tipY + y;
      const m = geom.girth;
      let room = Infinity;
      if (cx > 1e-3) room = Math.min(room, (geom.w - m - tx) / cx);
      if (cx < -1e-3) room = Math.min(room, (tx - m) / -cx);
      if (cy > 1e-3) room = Math.min(room, (geom.h - m - ty) / cy);
      if (cy < -1e-3) room = Math.min(room, (ty - m) / -cy);
      sx = Math.min(sx, Math.max(0.16, room / Math.max(1, geom.len)));
    }
    const sy = lerp(1, HAND_GIRTH, t);
    return `translate(${r2(x + lift * 4)}px, ${r2(y + lift * 6)}px) rotate(${r2(a)}deg) scale(${r4(sx)}, ${r4(sy)})`;
  };

  const pencilTransform = useTransform(
    [dx, dy, held] as MotionValue<number>[],
    ([x = 0, y = 0, k = 0]: number[]) => poseOf(x, y, k),
  );
  const shadowTransform = useTransform(
    [dx, dy, held, press] as MotionValue<number>[],
    ([x = 0, y = 0, k = 0, p = 0]: number[]) =>
      poseOf(x, y, k, clamp01(k) * (1 - 0.7 * p)),
  );
  const shadowOpacity = useTransform(held, (k) => r2(clamp01(k) * 0.22));

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label}
      data-orientation={orientation}
      data-docked={isDocked ? "" : undefined}
      className={cn(
        "group/slate-tablet [container-type:size] relative aspect-[4/3] w-full select-none",
        disabled && "opacity-60",
        className,
      )}
      style={
        {
          "--s": layout.s,
          "--bezel": `${glass}px`,
        } as React.CSSProperties
      }
    >
      {/* The body: an aluminium edge, the black glass, the screen. */}
      <div
        className="absolute"
        style={{
          ...layout.body,
          borderRadius: `calc(var(--s) * 0.03 + var(--bezel) + var(--s) * 0.008)`,
          background: ALUMINIUM,
          padding: "calc(var(--s) * 0.008)",
          boxShadow: `0 calc(var(--s) * 0.012) calc(var(--s) * 0.03) color-mix(in oklab, black 22%, transparent), inset 0 0 0 1px color-mix(in oklab, white 40%, transparent)`,
        }}
      >
        <div
          className="relative size-full"
          style={{
            borderRadius: `calc(var(--s) * 0.03 + var(--bezel))`,
            background: GLASS,
            padding: "var(--bezel)",
          }}
        >
          <span
            aria-hidden
            className="absolute size-1.5 -translate-1/2 rounded-full"
            style={{
              ...layout.camera,
              background: "oklch(0.3 0.02 250)",
            }}
          />
          <div
            ref={bindScreen}
            className="relative size-full overflow-clip bg-background text-foreground"
            style={{ borderRadius: "calc(var(--s) * 0.03)" }}
          >
            <div className="[container-type:size] absolute inset-0 overflow-clip">
              {children}
            </div>
            <motion.canvas
              ref={canvasRef}
              aria-hidden
              onTransitionEnd={onColours}
              className="pointer-events-none absolute inset-0 size-full border-0 transition-colors duration-1"
              style={{
                color: INK_COLOURS.black,
                borderTopColor: INK_COLOURS.blue,
                borderBottomColor: INK_COLOURS.red,
                opacity: inkOpacity,
              }}
            />
            <div
              aria-hidden
              {...writing}
              className={cn(
                "absolute inset-0",
                isDocked || disabled
                  ? "pointer-events-none"
                  : "cursor-crosshair touch-none",
              )}
            />
          </div>
        </div>
      </div>

      {/* The pencil's shadow on the glass, closing in as it writes. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          ...layout.pencil,
          width: `calc(var(--s) * ${PL})`,
          height: `calc(var(--s) * ${PT})`,
          transformOrigin: "0 50%",
          transform: shadowTransform,
          opacity: shadowOpacity,
          background: "oklch(0.12 0.01 260)",
        }}
      />

      <motion.button
        ref={pencilRef}
        type="button"
        aria-label="Pencil"
        aria-pressed={!isDocked}
        aria-describedby={hintId}
        disabled={disabled}
        {...pencilDrag}
        onPointerDown={(event) => {
          pencilDrag.onPointerDown(event);
          // The pencil is a thin target and capture waits for travel, so a
          // quick flick can leave it before the drag takes hold: until it
          // does, moves anywhere are followed from the window.
          follow.current?.();
          const button = event.currentTarget;
          const id = event.pointerId;
          const away = (e: PointerEvent) =>
            e.pointerId === id &&
            !(e.target instanceof Node && button.contains(e.target));
          const move = (e: PointerEvent) => {
            if (away(e)) {
              pencilDrag.onPointerMove(e as unknown as React.PointerEvent);
            }
          };
          const end = (e: PointerEvent) => {
            if (e.pointerId !== id) return;
            if (away(e)) {
              const re = e as unknown as React.PointerEvent;
              if (e.type === "pointerup") pencilDrag.onPointerUp(re);
              else pencilDrag.onPointerCancel(re);
            }
            follow.current?.();
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", end);
          window.addEventListener("pointercancel", end);
          follow.current = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
            follow.current = null;
          };
        }}
        onClick={(event) => {
          // Pointer taps arrive through the drag's tap; a click with no
          // pointer behind it is Enter, Space or assistive technology.
          if (event.detail === 0) toggle();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !isDocked) {
            event.preventDefault();
            ask(true);
            return;
          }
          if (isDocked || disabled) return;
          const dirs: Record<string, Pt> = {
            ArrowLeft: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 },
            ArrowUp: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 },
          };
          const d = dirs[event.key];
          if (!d) return;
          event.preventDefault();
          keyWrite(d.x, d.y, !event.shiftKey);
        }}
        className={cn(
          "absolute touch-none rounded-full select-none [-webkit-touch-callout:none]",
          "before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
          FOCUS_RING,
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          ...layout.pencil,
          width: `calc(var(--s) * ${PL})`,
          height: `calc(var(--s) * ${PT})`,
          transformOrigin: "0 50%",
          transform: pencilTransform,
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 147 10"
          preserveAspectRatio="none"
          className="block size-full overflow-visible"
        >
          <defs>
            <linearGradient id={`${svgId}-body`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="oklch(0.99 0.002 90)" />
              <stop offset="0.55" stopColor="oklch(0.95 0.003 90)" />
              <stop offset="1" stopColor="oklch(0.82 0.004 90)" />
            </linearGradient>
          </defs>
          <path
            d="M15 0.4 H143 Q146.6 0.4 146.6 5 Q146.6 9.6 143 9.6 H15 Z"
            fill={`url(#${svgId}-body)`}
            stroke="oklch(0.7 0.004 90)"
            strokeWidth="0.5"
          />
          <path
            d="M15 8.4 H145"
            stroke="oklch(0.86 0.004 90)"
            strokeWidth="0.6"
          />
          <path
            d="M15 0.4 L3.2 3.9 V6.1 L15 9.6 Z"
            fill="oklch(0.9 0.004 90)"
          />
          <path d="M3.4 3.85 L0 5 L3.4 6.15 Z" style={{ fill: nib }} />
        </svg>
      </motion.button>

      <p id={hintId} className="sr-only">
        Enter picks the pencil up and puts it back. While it is out, the arrow
        keys write on the screen and Shift with an arrow moves it without ink;
        Escape docks it and clears the ink.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
