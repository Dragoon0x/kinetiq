"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type CelluloidFrame = {
  /** A picture for the frame. Without one, `art` or a drawn still is used. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** Printed on the film's edge beside the frame number. Defaults to `alt`. */
  caption?: string;
  /** Your own art for the frame (fills its box). */
  art?: React.ReactNode;
};

export type CelluloidCoilProps = {
  /** The pictures, one per frame along the strip. @default defaultCelluloidFrames */
  items?: CelluloidFrame[];
  /** Controlled: the frame in the gate (0 is the first). */
  value?: number;
  /** Initial frame in the gate when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, wheel, key or click that brought a new frame to the gate. */
  onValueChange?: (index: number) => void;
  /** How much the strip rolls about its own length between loops, 0 to 1. @default 0.4 */
  twist?: number;
  /** Film between one picture and the next, px. @default 14 */
  frameGap?: number;
  /** Grain, dust and vignette on the pictures, 0 to 1; the grain shimmers only while the strip moves. @default 0.35 */
  grain?: number;
  /** How loose the coil is: 0 winds it tight and close, 1 wide with open space between the turns. @default 0.6 */
  loop?: number;
  /** How far the camera looks down on the coil, degrees (-30 to 30). @default 8 */
  tilt?: number;
  /** Frame width over height. @default 1.5 */
  aspect?: number;
  /** The film stock printed along the edge. @default "WAYLIGHT 400" */
  stock?: string;
  /** The film base colour. @default a warm near-black that reads in both themes */
  stripColor?: string;
  /** Distance of the eye from the strip, px: smaller is a wider lens. @default 1000 */
  perspective?: number;
  /** The wheel travels the strip once the visitor has rested on it or tabbed in, and lets the page scroll at either end. @default true */
  wheel?: boolean;
  /** Height of the stage, px. @default 520 */
  height?: number;
  /** The strip's accessible name. @default "Film strip" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- constants ------------------------------- */

/** Leader film past each end of the reel, in frames. */
const LEADER = 2;
/** Turns of the coil either side of the gate that are drawn at all. */
const TURNS = 1.3;
/** The strip is pulled flat within these distances of the gate, in frames. */
const GATE_IN = 0.3;
const GATE_OUT = 1.25;
const HOVER_INTENT_MS = 350;
const WHEEL_BURST_MS = 220;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** A number for a transform string: rounded, and never "-0". */
const n3 = (v: number) => {
  const r = r3(v);
  return r === 0 ? 0 : r;
};

const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

/** A tile of film grain: fractal noise, grey, drawn once by the browser. */
const GRAIN_TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 1.6 -0.3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")";

/* ------------------------------ vector bits ------------------------------ */

type V = { x: number; y: number; z: number };
const v = (): V => ({ x: 0, y: 0, z: 0 });
const norm = (a: V) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  a.x /= l;
  a.y /= l;
  a.z /= l;
};

/** Scratch shared by every draw: nothing is allocated per frame. */
type Scratch = { a: V; e: V; m: V; b: V; bm: V; ex: V; ey: V; ez: V };

const scratch = (): Scratch => ({
  a: v(),
  e: v(),
  m: v(),
  b: v(),
  bm: v(),
  ex: v(),
  ey: v(),
  ez: v(),
});

/* ----------------------------------- art --------------------------------- */

function Still({ index, uid }: { index: number; uid: string }) {
  const m = ((index % 10) + 10) % 10;
  const g = `${uid}-s${index}`;
  const sky = (top: string, bottom: string) => (
    <defs>
      <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: top }} />
        <stop offset="1" style={{ stopColor: bottom }} />
      </linearGradient>
    </defs>
  );
  const common = {
    viewBox: "0 0 150 100",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
    "aria-hidden": true,
  } as const;
  const fill = { fill: `url(#${g})` };
  switch (m) {
    case 0:
      return (
        <svg {...common}>
          {sky(pig("--accent", 0.3, 0.06), pig("--accent", 0.46, 0.07, -30))}
          <rect width="150" height="100" style={fill} />
          <rect
            y="62"
            width="150"
            height="38"
            style={{ fill: pig("--accent", 0.24, 0.05) }}
          />
          {[22, 48, 81, 112, 134].map((x, i) => (
            <g key={x}>
              <rect
                x={x}
                y={38 + (i % 2) * 6}
                width="2"
                height={24 - (i % 2) * 6}
                style={{ fill: pig("--accent", 0.18, 0.03) }}
              />
              <circle
                cx={x + 1}
                cy={37 + (i % 2) * 6}
                r="2.6"
                style={{ fill: pig("--warn", 0.9, 0.12) }}
              />
              <rect
                x={x - 1}
                y={66}
                width="4"
                height={18 + i * 2}
                rx="2"
                style={{ fill: pig("--warn", 0.8, 0.12) }}
                opacity={0.45}
              />
            </g>
          ))}
          <path
            d="M0 62 h150"
            style={{ stroke: pig("--warn", 0.75, 0.08) }}
            strokeWidth="0.6"
            opacity={0.6}
          />
        </svg>
      );
    case 1:
      return (
        <svg {...common}>
          {sky(pig("--warn", 0.86, 0.06, -20), pig("--warn", 0.78, 0.09, -35))}
          <rect width="150" height="100" style={fill} />
          <path
            d="M0 58 L150 52 V100 H0 Z"
            style={{ fill: pig("--warn", 0.68, 0.09, -15) }}
          />
          <path
            d="M70 100 L76 56 L80 56 L104 100 Z"
            style={{ fill: pig("--warn", 0.42, 0.03, -15) }}
          />
          <path
            d="M77 60 v6 M78 72 v8 M80 88 v10"
            style={{ stroke: pig("--warn", 0.92, 0.04) }}
            strokeWidth="1"
          />
          <circle
            cx="112"
            cy="30"
            r="9"
            style={{ fill: pig("--warn", 0.95, 0.06) }}
          />
        </svg>
      );
    case 2:
      return (
        <svg {...common}>
          {sky(pig("--danger", 0.82, 0.05, 20), pig("--warn", 0.9, 0.06))}
          <rect width="150" height="100" style={fill} />
          {[0, 1, 2].map((k) => (
            <path
              key={k}
              d={`M0 ${70 - k * 12} L${20 + k * 8} ${46 - k * 10} L${46 + k * 6} ${64 - k * 12} L${80 + k * 4} ${40 - k * 8} L${118 - k * 4} ${60 - k * 10} L150 ${44 - k * 6} V100 H0 Z`}
              style={{ fill: pig("--success", 0.32 + k * 0.1, 0.05) }}
              opacity={r2(0.95 - k * 0.2)}
            />
          ))}
          <circle
            cx="40"
            cy="26"
            r="7"
            style={{ fill: pig("--danger", 0.88, 0.06, 20) }}
          />
        </svg>
      );
    case 3:
      return (
        <svg {...common}>
          <rect
            width="150"
            height="100"
            style={{ fill: pig("--success", 0.88, 0.04) }}
          />
          {Array.from({ length: 7 }, (_, k) => (
            <path
              key={k}
              d={`M${k * 25} 0 V100`}
              style={{ stroke: pig("--success", 0.5, 0.05) }}
              strokeWidth="1.4"
            />
          ))}
          <path
            d="M0 30 H150 M0 64 H150"
            style={{ stroke: pig("--success", 0.5, 0.05) }}
            strokeWidth="1.4"
          />
          {[
            [30, 80, 14],
            [62, 76, 18],
            [104, 82, 12],
            [126, 74, 16],
          ].map(([x, y, r]) => (
            <circle
              key={x}
              cx={x}
              cy={y}
              r={r}
              style={{ fill: pig("--success", 0.55, 0.12) }}
              opacity={0.85}
            />
          ))}
        </svg>
      );
    case 4:
      return (
        <svg {...common}>
          {sky(pig("--accent", 0.22, 0.05), pig("--accent", 0.32, 0.06))}
          <rect width="150" height="100" style={fill} />
          <rect
            y="70"
            width="150"
            height="30"
            style={{ fill: pig("--accent", 0.17, 0.04) }}
          />
          <path
            d="M40 66 h70 l-8 8 h-54 z"
            style={{ fill: pig("--accent", 0.6, 0.03) }}
          />
          <rect
            x="58"
            y="54"
            width="34"
            height="12"
            rx="1"
            style={{ fill: pig("--accent", 0.7, 0.03) }}
          />
          {[62, 70, 78, 86].map((x) => (
            <rect
              key={x}
              x={x}
              y="57"
              width="4"
              height="4"
              style={{ fill: pig("--warn", 0.88, 0.12) }}
            />
          ))}
          <path
            d="M44 78 h62"
            style={{ stroke: pig("--warn", 0.8, 0.1) }}
            strokeWidth="1"
            opacity={0.4}
          />
        </svg>
      );
    case 5:
      return (
        <svg {...common}>
          <rect
            width="150"
            height="100"
            style={{ fill: pig("--accent", 0.86, 0.01) }}
          />
          <rect
            x="70"
            y="30"
            width="10"
            height="56"
            style={{ fill: pig("--accent", 0.96, 0.005) }}
          />
          <path
            d="M68 30 h14 l-2 -8 h-10 z"
            style={{ fill: pig("--danger", 0.6, 0.12) }}
          />
          <path
            d="M75 26 L10 10 L10 34 Z"
            style={{ fill: pig("--warn", 0.97, 0.03) }}
            opacity={0.5}
          />
          <rect
            y="86"
            width="150"
            height="14"
            style={{ fill: pig("--accent", 0.72, 0.015) }}
          />
          <rect
            width="150"
            height="100"
            style={{ fill: pig("--accent", 0.95, 0.005) }}
            opacity={0.35}
          />
        </svg>
      );
    case 6:
      return (
        <svg {...common}>
          {sky(pig("--accent", 0.72, 0.03), pig("--accent", 0.82, 0.02))}
          <rect width="150" height="100" style={fill} />
          {Array.from({ length: 6 }, (_, k) => (
            <ellipse
              key={k}
              cx={14 + k * 26}
              cy="70"
              rx="12"
              ry="16"
              style={{ fill: pig("--success", 0.45, 0.07) }}
            />
          ))}
          {Array.from({ length: 24 }, (_, k) => (
            <path
              key={k}
              d={`M${(k * 37) % 150} ${(k * 23) % 60} l-3 9`}
              style={{ stroke: pig("--accent", 0.95, 0.01) }}
              strokeWidth="0.6"
              opacity={0.7}
            />
          ))}
          <rect
            y="84"
            width="150"
            height="16"
            style={{ fill: pig("--success", 0.36, 0.05) }}
          />
        </svg>
      );
    case 7:
      return (
        <svg {...common}>
          <rect
            width="150"
            height="100"
            style={{ fill: pig("--warn", 0.3, 0.03) }}
          />
          {[0, 1, 2, 3, 4].map((k) => (
            <path
              key={k}
              d={`M${k * 32 - 4} 20 h30 l-4 18 h-22 z`}
              style={{
                fill:
                  k % 2
                    ? pig("--danger", 0.62, 0.13)
                    : pig("--warn", 0.88, 0.05),
              }}
            />
          ))}
          {[0, 1, 2, 3, 4].map((k) => (
            <circle
              key={k}
              cx={k * 32 + 11}
              cy="58"
              r="5"
              style={{ fill: pig("--warn", 0.85, 0.12) }}
              opacity={0.8}
            />
          ))}
          <rect
            y="74"
            width="150"
            height="26"
            style={{ fill: pig("--warn", 0.22, 0.03) }}
          />
        </svg>
      );
    case 8:
      return (
        <svg {...common}>
          {sky(pig("--warn", 0.82, 0.05), pig("--danger", 0.7, 0.09, 10))}
          <rect width="150" height="100" style={fill} />
          <path
            d="M0 76 H150"
            style={{ stroke: pig("--warn", 0.3, 0.03) }}
            strokeWidth="2"
          />
          <path
            d="M0 64 H150"
            style={{ stroke: pig("--warn", 0.3, 0.03) }}
            strokeWidth="0.8"
          />
          {[16, 52, 88, 124].map((x) => (
            <path
              key={x}
              d={`M${x} 64 v12 M${x - 6} 64 h12`}
              style={{ stroke: pig("--warn", 0.3, 0.03) }}
              strokeWidth="1"
            />
          ))}
          <rect
            x="34"
            y="66"
            width="46"
            height="10"
            rx="2"
            style={{ fill: pig("--accent", 0.45, 0.07) }}
          />
          <rect
            x="38"
            y="68"
            width="38"
            height="3"
            style={{ fill: pig("--warn", 0.9, 0.08) }}
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          {sky(pig("--accent", 0.9, 0.02), pig("--accent", 0.97, 0.008))}
          <rect width="150" height="100" style={fill} />
          <path
            d="M0 60 C40 52 80 66 150 56 V100 H0 Z"
            style={{ fill: pig("--accent", 0.98, 0.004) }}
          />
          {[24, 40, 58, 92, 110].map((x, i) => (
            <path
              key={x}
              d={`M${x} ${58 - (i % 2) * 2} l5 -18 l5 18 z`}
              style={{ fill: pig("--success", 0.38, 0.04) }}
            />
          ))}
          <path
            d="M70 100 C76 80 84 70 96 62"
            fill="none"
            style={{ stroke: pig("--accent", 0.8, 0.02) }}
            strokeWidth="1.2"
          />
        </svg>
      );
  }
}

export const defaultCelluloidFrames: CelluloidFrame[] = [
  {
    alt: "Harbour lamps reflected in still water at night",
    caption: "Harbour lamps",
  },
  { alt: "A straight salt road running to a low sun", caption: "Salt road" },
  { alt: "Pine ridges layered in the dawn haze", caption: "Ridge at dawn" },
  { alt: "A glasshouse of round green plants", caption: "Glasshouse" },
  { alt: "The night ferry with its windows lit", caption: "Night ferry" },
  { alt: "A lighthouse standing in fog", caption: "Fog light" },
  { alt: "An orchard in fine rain", caption: "Orchard rain" },
  {
    alt: "Striped market awnings and hanging lamps",
    caption: "Market awnings",
  },
  { alt: "A tram on its wires against an orange sky", caption: "Last tram" },
  { alt: "Firs on a snow field under a pale sky", caption: "Snow field" },
];

/* -------------------------------- the reel ------------------------------- */

type Segment = {
  /** Frame index; negative or past the end for leader film. */
  index: number;
  transform: MotionValue<string>;
  opacity: MotionValue<number>;
  shade: MotionValue<number>;
  /** Haze toward the stage's own colour: the far side of the coil. */
  fog: MotionValue<number>;
  visibility: MotionValue<string>;
};

type Layout = {
  w: number;
  h: number;
  fw: number;
  fh: number;
  /** Segment length (frame + gap) and height (frame + two margins). */
  len: number;
  sh: number;
  margin: number;
  gap: number;
};

function layoutOf(
  width: number,
  height: number,
  aspect: number,
  gap: number,
): Layout {
  const w = Math.max(220, Math.round(width));
  const h = Math.max(200, Math.round(height));
  const a = clamp(aspect, 0.6, 2.4);
  // Frames stay small against the coil, so a turn holds eight or nine of
  // them and the neighbours are only gently turned away.
  let fw = clamp(Math.round(w * 0.31), 132, 230);
  let fh = Math.round(fw / a);
  const maxH = Math.round(h * 0.3);
  if (fh > maxH) {
    fh = maxH;
    fw = Math.round(fh * a);
  }
  const margin = Math.max(14, Math.round(fh * 0.22));
  const g = clamp(Math.round(gap), 0, 60);
  return { w, h, fw, fh, len: fw + g, sh: fh + 2 * margin, margin, gap: g };
}

type Api = {
  draw: () => void;
  wheel: (event: WheelEvent) => void;
};

/**
 * Pictures as frames on one long strip of film — dark base, rounded sprocket
 * holes cut right through it, the frame number, stock and caption printed on
 * the edge — wound in a loose coil through space. Each frame is a 3D plane
 * on the chord between its two ends on the helix, so the strip never tears,
 * and a frame seen round the back shows its picture mirrored, as film does.
 *
 * The camera rides the strip and follows its turns: it stays square to the
 * frame at the gate, so travelling along the strip reads as the coil turning
 * past you like a screw — each frame swings round to face you at the front,
 * is pulled flat there like film through a projector gate, and curls away
 * round the back as it leaves, the turns above and below receding into the
 * haze. On first view the strip arrives straight and winds into its coil on
 * `springs.drift`.
 *
 * Wheel, drag (1:1 at the gate) and flick travel along it; a release projects
 * the throw and settles on the nearest frame on `springs.glide` with the
 * release velocity, rubber-banding at the leader. It is a carousel: Left and
 * Right (or Up and Down) step frame to frame on glide, Page keys step three,
 * Home and End go to the ends, and a click on any frame brings it to the
 * gate. Grain sits on every picture and shimmers only while the strip moves.
 * Under reduced motion the coil is wound from the start and nothing glides:
 * steps and drags land at once, and the grain holds still.
 */
export function CelluloidCoil({
  items = defaultCelluloidFrames,
  value,
  defaultValue = 0,
  onValueChange,
  twist = 0.4,
  frameGap = 14,
  grain = 0.35,
  loop = 0.6,
  tilt = 8,
  aspect = 1.5,
  stock = "WAYLIGHT 400",
  stripColor = "oklch(from var(--warn) 0.2 0.012 h)",
  perspective = 1000,
  wheel = true,
  height = 520,
  label = "Film strip",
  disabled = false,
  className,
}: CelluloidCoilProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const list = items.length > 0 ? items : defaultCelluloidFrames;
  const n = list.length;

  const [width, setWidth] = React.useState(720);
  const lay = React.useMemo(
    () => layoutOf(width, height, aspect, frameGap),
    [width, height, aspect, frameGap],
  );
  const maxS = (n - 1) * lay.len;
  const start = clamp(Math.round(value ?? defaultValue), 0, n - 1);

  /** Travel along the strip, px from the first frame's centre. */
  const travel = useMotionValue(start * lay.len);
  /** 0 is a straight strip (the server's frame), 1 the full coil. */
  const coil = useMotionValue(0);
  const grainX = useMotionValue("0px");
  const grainY = useMotionValue("0px");

  // Each segment starts where the straight strip puts it, so the server's
  // frame is the reel laid flat across the stage; the coil winds in after.
  const segments = React.useMemo<Segment[]>(() => {
    const out: Segment[] = [];
    const s = travel.get();
    for (let i = -LEADER; i < n + LEADER; i += 1) {
      const off = (i * lay.len - s) / lay.len;
      const far = Math.abs(off) * lay.len > lay.w / 2 + lay.len;
      out.push({
        index: i,
        transform: motionValue(`translateX(${r2(off * lay.len)}px)`),
        opacity: motionValue(1),
        shade: motionValue(0),
        fog: motionValue(0),
        visibility: motionValue(far ? "hidden" : "visible"),
      });
    }
    return out;
  }, [n, lay.len, lay.w, travel]);

  const [current, setCurrent] = React.useState(start);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const scr = React.useRef<Scratch | null>(null);
  const settling = React.useRef<AnimationPlaybackControls | null>(null);
  const winding = React.useRef<AnimationPlaybackControls | null>(null);
  const target = React.useRef(start);
  const reported = React.useRef<number | null>(null);
  const currentRef = React.useRef(start);
  const visitor = React.useRef(false);
  const dragFrom = React.useRef(0);
  const wheelTimer = React.useRef<number | null>(null);
  const wound = React.useRef(false);
  const state = React.useRef({
    hovered: false,
    hoverSince: 0,
    focused: false,
    lastWheel: 0,
    wheelTaken: false,
  });

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ geometry ----------------------------- */

  /**
   * Poses every frame for the current travel and coil. The strip is wound
   * round an upright cylinder as a loose helix, and the camera rides it: it
   * stays square to the frame at the gate, so travelling along the strip
   * reads as the coil turning past you like a screw, every frame swinging
   * round to face you at the front and away round the back. All the numbers
   * end as rounded `matrix3d` strings in motion values; nothing is allocated.
   */
  const draw = () => {
    const s3 = scr.current ?? (scr.current = scratch());
    const L = lay.len;
    const k = coil.get();
    const lp = clamp01(loop);
    const rho = L * lerp(1.2, 1.75, lp);
    const pitch = lay.sh * lerp(1.15, 2.05, lp);
    const rise = pitch / (2 * Math.PI);
    const arc = Math.hypot(rho, rise);
    const s = travel.get();
    const tw = clamp01(twist) * k;
    const tau = (clamp(tilt, -30, 30) * Math.PI) / 180;
    const ct = Math.cos(tau);
    const st = Math.sin(tau);

    /** Camera-space point and width direction at arc length `u`. */
    const at = (u: number, p: V, b: V) => {
      const d = (u - s) / arc;
      const cd = Math.cos(d);
      const sd = Math.sin(d);
      // The helix, relative to the point at the gate: round the cylinder
      // and up one pitch a turn.
      let x = rho * sd;
      let y = -rise * d;
      let z = rho * (cd - 1);
      // Its tangent, and the strip's width kept upright and square to it.
      const tx = (rho * cd) / arc;
      const ty = -rise / arc;
      const tz = (-rho * sd) / arc;
      let bx = -ty * tx;
      let by = 1 - ty * ty;
      let bz = -ty * tz;
      const bl = Math.hypot(bx, by, bz) || 1;
      bx /= bl;
      by /= bl;
      bz /= bl;
      const roll = tw * 1.1 * Math.sin((u - s) / (1.7 * L) + 0.6);
      if (roll !== 0) {
        // Rodrigues about the tangent: B·cos + (T × B)·sin.
        const qx = ty * bz - tz * by;
        const qy = tz * bx - tx * bz;
        const qz = tx * by - ty * bx;
        const cr = Math.cos(roll);
        const sr = Math.sin(roll);
        bx = bx * cr + qx * sr;
        by = by * cr + qy * sr;
        bz = bz * cr + qz * sr;
      }
      // The camera looks down on the coil by `tilt`.
      const y2 = y * ct + z * st;
      z = -y * st + z * ct;
      y = y2;
      const by2 = by * ct + bz * st;
      bz = -by * st + bz * ct;
      by = by2;
      // Before the coil winds (and near the gate) the strip is a flat line.
      const w = Math.max(
        1 - k,
        1 - smooth(GATE_IN * L, GATE_OUT * L, Math.abs(u - s)),
      );
      x = lerp(x, u - s, w);
      p.x = x;
      p.y = lerp(y, 0, w);
      p.z = lerp(z, 0, w);
      b.x = lerp(bx, 0, w);
      b.y = lerp(by, 1, w);
      b.z = lerp(bz, 0, w);
      norm(b);
    };

    const span = TURNS * 2 * Math.PI * arc;
    for (const seg of segments) {
      const u = seg.index * L;
      const off = Math.abs(u - s);
      if (off > span) {
        seg.visibility.set("hidden");
        continue;
      }
      at(u - L / 2, s3.a, s3.bm);
      at(u + L / 2, s3.e, s3.bm);
      at(u, s3.m, s3.b);
      const ex = s3.ex;
      ex.x = s3.e.x - s3.a.x;
      ex.y = s3.e.y - s3.a.y;
      ex.z = s3.e.z - s3.a.z;
      const chord = Math.hypot(ex.x, ex.y, ex.z) || 1;
      norm(ex);
      const ey = s3.ey;
      const dot = s3.b.x * ex.x + s3.b.y * ex.y + s3.b.z * ex.z;
      ey.x = s3.b.x - dot * ex.x;
      ey.y = s3.b.y - dot * ex.y;
      ey.z = s3.b.z - dot * ex.z;
      norm(ey);
      const ez = s3.ez;
      ez.x = ex.y * ey.z - ex.z * ey.y;
      ez.y = ex.z * ey.x - ex.x * ey.z;
      ez.z = ex.x * ey.y - ex.y * ey.x;
      const px = (s3.a.x + s3.e.x) / 2;
      const py = (s3.a.y + s3.e.y) / 2;
      const pz = (s3.a.z + s3.e.z) / 2;
      const sx = chord / L;
      seg.visibility.set("visible");
      seg.transform.set(
        `matrix3d(${n3(ex.x * sx)},${n3(ex.y * sx)},${n3(ex.z * sx)},0,${n3(ey.x)},${n3(ey.y)},${n3(ey.z)},0,${n3(ez.x)},${n3(ez.y)},${n3(ez.z)},0,${n3(px)},${n3(py)},${n3(pz)},1)`,
      );
      // The far side of the coil sits back in the haze; the last turn drawn
      // fades out rather than ending.
      seg.fog.set(r3(0.6 * smooth(0, 2 * rho, -pz)));
      // The leader trails off, so the reel's ends fade rather than stop.
      const lead =
        seg.index < 0
          ? (LEADER + 1 + seg.index) / (LEADER + 1)
          : seg.index >= n
            ? (LEADER + n - seg.index) / (LEADER + 1)
            : 1;
      seg.opacity.set(r3(clamp01((span - off) / L) * lead));
      // Frames turned away from the light read darker.
      seg.shade.set(r3(0.55 * (1 - Math.abs(ez.z)) * k));
    }

    if (motionSafe) {
      // Grain shimmers by travel, so it is still when the strip is.
      const step = Math.floor(s / 7);
      grainX.set(`${((step * 37) % 140) - 70}px`);
      grainY.set(`${((step * 61) % 140) - 70}px`);
    }

    const idx = clamp(Math.round(s / L), 0, n - 1);
    if (idx !== currentRef.current) {
      currentRef.current = idx;
      setCurrent(idx);
      reported.current = idx;
      onValueChange?.(idx);
      if (visitor.current) {
        say(
          `Frame ${idx + 1} of ${n}: ${list[idx]?.caption ?? list[idx]?.alt ?? ""}.`,
        );
      }
    }
  };

  /* ------------------------------- motion ------------------------------ */

  const halt = () => {
    settling.current?.stop();
    settling.current = null;
  };

  const settleTo = (index: number, velocity = 0) => {
    halt();
    const i = clamp(index, 0, n - 1);
    target.current = i;
    const to = i * lay.len;
    if (!motionSafe) {
      travel.jump(to);
      visitor.current = false;
      return;
    }
    settling.current = animate(travel, to, {
      ...springs.glide,
      velocity,
      onComplete: () => {
        settling.current = null;
        visitor.current = false;
      },
    });
  };

  const step = (delta: number) => {
    visitor.current = true;
    const from = settling.current
      ? target.current
      : Math.round(travel.get() / lay.len);
    settleTo(from + delta);
  };

  const takeWheel = (event: WheelEvent) => {
    const k = state.current;
    const now = performance.now();
    if (now - k.lastWheel > WHEEL_BURST_MS) {
      // A gesture is only ours if the visitor had settled on the strip; a
      // page scrolling past underneath is never caught.
      k.wheelTaken =
        wheel &&
        !disabled &&
        (k.focused || (k.hovered && now - k.hoverSince > HOVER_INTENT_MS));
    }
    k.lastWheel = now;
    if (!k.wheelTaken) return;
    const { x: wx, y: wy } = wheelPixels(event);
    const delta = Math.abs(wy) >= Math.abs(wx) ? wy : wx;
    const s = travel.get();
    // At either end the page gets its scroll back.
    if ((delta < 0 && s <= 0.5) || (delta > 0 && s >= maxS - 0.5)) return;
    event.preventDefault();
    halt();
    visitor.current = true;
    travel.set(clamp(s + delta * 0.9, 0, maxS));
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      wheelTimer.current = null;
      settleTo(Math.round(travel.get() / lay.len));
    }, 140);
  };

  React.useEffect(() => {
    api.current = { draw, wheel: takeWheel };
  });

  /* ------------------------------ effects ------------------------------ */

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0) setWidth(Math.round(box.width));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Re-pose on every change of travel or coil, and whenever the layout or a
  // shape prop changes.
  React.useEffect(() => {
    const redraw = () => api.current?.draw();
    const a = travel.on("change", redraw);
    const b = coil.on("change", redraw);
    return () => {
      a();
      b();
    };
  }, [travel, coil]);

  React.useEffect(() => {
    // Keep the gate on the same frame when the frame size changes.
    if (!settling.current) travel.jump(currentRef.current * lay.len);
    api.current?.draw();
  }, [lay, twist, loop, tilt, segments, travel]);

  // The strip winds into its coil the first time it is seen. A re-run of
  // this effect (StrictMode) carries the winding on to the end.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    if (!motionSafe) {
      winding.current?.stop();
      coil.jump(1);
      wound.current = true;
      return;
    }
    if (wound.current) {
      if (coil.get() < 1) winding.current = animate(coil, 1, springs.drift);
      return () => winding.current?.stop();
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      wound.current = true;
      winding.current = animate(coil, 1, springs.drift);
    });
    io.observe(node);
    return () => {
      io.disconnect();
      winding.current?.stop();
    };
  }, [motionSafe, coil]);

  // A host that moves `value` gets the same glide a key would.
  React.useEffect(() => {
    if (value === undefined) return;
    const k = clamp(Math.round(value), 0, n - 1);
    if (k === reported.current || k === currentRef.current) return;
    reported.current = k;
    settling.current?.stop();
    target.current = k;
    if (!motionSafe) travel.jump(k * lay.len);
    else settling.current = animate(travel, k * lay.len, springs.glide);
  }, [value, n, travel, motionSafe, lay.len]);

  React.useEffect(() => {
    const node = viewRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => api.current?.wheel(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  React.useEffect(
    () => () => {
      settling.current?.stop();
      settling.current = null;
      winding.current?.stop();
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
      wheelTimer.current = null;
    },
    [],
  );

  /* ------------------------------ gestures ----------------------------- */

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      halt();
      visitor.current = true;
      dragFrom.current = travel.get();
    },
    onMove: ({ offset }) => {
      // 1:1 at the gate: the frame under the finger moves with it, and the
      // leader rubber-bands past either end.
      travel.set(rubberClamp(dragFrom.current - offset.x, 0, maxS, lay.len));
    },
    onEnd: ({ velocity }) => {
      const s = travel.get();
      const rest = motionSafe ? project(s, -velocity.x, 0.997) : s;
      settleTo(Math.round(rest / lay.len), motionSafe ? -velocity.x : 0);
    },
    onCancel: () => settleTo(Math.round(travel.get() / lay.len)),
    onTap: (event) => {
      const hit =
        event.target instanceof Element
          ? event.target.closest("[data-frame]")
          : null;
      if (!hit) return;
      const i = Number(hit.getAttribute("data-frame"));
      if (!Number.isFinite(i) || i < 0 || i >= n) return;
      visitor.current = true;
      settleTo(i);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const go = (fn: () => void) => {
      event.preventDefault();
      fn();
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        go(() => step(1));
        break;
      case "ArrowLeft":
      case "ArrowUp":
        go(() => step(-1));
        break;
      case "PageDown":
        go(() => step(3));
        break;
      case "PageUp":
        go(() => step(-3));
        break;
      case "Home":
        go(() => {
          visitor.current = true;
          settleTo(0);
        });
        break;
      case "End":
        go(() => {
          visitor.current = true;
          settleTo(n - 1);
        });
        break;
      default:
        break;
    }
  };

  /* ------------------------------- render ------------------------------ */

  const L = lay.len;
  const holes = Math.max(3, Math.round(L / (lay.margin * 0.95)));
  const holePitch = L / holes;
  const hw = r2(lay.margin * 0.42);
  const hh = r2(lay.margin * 0.36);
  const hy1 = r2(lay.margin * 0.14);
  const hy2 = r2(lay.sh - lay.margin * 0.14 - hh);
  const base = (() => {
    let d = `M0 0 H${r2(L + 1)} V${lay.sh} H0 Z`;
    for (let k = 0; k < holes; k += 1) {
      const x = r2((k + 0.5) * holePitch - hw / 2);
      for (const y of [hy1, hy2]) {
        d += ` M${x} ${y} h${hw} v${hh} h${-hw} Z`;
      }
    }
    return d;
  })();
  const printSize = Math.max(6, Math.round(lay.margin * 0.36));
  const printTop = r2(hy1 + hh + 1);
  const printBottom = r2(lay.sh - lay.margin + 2);
  const grainOpacity = r3(clamp01(grain) * 0.55);
  const ink = "oklch(from var(--warn) 0.84 0.09 h)";
  const caption = (i: number) => list[i]?.caption ?? list[i]?.alt ?? "";
  const pad = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={() => {
        state.current.hovered = true;
        state.current.hoverSince = performance.now();
      }}
      onPointerLeave={() => {
        state.current.hovered = false;
      }}
      onFocus={(event) => {
        state.current.focused = event.target.matches(":focus-visible");
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          state.current.focused = false;
        }
      }}
      className={cn(
        "relative w-full overflow-clip rounded-4 border border-hairline bg-surface-1 [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ height: lay.h }}
    >
      <p id={hintId} className="sr-only">
        Left and Right step from frame to frame, Page Up and Page Down by three,
        Home and End go to the ends of the reel.
      </p>
      <div
        ref={viewRef}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-describedby={hintId}
        aria-label={`${label}: frame ${current + 1} of ${n}, ${caption(current)}`}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "absolute inset-0 touch-pan-y rounded-4 outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{ perspective: clamp(perspective, 300, 4000) }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 60% at 50% 50%, color-mix(in oklab, var(--foreground) 5%, transparent), transparent 75%)",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 size-0 [transform-style:preserve-3d]"
          style={
            {
              "--coil-grain-x": grainX,
              "--coil-grain-y": grainY,
            } as unknown as React.CSSProperties
          }
        >
          {segments.map((seg) => {
            const i = seg.index;
            const real = i >= 0 && i < n;
            const item = real ? list[i] : undefined;
            const isCurrent = i === current;
            return (
              <motion.div
                key={i}
                data-frame={real ? i : undefined}
                role={real ? "group" : undefined}
                aria-roledescription={real ? "slide" : undefined}
                aria-label={
                  real ? `Frame ${i + 1} of ${n}: ${caption(i)}` : undefined
                }
                aria-hidden={!real || !isCurrent || undefined}
                className="absolute"
                style={{
                  left: r2(-L / 2),
                  top: r2(-lay.sh / 2),
                  width: r2(L + 1),
                  height: lay.sh,
                  transform: seg.transform,
                  opacity: seg.opacity,
                  visibility: seg.visibility,
                  transformOrigin: "50% 50%",
                }}
              >
                <svg
                  aria-hidden
                  className="absolute inset-0 block"
                  width={r2(L + 1)}
                  height={lay.sh}
                  viewBox={`0 0 ${r2(L + 1)} ${lay.sh}`}
                >
                  <path
                    d={base}
                    fillRule="evenodd"
                    style={{
                      // Leader is clear base: the same film, thinner.
                      fill: real
                        ? stripColor
                        : `color-mix(in oklab, ${stripColor} 55%, transparent)`,
                    }}
                  />
                  <path
                    d={`M0 0.5 H${r2(L + 1)} M0 ${r2(lay.sh - 0.5)} H${r2(L + 1)}`}
                    style={{ stroke: "oklch(from var(--warn) 0.42 0.025 h)" }}
                    strokeWidth="1"
                  />
                  <text
                    x={r2(lay.gap / 2 + 4)}
                    y={r2(printTop + printSize * 0.9)}
                    fontSize={printSize}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    letterSpacing="0.08em"
                    style={{ fill: ink }}
                    opacity={0.78}
                  >
                    {real
                      ? `▸ ${pad(i)}   ${stock}`
                      : i < 0
                        ? "▸ START   LEADER"
                        : "▸ END   LEADER"}
                  </text>
                  {real ? (
                    <text
                      x={r2(lay.gap / 2 + 4)}
                      y={r2(printBottom + printSize * 0.9)}
                      fontSize={printSize}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      letterSpacing="0.08em"
                      style={{ fill: ink }}
                      opacity={0.62}
                    >
                      {`${pad(i)}A  ${caption(i).toUpperCase()}`}
                    </text>
                  ) : null}
                </svg>
                {item ? (
                  <div
                    className="absolute overflow-hidden rounded-[3px]"
                    style={{
                      left: r2(lay.gap / 2 + 0.5),
                      top: lay.margin,
                      width: lay.fw,
                      height: lay.fh,
                    }}
                  >
                    {item.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.src}
                        alt={item.alt}
                        draggable={false}
                        className="block size-full object-cover"
                      />
                    ) : (
                      <div
                        role="img"
                        aria-label={item.alt}
                        className="size-full"
                      >
                        {item.art ?? <Still index={i} uid={uid} />}
                      </div>
                    )}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 mix-blend-overlay"
                      style={{
                        opacity: grainOpacity,
                        backgroundImage: GRAIN_TILE,
                        backgroundPosition:
                          "var(--coil-grain-x, 0px) var(--coil-grain-y, 0px)",
                      }}
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        opacity: r3(clamp01(grain)),
                        background:
                          "radial-gradient(120% 100% at 50% 50%, transparent 55%, color-mix(in oklab, black 38%, transparent))",
                      }}
                    />
                    {grain > 0.05 ? (
                      <svg
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        width="100%"
                        height="100%"
                        opacity={r3(clamp01(grain) * 0.9)}
                      >
                        {Array.from(
                          { length: 2 + Math.round(grain * 5) },
                          (_, d) => {
                            const h = ((i + 3) * 2654435761 + d * 40503) >>> 0;
                            return (
                              <circle
                                key={d}
                                cx={h % 97}
                                cy={(h >>> 8) % 97}
                                r={r2(0.4 + ((h >>> 16) % 7) / 10)}
                                style={{
                                  fill:
                                    d % 3 === 0
                                      ? "oklch(0.15 0 0)"
                                      : "oklch(0.97 0 0)",
                                }}
                              />
                            );
                          },
                        )}
                        {(i * 7) % 5 === 0 ? (
                          <path
                            d={`M${20 + ((i * 13) % 60)} 0 v100`}
                            style={{ stroke: "oklch(0.97 0 0)" }}
                            strokeWidth="0.3"
                            opacity={0.5}
                          />
                        ) : null}
                      </svg>
                    ) : null}
                  </div>
                ) : null}
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-black"
                  style={{ opacity: seg.shade }}
                />
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-surface-1"
                  style={{ opacity: seg.fog }}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
