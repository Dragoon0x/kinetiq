"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type FlickerScene =
  "door" | "heron" | "wave" | "lamp" | "sail" | "poppy";

export type FlickerPrintItem = {
  /** What the card shows, for assistive technology. */
  alt: string;
  /** Printed under the carousel while the card is in front. */
  caption?: string;
  /** One picture: the frames become a depth flip, the picture shifting a little from frame to frame. */
  src?: string;
  /** Real frames, first to last: the card plays through them as it turns. */
  frames?: string[];
  /** A drawn scene when there is no picture. @default the item's place in the list */
  scene?: FlickerScene;
};

export type FlickerPrintsProps = {
  /** The postcards, front to back. @default six drawn harbour scenes */
  items?: FlickerPrintItem[];
  /** How many frames each card holds, 2 to 8: two flip, eight play. @default 5 */
  frames?: number;
  /** Lenticular ridges across a card, 12 to 60: chunky bands to a fine screen. @default 28 */
  ridges?: number;
  /** How deeply the drum curves, 0 to 1: a flat strip to a deep drum whose cards swing hard. @default 0.5 */
  curve?: number;
  /** The card in front (controlled). */
  value?: number;
  /** The card in front at first when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, tap or key that brought a new card to the front. */
  onValueChange?: (index: number) => void;
  /** How long a flip between frames lasts, 0 to 1: a snap to a long banded blend. @default 0.35 */
  blend?: number;
  /** How strongly the ridges catch the light, 0 to 1. @default 0.55 */
  sheen?: number;
  /** How far the front card tilts toward a hovering pointer, 0 to 1, playing its own frames. @default 0.6 */
  tilt?: number;
  /** The card stock, any CSS colour. @default a cream pigment */
  paper?: string;
  /** Print the front card's caption under the carousel. @default true */
  captions?: boolean;
  /** The carousel's accessible name. @default "Postcards" */
  label?: string;
  /** No turning, tilting or stepping. @default false */
  disabled?: boolean;
  className?: string;
};

const SCENES: FlickerScene[] = [
  "door",
  "heron",
  "wave",
  "lamp",
  "sail",
  "poppy",
];

/** One strip per ridge: the frame flipping in shows in the first `--fp-duty` of each. */
const STRIPES =
  "linear-gradient(90deg, black 0 var(--fp-duty), transparent var(--fp-duty) 100%)";

export const defaultFlickerPrints: FlickerPrintItem[] = [
  {
    scene: "door",
    alt: "A blue door swinging open onto a lamp-lit room",
    caption: "No. 9, Harbour Row",
  },
  {
    scene: "heron",
    alt: "A grey heron lifting off the shallows",
    caption: "The weir at dawn",
  },
  {
    scene: "wave",
    alt: "A wave curling over and breaking on the sand",
    caption: "Coldbrook Sands",
  },
  {
    scene: "lamp",
    alt: "A street lamp and the windows of a quay coming on at dusk",
    caption: "Quay Street, lighting-up time",
  },
  {
    scene: "sail",
    alt: "A small sailboat crossing the bay under a low sun",
    caption: "Out past the bar",
  },
  {
    scene: "poppy",
    alt: "A poppy bud opening into a red flower",
    caption: "Cliff path, June",
  },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / Math.max(1e-6, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------------ */
/* Pigments: the cards are printed objects, the same in either theme.        */
/* ------------------------------------------------------------------------ */

type Lch = readonly [number, number, number];

const ok = (c: Lch) => `oklch(${r3(c[0])} ${r3(c[1])} ${r1(c[2])})`;
const mixLch = (a: Lch, b: Lch, t: number): string =>
  ok([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);

/** A point list for an SVG polygon, rounded so server and browser agree. */
const pts = (list: [number, number][]) =>
  list.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ");

/** Linear interpolation through key poses at even steps of phase. */
function pose(keys: number[][], phase: number): number[] {
  const n = keys.length - 1;
  const x = clamp(phase, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const t = smooth(0, 1, x - i);
  const a = keys[i] ?? [];
  const b = keys[i + 1] ?? a;
  return a.map((v, j) => lerp(v, b[j] ?? v, t));
}

/* ------------------------------------------------------------------------ */
/* Scenes: each a function of phase, drawn in a 300 × 200 frame.             */
/* ------------------------------------------------------------------------ */

function DoorScene({ phase }: { phase: number }) {
  const a = smooth(0, 1, phase) * 82 * DEG;
  const hinge = 116;
  const w = 68;
  const free = hinge + w * Math.cos(a);
  const lift = 9 * Math.sin(a);
  const doorTop = 44;
  const doorBottom = 166;
  const inset = (u: number, v: number): [number, number] => {
    // A point on the door's face: u across from the hinge, v down from the top.
    const x = hinge + (free - hinge) * u;
    const top = doorTop - lift * u;
    const bottom = doorBottom + lift * 0.6 * u;
    return [x, top + (bottom - top) * v];
  };
  const glow = smooth(0.1, 0.9, phase);
  return (
    <>
      <rect width="300" height="200" fill="oklch(0.92 0.025 82)" />
      <rect y="166" width="300" height="34" fill="oklch(0.74 0.03 62)" />
      <rect x="0" y="164" width="300" height="3" fill="oklch(0.66 0.03 60)" />
      <rect
        x="106"
        y="36"
        width="88"
        height="132"
        fill="oklch(0.84 0.02 78)"
        rx="2"
      />
      <rect
        x={hinge}
        y={doorTop}
        width={w}
        height={doorBottom - doorTop}
        fill="oklch(0.5 0.1 60)"
      />
      <rect
        x={hinge}
        y={doorTop}
        width={w}
        height={doorBottom - doorTop}
        fill="oklch(0.84 0.12 78)"
        opacity={r3(0.25 + glow * 0.75)}
      />
      <rect
        x={hinge + 8}
        y="120"
        width="50"
        height="46"
        fill="oklch(0.58 0.09 50)"
        opacity={r3(glow)}
      />
      <rect
        x={hinge + 18}
        y="104"
        width="4"
        height="18"
        fill="oklch(0.36 0.04 50)"
        opacity={r3(glow)}
      />
      <circle
        cx={hinge + 20}
        cy="100"
        r="7"
        fill="oklch(0.95 0.09 90)"
        opacity={r3(glow)}
      />
      <polygon
        points={pts([
          [hinge, 166],
          [free, 166],
          [free + 40 * glow, 200],
          [hinge - 26 * glow, 200],
        ])}
        fill="oklch(0.86 0.1 80)"
        opacity={r3(0.55 * glow)}
      />
      <polygon
        points={pts([inset(0, 0), inset(1, 0), inset(1, 1), inset(0, 1)])}
        fill="oklch(0.46 0.12 252)"
      />
      <polygon
        points={pts([
          inset(0.14, 0.07),
          inset(0.86, 0.07),
          inset(0.86, 0.45),
          inset(0.14, 0.45),
        ])}
        fill="oklch(0.52 0.12 252)"
      />
      <polygon
        points={pts([
          inset(0.14, 0.53),
          inset(0.86, 0.53),
          inset(0.86, 0.93),
          inset(0.14, 0.93),
        ])}
        fill="oklch(0.52 0.12 252)"
      />
      <circle
        cx={r2(inset(0.84, 0.54)[0])}
        cy={r2(inset(0.84, 0.54)[1])}
        r="2.2"
        fill="oklch(0.82 0.1 85)"
      />
      <rect
        x="140"
        y="20"
        width="20"
        height="12"
        rx="2"
        fill="oklch(0.4 0.06 250)"
      />
      <rect
        x="146"
        y="23"
        width="8"
        height="6"
        rx="1"
        fill="oklch(0.94 0.04 90)"
      />
      <polygon
        points={pts([
          [214, 166],
          [238, 166],
          [234, 140],
          [218, 140],
        ])}
        fill="oklch(0.62 0.12 45)"
      />
      <ellipse cx="220" cy="128" rx="9" ry="15" fill="oklch(0.5 0.1 145)" />
      <ellipse cx="232" cy="126" rx="8" ry="17" fill="oklch(0.56 0.11 140)" />
      <ellipse cx="226" cy="116" rx="7" ry="13" fill="oklch(0.6 0.1 135)" />
      <rect x="40" y="60" width="44" height="54" fill="oklch(0.55 0.05 230)" />
      <rect x="44" y="64" width="17" height="22" fill="oklch(0.8 0.04 220)" />
      <rect x="63" y="64" width="17" height="22" fill="oklch(0.8 0.04 220)" />
      <rect x="44" y="88" width="17" height="22" fill="oklch(0.76 0.04 220)" />
      <rect x="63" y="88" width="17" height="22" fill="oklch(0.76 0.04 220)" />
    </>
  );
}

// Heron key poses, in the body's frame (x toward the head, y down): body x,
// body y, body tilt (deg), neck reach (0 tucked, 1 raised), leg swing
// (0 standing, 1 trailing), then the near wing: leading-edge control, tip,
// two trailing feather points and the root behind the shoulder.
const HERON_POSES = [
  [146, 114, -24, 1, 0, -8, -13, -32, -3, -24, 4, -12, 6, -2, 2],
  [148, 120, -12, 0.85, 0.12, 2, -30, -20, -44, -28, -30, -24, -16, -12, -1],
  [152, 92, -8, 0.5, 0.6, 12, -40, -6, -64, -18, -56, -22, -36, -15, -3],
  [170, 70, -3, 0.12, 1, 16, 22, -2, 46, -14, 42, -22, 24, -15, 2],
];

function HeronScene({ phase }: { phase: number }) {
  const [
    bx = 0,
    by = 0,
    tiltDeg = 0,
    reach = 0,
    swing = 0,
    c1x = 0,
    c1y = 0,
    tx = 0,
    ty = 0,
    p1x = 0,
    p1y = 0,
    p2x = 0,
    p2y = 0,
    rx = 0,
    ry = 0,
  ] = pose(HERON_POSES, phase);
  const t = tiltDeg * DEG;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const at = (x: number, y: number) =>
    `${r2(bx + x * cos - y * sin)} ${r2(by + x * sin + y * cos)}`;
  const xy = (x: number, y: number): [number, number] => [
    bx + x * cos - y * sin,
    by + x * sin + y * cos,
  ];
  const wing = (dx: number, dy: number, k: number) =>
    `M${at(4 + dx, -7 + dy)} Q${at(c1x * k + dx, c1y * k + dy)} ${at(tx * k + dx, ty * k + dy)} L${at(p1x * k + dx, p1y * k + dy)} L${at(p2x * k + dx, p2y * k + dy)} L${at(rx + dx, ry + dy)} Z`;
  const base = xy(20, -5);
  const head: [number, number] = [
    base[0] + lerp(16, 6, reach),
    base[1] + lerp(-6, -40, reach),
  ];
  const neck = `M${r2(base[0])} ${r2(base[1])} C${r2(base[0] + lerp(10, 16, reach))} ${r2(base[1] - lerp(8, 6, reach))} ${r2(base[0] + lerp(12, -8, reach))} ${r2(base[1] - lerp(10, 26, reach))} ${r2(head[0])} ${r2(head[1])}`;
  const hip = xy(-14, 6);
  const foot: [number, number] =
    swing < 0.05
      ? [hip[0] + 3, 155]
      : [
          lerp(hip[0] + 3, xy(-54, 10)[0], swing),
          lerp(155, xy(-54, 10)[1], swing),
        ];
  const splash = smooth(0.12, 0.42, phase) * (1 - smooth(0.55, 0.9, phase));
  const legs = `M${r2(hip[0])} ${r2(hip[1])} L${r2(foot[0])} ${r2(foot[1])} M${r2(hip[0] + 4)} ${r2(hip[1])} L${r2(foot[0] + 5)} ${r2(foot[1] - 2 * swing)}`;
  return (
    <>
      <rect width="300" height="200" fill="oklch(0.9 0.03 215)" />
      <rect width="300" height="64" fill="oklch(0.86 0.04 225)" />
      <circle cx="232" cy="58" r="15" fill="oklch(0.95 0.05 85)" />
      <rect y="132" width="300" height="10" fill="oklch(0.62 0.04 160)" />
      <rect y="140" width="300" height="60" fill="oklch(0.72 0.05 220)" />
      {[150, 160, 172, 186].map((y, i) => (
        <rect
          key={y}
          x={20 + i * 30}
          y={y}
          width={120 - i * 12}
          height="1.6"
          fill="oklch(0.84 0.03 215)"
          opacity="0.7"
        />
      ))}
      {splash > 0.01 ? (
        <ellipse
          cx={r2(hip[0] + 6)}
          cy="156"
          rx={r2(12 + splash * 26)}
          ry={r2(2.5 + splash * 4)}
          fill="none"
          stroke="oklch(0.96 0.02 215)"
          strokeWidth="1.4"
          opacity={r3(splash)}
        />
      ) : null}
      <path
        d={wing(5, -5, 0.86)}
        fill="oklch(0.6 0.02 245)"
        strokeLinejoin="round"
      />
      <path
        d={legs}
        stroke="oklch(0.62 0.08 75)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d={neck}
        stroke="oklch(0.96 0.005 240)"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse
        cx={r2(bx)}
        cy={r2(by)}
        rx="25"
        ry="10"
        transform={`rotate(${r1(tiltDeg)} ${r2(bx)} ${r2(by)})`}
        fill="oklch(0.76 0.012 240)"
      />
      <path
        d={wing(0, 0, 1)}
        fill="oklch(0.52 0.022 250)"
        stroke="oklch(0.36 0.02 255)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <ellipse
        cx={r2(head[0])}
        cy={r2(head[1])}
        rx="5.5"
        ry="4.2"
        fill="oklch(0.97 0.004 240)"
      />
      <path
        d={`M${r2(head[0] - 1)} ${r2(head[1] - 3)} L${r2(head[0] - 12)} ${r2(head[1] - 6)}`}
        stroke="oklch(0.24 0.02 250)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d={`M${r2(head[0] + 4)} ${r2(head[1] + 0.5)} L${r2(head[0] + 22)} ${r2(head[1] + 3)}`}
        stroke="oklch(0.78 0.14 75)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d={`M${18 + i * 7} 158 Q${14 + i * 7} 128 ${22 + i * 6} ${96 + (i % 3) * 8}`}
          stroke="oklch(0.48 0.07 120)"
          strokeWidth="1.6"
          fill="none"
        />
      ))}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${262 + i * 8} 160 Q${266 + i * 8} 132 ${258 + i * 9} ${108 + i * 7}`}
          stroke="oklch(0.52 0.07 125)"
          strokeWidth="1.6"
          fill="none"
        />
      ))}
    </>
  );
}

function WaveScene({ phase }: { phase: number }) {
  const rise = smooth(0, 0.5, phase);
  const crash = smooth(0.58, 1, phase);
  const h = (18 + 54 * rise) * (1 - 0.72 * crash);
  const cx = 150 + 26 * crash;
  const cy = 146 - h;
  const curl = lerp(-14, 128, smooth(0.18, 0.72, phase)) * DEG;
  const len = (10 + 34 * rise) * (1 - 0.5 * crash);
  const lip: [number, number] = [
    cx + len * Math.cos(curl),
    cy + len * Math.sin(curl),
  ];
  const lipCtl: [number, number] = [
    cx + len * 0.95 * Math.cos(curl - 0.9),
    cy + len * 0.95 * Math.sin(curl - 0.9),
  ];
  const face1: [number, number] = [cx + 6, cy + h * 0.36];
  const face2: [number, number] = [cx + 12, cy + h * 0.66];
  const trough: [number, number] = [cx + 52 + 24 * crash, 148];
  const P = (p: [number, number]) => `${r2(p[0])} ${r2(p[1])}`;
  const spray: [number, number, number][] = [
    [8, -6, 3],
    [18, -14, 2.4],
    [-4, -12, 2],
    [26, -2, 2.6],
    [12, -22, 1.8],
    [34, -10, 1.6],
    [0, -2, 2.8],
  ];
  return (
    <>
      <rect width="300" height="200" fill="oklch(0.9 0.05 70)" />
      <rect width="300" height="54" fill="oklch(0.85 0.06 45)" />
      <circle cx="70" cy="76" r="17" fill="oklch(0.95 0.08 85)" />
      <path
        d="M190 112 L232 98 L262 104 L300 96 L300 112 Z"
        fill="oklch(0.6 0.04 200)"
      />
      <rect y="110" width="300" height="42" fill="oklch(0.46 0.08 225)" />
      <rect
        x="40"
        y="114"
        width="70"
        height="2"
        fill="oklch(0.9 0.08 80)"
        opacity="0.6"
      />
      <path
        d={`M0 ${r2(146 - h * 0.18)} C60 ${r2(146 - h * 0.24)} ${r2(cx - 74)} ${r2(cy + 24)} ${P([cx, cy])} Q${P(lipCtl)} ${P(lip)} Q${P(face1)} ${P(face2)} Q${r2(cx + 20)} 150 ${P(trough)} L300 150 L300 200 L0 200 Z`}
        fill="oklch(0.55 0.09 205)"
      />
      <path
        d={`M${P([cx, cy])} Q${P(lipCtl)} ${P(lip)} Q${P(face1)} ${P(face2)} Q${r2(cx + 2)} ${r2(cy + h * 0.4)} ${P([cx - 2, cy + 4])} Z`}
        fill="oklch(0.38 0.07 222)"
        opacity={r3(smooth(0.25, 0.55, phase) * (1 - crash))}
      />
      <path
        d={`M${r2(cx - 46)} ${r2(cy + h * 0.42)} C${r2(cx - 30)} ${r2(cy + h * 0.2)} ${r2(cx - 16)} ${r2(cy + 2)} ${P([cx, cy])}`}
        stroke="oklch(0.68 0.08 190)"
        strokeWidth="3"
        fill="none"
        opacity="0.8"
      />
      <path
        d={`M${r2(cx - 14)} ${r2(cy + 4)} Q${r2(cx - 4)} ${r2(cy - 3)} ${P([cx, cy])} Q${P(lipCtl)} ${P(lip)}`}
        stroke="oklch(0.97 0.01 210)"
        strokeWidth={r2(2.5 + 2.5 * rise)}
        strokeLinecap="round"
        fill="none"
      />
      <rect y="156" width="300" height="44" fill="oklch(0.84 0.05 80)" />
      <path
        d={`M0 ${r2(152 + 2 * crash)} C80 ${r2(150 + 8 * crash)} 170 ${r2(154 + 10 * crash)} 300 ${r2(150 + 6 * crash)} L300 ${r2(160 + 12 * crash)} C190 ${r2(166 + 12 * crash)} 90 ${r2(158 + 8 * crash)} 0 ${r2(160 + 8 * crash)} Z`}
        fill="oklch(0.96 0.015 210)"
        opacity={r3(0.55 + 0.45 * crash)}
      />
      {crash > 0.01 ? (
        <ellipse
          cx={r2(cx + 20)}
          cy="146"
          rx={r2(18 + 40 * crash)}
          ry={r2(4 + 8 * crash)}
          fill="oklch(0.97 0.01 210)"
          opacity={r3(crash)}
        />
      ) : null}
      {spray.map(([dx, dy, r], i) => (
        <circle
          key={i}
          cx={r2(lip[0] + dx * (0.4 + crash))}
          cy={r2(lip[1] + dy * (0.4 + crash))}
          r={r2(r * (0.5 + crash))}
          fill="oklch(0.97 0.01 210)"
          opacity={r3(smooth(0.45, 0.7, phase) * (1 - 0.5 * crash))}
        />
      ))}
    </>
  );
}

const WINDOWS: [number, number, number][] = [
  [26, 70, 0.05],
  [48, 70, 0.62],
  [26, 98, 0.38],
  [48, 98, 0.8],
  [26, 126, 0.2],
  [100, 86, 0.5],
  [122, 86, 0.12],
  [100, 114, 0.7],
  [122, 114, 0.3],
];

function LampScene({ phase }: { phase: number }) {
  const dusk = smooth(0, 1, phase);
  const lamp = smooth(0.35, 0.6, phase);
  const sky = mixLch([0.78, 0.07, 240], [0.36, 0.08, 270], dusk);
  const low = mixLch([0.86, 0.07, 60], [0.56, 0.1, 30], dusk);
  return (
    <>
      <rect width="300" height="200" fill={sky} />
      <rect y="100" width="300" height="60" fill={low} opacity="0.8" />
      {[
        [180, 26],
        [232, 44],
        [270, 20],
        [206, 60],
      ].map(([x = 0, y = 0], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="1.2"
          fill="oklch(0.97 0.02 90)"
          opacity={r3(smooth(0.5, 0.9, phase) * (0.6 + i * 0.1))}
        />
      ))}
      <rect x="12" y="56" width="62" height="114" fill="oklch(0.32 0.03 260)" />
      <polygon points="10,58 43,36 76,58" fill="oklch(0.28 0.03 260)" />
      <rect x="86" y="74" width="60" height="96" fill="oklch(0.36 0.03 255)" />
      {WINDOWS.map(([x, y, at], i) => {
        const lit = smooth(at, at + 0.12, phase);
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width="14"
              height="18"
              fill="oklch(0.24 0.03 260)"
            />
            <rect
              x={x}
              y={y}
              width="14"
              height="18"
              fill="oklch(0.86 0.13 82)"
              opacity={r3(lit)}
            />
          </g>
        );
      })}
      <rect y="170" width="300" height="30" fill="oklch(0.3 0.02 250)" />
      <polygon
        points={pts([
          [208, 64],
          [222, 64],
          [262, 170],
          [168, 170],
        ])}
        fill="oklch(0.92 0.11 88)"
        opacity={r3(lamp * 0.22)}
      />
      <ellipse
        cx="215"
        cy="172"
        rx="44"
        ry="6"
        fill="oklch(0.9 0.1 85)"
        opacity={r3(lamp * 0.45)}
      />
      <rect x="213" y="64" width="4" height="108" fill="oklch(0.22 0.02 250)" />
      <circle
        cx="215"
        cy="60"
        r="22"
        fill="oklch(0.95 0.1 90)"
        opacity={r3(lamp * 0.18)}
      />
      <circle
        cx="215"
        cy="60"
        r="12"
        fill="oklch(0.95 0.1 90)"
        opacity={r3(lamp * 0.35)}
      />
      <polygon
        points="206,52 224,52 220,64 210,64"
        fill="oklch(0.22 0.02 250)"
      />
      <rect
        x="209"
        y="55"
        width="12"
        height="8"
        fill="oklch(0.97 0.09 92)"
        opacity={r3(0.15 + lamp * 0.85)}
      />
      <rect
        x="236"
        y="150"
        width="40"
        height="20"
        rx="2"
        fill="oklch(0.26 0.02 250)"
      />
    </>
  );
}

function SailScene({ phase }: { phase: number }) {
  const x = lerp(46, 238, smooth(0, 1, phase));
  const bob = Math.sin(phase * Math.PI * 3) * 1.6;
  const sunY = lerp(74, 104, phase);
  const heel = Math.sin(phase * Math.PI * 2) * 3;
  return (
    <>
      <rect width="300" height="200" fill="oklch(0.88 0.05 55)" />
      <rect y="0" width="300" height="50" fill="oklch(0.82 0.06 30)" />
      <circle cx="210" cy={r2(sunY)} r="18" fill="oklch(0.94 0.1 80)" />
      <path
        d="M0 116 L60 100 L104 108 L140 104 L150 116 Z"
        fill="oklch(0.58 0.05 160)"
      />
      <rect y="116" width="300" height="84" fill="oklch(0.55 0.07 228)" />
      <rect
        x="170"
        y="118"
        width="80"
        height="3"
        fill="oklch(0.9 0.09 80)"
        opacity="0.7"
      />
      <rect
        x="182"
        y="126"
        width="56"
        height="2"
        fill="oklch(0.9 0.09 80)"
        opacity="0.5"
      />
      <path
        d={`M${r2(x - 38)} ${r2(148 + bob)} Q${r2(x - 20)} ${r2(146 + bob)} ${r2(x - 4)} ${r2(150 + bob)}`}
        stroke="oklch(0.9 0.02 220)"
        strokeWidth="1.4"
        fill="none"
        opacity="0.8"
      />
      <g transform={`rotate(${r2(heel)} ${r2(x)} ${r2(148 + bob)})`}>
        <polygon
          points={pts([
            [x - 18, 144 + bob],
            [x + 22, 144 + bob],
            [x + 14, 152 + bob],
            [x - 12, 152 + bob],
          ])}
          fill="oklch(0.42 0.08 30)"
        />
        <rect
          x={r2(x)}
          y={r2(92 + bob)}
          width="2"
          height="52"
          fill="oklch(0.3 0.03 50)"
        />
        <polygon
          points={pts([
            [x + 3, 94 + bob],
            [x + 3, 140 + bob],
            [x + 30, 140 + bob],
          ])}
          fill="oklch(0.96 0.015 85)"
        />
        <polygon
          points={pts([
            [x - 1, 100 + bob],
            [x - 1, 140 + bob],
            [x - 20, 140 + bob],
          ])}
          fill="oklch(0.86 0.06 40)"
        />
      </g>
      {[0, 1].map((i) => {
        const gx = 60 + i * 34 + phase * 40;
        const gy = 52 + i * 10;
        const flap = Math.sin(phase * Math.PI * 6 + i) * 3;
        return (
          <path
            key={i}
            d={`M${r2(gx - 7)} ${r2(gy - flap)} Q${r2(gx - 3)} ${r2(gy - 4)} ${r2(gx)} ${r2(gy)} Q${r2(gx + 3)} ${r2(gy - 4)} ${r2(gx + 7)} ${r2(gy - flap)}`}
            stroke="oklch(0.32 0.03 250)"
            strokeWidth="1.3"
            fill="none"
          />
        );
      })}
    </>
  );
}

function PoppyScene({ phase }: { phase: number }) {
  const open = smooth(0.05, 0.95, phase);
  const cx = 150;
  const cy = 86;
  const petals = [-55, 25, 105, 185].map((deg, i) => {
    const spread = lerp(0.18, 1, open);
    const a = (deg + (1 - open) * 40 * (i % 2 ? 1 : -1)) * DEG;
    const len = lerp(16, 38, open);
    const wide = lerp(10, 30, open);
    const tip: [number, number] = [
      cx + Math.cos(a) * len * spread,
      cy + Math.sin(a) * len * (0.7 + 0.3 * spread) - (1 - open) * 14,
    ];
    const left: [number, number] = [
      cx + Math.cos(a - 0.9) * wide * spread,
      cy + Math.sin(a - 0.9) * wide * spread,
    ];
    const right: [number, number] = [
      cx + Math.cos(a + 0.9) * wide * spread,
      cy + Math.sin(a + 0.9) * wide * spread,
    ];
    return `M${r2(cx)} ${r2(cy)} Q${r2(left[0])} ${r2(left[1])} ${r2(tip[0])} ${r2(tip[1])} Q${r2(right[0])} ${r2(right[1])} ${r2(cx)} ${r2(cy)} Z`;
  });
  return (
    <>
      <rect width="300" height="200" fill="oklch(0.88 0.05 120)" />
      <rect y="0" width="300" height="70" fill="oklch(0.92 0.03 210)" />
      <rect y="64" width="300" height="12" fill="oklch(0.78 0.06 130)" />
      {[30, 60, 230, 262, 284].map((x, i) => (
        <path
          key={x}
          d={`M${x} 200 Q${x + 4} ${150 - i * 4} ${x - 6 + i * 2} ${118 + i * 6}`}
          stroke="oklch(0.56 0.08 130)"
          strokeWidth="1.6"
          fill="none"
        />
      ))}
      <circle cx="56" cy="128" r="5" fill="oklch(0.66 0.17 30)" opacity="0.7" />
      <circle
        cx="252"
        cy="140"
        r="4"
        fill="oklch(0.66 0.17 30)"
        opacity="0.6"
      />
      <path
        d="M150 200 C146 160 156 130 150 96"
        stroke="oklch(0.52 0.09 135)"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M150 150 Q128 140 118 126 Q138 128 150 146"
        fill="oklch(0.56 0.1 135)"
      />
      {petals.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={i % 2 ? "oklch(0.6 0.19 28)" : "oklch(0.64 0.2 32)"}
        />
      ))}
      <ellipse
        cx="150"
        cy={r2(90 - (1 - open) * 10)}
        rx={r2(lerp(9, 6, open))}
        ry={r2(lerp(14, 6, open))}
        fill="oklch(0.52 0.1 135)"
        opacity={r3(1 - open * 0.85)}
      />
      <circle cx="150" cy="86" r={r2(5 * open)} fill="oklch(0.25 0.04 300)" />
    </>
  );
}

const SCENE_ART: Record<
  FlickerScene,
  (p: { phase: number }) => React.ReactNode
> = {
  door: DoorScene,
  heron: HeronScene,
  wave: WaveScene,
  lamp: LampScene,
  sail: SailScene,
  poppy: PoppyScene,
};

function FrameArt({
  item,
  index,
  phase,
}: {
  item: FlickerPrintItem;
  index: number;
  phase: number;
}) {
  if (item.frames && item.frames.length > 0) {
    const list = item.frames;
    const src = list[Math.round(phase * (list.length - 1))] ?? list[0];
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        draggable={false}
        className="size-full object-cover"
      />
    );
  }
  if (item.src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.src}
        alt=""
        draggable={false}
        className="size-full object-cover"
        style={{
          transform: `translateX(${r2((0.5 - phase) * 5)}%) scale(${r3(1.08 + phase * 0.03)})`,
        }}
      />
    );
  }
  const scene = item.scene ?? SCENES[index % SCENES.length] ?? "door";
  const Art = SCENE_ART[scene];
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 200"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <Art phase={phase} />
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* The drum.                                                                 */
/* ------------------------------------------------------------------------ */

type Drum = {
  /** Degrees between neighbouring cards. */
  step: number;
  /** Drum radius, in card widths. */
  radius: number;
  /** Half the angle over which a card plays all its frames. */
  span: number;
};

const drumOf = (curve: number): Drum => {
  const step = lerp(12, 40, clamp(curve, 0, 1));
  return {
    step,
    radius: 1.1 / (2 * Math.sin((step * DEG) / 2)),
    span: step * 1.8,
  };
};

type CardLook = {
  transform: string;
  z: number;
  hidden: boolean;
  shade: number;
  /** The frame underneath, the one flipping in, and how far the flip is. */
  base: number;
  next: number;
  duty: number;
  glint: number;
  band: number;
};

/** Where card `i` sits and what it shows, for the drum at `pos` with `tiltDeg` on the front card. */
function lookOf(
  i: number,
  pos: number,
  tiltDeg: number,
  drum: Drum,
  frames: number,
  blendAmount: number,
): CardLook {
  const rel = i - pos;
  const theta = rel * drum.step;
  const hidden = Math.abs(theta) > 100;
  const x = drum.radius * Math.sin(theta * DEG);
  const z = drum.radius * (Math.cos(theta * DEG) - 1);
  const angle = theta + tiltDeg * Math.max(0, 1 - Math.abs(rel));
  // The viewing angle picks the frame: a card entering from the right shows
  // its first frames, a card leaving on the left its last.
  const psi = clamp(0.5 - angle / (2 * drum.span), 0, 1);
  const f = Math.max(2, Math.round(frames));
  const at = psi * (f - 1);
  const k = Math.min(f - 2, Math.floor(at));
  const t = at - k;
  // A lenticular frame holds, then flips over a narrow band of angles.
  const width = lerp(0.08, 0.9, clamp(blendAmount, 0, 1));
  const flip = smooth(0.5 - width / 2, 0.5 + width / 2, t);
  const settledNext = flip > 0.995;
  return {
    transform: `translate3d(calc(var(--fp-card) * ${r3(x)}), 0px, calc(var(--fp-card) * ${r3(z)})) rotateY(${r2(angle)}deg)`,
    z: 100 - Math.round(Math.abs(rel) * 10),
    hidden,
    shade: r3(0.42 * (1 - Math.cos(clamp(theta, -90, 90) * DEG))),
    base: settledNext ? k + 1 : k,
    next: flip < 0.005 || settledNext ? -1 : k + 1,
    duty: r1(flip * 100),
    glint: r3(((((angle / drum.span) * 1.6) % 1) + 1) % 1),
    band: r1(clamp(50 - (angle / drum.span) * 60, 0, 100)),
  };
}

type Nodes = {
  slide: HTMLDivElement;
  shade: HTMLDivElement;
  sheen: HTMLDivElement;
  frames: HTMLDivElement[];
};

/**
 * A carousel of lenticular postcards on a shallow drum. A lenticular print
 * shows a different frame for every viewing angle, so each card's angle on
 * the drum picks its frame: as a card turns through the curve its few frames
 * of motion play — a door opens, a heron lifts, a wave breaks. Frames hold,
 * then flip over a narrow band of angles, and during a flip the two frames
 * are interleaved strip by strip under the ridges, the boundary sweeping
 * across every ridge, so the change shows as banding; a highlight rides the
 * crest of every ridge and a broad sheen sweeps the card as it turns.
 *
 * Dragging turns the drum 1:1 and scrubs every card at once; a release
 * settles on the card the throw was heading for on springs.glide, with the
 * release velocity. A mouse tilts the front card toward it; a tap on the
 * front card (or Space) rocks it through its motion on snap and back on
 * recoil. Arrow keys step, Home and End jump. Under reduced motion the drum
 * steps without travel and each card holds the frame its place shows.
 */
export function FlickerPrints({
  items = defaultFlickerPrints,
  frames = 5,
  ridges = 28,
  curve = 0.5,
  value,
  defaultValue = 0,
  onValueChange,
  blend = 0.35,
  sheen = 0.55,
  tilt = 0.6,
  paper = "oklch(from var(--warn) 0.965 0.018 h)",
  captions = true,
  label = "Postcards",
  disabled = false,
  className,
}: FlickerPrintsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const count = items.length;
  const last = Math.max(0, count - 1);
  const frameCount = clamp(Math.round(frames), 2, 8);
  const ridgeCount = clamp(Math.round(ridges), 12, 60);
  const drum = drumOf(curve);

  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, last),
  );
  const index = clamp(Math.round(value ?? own), 0, last);

  const pos = useMotionValue(index);
  const tiltValue = useMotionValue(0);
  // The markup's first frame is drawn for where the drum stood at mount; the
  // engine owns every frame after that, so a re-render never clobbers it.
  const [mountPos] = React.useState(index);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const cardWidth = React.useRef(0);
  const nodes = React.useRef(new Map<number, Nodes>());
  const written = React.useRef(new Map<number, string>());
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const tilting = React.useRef<AnimationPlaybackControls | null>(null);
  const dragFrom = React.useRef(0);
  const dragging = React.useRef(false);
  const pendingVelocity = React.useRef(0);
  const rockSign = React.useRef(1);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const config = {
    drum,
    frameCount,
    blend,
    sheen,
    motionSafe,
    count,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
  });

  /** Writes every card's transform, frames and sheen for the drum's current place. */
  const paint = React.useCallback(() => {
    const c = latest.current;
    const p = pos.get();
    const tl = tiltValue.get();
    const cardPx = cardWidth.current;
    for (const [i, n] of nodes.current) {
      const look = lookOf(i, p, tl, c.drum, c.frameCount, c.blend);
      const key = `${look.transform}|${look.hidden}|${look.base}|${look.next}|${look.duty}|${look.glint}|${look.band}|${cardPx}`;
      if (written.current.get(i) === key) continue;
      written.current.set(i, key);
      n.slide.style.transform = look.transform;
      n.slide.style.zIndex = String(look.z);
      n.slide.style.visibility = look.hidden ? "hidden" : "visible";
      n.shade.style.opacity = String(look.shade);
      n.frames.forEach((layer, k) => {
        const shown = k === look.base || k === look.next;
        layer.style.visibility = shown ? "visible" : "hidden";
        layer.style.zIndex = k === look.next ? "2" : "1";
        layer.style.maskImage = k === look.next ? STRIPES : "none";
        layer.style.setProperty(
          "--fp-duty",
          k === look.next ? `${look.duty}%` : "100%",
        );
      });
      const tile = cardPx > 0 ? (cardPx * 0.93) / ridgeCount : 0;
      n.sheen.style.backgroundPositionX = `${r2(look.glint * tile)}px`;
      n.sheen.style.maskPosition = `${look.band}% 0%`;
      n.sheen.style.opacity = String(
        r3(
          clamp(c.sheen, 0, 1) *
            (0.45 + 0.55 * (1 - Math.abs(look.band - 50) / 50)),
        ),
      );
    }
  }, [pos, tiltValue, ridgeCount]);

  // Any change of look re-paints everything (the cache keys include it).
  const lookKey = `${frameCount}|${ridgeCount}|${r3(drum.step)}|${r3(blend)}|${r3(sheen)}|${count}`;
  React.useLayoutEffect(() => {
    written.current.clear();
    paint();
  }, [lookKey, paint]);

  React.useEffect(() => {
    const offPos = pos.on("change", paint);
    const offTilt = tiltValue.on("change", paint);
    return () => {
      offPos();
      offTilt();
    };
  }, [pos, tiltValue, paint]);

  // Cards change width with the container; the sheen's ridge tile follows.
  const bindStage = React.useCallback(
    (node: HTMLDivElement | null) => {
      stageRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        cardWidth.current =
          node.querySelector<HTMLElement>("[data-fp-slide]")?.offsetWidth ?? 0;
        written.current.clear();
        paint();
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [paint],
  );

  const halt = () => {
    running.current?.stop();
    running.current = null;
  };

  /** Turns the drum to `target` on glide, carrying `velocity` in cards per second. */
  const turnTo = React.useCallback(
    (target: number, velocity = 0) => {
      running.current?.stop();
      if (!latest.current.motionSafe) {
        pos.jump(target);
        running.current = null;
        return;
      }
      running.current = animate(pos, target, { ...springs.glide, velocity });
    },
    [pos],
  );

  // A host that moves `value` gets the same turn a drag would.
  const shown = React.useRef(index);
  React.useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    if (dragging.current) return;
    turnTo(index, pendingVelocity.current);
    pendingVelocity.current = 0;
  }, [index, turnTo]);

  // StrictMode's rehearsal stops a running turn: carry it on to rest.
  React.useEffect(() => {
    if (!dragging.current && Math.abs(pos.get() - shown.current) > 0.001) {
      turnTo(shown.current);
    }
    return () => {
      running.current?.stop();
      tilting.current?.stop();
    };
  }, [pos, turnTo]);

  const announce = (i: number) => {
    const item = items[i];
    if (!item) return;
    setSaid((s) => ({
      n: s.n + 1,
      text: `${i + 1} of ${count}: ${item.caption ?? item.alt}.`,
    }));
  };

  const commit = (target: number, velocity = 0) => {
    const next = clamp(Math.round(target), 0, last);
    if (next === index) {
      turnTo(next, velocity);
      return;
    }
    if (value === undefined) {
      setOwn(next);
      shown.current = next;
      turnTo(next, velocity);
    } else {
      // Controlled: hold where the host says until it answers.
      pendingVelocity.current = velocity;
      turnTo(index, velocity);
    }
    announce(next);
    onValueChange?.(next);
  };

  const tiltTo = (deg: number, transition = springs.glide) => {
    tilting.current?.stop();
    if (!latest.current.motionSafe) {
      tiltValue.jump(0);
      return;
    }
    tilting.current = animate(tiltValue, deg, transition);
  };

  /** One rock of the front card through its motion and back. */
  const rock = () => {
    if (disabled || !latest.current.motionSafe) return;
    const peak = drum.span * 0.92 * rockSign.current;
    rockSign.current *= -1;
    tilting.current?.stop();
    tilting.current = animate(tiltValue, peak, {
      ...springs.snap,
      onComplete: () => {
        tilting.current = animate(tiltValue, 0, springs.recoil);
      },
    });
  };

  const chordPx = () =>
    Math.max(
      40,
      (cardWidth.current || 200) * 1.1 * Math.cos((drum.step * DEG) / 2),
    );

  const drag = useDrag({
    axis: "x",
    threshold: 5,
    disabled: disabled || count < 2,
    onStart: () => {
      dragging.current = true;
      halt();
      tiltTo(0);
      dragFrom.current = pos.get();
    },
    onMove: ({ offset }) => {
      // Reduced motion: the drum does not travel under the finger; the
      // release steps it instead.
      if (!latest.current.motionSafe) return;
      const raw = dragFrom.current - offset.x / chordPx();
      const x =
        raw < 0
          ? rubberband(raw, 1)
          : raw > last
            ? last + rubberband(raw - last, 1)
            : raw;
      pos.set(r3(x));
    },
    onEnd: ({ velocity, offset }) => {
      dragging.current = false;
      if (!latest.current.motionSafe) {
        if (Math.abs(offset.x) > 24) commit(index - Math.sign(offset.x));
        return;
      }
      const v = -velocity.x / chordPx();
      commit(project(pos.get(), v, 0.995), latest.current.motionSafe ? v : 0);
    },
    onCancel: () => {
      dragging.current = false;
      turnTo(index);
    },
    onTap: (event) => {
      if (disabled) return;
      const slide = (event.target as Element | null)?.closest?.(
        "[data-fp-slide]",
      );
      const at = slide ? Number(slide.getAttribute("data-fp-slide")) : NaN;
      if (Number.isNaN(at) || at === index) rock();
      else commit(at);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled || event.target !== event.currentTarget) return;
    const go: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: last,
    };
    const to = go[event.key];
    if (to !== undefined) {
      event.preventDefault();
      commit(clamp(to, 0, last));
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      rock();
    }
  };

  const tiltMax = clamp(tilt, 0, 1) * drum.span * 0.7;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      className={cn(
        "group/flicker-prints @container relative flex w-full flex-col gap-3 rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={bindStage}
        {...drag}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (
            dragging.current ||
            event.pointerType !== "mouse" ||
            disabled ||
            !motionSafe
          )
            return;
          const slide = stageRef.current?.querySelector<HTMLElement>(
            `[data-fp-slide="${index}"]`,
          );
          const rect = stageRef.current?.getBoundingClientRect();
          const w = slide?.offsetWidth ?? 0;
          if (!rect || w <= 0) return;
          const dx = (event.clientX - (rect.left + rect.width / 2)) / (w / 2);
          // The side under the pointer is pressed away, as a thumb would.
          tiltTo(Math.abs(dx) > 1.15 ? 0 : r2(clamp(dx, -1, 1) * tiltMax));
        }}
        onPointerLeave={() => {
          if (!dragging.current) tiltTo(0);
        }}
        className={cn(
          "relative w-full touch-pan-y overflow-clip [--fp-card:58cqw] @min-[34rem]:[--fp-card:min(44cqw,340px)]",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          height: "calc(var(--fp-card) * 0.86)",
          perspective: "calc(var(--fp-card) * 3.4)",
        }}
      >
        {items.map((item, i) => {
          const look = lookOf(i, mountPos, 0, drum, frameCount, blend);
          return (
            <div
              key={i}
              data-fp-slide={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}: ${item.alt}`}
              aria-hidden={i !== index || undefined}
              ref={(node) => {
                if (!node) {
                  nodes.current.delete(i);
                  written.current.delete(i);
                  return;
                }
                const shade =
                  node.querySelector<HTMLDivElement>("[data-fp-shade]");
                const sheenNode =
                  node.querySelector<HTMLDivElement>("[data-fp-sheen]");
                const layers = Array.from(
                  node.querySelectorAll<HTMLDivElement>("[data-fp-frame]"),
                );
                if (shade && sheenNode) {
                  nodes.current.set(i, {
                    slide: node,
                    shade,
                    sheen: sheenNode,
                    frames: layers,
                  });
                  written.current.delete(i);
                }
              }}
              className="absolute top-1/2 left-1/2 [backface-visibility:hidden]"
              style={{
                width: "var(--fp-card)",
                marginLeft: "calc(var(--fp-card) * -0.5)",
                marginTop: "calc(var(--fp-card) * -0.333)",
                transform: look.transform,
                zIndex: look.z,
                visibility: look.hidden ? "hidden" : "visible",
              }}
            >
              <div
                className="relative aspect-[3/2] w-full rounded-2 p-[3.5%] shadow-[0_14px_28px_-16px_color-mix(in_oklab,black_55%,transparent),0_2px_6px_-2px_color-mix(in_oklab,black_25%,transparent)]"
                style={{ backgroundColor: paper }}
              >
                <div className="relative size-full overflow-clip rounded-[2px]">
                  {Array.from({ length: frameCount }, (_, k) => {
                    const phase = k / (frameCount - 1);
                    const isNext = k === look.next;
                    return (
                      <div
                        key={k}
                        data-fp-frame={k}
                        aria-hidden
                        className="absolute inset-0"
                        style={
                          {
                            visibility:
                              k === look.base || isNext ? "visible" : "hidden",
                            zIndex: isNext ? 2 : 1,
                            "--fp-duty": isNext ? `${look.duty}%` : "100%",
                            maskImage: isNext ? STRIPES : "none",
                            maskSize: `calc(100% / ${ridgeCount}) 100%`,
                            maskRepeat: "repeat",
                          } as React.CSSProperties
                        }
                      >
                        <FrameArt item={item} index={i} phase={phase} />
                      </div>
                    );
                  })}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-[3]"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, oklch(0 0 0 / 0.2) 0, oklch(0 0 0 / 0.05) 16%, transparent 30%, oklch(1 0 0 / 0.14) 52%, transparent 70%, oklch(0 0 0 / 0.08) 100%)",
                      backgroundSize: `calc(100% / ${ridgeCount}) 100%`,
                    }}
                  />
                  <div
                    data-fp-sheen
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-[4] mix-blend-screen"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, transparent 0 32%, oklch(1 0 0 / 0.75) 48% 54%, transparent 70% 100%)",
                      backgroundSize: `calc(100% / ${ridgeCount}) 100%`,
                      maskImage:
                        "linear-gradient(100deg, transparent 0 34%, black 50%, transparent 66% 100%)",
                      maskSize: "300% 100%",
                      maskRepeat: "no-repeat",
                      maskPosition: `${look.band}% 0%`,
                      opacity: r3(clamp(sheen, 0, 1) * 0.6),
                    }}
                  />
                  <div
                    data-fp-shade
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-[5]"
                    style={{
                      backgroundColor: "oklch(0.16 0.015 260)",
                      opacity: look.shade,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {captions || count > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
          {captions ? (
            <div className="grid min-w-0 flex-1">
              {items.map((item, i) => (
                <p
                  key={i}
                  aria-hidden
                  className={cn(
                    "col-start-1 row-start-1 truncate text-sm text-foreground transition-opacity duration-200",
                    i === index ? "opacity-100" : "opacity-0",
                  )}
                  title={item.caption ?? item.alt}
                >
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="ml-2">{item.caption ?? item.alt}</span>
                </p>
              ))}
            </div>
          ) : null}
          {count > 1 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {items.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  tabIndex={-1}
                  aria-label={`Show card ${i + 1}: ${item.caption ?? item.alt}`}
                  disabled={disabled}
                  // A dot press keeps focus where it was (on the carousel).
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-[width,background-color] duration-200 disabled:cursor-not-allowed",
                    i === index
                      ? "w-4 bg-foreground"
                      : "w-1.5 bg-ink-3/40 hover:bg-ink-3",
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <p id={hintId} className="sr-only">
        Left and Right turn the drum one card, Home and End jump to the first
        and last. Space rocks the front card through its motion.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
