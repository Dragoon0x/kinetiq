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
import { cn } from "@/registry/lib/utils";

export type PetalItem = {
  /** A picture. Without one, `art` or a drawn garden photograph is used. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** A short title shown when the picture is chosen. Defaults to `alt`. */
  caption?: string;
  /** Your own art (fills a square). */
  art?: React.ReactNode;
  /** The petal's underside colour. Any CSS colour; it is used as a pigment. */
  tint?: string;
};

export type PetalGalleryProps = {
  /** The pictures; the first `petalCount` become petals. @default defaultPetalItems */
  items?: PetalItem[];
  /** Controlled: the chosen picture, or null while the bloom is open. */
  value?: number | null;
  /** Initial choice when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the click, tap or key that chose a picture or opened the bloom. */
  onValueChange?: (index: number | null) => void;
  /** How many petals the bloom has, 5 to 12. @default 9 */
  petalCount?: number;
  /** How full the petals are, how much they cup at rest and how far the bloom swirls as it closes, 0 to 1. @default 0.5 */
  curl?: number;
  /** Pace of the bloom closing and opening, 0.5 (slow, like dusk) to 2. The damping ratio is kept. @default 1 */
  bloomSpeed?: number;
  /** How far the petals fold when the bloom closes, degrees; past 90 they lean over the picture. @default 108 */
  fold?: number;
  /** How far the frame dims while the bloom is closed, 0 to 1. @default 0.35 */
  dusk?: number;
  /** Distance of the eye from the bloom, px. @default 1100 */
  perspective?: number;
  /** The words in the empty heart. @default "Choose a picture" */
  heartLabel?: string;
  /** Height of the frame, px. @default 520 */
  height?: number;
  /** The bloom's accessible name. @default "Pictures" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- constants ------------------------------- */

/** Petal length against the heart's mean radius. */
const PETAL_LENGTH = 1.12;
/** Share of the close a petal waits for, by its distance round the bloom. */
const WAVE = 0.38;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mod = (a: number, n: number) => ((a % n) + n) % n;

const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

/** A spring from the calibration set, run faster or slower with its damping ratio kept. */
const paced = (
  base: { stiffness: number; damping: number; mass: number },
  speed: number,
) => {
  const s = clamp(speed, 0.5, 2);
  return {
    type: "spring" as const,
    stiffness: base.stiffness * s * s,
    damping: base.damping * s,
    mass: base.mass,
  };
};

/* --------------------------------- shapes -------------------------------- */

/**
 * The petal and the oval as the same four cubic segments (top, right,
 * bottom, left), in a unit box, so one can morph into the other point by
 * point. The petal is narrow at its base (bottom) and round at its tip.
 */
type Shape = number[];

function petalShape(full: number): Shape {
  const f = clamp01(full);
  const w = lerp(0.1, 0.0, f);
  const shoulder = lerp(0.42, 0.34, f);
  const reach = lerp(0.22, 0.32, f);
  return [
    0.5,
    0,
    0.5 + reach,
    0,
    1 - w,
    shoulder - 0.2,
    1 - w,
    shoulder,
    1 - w,
    shoulder + 0.28,
    0.5 + 0.14,
    0.88,
    0.5,
    1,
    0.5 - 0.14,
    0.88,
    w,
    shoulder + 0.28,
    w,
    shoulder,
    w,
    shoulder - 0.2,
    0.5 - reach,
    0,
    0.5,
    0,
  ];
}

const OVAL: Shape = [
  0.5, 0, 0.776, 0, 1, 0.224, 1, 0.5, 1, 0.776, 0.776, 1, 0.5, 1, 0.224, 1, 0,
  0.776, 0, 0.5, 0, 0.224, 0.224, 0, 0.5, 0,
];

function shapePath(a: Shape, b: Shape, t: number): string {
  const p = (i: number) => r3(lerp(a[i] ?? 0, b[i] ?? 0, t));
  let d = `M${p(0)} ${p(1)}`;
  for (let s = 0; s < 4; s += 1) {
    const o = 2 + s * 6;
    d += ` C${p(o)} ${p(o + 1)} ${p(o + 2)} ${p(o + 3)} ${p(o + 4)} ${p(o + 5)}`;
  }
  return `${d} Z`;
}

/* ----------------------------------- art --------------------------------- */

function Garden({ index }: { index: number }) {
  const m = mod(index, 12);
  const common = {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
    "aria-hidden": true,
  } as const;
  const bg = (c: string) => (
    <rect width="100" height="100" style={{ fill: c }} />
  );
  switch (m) {
    case 0:
      return (
        <svg {...common}>
          {bg(pig("--success", 0.62, 0.12))}
          {Array.from({ length: 16 }, (_, k) => {
            const x = (k * 37) % 100;
            const y = 18 + ((k * 53) % 80);
            return (
              <g key={k}>
                <path
                  d={`M${x} ${y} v14`}
                  style={{ stroke: pig("--success", 0.4, 0.08) }}
                  strokeWidth="1"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={4 + (k % 3)}
                  style={{ fill: pig("--danger", 0.62, 0.2) }}
                />
                <circle
                  cx={x}
                  cy={y}
                  r="1.2"
                  style={{ fill: pig("--accent", 0.25, 0.05) }}
                />
              </g>
            );
          })}
        </svg>
      );
    case 1:
      return (
        <svg {...common}>
          {bg(pig("--success", 0.3, 0.06))}
          <path
            d="M50 100 C50 70 44 50 56 36 C66 24 80 30 76 42 C72 52 60 48 62 40"
            fill="none"
            style={{ stroke: pig("--success", 0.7, 0.15) }}
            strokeWidth="5"
            strokeLinecap="round"
          />
          {[0, 1, 2, 3, 4].map((k) => (
            <ellipse
              key={k}
              cx={40 - k * 3}
              cy={92 - k * 13}
              rx="10"
              ry="3.4"
              transform={`rotate(${-30 + k * 6} ${40 - k * 3} ${92 - k * 13})`}
              style={{ fill: pig("--success", 0.58, 0.14) }}
            />
          ))}
        </svg>
      );
    case 2:
      return (
        <svg {...common}>
          {bg(pig("--accent", 0.42, 0.09, -60))}
          {[
            [26, 34, 16],
            [70, 30, 12],
            [52, 70, 20],
            [18, 80, 10],
          ].map(([x, y, r]) => (
            <ellipse
              key={x}
              cx={x}
              cy={y}
              rx={r}
              ry={r2((r ?? 10) * 0.7)}
              style={{ fill: pig("--success", 0.6, 0.13) }}
            />
          ))}
          <circle
            cx="56"
            cy="64"
            r="6"
            style={{ fill: pig("--danger", 0.88, 0.07, 20) }}
          />
          <circle
            cx="56"
            cy="64"
            r="2.4"
            style={{ fill: pig("--warn", 0.85, 0.15) }}
          />
        </svg>
      );
    case 3:
      return (
        <svg {...common}>
          {bg(pig("--accent", 0.86, 0.05, -40))}
          <path
            d="M0 80 C30 60 50 66 100 40"
            fill="none"
            style={{ stroke: pig("--warn", 0.35, 0.05, -20) }}
            strokeWidth="4"
          />
          {[
            [24, 68],
            [44, 62],
            [62, 54],
            [80, 46],
            [34, 74],
          ].map(([x, y]) => (
            <g key={x}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse
                  key={a}
                  cx={x}
                  cy={(y ?? 0) - 4}
                  rx="2.6"
                  ry="4.4"
                  transform={`rotate(${a} ${x} ${y})`}
                  style={{ fill: pig("--danger", 0.9, 0.06, 20) }}
                />
              ))}
              <circle
                cx={x}
                cy={y}
                r="1.6"
                style={{ fill: pig("--warn", 0.8, 0.14) }}
              />
            </g>
          ))}
        </svg>
      );
    case 4:
      return (
        <svg {...common}>
          {bg(pig("--accent", 0.82, 0.06, -50))}
          {[20, 50, 80].map((x, k) => (
            <g key={x}>
              <path
                d={`M${x} 100 V${44 + k * 4}`}
                style={{ stroke: pig("--success", 0.45, 0.1) }}
                strokeWidth="2"
              />
              {Array.from({ length: 12 }, (_, j) => (
                <ellipse
                  key={j}
                  cx={x}
                  cy={36 + k * 4}
                  rx="3"
                  ry="9"
                  transform={`rotate(${j * 30} ${x} ${36 + k * 4})`}
                  style={{ fill: pig("--warn", 0.82, 0.16) }}
                />
              ))}
              <circle
                cx={x}
                cy={36 + k * 4}
                r="5"
                style={{ fill: pig("--warn", 0.35, 0.06, -30) }}
              />
            </g>
          ))}
        </svg>
      );
    case 5:
      return (
        <svg {...common}>
          {bg(pig("--success", 0.82, 0.05))}
          {Array.from({ length: 9 }, (_, k) => (
            <g key={k}>
              <path
                d={`M${8 + k * 11} 100 V${40 + (k % 3) * 8}`}
                style={{ stroke: pig("--success", 0.5, 0.08) }}
                strokeWidth="1.2"
              />
              {[0, 1, 2, 3, 4].map((j) => (
                <ellipse
                  key={j}
                  cx={8 + k * 11}
                  cy={36 + (k % 3) * 8 + j * 4}
                  rx="2.4"
                  ry="3"
                  style={{ fill: pig("--accent", 0.6, 0.15, 30) }}
                />
              ))}
            </g>
          ))}
        </svg>
      );
    case 6:
      return (
        <svg {...common}>
          {bg(pig("--success", 0.36, 0.07))}
          {[
            [22, 30, 18],
            [64, 22, 14],
            [44, 66, 24],
            [84, 74, 14],
          ].map(([x, y, r]) => (
            <ellipse
              key={x}
              cx={x}
              cy={y}
              rx={r}
              ry={r2((r ?? 10) * 0.8)}
              style={{ fill: pig("--accent", 0.6, 0.02) }}
            />
          ))}
          {[
            [22, 22, 12],
            [44, 56, 16],
          ].map(([x, y, r]) => (
            <ellipse
              key={x}
              cx={x}
              cy={y}
              rx={r}
              ry={r2((r ?? 10) * 0.5)}
              style={{ fill: pig("--success", 0.6, 0.14) }}
            />
          ))}
        </svg>
      );
    case 7:
      return (
        <svg {...common}>
          {bg(pig("--success", 0.45, 0.11))}
          {[0, 1, 2].map((k) => (
            <path
              key={k}
              d={`M${-10 + k * 40} ${90 - k * 10} C ${20 + k * 30} ${40 - k * 6} ${50 + k * 26} ${44} ${110} ${20 + k * 20}`}
              fill="none"
              style={{ stroke: pig("--success", 0.68, 0.15) }}
              strokeWidth="10"
              opacity={0.8}
            />
          ))}
          {Array.from({ length: 10 }, (_, k) => (
            <circle
              key={k}
              cx={(k * 31) % 100}
              cy={(k * 47) % 100}
              r={r2(1.2 + (k % 3) * 0.6)}
              style={{ fill: pig("--accent", 0.95, 0.02) }}
              opacity={0.85}
            />
          ))}
        </svg>
      );
    case 8:
      return (
        <svg {...common}>
          {bg(pig("--accent", 0.3, 0.05))}
          {Array.from({ length: 18 }, (_, k) => (
            <ellipse
              key={k}
              cx="50"
              cy="32"
              rx="6"
              ry="22"
              transform={`rotate(${k * 20} 50 54)`}
              style={{ fill: pig("--danger", 0.58 + (k % 2) * 0.06, 0.19, 10) }}
            />
          ))}
          <circle
            cx="50"
            cy="54"
            r="9"
            style={{ fill: pig("--warn", 0.75, 0.15) }}
          />
        </svg>
      );
    case 9:
      return (
        <svg {...common}>
          {bg(pig("--warn", 0.86, 0.05))}
          {[24, 48, 74].map((x, k) => (
            <g key={x}>
              <path
                d={`M${x} 100 C ${x - 4} 70 ${x + 4} 50 ${x} ${36 + k * 6}`}
                fill="none"
                style={{ stroke: pig("--warn", 0.5, 0.06, -20) }}
                strokeWidth="1.2"
              />
              {Array.from({ length: 14 }, (_, j) => (
                <path
                  key={j}
                  d={`M${x} ${36 + k * 6} l${(j % 7) * 2 - 6} ${-8 - (j % 3) * 3}`}
                  style={{ stroke: pig("--warn", 0.97, 0.02) }}
                  strokeWidth="0.8"
                />
              ))}
            </g>
          ))}
        </svg>
      );
    case 10:
      return (
        <svg {...common}>
          {bg(pig("--success", 0.55, 0.1))}
          <rect
            x="30"
            y="20"
            width="40"
            height="80"
            style={{ fill: pig("--warn", 0.42, 0.06, -20) }}
          />
          {[0, 1, 2, 3, 4].map((k) => (
            <path
              key={k}
              d={`M${34 + k * 8} 24 V100`}
              style={{ stroke: pig("--warn", 0.6, 0.06, -20) }}
              strokeWidth="2"
            />
          ))}
          <path
            d="M30 20 Q50 4 70 20"
            fill="none"
            style={{ stroke: pig("--warn", 0.42, 0.06, -20) }}
            strokeWidth="3"
          />
          {[10, 86].map((x) => (
            <circle
              key={x}
              cx={x}
              cy="40"
              r="14"
              style={{ fill: pig("--success", 0.4, 0.1) }}
            />
          ))}
        </svg>
      );
    default:
      return (
        <svg {...common}>
          {bg(pig("--accent", 0.88, 0.04, -40))}
          <path
            d="M50 100 V58 M50 70 L34 54 M50 64 L66 48"
            style={{ stroke: pig("--warn", 0.35, 0.05, -20) }}
            strokeWidth="3"
            fill="none"
          />
          <circle
            cx="50"
            cy="40"
            r="26"
            style={{ fill: pig("--success", 0.55, 0.12) }}
          />
          {[
            [40, 34],
            [58, 30],
            [52, 48],
            [36, 50],
            [64, 44],
          ].map(([x, y]) => (
            <path
              key={x}
              d={`M${x} ${y} q 3 -5 6 0 q 1 7 -3 8 q -4 -1 -3 -8`}
              style={{ fill: pig("--success", 0.82, 0.13, -40) }}
            />
          ))}
        </svg>
      );
  }
}

export const defaultPetalItems: PetalItem[] = [
  { alt: "Red poppies across a green field", caption: "Poppy field" },
  { alt: "A fern frond unfurling", caption: "Fiddlehead" },
  { alt: "Lily pads with one pale flower", caption: "Lily pond" },
  { alt: "Apple blossom along a branch", caption: "Apple blossom" },
  { alt: "Three sunflowers against the sky", caption: "Sunflowers" },
  { alt: "Rows of lavender spikes", caption: "Lavender" },
  { alt: "Moss on round grey stones", caption: "Moss stones" },
  { alt: "Raindrops on broad leaves", caption: "After rain" },
  { alt: "A deep red dahlia", caption: "Dahlia" },
  { alt: "Seed heads catching the light", caption: "Seed heads" },
  { alt: "A wooden garden gate between hedges", caption: "Garden gate" },
  { alt: "A pear tree heavy with fruit", caption: "Pear tree" },
];

const TINTS = [
  pig("--danger", 0.86, 0.06, 20),
  pig("--warn", 0.9, 0.06),
  pig("--success", 0.88, 0.05),
  pig("--accent", 0.88, 0.05, -40),
];

/* ---------------------------------- layout ------------------------------- */

type Leaf = {
  /** Base point on the heart's rim, the petal's axis angle (deg) and box. */
  bx: number;
  by: number;
  angle: number;
};

type Geo = {
  w: number;
  h: number;
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  pl: number;
  pw: number;
  leaves: Leaf[];
};

function geometry(
  width: number,
  height: number,
  count: number,
  curl: number,
): Geo {
  const w = Math.max(220, Math.round(width));
  const h = Math.max(240, Math.round(height));
  const a = clamp(w / h, 0.72, 1.45);
  const sa = Math.sqrt(a);
  const r0 = Math.min(
    (w / 2 - 12) / (sa + PETAL_LENGTH),
    (h / 2 - 22) / (1 / sa + PETAL_LENGTH),
  );
  const hx = r0 * sa;
  const hy = r0 / sa;
  const pl = r0 * PETAL_LENGTH;
  // Ramanujan's perimeter, shared out between the petals; fuller petals
  // overlap their neighbours a little more.
  const per =
    Math.PI * (3 * (hx + hy) - Math.sqrt((3 * hx + hy) * (hx + 3 * hy)));
  const pw = Math.min(pl * 0.78, (per / count) * lerp(1.0, 1.4, clamp01(curl)));
  const leaves: Leaf[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const ex = Math.cos(t);
    const ey = Math.sin(t);
    // Out along the oval's normal, from a point just inside its rim.
    const nx = ex / hx;
    const ny = ey / hy;
    leaves.push({
      bx: r2(w / 2 + hx * ex * 0.94),
      by: r2(h / 2 + hy * ey * 0.94),
      angle: r2((Math.atan2(ny, nx) * 180) / Math.PI + 90),
    });
  }
  return { w, h, cx: w / 2, cy: h / 2, hx, hy, pl, pw, leaves };
}

/* --------------------------------- petal --------------------------------- */

type PetalProps = {
  g: Geo;
  leaf: Leaf;
  index: number;
  count: number;
  item: PetalItem;
  picture: React.ReactNode;
  close: MotionValue<number>;
  chosen: number | null;
  active: boolean;
  optionId: string;
  clipId: string;
  outline: string;
  curl: number;
  foldDeg: number;
  motionSafe: boolean;
  onPick: (index: number) => void;
};

/**
 * One petal: its picture on the front, its underside on the back, hinged at
 * its base on the heart's rim. Its fold reads the bloom's one close value
 * through a window that opens later the further round the bloom it sits
 * from the chosen petal, so the closing runs round as a wave.
 */
function Petal({
  g,
  leaf,
  index,
  count,
  item,
  picture,
  close,
  chosen,
  active,
  optionId,
  clipId,
  outline,
  curl,
  foldDeg,
  motionSafe,
  onPick,
}: PetalProps) {
  const lift = useMotionValue(0);
  const liftAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const [hovered, setHovered] = React.useState(false);
  const raised = active || hovered;

  React.useEffect(() => {
    liftAnim.current?.stop();
    if (!motionSafe) {
      lift.jump(raised ? 1 : 0);
      return;
    }
    liftAnim.current = animate(lift, raised ? 1 : 0, springs.flick);
    return () => liftAnim.current?.stop();
  }, [raised, motionSafe, lift]);

  const around =
    chosen === null
      ? 0
      : Math.min(mod(index - chosen, count), mod(chosen - index, count)) /
        Math.max(1, count / 2);
  const local = (c: number) => clamp01((c - WAVE * around) / (1 - WAVE));
  const cup = 20 * clamp01(curl);

  const rotateX = useTransform(
    [close, lift] as MotionValue<number>[],
    ([c, l]) =>
      motionSafe
        ? r2(
            -(
              cup +
              (foldDeg - cup) * local(c as number) +
              9 * (l as number) * (1 - local(c as number))
            ),
          )
        : 0,
  );
  const rotate = useTransform(close, (c) =>
    r2(leaf.angle + (motionSafe ? 26 * clamp01(curl) * local(c) : 0)),
  );
  const rotateY = useTransform(close, (c) =>
    motionSafe ? r2(-16 * clamp01(curl) * local(c)) : 0,
  );
  const scale = useTransform(lift, (l) => r3(1 + 0.04 * l));
  // The chosen petal's picture has gone to the heart: its front fades to the
  // underside. Under reduced motion every petal turns to its underside.
  const frontPicture = useTransform(close, (c) => {
    if (!motionSafe) return r3(1 - clamp01(c));
    return index === chosen ? r3(1 - clamp01(c * 4)) : 1;
  });

  const tint = item.tint
    ? `oklch(from ${item.tint} 0.86 0.06 h)`
    : (TINTS[index % TINTS.length] ?? TINTS[0]);
  const big = Math.ceil(Math.hypot(g.pw, g.pl));

  return (
    <motion.div
      id={optionId}
      role="option"
      aria-selected={chosen === index}
      aria-label={item.caption ?? item.alt}
      data-petal={index}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onClick={() => onPick(index)}
      className="absolute cursor-pointer [transform-style:preserve-3d]"
      style={{
        left: r2(leaf.bx - g.pw / 2),
        top: r2(leaf.by - g.pl),
        width: r2(g.pw),
        height: r2(g.pl),
        rotate,
        rotateX,
        rotateY,
        scale,
        transformOrigin: "50% 100%",
      }}
    >
      {/* Front: the picture, kept upright inside the petal. */}
      <div
        className="absolute inset-0 overflow-hidden [backface-visibility:hidden]"
        style={{ clipPath: `url(#${clipId})`, background: tint }}
      >
        <motion.div
          className="absolute"
          style={{
            left: r2(g.pw / 2 - big / 2),
            top: r2(g.pl / 2 - big / 2),
            width: big,
            height: big,
            rotate: -leaf.angle,
            opacity: frontPicture,
          }}
        >
          {picture}
        </motion.div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, color-mix(in oklab, black 22%, transparent), transparent 40%, color-mix(in oklab, white 12%, transparent))",
          }}
        />
      </div>
      {/* Back: the underside, veined. */}
      <div
        className="absolute inset-0 [backface-visibility:hidden]"
        style={{
          clipPath: `url(#${clipId})`,
          transform: "rotateY(180deg)",
          background: `linear-gradient(to top, color-mix(in oklab, ${tint} 70%, black), ${tint})`,
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <path
            d="M0.5 1 C0.5 0.7 0.5 0.3 0.5 0.06 M0.5 0.6 C0.4 0.5 0.3 0.42 0.22 0.36 M0.5 0.6 C0.6 0.5 0.7 0.42 0.78 0.36"
            fill="none"
            style={{ stroke: "color-mix(in oklab, black 18%, transparent)" }}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      {/* The outline: a hairline, or the ring colour on the active petal. */}
      <svg
        aria-hidden
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full overflow-visible [backface-visibility:hidden]"
      >
        <path
          d={outline}
          fill="none"
          className={active ? "stroke-ring" : "stroke-hairline-strong"}
          strokeWidth={active ? 2 : 1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </motion.div>
  );
}

/* --------------------------------- bloom --------------------------------- */

/**
 * Pictures as petals in an oval bloom around an empty heart. Choosing one
 * closes the bloom like a flower at dusk: the chosen picture leaves its petal
 * and grows into the heart on `springs.glide`, its outline morphing from
 * petal to oval while the picture stays upright, and the other petals fold up
 * toward you about their base hinges and over the picture's rim — a wave that
 * starts beside the chosen petal and runs round both ways, with a swirl set
 * by `curl` — on a `springs.drift` paced by `bloomSpeed`, as the frame dims a
 * little. Escape, or a tap on any folded petal, opens the bloom again on the
 * same springs, the picture shrinking back into its petal.
 *
 * The bloom is a listbox. Arrow keys move round it (Right and Down
 * clockwise), Home and End jump, Enter or Space choose, and Escape opens the
 * bloom; the active petal lifts and takes the ring colour. Under reduced
 * motion nothing folds or travels: the picture cross-fades into the heart and
 * the petals to their undersides, and back.
 */
export function PetalGallery({
  items = defaultPetalItems,
  value,
  defaultValue = null,
  onValueChange,
  petalCount = 9,
  curl = 0.5,
  bloomSpeed = 1,
  fold = 108,
  dusk = 0.35,
  perspective = 1100,
  heartLabel = "Choose a picture",
  height = 520,
  label = "Pictures",
  disabled = false,
  className,
}: PetalGalleryProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `${uid}-petal`;
  const heartClipId = `${uid}-heart`;
  const list = items.length > 0 ? items : defaultPetalItems;
  const [width, setWidth] = React.useState(720);
  const g = React.useMemo(
    () => geometry(width, height, clamp(Math.round(petalCount), 5, 12), curl),
    [width, height, petalCount, curl],
  );
  const count = g.leaves.length;
  const petals = Array.from({ length: count }, (_, i) => i);

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const raw = value === undefined ? own : value;
  const chosen = raw === null ? null : mod(Math.round(raw), count);
  const [active, setActive] = React.useState(chosen ?? 0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  /** The picture in the heart; it stays while the bloom reopens. */
  const [shown, setShown] = React.useState(chosen);
  if (chosen !== null && chosen !== shown) setShown(chosen);

  const close = useMotionValue(chosen === null ? 0 : 1);
  const grow = useMotionValue(chosen === null ? 0 : 1);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const prev = React.useRef(chosen);

  const shape = React.useMemo(() => petalShape(curl), [curl]);
  const petalPath = shapePath(shape, shape, 0);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const caption = (i: number) => list[i]?.caption ?? list[i]?.alt ?? "";

  const picture = (i: number) => {
    const item = list[mod(i, list.length)];
    if (!item) return null;
    return item.src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.src}
        alt=""
        draggable={false}
        className="block size-full object-cover"
      />
    ) : (
      (item.art ?? <Garden index={i} />)
    );
  };

  const commit = (next: number | null) => {
    if (disabled || next === chosen) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    if (next !== null) {
      setActive(next);
      say(`${caption(next)} chosen. Escape opens the bloom.`);
    } else {
      say("Bloom open.");
    }
  };

  // Close or open whenever the choice changes — from a click, a key or the
  // host. The picture in the heart is the new choice (kept while it opens).
  React.useEffect(() => {
    if (prev.current === chosen) return;
    prev.current = chosen;
    for (const a of anims.current) a.stop();
    const on = chosen === null ? 0 : 1;
    if (!motionSafe) {
      const fadeT = { duration: durations.base, ease: easings.enter };
      anims.current = [animate(close, on, fadeT), animate(grow, on, fadeT)];
      return;
    }
    anims.current = [
      animate(grow, on, paced(springs.glide, bloomSpeed)),
      animate(close, on, paced(springs.drift, bloomSpeed)),
    ];
  }, [chosen, motionSafe, bloomSpeed, close, grow]);

  // A re-run (StrictMode) finishes whatever it interrupted.
  React.useEffect(() => {
    const target = prev.current === null ? 0 : 1;
    if (close.get() !== target) {
      anims.current.push(animate(close, target, { duration: durations.fast }));
    }
    if (grow.get() !== target) {
      anims.current.push(animate(grow, target, { duration: durations.fast }));
    }
    return () => {
      for (const a of anims.current) a.stop();
      anims.current = [];
    };
  }, [close, grow]);

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

  /* --------------------------- the heart's flight ------------------------- */

  const from = shown === null ? undefined : g.leaves[mod(shown, count)];
  const fromBox = from
    ? (() => {
        const a = (from.angle * Math.PI) / 180;
        // The petal's centre: half its length out along its axis.
        return {
          x: from.bx + Math.sin(a) * (g.pl / 2),
          y: from.by - Math.cos(a) * (g.pl / 2),
          angle: from.angle,
        };
      })()
    : { x: g.cx, y: g.cy, angle: 0 };
  const flight = (t: number) => (motionSafe ? t : 1);
  const heartW = useTransform(grow, (t) => r2(lerp(g.pw, g.hx * 2, flight(t))));
  const heartH = useTransform(grow, (t) => r2(lerp(g.pl, g.hy * 2, flight(t))));
  const heartX = useTransform(grow, (t) =>
    r2(lerp(fromBox.x, g.cx, flight(t)) - lerp(g.pw, g.hx * 2, flight(t)) / 2),
  );
  const heartY = useTransform(grow, (t) =>
    r2(lerp(fromBox.y, g.cy, flight(t)) - lerp(g.pl, g.hy * 2, flight(t)) / 2),
  );
  const heartTurn = useTransform(grow, (t) =>
    r2(fromBox.angle * (1 - flight(t))),
  );
  const heartCounter = useTransform(heartTurn, (a) => r2(-a));
  // It lifts off its petal (above the cupped tips) and settles just above
  // the heart's plane, under the petals folding over its rim.
  const heartZ = useTransform(grow, (t) =>
    motionSafe ? r2(lerp(44, 2, clamp01(t))) : 2,
  );
  const heartPath = useTransform(grow, (t) =>
    shapePath(shape, OVAL, clamp01(flight(t))),
  );
  const heartOpacity = useTransform(grow, (t) =>
    motionSafe ? (t > 0.002 ? 1 : 0) : r3(clamp01(t)),
  );
  const heartBig = useTransform(
    [heartW, heartH] as MotionValue<number>[],
    ([w, h]) => Math.ceil(Math.hypot(w as number, h as number)),
  );
  const heartInnerX = useTransform(
    [heartW, heartBig] as MotionValue<number>[],
    ([w, b]) => r2(((w as number) - (b as number)) / 2),
  );
  const heartInnerY = useTransform(
    [heartH, heartBig] as MotionValue<number>[],
    ([h, b]) => r2(((h as number) - (b as number)) / 2),
  );
  const closedZoom = clamp(
    0.62 * Math.min(g.w / (2 * g.hx), g.h / (2 * g.hy)),
    1,
    1.45,
  );
  const zoom = useTransform(close, (c) =>
    motionSafe ? r3(lerp(1, closedZoom, clamp01(c))) : 1,
  );
  const duskOpacity = useTransform(close, (c) =>
    r3(clamp01(c) * clamp01(dusk)),
  );
  const emptyOpacity = useTransform(grow, (t) => r3(1 - clamp01(t * 3)));
  const captionOpacity = useTransform(close, (c) =>
    r3(clamp01((c - 0.6) / 0.4)),
  );

  /* -------------------------------- input -------------------------------- */

  const onPick = (i: number) => {
    if (disabled) return;
    setActive(i);
    if (chosen === null) commit(i);
    else commit(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const move = (to: number) => {
      event.preventDefault();
      if (chosen !== null) commit(null);
      setActive(mod(to, count));
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        move(active + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        move(active - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(count - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(chosen === null ? active : null);
        break;
      case "Escape":
        if (chosen === null) return;
        event.preventDefault();
        commit(null);
        break;
      default:
        break;
    }
  };

  const stamens = React.useMemo(
    () =>
      Array.from({ length: 18 }, (_, k) => {
        const t = (k / 18) * Math.PI * 2;
        const rr = 0.5 + 0.08 * ((k * 7) % 3);
        return {
          x: r2(50 + Math.cos(t) * 50 * rr),
          y: r2(50 + Math.sin(t) * 50 * rr),
          r: r2(0.9 + ((k * 5) % 3) * 0.4),
        };
      }),
    [],
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative w-full overflow-clip rounded-4 border border-hairline bg-surface-1 [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ height: g.h }}
    >
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d={petalPath} />
          </clipPath>
          <clipPath id={heartClipId} clipPathUnits="objectBoundingBox">
            <motion.path d={heartPath} />
          </clipPath>
        </defs>
      </svg>

      {/* Dusk: the frame dims round the closed bloom. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: duskOpacity,
          background:
            "radial-gradient(closest-side, transparent 45%, color-mix(in oklab, black 26%, transparent))",
        }}
      />

      {/* The empty heart: a ring of stamens and the invitation. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute flex items-center justify-center"
        style={{
          left: r2(g.cx - g.hx),
          top: r2(g.cy - g.hy),
          width: r2(g.hx * 2),
          height: r2(g.hy * 2),
          opacity: emptyOpacity,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <ellipse
            cx="50"
            cy="50"
            rx="49"
            ry="49"
            className="fill-surface-2 stroke-hairline"
            strokeWidth="0.6"
          />
          {stamens.map((d, k) => (
            <circle
              key={k}
              cx={d.x}
              cy={d.y}
              r={d.r}
              style={{ fill: pig("--warn", 0.78, 0.12) }}
              opacity={0.8}
            />
          ))}
        </svg>
        <span className="relative max-w-[70%] text-center font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase">
          {heartLabel}
        </span>
      </motion.div>

      <div
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-activedescendant={`${uid}-o${active}`}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 rounded-4 outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled && "cursor-not-allowed",
        )}
      >
        {/* The bloom, pushed in a little as it closes so the bud fills the frame. */}
        <motion.div
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={{
            scale: zoom,
            perspective: clamp(perspective, 400, 4000),
            perspectiveOrigin: "50% 50%",
          }}
        >
          {/* The chosen picture, flying from its petal into the heart. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 overflow-hidden"
            style={{
              x: heartX,
              y: heartY,
              z: heartZ,
              width: heartW,
              height: heartH,
              rotate: heartTurn,
              opacity: heartOpacity,
              clipPath: `url(#${heartClipId})`,
            }}
          >
            <motion.div
              className="absolute"
              style={{
                x: heartInnerX,
                y: heartInnerY,
                width: heartBig,
                height: heartBig,
                rotate: heartCounter,
              }}
            >
              {shown === null ? null : picture(shown)}
            </motion.div>
          </motion.div>

          {petals.map((i) => {
            const item = list[mod(i, list.length)];
            const leaf = g.leaves[i];
            if (!item || !leaf) return null;
            return (
              <Petal
                key={i}
                g={g}
                leaf={leaf}
                index={i}
                count={count}
                item={item}
                picture={picture(i)}
                close={close}
                chosen={chosen}
                active={active === i}
                optionId={`${uid}-o${i}`}
                clipId={clipId}
                outline={petalPath}
                curl={curl}
                foldDeg={clamp(fold, 40, 150)}
                motionSafe={motionSafe}
                onPick={onPick}
              />
            );
          })}
        </motion.div>
      </div>

      <motion.p
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-3 truncate px-4 text-center font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
        style={{ opacity: captionOpacity }}
      >
        {shown === null ? "" : caption(shown)}
      </motion.p>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
