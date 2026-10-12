"use client";

import * as React from "react";

import { animate, type AnimationPlaybackControls } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RoomWithinFrame = "window" | "gilt" | "mat" | "none";
export type RoomWithinEasing = "linear" | "dwell" | "snap";

/** Where a picture's opening sits, in the art's 1000 × 1000 box. */
export type RoomWithinOpening = {
  /** The opening's centre across the art box, 0–1000. */
  x: number;
  /** The opening's centre down the art box, 0–1000. */
  y: number;
  /** Its width and height as a share of the stage's, 0.2 to 0.5. */
  size: number;
};

export type RoomWithinLevel = {
  /** Stable key for the level. Defaults to its position. */
  id?: string;
  /** A picture, cover-fitted to a square centred on the stage. Without one, `art` is shown. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** The level's title, shown over the picture. Defaults to `alt`. */
  caption?: string;
  /** A short line above the caption: a place, a time. */
  detail?: string;
  /** Your own art, filling a square centred on the stage. */
  art?: React.ReactNode;
  /** The opening that holds the next level. @default { x: 500, y: 450, size: 0.34 } */
  window?: RoomWithinOpening;
};

export type RoomWithinProps = {
  /** The pictures, outermost first: each one's opening holds the next. @default defaultRoomWithinLevels */
  items?: RoomWithinLevel[];
  /** How many levels deep the story goes, 2 to 6 (and no more than `items`). @default 5 */
  depth?: number;
  /** How each opening is framed: a painted casement, a gilt frame, a paper mat, or a seamless cut. @default "window" */
  frame?: RoomWithinFrame;
  /** How scrolling maps to the zoom: steady, holding each picture for a beat, or snapping to pictures. @default "dwell" */
  easing?: RoomWithinEasing;
  /** Controlled: the level shown. A new value travels there. */
  value?: number;
  /** The level shown first when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the scroll, key or click that brought a new level nearest, with that level. */
  onValueChange?: (level: number) => void;
  /** Scroll for one level, as a share of the stage's height, 0.5 to 3. @default 1.2 */
  scrollLength?: number;
  /** The deepest picture's opening holds the first room again. @default true */
  loop?: boolean;
  /** Show each level's caption over the picture. @default true */
  captions?: boolean;
  /** Show the depth gauge on the right edge. @default true */
  rail?: boolean;
  /** On first view the camera leans a little way into the window and back, and a cue says to scroll. @default true */
  hint?: boolean;
  /** The stage's height: px, or any CSS length. @default 420px */
  height?: number | string;
  /** The story's accessible name. @default "Room within" */
  label?: string;
  /** No scrolling, keys or clicks; the stage dims. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- helpers -------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** A pigment: a token's hue at a fixed lightness and chroma, the same in both themes. */
const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${l} ${c} ${dh ? `calc(h + ${dh})` : "h"})`;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Scroll progress (levels) to zoom progress (levels) for an easing. */
function shape(raw: number, easing: RoomWithinEasing): number {
  if (easing !== "dwell") return raw;
  const k = Math.floor(raw);
  const t = raw - k;
  // Each picture holds still for the first and last part of its scroll.
  return k + smoother(clamp01((t - 0.14) / 0.72));
}

const DEFAULT_WINDOW: RoomWithinOpening = { x: 500, y: 450, size: 0.34 };

type Opening = { x: number; y: number; f: number };

/**
 * The opening in stage shares for a stage of aspect `a` (width / height).
 * The art is a square covering the stage, so the same art point lands in a
 * different place as the aspect changes; the CSS below does the same sum.
 */
function openingAt(win: RoomWithinOpening, a: number): Opening {
  const f = r4(clamp(win.size, 0.12, 0.6));
  const sx = Math.max(1, 1 / a);
  const sy = Math.max(a, 1);
  const cx = 0.5 + r4(win.x / 1000 - 0.5) * sx;
  const cy = 0.5 + r4(win.y / 1000 - 0.5) * sy;
  return {
    x: clamp(cx - f / 2, 0.02, 0.98 - f),
    y: clamp(cy - f / 2, 0.02, 0.98 - f),
    f,
  };
}

/** The same opening as CSS lengths on a stage-sized container, exact at any aspect. */
function openingCss(win: RoomWithinOpening) {
  const f = r4(clamp(win.size, 0.12, 0.6));
  const dx = r4(win.x / 1000 - 0.5);
  const dy = r4(win.y / 1000 - 0.5);
  const half = r3(f * 50);
  const far = r3(98 - f * 100);
  return {
    f,
    left: `clamp(2cqw, calc(50cqw + ${dx} * max(100cqw, 100cqh) - ${half}cqw), ${far}cqw)`,
    top: `clamp(2cqh, calc(50cqh + ${dy} * max(100cqw, 100cqh) - ${half}cqh), ${far}cqh)`,
    width: `${r3(f * 100)}cqw`,
    height: `${r3(f * 100)}cqh`,
  };
}

/* ----------------------------------- art ---------------------------------- */

/**
 * The default pictures are lists of flat shapes in a 1000 × 1000 box, filled
 * with pigments so they read the same on a light or a dark page.
 * r: x y w h fill [opacity rx] · e: cx cy rx ry fill [opacity] ·
 * c: cx cy r fill [opacity] · p: d fill [opacity] · s: d stroke width [opacity]
 * · d: a dashed ring cx cy r stroke width dash · g: a glow cx cy rx ry colour strength.
 */
type Shape =
  | ["r", number, number, number, number, string, number?, number?]
  | ["e", number, number, number, number, string, number?]
  | ["c", number, number, number, string, number?]
  | ["p", string, string, number?]
  | ["s", string, string, number, number?]
  | ["d", number, number, number, string, number, number]
  | ["g", number, number, number, number, string, number];

function Scene({ shapes }: { shapes: Shape[] }) {
  const uid = React.useId();
  return (
    <svg viewBox="0 0 1000 1000" className="block size-full" aria-hidden>
      {shapes.map((s, i) => {
        switch (s[0]) {
          case "g":
            // A soft glow: an ellipse whose colour falls away to nothing.
            return (
              <React.Fragment key={i}>
                <radialGradient id={`${uid}-${i}`}>
                  <stop
                    offset="0"
                    style={{ stopColor: s[5], stopOpacity: s[6] }}
                  />
                  <stop
                    offset="0.55"
                    style={{ stopColor: s[5], stopOpacity: r3(s[6] * 0.45) }}
                  />
                  <stop
                    offset="1"
                    style={{ stopColor: s[5], stopOpacity: 0 }}
                  />
                </radialGradient>
                <ellipse
                  cx={s[1]}
                  cy={s[2]}
                  rx={s[3]}
                  ry={s[4]}
                  fill={`url(#${uid}-${i})`}
                />
              </React.Fragment>
            );
          case "r":
            return (
              <rect
                key={i}
                x={s[1]}
                y={s[2]}
                width={s[3]}
                height={s[4]}
                rx={s[7]}
                style={{ fill: s[5], opacity: s[6] }}
              />
            );
          case "e":
            return (
              <ellipse
                key={i}
                cx={s[1]}
                cy={s[2]}
                rx={s[3]}
                ry={s[4]}
                style={{ fill: s[5], opacity: s[6] }}
              />
            );
          case "c":
            return (
              <circle
                key={i}
                cx={s[1]}
                cy={s[2]}
                r={s[3]}
                style={{ fill: s[4], opacity: s[5] }}
              />
            );
          case "p":
            return (
              <path key={i} d={s[1]} style={{ fill: s[2], opacity: s[3] }} />
            );
          case "s":
            return (
              <path
                key={i}
                d={s[1]}
                fill="none"
                strokeWidth={s[3]}
                strokeLinecap="round"
                style={{ stroke: s[2], opacity: s[4] }}
              />
            );
          default:
            return (
              <circle
                key={i}
                cx={s[1]}
                cy={s[2]}
                r={s[3]}
                fill="none"
                strokeWidth={s[5]}
                strokeDasharray={`${s[6]} ${s[6]}`}
                style={{ stroke: s[4] }}
              />
            );
        }
      })}
    </svg>
  );
}

/** Seeded scatter: `count` shapes from a maker given three 0–1 draws. */
const scatter = (
  seed: number,
  count: number,
  make: (a: number, b: number, c: number, i: number) => Shape,
): Shape[] =>
  Array.from({ length: count }, (_, i) =>
    make(hash(seed, i * 3), hash(seed, i * 3 + 1), hash(seed, i * 3 + 2), i),
  );

/** A row of book spines standing on a shelf. */
function books(x0: number, x1: number, base: number, seed: number): Shape[] {
  const colours = [
    pig("--danger", 0.48, 0.1, 8),
    pig("--accent", 0.42, 0.08),
    pig("--success", 0.46, 0.07, 20),
    pig("--warn", 0.7, 0.1, -12),
    pig("--accent", 0.3, 0.02),
    pig("--warn", 0.86, 0.04, -20),
  ];
  const out: Shape[] = [];
  let x = x0;
  for (let i = 0; i < 40; i += 1) {
    const w = Math.round(11 + hash(seed, i * 3) * 12);
    const h = Math.round(66 + hash(seed, i * 3 + 1) * 28);
    if (x + w > x1) break;
    const c = colours[Math.floor(hash(seed, i * 3 + 2) * colours.length)];
    out.push(["r", x, base - h, w, h, c ?? colours[0] ?? "", 1, 1.5]);
    x += w + 1;
  }
  return out;
}

/** A window of four panes with trim, and shutters when asked. */
function pane(
  x: number,
  y: number,
  w: number,
  h: number,
  glass: string,
  trim: string,
  shutter?: string,
): Shape[] {
  return [
    ...(shutter
      ? ([
          ["r", x - 34, y, 28, h, shutter],
          ["r", x + w + 6, y, 28, h, shutter],
        ] as Shape[])
      : []),
    ["r", x - 6, y - 6, w + 12, h + 12, trim],
    ["r", x, y, w, h, glass],
    ["r", x + w / 2 - 2, y, 4, h, trim],
    ["r", x, y + h / 2 - 2, w, 4, trim],
  ];
}

const WOOD = pig("--warn", 0.36, 0.05, -32);
const CHAIR = pig("--success", 0.42, 0.05, 32);

const READING_ROOM: Shape[] = [
  ["r", 0, 0, 1000, 1000, pig("--warn", 0.84, 0.035, -18)],
  ["g", 880, 300, 420, 470, pig("--warn", 0.95, 0.08, -8), 0.75],
  ["r", 0, 146, 1000, 10, pig("--warn", 0.74, 0.04, -18)],
  ["r", 0, 728, 1000, 34, pig("--warn", 0.93, 0.015, -18)],
  ["r", 0, 760, 1000, 6, pig("--warn", 0.68, 0.03, -18)],
  ["r", 0, 766, 1000, 234, pig("--warn", 0.5, 0.075, -28)],
  ...[800, 840, 890, 952].map((y): Shape => [
    "r",
    0,
    y,
    1000,
    3,
    pig("--warn", 0.42, 0.06, -28),
  ]),
  ["e", 520, 892, 330, 76, pig("--danger", 0.46, 0.09, 12)],
  ["e", 520, 892, 300, 62, pig("--warn", 0.74, 0.08, -10)],
  ["e", 520, 892, 290, 56, pig("--danger", 0.46, 0.09, 12)],
  // the radiator under the window
  ["r", 408, 642, 184, 80, pig("--warn", 0.92, 0.012, -18), 1, 6],
  ...Array.from({ length: 11 }, (_, i): Shape => [
    "r",
    418 + i * 16,
    650,
    6,
    64,
    pig("--warn", 0.8, 0.015, -18),
    1,
    3,
  ]),
  // the bookshelf
  ["r", 104, 232, 216, 530, WOOD],
  ["r", 116, 244, 192, 506, pig("--warn", 0.28, 0.04, -32)],
  ...[352, 470, 588, 706].flatMap((y, i): Shape[] => [
    ...books(120, 304, y, i + 11),
    ["r", 116, y, 192, 10, WOOD],
  ]),
  // the armchair
  ["r", 640, 548, 170, 160, CHAIR, 1, 34],
  ["r", 626, 676, 198, 74, pig("--success", 0.48, 0.05, 32), 1, 18],
  ["r", 606, 628, 44, 122, pig("--success", 0.38, 0.05, 32), 1, 20],
  ["r", 800, 628, 44, 122, pig("--success", 0.38, 0.05, 32), 1, 20],
  ["r", 628, 748, 10, 34, WOOD],
  ["r", 812, 748, 10, 34, WOOD],
  // the standing lamp
  ["r", 877, 316, 7, 436, pig("--warn", 0.3, 0.03, -20)],
  ["e", 880, 754, 42, 9, pig("--warn", 0.3, 0.03, -20)],
  ["p", "M816 232 L944 232 L918 318 L842 318 Z", pig("--warn", 0.88, 0.08, -6)],
  [
    "p",
    "M842 318 L918 318 L960 760 L800 760 Z",
    pig("--warn", 0.97, 0.06, -6),
    0.14,
  ],
];

const PLASTER = pig("--warn", 0.88, 0.03, -20);
const COURTYARD: Shape[] = [
  ["r", 0, 0, 1000, 1000, pig("--warn", 0.66, 0.07, -20)],
  ["r", 0, 0, 1000, 160, pig("--accent", 0.34, 0.09, 8)],
  ["r", 0, 96, 1000, 64, pig("--danger", 0.6, 0.08, 35), 0.55],
  ["r", 150, 70, 46, 90, pig("--danger", 0.36, 0.06, 18)],
  ["r", 0, 150, 1000, 36, pig("--danger", 0.4, 0.07, 18)],
  ...Array.from({ length: 25 }, (_, i): Shape => [
    "r",
    i * 40 + 8,
    186,
    22,
    12,
    pig("--danger", 0.34, 0.06, 18),
  ]),
  ["r", 0, 676, 1000, 16, PLASTER],
  ...pane(
    80,
    280,
    110,
    160,
    pig("--accent", 0.28, 0.05),
    PLASTER,
    pig("--success", 0.42, 0.06, 45),
  ),
  ...pane(
    820,
    280,
    110,
    160,
    pig("--warn", 0.8, 0.12, -12),
    PLASTER,
    pig("--success", 0.42, 0.06, 45),
  ),
  ...pane(820, 730, 110, 130, pig("--accent", 0.28, 0.05), PLASTER),
  [
    "p",
    "M80 900 L80 760 Q140 700 200 760 L200 900 Z",
    pig("--danger", 0.3, 0.05, 20),
  ],
  ["g", 140, 712, 90, 90, pig("--warn", 0.9, 0.12, -8), 0.6],
  ["r", 132, 700, 16, 24, pig("--warn", 0.9, 0.1, -8), 1, 3],
  ["r", 300, 186, 12, 714, pig("--accent", 0.34, 0.02)],
  ...[260, 420, 580, 740].map((y): Shape => [
    "r",
    294,
    y,
    24,
    8,
    pig("--accent", 0.3, 0.02),
  ]),
  ...scatter(21, 18, (a, b, c, i): Shape => [
    "c",
    Math.round(250 + a * 110),
    Math.round(600 + b * 300),
    Math.round(18 + c * 18),
    pig("--success", i % 2 ? 0.38 : 0.47, 0.085),
  ]),
  ["r", 0, 900, 1000, 100, pig("--warn", 0.34, 0.03, -40)],
  ...Array.from({ length: 16 }, (_, i): Shape => [
    "e",
    i * 66 + 30,
    i % 2 ? 930 : 968,
    26,
    10,
    pig("--warn", 0.42, 0.03, -40),
  ]),
  ["p", "M856 900 L944 900 L932 840 L868 840 Z", pig("--danger", 0.5, 0.1, 15)],
  ["c", 900, 782, 62, pig("--success", 0.44, 0.09, 10)],
  ...[
    [880, 760],
    [924, 790],
    [892, 812],
    [940, 752],
  ].map(([x, y]): Shape => [
    "c",
    x ?? 0,
    y ?? 0,
    7,
    pig("--warn", 0.86, 0.15, 12),
  ]),
];

const PAPERS = [
  pig("--warn", 0.96, 0.02, 10),
  pig("--accent", 0.88, 0.04),
  pig("--danger", 0.86, 0.05, 20),
  pig("--warn", 0.68, 0.07, -20),
];
const SHELF = pig("--warn", 0.45, 0.06, -20);
const PRINT_SHOP: Shape[] = [
  ["r", 0, 0, 1000, 1000, pig("--warn", 0.88, 0.018, 30)],
  ["g", 500, 300, 420, 420, pig("--warn", 0.98, 0.05, 10), 0.7],
  ["r", 498, 0, 4, 112, pig("--accent", 0.3, 0.02)],
  ["p", "M444 170 L556 170 L530 108 L470 108 Z", pig("--accent", 0.32, 0.03)],
  ["e", 500, 174, 64, 14, pig("--warn", 0.95, 0.09, 4), 0.8],
  // paper shelving
  ["r", 40, 200, 10, 520, SHELF],
  ["r", 244, 200, 10, 520, SHELF],
  ...[300, 420, 540, 660].flatMap((y, s): Shape[] => [
    ...[0, 1, 2].map((i): Shape => {
      const h = Math.round(28 + hash(31 + s, i) * 44);
      return [
        "r",
        58 + i * 62,
        y - h,
        56,
        h,
        PAPERS[(s + i) % PAPERS.length] ?? "",
      ];
    }),
    ["r", 40, y, 214, 9, SHELF],
  ]),
  // proofs drying on a line
  ["s", "M700 196 Q850 214 1000 196", pig("--accent", 0.3, 0.02), 2],
  ...[740, 820, 900].flatMap((x, i): Shape[] => [
    ["r", x, 200 + i * 2, 62, 84, PAPERS[0] ?? ""],
    [
      "r",
      x + 10,
      214 + i * 2,
      42,
      30,
      pig("--danger", 0.55, 0.12, 10 + i * 30),
      0.8,
    ],
    ["r", x + 10, 252 + i * 2, 30, 4, pig("--accent", 0.3, 0.02)],
  ]),
  // the type case
  ["r", 760, 340, 200, 380, SHELF],
  ...Array.from({ length: 18 }, (_, i): Shape[] => [
    [
      "r",
      772 + (i % 3) * 62,
      352 + Math.floor(i / 3) * 60,
      54,
      50,
      pig("--warn", 0.52, 0.06, -20),
    ],
    [
      "c",
      799 + (i % 3) * 62,
      377 + Math.floor(i / 3) * 60,
      5,
      pig("--warn", 0.7, 0.1, -5),
    ],
  ]).flat(),
  // the press
  ["r", 70, 560, 190, 160, pig("--accent", 0.22, 0.02), 1, 6],
  ["r", 54, 600, 222, 20, pig("--accent", 0.3, 0.02)],
  [
    "s",
    "M104 560 A62 62 0 1 1 228 560 A62 62 0 1 1 104 560",
    pig("--accent", 0.26, 0.02),
    10,
  ],
  // the bench
  ["r", 0, 720, 1000, 40, pig("--warn", 0.52, 0.07, -25)],
  ["r", 0, 760, 1000, 240, pig("--warn", 0.38, 0.06, -25)],
  ["r", 320, 676, 120, 44, PAPERS[0] ?? ""],
  ["r", 326, 664, 110, 12, PAPERS[1] ?? ""],
  ["r", 566, 690, 110, 18, pig("--accent", 0.24, 0.02), 1, 9],
  ["r", 600, 680, 8, 20, pig("--warn", 0.4, 0.05, -20)],
  ["r", 700, 668, 40, 52, pig("--danger", 0.5, 0.12, 10), 1, 4],
];

const BOATHOUSE: Shape[] = [
  ["r", 0, 0, 1000, 1000, pig("--accent", 0.84, 0.04, -12)],
  [
    "p",
    "M0 210 Q250 168 500 196 T1000 186 L1000 240 L0 240 Z",
    pig("--success", 0.62, 0.04, 20),
  ],
  ["r", 0, 220, 1000, 540, pig("--accent", 0.56, 0.035, -45)],
  ...Array.from({ length: 22 }, (_, i): Shape => {
    const pale = hash(41, i) > 0.7;
    return pale
      ? ["r", i * 46, 220, 44, 540, pig("--accent", 0.6, 0.03, -45), 0.5]
      : ["r", i * 46, 220, 3, 540, pig("--accent", 0.46, 0.03, -45)];
  }),
  [
    "p",
    "M-40 236 L500 66 L1040 236 L1040 256 L500 92 L-40 256 Z",
    pig("--accent", 0.28, 0.025, -30),
  ],
  ["s", "M-40 236 L500 66 L1040 236", pig("--warn", 0.86, 0.02, -30), 8],
  ["r", 0, 740, 1000, 24, pig("--accent", 0.32, 0.02, -45)],
  ["r", 0, 764, 1000, 236, pig("--accent", 0.44, 0.06, -25)],
  ...scatter(42, 14, (a, b, _c, i): Shape => [
    "r",
    Math.round(a * 860),
    790 + i * 15,
    Math.round(60 + b * 160),
    3,
    pig("--accent", 0.72, 0.04, -20),
    0.5,
    1.5,
  ]),
  ["r", 90, 700, 30, 300, pig("--warn", 0.32, 0.03, -30)],
  ["r", 880, 700, 30, 300, pig("--warn", 0.32, 0.03, -30)],
  ["d", 850, 440, 44, pig("--warn", 0.95, 0.01), 22, 1000],
  ["d", 850, 440, 44, pig("--danger", 0.56, 0.17, 5), 22, 34.56],
  ["r", 140, 360, 6, 40, pig("--accent", 0.24, 0.02)],
  ["g", 170, 420, 110, 110, pig("--warn", 0.92, 0.1, -6), 0.6],
  ["r", 152, 392, 36, 52, pig("--warn", 0.86, 0.11, -6), 1, 6],
  ["r", 148, 384, 44, 10, pig("--accent", 0.24, 0.02), 1, 3],
];

const CHART_ROOM: Shape[] = [
  ["r", 0, 0, 1000, 1000, pig("--success", 0.4, 0.05, 15)],
  ["g", 846, 560, 330, 300, pig("--warn", 0.8, 0.1, -10), 0.45],
  ["r", 0, 640, 1000, 84, pig("--success", 0.33, 0.05, 15)],
  ...[40, 280, 520, 760].map((x): Shape => [
    "s",
    `M${x} 656 h200 v52 h-200 Z`,
    pig("--success", 0.46, 0.05, 15),
    3,
  ]),
  // the barometer
  ["c", 170, 330, 72, pig("--warn", 0.62, 0.1, -5)],
  ["c", 170, 330, 58, pig("--warn", 0.93, 0.03, -5)],
  ...Array.from({ length: 12 }, (_, i): Shape => {
    const a = (i / 12) * Math.PI * 2;
    return [
      "c",
      r3(170 + Math.cos(a) * 46),
      r3(330 + Math.sin(a) * 46),
      2.5,
      pig("--accent", 0.3, 0.02),
    ];
  }),
  ["s", "M170 330 L204 300", pig("--danger", 0.45, 0.12), 4],
  // a chart pinned to the wall
  ["r", 770, 210, 180, 212, pig("--warn", 0.9, 0.04, -10)],
  ...[0, 1, 2, 3].map((i): Shape => [
    "s",
    `M780 ${250 + i * 40} Q840 ${226 + i * 44} 940 ${262 + i * 36}`,
    pig("--accent", 0.55, 0.06),
    2,
  ]),
  ["c", 880, 300, 5, pig("--danger", 0.5, 0.15)],
  // the table
  ["r", 0, 724, 1000, 276, pig("--warn", 0.4, 0.07, -25)],
  ["r", 0, 724, 1000, 10, pig("--warn", 0.52, 0.07, -25)],
  ["r", 170, 676, 260, 40, pig("--warn", 0.9, 0.03, -10), 1, 20],
  ["e", 430, 696, 9, 20, pig("--warn", 0.78, 0.04, -10)],
  ["s", "M520 720 L560 640 L600 720", pig("--warn", 0.7, 0.1, -5), 5],
  ["e", 800, 718, 48, 10, pig("--warn", 0.55, 0.11, -5)],
  ["s", "M800 716 L784 610 L840 560", pig("--warn", 0.55, 0.11, -5), 8],
  [
    "p",
    "M812 534 L880 534 L866 590 L826 590 Z",
    pig("--success", 0.3, 0.06, 15),
  ],
  ["e", 846, 592, 40, 10, pig("--warn", 0.95, 0.1, -8), 0.9],
];

const CLAPBOARD = pig("--warn", 0.95, 0.012, -15);
const SASH = pig("--accent", 0.36, 0.04);
const HOUSE_FRONT: Shape[] = [
  ["r", 0, 0, 1000, 1000, pig("--accent", 0.86, 0.035, -18)],
  ["g", 860, 150, 260, 260, pig("--warn", 0.97, 0.06, -10), 0.8],
  ["c", 860, 150, 54, pig("--warn", 0.98, 0.04, -10)],
  [
    "p",
    "M0 700 Q300 600 560 660 T1000 640 L1000 860 L0 860 Z",
    pig("--success", 0.66, 0.05, 30),
  ],
  ["r", 196, 282, 608, 568, CLAPBOARD],
  ...Array.from({ length: 23 }, (_, i): Shape => [
    "r",
    196,
    300 + i * 24,
    608,
    2,
    pig("--warn", 0.8, 0.012, -15),
    0.6,
  ]),
  ["r", 640, 140, 50, 100, pig("--danger", 0.42, 0.06, 15)],
  ["p", "M164 296 L500 112 L836 296 Z", pig("--danger", 0.4, 0.06, 15)],
  ["s", "M164 296 L500 112 L836 296", CLAPBOARD, 8],
  ...pane(236, 368, 76, 110, pig("--accent", 0.4, 0.05), SASH),
  ...pane(688, 368, 76, 110, pig("--accent", 0.4, 0.05), SASH),
  ...pane(236, 676, 76, 110, pig("--accent", 0.4, 0.05), SASH),
  ...pane(688, 676, 76, 110, pig("--accent", 0.4, 0.05), SASH),
  ["r", 444, 676, 112, 174, SASH],
  ["r", 456, 690, 88, 160, pig("--danger", 0.42, 0.1, 5)],
  ["c", 530, 772, 5, pig("--warn", 0.75, 0.12)],
  ...scatter(51, 9, (a, b, c, i): Shape => [
    "c",
    Math.round(410 + a * 30),
    Math.round(640 + b * 200),
    Math.round(10 + c * 10),
    pig(i % 3 ? "--success" : "--danger", i % 3 ? 0.45 : 0.6, 0.11),
  ]),
  ["r", 0, 850, 1000, 150, pig("--success", 0.58, 0.09, 10)],
  [
    "p",
    "M456 850 L544 850 L620 1000 L380 1000 Z",
    pig("--warn", 0.8, 0.03, -10),
  ],
  ...scatter(54, 7, (a, b, _c, i): Shape => [
    "c",
    Math.round(30 + i * 34 + a * 20),
    Math.round(470 + b * 220),
    Math.round(60 + hash(56, i) * 40),
    pig("--success", i % 2 ? 0.42 : 0.5, 0.09, 5),
  ]),
  ["r", 620, 800, 380, 64, pig("--success", 0.4, 0.08, 5), 1, 32],
];

export const defaultRoomWithinLevels: RoomWithinLevel[] = [
  {
    id: "reading-room",
    alt: "A warm reading room with a bookshelf, a lamp and an armchair, and a tall window on the far wall.",
    caption: "The reading room",
    detail: "Coldbrook House · first floor",
    art: <Scene shapes={READING_ROOM} />,
    window: { x: 500, y: 430, size: 0.36 },
  },
  {
    id: "courtyard",
    alt: "A plaster courtyard facade at dusk with green shutters; one window across the way is lit.",
    caption: "Across the courtyard",
    detail: "Rue des Ormes · 6 pm",
    art: <Scene shapes={COURTYARD} />,
    window: { x: 520, y: 470, size: 0.32 },
  },
  {
    id: "print-shop",
    alt: "The back room of a print shop: paper on the shelves, proofs drying on a line, a framed proof on the wall.",
    caption: "The print shop",
    detail: "Fieldline Press · back room",
    art: <Scene shapes={PRINT_SHOP} />,
    window: { x: 500, y: 440, size: 0.34 },
  },
  {
    id: "boathouse",
    alt: "A weathered blue boathouse over still water, a lantern and a lifebuoy on its boards.",
    caption: "The proof: a boathouse",
    detail: "Plate 4 · Saltmarsh",
    art: <Scene shapes={BOATHOUSE} />,
    window: { x: 480, y: 450, size: 0.34 },
  },
  {
    id: "chart-room",
    alt: "A green chart room with a barometer, a pinned chart and a brass lamp over the table.",
    caption: "Inside, the chart room",
    detail: "Waylight Pilots · winter",
    art: <Scene shapes={CHART_ROOM} />,
    window: { x: 510, y: 420, size: 0.33 },
  },
  {
    id: "house",
    alt: "A white house in morning light. Its upstairs window shows the reading room.",
    caption: "The photograph",
    detail: "Coldbrook House · 1961",
    art: <Scene shapes={HOUSE_FRONT} />,
    window: { x: 500, y: 470, size: 0.3 },
  },
];

/* --------------------------------- frames --------------------------------- */

/** A thickness proportional to the opening's shorter side. */
const thick = (f: number, k: number) => `${r3(f * k * 100)}cqmin`;

function FrameArt({ frame, f }: { frame: RoomWithinFrame; f: number }) {
  if (frame === "none") return null;
  if (frame === "window") {
    const t = thick(f, 0.075);
    return (
      <>
        <span
          aria-hidden
          className="pointer-events-none absolute border-solid"
          style={{
            inset: `calc(-1 * ${t})`,
            borderWidth: t,
            borderTopColor: pig("--warn", 0.95, 0.012, -20),
            borderLeftColor: pig("--warn", 0.9, 0.014, -20),
            borderRightColor: pig("--warn", 0.8, 0.016, -20),
            borderBottomColor: pig("--warn", 0.76, 0.016, -20),
            boxShadow: `0 ${thick(f, 0.02)} ${thick(f, 0.06)} oklch(0 0 0 / 0.22)`,
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: `calc(-2 * ${t})`,
            right: `calc(-2 * ${t})`,
            top: `calc(100% + ${t})`,
            height: thick(f, 0.06),
            backgroundImage: `linear-gradient(to bottom, ${pig("--warn", 0.96, 0.01, -20)}, ${pig("--warn", 0.78, 0.016, -20)})`,
            boxShadow: `0 ${thick(f, 0.025)} ${thick(f, 0.05)} oklch(0 0 0 / 0.25)`,
          }}
        />
      </>
    );
  }
  if (frame === "gilt") {
    const t = thick(f, 0.13);
    const lip = thick(f, 0.03);
    return (
      <>
        <span
          aria-hidden
          className="pointer-events-none absolute border-solid"
          style={{
            inset: `calc(-1 * (${t} + ${lip}))`,
            borderWidth: t,
            borderTopColor: pig("--warn", 0.84, 0.12, -8),
            borderLeftColor: pig("--warn", 0.74, 0.12, -8),
            borderRightColor: pig("--warn", 0.58, 0.1, -8),
            borderBottomColor: pig("--warn", 0.5, 0.09, -8),
            boxShadow: `0 ${thick(f, 0.04)} ${thick(f, 0.1)} oklch(0 0 0 / 0.32)`,
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute border-solid"
          style={{
            inset: `calc(-1 * ${lip})`,
            borderWidth: lip,
            borderTopColor: pig("--warn", 0.86, 0.04, -15),
            borderLeftColor: pig("--warn", 0.9, 0.04, -15),
            borderRightColor: pig("--warn", 0.95, 0.03, -15),
            borderBottomColor: pig("--warn", 0.96, 0.03, -15),
          }}
        />
      </>
    );
  }
  const matW = thick(f, 0.2);
  const rim = thick(f, 0.035);
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          inset: `calc(-1 * (${matW} + ${rim}))`,
          backgroundColor: pig("--accent", 0.24, 0.015),
          boxShadow: `0 ${thick(f, 0.03)} ${thick(f, 0.08)} oklch(0 0 0 / 0.28)`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          inset: `calc(-1 * ${matW})`,
          backgroundColor: pig("--warn", 0.96, 0.012, -10),
          boxShadow: `inset 0 0 0 ${thick(f, 0.008)} oklch(0 0 0 / 0.08)`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          inset: `calc(-1 * ${thick(f, 0.012)})`,
          backgroundColor: pig("--warn", 0.99, 0.006, -10),
        }}
      />
    </>
  );
}

/* -------------------------------- component ------------------------------- */

type Running = { controls: AnimationPlaybackControls; target: number };

type Live = {
  n: number;
  L: number;
  easing: RoomWithinEasing;
  motionSafe: boolean;
  loop: boolean;
  list: RoomWithinLevel[];
  onValueChange?: (level: number) => void;
};

const idOf = (list: RoomWithinLevel[], j: number) =>
  list[j]?.id ?? `level-${j}`;

/** The item a place in the chain shows: past the deepest, the story starts again. */
const itemAt = (j: number, n: number) => (j < n ? j : j - n);

const HAZE = pig("--accent", 0.3, 0.04);
const SHEEN =
  "linear-gradient(115deg, transparent 34%, oklch(1 0 0 / 0.2) 42%, transparent 50%, transparent 58%, oklch(1 0 0 / 0.1) 63%, transparent 70%)";

/**
 * A story told as one long zoom. The stage is its own scroll container; in
 * it sits a picture whose far wall holds an opening — a window, a framed
 * proof, a lit shop window — exactly the shape of the stage, and scrolling
 * zooms into that opening until it fills the stage and is the next picture,
 * which holds the next opening. Scrolling back zooms out level by level.
 *
 * The camera between two levels is a pure scale about the fixed point of the
 * map from the stage onto the opening, its scale geometric in the scroll, so
 * the opening grows from one steady point and a level boundary is the same
 * frame on both sides. It is ONE transform on one layer, written straight
 * from the scroll position; the pictures are flat siblings laid into each
 * other's openings by CSS from the same sums (container units), so the first
 * paint is right at any size and re-basing the chain never remounts a
 * picture. As the camera nears an opening its glass sheen slides away and
 * the far room's haze lifts. Captions cross-fade with the zoom, a depth gauge
 * follows it, and a click on the opening or Page Down travels into it on
 * springs.drift. Under reduced motion the pictures cross-fade full-frame.
 */
export function RoomWithin({
  items = defaultRoomWithinLevels,
  depth = 5,
  frame = "window",
  easing = "dwell",
  value,
  defaultValue = 0,
  onValueChange,
  scrollLength = 1.2,
  loop = true,
  captions = true,
  rail = true,
  hint = true,
  height,
  label = "Room within",
  disabled = false,
  className,
}: RoomWithinProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list = items.length > 0 ? items : defaultRoomWithinLevels;
  const n = clamp(Math.round(depth), 1, Math.min(6, list.length));
  const last = n - 1;
  const L = clamp(scrollLength, 0.5, 3);
  const winOf = (j: number) => list[itemAt(j, n)]?.window ?? DEFAULT_WINDOW;
  const hasOpening = (j: number) => j < last || (loop && n > 1);

  const start = clamp(Math.round(value ?? defaultValue), 0, last);
  /** Where the story opened: the scroll cue only shows when it began at the start. */
  const [first] = React.useState(start);
  /** The camera's level: the picture it is in or zooming out of. */
  const [level, setLevel] = React.useState(start);
  /** The nearest picture: what the captions, gauge and value say. */
  const [shown, setShown] = React.useState(start);
  const [said, setSaid] = React.useState("");
  const root = Math.max(0, Math.min(level, last) - 1);

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const cameraRef = React.useRef<HTMLDivElement | null>(null);
  const markerRef = React.useRef<HTMLSpanElement | null>(null);
  const cueRef = React.useRef<HTMLDivElement | null>(null);
  const levelRefs = React.useRef(new Map<string, HTMLElement>());
  const veilRefs = React.useRef(new Map<string, HTMLElement>());
  const glassRefs = React.useRef(new Map<string, HTMLElement>());
  const captionRefs = React.useRef(new Map<string, HTMLElement>());
  /** Keeps the per-frame targets in maps keyed by level id. */
  const register = React.useCallback(
    (
      kind: "level" | "veil" | "glass" | "caption",
      id: string,
      node: HTMLElement | null,
    ) => {
      const map =
        kind === "level"
          ? levelRefs.current
          : kind === "veil"
            ? veilRefs.current
            : kind === "glass"
              ? glassRefs.current
              : captionRefs.current;
      if (node) map.set(id, node);
      else map.delete(id);
    },
    [],
  );
  const aspect = React.useRef(4 / 3);
  const raw = React.useRef(start);
  const levelRef = React.useRef(start);
  const shownRef = React.useRef(start);
  /** The last level the host was told about (or told us). */
  const reported = React.useRef(start);
  const domRoot = React.useRef(root);
  const nudge = React.useRef(0);
  const running = React.useRef<Running | null>(null);
  const hintAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const hinted = React.useRef(false);
  const lastHidden = React.useRef(-1);

  const live = React.useRef<Live>({
    n,
    L,
    easing,
    motionSafe,
    loop,
    list,
    onValueChange,
  });
  // Before any layout effect below reads it.
  React.useLayoutEffect(() => {
    live.current = {
      n,
      L,
      easing,
      motionSafe,
      loop,
      list,
      onValueChange,
    };
  });

  /** Writes the camera, veils, captions and gauge for the scroll as it is now. */
  const apply = React.useCallback(() => {
    const k = live.current;
    if (!scrollerRef.current) return;
    const top = k.n - 1;
    const p0 = clamp(shape(clamp(raw.current, 0, top), k.easing), 0, top);
    const p = clamp(p0 + nudge.current, 0, top);
    const floorP = Math.min(top, Math.floor(p + 1e-9));
    if (floorP !== levelRef.current) {
      levelRef.current = floorP;
      setLevel(floorP);
    }

    const a = aspect.current;
    const from = domRoot.current;
    const opening = (j: number) =>
      openingAt(k.list[itemAt(j, k.n)]?.window ?? DEFAULT_WINDOW, a);
    const cam = cameraRef.current;

    if (k.motionSafe) {
      // The camera's rect in the chain root's shares of the stage.
      let ox = 0;
      let oy = 0;
      let s = 1;
      const kk = clamp(floorP, from, Math.min(top, from + 4));
      const t = clamp(p - kk, 0, 1);
      for (let j = from; j < kk; j += 1) {
        const o = opening(j);
        ox += s * o.x;
        oy += s * o.y;
        s *= o.f;
      }
      if (kk < top && t > 0) {
        const o = opening(kk);
        const z = Math.pow(o.f, t);
        ox += s * (o.x / (1 - o.f)) * (1 - z);
        oy += s * (o.y / (1 - o.f)) * (1 - z);
        s *= z;
      }
      if (cam) {
        cam.style.transform =
          s > 0.99999 && Math.abs(ox) < 1e-6 && Math.abs(oy) < 1e-6
            ? "none"
            : `scale(${r4(1 / s)}) translate(${r4(-ox * 100)}%, ${r4(-oy * 100)}%)`;
      }
      // Pictures the camera is wholly inside need not paint.
      if (lastHidden.current !== floorP) {
        lastHidden.current = floorP;
        for (let j = 0; j < k.n; j += 1) {
          const node = levelRefs.current.get(idOf(k.list, j));
          if (node) node.style.visibility = j < floorP ? "hidden" : "visible";
        }
      }
      for (let j = 1; j <= k.n; j += 1) {
        const id = j < k.n ? idOf(k.list, j) : "loop";
        const approach = clamp01(p - (j - 1));
        const veil = veilRefs.current.get(id);
        if (veil)
          veil.style.opacity = String(r3(0.26 * Math.pow(1 - approach, 1.5)));
        const glass = glassRefs.current.get(id);
        if (glass) {
          glass.style.opacity = String(r3(1 - approach));
          glass.style.backgroundPosition = `${r3(approach * 100)}% 0%`;
        }
      }
    } else {
      if (cam) cam.style.transform = "none";
      // The next picture cross-fades in over the current one.
      const upper = levelRefs.current.get("fade");
      if (upper) upper.style.opacity = String(r3(clamp01(p - floorP)));
    }

    for (let i = 0; i < k.n; i += 1) {
      const node = captionRefs.current.get(idOf(k.list, i));
      if (!node) continue;
      const d = p - i;
      node.style.opacity = String(r3(clamp01(1 - Math.abs(d) * 2.4)));
      node.style.transform = k.motionSafe
        ? `translateY(${r3(clamp(-d * 10, -10, 10))}px)`
        : "none";
    }
    if (markerRef.current) {
      markerRef.current.style.top = `${r3(top > 0 ? (p / top) * 100 : 0)}%`;
    }
    if (cueRef.current) {
      cueRef.current.style.opacity = String(r3(clamp01(1 - raw.current * 6)));
    }

    const nearest = clamp(Math.round(p0), 0, top);
    if (nearest !== shownRef.current) {
      shownRef.current = nearest;
      setShown(nearest);
      const item = k.list[nearest];
      setSaid(
        `Level ${nearest + 1} of ${k.n}: ${item?.caption ?? item?.alt ?? ""}.`,
      );
    }
    // A level reached by the visitor's own scroll is reported here (and so is
    // where an interrupted travel came to rest); a travel started by a key or
    // a click reported its target as it began.
    if (!running.current && nearest !== reported.current) {
      reported.current = nearest;
      k.onValueChange?.(nearest);
    }
  }, []);

  const stopTravel = React.useCallback(() => {
    const r = running.current;
    running.current = null;
    r?.controls.stop();
    const el = scrollerRef.current;
    if (el) el.style.scrollSnapType = "";
  }, []);

  /** Travels to a level: on springs.drift, or at once under reduced motion. */
  const travel = React.useCallback(
    (to: number, user: boolean) => {
      const k = live.current;
      const el = scrollerRef.current;
      if (!el) return;
      const target = clamp(Math.round(to), 0, k.n - 1);
      const top = target * k.L * el.clientHeight;
      stopTravel();
      hintAnim.current?.stop();
      hinted.current = true;
      nudge.current = 0;
      if (user && target !== reported.current) {
        reported.current = target;
        k.onValueChange?.(target);
      }
      if (!k.motionSafe || Math.abs(el.scrollTop - top) < 1) {
        el.scrollTo({ top, behavior: "instant" });
        raw.current = top / Math.max(1, k.L * el.clientHeight);
        apply();
        return;
      }
      // Snap points would pull a scripted scroll back on every frame.
      el.style.scrollSnapType = "none";
      const controls = animate(el.scrollTop, top, {
        ...springs.drift,
        onUpdate: (v) => {
          el.scrollTop = v;
        },
        onComplete: () => {
          if (running.current?.controls !== controls) return;
          running.current = null;
          el.style.scrollSnapType = "";
          apply();
        },
      });
      running.current = { controls, target };
    },
    [apply, stopTravel],
  );

  // A re-laid chain (or a changed prop): put the camera back in its place
  // before the browser paints the new layout.
  // Every commit: React may have re-written a style this layout owns (a
  // re-laid chain, a new level's visibility), so put the scroll's frame back
  // before the browser paints.
  React.useLayoutEffect(() => {
    domRoot.current = root;
    lastHidden.current = -1;
    apply();
  });

  // A host that changes `value` travels there.
  React.useEffect(() => {
    if (value === undefined) return;
    const to = clamp(Math.round(value), 0, last);
    reported.current = to;
    if (running.current?.target === to) return;
    if (to === shownRef.current && !running.current) return;
    travel(to, false);
  }, [value, last, travel]);

  React.useEffect(
    () => () => {
      running.current?.controls.stop();
      running.current = null;
      hintAnim.current?.stop();
    },
    [],
  );

  const bindScroller = React.useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node;
      if (!node) return;
      const measure = () => {
        const w = node.clientWidth;
        const h = node.clientHeight;
        if (w < 1 || h < 1) return;
        aspect.current = w / h;
        // Keep the same level in view: the track grew or shrank with the box.
        const top = raw.current * live.current.L * h;
        if (!running.current && Math.abs(node.scrollTop - top) > 1) {
          node.scrollTop = top;
        }
        apply();
      };
      const onScroll = () => {
        const h = node.clientHeight;
        if (h < 1) return;
        raw.current = node.scrollTop / (live.current.L * h);
        if (raw.current > 0.02 && !hinted.current) {
          hinted.current = true;
          hintAnim.current?.stop();
          nudge.current = 0;
        }
        apply();
      };
      const halt = () => {
        if (running.current) stopTravel();
      };
      measure();
      const sizer = new ResizeObserver(measure);
      sizer.observe(node);
      node.addEventListener("scroll", onScroll, { passive: true });
      node.addEventListener("wheel", halt, { passive: true });
      node.addEventListener("touchstart", halt, { passive: true });
      const lean = (to: number, then?: () => void) => {
        hintAnim.current = animate(nudge.current, to, {
          duration: 0.9,
          ease: easings.move,
          onUpdate: (v) => {
            nudge.current = v;
            apply();
          },
          onComplete: then,
        });
      };
      let wait = 0;
      const watcher = new IntersectionObserver((entries) => {
        const seen = entries[entries.length - 1]?.isIntersecting;
        if (!seen || hinted.current || !live.current.motionSafe) return;
        if (raw.current > 0.001 || running.current || hintAnim.current) return;
        // One lean into the window and back, so the stage says it zooms.
        window.clearTimeout(wait);
        wait = window.setTimeout(() => {
          if (hinted.current || raw.current > 0.001) return;
          lean(0.14, () =>
            lean(0, () => {
              hinted.current = true;
              hintAnim.current = null;
            }),
          );
        }, 700);
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        window.clearTimeout(wait);
        node.removeEventListener("scroll", onScroll);
        node.removeEventListener("wheel", halt);
        node.removeEventListener("touchstart", halt);
        hintAnim.current?.stop();
        hintAnim.current = null;
        nudge.current = 0;
      };
    },
    [apply, stopTravel],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    const from = running.current?.target ?? shownRef.current;
    let to: number | null = null;
    const space = event.key === " ";
    if (
      event.key === "PageDown" ||
      event.key === "Enter" ||
      (space && !event.shiftKey)
    )
      to = from + 1;
    else if (
      event.key === "PageUp" ||
      event.key === "Backspace" ||
      (space && event.shiftKey)
    )
      to = from - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = last;
    else if (/^[1-9]$/.test(event.key)) to = Number(event.key) - 1;
    if (to === null) return;
    event.preventDefault();
    if (event.repeat && (event.key === "Enter" || space)) return;
    travel(clamp(to, 0, last), true);
  };

  const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const hit = (event.target as Element | null)?.closest("[data-room-level]");
    if (!hit) return;
    const at = Number(hit.getAttribute("data-room-level"));
    const here = running.current?.target ?? shownRef.current;
    if (Number.isFinite(at) && at > here && here < last) travel(here + 1, true);
  };

  /* ------------------------------ layout ------------------------------ */

  /** The CSS transform that lays chain place `j` into the chain from `from`. */
  const chainCss = (from: number, j: number) => {
    const parts: string[] = [];
    for (let i = from; i < j; i += 1) {
      const o = openingCss(winOf(i));
      parts.push(`translate(${o.left}, ${o.top}) scale(${o.f})`);
    }
    return parts.length ? parts.join(" ") : "none";
  };

  /** The camera at a whole level: the inverse of that level's place. */
  const cameraCss = (from: number, j: number) => {
    if (j <= from) return "none";
    const o = openingCss(winOf(from));
    return `scale(${r4(1 / o.f)}) translate(calc(-1 * ${o.left}), calc(-1 * ${o.top}))`;
  };

  const renderArt = (item: RoomWithinLevel | undefined) => (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: "max(100cqw, 100cqh)", height: "max(100cqw, 100cqh)" }}
    >
      {item?.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src}
          alt=""
          draggable={false}
          className="block size-full object-cover"
        />
      ) : (
        (item?.art ?? <div className="size-full bg-muted" />)
      )}
    </div>
  );

  const renderFrame = (j: number) => {
    const o = openingCss(winOf(j));
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ left: o.left, top: o.top, width: o.width, height: o.height }}
      >
        <FrameArt frame={frame} f={o.f} />
      </div>
    );
  };

  /** The haze and the glass over a picture seen through its parent's opening. */
  const renderVeils = (id: string) => (
    <>
      <span
        aria-hidden
        ref={(node) => register("veil", id, node)}
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: HAZE, opacity: 0.26 }}
      />
      {frame === "none" ? null : (
        <span
          aria-hidden
          ref={(node) => register("glass", id, node)}
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: SHEEN,
            backgroundSize: "220% 100%",
            backgroundPosition: "0% 0%",
          }}
        />
      )}
    </>
  );

  const levelClass = "absolute inset-0 overflow-clip [container-type:size]";
  const levels: React.ReactNode[] = [];
  const camLevel = Math.min(level, last);
  if (motionSafe) {
    // The camera's picture, the one it came from, and three deeper ones.
    const top = Math.min(last, camLevel + 3);
    for (let j = root; j <= top; j += 1) {
      const id = idOf(list, j);
      const item = list[j];
      const named = j === shown;
      levels.push(
        <div
          key={id}
          data-room-level={j}
          ref={(node) => register("level", id, node)}
          role={named ? "img" : undefined}
          aria-label={named ? item?.alt : undefined}
          aria-hidden={named ? undefined : true}
          className={cn(
            levelClass,
            "origin-top-left",
            j > shown && !disabled && "cursor-zoom-in",
          )}
          style={{
            transform: chainCss(root, j),
            visibility: j < camLevel ? "hidden" : "visible",
          }}
        >
          {renderArt(item)}
          {hasOpening(j) ? renderFrame(j) : null}
          {j > root ? renderVeils(id) : null}
        </div>,
      );
    }
    if (top === last && hasOpening(last)) {
      // The deepest picture's opening holds the first room again, and its
      // window the second.
      for (const v of [n, n + 1]) {
        const item = list[itemAt(v, n)];
        levels.push(
          <div
            key={v === n ? "loop" : "loop-2"}
            data-room-level={v}
            aria-hidden
            className={cn(levelClass, "origin-top-left")}
            style={{ transform: chainCss(root, v) }}
          >
            {renderArt(item)}
            {v === n ? renderFrame(v) : null}
            {v === n ? renderVeils("loop") : null}
          </div>,
        );
      }
    }
  } else {
    // Reduced motion: two full-frame pictures, the next fading in over the first.
    const pair = camLevel < last ? [camLevel, camLevel + 1] : [camLevel];
    pair.forEach((j, slot) => {
      const item = list[j];
      const o = openingCss(winOf(j));
      const named = j === shown;
      levels.push(
        <div
          key={`${idOf(list, j)}-still`}
          data-room-level={j}
          ref={(node) => register("level", slot === 1 ? "fade" : "still", node)}
          role={named ? "img" : undefined}
          aria-label={named ? item?.alt : undefined}
          aria-hidden={named ? undefined : true}
          className={levelClass}
          style={{ opacity: slot === 1 ? 0 : 1 }}
        >
          {renderArt(item)}
          {hasOpening(j) ? (
            <>
              {renderFrame(j)}
              <div
                data-room-level={j + 1}
                className={cn(
                  "[container-type:size] absolute overflow-clip",
                  !disabled && "cursor-zoom-in",
                )}
                style={{
                  left: o.left,
                  top: o.top,
                  width: o.width,
                  height: o.height,
                }}
              >
                {renderArt(list[itemAt(j + 1, n)])}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{ backgroundColor: HAZE, opacity: 0.2 }}
                />
              </div>
            </>
          ) : null}
        </div>,
      );
    });
  }

  const trackHeight = `calc(100cqh + ${r3((n - 1) * L)} * 100cqh)`;
  const shownItem = list[shown];

  return (
    <div
      className={cn(
        "group/room-within relative isolate w-full overflow-clip rounded-3 bg-muted select-none",
        height === undefined && "h-[420px]",
        disabled && "opacity-60",
        className,
      )}
      style={height === undefined ? undefined : { height }}
    >
      <div
        ref={bindScroller}
        role="region"
        aria-roledescription="zooming story"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        className={cn(
          "[container-type:size] absolute inset-0 [scrollbar-width:none] overflow-x-hidden rounded-3 [&::-webkit-scrollbar]:hidden",
          disabled ? "overflow-y-hidden" : "overflow-y-auto",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{
          scrollSnapType:
            easing === "snap" && !disabled ? "y mandatory" : undefined,
        }}
      >
        <div className="relative w-full" style={{ height: trackHeight }}>
          {easing === "snap"
            ? Array.from({ length: n }, (_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 h-px"
                  style={{
                    top: `calc(${r3(i * L)} * 100cqh)`,
                    scrollSnapAlign: "start",
                  }}
                />
              ))
            : null}
          <div
            className="sticky top-0 h-[100cqh] w-full overflow-clip"
            onClick={onStageClick}
          >
            <div
              ref={cameraRef}
              className="absolute inset-0 origin-top-left"
              style={{
                transform: motionSafe ? cameraCss(root, camLevel) : "none",
              }}
            >
              {levels}
            </div>

            {captions ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 grid px-[clamp(14px,4cqw,28px)] pt-16 pb-[clamp(14px,4cqw,24px)]"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, oklch(0.16 0.02 260 / 0.62), oklch(0.16 0.02 260 / 0.26) 55%, transparent)",
                }}
              >
                {list.slice(0, n).map((item, i) => (
                  <div
                    key={idOf(list, i)}
                    ref={(node) => register("caption", idOf(list, i), node)}
                    className="col-start-1 row-start-1 flex min-w-0 flex-col gap-1 self-end pr-10"
                    style={{ opacity: i === start ? 1 : 0 }}
                  >
                    <span className="truncate font-mono text-[10px] tracking-[0.08em] text-[oklch(0.92_0.02_80)] uppercase">
                      {i + 1} / {n}
                      {item.detail ? ` · ${item.detail}` : ""}
                    </span>
                    <span className="truncate text-[clamp(16px,3.4cqw,24px)] leading-tight font-medium text-[oklch(0.985_0.008_80)]">
                      {item.caption ?? item.alt}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {rail && n > 1 ? (
              <div
                className="absolute top-1/2 right-[clamp(10px,2.4cqw,18px)] flex -translate-y-1/2 flex-col items-center rounded-full bg-[oklch(0.16_0.02_260/0.32)] px-1.5 py-2.5 backdrop-blur-sm"
                style={{ height: `min(60cqh, ${n * 30 + 20}px)` }}
              >
                <div className="relative h-full w-4">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[oklch(1_0_0/0.3)]"
                  />
                  {Array.from({ length: n }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      tabIndex={-1}
                      aria-label={`Go to ${list[i]?.caption ?? list[i]?.alt ?? `level ${i + 1}`}`}
                      aria-current={i === shown ? "step" : undefined}
                      disabled={disabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        travel(i, true);
                      }}
                      className="absolute left-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center disabled:cursor-not-allowed"
                      style={{ top: `${r3(last > 0 ? (i / last) * 100 : 0)}%` }}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full transition-colors",
                          i === shown
                            ? "bg-[oklch(1_0_0/0.95)]"
                            : "bg-[oklch(1_0_0/0.45)]",
                        )}
                      />
                    </button>
                  ))}
                  <span
                    ref={markerRef}
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[oklch(0.985_0.008_80)] shadow-[0_0_0_2px_oklch(0.16_0.02_260/0.35)]"
                    style={{
                      top: `${r3(last > 0 ? (start / last) * 100 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {hint && n > 1 && first === 0 ? (
              <div
                ref={cueRef}
                aria-hidden
                className="pointer-events-none absolute top-[clamp(12px,3cqw,20px)] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[oklch(0.16_0.02_260/0.4)] px-3 py-1 font-mono text-[10px] tracking-[0.08em] text-[oklch(0.985_0.008_80)] uppercase backdrop-blur-sm"
                style={{ transitionDuration: `${durations.slow}s` }}
              >
                <svg
                  viewBox="0 0 12 12"
                  className="size-3 shrink-0"
                  aria-hidden
                >
                  <path
                    d="M3 4.5 L6 7.5 L9 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Scroll in
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <p id={hintId} className="sr-only">
        Each picture holds the next one. Scroll, or press Page Down, Space or
        Enter, to go in through the opening; Page Up, Shift and Space, or
        Backspace to come back out. Home and End go to the first and last
        picture. Now showing {shownItem?.caption ?? shownItem?.alt ?? ""}.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
