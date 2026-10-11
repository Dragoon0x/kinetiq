"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TubeRackPalette = "lab" | "berry" | "sea" | "amber";

export type TubeRackProps = {
  /** Controlled levels, one per tube, from 0 to `max`. */
  values?: number[];
  /** Initial levels when uncontrolled. @default defaultTubeValues */
  defaultValues?: number[];
  /** Fires from the drag or key that changed a level, with every level. */
  onValuesChange?: (values: number[]) => void;
  /** A short name under each tube. @default defaultTubeLabels */
  labels?: string[];
  /** The value of a full tube. @default 100 */
  max?: number;
  /** How far an arrow key moves a level. @default 1 */
  step?: number;
  /** The liquids' colours, cycled along the rack. @default "lab" */
  palette?: TubeRackPalette;
  /** Liquid colours of your own, any CSS colours; overrides `palette`. */
  colors?: string[];
  /** How far the surfaces tilt when the wave passes, and how long they rock, 0 (still) to 1. @default 0.5 */
  slosh?: number;
  /** The glass's highlight and the liquid's shine, 0 (matte) to 1. @default 0.6 */
  gloss?: number;
  /** How often a slow wave runs along the rack, in ms. @default 6500 */
  wavePeriod?: number;
  /** How fast liquid pours to a new level, 0 (a slow trickle) to 1 (a quick pour). @default 0.5 */
  pourSpeed?: number;
  /** Faint graduations at each quarter of the glass. @default true */
  graduations?: boolean;
  /** Formats a value for its chip, its label and assistive technology. @default rounded number */
  format?: (value: number) => string;
  /** Fires when a tube is selected by a press or by focus, or `null` when focus leaves the rack. */
  onActiveChange?: (index: number | null) => void;
  /** The rack's accessible name. @default "Tube rack" */
  label?: string;
  /** Play the glug of the pour for the visitor's own changes. @default false */
  sound?: boolean;
  /** Shows the levels but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the rack. @default "h-52 w-full" */
  className?: string;
};

export const defaultTubeValues = [62, 38, 81, 47, 24, 69];
export const defaultTubeLabels = ["P1", "P2", "P3", "P4", "P5", "P6"];

const PALETTES: Record<TubeRackPalette, string[]> = {
  lab: [
    "oklch(from var(--accent-bright) 0.62 0.16 h)",
    "oklch(from var(--success) 0.72 0.13 calc(h + 30))",
    "oklch(from var(--warn) 0.8 0.15 h)",
    "oklch(from var(--danger) 0.64 0.18 h)",
    "oklch(from var(--accent-bright) 0.6 0.16 calc(h + 50))",
    "oklch(from var(--success) 0.7 0.14 h)",
  ],
  berry: [
    "oklch(from var(--danger) 0.55 0.19 calc(h - 5))",
    "oklch(from var(--danger) 0.62 0.17 calc(h + 330))",
    "oklch(from var(--accent-bright) 0.52 0.16 calc(h + 55))",
    "oklch(from var(--danger) 0.7 0.14 calc(h + 15))",
    "oklch(from var(--accent-bright) 0.6 0.13 calc(h + 40))",
    "oklch(from var(--danger) 0.48 0.16 h)",
  ],
  sea: [
    "oklch(from var(--accent-bright) 0.6 0.14 calc(h - 30))",
    "oklch(from var(--success) 0.68 0.11 calc(h + 30))",
    "oklch(from var(--accent-bright) 0.5 0.15 h)",
    "oklch(from var(--success) 0.76 0.1 calc(h + 50))",
    "oklch(from var(--accent-bright) 0.7 0.1 calc(h - 45))",
    "oklch(from var(--success) 0.6 0.12 calc(h + 60))",
  ],
  amber: [
    "oklch(from var(--warn) 0.78 0.15 h)",
    "oklch(from var(--warn) 0.68 0.16 calc(h - 25))",
    "oklch(from var(--danger) 0.66 0.16 calc(h + 25))",
    "oklch(from var(--warn) 0.86 0.12 calc(h + 10))",
    "oklch(from var(--warn) 0.6 0.14 calc(h - 40))",
    "oklch(from var(--warn) 0.74 0.13 calc(h - 10))",
  ],
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const BUBBLES = 4;

function lcg(seed: number) {
  let v = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (v === 0) v = 1;
  return () => {
    v = (Math.imul(v, 1664525) + 1013904223) >>> 0;
    return v / 4294967296;
  };
}

const useIsoLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

type Layout = {
  w: number;
  h: number;
  /** Each tube's left edge. */
  x: number[];
  tw: number;
  top: number;
  bottom: number;
  innerTop: number;
  innerBottom: number;
  railY: number;
  rackLeft: number;
  rackRight: number;
};

const CHIP_ZONE = 22;
const LABEL_ZONE = 30;
const BASE_H = 6;

function layoutFor(n: number, w: number, h: number): Layout {
  const pad = 10;
  const spacing = (w - pad * 2) / Math.max(1, n);
  const tw = clamp(spacing * 0.46, 14, 34);
  const top = CHIP_ZONE;
  const bottom = Math.max(top + 60, h - LABEL_ZONE - BASE_H + 2);
  const x = Array.from({ length: n }, (_, i) =>
    r2(pad + spacing * (i + 0.5) - tw / 2),
  );
  return {
    w,
    h,
    x,
    tw: r2(tw),
    top,
    bottom: r2(bottom),
    innerTop: r2(top + 7),
    innerBottom: r2(bottom - 1.5),
    railY: r2(top + (bottom - top) * 0.3),
    rackLeft: r2((x[0] ?? 0) - Math.min(spacing * 0.3, 18)),
    rackRight: r2((x[n - 1] ?? 0) + tw + Math.min(spacing * 0.3, 18)),
  };
}

/** The glass: straight walls, a round bottom and a small lip at the mouth. */
function tubePath(L: Layout, x: number) {
  const r = L.tw / 2;
  const lip = 2;
  return [
    `M ${r2(x - lip)} ${L.top}`,
    `L ${r2(x)} ${r2(L.top + 3)}`,
    `L ${r2(x)} ${r2(L.bottom - r)}`,
    `A ${r2(r)} ${r2(r)} 0 0 0 ${r2(x + L.tw)} ${r2(L.bottom - r)}`,
    `L ${r2(x + L.tw)} ${r2(L.top + 3)}`,
    `L ${r2(x + L.tw + lip)} ${L.top}`,
  ].join(" ");
}

function interiorPath(L: Layout, x: number) {
  const inset = 1.5;
  const r = L.tw / 2 - inset;
  const x0 = x + inset;
  const x1 = x + L.tw - inset;
  return `M ${r2(x0)} ${r2(L.top + 3)} L ${r2(x0)} ${r2(L.innerBottom - r)} A ${r2(r)} ${r2(r)} 0 0 0 ${r2(x1)} ${r2(L.innerBottom - r)} L ${r2(x1)} ${r2(L.top + 3)} Z`;
}

/** The liquid up to its surface: tilted by `tilt`, the meniscus climbing the glass. */
function liquidPaths(L: Layout, x: number, level: number, tilt: number) {
  const inset = 1.5;
  const x0 = x + inset;
  const x1 = x + L.tw - inset;
  const ys = L.innerBottom - clamp01(level) * (L.innerBottom - L.innerTop);
  const half = (x1 - x0) / 2;
  const dy = Math.tan(clamp(tilt, -0.6, 0.6)) * half;
  const m = Math.min(3, L.tw * 0.11);
  const yl = ys + dy - m;
  const yr = ys - dy - m;
  const xc = (x0 + x1) / 2;
  const yc = ys + m * 0.55;
  const curve = `M ${r2(x0)} ${r2(yl)} Q ${r2(xc)} ${r2(yc)} ${r2(x1)} ${r2(yr)}`;
  return {
    body: `${curve} L ${r2(x1)} ${r2(L.bottom + 2)} L ${r2(x0)} ${r2(L.bottom + 2)} Z`,
    rim: curve,
    surface: ys,
  };
}

type Sim = {
  level: Float32Array;
  vel: Float32Array;
  target: Float32Array;
  tilt: Float32Array;
  spin: Float32Array;
  /** Where a reduced-motion tween started, and when. */
  from: Float32Array;
  since: Float64Array;
  voiced: Uint8Array;
  bx: Float32Array;
  by: Float32Array;
  bl: Float32Array;
};

const makeSim = (n: number): Sim => ({
  level: new Float32Array(n),
  vel: new Float32Array(n),
  target: new Float32Array(n),
  tilt: new Float32Array(n),
  spin: new Float32Array(n),
  from: new Float32Array(n),
  since: new Float64Array(n),
  voiced: new Uint8Array(n),
  bx: new Float32Array(n * BUBBLES),
  by: new Float32Array(n * BUBBLES),
  bl: new Float32Array(n * BUBBLES),
});

type TubeNodes = {
  body: SVGPathElement | null;
  rim: SVGPathElement | null;
  shine: SVGRectElement | null;
  stream: SVGRectElement | null;
  mark: SVGLineElement | null;
  bubbles: (SVGCircleElement | null)[];
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type TubeProps = {
  index: number;
  layout: Layout;
  name: string;
  valueText: string;
  value: number;
  max: number;
  selected: boolean;
  tabbable: boolean;
  disabled: boolean;
  bind: (node: HTMLDivElement | null) => void;
  onLevel: (index: number, level: number) => void;
  onSelect: (index: number) => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>, index: number) => void;
  onDragState: (index: number, dragging: boolean) => void;
};

/** One tube's hit area: a slider over the glass that takes drags, taps and keys. */
function TubeHandle({
  index,
  layout,
  name,
  valueText,
  value,
  max,
  selected,
  tabbable,
  disabled,
  bind,
  onLevel,
  onSelect,
  onKey,
  onDragState,
}: TubeProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  // Whether the tube was already selected when the press began: focus
  // arrives with the press, before the tap is known.
  const wasSelected = React.useRef(false);
  const levelAt = (clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return 0;
    const bottom = r.top + (layout.innerBottom - (layout.top - 4));
    return clamp01((bottom - clientY) / (layout.innerBottom - layout.innerTop));
  };
  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      onSelect(index);
      onDragState(index, true);
      onLevel(index, levelAt(point.y));
    },
    onMove: ({ point }) => onLevel(index, levelAt(point.y)),
    onEnd: ({ point }) => {
      onLevel(index, levelAt(point.y));
      onDragState(index, false);
    },
    onCancel: () => onDragState(index, false),
    onTap: (event) => {
      // A tap selects a tube; a tap on the selected tube pours to it.
      if (wasSelected.current) onLevel(index, levelAt(event.clientY));
      onSelect(index);
      ref.current?.focus({ preventScroll: true });
    },
  });
  return (
    <div
      ref={(node) => {
        ref.current = node;
        bind(node);
      }}
      role="slider"
      tabIndex={tabbable ? 0 : -1}
      aria-label={name}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      onKeyDown={(event) => onKey(event, index)}
      onFocus={() => onSelect(index)}
      {...drag}
      onPointerDown={(event) => {
        wasSelected.current = selected;
        drag.onPointerDown(event);
      }}
      className={cn(
        "absolute cursor-ns-resize touch-pan-x rounded-full",
        disabled && "cursor-default",
        FOCUS_RING,
      )}
      style={{
        left: r2((layout.x[index] ?? 0) - 4),
        top: layout.top - 4,
        width: r2(layout.tw + 8),
        height: r2(layout.bottom - layout.top + 8),
      }}
    />
  );
}

/**
 * A rack of glass test tubes, each filled to its value with glossy coloured
 * liquid. Every `wavePeriod` a slow wave runs along the rack and nudges each
 * tube as it passes, so the tubes slosh in turn: each surface tilts, its
 * meniscus climbing the glass, and rocks back to level on a damped
 * oscillator. Pick a tube and drag on it: the target follows the finger 1:1
 * and the liquid pours to meet it at a pour rate, settling on the glide
 * spring's constants — a thin stream falls from the mouth while it rises,
 * bubbles climb while it drains — and the surface rocks once as it stops.
 *
 * Each tube is a vertical `role="slider"` under one tab stop: Left and Right
 * move between tubes, Up and Down step, Page keys move a tenth, Home and End
 * empty and fill. SVG, redrawn by one loop that runs only while something
 * moves and the rack is on screen; the next wave waits on a timer. Under
 * reduced motion the surfaces stay level and a change is a 150 ms tween.
 */
export function TubeRack({
  values,
  defaultValues = defaultTubeValues,
  onValuesChange,
  labels = defaultTubeLabels,
  max = 100,
  step = 1,
  palette = "lab",
  colors,
  slosh = 0.5,
  gloss = 0.6,
  wavePeriod = 6500,
  pourSpeed = 0.5,
  graduations = true,
  format = (v) => String(Math.round(v)),
  onActiveChange,
  label = "Tube rack",
  sound = false,
  disabled = false,
  className,
}: TubeRackProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [own, setOwn] = React.useState(defaultValues);
  const current = values ?? own;
  const n = current.length;
  const top = Math.max(1e-6, max);
  const [size, setSize] = React.useState({ w: 720, h: 208 });
  /** The roving tab stop, and the tube the visitor has picked. */
  const [active, setActive] = React.useState(0);
  const [focusWithin, setFocusWithin] = React.useState(false);
  const reportedActive = React.useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = React.useState<number | null>(null);
  const layout = React.useMemo(
    () => layoutFor(n, size.w, size.h),
    [n, size.w, size.h],
  );
  const liquids =
    colors && colors.length > 0 ? colors : (PALETTES[palette] ?? PALETTES.lab);

  // The first frame's liquid, server and client alike; the loop owns it after.
  const [firstLevels] = React.useState(() =>
    current.map((v) => clamp01(v / top)),
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef<Map<number, TubeNodes>>(new Map());
  const handles = React.useRef<Map<number, HTMLDivElement>>(new Map());
  // The simulation starts full, at the values the server drew.
  const [seeded] = React.useState(() => {
    const start = makeSim(firstLevels.length);
    firstLevels.forEach((v, i) => {
      start.level[i] = v;
      start.target[i] = v;
    });
    return start;
  });
  const sim = React.useRef<Sim>(seeded);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const visible = React.useRef(false);
  const waveAt = React.useRef(-1);
  const waveTimer = React.useRef(0);
  const loops = React.useRef<Map<number, LoopHandle>>(new Map());
  const settings = React.useRef({
    layout,
    slosh,
    pourSpeed,
    motionSafe,
    gloss,
    wavePeriod,
    audio,
    n,
  });

  const [rand] = React.useState(() => lcg(9));

  /** Finds each tube's live parts once per commit; the loop writes to them directly. */
  const collect = React.useCallback(() => {
    const root = rootRef.current;
    nodes.current.clear();
    if (!root) return;
    for (const el of root.querySelectorAll<SVGElement>("[data-tr-part]")) {
      const i = Number(el.dataset.trIndex);
      let t = nodes.current.get(i);
      if (!t) {
        t = {
          body: null,
          rim: null,
          shine: null,
          stream: null,
          mark: null,
          bubbles: [],
        };
        nodes.current.set(i, t);
      }
      const part = el.dataset.trPart;
      if (part === "body") t.body = el as SVGPathElement;
      else if (part === "rim") t.rim = el as SVGPathElement;
      else if (part === "shine") t.shine = el as SVGRectElement;
      else if (part === "stream") t.stream = el as SVGRectElement;
      else if (part === "mark") t.mark = el as SVGLineElement;
      else if (part === "bubble") t.bubbles.push(el as SVGCircleElement);
    }
  }, []);

  /** Writes every tube's liquid from the simulation. */
  const paint = React.useCallback(() => {
    const s = sim.current;
    const { layout: L, gloss: g } = settings.current;
    for (let i = 0; i < s.level.length; i += 1) {
      const t = nodes.current.get(i);
      const x = L.x[i];
      if (!t || x === undefined) continue;
      const level = s.level[i] ?? 0;
      const p = liquidPaths(L, x, level, s.tilt[i] ?? 0);
      t.body?.setAttribute("d", p.body);
      t.rim?.setAttribute("d", p.rim);
      if (t.shine) {
        const top = r2(p.surface + 4);
        const bottom = L.innerBottom - L.tw * 0.32;
        t.shine.setAttribute("y", String(top));
        t.shine.setAttribute("height", String(r2(Math.max(0, bottom - top))));
        t.shine.setAttribute("opacity", String(r2(0.1 + 0.32 * g)));
      }
      const target = s.target[i] ?? 0;
      const rising = target - level > 0.004;
      if (t.stream) {
        const yTop = L.top - 6;
        t.stream.setAttribute("y", String(r2(yTop)));
        t.stream.setAttribute(
          "height",
          String(r2(rising ? Math.max(0, p.surface - yTop) : 0)),
        );
        t.stream.setAttribute("opacity", rising ? "0.9" : "0");
      }
      if (t.mark) {
        const moving = Math.abs(target - level) > 0.004;
        const y = r2(L.innerBottom - target * (L.innerBottom - L.innerTop));
        t.mark.setAttribute("y1", String(y));
        t.mark.setAttribute("y2", String(y));
        t.mark.setAttribute("opacity", moving ? "0.9" : "0");
      }
      for (let k = 0; k < BUBBLES; k += 1) {
        const c = t.bubbles[k];
        if (!c) continue;
        const life = s.bl[i * BUBBLES + k] ?? 0;
        c.setAttribute("cx", String(r2(s.bx[i * BUBBLES + k] ?? 0)));
        c.setAttribute("cy", String(r2(s.by[i * BUBBLES + k] ?? 0)));
        c.setAttribute(
          "opacity",
          life > 0 ? String(r2(Math.min(1, life * 3) * 0.8)) : "0",
        );
      }
    }
  }, []);

  const stopLoop = (i: number) => {
    const h = loops.current.get(i);
    if (h) {
      h.stop();
      loops.current.delete(i);
    }
  };

  // The loop calls itself through a ref, so its frame callback stays one
  // stable function while the work it does follows the latest render.
  const work = React.useRef<(time: number) => void>(() => {});
  const run = React.useCallback((time: number) => work.current(time), []);

  const tick = React.useCallback(
    (time: number) => {
      frame.current = 0;
      if (!visible.current || document.hidden) {
        last.current = 0;
        return;
      }
      const dt = last.current
        ? Math.min(0.04, (time - last.current) / 1000)
        : 1 / 60;
      last.current = time;
      const s = sim.current;
      const {
        layout: L,
        slosh: sl,
        pourSpeed: ps,
        motionSafe: safe,
        n: count,
      } = settings.current;
      const now = time / 1000;
      let busy = false;
      // The wave: a slow pulse along the rack that nudges each tube in turn.
      if (waveAt.current >= 0 && safe) {
        const travel = 1.6;
        const elapsed = now - waveAt.current;
        for (let i = 0; i < count; i += 1) {
          const hit = (i / Math.max(1, count - 1)) * travel;
          if (elapsed >= hit && elapsed - dt < hit) {
            s.spin[i] = (s.spin[i] ?? 0) + 2.6 * clamp01(sl);
          }
        }
        if (elapsed < travel + 0.1) busy = true;
        else waveAt.current = -1;
      }
      const pourRate = lerp(0.22, 1.3, clamp01(ps));
      const omega = 2 * Math.PI * 1.7;
      const zeta = lerp(0.42, 0.07, clamp01(sl));
      for (let i = 0; i < count; i += 1) {
        const target = s.target[i] ?? 0;
        let level = s.level[i] ?? 0;
        let vel = s.vel[i] ?? 0;
        if (!safe) {
          // A short tween, no physics: the value still changes in full.
          const t = clamp01((now - (s.since[i] ?? 0)) / 0.15);
          level = lerp(s.from[i] ?? 0, target, t);
          vel = 0;
          if (t < 1) busy = true;
        } else {
          // Glide's constants pull the level to its target; the pour rate caps
          // how fast it can get there, so a big change pours rather than jumps.
          const { stiffness, damping, mass } = springs.glide;
          const before = vel;
          // Small substeps: the spring is stiff for a slow frame's length.
          const steps = Math.max(1, Math.ceil(dt / 0.004));
          const h = dt / steps;
          for (let k = 0; k < steps; k += 1) {
            const acc = (-stiffness * (level - target) - damping * vel) / mass;
            vel = clamp(vel + acc * h, -pourRate, pourRate);
            level += vel * h;
          }
          // Stopping a pour rocks the surface once.
          const jerk = (vel - before) / Math.max(dt, 1e-3);
          if (
            Math.abs(vel) < Math.abs(before) &&
            Math.abs(before) > pourRate * 0.6
          ) {
            s.spin[i] = (s.spin[i] ?? 0) - jerk * 0.0045 * (0.3 + clamp01(sl));
          }
          if (Math.abs(level - target) > 0.0008 || Math.abs(vel) > 0.002)
            busy = true;
          else {
            level = target;
            vel = 0;
          }
        }
        s.level[i] = clamp01(level);
        s.vel[i] = vel;
        if (safe) {
          let tilt = s.tilt[i] ?? 0;
          let spin = s.spin[i] ?? 0;
          spin += (-omega * omega * tilt - 2 * zeta * omega * spin) * dt;
          tilt += spin * dt;
          if (Math.abs(tilt) < 0.0006 && Math.abs(spin) < 0.004) {
            tilt = 0;
            spin = 0;
          } else busy = true;
          s.tilt[i] = tilt;
          s.spin[i] = spin;
        } else {
          s.tilt[i] = 0;
          s.spin[i] = 0;
        }
        // Bubbles: some climb through the liquid while it drains or pours.
        const x0 = (L.x[i] ?? 0) + 3;
        const w = L.tw - 6;
        const surfaceY =
          L.innerBottom - (s.level[i] ?? 0) * (L.innerBottom - L.innerTop);
        const moving = safe && Math.abs(target - (s.level[i] ?? 0)) > 0.01;
        for (let k = 0; k < BUBBLES; k += 1) {
          const j = i * BUBBLES + k;
          let life = s.bl[j] ?? 0;
          if (life <= 0 && moving && rand() < dt * 4) {
            s.bx[j] = x0 + rand() * w;
            s.by[j] =
              target > (s.level[i] ?? 0)
                ? surfaceY + 6 + rand() * 10
                : L.innerBottom - 4;
            life = 1;
          }
          if (life > 0) {
            s.by[j] = (s.by[j] ?? 0) - 26 * dt;
            s.bx[j] = (s.bx[j] ?? 0) + Math.sin(now * 9 + j) * 6 * dt;
            life -= dt * 1.4;
            if ((s.by[j] ?? 0) < surfaceY + 2) life = 0;
            busy = true;
          }
          s.bl[j] = Math.max(0, life);
        }
        // The glug follows the pour and stops when it does.
        const loop = loops.current.get(i);
        const pouring = Math.abs(target - (s.level[i] ?? 0)) > 0.004;
        if (loop) {
          if (!pouring) stopLoop(i);
          else loop.set({ pitch: 0.7 + 0.9 * (s.level[i] ?? 0) });
        } else if (pouring && s.voiced[i] && safe) {
          const handle = settings.current.audio.start("glug", {
            pitch: 0.7 + 0.9 * (s.level[i] ?? 0),
            gain: 0.5,
          });
          loops.current.set(i, handle);
        }
        if (!pouring) s.voiced[i] = 0;
      }
      paint();
      if (busy) frame.current = window.requestAnimationFrame(run);
      else last.current = 0;
    },
    [paint, rand, run],
  );

  const kick = React.useCallback(() => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(run);
  }, [run]);

  // Settings and the simulation's size follow the props; the liquid is
  // repainted before the browser paints, so a re-render never shows React's
  // first-frame path in place of the live one.
  useIsoLayoutEffect(() => {
    work.current = tick;
    collect();
    settings.current = {
      layout,
      slosh,
      pourSpeed,
      motionSafe,
      gloss,
      wavePeriod,
      audio,
      n,
    };
    const s = sim.current;
    if (s.level.length !== n) {
      const next = makeSim(n);
      for (let i = 0; i < n; i += 1) {
        const v = clamp01((current[i] ?? 0) / top);
        next.level[i] = i < s.level.length ? (s.level[i] ?? v) : v;
        next.target[i] = v;
      }
      sim.current = next;
    }
    paint();
    kick();
  });

  // Targets follow the values: a pour for each one that changed.
  const key = current.map((v) => clamp01(v / top).toFixed(4)).join(",");
  React.useEffect(() => {
    const s = sim.current;
    const now = performance.now() / 1000;
    key.split(",").forEach((text, i) => {
      const v = Number(text);
      if (i >= s.target.length) return;
      if (Math.abs((s.target[i] ?? 0) - v) > 1e-5) {
        s.from[i] = s.level[i] ?? 0;
        s.since[i] = now;
        s.target[i] = v;
      }
    });
    kick();
  }, [key, kick]);

  // The rack measures itself; the layout is in pixels so tubes keep their shape.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sizer = new ResizeObserver(() => {
      const w = Math.round(root.clientWidth);
      const h = Math.round(root.clientHeight);
      if (w > 0 && h > 0)
        setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) kick();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const map = loops.current;
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
      for (const h of map.values()) h.stop();
      map.clear();
    };
  }, [kick]);

  // The wave waits on a timer, so a settled rack costs nothing between waves.
  React.useEffect(() => {
    if (!motionSafe || slosh <= 0 || disabled) return;
    const period = Math.max(1500, wavePeriod);
    const run = () => {
      if (visible.current && !document.hidden) {
        waveAt.current = performance.now() / 1000;
        kick();
      }
      waveTimer.current = window.setTimeout(run, period);
    };
    waveTimer.current = window.setTimeout(run, 900);
    return () => window.clearTimeout(waveTimer.current);
  }, [motionSafe, slosh, wavePeriod, disabled, kick]);

  // Sound switched off mid-pour: the loops stop with it.
  React.useEffect(() => {
    if (sound) return;
    for (const h of loops.current.values()) h.stop();
    loops.current.clear();
  }, [sound]);

  const setLevel = (i: number, level: number, voiced = true) => {
    if (disabled) return;
    const v = Math.round((clamp01(level) * top) / step) * step;
    const next = current.map((old, k) => (k === i ? clamp(v, 0, top) : old));
    if (next[i] === current[i]) return;
    sim.current.voiced[i] = voiced ? 1 : 0;
    if (values === undefined) setOwn(next);
    onValuesChange?.(next);
  };

  const select = (i: number) => {
    setActive(i);
    if (reportedActive.current !== i) {
      reportedActive.current = i;
      onActiveChange?.(i);
    }
  };

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>, i: number) => {
    if (disabled) return;
    const v = current[i] ?? 0;
    const page = Math.max(step, top / 10);
    let next: number | null = null;
    if (event.key === "ArrowUp") next = v + step;
    else if (event.key === "ArrowDown") next = v - step;
    else if (event.key === "PageUp") next = v + page;
    else if (event.key === "PageDown") next = v - page;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = top;
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const j = clamp(i + (event.key === "ArrowRight" ? 1 : -1), 0, n - 1);
      handles.current.get(j)?.focus();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setLevel(i, clamp(next, 0, top) / top);
  };

  const shown = focusWithin || draggingIndex !== null;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusWithin(false);
          reportedActive.current = null;
          onActiveChange?.(null);
        }
      }}
      className={cn(
        "relative isolate h-52 w-full select-none",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          "--tr-glass": "color-mix(in oklab, var(--ink) 4%, transparent)",
          "--tr-wall": "color-mix(in oklab, var(--ink) 34%, transparent)",
        } as React.CSSProperties
      }
    >
      <svg
        aria-hidden
        width={layout.w}
        height={layout.h}
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        className="absolute inset-0 block overflow-visible"
      >
        <defs>
          {current.map((_, i) => {
            const x = layout.x[i] ?? 0;
            const colour =
              liquids[i % liquids.length] ?? "var(--accent-bright)";
            return (
              <React.Fragment key={i}>
                <clipPath id={`${uid}-clip-${i}`}>
                  <path d={interiorPath(layout, x)} />
                </clipPath>
                <linearGradient
                  id={`${uid}-fill-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0"
                    style={{
                      stopColor: `color-mix(in oklab, ${colour}, white 16%)`,
                    }}
                  />
                  <stop
                    offset="1"
                    style={{
                      stopColor: `color-mix(in oklab, ${colour}, black 22%)`,
                    }}
                  />
                </linearGradient>
              </React.Fragment>
            );
          })}
        </defs>
        {/* The base the tubes stand in. */}
        <rect
          x={layout.rackLeft}
          y={r2(layout.bottom - 2)}
          width={r2(layout.rackRight - layout.rackLeft)}
          height={BASE_H}
          rx={2}
          className="fill-surface-2 stroke-hairline-strong"
        />
        <rect
          x={layout.rackLeft}
          y={layout.railY}
          width={3}
          height={r2(layout.bottom - layout.railY)}
          className="fill-hairline-strong"
        />
        <rect
          x={r2(layout.rackRight - 3)}
          y={layout.railY}
          width={3}
          height={r2(layout.bottom - layout.railY)}
          className="fill-hairline-strong"
        />
        {current.map((_, i) => {
          const x = layout.x[i] ?? 0;
          const colour = liquids[i % liquids.length] ?? "var(--accent-bright)";
          const first = liquidPaths(layout, x, firstLevels[i] ?? 0, 0);
          return (
            <g key={i}>
              <path d={tubePath(layout, x)} className="fill-(--tr-glass)" />
              <g clipPath={`url(#${uid}-clip-${i})`}>
                <path
                  data-tr-part="body"
                  data-tr-index={i}
                  d={first.body}
                  fill={`url(#${uid}-fill-${i})`}
                />
                <rect
                  data-tr-part="shine"
                  data-tr-index={i}
                  x={r2(x + layout.tw * 0.2)}
                  y={r2(first.surface + 4)}
                  width={r2(Math.max(1.5, layout.tw * 0.13))}
                  height={r2(
                    Math.max(
                      0,
                      layout.innerBottom - layout.tw * 0.32 - first.surface - 4,
                    ),
                  )}
                  rx={1}
                  fill="white"
                  opacity={r2(0.1 + 0.32 * gloss)}
                />
                {Array.from({ length: BUBBLES }, (_, k) => (
                  <circle
                    key={k}
                    data-tr-part="bubble"
                    data-tr-index={i}
                    cx={0}
                    cy={0}
                    r={k % 2 === 0 ? 1.4 : 1}
                    fill="none"
                    stroke="white"
                    strokeWidth={0.8}
                    opacity={0}
                  />
                ))}
                <path
                  data-tr-part="rim"
                  data-tr-index={i}
                  d={first.rim}
                  fill="none"
                  strokeWidth={1.4}
                  style={{
                    stroke: `color-mix(in oklab, ${colour}, white 45%)`,
                  }}
                />
              </g>
              <rect
                data-tr-part="stream"
                data-tr-index={i}
                x={r2(x + layout.tw / 2 - 1.2)}
                y={layout.top - 6}
                width={2.4}
                height={0}
                rx={1.2}
                opacity={0}
                style={{ fill: colour }}
              />
              <line
                data-tr-part="mark"
                data-tr-index={i}
                x1={r2(x - 3)}
                x2={r2(x + layout.tw + 3)}
                y1={0}
                y2={0}
                strokeWidth={1}
                strokeDasharray="2 2"
                opacity={0}
                className="stroke-foreground"
              />
              {graduations
                ? [0.25, 0.5, 0.75].map((q) => {
                    const y = r2(
                      layout.innerBottom -
                        q * (layout.innerBottom - layout.innerTop),
                    );
                    return (
                      <line
                        key={q}
                        x1={r2(x + layout.tw - 1)}
                        x2={r2(x + layout.tw - (q === 0.5 ? 6 : 4))}
                        y1={y}
                        y2={y}
                        strokeWidth={0.8}
                        className="stroke-hairline-strong"
                      />
                    );
                  })
                : null}
              <path
                d={tubePath(layout, x)}
                fill="none"
                strokeWidth={1.2}
                className="stroke-(--tr-wall)"
              />
              {/* The glass's own highlight, a long vertical glint on its left wall. */}
              <rect
                x={r2(x + layout.tw * 0.12)}
                y={r2(layout.top + 6)}
                width={r2(Math.max(1, layout.tw * 0.08))}
                height={r2(
                  Math.max(0, layout.bottom - layout.top - layout.tw * 0.7),
                )}
                rx={1}
                fill="white"
                opacity={r2(0.08 + 0.42 * gloss)}
              />
            </g>
          );
        })}
        {/* The front rail, over the glass. */}
        <rect
          x={layout.rackLeft}
          y={layout.railY}
          width={r2(layout.rackRight - layout.rackLeft)}
          height={5}
          rx={2.5}
          className="fill-surface-2 stroke-hairline-strong"
        />
      </svg>
      {current.map((v, i) => {
        const x = layout.x[i] ?? 0;
        const name = labels[i] ?? `Tube ${i + 1}`;
        const isActive = i === active;
        const chip = shown && isActive;
        return (
          <React.Fragment key={i}>
            <TubeHandle
              index={i}
              layout={layout}
              name={name}
              value={Number(v.toFixed(4))}
              valueText={`${name}: ${format(v)}`}
              max={top}
              selected={isActive && shown}
              tabbable={isActive}
              disabled={disabled}
              bind={(node) => {
                if (node) handles.current.set(i, node);
                else handles.current.delete(i);
              }}
              onLevel={(index, level) => setLevel(index, level)}
              onSelect={select}
              onKey={onKey}
              onDragState={(index, on) => setDraggingIndex(on ? index : null)}
            />
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-0 flex h-[18px] -translate-x-1/2 items-center rounded-full border border-hairline bg-popover px-1.5 font-mono text-[10px] leading-none text-foreground tabular-nums shadow-sm transition-opacity duration-150",
                chip ? "opacity-100" : "opacity-0",
              )}
              style={{ left: r2(x + layout.tw / 2) }}
            >
              {format(v)}
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center gap-0.5 font-mono text-[10px] leading-none tabular-nums"
              style={{
                left: r2(x + layout.tw / 2),
                top: r2(layout.bottom + BASE_H + 4),
              }}
            >
              <span
                className={cn(
                  isActive && shown ? "text-foreground" : "text-ink-3",
                )}
              >
                {name}
              </span>
              <span className="text-ink-2">{format(v)}</span>
            </span>
          </React.Fragment>
        );
      })}
      <span id={hintId} className="sr-only">
        Left and Right move between tubes; Up and Down change a level, Page Up
        and Page Down by a tenth, Home empties and End fills.
      </span>
    </div>
  );
}
