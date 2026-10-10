"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type TileDriftProps = {
  /** The content on top of the wall: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** Rows of tiles across the box, 2 to 8. @default 4 */
  rows?: number;
  /** How fast the rows cruise, 0 (still) to 2. @default 1 */
  speed?: number;
  /** How far the plane leans back in perspective, degrees (0 to 35); it turns a third of that too. @default 14 */
  tilt?: number;
  /** Image URLs to show on the tiles, covering each one. Without them the tiles are generated prints. */
  images?: readonly string[];
  /** The pigments the generated prints are made from, as CSS colours (2 to 6). @default five token-derived pigments */
  colors?: readonly string[];
  /** A tile's width over its height (0.5 to 2.5). @default 1.3 */
  aspect?: number;
  /** Space between tiles and between rows, px (0 to 32). @default 10 */
  gap?: number;
  /** Tile corner radius, px (0 to 24). @default 8 */
  radius?: number;
  /** How differently the rows cruise, 0 (all alike) to 1. @default 0.5 */
  variation?: number;
  /** How far the wall fades into the page at its edges, 0 (hard edge) to 1. @default 0.5 */
  fade?: number;
  /** The pointer and keyboard focus stir the rows, and rows can be grabbed. @default true */
  interactive?: boolean;
  /** How hard a sweep of the hand surges the rows near it, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** A sideways drag grabs the row under it and a release throws it. @default true */
  grab?: boolean;
  /** Hold the cruise; the hand can still stir and throw the rows. @default false */
  paused?: boolean;
  /** Seeds the prints, the row speeds and where each row starts. @default 1 */
  seed?: number;
  /** Fires when the rows start (true) or stop (false) answering the hand: a surge, a grab or a throw coasting. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a grabbed row is let go, with its row (0 at the top) and its throw, px/s. */
  onFling?: (row: number, velocity: number) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Pigments at fixed lightness, from the accent and the status hues, so the wall reads in either theme. */
const COLORS = [
  "oklch(from var(--accent-bright) 0.6 calc(c * 0.44) h)",
  "oklch(from var(--warn) 0.8 calc(c * 0.52) h)",
  "oklch(from var(--success) 0.66 calc(c * 0.4) h)",
  "oklch(from var(--danger) 0.68 calc(c * 0.38) calc(h + 10))",
  "oklch(from var(--accent) 0.36 calc(c * 0.36) calc(h + 20))",
] as const;

/** Cruise at speed 1, px/s, and the extra a full surge adds. */
const CRUISE = 26;
const SURGE = 180;
const STEP = 1 / 120;
const FLICK = springs.flick;
const DRIFT = springs.drift;
/** The perspective the plane is seen through, px. */
const PERSPECTIVE = 1000;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const noop = () => () => {};

/** The pigments by name, as the prints refer to them. */
const PAINT_VARS = Array.from(
  { length: 6 },
  (_, i) => `var(--tile-drift-${i})`,
);

/** The elements a backdrop leaves to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/**
 * One generated print, in CSS gradients: a sun over a horizon, a split
 * field, nested arcs, fine stripes with a block, a dot grid or a half disc,
 * seeded from the tile's place. Every number is rounded, so the server and
 * the browser write the same markup.
 */
function print(paints: readonly string[], seed: number): React.CSSProperties {
  const rand = lcg(seed);
  const n = paints.length;
  const pick = () => paints[Math.floor(rand() * n) % n] ?? "gray";
  const a = pick();
  let b = pick();
  if (b === a) b = paints[(paints.indexOf(a) + 1) % n] ?? b;
  let c = pick();
  if (c === a || c === b) c = paints[(paints.indexOf(b) + 2) % n] ?? c;
  const pct = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  const angle = [0, 45, 90, 135][Math.floor(rand() * 4)] ?? 45;
  switch (Math.floor(rand() * 6)) {
    case 0: {
      const r = pct(14, 24);
      const h = pct(56, 72);
      return {
        backgroundColor: a,
        backgroundImage: `radial-gradient(circle at ${pct(30, 70)}% ${h - r + 4}%, ${b} 0 ${r}%, transparent ${r + 1}%), linear-gradient(180deg, transparent ${h}%, ${c} ${h}%)`,
      };
    }
    case 1:
      return {
        backgroundImage: `radial-gradient(circle at ${pct(20, 80)}% ${pct(20, 80)}%, ${c} 0 9%, transparent 10%), linear-gradient(${angle}deg, ${a} 0 50%, ${b} 50% 100%)`,
      };
    case 2: {
      const s = pct(9, 14);
      return {
        backgroundColor: a,
        backgroundImage: `repeating-radial-gradient(circle at ${rand() < 0.5 ? 0 : 100}% 100%, ${b} 0 ${s}%, ${a} ${s}% ${s * 2}%)`,
      };
    }
    case 3:
      return {
        backgroundColor: a,
        backgroundImage: `linear-gradient(${c}, ${c}), repeating-linear-gradient(${angle}deg, ${b} 0 2px, transparent 2px 7px)`,
        backgroundSize: `${pct(30, 46)}% ${pct(30, 46)}%, 100% 100%`,
        backgroundPosition: `${pct(15, 85)}% ${pct(15, 85)}%, 0 0`,
        backgroundRepeat: "no-repeat",
      };
    case 4: {
      const s = pct(18, 26);
      return {
        backgroundColor: a,
        backgroundImage: `radial-gradient(circle, ${b} 0 26%, transparent 29%)`,
        backgroundSize: `${s}% ${s}%`,
        backgroundPosition: "center",
      };
    }
    default: {
      const top = pct(18, 34);
      return {
        backgroundColor: a,
        backgroundImage: `radial-gradient(circle at 50% 100%, ${b} 0 ${pct(40, 52)}%, transparent ${pct(53, 54)}%), linear-gradient(180deg, ${c} 0 ${top}%, transparent ${top}%)`,
      };
    }
  }
}

type Config = {
  speed: number;
  variation: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onFling: (row: number, velocity: number) => void;
};

type Engine = {
  configure: (next: Config) => void;
  /** The rows on the plane (visible plus hidden), the first visible one, one copy's width and where each row starts. */
  setRows: (
    count: number,
    first: number,
    period: number,
    starts: readonly number[],
  ) => void;
  wake: () => void;
  stir: (row: number, amount: number) => void;
  grab: (row: number) => number | null;
  hold: (row: number, to: number) => void;
  throw: (row: number, velocity: number) => void;
  dispose: () => void;
};

function createEngine(
  strips: Map<number, HTMLElement>,
  root: HTMLDivElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let active = false;
  let count = 0;
  let first = 0;
  let period = 0;
  let pos = new Float64Array(0);
  /** Each row's own velocity, px/s: its cruise, or a throw relaxing to it. */
  let vel = new Float32Array(0);
  let velV = new Float32Array(0);
  let cruise = new Float32Array(0);
  let surge = new Float32Array(0);
  let surgeV = new Float32Array(0);
  let want = new Float32Array(0);
  let held = -1;
  const shown = new Float64Array(64).fill(Number.NaN);

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  /** Each row's cruise: alternate directions, seeded spread. */
  const cruises = () => {
    const c = cfg;
    if (!c) return;
    const rand = lcg(c.seed * 17 + 3);
    const still = !c.motionSafe || c.paused;
    for (let r = 0; r < count; r += 1) {
      const row = r - first;
      const dir = ((row % 2) + 2) % 2 === 0 ? -1 : 1;
      const spread = 1 + clamp(c.variation, 0, 1) * (rand() - 0.5) * 1.3;
      const v = still ? 0 : dir * CRUISE * clamp(c.speed, 0, 2) * spread;
      // A row already at its cruise keeps it exactly; a thrown one relaxes.
      if (Math.abs((vel[r] ?? 0) - (cruise[r] ?? 0)) < 0.01) vel[r] = v;
      cruise[r] = v;
    }
  };

  const write = () => {
    if (period <= 0) return;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
    for (let r = 0; r < count; r += 1) {
      const el = strips.get(r);
      if (!el) continue;
      const p = pos[r] ?? 0;
      const x = r2((((p % period) + period) % period) - period);
      if (shown[r] === x) continue;
      shown[r] = x;
      el.style.transform = `translate3d(${x}px, 0, 0)`;
    }
  };

  /** Advances the rows. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    let stirred = false;
    let thrown = false;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const surgeTo = c.motionSafe ? 1 : 0;
    for (let r = 0; r < count; r += 1) {
      const dir =
        (cruise[r] ?? 0) !== 0
          ? Math.sign(cruise[r] ?? 0)
          : (((r - first) % 2) + 2) % 2
            ? 1
            : -1;
      let v = vel[r] ?? 0;
      let a = velV[r] ?? 0;
      let s = surge[r] ?? 0;
      let sv = surgeV[r] ?? 0;
      let w = want[r] ?? 0;
      const target = cruise[r] ?? 0;
      for (let k = 0; k < steps; k += 1) {
        // The throw relaxes back to the cruise on drift: no wobble.
        a +=
          ((DRIFT.stiffness * (target - v) - DRIFT.damping * a) / DRIFT.mass) *
          h;
        v += a * h;
        // A surge arrives on flick and lets go on drift.
        const S = w > s ? FLICK : DRIFT;
        sv += ((S.stiffness * (w - s) - S.damping * sv) / S.mass) * h;
        s += sv * h;
        w *= Math.exp(-h / 0.09);
      }
      if (Math.abs(v - target) < 0.3 && Math.abs(a) < 0.3) {
        v = target;
        a = 0;
      } else {
        moving = true;
        thrown = true;
      }
      if (s < 0.002 && w < 0.002 && Math.abs(sv) < 0.01) {
        s = 0;
        sv = 0;
        w = 0;
      } else {
        moving = true;
        stirred = true;
      }
      vel[r] = v;
      velV[r] = a;
      surge[r] = s;
      surgeV[r] = sv;
      want[r] = w;
      if (r !== held) {
        pos[r] =
          (pos[r] ?? 0) + (v + dir * SURGE * Math.max(0, s) * surgeTo) * dt;
      }
      if (target !== 0) moving = true;
    }
    setActive(stirred || thrown || held >= 0);
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !cfg || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    write();
    if (moving || held >= 0) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (
        !was ||
        was.speed !== next.speed ||
        was.variation !== next.variation ||
        was.seed !== next.seed ||
        was.paused !== next.paused ||
        was.motionSafe !== next.motionSafe
      ) {
        cruises();
        if (!next.motionSafe) {
          vel.set(cruise);
          velV.fill(0);
          surge.fill(0);
          surgeV.fill(0);
          want.fill(0);
        }
      }
      kick();
    },
    setRows(n, firstRow, p, starts) {
      const same = n === count && firstRow === first;
      if (p > 0) period = p;
      if (!same) {
        const old = pos;
        const fresh = old.length === 0;
        count = n;
        first = firstRow;
        pos = new Float64Array(n);
        vel = new Float32Array(n);
        velV = new Float32Array(n);
        cruise = new Float32Array(n);
        surge = new Float32Array(n);
        surgeV = new Float32Array(n);
        want = new Float32Array(n);
        // The rows start where the server drew them, one copy along so
        // the wrap lands on the same place.
        for (let r = 0; r < n; r += 1) {
          pos[r] =
            fresh || old[r] === undefined
              ? (starts[r] ?? 0) + period
              : (old[r] ?? 0);
        }
        cruises();
        vel.set(cruise);
        held = -1;
        shown.fill(Number.NaN);
      }
      shown.fill(Number.NaN);
      write();
      kick();
    },
    wake() {
      shown.fill(Number.NaN);
      write();
      kick();
    },
    stir(row, amount) {
      const c = cfg;
      if (!c || !c.motionSafe || !c.interactive) return;
      const k = clamp(c.pointerStrength, 0, 1) * clamp(amount, 0, 1.5);
      for (let r = 0; r < count; r += 1) {
        const d = r - row;
        const w = k * Math.exp(-(d * d) / 1.4);
        if (w > (want[r] ?? 0)) want[r] = w;
      }
      kick();
    },
    grab(row) {
      if (row < 0 || row >= count) return null;
      held = row;
      vel[row] = 0;
      velV[row] = 0;
      setActive(true);
      kick();
      return pos[row] ?? 0;
    },
    hold(row, to) {
      if (row !== held) return;
      pos[row] = to;
      write();
    },
    throw(row, velocity) {
      if (row !== held) return;
      held = -1;
      const c = cfg;
      // Reduced motion: the row stays where the hand left it.
      vel[row] = c?.motionSafe ? velocity : (cruise[row] ?? 0);
      velV[row] = 0;
      c?.onFling(row - first, Math.round(velocity));
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A background of rows of tiles drifting sideways past each other on a
 * plane tilted back in perspective, with the content on top in its own
 * layer. Alternate rows run opposite ways at seeded speeds, like belts seen
 * from above and to one side; the tiles are generated prints in the page's
 * pigments, or your own images.
 *
 * A sweep of the pointer surges the rows near it — the surge arrives on
 * flick and eases back on drift — and a sideways drag grabs the row under
 * the finger, 1:1, and throws it on release: the throw relaxes back to the
 * row's cruise on a velocity spring with drift's constants, so a row thrown
 * along coasts on and one thrown against the current slows, turns and
 * rejoins it. Keyboard focus on a control inside surges the rows behind it.
 * Transform-only writes, only on screen in a visible page; under reduced
 * motion the wall holds still and a dragged row stays where it is let go.
 */
export function TileDrift({
  children,
  rows = 4,
  speed = 1,
  tilt = 14,
  images,
  colors = COLORS,
  aspect = 1.3,
  gap = 10,
  radius = 8,
  variation = 0.5,
  fade = 0.5,
  interactive = true,
  pointerStrength = 0.6,
  grab = true,
  paused = false,
  seed = 1,
  onActiveChange,
  onFling,
  className,
}: TileDriftProps) {
  const motionSafe = useMotionSafe();
  const visibleRows = clamp(Math.round(rows), 2, 8);
  const lean = clamp(tilt, 0, 35);
  const turn = lean / 3;
  const ratio = clamp(aspect, 0.5, 2.5);
  const space = clamp(gap, 0, 32);
  const corner = clamp(radius, 0, 24);

  // The box's size, measured: it decides how many hidden rows and tiles the
  // plane needs. The server assumes a wide card.
  const [box, setBox] = React.useState({ w: 760, h: 208 });
  const rowH = Math.max(8, (box.h - (visibleRows - 1) * space) / visibleRows);
  const pitch = rowH * ratio + space;
  const z = (turn * Math.PI) / 180;
  // Rows beyond each edge, so a turned and tilted plane never shows a gap.
  const reachY = (box.w / 2) * Math.sin(z) + (box.h / 2) * Math.cos(z);
  const extra = clamp(
    Math.ceil((reachY * 1.15 - box.h / 2) / (rowH + space)) + 1,
    1,
    8,
  );
  const total = visibleRows + extra * 2;
  const planeW =
    Math.ceil(
      ((box.w * Math.cos(z) + box.h * Math.sin(z)) * 1.25 + pitch * 2) / 2,
    ) * 2;
  const perCopy = Math.max(3, Math.ceil(planeW / pitch) + 1);
  const planeH = total * rowH + (total - 1) * space;

  // The pigments live once on the plane as custom properties; every print
  // refers to them by name, which keeps the markup small.
  const pigments = colors.length >= 2 ? colors.slice(0, 6) : COLORS;
  const count = pigments.length;
  const inks: Record<string, string> = {};
  pigments.forEach((c, i) => {
    inks[`--tile-drift-${i}`] =
      `color-mix(in oklab, ${c} 90%, var(--background))`;
  });
  // The wrap-around copy of each row is only needed once the rows move:
  // the server and the hydrating render draw one copy, the browser two.
  const hydrated = React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  const fadeAt = Math.round(clamp(fade, 0, 1) * 18 * 10) / 10;
  const mask =
    fadeAt > 0
      ? `linear-gradient(90deg, transparent, black ${fadeAt}%, black ${100 - fadeAt}%, transparent), linear-gradient(180deg, transparent, black ${r2(fadeAt * 0.8)}%, black ${r2(100 - fadeAt * 0.8)}%, transparent)`
      : undefined;
  const starts = React.useMemo(() => {
    const rand = lcg(seed * 29 + 11);
    return Array.from({ length: total }, () => r2(-rand() * pitch * 3));
  }, [seed, total, pitch]);
  const prints = React.useMemo(() => {
    const paints = PAINT_VARS.slice(0, count);
    const list: React.CSSProperties[][] = [];
    for (let r = 0; r < total; r += 1) {
      const row: React.CSSProperties[] = [];
      for (let i = 0; i < perCopy; i += 1) {
        row.push(print(paints, seed * 7919 + (r - extra) * 131 + i * 17 + 5));
      }
      list.push(row);
    }
    return list;
  }, [total, extra, perCopy, seed, count]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const strips = React.useRef(new Map<number, HTMLElement>());
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const report = React.useRef({ onActiveChange, onFling });
  const grabbed = React.useRef<{
    row: number;
    from: number;
    scale: number;
  } | null>(null);

  const config: Config = {
    speed,
    variation,
    interactive,
    pointerStrength,
    paused,
    seed,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onFling: (r, v) => report.current.onFling?.(r, v),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onFling };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const e = createEngine(strips.current, root, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // After every layout of the plane, the engine learns its rows and the
  // width one copy of a row takes, measured rather than assumed.
  React.useLayoutEffect(() => {
    const period = groupRef.current?.offsetWidth ?? 0;
    engine.current?.setRows(total, extra, period, starts);
  });

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const w = Math.round(node.clientWidth);
      const h = Math.round(node.clientHeight);
      if (w > 0 && h > 0)
        setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /** The plane row under a point on the page, from the rows themselves. */
  const rowAt = (clientX: number, clientY: number): number => {
    const root = rootRef.current;
    if (!root) return -1;
    // A press in the gap between two rows takes the nearer one.
    const reach = space / 2 + 1;
    for (const dy of [0, -reach, reach]) {
      for (const el of document.elementsFromPoint(clientX, clientY + dy)) {
        if (!root.contains(el)) continue;
        const row = el.closest<HTMLElement>("[data-tile-row]");
        if (row) return Number(row.dataset.tileRow);
      }
    }
    return -1;
  };

  const last = React.useRef({ x: 0, y: 0, t: 0 });

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: !interactive || !grab,
    onStart: ({ point, offset }) => {
      const row = rowAt(point.x - offset.x, point.y - offset.y);
      const strip = strips.current.get(row);
      const from = engine.current?.grab(row);
      if (from === null || from === undefined || !strip) return;
      // The row's own scale on screen, so the tile under the finger stays
      // under it however far the plane leans.
      const parent = strip.parentElement;
      const scale = parent
        ? parent.getBoundingClientRect().width / Math.max(1, parent.offsetWidth)
        : 1;
      grabbed.current = { row, from, scale: Math.max(0.2, scale) };
      rootRef.current?.setAttribute("data-grabbing", "");
    },
    onMove: ({ offset }) => {
      const g = grabbed.current;
      if (!g) return;
      engine.current?.hold(g.row, g.from + offset.x / g.scale);
    },
    onEnd: ({ velocity }) => {
      const g = grabbed.current;
      grabbed.current = null;
      rootRef.current?.removeAttribute("data-grabbing");
      if (!g) return;
      engine.current?.throw(g.row, clamp(velocity.x / g.scale, -4000, 4000));
    },
    onCancel: () => {
      const g = grabbed.current;
      grabbed.current = null;
      rootRef.current?.removeAttribute("data-grabbing");
      if (g) engine.current?.throw(g.row, 0);
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (hit && rootRef.current?.contains(hit)) return;
    last.current = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (!interactive || grabbed.current) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const prev = last.current;
    const dt = (event.timeStamp - prev.t) / 1000;
    last.current = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    if (prev.t === 0 || dt <= 0 || dt > 0.2) return;
    const speedPx =
      Math.hypot(event.clientX - prev.x, event.clientY - prev.y) / dt;
    const row = rowAt(event.clientX, event.clientY);
    if (row >= 0) engine.current?.stir(row, speedPx / 1100);
  };

  const onPointerLeave = () => {
    last.current = { x: 0, y: 0, t: 0 };
  };

  // Keyboard focus on a control inside surges the rows behind it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const row = rowAt(r.left + r.width / 2, r.top + r.height / 2);
    if (row >= 0) engine.current?.stir(row, 1.2);
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      className={cn(
        // A sideways drag throws a row; an upright one scrolls the page.
        "group/tile-drift relative isolate h-full w-full overflow-clip data-grabbing:cursor-grabbing data-grabbing:select-none",
        interactive && grab ? "touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 select-none"
        style={
          mask
            ? {
                maskImage: mask,
                WebkitMaskImage: mask,
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }
            : undefined
        }
      >
        <div
          className="absolute top-1/2 left-1/2 grid"
          style={{
            width: planeW,
            height: r2(planeH),
            gridTemplateRows: `repeat(${total}, minmax(0, 1fr))`,
            rowGap: space,
            transform: `translate(-50%, -50%) perspective(${PERSPECTIVE}px) rotateX(${r2(lean)}deg) rotateZ(${r2(-turn)}deg)`,
            ...inks,
          }}
        >
          {prints.map((row, r) => {
            const start = starts[r] ?? 0;
            return (
              <div
                key={r}
                data-tile-row={r}
                className={cn(
                  "relative overflow-visible",
                  // Hit-testable so a press finds its row; the content above
                  // still takes every event first.
                  interactive && "pointer-events-auto",
                )}
              >
                <div
                  ref={(node) => {
                    if (node) strips.current.set(r, node);
                    else strips.current.delete(r);
                  }}
                  className="absolute inset-y-0 left-0 flex will-change-transform"
                  style={{ transform: `translate3d(${start}px, 0, 0)` }}
                >
                  {(hydrated ? [0, 1] : [0]).map((copy) => (
                    <div
                      key={copy}
                      ref={r === 0 && copy === 0 ? groupRef : undefined}
                      className="flex h-full shrink-0"
                      style={{ gap: space, paddingRight: space }}
                    >
                      {row.map((art, i) => (
                        <div
                          key={i}
                          className="relative h-full shrink-0 overflow-hidden border border-hairline"
                          style={{
                            aspectRatio: String(ratio),
                            borderRadius: corner,
                            ...art,
                          }}
                        >
                          {images && images.length > 0 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={
                                images[
                                  Math.abs((r - extra) * 7 + i * 3 + seed) %
                                    images.length
                                ]
                              }
                              alt=""
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                              className="absolute inset-0 size-full object-cover"
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}
