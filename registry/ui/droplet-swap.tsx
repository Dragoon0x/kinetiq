"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DropletSwapItem = {
  /** A picture to show. Without one, a drawn scene stands in. */
  src?: string;
  /** What the picture shows, for assistive technology. */
  alt: string;
  /** A short line shown over the picture's foot. */
  caption?: string;
};

export type DropletSwapProps = {
  /** The pictures, in order. @default defaultDropletSwapItems */
  items?: readonly DropletSwapItem[];
  /** Controlled: the index of the picture shown. */
  value?: number;
  /** The picture to start on, when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires when a drop has burst and a new picture fills the frame, with its index. */
  onValueChange?: (index: number) => void;
  /** How big the drop has grown when it bursts: its diameter as a share of the frame's height, 0.2 to 0.6. @default 0.45 */
  dropSize?: number;
  /** How fast a drop rolls across, in px/s. @default 420 */
  rollSpeed?: number;
  /** The drop's lens power, 0 (1.3× and a faint rim) to 1 (3× with a dark meniscus and a bright caustic). @default 0.6 */
  refraction?: number;
  /** Leave a wet trail behind the drop that dries. @default true */
  trail?: boolean;
  /** Throw a few small drops when it bursts. @default true */
  splash?: boolean;
  /** ms between automatic swaps, 0 for none. Pauses while hovered, focused, hidden or off screen. @default 0 */
  interval?: number;
  /** Wrap from the last picture to the first and back. @default true */
  loop?: boolean;
  /** Show a dot per picture to choose it. @default true */
  indicators?: boolean;
  /** Show the caption over the picture's foot. @default true */
  captions?: boolean;
  /** Names the gallery for assistive technology. @default "Gallery" */
  label?: string;
  /** A soft plip when a drop forms under the finger and a blup when it bursts — only for the visitor's own drag, tap or key. @default false */
  sound?: boolean;
  /** Shows the picture and takes no input. @default false */
  disabled?: boolean;
  /** Sizes the frame. @default "h-56 w-full" */
  className?: string;
};

/** Five drawn scenes from the coasts and glasshouses of an invented country. */
export const defaultDropletSwapItems: readonly DropletSwapItem[] = [
  {
    alt: "A harbour at dawn: a low sun over still water, a jetty and two moored boats.",
    caption: "Coldbrook harbour, dawn",
  },
  {
    alt: "Inside a glasshouse: tall arched panes over beds of ferns and palms.",
    caption: "Fernworks glasshouse",
  },
  {
    alt: "Salt flats mirroring blue mountains under a pale pink sky.",
    caption: "Basinworks salt flats",
  },
  {
    alt: "A lighthouse on dark rocks at dusk, its beam crossing a calm sea.",
    caption: "Waylight point, dusk",
  },
  {
    alt: "Rows of round orchard trees running away under a golden evening.",
    caption: "Fieldline orchard",
  },
];

/**
 * Scenes are pigment: they look the same in either theme. Each is composed in
 * a 400×240 box and bled out to 640 wide, so a wide frame and a phone-width
 * one both crop it from the middle.
 */
const SCENES: ((id: string) => React.ReactNode)[] = [
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.78 0.05 250)" />
          <stop offset="0.6" stopColor="oklch(0.9 0.06 62)" />
          <stop offset="1" stopColor="oklch(0.86 0.09 46)" />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.66 0.06 230)" />
          <stop offset="1" stopColor="oklch(0.4 0.06 248)" />
        </linearGradient>
      </defs>
      <rect x="-120" width="640" height="152" fill={`url(#${id}-sky)`} />
      <circle cx="272" cy="118" r="19" fill="oklch(0.97 0.06 86)" />
      <path
        d="M-120 128 C -60 118 -10 136 40 130 C 80 124 110 128 160 122 S 262 130 400 116 C 450 110 490 122 520 118 L 520 152 L -120 152 Z"
        fill="oklch(0.58 0.045 262)"
      />
      <rect x="-120" y="150" width="640" height="90" fill={`url(#${id}-sea)`} />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <rect
          key={k}
          x={262 - k * 3}
          y={156 + k * 8}
          width={20 + k * 6}
          height="2"
          rx="1"
          fill="oklch(0.96 0.07 80)"
          opacity={(8 - k) / 10}
        />
      ))}
      <rect x="-120" y="176" width="288" height="6" fill="oklch(0.3 0.03 52)" />
      {[-108, -68, -28, 12, 52, 92, 132].map((x) => (
        <rect
          key={x}
          x={x}
          y="176"
          width="5"
          height="40"
          fill="oklch(0.26 0.03 52)"
        />
      ))}
      <path
        d="M196 196 L 252 196 L 244 206 L 204 206 Z"
        fill="oklch(0.32 0.05 30)"
      />
      <rect x="222" y="160" width="2" height="36" fill="oklch(0.3 0.02 50)" />
      <path d="M224 164 L 240 190 L 224 190 Z" fill="oklch(0.94 0.02 80)" />
      <path
        d="M300 214 L 340 214 L 334 222 L 306 222 Z"
        fill="oklch(0.55 0.12 30)"
      />
      <rect x="318" y="190" width="2" height="24" fill="oklch(0.3 0.02 50)" />
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-air`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.93 0.04 150)" />
          <stop offset="1" stopColor="oklch(0.86 0.05 95)" />
        </linearGradient>
      </defs>
      <rect x="-120" width="640" height="240" fill={`url(#${id}-air)`} />
      <path
        d="M40 240 L 40 90 C 40 30 360 30 360 90 L 360 240"
        fill="oklch(0.88 0.05 170)"
        opacity="0.6"
      />
      {[80, 120, 160, 200, 240, 280, 320].map((x) => (
        <rect
          key={x}
          x={x - 1}
          y="40"
          width="2"
          height="200"
          fill="oklch(0.97 0.01 120)"
        />
      ))}
      {[90, 130, 170].map((y) => (
        <rect
          key={y}
          x="40"
          y={y}
          width="320"
          height="2"
          fill="oklch(0.97 0.01 120)"
        />
      ))}
      <path
        d="M40 240 L 40 90 C 40 30 360 30 360 90 L 360 240"
        fill="none"
        stroke="oklch(0.97 0.01 120)"
        strokeWidth="4"
      />
      <rect
        x="-120"
        y="206"
        width="640"
        height="34"
        fill="oklch(0.58 0.06 60)"
      />
      {[
        [-70, 198, 40, "oklch(0.5 0.11 146)"],
        [10, 200, 30, "oklch(0.44 0.1 156)"],
        [70, 196, 34, "oklch(0.46 0.11 150)"],
        [120, 190, 42, "oklch(0.55 0.12 140)"],
        [190, 198, 30, "oklch(0.42 0.1 160)"],
        [250, 186, 46, "oklch(0.5 0.12 148)"],
        [320, 194, 36, "oklch(0.45 0.1 155)"],
        [400, 200, 32, "oklch(0.52 0.12 142)"],
        [470, 196, 40, "oklch(0.46 0.1 152)"],
      ].map(([x, y, r, c]) => (
        <ellipse
          key={String(x)}
          cx={x as number}
          cy={y as number}
          rx={r as number}
          ry={Math.round((r as number) * 62) / 100}
          fill={c as string}
        />
      ))}
      <path
        d="M250 186 C 240 140 226 120 206 112 M250 186 C 262 140 280 124 300 120 M250 186 C 252 150 250 120 254 96"
        fill="none"
        stroke="oklch(0.42 0.1 150)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M120 190 C 112 160 98 146 80 140 M120 190 C 130 160 146 150 164 146"
        fill="none"
        stroke="oklch(0.5 0.11 145)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.8 0.05 260)" />
          <stop offset="1" stopColor="oklch(0.92 0.04 20)" />
        </linearGradient>
        <linearGradient id={`${id}-flat`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.92 0.03 20)" />
          <stop offset="1" stopColor="oklch(0.97 0.01 80)" />
        </linearGradient>
      </defs>
      <rect x="-120" width="640" height="124" fill={`url(#${id}-sky)`} />
      <path
        d="M-120 124 L -90 106 L -50 114 L -10 92 L 40 100 L 70 110 L 120 72 L 160 104 L 210 86 L 260 112 L 300 80 L 350 108 L 400 96 L 440 110 L 480 94 L 520 104 L 520 124 Z"
        fill="oklch(0.55 0.07 255)"
      />
      <rect
        x="-120"
        y="124"
        width="640"
        height="116"
        fill={`url(#${id}-flat)`}
      />
      <path
        d="M-120 124 L -90 142 L -50 134 L -10 156 L 40 148 L 70 138 L 120 176 L 160 144 L 210 162 L 260 136 L 300 168 L 350 140 L 400 152 L 440 138 L 480 154 L 520 144 L 520 124 Z"
        fill="oklch(0.72 0.05 255)"
        opacity="0.55"
      />
      <path
        d="M196 240 L 204 240 L 201 124 L 199 124 Z"
        fill="oklch(0.86 0.02 40)"
      />
      <rect
        x="226"
        y="150"
        width="3"
        height="12"
        rx="1.5"
        fill="oklch(0.3 0.03 30)"
      />
      <circle cx="227.5" cy="147" r="2.4" fill="oklch(0.3 0.03 30)" />
      <rect
        x="226"
        y="162"
        width="3"
        height="10"
        rx="1.5"
        fill="oklch(0.3 0.03 30)"
        opacity="0.25"
      />
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.3 0.07 280)" />
          <stop offset="0.75" stopColor="oklch(0.55 0.09 330)" />
          <stop offset="1" stopColor="oklch(0.72 0.1 50)" />
        </linearGradient>
        <linearGradient id={`${id}-beam`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="oklch(0.97 0.06 90)" stopOpacity="0.75" />
          <stop offset="1" stopColor="oklch(0.97 0.06 90)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="-120" width="640" height="160" fill={`url(#${id}-sky)`} />
      {[
        [40, 30],
        [90, 52],
        [150, 24],
        [210, 44],
        [60, 80],
        [180, 70],
        [120, 12],
        [-80, 40],
        [-30, 70],
        [380, 30],
        [460, 56],
      ].map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r="1.2"
          fill="oklch(0.95 0.02 90)"
        />
      ))}
      <path d="M296 70 L -120 28 L -120 112 Z" fill={`url(#${id}-beam)`} />
      <rect
        x="-120"
        y="158"
        width="640"
        height="82"
        fill="oklch(0.3 0.05 265)"
      />
      {[0, 1, 2, 3].map((k) => (
        <rect
          key={k}
          x={60 + k * 50}
          y={172 + k * 14}
          width={60 - k * 8}
          height="2"
          rx="1"
          fill="oklch(0.7 0.08 330)"
          opacity="0.5"
        />
      ))}
      <path
        d="M250 240 L 262 176 L 300 160 L 344 168 L 372 190 L 420 182 L 470 196 L 520 190 L 520 240 Z"
        fill="oklch(0.2 0.03 270)"
      />
      <path
        d="M284 166 L 290 84 L 302 84 L 308 166 Z"
        fill="oklch(0.94 0.01 90)"
      />
      {[100, 124, 148].map((y) => (
        <rect
          key={y}
          x="287"
          y={y}
          width="18"
          height="8"
          fill="oklch(0.55 0.15 28)"
        />
      ))}
      <rect x="286" y="72" width="20" height="12" fill="oklch(0.97 0.08 90)" />
      <path d="M284 72 L 296 60 L 308 72 Z" fill="oklch(0.35 0.04 270)" />
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.86 0.08 80)" />
          <stop offset="1" stopColor="oklch(0.93 0.07 95)" />
        </linearGradient>
        <linearGradient id={`${id}-grass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.7 0.11 120)" />
          <stop offset="1" stopColor="oklch(0.55 0.11 135)" />
        </linearGradient>
      </defs>
      <rect x="-120" width="640" height="110" fill={`url(#${id}-sky)`} />
      <rect
        x="-120"
        y="108"
        width="640"
        height="132"
        fill={`url(#${id}-grass)`}
      />
      {[0, 1, 2, 3, 4].map((row) => {
        const y = 108 + Math.round(Math.pow(row / 4, 1.6) * 110) + 6;
        const r = 5 + row * 7;
        const q = (v: number) => Math.round(v * 100) / 100;
        const n = 17 - row * 3;
        return Array.from({ length: n }, (_, k) => {
          const x = Math.round(((k + 0.5) / n) * 640 - 120 + (row % 2) * 10);
          return (
            <g key={`${row}-${k}`}>
              <rect
                x={x - 1.5}
                y={q(y - r * 0.2)}
                width="3"
                height={q(r * 0.9)}
                fill="oklch(0.38 0.05 60)"
              />
              <circle
                cx={x}
                cy={y - r}
                r={r}
                fill={row % 2 ? "oklch(0.48 0.12 140)" : "oklch(0.52 0.13 132)"}
              />
              <circle
                cx={q(x + r * 0.3)}
                cy={q(y - r * 1.2)}
                r={q(r * 0.18)}
                fill="oklch(0.68 0.17 35)"
              />
            </g>
          );
        });
      })}
    </>
  ),
];

/** The pigment the overlay text and dots are drawn in, over any picture. */
const ON_PICTURE = "oklch(0.98 0.005 90)";
const TRAIL_POINTS = 28;
const BEADS = 5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x7f4a7c15) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The glide spring's constants, integrated per frame for the spread. */
const GLIDE = { k: 300, c: 34, m: 1 };

type Mode =
  | "rest"
  | "form"
  | "roll"
  | "drag"
  | "burst"
  | "fade"
  /** The new picture fills the frame and waits for React to make it the base. */
  | "hold"
  | "evaporate";

type Engine = {
  mode: Mode;
  x: number;
  y: number;
  r: number;
  /** Smoothed screen velocity, px/s, for the squash. */
  vx: number;
  vy: number;
  speed: number;
  dir: 1 | -1;
  dist: number;
  gather: number;
  y0: number;
  phase: number;
  /** Seconds in the current mode. */
  t: number;
  /** The spread's progress and its velocity. */
  p: number;
  pv: number;
  cover: number;
  burstR: number;
  lens: number;
  trailAlpha: number;
  sheen: number;
  visitor: boolean;
  last: number;
  /** Where the drag began, frame px. */
  fromX: number;
  /** The index the drop is carrying. */
  target: number;
  /** A swap asked for while one was under way. */
  pending: { index: number; dir: 1 | -1; visitor: boolean } | null;
  rolls: number;
};

/**
 * A gallery whose transition is a drop of water. A drop rolls across the
 * picture, and inside it the next picture shows upside down and magnified
 * about the drop's centre — a real lens, so the view slides the other way as
 * it moves — with a dark meniscus, a highlight, a shadow cast down-right and a
 * caustic on the far side, squashing along its path with speed and leaving a
 * wet trail. It gathers as it rolls, and at full size it bursts: it flattens
 * into a spreading circle of the new picture, upright, on the glide spring's
 * constants, with a few splash beads and a wet sheen that dries.
 *
 * Drag to steer: a drop forms under the finger and follows it 1:1, carrying
 * the next picture to the right and the previous to the left, bursting when
 * it has gathered enough; a flick rolls it on with the throw's speed, a short
 * pull evaporates. Arrow keys roll next and previous, Home and End roll to the
 * ends, dots choose a picture. Under reduced motion the bead rests still and a
 * swap is a cross-fade.
 */
export function DropletSwap({
  items = defaultDropletSwapItems,
  value,
  defaultValue = 0,
  onValueChange,
  dropSize = 0.45,
  rollSpeed = 420,
  refraction = 0.6,
  trail = true,
  splash = true,
  interval = 0,
  loop = true,
  indicators = true,
  captions = true,
  label = "Gallery",
  sound = false,
  disabled = false,
  className,
}: DropletSwapProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const n = items.length;
  const wrap = React.useCallback((i: number) => ((i % n) + n) % n, [n]);
  const [own, setOwn] = React.useState(() =>
    clamp(defaultValue, 0, Math.max(0, n - 1)),
  );
  const current = clamp(value ?? own, 0, Math.max(0, n - 1));
  /** What is settled in the frame; it moves to `current` when a drop bursts. */
  const [shown, setShown] = React.useState(current);
  const nextOf = React.useCallback(
    (i: number, dir: 1 | -1) => {
      const j = i + dir;
      if (j < 0 || j >= n) return loop && n > 1 ? wrap(j) : -1;
      return j;
    },
    [loop, n, wrap],
  );
  const [target, setTarget] = React.useState(() => nextOf(current, 1));
  const [size, setSize] = React.useState({ w: 640, h: 224 });
  const [announcement, setAnnouncement] = React.useState("");
  const hintId = `${uid}-hint`;

  const W = size.w;
  const H = size.h;
  const rMax = r2((clamp(dropSize, 0.2, 0.6) * H) / 2);
  const r0 = r2(Math.max(5, rMax * 0.17));
  const power = clamp01(refraction);
  /**
   * The lens's window onto the next picture, as a share of the frame's height
   * that fills the drop's diameter: a weak lens takes in most of the picture,
   * a strong one a close-up of its middle.
   */
  const lensWindow = 0.95 - power * 0.6;

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const dropRef = React.useRef<SVGPathElement | null>(null);
  const rimRef = React.useRef<SVGPathElement | null>(null);
  const edgeRef = React.useRef<SVGPathElement | null>(null);
  const lensRef = React.useRef<SVGGElement | null>(null);
  const dropGroupRef = React.useRef<SVGGElement | null>(null);
  const shadowRef = React.useRef<SVGEllipseElement | null>(null);
  const causticRef = React.useRef<SVGEllipseElement | null>(null);
  const shineRef = React.useRef<SVGEllipseElement | null>(null);
  const trailRef = React.useRef<SVGPathElement | null>(null);
  const spreadRef = React.useRef<SVGCircleElement | null>(null);
  const spreadGroupRef = React.useRef<SVGGElement | null>(null);
  const ringRef = React.useRef<SVGCircleElement | null>(null);
  const ringOuterRef = React.useRef<SVGCircleElement | null>(null);
  const sheenRef = React.useRef<SVGRectElement | null>(null);
  const beadRefs = React.useRef<(SVGCircleElement | null)[]>([]);

  const engine = React.useRef<Engine>({
    mode: "rest",
    x: 0,
    y: 0,
    r: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    dir: 1,
    dist: 0,
    gather: 1,
    y0: 0,
    phase: 0,
    t: 0,
    p: 0,
    pv: 0,
    cover: 0,
    burstR: 0,
    lens: 1,
    trailAlpha: 0,
    sheen: 0,
    visitor: false,
    last: 0,
    fromX: 0,
    target: -1,
    pending: null,
    rolls: 0,
  });
  const trailPts = React.useRef(new Float32Array(TRAIL_POINTS * 2));
  const trailCount = React.useRef(0);
  const beads = React.useRef(new Float32Array(BEADS * 5));
  const beadLife = React.useRef(0);
  const frameId = React.useRef(0);
  const visible = React.useRef(true);
  const hovered = React.useRef(false);
  const focusedIn = React.useRef(false);

  /** Where the bead waits: near the edge it will roll in from, low in the frame. */
  const restAt = React.useCallback(
    (dir: 1 | -1) => ({
      x: dir > 0 ? W * 0.07 + r0 : W * 0.93 - r0,
      y: H * 0.66,
    }),
    [H, W, r0],
  );

  const api = React.useRef<{
    tick: (now: number) => void;
    paint: () => void;
    start: (
      index: number,
      dir: 1 | -1,
      visitor: boolean,
      from?: { x: number; y: number },
    ) => void;
    settled: () => void;
  } | null>(null);
  const loopFrame = React.useCallback(
    (now: number) => api.current?.tick(now),
    [],
  );

  const kick = () => {
    if (frameId.current || !visible.current) return;
    engine.current.last = 0;
    frameId.current = window.requestAnimationFrame(loopFrame);
  };

  /** Writes the drop, the lens, the spread and the splash to their attributes. */
  const paint = () => {
    const e = engine.current;
    const hasDrop =
      e.target >= 0 &&
      e.mode !== "burst" &&
      e.mode !== "fade" &&
      e.mode !== "hold" &&
      e.r > 0.3;
    const group = dropGroupRef.current;
    if (group) group.setAttribute("opacity", hasDrop ? "1" : "0");
    if (hasDrop) {
      const speed = Math.hypot(e.vx, e.vy);
      const k = motionSafe ? Math.min(0.22, speed / 2600) : 0;
      const rx = e.r * (1 + k);
      const ry = e.r * (1 - 0.6 * k);
      const a = speed > 1 ? Math.atan2(e.vy, e.vx) : 0;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const deg = r2((a * 180) / Math.PI);
      const p1 = `${r2(e.x + rx * c)} ${r2(e.y + rx * s)}`;
      const p2 = `${r2(e.x - rx * c)} ${r2(e.y - rx * s)}`;
      const d = `M ${p1} A ${r2(rx)} ${r2(ry)} ${deg} 1 0 ${p2} A ${r2(rx)} ${r2(ry)} ${deg} 1 0 ${p1} Z`;
      dropRef.current?.setAttribute("d", d);
      rimRef.current?.setAttribute("d", d);
      edgeRef.current?.setAttribute("d", d);
      const x = r2(e.x);
      const y = r2(e.y);
      // A drop is a ball lens: it shows the scene beyond it small and upside
      // down. The view is centred between the picture's middle and the drop,
      // so it slides the other way as the drop rolls, and it grows as the drop
      // gathers.
      const scale = r2((2 * e.r) / (H * lensWindow));
      const cx = r2(W / 2 + (e.x - W / 2) * 0.35);
      const cy = r2(H / 2 + (e.y - H / 2) * 0.35);
      lensRef.current?.setAttribute(
        "transform",
        `translate(${x} ${y}) rotate(180) scale(${scale}) translate(${-cx} ${-cy})`,
      );
      lensRef.current?.setAttribute("opacity", String(r2(e.lens)));
      const sh = shadowRef.current;
      if (sh) {
        sh.setAttribute("cx", String(r2(e.x + e.r * 0.28)));
        sh.setAttribute("cy", String(r2(e.y + e.r * 0.4)));
        sh.setAttribute("rx", String(r2(rx * 1.02)));
        sh.setAttribute("ry", String(r2(ry * 0.92)));
      }
      const ca = causticRef.current;
      if (ca) {
        ca.setAttribute("cx", String(r2(e.x + e.r * 0.42)));
        ca.setAttribute("cy", String(r2(e.y + e.r * 0.58)));
        ca.setAttribute("rx", String(r2(e.r * 0.36)));
        ca.setAttribute("ry", String(r2(e.r * 0.22)));
      }
      const sn = shineRef.current;
      if (sn) {
        const sx = r2(e.x - e.r * 0.36);
        const sy = r2(e.y - e.r * 0.42);
        sn.setAttribute("cx", String(sx));
        sn.setAttribute("cy", String(sy));
        sn.setAttribute("rx", String(r2(e.r * 0.28)));
        sn.setAttribute("ry", String(r2(e.r * 0.15)));
        sn.setAttribute("transform", `rotate(-32 ${sx} ${sy})`);
      }
    }
    // The spread: a circle of the new picture, upright, growing from the burst.
    const spreading =
      e.mode === "burst" || e.mode === "fade" || e.mode === "hold";
    const spreadR =
      e.mode === "burst" ? e.burstR + (e.cover - e.burstR) * e.p : e.cover;
    spreadRef.current?.setAttribute(
      "r",
      spreading ? String(r2(Math.max(0, spreadR))) : "0",
    );
    spreadRef.current?.setAttribute("cx", String(r2(e.x)));
    spreadRef.current?.setAttribute("cy", String(r2(e.y)));
    spreadGroupRef.current?.setAttribute(
      "opacity",
      spreading ? String(e.mode === "fade" ? r2(e.p) : 1) : "0",
    );
    const ringOpacity =
      e.mode === "burst" ? r2(Math.pow(1 - clamp01(e.p), 0.6)) : 0;
    for (const ring of [ringRef.current, ringOuterRef.current]) {
      if (!ring) continue;
      ring.setAttribute("cx", String(r2(e.x)));
      ring.setAttribute("cy", String(r2(e.y)));
      ring.setAttribute("r", String(r2(Math.max(0, spreadR))));
      ring.setAttribute("opacity", String(ringOpacity));
    }
    // The wet trail.
    const tp = trailRef.current;
    if (tp) {
      const count = trailCount.current;
      if (!trail || count < 2 || e.trailAlpha <= 0.01) {
        tp.setAttribute("d", "");
      } else {
        const pts = trailPts.current;
        let d = `M ${r2(pts[0] ?? 0)} ${r2(pts[1] ?? 0)}`;
        for (let i = 1; i < count; i += 1) {
          d += ` L ${r2(pts[i * 2] ?? 0)} ${r2(pts[i * 2 + 1] ?? 0)}`;
        }
        tp.setAttribute("d", d);
        tp.setAttribute("stroke-width", String(r2(Math.max(2, e.r * 0.72))));
        tp.setAttribute("opacity", String(r2(e.trailAlpha)));
      }
    }
    // Splash beads.
    const b = beads.current;
    const life = beadLife.current;
    for (let i = 0; i < BEADS; i += 1) {
      const el = beadRefs.current[i];
      if (!el) continue;
      if (life <= 0) {
        el.setAttribute("r", "0");
        continue;
      }
      el.setAttribute("cx", String(r2(b[i * 5] ?? 0)));
      el.setAttribute("cy", String(r2(b[i * 5 + 1] ?? 0)));
      el.setAttribute(
        "r",
        String(r2((b[i * 5 + 4] ?? 0) * Math.min(1, life * 2.2))),
      );
      el.setAttribute("opacity", String(r2(Math.min(1, life * 2))));
    }
    sheenRef.current?.setAttribute("opacity", String(r2(e.sheen * 0.9)));
  };

  const pushTrail = (x: number, y: number) => {
    const pts = trailPts.current;
    const count = trailCount.current;
    const lx = pts[(count - 1) * 2] ?? -999;
    const ly = pts[(count - 1) * 2 + 1] ?? -999;
    if (count > 0 && Math.hypot(x - lx, y - ly) < 6) return;
    if (count < TRAIL_POINTS) {
      pts[count * 2] = x;
      pts[count * 2 + 1] = y;
      trailCount.current = count + 1;
    } else {
      pts.copyWithin(0, 2);
      pts[(TRAIL_POINTS - 1) * 2] = x;
      pts[(TRAIL_POINTS - 1) * 2 + 1] = y;
    }
  };

  const burst = () => {
    const e = engine.current;
    e.mode = motionSafe ? "burst" : "fade";
    e.t = 0;
    e.p = 0;
    e.pv = 0;
    e.burstR = e.r;
    e.cover =
      Math.max(
        Math.hypot(e.x, e.y),
        Math.hypot(W - e.x, e.y),
        Math.hypot(e.x, H - e.y),
        Math.hypot(W - e.x, H - e.y),
      ) + 4;
    if (e.visitor) {
      audio.play("blup", {
        pitch: r2(1.25 - 0.45 * clamp01((e.r * 2) / H)),
        gain: 0.6,
        pan: panFrom(
          (frameRef.current?.getBoundingClientRect().left ?? 0) + e.x,
          frameRef.current,
        ),
      });
    }
    if (splash && motionSafe) {
      const rand = lcg(e.rolls * 13 + 5);
      const b = beads.current;
      for (let i = 0; i < BEADS; i += 1) {
        const a = (i / BEADS) * Math.PI * 2 + rand() * 0.9;
        const v = 120 + rand() * 220;
        b[i * 5] = e.x + Math.cos(a) * e.r * 0.9;
        b[i * 5 + 1] = e.y + Math.sin(a) * e.r * 0.9;
        b[i * 5 + 2] = Math.cos(a) * v;
        b[i * 5 + 3] = Math.sin(a) * v;
        b[i * 5 + 4] = 1.4 + rand() * 2.4;
      }
      beadLife.current = 0.6;
    }
  };

  /** Starts a drop toward `index`, rolling in from an edge or from a point. */
  const start = (
    index: number,
    dir: 1 | -1,
    visitor: boolean,
    from?: { x: number; y: number },
  ) => {
    const e = engine.current;
    if (index < 0 || index === shown) return;
    if (e.mode === "hold") {
      e.pending = { index, dir, visitor };
      return;
    }
    if (e.mode === "roll" || e.mode === "drag") {
      // Already rolling: it bursts where it is, and this one goes next.
      e.pending = { index, dir, visitor };
      if (e.mode === "roll") burst();
      kick();
      return;
    }
    if (e.mode === "burst" || e.mode === "fade") {
      e.pending = { index, dir, visitor };
      return;
    }
    e.rolls += 1;
    const rand = lcg(e.rolls * 7 + 1);
    e.target = index;
    e.dir = dir;
    e.visitor = visitor;
    setTarget(index);
    const rest = restAt(dir);
    e.x = from?.x ?? rest.x;
    e.y = clamp(
      from?.y ?? H * (0.42 + rand() * 0.24),
      rMax * 0.9,
      H - rMax * 0.9,
    );
    e.y0 = e.y;
    e.phase = rand() * Math.PI * 2;
    e.r = Math.max(e.r, r0);
    e.dist = 0;
    const room = dir > 0 ? W - e.x : e.x;
    e.gather = clamp(room * 0.8 - rMax * 0.4, H * 0.3, W * 0.68);
    e.speed = 0;
    e.vx = 0;
    e.vy = 0;
    e.lens = 1;
    e.t = 0;
    trailCount.current = 0;
    e.trailAlpha = 1;
    if (!motionSafe) {
      e.r = r0;
      burst();
    } else {
      e.mode = "roll";
    }
    kick();
  };

  /** Called once the new picture has settled in the frame. */
  const settled = () => {
    const e = engine.current;
    const next = e.pending;
    e.pending = null;
    const bead = nextOf(shown, 1);
    e.target = bead;
    e.dir = 1;
    const rest = restAt(1);
    e.x = rest.x;
    e.y = rest.y;
    e.vx = 0;
    e.vy = 0;
    e.lens = 1;
    e.p = 0;
    e.r = motionSafe ? 0 : r0;
    e.mode = motionSafe ? "form" : "rest";
    e.t = 0;
    e.sheen = motionSafe ? 1 : 0;
    setTarget(bead);
    if (next && next.index !== shown) start(next.index, next.dir, next.visitor);
    else if (current !== shown) start(current, current > shown ? 1 : -1, false);
    else kick();
    paint();
  };

  const tick = (now: number) => {
    frameId.current = 0;
    const e = engine.current;
    if (!visible.current) {
      e.last = 0;
      return;
    }
    const dt = e.last ? Math.min(0.05, (now - e.last) / 1000) : 1 / 60;
    e.last = now;
    e.t += dt;
    const px = e.x;
    const py = e.y;

    if (e.mode === "roll") {
      e.speed += (rollSpeed - e.speed) * (1 - Math.exp(-dt * 5));
      const step = e.speed * dt;
      e.x += e.dir * step;
      e.dist += step;
      const settle = e.dist / (e.dist + 40);
      e.y = clamp(
        e.y0 + Math.sin(e.phase + e.dist / (H * 0.9)) * H * 0.06 * settle,
        e.r,
        H - e.r,
      );
      e.r = r0 + (rMax - r0) * Math.pow(smooth(e.dist / e.gather), 0.8);
      if (trail) pushTrail(e.x, e.y);
      if (e.dist >= e.gather || e.x < -e.r || e.x > W + e.r) burst();
    } else if (e.mode === "burst") {
      // The spread rides the glide spring's constants, sub-stepped.
      let left = dt;
      while (left > 0) {
        const h = Math.min(1 / 120, left);
        const acc = (GLIDE.k * (1 - e.p) - GLIDE.c * e.pv) / GLIDE.m;
        e.pv += acc * h;
        e.p += e.pv * h;
        left -= h;
      }
      e.lens = Math.max(0, 1 - e.t / 0.12);
      if (e.p > 0.996 && Math.abs(e.pv) < 0.02) {
        e.p = 1;
        e.mode = "hold";
        e.trailAlpha = 0;
        trailCount.current = 0;
        commit(e.target, e.visitor);
      }
    } else if (e.mode === "fade") {
      e.p = Math.min(1, e.t / durations.base);
      if (e.p >= 1) {
        e.mode = "hold";
        commit(e.target, e.visitor);
      }
    } else if (e.mode === "form") {
      // A fresh bead swells in on a short ease, the size a flick would land at.
      e.r = r0 * smooth(e.t / 0.18);
      if (e.t >= 0.18) {
        e.r = r0;
        e.mode = "rest";
      }
    } else if (e.mode === "evaporate") {
      e.r = Math.max(0, e.r * (1 - smooth(e.t / 0.25)) - 0.2);
      e.trailAlpha = Math.max(0, e.trailAlpha - dt * 3);
      if (e.t >= 0.25) {
        const rest = restAt(1);
        e.x = rest.x;
        e.y = rest.y;
        e.r = 0;
        e.t = 0;
        e.mode = "form";
        const bead = nextOf(shown, 1);
        e.target = bead;
        setTarget(bead);
      }
    }

    if (e.mode !== "drag") {
      const vx = (e.x - px) / dt;
      const vy = (e.y - py) / dt;
      const k = 1 - Math.exp(-dt * 18);
      e.vx += (vx - e.vx) * k;
      e.vy += (vy - e.vy) * k;
    }
    if (e.mode !== "roll" && e.mode !== "drag" && e.trailAlpha > 0) {
      e.trailAlpha = Math.max(0, e.trailAlpha - dt / 0.7);
    }
    if (e.sheen > 0 && e.mode !== "burst")
      e.sheen = Math.max(0, e.sheen - dt / 0.6);
    if (beadLife.current > 0) {
      const b = beads.current;
      const drag = Math.exp(-dt * 6);
      for (let i = 0; i < BEADS; i += 1) {
        b[i * 5] = (b[i * 5] ?? 0) + (b[i * 5 + 2] ?? 0) * dt;
        b[i * 5 + 1] = (b[i * 5 + 1] ?? 0) + (b[i * 5 + 3] ?? 0) * dt;
        b[i * 5 + 2] = (b[i * 5 + 2] ?? 0) * drag;
        b[i * 5 + 3] = (b[i * 5 + 3] ?? 0) * drag;
      }
      beadLife.current = Math.max(0, beadLife.current - dt);
    }
    paint();

    const busy =
      (e.mode !== "rest" && e.mode !== "hold") ||
      e.trailAlpha > 0 ||
      e.sheen > 0 ||
      beadLife.current > 0 ||
      Math.hypot(e.vx, e.vy) > 2;
    if (busy) frameId.current = window.requestAnimationFrame(loopFrame);
    else {
      e.vx = 0;
      e.vy = 0;
      e.last = 0;
      paint();
    }
  };

  const commit = (index: number, visitor: boolean) => {
    setShown(index);
    if (value === undefined) setOwn(index);
    if (index !== current) onValueChange?.(index);
    if (visitor) {
      const item = items[index];
      setAnnouncement(
        `${index + 1} of ${n}: ${item?.caption ?? item?.alt ?? ""}`.trim(),
      );
    }
  };

  React.useLayoutEffect(() => {
    api.current = { tick, paint, start, settled };
  });

  // The burst has handed over: the new picture is the frame now. Reset the
  // lens and the spread in the same commit, before paint, so nothing flashes.
  const settledFor = React.useRef(shown);
  React.useLayoutEffect(() => {
    if (settledFor.current === shown) return;
    settledFor.current = shown;
    api.current?.settled();
  }, [shown]);

  // A host that changes `value` gets the same drop a key would — silent.
  React.useEffect(() => {
    const e = engine.current;
    if (current === shown || (e.mode !== "rest" && e.mode !== "form")) return;
    const forward = current > shown ? 1 : -1;
    api.current?.start(current, forward, false);
  }, [current, shown]);

  // Size, drop size or a new picture list re-place the waiting bead.
  React.useLayoutEffect(() => {
    const e = engine.current;
    if (e.mode === "rest" || e.mode === "form") {
      const bead = nextOf(shown, 1);
      const rest = restAt(1);
      e.target = bead;
      e.x = rest.x;
      e.y = rest.y;
      e.r = e.mode === "rest" ? r0 : e.r;
    }
    api.current?.paint();
  }, [W, H, r0, restAt, nextOf, shown, lensWindow, power]);

  React.useEffect(
    () => () => {
      if (frameId.current) window.cancelAnimationFrame(frameId.current);
      frameId.current = 0;
    },
    [],
  );

  const bindFrame = React.useCallback(
    (node: HTMLDivElement | null) => {
      frameRef.current = node;
      if (!node) return;
      const measure = () => {
        const r = node.getBoundingClientRect();
        const next = {
          w: Math.max(80, Math.round(r.width)),
          h: Math.max(60, Math.round(r.height)),
        };
        setSize((s) => (s.w === next.w && s.h === next.h ? s : next));
      };
      measure();
      const sizer = new ResizeObserver(measure);
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (
          visible.current &&
          engine.current.mode !== "rest" &&
          !frameId.current
        ) {
          engine.current.last = 0;
          frameId.current = window.requestAnimationFrame(loopFrame);
        }
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
      };
    },
    [loopFrame],
  );

  // Automatic swaps: one timer at a time, re-armed after every settle, held
  // while the visitor is reading (hover, focus) or nobody can see it.
  React.useEffect(() => {
    if (!interval || interval < 400 || n < 2 || disabled) return;
    let timer = 0;
    const fire = () => {
      const e = engine.current;
      if (
        hovered.current ||
        focusedIn.current ||
        !visible.current ||
        document.hidden ||
        e.mode !== "rest"
      ) {
        // Held, not dropped: look again after another interval.
        timer = window.setTimeout(fire, interval);
        return;
      }
      const next = nextOf(shown, 1);
      if (next >= 0) api.current?.start(next, 1, false);
    };
    timer = window.setTimeout(fire, interval);
    return () => window.clearTimeout(timer);
  }, [interval, n, disabled, nextOf, shown]);

  const swap = (dir: 1 | -1) => {
    const e = engine.current;
    const moving =
      e.mode === "roll" ||
      e.mode === "burst" ||
      e.mode === "fade" ||
      e.mode === "hold";
    const base = e.pending?.index ?? (moving ? e.target : shown);
    const index = nextOf(base, dir);
    if (index >= 0) start(index, dir, true);
  };
  const swapTo = (index: number) => {
    if (index === shown && engine.current.mode === "rest") return;
    start(index, index > shown ? 1 : -1, true);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled || n < 2) return;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        swap(1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        swap(-1);
        break;
      case "Home":
        event.preventDefault();
        swapTo(0);
        break;
      case "End":
        event.preventDefault();
        swapTo(n - 1);
        break;
      default:
        break;
    }
  };

  const local = (event: { clientX: number; clientY: number }) => {
    const r = frameRef.current?.getBoundingClientRect();
    return {
      x: clamp(event.clientX - (r?.left ?? 0), 0, W),
      y: clamp(event.clientY - (r?.top ?? 0), 0, H),
    };
  };

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || n < 2,
    onStart: ({ event, offset }) => {
      const e = engine.current;
      if (e.mode === "burst" || e.mode === "fade" || e.mode === "hold") return;
      const at = local(event);
      const startAt = { x: at.x - offset.x, y: at.y - offset.y };
      const dir: 1 | -1 = offset.x < 0 ? -1 : 1;
      if (e.mode !== "roll") {
        const index = nextOf(shown, dir);
        if (index < 0) return;
        e.rolls += 1;
        e.target = index;
        e.dir = dir;
        setTarget(index);
        e.x = startAt.x;
        e.y = clamp(startAt.y, r0, H - r0);
        e.r = r0;
        e.dist = 0;
        trailCount.current = 0;
        e.gather = W * 0.55;
        audio.play("plip", {
          pitch: 1.1,
          gain: 0.45,
          pan: panFrom(event.clientX, frameRef.current),
        });
      }
      e.fromX = startAt.x;
      e.visitor = true;
      e.trailAlpha = 1;
      e.lens = 1;
      e.mode = "drag";
      e.t = 0;
      kick();
    },
    onMove: ({ event, delta }) => {
      const e = engine.current;
      if (e.mode !== "drag") return;
      const at = local(event);
      // Which way the hand is carrying it decides which picture is inside.
      const dir: 1 | -1 =
        at.x - e.fromX < -8 ? -1 : at.x - e.fromX > 8 ? 1 : e.dir;
      if (dir !== e.dir) {
        const index = nextOf(shown, dir);
        if (index >= 0) {
          e.dir = dir;
          e.target = index;
          setTarget(index);
        }
      }
      e.x = at.x;
      e.y = clamp(at.y, e.r * 0.6, H - e.r * 0.6);
      e.dist += Math.hypot(delta.x, delta.y);
      e.vx += (delta.x / (1 / 60) - e.vx) * 0.3;
      e.vy += (delta.y / (1 / 60) - e.vy) * 0.3;
      e.r = r0 + (rMax - r0) * Math.pow(smooth(e.dist / e.gather), 0.8);
      if (trail) pushTrail(e.x, e.y);
      if (e.dist >= e.gather) burst();
      if (!frameId.current) paint();
    },
    onEnd: ({ velocity }) => {
      const e = engine.current;
      if (e.mode !== "drag") return;
      const speed = Math.hypot(velocity.x, velocity.y);
      const coast = Math.abs(project(0, speed, 0.995));
      if (e.dist + coast >= e.gather * 0.5 || speed > 700) {
        if (!motionSafe) {
          burst();
        } else {
          e.mode = "roll";
          e.dir = velocity.x < -40 ? -1 : velocity.x > 40 ? 1 : e.dir;
          e.speed = clamp(
            Math.abs(velocity.x) || rollSpeed,
            rollSpeed * 0.6,
            rollSpeed * 2.4,
          );
          e.y0 = e.y;
          e.phase = 0;
          e.gather = Math.max(e.dist + 24, e.gather * 0.7);
        }
      } else {
        e.mode = "evaporate";
        e.t = 0;
      }
      kick();
    },
    onCancel: () => {
      const e = engine.current;
      if (e.mode !== "drag") return;
      e.mode = "evaporate";
      e.t = 0;
      kick();
    },
    onTap: (event) => {
      if (n < 2) return;
      const next = nextOf(shown, 1);
      if (next >= 0) start(next, 1, true, local(event));
    },
  });

  const picture = (index: number, slot: string) => {
    const item = items[index];
    if (!item) return null;
    if (item.src) {
      return (
        <image
          href={item.src}
          width={W}
          height={H}
          preserveAspectRatio="xMidYMid slice"
        />
      );
    }
    const scene = SCENES[index % SCENES.length];
    return (
      <svg
        width={W}
        height={H}
        viewBox="-120 0 640 240"
        preserveAspectRatio="xMidYMid slice"
      >
        {scene?.(`${uid}-${slot}`)}
      </svg>
    );
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className={cn("relative", className ?? "h-56 w-full")}
      onPointerEnter={() => {
        hovered.current = true;
      }}
      onPointerLeave={() => {
        hovered.current = false;
      }}
      onFocus={() => {
        focusedIn.current = true;
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          focusedIn.current = false;
      }}
    >
      <div
        ref={bindFrame}
        role="group"
        aria-label={`${shown + 1} of ${n}${items[shown]?.caption ? `: ${items[shown]?.caption}` : ""}`}
        tabIndex={disabled ? -1 : 0}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "relative h-full w-full touch-pan-y overflow-clip rounded-3 bg-surface-2 select-none",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
      >
        <svg
          aria-hidden
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 block h-full w-full"
        >
          <defs>
            <clipPath id={`${uid}-drop`}>
              <path ref={dropRef} d="" />
            </clipPath>
            <clipPath id={`${uid}-spread`}>
              <circle ref={spreadRef} r="0" />
            </clipPath>
            <radialGradient
              id={`${uid}-rim`}
              cx="0.5"
              cy="0.5"
              r="0.5"
              fx="0.42"
              fy="0.38"
            >
              <stop
                offset="0"
                stopColor="oklch(0.15 0.02 250)"
                stopOpacity="0"
              />
              <stop
                offset="0.68"
                stopColor="oklch(0.15 0.02 250)"
                stopOpacity="0"
              />
              <stop
                offset="0.9"
                stopColor="oklch(0.15 0.02 250)"
                stopOpacity={r2(0.12 + 0.3 * power)}
              />
              <stop
                offset="1"
                stopColor="oklch(0.12 0.02 250)"
                stopOpacity={r2(0.25 + 0.45 * power)}
              />
            </radialGradient>
            <radialGradient id={`${uid}-shade`}>
              <stop
                offset="0"
                stopColor="oklch(0.12 0.02 250)"
                stopOpacity="0.34"
              />
              <stop
                offset="1"
                stopColor="oklch(0.12 0.02 250)"
                stopOpacity="0"
              />
            </radialGradient>
            <radialGradient id={`${uid}-caustic`}>
              <stop
                offset="0"
                stopColor="oklch(1 0.02 90)"
                stopOpacity={r2(0.35 + 0.4 * power)}
              />
              <stop offset="1" stopColor="oklch(1 0.02 90)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-shine`}>
              <stop offset="0" stopColor="oklch(1 0 0)" stopOpacity="0.9" />
              <stop offset="1" stopColor="oklch(1 0 0)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0.25" stopColor="oklch(1 0 0)" stopOpacity="0" />
              <stop offset="0.45" stopColor="oklch(1 0 0)" stopOpacity="0.16" />
              <stop offset="0.6" stopColor="oklch(1 0 0)" stopOpacity="0.04" />
              <stop offset="0.75" stopColor="oklch(1 0 0)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <g>{picture(shown, "base")}</g>
          <path
            ref={trailRef}
            d=""
            fill="none"
            stroke="oklch(0.2 0.03 240)"
            strokeOpacity="0.07"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g ref={dropGroupRef} opacity="0">
            <ellipse ref={shadowRef} fill={`url(#${uid}-shade)`} />
            <ellipse ref={causticRef} fill={`url(#${uid}-caustic)`} />
            <g clipPath={`url(#${uid}-drop)`}>
              <g ref={lensRef}>
                {target >= 0 ? picture(target, "lens") : null}
              </g>
            </g>
            <path ref={rimRef} d="" fill={`url(#${uid}-rim)`} />
            <path
              ref={edgeRef}
              d=""
              fill="none"
              stroke="oklch(1 0 0)"
              strokeOpacity="0.4"
              strokeWidth="1"
            />
            <ellipse ref={shineRef} fill={`url(#${uid}-shine)`} />
          </g>
          <g ref={spreadGroupRef} opacity="0" clipPath={`url(#${uid}-spread)`}>
            {target >= 0 ? picture(target, "spread") : null}
          </g>
          <circle
            ref={ringOuterRef}
            r="0"
            fill="none"
            stroke="oklch(0.15 0.02 250)"
            strokeOpacity="0.28"
            strokeWidth="4"
            opacity="0"
          />
          <circle
            ref={ringRef}
            r="0"
            fill="none"
            stroke="oklch(1 0 0)"
            strokeOpacity="0.6"
            strokeWidth="1.5"
            opacity="0"
          />
          {Array.from({ length: BEADS }, (_, i) => (
            <circle
              key={i}
              ref={(node) => {
                beadRefs.current[i] = node;
              }}
              r="0"
              fill="oklch(1 0 0)"
              fillOpacity="0.55"
              stroke="oklch(0.15 0.02 250)"
              strokeOpacity="0.3"
              strokeWidth="0.8"
            />
          ))}
          <rect
            ref={sheenRef}
            width={W}
            height={H}
            fill={`url(#${uid}-sheen)`}
            opacity="0"
          />
        </svg>

        {captions || indicators ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 px-3 pt-8 pb-2"
            style={{
              backgroundImage:
                "linear-gradient(to top, oklch(0.15 0.02 250 / 0.5), transparent)",
            }}
          >
            {captions ? (
              <span
                className="grid min-w-0 flex-1 text-xs font-medium"
                style={{ color: ON_PICTURE }}
              >
                {items.map((it, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="truncate transition-opacity duration-200 [grid-area:1/1]"
                    style={{ opacity: i === shown ? 1 : 0 }}
                    title={i === shown ? it.caption : undefined}
                  >
                    {it.caption ?? ""}
                  </span>
                ))}
              </span>
            ) : (
              <span />
            )}
            {indicators && n > 1 ? (
              <span className="pointer-events-auto flex shrink-0 items-center">
                {items.map((it, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    aria-label={`Show ${i + 1} of ${n}${it.caption ? `: ${it.caption}` : ""}`}
                    aria-current={i === shown ? "true" : undefined}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => swapTo(i)}
                    className="flex size-6 items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid"
                  >
                    <span
                      aria-hidden
                      className="block size-1.5 rounded-full transition-[opacity,transform] duration-200"
                      style={{
                        backgroundColor: ON_PICTURE,
                        opacity: i === shown ? 1 : 0.5,
                        transform: i === shown ? "scale(1.35)" : "none",
                      }}
                    />
                  </button>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="sr-only">
        {items.map((it, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}`}
            aria-hidden={i !== shown}
          >
            {it.alt}
            {it.caption ? ` ${it.caption}.` : ""}
          </div>
        ))}
      </div>
      <span id={hintId} className="sr-only">
        Arrow keys roll a drop to the next or previous picture; Home and End go
        to the first and last.
      </span>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
