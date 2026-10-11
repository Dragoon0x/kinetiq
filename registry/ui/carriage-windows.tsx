"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CarriageWindowsItem = {
  /** An image URL. Without one, a view is drawn in code. */
  src?: string;
  /** What the view shows. */
  alt: string;
  /** A short name for the window's plate. */
  caption?: string;
};

export type CarriageLivery = "green" | "maroon" | "navy" | "cream";

export type CarriageWindowsProps = {
  /** The views, one per window. @default six drawn views along a coast line */
  items?: CarriageWindowsItem[];
  /** The window at the centre (controlled). */
  value?: number;
  /** The window at the centre to begin with. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, flick, click or key that brought a new window to the centre. */
  onValueChange?: (index: number) => void;
  /** How far behind the views seem, 0 (painted on the glass) to 1 (far away). @default 0.55 */
  parallax?: number;
  /** The panel between windows, in px. @default 22 */
  gap?: number;
  /** The windows' corner radius, in px. @default 14 */
  radius?: number;
  /** Window width in px. @default fitted to the height, at most 72 % of the box */
  windowWidth?: number;
  /** The carriage's paint. @default "green" */
  livery?: CarriageLivery;
  /** How soon a flick runs down, 0 (coasts far) to 1 (stops short). @default 0.5 */
  friction?: number;
  /** Small name plates under the windows. @default true */
  captions?: boolean;
  /** A soft clack as the wheels cross each rail joint, after a visitor's drag, flick or key. @default false */
  sound?: boolean;
  /** The carousel's accessible name. @default "Carriage windows" */
  label?: string;
  /** No moving. @default false */
  disabled?: boolean;
  /** Sizes the carriage; it fills its parent by default. */
  className?: string;
};

export const defaultCarriageItems: CarriageWindowsItem[] = [
  { alt: "Cliffs and a lighthouse over a calm sea", caption: "Coast" },
  { alt: "A stone viaduct crossing a green valley", caption: "Viaduct" },
  { alt: "Pine forest below blue mountains at dawn", caption: "Pine valley" },
  { alt: "Golden wheat under a wide sky", caption: "Wheat plain" },
  { alt: "Small houses on the shore of a still lake", caption: "Lake town" },
  { alt: "Lamps and signals in a rail yard at night", caption: "Night yard" },
];

/** Pigments at fixed lightness, so the paint is the same in either theme. */
const LIVERY: Record<
  CarriageLivery,
  { body: string; band: string; lining: string; roof: string }
> = {
  green: {
    body: "oklch(from var(--success) 0.36 0.06 calc(h + 8))",
    band: "oklch(from var(--warn) 0.9 0.04 h)",
    lining: "oklch(from var(--warn) 0.76 0.1 calc(h - 4))",
    roof: "oklch(from var(--accent) 0.24 0.012 h)",
  },
  maroon: {
    body: "oklch(from var(--danger) 0.34 0.09 calc(h + 2))",
    band: "oklch(from var(--warn) 0.9 0.04 h)",
    lining: "oklch(from var(--warn) 0.76 0.1 calc(h - 4))",
    roof: "oklch(from var(--accent) 0.24 0.012 h)",
  },
  navy: {
    body: "oklch(from var(--accent) 0.3 0.08 h)",
    band: "oklch(from var(--warn) 0.9 0.035 h)",
    lining: "oklch(from var(--warn) 0.78 0.1 h)",
    roof: "oklch(from var(--accent) 0.22 0.012 h)",
  },
  cream: {
    body: "oklch(from var(--warn) 0.88 0.04 calc(h + 4))",
    band: "oklch(from var(--success) 0.38 0.05 calc(h + 8))",
    lining: "oklch(from var(--danger) 0.42 0.08 h)",
    roof: "oklch(from var(--accent) 0.26 0.012 h)",
  },
};

/** Rail joints along the track, in px. */
const JOINT = 96;
const SOUND_GAP = 45;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Words as they sit inside a sentence: no full stop of their own to double. */
const bare = (text: string) => text.trim().replace(/[.!?]+$/, "");

type Geo = {
  w: number;
  h: number;
  bodyTop: number;
  bodyH: number;
  bandTop: number;
  bandH: number;
  winTop: number;
  winW: number;
  winH: number;
  pitch: number;
  pad: number;
  length: number;
  wheelR: number;
  railY: number;
  /** Window centres in carriage px, and the wheels'. */
  centres: number[];
  wheels: number[];
};

function geometryOf(
  w: number,
  h: number,
  n: number,
  gap: number,
  windowWidth: number | undefined,
): Geo {
  const wheelR = Math.round(clamp(h * 0.05, 6, 13));
  const railY = h - Math.round(clamp(h * 0.05, 6, 12));
  const bodyTop = Math.round(clamp(h * 0.07, 8, 28));
  const bodyBottom = railY - wheelR * 2 - 5;
  const bodyH = bodyBottom - bodyTop;
  const winH = Math.round(bodyH * 0.52);
  const winTop = Math.round(bodyTop + bodyH * 0.17);
  const winW = Math.round(
    clamp(windowWidth ?? winH * 1.45, 60, Math.max(60, w * 0.72)),
  );
  const g = Math.round(clamp(gap, 4, 80));
  const pitch = winW + g;
  const pad = Math.round(g * 0.5 + 34);
  const length = pad * 2 + n * winW + (n - 1) * g;
  const centres = Array.from({ length: n }, (_, i) =>
    r2(pad + i * pitch + winW / 2),
  );
  const bogie = (c: number) => [r2(c - wheelR * 1.45), r2(c + wheelR * 1.45)];
  const wheels = [
    ...bogie(length * 0.12),
    ...bogie(length * 0.88),
    ...(n > 3 ? bogie(length * 0.5) : []),
  ];
  return {
    w,
    h,
    bodyTop,
    bodyH,
    bandTop: winTop - 6,
    bandH: winH + 12,
    winTop,
    winW,
    winH,
    pitch,
    pad,
    length,
    wheelR,
    railY,
    centres,
    wheels,
  };
}

/** Where the carriage stands with window i at the centre. */
const restFor = (g: Geo, i: number) => r2(g.w / 2 - (g.centres[i] ?? 0));

const sky = (top: string, low: string) => [top, low] as const;

/** A view drawn in code, 400 × 100, cropped to fill its layer. */
function ViewArt({ index, uid }: { index: number; uid: string }) {
  const id = `${uid}-v${index}`;
  const kind = index % 6;
  const skies = [
    sky(
      "oklch(from var(--accent) 0.72 0.07 calc(h - 30))",
      "oklch(from var(--warn) 0.95 0.03 h)",
    ),
    sky(
      "oklch(from var(--accent) 0.78 0.05 calc(h - 40))",
      "oklch(from var(--warn) 0.93 0.05 calc(h - 10))",
    ),
    sky(
      "oklch(from var(--accent) 0.6 0.08 calc(h - 20))",
      "oklch(from var(--danger) 0.86 0.05 calc(h + 10))",
    ),
    sky(
      "oklch(from var(--accent) 0.74 0.08 calc(h - 36))",
      "oklch(from var(--accent) 0.94 0.02 calc(h - 36))",
    ),
    sky(
      "oklch(from var(--danger) 0.74 0.06 calc(h + 20))",
      "oklch(from var(--warn) 0.92 0.06 calc(h - 14))",
    ),
    sky(
      "oklch(from var(--accent) 0.16 0.04 h)",
      "oklch(from var(--accent) 0.3 0.06 calc(h + 20))",
    ),
  ] as const;
  const [top, low] = skies[kind] ?? skies[0];
  const f = (c: string) => ({ fill: c });
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 100"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: top }} />
          <stop offset="1" style={{ stopColor: low }} />
        </linearGradient>
      </defs>
      <rect width="400" height="100" fill={`url(#${id}-sky)`} />
      {kind === 0 ? (
        <g>
          <circle
            cx="300"
            cy="24"
            r="9"
            style={f("oklch(from var(--warn) 0.97 0.04 h)")}
          />
          <path
            d="M 230 60 Q 290 50 400 56 V 100 H 230 Z"
            style={f("oklch(from var(--accent) 0.62 0.05 calc(h - 30))")}
          />
          <rect
            y="60"
            width="400"
            height="40"
            style={f("oklch(from var(--accent) 0.5 0.09 calc(h - 26))")}
          />
          <path
            d="M 0 38 Q 50 34 92 42 L 120 60 L 150 100 H 0 Z"
            style={f("oklch(from var(--success) 0.42 0.07 calc(h - 30))")}
          />
          <path
            d="M 92 42 L 120 60 L 150 100 H 112 L 96 62 Z"
            style={f("oklch(from var(--warn) 0.56 0.05 calc(h - 30))")}
          />
          <rect
            x="58"
            y="16"
            width="7"
            height="22"
            style={f("oklch(from var(--warn) 0.96 0.02 h)")}
          />
          <rect
            x="58"
            y="22"
            width="7"
            height="4"
            style={f("oklch(from var(--danger) 0.55 0.15 h)")}
          />
          <rect
            x="56"
            y="12"
            width="11"
            height="5"
            rx="1"
            style={f("oklch(from var(--accent) 0.3 0.02 h)")}
          />
          <path
            d="M 170 74 H 260 M 190 82 H 300 M 160 90 H 230"
            strokeWidth="1"
            style={{
              stroke: "oklch(from var(--accent) 0.8 0.04 calc(h - 26))",
            }}
          />
        </g>
      ) : kind === 1 ? (
        <g>
          <path
            d="M 0 52 Q 80 36 170 48 T 400 44 V 100 H 0 Z"
            style={f("oklch(from var(--success) 0.62 0.06 calc(h - 20))")}
          />
          <path
            d="M 0 74 Q 120 60 230 72 T 400 70 V 100 H 0 Z"
            style={f("oklch(from var(--success) 0.48 0.08 calc(h - 26))")}
          />
          <rect
            x="0"
            y="40"
            width="400"
            height="7"
            style={f("oklch(from var(--warn) 0.62 0.03 calc(h + 10))")}
          />
          {Array.from({ length: 9 }, (_, i) => {
            const l = i * 46 - 10;
            const r = l + 38;
            return (
              <path
                key={i}
                d={`M ${l} 47 H ${r} V 96 H ${r - 5} V 64 A 14 13 0 0 0 ${l + 5} 64 V 96 H ${l} Z`}
                style={f("oklch(from var(--warn) 0.58 0.035 calc(h + 10))")}
              />
            );
          })}
          <path
            d="M 0 96 Q 200 90 400 96 V 100 H 0 Z"
            style={f("oklch(from var(--accent) 0.6 0.06 calc(h - 20))")}
          />
        </g>
      ) : kind === 2 ? (
        <g>
          <path
            d="M 0 58 L 60 26 L 110 50 L 170 18 L 240 54 L 300 30 L 400 58 V 100 H 0 Z"
            style={f("oklch(from var(--accent) 0.52 0.07 calc(h - 10))")}
          />
          <path
            d="M 170 18 L 182 25 L 176 27 L 168 24 L 160 23 Z"
            style={f("oklch(from var(--warn) 0.97 0.02 h)")}
          />
          {Array.from({ length: 34 }, (_, i) => {
            const x = i * 12 + (i % 3) * 3;
            const t = 60 - (i % 4) * 5;
            return (
              <path
                key={i}
                d={`M ${x} ${t} L ${x + 6} 86 H ${x - 6} Z`}
                style={f(
                  i % 2
                    ? "oklch(from var(--success) 0.3 0.06 calc(h + 10))"
                    : "oklch(from var(--success) 0.36 0.07 calc(h + 4))",
                )}
              />
            );
          })}
          <rect
            y="84"
            width="400"
            height="16"
            style={f("oklch(from var(--success) 0.24 0.05 calc(h + 10))")}
          />
        </g>
      ) : kind === 3 ? (
        <g>
          <ellipse
            cx="90"
            cy="22"
            rx="34"
            ry="7"
            style={f("oklch(from var(--warn) 0.98 0.01 h)")}
          />
          <ellipse
            cx="260"
            cy="16"
            rx="46"
            ry="6"
            style={f("oklch(from var(--warn) 0.98 0.01 h)")}
            opacity="0.8"
          />
          <rect
            y="58"
            width="400"
            height="42"
            style={f("oklch(from var(--warn) 0.78 0.12 calc(h - 6))")}
          />
          <path
            d="M 0 58 Q 200 52 400 58 V 64 H 0 Z"
            style={f("oklch(from var(--warn) 0.66 0.1 calc(h - 12))")}
          />
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d={`M 0 ${66 + i * 3} Q 200 ${62 + i * 3.4} 400 ${66 + i * 3}`}
              fill="none"
              strokeWidth="0.6"
              style={{
                stroke: "oklch(from var(--warn) 0.62 0.1 calc(h - 12))",
              }}
            />
          ))}
          <rect
            x="318"
            y="38"
            width="3"
            height="22"
            style={f("oklch(from var(--warn) 0.3 0.04 calc(h - 20))")}
          />
          <circle
            cx="320"
            cy="34"
            r="12"
            style={f("oklch(from var(--success) 0.36 0.07 calc(h + 4))")}
          />
        </g>
      ) : kind === 4 ? (
        <g>
          <circle
            cx="110"
            cy="40"
            r="10"
            style={f("oklch(from var(--warn) 0.96 0.05 h)")}
          />
          <path
            d="M 0 52 Q 100 40 200 50 T 400 48 V 58 H 0 Z"
            style={f("oklch(from var(--accent) 0.5 0.05 calc(h + 30))")}
          />
          <rect
            y="58"
            width="400"
            height="42"
            style={f("oklch(from var(--accent) 0.6 0.06 calc(h - 24))")}
          />
          {Array.from({ length: 8 }, (_, i) => {
            const x = 150 + i * 26;
            const hh = 8 + (i % 3) * 3;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={58 - hh}
                  width="16"
                  height={hh}
                  style={f(
                    i % 2
                      ? "oklch(from var(--warn) 0.92 0.03 h)"
                      : "oklch(from var(--danger) 0.66 0.08 calc(h + 4))",
                  )}
                />
                <path
                  d={`M ${x - 2} ${58 - hh} L ${x + 8} ${50 - hh} L ${x + 18} ${58 - hh} Z`}
                  style={f("oklch(from var(--danger) 0.42 0.08 h)")}
                />
                <rect
                  x={x}
                  y="59"
                  width="16"
                  height={r2(hh * 0.8)}
                  opacity="0.35"
                  style={f(
                    i % 2
                      ? "oklch(from var(--warn) 0.92 0.03 h)"
                      : "oklch(from var(--danger) 0.66 0.08 calc(h + 4))",
                  )}
                />
              </g>
            );
          })}
          <path
            d="M 110 62 V 98"
            strokeWidth="5"
            opacity="0.4"
            style={{ stroke: "oklch(from var(--warn) 0.96 0.05 h)" }}
          />
        </g>
      ) : (
        <g>
          <circle
            cx="330"
            cy="20"
            r="7"
            style={f("oklch(from var(--warn) 0.95 0.03 h)")}
          />
          {[40, 120, 210, 290].map((x, i) => (
            <circle
              key={i}
              cx={x + 6}
              cy={14 + (i % 2) * 9}
              r="0.9"
              style={f("oklch(from var(--warn) 0.95 0.02 h)")}
            />
          ))}
          <path
            d="M 0 70 H 400 V 100 H 0 Z"
            style={f("oklch(from var(--accent) 0.2 0.03 h)")}
          />
          <path
            d="M 0 100 L 170 70 M 60 100 L 190 70 M 340 100 L 210 70 M 400 100 L 230 70"
            strokeWidth="1.2"
            style={{ stroke: "oklch(from var(--accent) 0.5 0.02 h)" }}
          />
          {[70, 200, 330].map((x, i) => (
            <g key={i}>
              <circle
                cx={x}
                cy="40"
                r="18"
                opacity="0.32"
                style={f("oklch(from var(--warn) 0.86 0.12 calc(h - 6))")}
              />
              <rect
                x={x - 1}
                y="40"
                width="2"
                height="32"
                style={f("oklch(from var(--accent) 0.36 0.02 h)")}
              />
              <circle
                cx={x}
                cy="40"
                r="3"
                style={f("oklch(from var(--warn) 0.95 0.08 h)")}
              />
            </g>
          ))}
          <circle
            cx="262"
            cy="56"
            r="2.4"
            style={f("oklch(from var(--success) 0.76 0.16 h)")}
          />
          <circle
            cx="148"
            cy="58"
            r="2.4"
            style={f("oklch(from var(--danger) 0.62 0.2 h)")}
          />
        </g>
      )}
    </svg>
  );
}

function CarriageWindow({
  item,
  index,
  count,
  g,
  x,
  shift,
  maxOff,
  glare,
  radius,
  current,
  caption,
  plate,
  uid,
}: {
  item: CarriageWindowsItem;
  index: number;
  count: number;
  g: Geo;
  x: MotionValue<number>;
  shift: number;
  maxOff: number;
  glare: MotionValue<number>;
  radius: number;
  current: boolean;
  caption: boolean;
  plate: string;
  uid: string;
}) {
  const centre = g.centres[index] ?? 0;
  const left = r2(centre - g.winW / 2);
  // The view slides at (1 − shift) of the carriage's speed: its offset in
  // the window is the window's distance from the middle times the shift.
  const viewX = useTransform(x, (v) =>
    r2(clamp(-(v + centre - g.w / 2) * shift, -maxOff, maxOff) - maxOff),
  );
  const name = item.caption ?? item.alt;
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}: ${bare(name)}`}
      aria-current={current || undefined}
      data-window={index}
      className="absolute"
      style={{ left, top: g.winTop, width: g.winW, height: g.winH }}
    >
      <div
        role="img"
        aria-label={item.alt}
        className="absolute inset-0 overflow-hidden"
        style={{
          borderRadius: radius,
          boxShadow:
            "inset 0 0 0 3px color-mix(in oklab, black 70%, transparent), inset 0 6px 10px -4px color-mix(in oklab, black 55%, transparent)",
        }}
      >
        <motion.div
          aria-hidden
          className="absolute top-0 h-full"
          style={{ left: 0, width: r2(g.winW + maxOff * 2), x: viewX }}
        >
          {item.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.src}
              alt=""
              draggable={false}
              className="size-full object-cover"
            />
          ) : (
            <ViewArt index={index} uid={uid} />
          )}
        </motion.div>
        {/* The glass: a reflection that slides against the carriage's
            motion, and the seal's inner shadow above the view. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-[200%]"
          style={{
            x: glare,
            backgroundImage:
              "linear-gradient(105deg, transparent 38%, color-mix(in oklab, white 22%, transparent) 44%, transparent 47%, transparent 52%, color-mix(in oklab, white 12%, transparent) 54%, transparent 57%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: radius,
            boxShadow:
              "inset 0 0 0 3px color-mix(in oklab, black 70%, transparent), inset 0 0 0 4px color-mix(in oklab, white 14%, transparent)",
          }}
        />
      </div>
      {caption ? (
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 truncate font-mono text-[9px] tracking-[0.12em] uppercase"
          style={{ top: g.winH + 12, maxWidth: g.winW, color: plate }}
          title={name}
        >
          {name}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A carousel built as the side of a railway carriage seen from the platform:
 * a painted body with a cream window band, a row of rounded windows each
 * holding a view, and wheelsets on a rail. Dragging moves the carriage 1:1
 * under the finger while each view slides more slowly behind its glass — its
 * offset is the window's distance from the middle times `parallax` — so
 * every window has depth, and the glass's reflection slides the other way
 * with the speed.
 *
 * A flick is projected to where it would come to rest and the carriage runs
 * to the nearest window on the springs.glide constants seeded with the
 * release velocity, coasting and seating without a bounce. Rail joints lie
 * every 96 px along the track: each time a wheel rolls over one the body
 * dips a pixel and recovers on the recoil spring, and with `sound` a soft
 * clack plays, so a fast flick clatters and an arrival gives one last clack.
 *
 * It is a labelled carousel with one tab stop: arrow keys step a window,
 * Home and End go to the ends, and a click brings a window to the middle.
 * Under reduced motion a release or key moves the carriage on a short tween
 * with no jolt, no wheel spin and no sliding reflection.
 */
export function CarriageWindows({
  items,
  value,
  defaultValue = 0,
  onValueChange,
  parallax = 0.55,
  gap = 22,
  radius = 14,
  windowWidth,
  livery = "green",
  friction = 0.5,
  captions = true,
  sound = false,
  label = "Carriage windows",
  disabled = false,
  className,
}: CarriageWindowsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const list = items && items.length > 0 ? items : defaultCarriageItems;
  const n = list.length;
  const paint = LIVERY[livery] ?? LIVERY.green;

  const controlled = value !== undefined;
  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, n - 1),
  );
  const current = clamp(Math.round(controlled ? value : own), 0, n - 1);

  const [box, setBox] = React.useState({ w: 720, h: 208 });
  const g = React.useMemo(
    () => geometryOf(box.w, box.h, n, gap, windowWidth),
    [box.w, box.h, n, gap, windowWidth],
  );
  const p = clamp(parallax, 0, 1);
  const shift = r2(p * 0.35);
  const maxOff = Math.ceil((g.w / 2 + g.winW / 2) * shift) + 2;
  const r = clamp(radius, 0, Math.min(g.winW, g.winH) / 2);

  const x = useMotionValue(restFor(g, current));
  const bob = useMotionValue(0);
  const velocity = useVelocity(x);
  const safeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    safeRef.current = motionSafe;
  });
  const wheelR = g.wheelR;
  const glare = useTransform(velocity, (v) =>
    safeRef.current ? r2(clamp(-v * 0.03, -48, 48)) : 0,
  );
  const spin = useTransform(x, (v) =>
    safeRef.current ? r2(((v / wheelR) * (180 / Math.PI)) % 360) : 0,
  );

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const bobRun = React.useRef<AnimationPlaybackControls | null>(null);
  const shown = React.useRef(current);
  const byVisitor = React.useRef(false);
  const grabbed = React.useRef(0);
  const joints = React.useRef<number[]>([]);
  const lastClack = React.useRef(0);

  const latest = React.useRef({ g, motionSafe, audio, n });
  React.useEffect(() => {
    latest.current = { g, motionSafe, audio, n };
  });

  const nearest = (pos: number) => {
    const target = g.w / 2 - pos;
    return clamp(Math.round((target - g.pad - g.winW / 2) / g.pitch), 0, n - 1);
  };

  const halt = () => {
    run.current?.stop();
    run.current = null;
  };

  const say = (index: number) => {
    const item = list[index];
    setSaid((s) => ({
      n: s.n + 1,
      text: `Window ${index + 1} of ${n}, ${bare(item?.caption ?? item?.alt ?? "")}.`,
    }));
  };

  const commit = (index: number) => {
    const next = clamp(index, 0, n - 1);
    if (next === current) return;
    if (!controlled) setOwn(next);
    shown.current = next;
    onValueChange?.(next);
    say(next);
  };

  /** Runs the carriage to window i, from the speed it has. */
  const runTo = (index: number, v: number, visitor: boolean) => {
    halt();
    byVisitor.current = visitor;
    const target = restFor(g, clamp(index, 0, n - 1));
    if (!motionSafe) {
      run.current = animate(x, target, {
        duration: durations.fast,
        ease: easings.enter,
      });
      return;
    }
    const c = animate(x, target, {
      ...springs.glide,
      velocity: v,
      restDelta: 0.1,
      onComplete: () => {
        if (run.current !== c) return;
        run.current = null;
        // The last clack, as the wheels seat.
        if (byVisitor.current) {
          audio.play("clack", { pitch: 0.8, gain: 0.32 });
        }
        byVisitor.current = false;
      },
    });
    run.current = c;
  };

  const step = (delta: number) => {
    if (disabled) return;
    const next = clamp(current + delta, 0, n - 1);
    commit(next);
    runTo(next, velocity.get(), true);
  };

  // The wheels cross the joints: a jolt for the body and, for a visitor's
  // own run, a clack.
  useMotionValueEvent(x, "change", (v) => {
    const l = latest.current;
    const wheels = l.g.wheels;
    if (joints.current.length !== wheels.length) {
      joints.current = wheels.map((wx) => Math.floor((v + wx) / JOINT));
      return;
    }
    let crossed = -1;
    for (let i = 0; i < wheels.length; i += 1) {
      const j = Math.floor((v + (wheels[i] ?? 0)) / JOINT);
      if (j !== joints.current[i]) {
        joints.current[i] = j;
        const wx = (wheels[i] ?? 0) + v;
        if (wx > -40 && wx < l.g.w + 40) crossed = i;
      }
    }
    if (crossed < 0) return;
    const speed = Math.abs(velocity.get());
    if (l.motionSafe && speed > 30) {
      bobRun.current?.stop();
      bobRun.current = animate(bob, 0, {
        ...springs.recoil,
        velocity: clamp(bob.getVelocity() + 18 + speed * 0.012, 0, 60),
      });
    }
    if (!byVisitor.current) return;
    const now = performance.now();
    if (now - lastClack.current < SOUND_GAP) return;
    lastClack.current = now;
    const wheelX = (wheels[crossed] ?? 0) + v;
    const rect = rootRef.current?.getBoundingClientRect();
    l.audio.play("clack", {
      pitch: r2(
        (crossed % 2 ? 1.06 : 0.94) *
          lerp(0.92, 1.1, clamp(speed / 1600, 0, 1)),
      ),
      gain: r2(lerp(0.2, 0.55, clamp(speed / 1400, 0, 1))),
      pan: rect ? panFrom(rect.left + wheelX, rootRef.current) : 0,
    });
  });

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      halt();
      byVisitor.current = true;
      grabbed.current = x.get();
    },
    onMove: ({ offset }) => {
      const lo = restFor(g, n - 1);
      const hi = restFor(g, 0);
      x.set(r2(rubberClamp(grabbed.current + offset.x, lo, hi, g.w * 0.5)));
    },
    onEnd: ({ velocity: v }) => {
      const rate = lerp(0.998, 0.99, clamp(friction, 0, 1));
      const rest = project(x.get(), v.x, rate);
      const index = nearest(rest);
      commit(index);
      runTo(index, v.x, true);
    },
    onCancel: () => {
      const index = nearest(x.get());
      commit(index);
      runTo(index, 0, false);
    },
    onTap: (event) => {
      const el = (event.target as Element | null)?.closest?.("[data-window]");
      const index = el ? Number(el.getAttribute("data-window")) : NaN;
      if (!Number.isFinite(index) || index === current) return;
      commit(index);
      runTo(index, 0, true);
    },
  });

  const api = React.useRef({ runTo });
  React.useEffect(() => {
    api.current = { runTo };
  });

  // A host that changes `value` gets the same run a key would, silently.
  React.useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    api.current.runTo(current, 0, false);
  }, [current]);

  // New geometry re-seats the carriage on the window at the centre.
  React.useEffect(() => {
    run.current?.stop();
    run.current = null;
    x.jump(restFor(g, shown.current));
    joints.current = [];
  }, [g, x]);

  React.useEffect(
    () => () => {
      run.current?.stop();
      bobRun.current?.stop();
    },
    [],
  );

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const w = Math.round(node.clientWidth);
        const h = Math.round(node.clientHeight);
        if (w < 1 || h < 1) return;
        setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [setBox],
  );

  const bodyBottom = g.bodyTop + g.bodyH;

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onKeyDown={(event) => {
        if (disabled) return;
        const k = event.key;
        if (k === "ArrowRight" || k === "ArrowDown") {
          event.preventDefault();
          step(1);
        } else if (k === "ArrowLeft" || k === "ArrowUp") {
          event.preventDefault();
          step(-1);
        } else if (k === "Home" || k === "End") {
          event.preventDefault();
          const to = k === "Home" ? 0 : n - 1;
          if (to !== current) {
            commit(to);
            runTo(to, 0, true);
          }
        }
      }}
      {...drag}
      className={cn(
        "group/carriage-windows relative isolate h-full w-full touch-pan-y overflow-clip rounded-3 [contain:paint] select-none",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed opacity-70"
          : "cursor-grab active:cursor-grabbing",
        "bg-surface-2",
        className,
      )}
    >
      {/* The platform's far wall and the rail: fixed to the world. */}
      <div
        aria-hidden
        className="absolute inset-x-0"
        style={{
          top: g.railY,
          height: 3,
          backgroundColor: "oklch(from var(--accent) 0.62 0.01 h)",
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0 ${JOINT - 2}px, oklch(from var(--accent) 0.3 0.01 h) ${JOINT - 2}px ${JOINT}px)`,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{
          top: g.railY + 3,
          backgroundImage:
            "repeating-linear-gradient(90deg, oklch(from var(--warn) 0.36 0.03 calc(h - 20)) 0 5px, transparent 5px 15px)",
        }}
      />
      <motion.div
        className="absolute top-0 left-0 h-full"
        style={{ x, width: g.length }}
      >
        {/* The underframe and the wheels, which do not ride the springs. */}
        <div
          aria-hidden
          className="absolute"
          style={{
            left: 16,
            right: 16,
            top: bodyBottom - 2,
            height: 7,
            backgroundColor: "oklch(from var(--accent) 0.2 0.01 h)",
          }}
        />
        {g.wheels.map((wx, i) => (
          <motion.div
            key={i}
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: r2(wx - g.wheelR),
              top: g.railY - g.wheelR * 2,
              width: g.wheelR * 2,
              height: g.wheelR * 2,
              rotate: spin,
              backgroundImage: `radial-gradient(circle, oklch(from var(--accent) 0.6 0.01 h) 0 18%, transparent 19%), repeating-conic-gradient(oklch(from var(--accent) 0.32 0.01 h) 0deg 20deg, oklch(from var(--accent) 0.18 0.01 h) 20deg 60deg)`,
              boxShadow: "inset 0 0 0 2px oklch(from var(--accent) 0.5 0.01 h)",
            }}
          />
        ))}
        {/* The body, on its springs. */}
        <motion.div
          className="absolute inset-x-0"
          style={{ top: g.bodyTop, height: g.bodyH, y: bob }}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              borderRadius: `${Math.round(g.bodyH * 0.16)}px ${Math.round(g.bodyH * 0.16)}px 6px 6px`,
              backgroundColor: paint.body,
              backgroundImage: `linear-gradient(to bottom, ${paint.roof} 0 ${Math.round(g.bodyH * 0.08)}px, transparent ${Math.round(g.bodyH * 0.08)}px), linear-gradient(to bottom, color-mix(in oklab, white 8%, transparent), transparent 40%, color-mix(in oklab, black 14%, transparent))`,
              boxShadow:
                "inset 0 0 0 1px color-mix(in oklab, black 30%, transparent)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0"
            style={{
              top: g.bandTop - g.bodyTop,
              height: g.bandH,
              backgroundColor: paint.band,
            }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0"
            style={{
              top: g.bandTop - g.bodyTop + g.bandH + 3,
              height: 2,
              backgroundColor: paint.lining,
            }}
          />
          {/* Panel seams below the gaps between windows. */}
          {g.centres.slice(1).map((c, i) => (
            <div
              key={i}
              aria-hidden
              className="absolute w-px"
              style={{
                left: r2(c - g.pitch / 2),
                top: g.bandTop - g.bodyTop + g.bandH + 8,
                bottom: 4,
                backgroundColor: "color-mix(in oklab, black 22%, transparent)",
              }}
            />
          ))}
          {/* The doors at either end. */}
          {[g.pad * 0.28, g.length - g.pad * 0.28 - g.pad * 0.44].map(
            (left, i) => (
              <div
                key={i}
                aria-hidden
                className="absolute rounded-1"
                style={{
                  left: r2(left),
                  top: Math.round(g.bodyH * 0.12),
                  width: r2(g.pad * 0.44),
                  bottom: 6,
                  boxShadow:
                    "inset 0 0 0 1.5px color-mix(in oklab, black 35%, transparent)",
                }}
              />
            ),
          )}
          <div className="absolute inset-0" style={{ top: -g.bodyTop }}>
            {list.map((item, i) => (
              <CarriageWindow
                key={i}
                item={item}
                index={i}
                count={n}
                g={g}
                x={x}
                shift={shift}
                maxOff={maxOff}
                glare={glare}
                radius={r}
                current={i === current}
                caption={captions}
                plate={paint.lining}
                uid={uid}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
      <p id={hintId} className="sr-only">
        Drag or flick the carriage, or use the arrow keys to move one window at
        a time; Home and End go to the first and last.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
