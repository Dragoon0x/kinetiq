"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GlassineAlbumPhoto = {
  /** Image URL. Omit it to draw a plain print. */
  src?: string;
  /** What the photograph shows, for assistive technology. */
  alt: string;
  /** Typed under the print. */
  caption?: string;
};

export type GlassineAlbumTone = "cream" | "black" | "dove" | "sage";

export type GlassineAlbumProps = {
  /** The prints, in order: one per page, both sides of every leaf. @default defaultGlassineAlbumPhotos */
  photos?: GlassineAlbumPhoto[];
  /** The album's name, lettered on the bookplate inside the front cover. @default "Summers at Saltmarsh" */
  title?: string;
  /** Controlled: the open spread, 0 (inside the front cover) to the last. */
  value?: number;
  /** Initial spread when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, tap or key that turned to a new spread. */
  onValueChange?: (spread: number) => void;
  /** How heavy the card pages are, 0 to 1: heavy pages turn slower, with more inertia. @default 0.6 */
  weight?: number;
  /** How opaque the glassine is, 0 to 1, and so how misted a print beneath it looks. @default 0.55 */
  tissue?: number;
  /** The card the pages are made of. @default "black" */
  paperTone?: GlassineAlbumTone;
  /** How much the tissue billows as it floats over, 0 to 1. @default 0.6 */
  flutter?: number;
  /** Mount the prints with photo corners. @default true */
  corners?: boolean;
  /** Print the faint cobweb on the tissue. @default true */
  printed?: boolean;
  /** The album's accessible name. @default the title */
  label?: string;
  /** Paper sounds for the tissue and the pages the visitor turns. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- prints --------------------------------- */

/** A sepia or silver print tone at a lightness, as an rgb() string. */
function inkOf(silver: boolean) {
  return (l: number) => {
    const v = Math.max(0, Math.min(1, l));
    const r = silver ? v * 0.98 : Math.min(1, v * 1.07);
    const g = silver ? v * 0.985 : v * 0.96;
    const b = silver ? v : v * 0.83;
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  };
}

function print(body: string, silver: boolean): string {
  const t = inkOf(silver);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="v" cx="50%" cy="48%" r="72%"><stop offset="0.62" stop-color="${t(0.5)}" stop-opacity="0"/><stop offset="1" stop-color="${t(0.12)}" stop-opacity="0.55"/></radialGradient></defs>${body}<rect width="400" height="300" fill="url(#v)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function sky(
  t: (l: number) => string,
  top: number,
  low: number,
  horizon: number,
) {
  return `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t(top)}"/><stop offset="1" stop-color="${t(low)}"/></linearGradient></defs><rect width="400" height="${horizon}" fill="url(#s)"/>`;
}

function pier(): string {
  const t = inkOf(false);
  let posts = "";
  for (let i = 0; i < 9; i += 1) {
    const k = i / 8;
    const y = 300 - k * 126;
    const s = 1 - k * 0.86;
    const lx = 40 + k * 196;
    const rx = 168 + k * 74;
    posts += `<rect x="${(lx - 3 * s).toFixed(1)}" y="${y.toFixed(1)}" width="${(6 * s).toFixed(1)}" height="${(26 * s).toFixed(1)}" fill="${t(0.2)}"/><rect x="${(rx - 3 * s).toFixed(1)}" y="${y.toFixed(1)}" width="${(6 * s).toFixed(1)}" height="${(26 * s).toFixed(1)}" fill="${t(0.2)}"/>`;
  }
  return print(
    `${sky(t, 0.78, 0.94, 172)}<rect y="172" width="400" height="128" fill="${t(0.56)}"/><rect y="172" width="400" height="10" fill="${t(0.7)}"/><path d="M300 172 Q330 160 360 166 T400 162 V172Z" fill="${t(0.46)}"/><circle cx="96" cy="70" r="26" fill="${t(0.97)}" opacity="0.7"/><path d="M28 300 L236 174 L244 174 L182 300Z" fill="${t(0.34)}"/><path d="M28 300 L236 174 L238 176 L40 300Z" fill="${t(0.5)}"/>${posts}<rect x="237" y="160" width="3" height="12" fill="${t(0.18)}"/><circle cx="238.5" cy="158" r="2" fill="${t(0.18)}"/><path d="M0 230 Q100 222 200 232 T400 228" stroke="${t(0.68)}" stroke-width="2" fill="none" opacity="0.6"/>`,
    false,
  );
}

function orchard(): string {
  const t = inkOf(true);
  let trees = "";
  for (let row = 0; row < 4; row += 1) {
    const y = 150 + row * row * 9 + row * 20;
    const s = 0.45 + row * 0.28;
    for (let i = -1; i < 7; i += 1) {
      const x = 30 + i * (62 * s) + (row % 2) * 28 * s;
      trees += `<rect x="${(x - 2 * s).toFixed(1)}" y="${y.toFixed(1)}" width="${(4 * s).toFixed(1)}" height="${(18 * s).toFixed(1)}" fill="${t(0.22)}"/><ellipse cx="${x.toFixed(1)}" cy="${(y - 6 * s).toFixed(1)}" rx="${(22 * s).toFixed(1)}" ry="${(18 * s).toFixed(1)}" fill="${t(0.3 + row * 0.04)}"/><ellipse cx="${(x - 6 * s).toFixed(1)}" cy="${(y - 12 * s).toFixed(1)}" rx="${(9 * s).toFixed(1)}" ry="${(7 * s).toFixed(1)}" fill="${t(0.52)}"/>`;
    }
  }
  return print(
    `${sky(t, 0.82, 0.92, 150)}<path d="M0 150 Q120 118 230 138 T400 126 V300 H0Z" fill="${t(0.66)}"/><path d="M0 166 Q200 150 400 168 V300 H0Z" fill="${t(0.6)}"/>${trees}<path d="M0 286 H400 M0 270 H400" stroke="${t(0.28)}" stroke-width="2"/><path d="M20 262 V300 M120 262 V300 M220 262 V300 M320 262 V300" stroke="${t(0.28)}" stroke-width="3"/>`,
    true,
  );
}

function lighthouse(): string {
  const t = inkOf(false);
  return print(
    `${sky(t, 0.7, 0.9, 200)}<rect y="200" width="400" height="100" fill="${t(0.5)}"/><path d="M0 214 Q200 206 400 216" stroke="${t(0.64)}" stroke-width="2" fill="none"/><path d="M180 300 L196 150 Q240 132 300 140 L400 148 V300Z" fill="${t(0.3)}"/><path d="M196 150 Q240 132 300 140 L400 148 V160 Q300 150 240 152 Z" fill="${t(0.42)}"/><path d="M268 140 L274 52 H294 L300 140Z" fill="${t(0.92)}"/><path d="M271 102 H297 L298 114 H270Z M273 72 H295 L296 82 H272Z" fill="${t(0.28)}"/><rect x="272" y="40" width="24" height="12" fill="${t(0.24)}"/><path d="M270 40 L284 30 L298 40Z" fill="${t(0.2)}"/><rect x="306" y="124" width="34" height="18" fill="${t(0.86)}"/><path d="M302 124 L323 112 L344 124Z" fill="${t(0.3)}"/><path d="M70 80 l6 4 l6 -4 M96 64 l5 3 l5 -3 M120 90 l4 3 l4 -3" stroke="${t(0.2)}" stroke-width="1.6" fill="none"/>`,
    false,
  );
}

function huts(): string {
  const t = inkOf(true);
  let row = "";
  for (let i = 0; i < 6; i += 1) {
    const x = 34 + i * 58;
    const shade = i % 2 ? 0.86 : 0.72;
    row += `<path d="M${x} 214 V170 L${x + 22} 152 L${x + 44} 170 V214Z" fill="${t(shade)}"/><path d="M${x - 3} 172 L${x + 22} 150 L${x + 47} 172" stroke="${t(0.22)}" stroke-width="4" fill="none"/><rect x="${x + 15}" y="186" width="14" height="28" fill="${t(0.26)}"/>`;
    if (i % 2 === 0)
      row += `<path d="M${x + 4} 172 V212 M${x + 10} 168 V212 M${x + 34} 168 V212 M${x + 40} 172 V212" stroke="${t(0.52)}" stroke-width="3"/>`;
  }
  return print(
    `${sky(t, 0.8, 0.95, 140)}<rect y="140" width="400" height="40" fill="${t(0.6)}"/><rect y="176" width="400" height="124" fill="${t(0.84)}"/>${row}<path d="M0 214 H400" stroke="${t(0.5)}" stroke-width="3"/><circle cx="300" cy="244" r="5" fill="${t(0.24)}"/><rect x="296" y="249" width="8" height="18" rx="3" fill="${t(0.24)}"/><circle cx="318" cy="250" r="4" fill="${t(0.3)}"/><rect x="315" y="254" width="6" height="13" rx="2" fill="${t(0.3)}"/>`,
    true,
  );
}

function road(): string {
  const t = inkOf(false);
  let poplars = "";
  [
    [70, 150, 1],
    [118, 130, 0.78],
    [252, 122, 0.6],
    [284, 116, 0.5],
    [312, 112, 0.42],
  ].forEach(([x, y, s]) => {
    const k = s as number;
    poplars += `<ellipse cx="${x}" cy="${(y as number) - 34 * k}" rx="${(9 * k).toFixed(1)}" ry="${(40 * k).toFixed(1)}" fill="${t(0.26)}"/>`;
  });
  return print(
    `${sky(t, 0.84, 0.95, 120)}<path d="M0 120 Q90 86 180 104 T400 92 V300 H0Z" fill="${t(0.72)}"/><path d="M0 150 Q130 110 260 128 T400 118 V300 H0Z" fill="${t(0.58)}"/><path d="M0 200 Q160 160 400 190 V300 H0Z" fill="${t(0.46)}"/><path d="M150 300 C200 240 120 200 220 160 S310 124 330 112 L334 112 C322 128 260 150 240 170 S230 240 236 300Z" fill="${t(0.88)}"/>${poplars}<rect x="352" y="100" width="48" height="14" fill="${t(0.6)}"/>`,
    false,
  );
}

function regatta(): string {
  const t = inkOf(true);
  let boats = "";
  [
    [80, 210, 1],
    [190, 186, 0.66],
    [270, 178, 0.5],
    [330, 176, 0.38],
  ].forEach(([x, y, s]) => {
    const k = s as number;
    const X = x as number;
    const Y = y as number;
    boats += `<path d="M${X} ${Y} L${X} ${(Y - 78 * k).toFixed(1)} L${(X + 46 * k).toFixed(1)} ${Y}Z" fill="${t(0.95)}"/><path d="M${(X - 4 * k).toFixed(1)} ${(Y - 70 * k).toFixed(1)} L${(X - 30 * k).toFixed(1)} ${Y} H${X}Z" fill="${t(0.86)}"/><path d="M${(X - 34 * k).toFixed(1)} ${Y} H${(X + 52 * k).toFixed(1)} L${(X + 42 * k).toFixed(1)} ${(Y + 9 * k).toFixed(1)} H${(X - 26 * k).toFixed(1)}Z" fill="${t(0.2)}"/>`;
  });
  return print(
    `${sky(t, 0.66, 0.88, 176)}<ellipse cx="110" cy="60" rx="70" ry="18" fill="${t(0.9)}" opacity="0.7"/><ellipse cx="300" cy="42" rx="56" ry="12" fill="${t(0.92)}" opacity="0.6"/><rect y="176" width="400" height="124" fill="${t(0.42)}"/><path d="M0 190 Q100 184 200 192 T400 188 M0 236 Q100 228 200 238 T400 232" stroke="${t(0.56)}" stroke-width="3" fill="none"/>${boats}`,
    true,
  );
}

function harbour(): string {
  const t = inkOf(false);
  let cottages = "";
  for (let i = 0; i < 7; i += 1) {
    const x = 20 + i * 54;
    const h = 30 + ((i * 17) % 14);
    cottages += `<rect x="${x}" y="${150 - h}" width="48" height="${h}" fill="${t(i % 2 ? 0.74 : 0.82)}"/><path d="M${x - 2} ${150 - h} L${x + 24} ${132 - h} L${x + 50} ${150 - h}Z" fill="${t(0.3)}"/><rect x="${x + 10}" y="${158 - h}" width="8" height="10" fill="${t(0.3)}"/><rect x="${x + 30}" y="${158 - h}" width="8" height="10" fill="${t(0.3)}"/>`;
  }
  return print(
    `${sky(t, 0.62, 0.8, 150)}${cottages}<rect y="150" width="400" height="22" fill="${t(0.5)}"/><rect y="172" width="400" height="128" fill="${t(0.34)}"/><path d="M60 214 Q90 226 130 214Z M220 236 Q260 250 304 236Z" fill="${t(0.16)}"/><path d="M92 214 V176 M262 236 V190" stroke="${t(0.16)}" stroke-width="2"/><path d="M0 196 H400 M0 262 H400" stroke="${t(0.44)}" stroke-width="2" opacity="0.7"/><path d="M60 228 Q90 240 130 228 M220 252 Q260 264 304 252" stroke="${t(0.28)}" stroke-width="3" fill="none" opacity="0.6"/>`,
    false,
  );
}

function haystacks(): string {
  const t = inkOf(true);
  return print(
    `${sky(t, 0.84, 0.96, 130)}<path d="M0 130 Q100 100 220 118 T400 106 V300 H0Z" fill="${t(0.68)}"/><rect y="150" width="400" height="150" fill="${t(0.8)}"/><path d="M0 170 L400 160 M0 200 L400 186 M0 240 L400 222 M0 288 L400 266" stroke="${t(0.7)}" stroke-width="3"/><path d="M60 252 Q60 186 110 182 Q160 186 160 252Z" fill="${t(0.52)}"/><path d="M60 252 Q60 186 110 182 Q92 210 96 252Z" fill="${t(0.64)}"/><path d="M220 208 Q220 166 252 164 Q284 166 284 208Z" fill="${t(0.5)}"/><path d="M320 186 Q320 160 340 158 Q360 160 360 186Z" fill="${t(0.48)}"/><path d="M160 252 L240 262 L60 262Z" fill="${t(0.6)}" opacity="0.6"/>`,
    true,
  );
}

/** Eight prints from one summer, drawn in code (sepia and silver). */
export const defaultGlassineAlbumPhotos: GlassineAlbumPhoto[] = [
  {
    src: pier(),
    alt: "A long wooden pier running out to sea.",
    caption: "The pier, 1961",
  },
  {
    src: orchard(),
    alt: "Rows of apple trees on a gentle hill.",
    caption: "Aunt Ivy's orchard",
  },
  {
    src: lighthouse(),
    alt: "A striped lighthouse on a headland.",
    caption: "Saltmarsh light",
  },
  {
    src: huts(),
    alt: "A row of bathing huts on the sand.",
    caption: "Bathing huts, August",
  },
  {
    src: road(),
    alt: "A coast road winding between poplars.",
    caption: "The coast road",
  },
  {
    src: regatta(),
    alt: "Sailing boats racing in a light wind.",
    caption: "Regatta day",
  },
  {
    src: harbour(),
    alt: "Cottages along a harbour wall at dusk.",
    caption: "Harbour wall at dusk",
  },
  {
    src: haystacks(),
    alt: "Haystacks in a mown field.",
    caption: "Haymaking at Fernhill",
  },
];

/* ---------------------------------- album --------------------------------- */

/** The card stock. Fixed pigments: an album is an object, the same in any room. */
const TONES: Record<
  GlassineAlbumTone,
  { paper: string; ink: string; corner: string }
> = {
  cream: {
    paper: "oklch(0.93 0.028 85)",
    ink: "oklch(0.38 0.035 55)",
    corner: "oklch(0.24 0.012 60)",
  },
  black: {
    paper: "oklch(0.24 0.008 60)",
    ink: "oklch(0.88 0.014 85)",
    corner: "oklch(0.13 0.005 60)",
  },
  dove: {
    paper: "oklch(0.86 0.008 250)",
    ink: "oklch(0.33 0.02 250)",
    corner: "oklch(0.2 0.01 250)",
  },
  sage: {
    paper: "oklch(0.8 0.035 145)",
    ink: "oklch(0.31 0.035 150)",
    corner: "oklch(0.2 0.02 150)",
  },
};

const BOARD = "oklch(0.31 0.04 32)";

/** Leaf angle within which a lifted page lets air under the tissue. */
const LIFT_ANGLE = 6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const read = (v: unknown[], i: number): number => Number(v[i] ?? 0);
const sinD = (deg: number) => Math.sin((deg * Math.PI) / 180);

const canSound = () => {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    userActivation?: { hasBeenActive: boolean };
  };
  return !nav.userActivation || nav.userActivation.hasBeenActive;
};

type Geo = {
  w: number;
  h: number;
  landscape: boolean;
  rim: number;
  pageW: number;
  pageH: number;
  /** A page's extent from the spine: its width open left/right, its height open top/bottom. */
  along: number;
  persp: number;
};

function geometry(w: number, h: number): Geo {
  const landscape = w >= 560;
  const rim = Math.round(w * (landscape ? 0.012 : 0.024));
  const pageW = landscape ? (w - 2 * rim) / 2 : w - 2 * rim;
  const pageH = landscape ? h - 2 * rim : (h - 2 * rim) / 2;
  const along = landscape ? pageW : pageH;
  return {
    w,
    h,
    landscape,
    rim,
    pageW: r2(pageW),
    pageH: r2(pageH),
    along: r2(along),
    persp: Math.round(along * 3.4),
  };
}

type Content =
  | { kind: "photo"; photo: GlassineAlbumPhoto; page: number }
  | { kind: "plate" }
  | { kind: "end" }
  | { kind: "blank" };

type Side = "verso" | "recto";

/** The rectangle a page occupies, px, on its side of the spine. */
function boxOf(g: Geo, side: Side) {
  if (g.landscape) {
    return {
      left: side === "verso" ? g.rim : g.rim + g.pageW,
      top: g.rim,
      width: g.pageW,
      height: g.pageH,
    };
  }
  return {
    left: g.rim,
    top: side === "verso" ? g.rim : g.rim + g.pageH,
    width: g.pageW,
    height: g.pageH,
  };
}

/* ---------------------------------- pages --------------------------------- */

type FaceProps = {
  /** A document-unique id for the misted copy's blur filter. */
  filterId?: string;
  content: Content;
  side: Side;
  g: Geo;
  tone: GlassineAlbumTone;
  corners: boolean;
  title: string;
  /** How misted the print is by a tissue lying on it, 0–1. */
  mist?: MotionValue<number>;
  /** How opaque the glassine is (sets the mist's blur). */
  tissue: number;
};

/** One face of a card page: paper, gutter shade, a mounted print and its caption. */
function PageFace({
  filterId,
  content,
  side,
  g,
  tone,
  corners,
  title,
  mist,
  tissue,
}: FaceProps) {
  const t = TONES[tone];
  const w = g.pageW;
  const h = g.pageH;
  const toSpine = g.landscape
    ? side === "verso"
      ? "to right"
      : "to left"
    : side === "verso"
      ? "to bottom"
      : "to top";
  const sheet: React.CSSProperties = {
    backgroundColor: t.paper,
    backgroundImage: `linear-gradient(${toSpine}, transparent 78%, oklch(0 0 0 / 0.2)), radial-gradient(ellipse 90% 80% at 50% 45%, oklch(1 0 0 / 0.05), transparent 70%)`,
  };

  // The print's box on the page, px: landscape pages are tall, portrait wide.
  const away = side === "recto" ? 1 : -1;
  const pw = r2(g.landscape ? w * 0.74 : h * 0.66 * (4 / 3));
  const ph = r2(pw * 0.75);
  const px = r2((w - pw) / 2 + (g.landscape ? away * w * 0.02 : 0));
  const py = r2(g.landscape ? h * 0.13 : h * 0.09 + (away > 0 ? h * 0.02 : 0));
  const capSize = Math.round(clamp(w * (g.landscape ? 0.034 : 0.03), 9, 13));
  const border = Math.max(3, Math.round(pw * 0.035));
  const corner = Math.max(8, Math.round(pw * 0.085));

  if (
    content.kind === "plate" ||
    content.kind === "end" ||
    content.kind === "blank"
  ) {
    return (
      <span className="absolute inset-0 block overflow-hidden" style={sheet}>
        {content.kind === "plate" ? (
          <span
            className="absolute flex flex-col items-center justify-center gap-2 text-center"
            style={{
              left: r2(w * 0.2),
              right: r2(w * 0.2),
              top: r2(h * 0.32),
              bottom: r2(h * 0.32),
              color: t.ink,
              boxShadow: `inset 0 0 0 1px ${t.ink}, inset 0 0 0 4px ${t.paper}, inset 0 0 0 5px ${t.ink}`,
              opacity: 0.85,
            }}
          >
            <span
              className="font-mono tracking-[0.18em] uppercase"
              style={{ fontSize: Math.max(8, capSize - 2) }}
            >
              From the album of
            </span>
            <span
              className="px-3 leading-tight font-semibold tracking-tight text-balance"
              style={{ fontSize: Math.round(clamp(w * 0.06, 13, 22)) }}
            >
              {title}
            </span>
          </span>
        ) : content.kind === "end" ? (
          <span
            className="absolute"
            style={{
              inset: Math.round(w * 0.06),
              // A combed endpaper, in the board's colour.
              backgroundColor: BOARD,
              backgroundImage:
                "repeating-radial-gradient(ellipse 60% 40% at 30% 40%, oklch(1 0 0 / 0.07) 0 2px, transparent 2px 9px), repeating-linear-gradient(100deg, oklch(0 0 0 / 0.12) 0 3px, transparent 3px 11px)",
              opacity: 0.85,
            }}
          />
        ) : null}
      </span>
    );
  }

  const { photo } = content;
  return (
    <span className="absolute inset-0 block overflow-hidden" style={sheet}>
      <span
        className="absolute block"
        style={{
          left: px,
          top: py,
          width: pw,
          height: ph,
          backgroundColor: "oklch(0.97 0.01 85)",
          boxShadow: "0 1px 3px oklch(0 0 0 / 0.35)",
        }}
      >
        <span
          className="absolute block overflow-hidden"
          style={{ inset: border }}
        >
          {photo.src ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.src}
                alt={photo.alt}
                draggable={false}
                className="absolute inset-0 size-full object-cover"
              />
              {mist && filterId ? (
                // The print seen through glassine: a softened copy faded in
                // over the sharp one. The blur is an SVG filter, painted once
                // into the copy, so only its opacity ever animates.
                <motion.svg
                  aria-hidden
                  className="absolute inset-0 size-full will-change-[opacity]"
                  style={{ opacity: mist }}
                >
                  <filter
                    id={filterId}
                    x="-5%"
                    y="-5%"
                    width="110%"
                    height="110%"
                  >
                    <feGaussianBlur stdDeviation={r2(1 + tissue * 3.5)} />
                    <feComponentTransfer>
                      <feFuncR type="linear" slope="1.06" intercept="0.03" />
                      <feFuncG type="linear" slope="1.06" intercept="0.03" />
                      <feFuncB type="linear" slope="1.06" intercept="0.03" />
                    </feComponentTransfer>
                  </filter>
                  <image
                    href={photo.src}
                    width="100%"
                    height="100%"
                    preserveAspectRatio="xMidYMid slice"
                    filter={`url(#${filterId})`}
                  />
                </motion.svg>
              ) : null}
            </>
          ) : (
            <span
              role="img"
              aria-label={photo.alt}
              className="absolute inset-0 block"
              style={{ backgroundColor: "oklch(0.7 0.02 70)" }}
            />
          )}
        </span>
        {corners
          ? (["tl", "tr", "bl", "br"] as const).map((c) => (
              <span
                key={c}
                aria-hidden
                className="absolute block"
                style={{
                  width: corner,
                  height: corner,
                  left: c[1] === "l" ? -2 : undefined,
                  right: c[1] === "r" ? -2 : undefined,
                  top: c[0] === "t" ? -2 : undefined,
                  bottom: c[0] === "b" ? -2 : undefined,
                  backgroundColor: t.corner,
                  backgroundImage:
                    "linear-gradient(135deg, oklch(1 0 0 / 0.14), transparent 60%)",
                  clipPath:
                    c === "tl"
                      ? "polygon(0 0, 100% 0, 0 100%)"
                      : c === "tr"
                        ? "polygon(0 0, 100% 0, 100% 100%)"
                        : c === "bl"
                          ? "polygon(0 0, 0 100%, 100% 100%)"
                          : "polygon(100% 0, 100% 100%, 0 100%)",
                }}
              />
            ))
          : null}
      </span>
      {photo.caption ? (
        <span
          className="absolute block truncate text-center font-mono tracking-[0.12em] uppercase"
          title={photo.caption}
          style={{
            left: px,
            width: pw,
            top: r2(py + ph + Math.round(h * 0.035)),
            fontSize: capSize,
            lineHeight: 1.3,
            color: t.ink,
          }}
        >
          {photo.caption}
        </span>
      ) : null}
      <span
        aria-hidden
        className="absolute font-mono tabular-nums"
        style={{
          fontSize: Math.max(8, capSize - 2),
          color: t.ink,
          opacity: 0.55,
          bottom: Math.round(h * 0.04),
          ...(side === "recto" || !g.landscape
            ? { right: Math.round(w * 0.06) }
            : { left: Math.round(w * 0.06) }),
        }}
      >
        {content.page}
      </span>
    </span>
  );
}

/* --------------------------------- tissue --------------------------------- */

/** The cobweb printed on old interleaving tissue: radials from one corner and sagging rings. */
function Cobweb({
  w,
  h,
  landscape,
}: {
  w: number;
  h: number;
  landscape: boolean;
}) {
  const ox = landscape ? w : 0;
  const oy = landscape ? h : h;
  const spokes: string[] = [];
  const reach = Math.hypot(w, h) * 0.95;
  const n = 9;
  const a0 = landscape ? Math.PI : 1.5 * Math.PI;
  const a1 = landscape ? 1.5 * Math.PI : 2 * Math.PI;
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + ((a1 - a0) * i) / n;
    spokes.push(
      `M${r2(ox)} ${r2(oy)}L${r2(ox + Math.cos(a) * reach)} ${r2(oy + Math.sin(a) * reach)}`,
    );
  }
  const rings: string[] = [];
  for (let k = 1; k <= 6; k += 1) {
    const r = (reach / 6.5) * k;
    let d = "";
    for (let i = 0; i <= n; i += 1) {
      const a = a0 + ((a1 - a0) * i) / n;
      const x = ox + Math.cos(a) * r;
      const y = oy + Math.sin(a) * r;
      if (i === 0) d += `M${r2(x)} ${r2(y)}`;
      else {
        // Each thread sags a little toward the centre between spokes.
        const am = a - (a1 - a0) / n / 2;
        const sx = ox + Math.cos(am) * r * 0.9;
        const sy = oy + Math.sin(am) * r * 0.9;
        d += `Q${r2(sx)} ${r2(sy)} ${r2(x)} ${r2(y)}`;
      }
    }
    rings.push(d);
  }
  return (
    <svg
      aria-hidden
      width={r2(w)}
      height={r2(h)}
      viewBox={`0 0 ${r2(w)} ${r2(h)}`}
      className="absolute top-0 left-0 block"
    >
      <path
        d={[...spokes, ...rings].join("")}
        fill="none"
        stroke="oklch(0.55 0.01 80 / 0.13)"
        strokeWidth="0.7"
      />
    </svg>
  );
}

type TissueProps = {
  g: Geo;
  angle: MotionValue<number>;
  /** The turning leaf it must stay ahead of (forward) or behind (back). */
  leaf: MotionValue<number> | null;
  bound: "ahead" | "behind" | null;
  /** Bend of the middle and outer panels, degrees. */
  bend1: MotionValue<number>;
  bend2: MotionValue<number>;
  order: number;
  opacity: number;
  printed: boolean;
  motionSafe: boolean;
  fade: MotionValue<number>;
};

/**
 * A sheet of glassine hinged at the spine, in three panels: the inner one
 * turns with the sheet, the middle and outer ones bend relative to it, so
 * the air can billow it as it floats over. Each panel is its own layer with
 * its whole chain of hinges written into its transform — no shared 3D
 * context for the compositor to sort and split every frame.
 */
function Tissue({
  g,
  angle,
  leaf,
  bound,
  bend1,
  bend2,
  order,
  opacity,
  printed,
  motionSafe,
  fade,
}: TissueProps) {
  const land = g.landscape;
  const tw = land ? g.pageW * 0.9 : g.pageW * 0.94;
  const th = land ? g.pageH * 0.95 : g.pageH * 0.9;
  const seg = (land ? tw : th) / 3;
  const zero = useMotionValue(0);
  const lead = leaf ?? zero;

  const shown = (v: unknown[]) => {
    const a = read(v, 0);
    const l = read(v, 1);
    if (!motionSafe) return a > 90 ? 180 : 0;
    if (bound === "ahead") return Math.max(a, l);
    if (bound === "behind") return Math.min(a, l);
    return a;
  };
  const hinge = (deg: number) =>
    land ? `rotateY(${r2(-deg)}deg)` : `rotateX(${r2(deg)}deg)`;
  const along = land ? `translateX(${r2(seg)}px)` : `translateY(${r2(seg)}px)`;
  const base = `perspective(${g.persp}px)`;
  const inputs = [angle, lead, bend1, bend2] as MotionValue<number>[];
  const t0 = useTransform(inputs, (v) => `${base} ${hinge(shown(v))}`);
  const t1 = useTransform(
    inputs,
    (v) => `${base} ${hinge(shown(v))} ${along} ${hinge(read(v, 2))}`,
  );
  const t2 = useTransform(
    inputs,
    (v) =>
      `${base} ${hinge(shown(v))} ${along} ${hinge(read(v, 2))} ${along} ${hinge(read(v, 3))}`,
  );
  const zIndex = useTransform(inputs, (v) => {
    const a = shown(v);
    return a <= 90 ? 10 + order : 30 - order;
  });
  // Unbent, the sheet is drawn whole: three abutting translucent panels
  // would show seams where they meet. Swapped by visibility alone.
  const bent = useTransform(inputs, (v) =>
    Math.abs(read(v, 2)) + Math.abs(read(v, 3)) > 0.02 ? 1 : 0,
  );
  const panelsShown = useTransform(bent, (k) => (k ? "visible" : "hidden"));
  const wholeShown = useTransform(bent, (k) => (k ? "hidden" : "visible"));

  const sheet = `oklch(0.97 0.012 90 / ${r2(0.1 + opacity * 0.46)})`;
  const origin = land ? "0% 50%" : "50% 0%";
  const web = (k: number) =>
    printed ? (
      <span
        className="absolute block"
        style={
          land ? { left: r2(-k * seg), top: 0 } : { top: r2(-k * seg), left: 0 }
        }
      >
        <Cobweb w={tw} h={th} landscape={land} />
      </span>
    ) : null;

  const box = boxOf(g, "recto");
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: r2(land ? box.left : box.left + (g.pageW - tw) / 2),
        top: r2(land ? box.top + (g.pageH - th) / 2 : box.top),
        width: r2(tw),
        height: r2(th),
        zIndex,
        opacity: fade,
      }}
    >
      <motion.span
        className="absolute inset-0 block overflow-hidden will-change-transform"
        style={{
          backgroundColor: sheet,
          transformOrigin: origin,
          transform: t0,
          visibility: wholeShown,
        }}
      >
        {printed ? <Cobweb w={tw} h={th} landscape={land} /> : null}
      </motion.span>
      {[t0, t1, t2].map((t, k) => (
        <motion.span
          key={k}
          className="absolute top-0 left-0 block overflow-hidden will-change-transform"
          style={{
            width: land ? r2(seg) : r2(tw),
            height: land ? r2(th) : r2(seg),
            backgroundColor: sheet,
            transformOrigin: origin,
            transform: t,
            visibility: panelsShown,
          }}
        >
          {web(k)}
        </motion.span>
      ))}
    </motion.div>
  );
}

/* ------------------------------- the album -------------------------------- */

type Turn = { dir: 1 | -1 } | null;

/**
 * A photo album opened flat: heavy card pages holding mounted prints, and
 * between the leaves a sheet of glassine tissue printed with a faint cobweb.
 * The print under a tissue is softly misted. Drag a page toward the spine
 * and its free edge stays under the finger; the tissue lying on it is
 * carried up and, being light, floats over ahead of it on its own soft
 * spring while its outer panels billow in the air; then the page, sprung
 * from `weight`, turns with inertia and lands with a slight bounce. A tap on
 * a page lifts or lays its tissue, or turns the page when the tissue is
 * already clear of it. Open wide it lies left and right; narrow, it opens
 * top and bottom like a top-bound album.
 *
 * The album is a carousel region: arrow keys and Page Up/Down turn, Home
 * and End jump, Enter or Space lifts or lays the tissue, and each spread is
 * announced. Under reduced motion nothing rotates or billows: spreads and
 * tissues cross-fade, and the misting still follows the tissue.
 */
export function GlassineAlbum({
  photos = defaultGlassineAlbumPhotos,
  title = "Summers at Saltmarsh",
  value,
  defaultValue = 0,
  onValueChange,
  weight = 0.6,
  tissue = 0.55,
  paperTone = "black",
  flutter = 0.6,
  corners = true,
  printed = true,
  label,
  sound = false,
  disabled = false,
  className,
}: GlassineAlbumProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const safeId = `ga-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const tone: GlassineAlbumTone = paperTone in TONES ? paperTone : "black";
  const leaves = Math.max(1, Math.ceil(photos.length / 2));
  const fit = (s: number) => clamp(Math.round(s), 0, leaves);

  const [own, setOwn] = React.useState(() => fit(defaultValue));
  const index = fit(value ?? own);
  const [shown, setShown] = React.useState(index);
  const [turn, setTurn] = React.useState<Turn>(null);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const g = geometry(box?.w ?? 720, box?.h ?? 446);

  // One tissue per leaf, each its own value: a leaf already turned keeps its
  // tissue over (180), the leaves to come keep theirs down (0).
  const [tissues, setTissues] = React.useState(() =>
    Array.from({ length: leaves }, (_, k) => motionValue(k < index ? 180 : 0)),
  );
  if (tissues.length !== leaves) {
    setTissues(
      Array.from({ length: leaves }, (_, k) =>
        motionValue(tissues[k]?.get() ?? (k < shown ? 180 : 0)),
      ),
    );
  }
  const leaf = useMotionValue(0);
  const bend1 = useMotionValue(0);
  const bend2 = useMotionValue(0);
  const fade = useMotionValue(1);
  const tissueFade = useMotionValue(1);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const visible = React.useRef(false);
  const sim = React.useRef({ frame: 0, v1: 0, v2: 0, last: 0 });
  const side = React.useRef<Side | null>(null);
  const drag = React.useRef<{
    dir: 1 | -1;
    e0: number;
    released: boolean;
  } | null>(null);
  const latest = React.useRef({
    tissues,
    shown,
    index,
    turn,
    g,
    weight,
    flutter,
    motionSafe,
    leaves,
  });
  const api = React.useRef<{
    tick: (now: number) => void;
    wake: () => void;
    sync: () => void;
  }>({ tick: () => {}, wake: () => {}, sync: () => {} });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };

  const tissueAt = (k: number): MotionValue<number> | null =>
    tissues[k] ?? null;
  const current = tissueAt(shown);

  /** The page's spring: heavier pages are slower and carry more momentum. */
  const pageSpring = (velocity = 0) => {
    const w = clamp01(latest.current.weight);
    const stiffness = lerp(300, 110, w);
    const mass = lerp(0.9, 1.8, w);
    return {
      type: "spring" as const,
      stiffness,
      mass,
      // A slight bounce on landing, whatever the weight.
      damping: 2 * 0.6 * Math.sqrt(stiffness * mass),
      velocity,
    };
  };

  const play = (pitch: number, gain: number) => {
    if (canSound()) audio.play("paper", { pitch, gain });
  };

  /* ---------------------------- the flutter sim ---------------------------- */

  // The middle and outer panels are two light, under-damped springs pulled
  // back against the sheet's own angular speed: moving, they trail; stopping,
  // they overshoot and wave once or twice before lying flat.
  const tick = (now: number) => {
    {
      const s = sim.current;
      s.frame = 0;
      const t = latest.current.tissues[latest.current.shown];
      if (
        !t ||
        !latest.current.motionSafe ||
        !visible.current ||
        document.hidden
      ) {
        bend1.set(0);
        bend2.set(0);
        s.v1 = 0;
        s.v2 = 0;
        s.last = 0;
        return;
      }
      const dt = s.last ? Math.min(1 / 30, (now - s.last) / 1000) : 1 / 60;
      s.last = now;
      const speed = t.getVelocity();
      const f = clamp01(latest.current.flutter);
      const t1 = clamp(-speed * 0.07 * f, -55, 55);
      const t2 = clamp(-speed * 0.12 * f, -75, 75);
      let b1 = bend1.get();
      let b2 = bend2.get();
      for (let i = 0; i < 2; i += 1) {
        const h = dt / 2;
        s.v1 += (160 * (t1 - b1) - 2 * 0.34 * Math.sqrt(160) * s.v1) * h;
        s.v2 +=
          (240 * (t2 + b1 * 0.35 - b2) - 2 * 0.3 * Math.sqrt(240) * s.v2) * h;
        b1 += s.v1 * h;
        b2 += s.v2 * h;
      }
      const settled =
        Math.abs(speed) < 1 &&
        Math.abs(b1) < 0.05 &&
        Math.abs(b2) < 0.05 &&
        Math.abs(s.v1) < 0.5 &&
        Math.abs(s.v2) < 0.5;
      if (settled) {
        bend1.set(0);
        bend2.set(0);
        s.v1 = 0;
        s.v2 = 0;
        s.last = 0;
        return;
      }
      bend1.set(r2(b1));
      bend2.set(r2(b2));
      s.frame = window.requestAnimationFrame((t) => api.current.tick(t));
    }
  };

  const wake = () => {
    const s = sim.current;
    if (s.frame || !visible.current || document.hidden) return;
    s.frame = window.requestAnimationFrame((t) => api.current.tick(t));
  };

  // Any motion of the open spread's tissue wakes the panels.
  React.useEffect(() => {
    if (!current) return;
    return current.on("change", () => api.current.wake());
  }, [current]);

  React.useEffect(() => {
    const s = sim.current;
    const running = runs.current;
    return () => {
      if (s.frame) window.cancelAnimationFrame(s.frame);
      s.frame = 0;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ------------------------------- the tissue ------------------------------ */

  const floatTissue = (t: MotionValue<number>, to: 0 | 180, heard: boolean) => {
    if (heard) play(to ? 1.5 : 1.35, 0.2);
    if (!latest.current.motionSafe) {
      runs.current.get("tissue")?.stop();
      t.jump(to);
      tissueFade.jump(0.2);
      run(
        "tissueFade",
        animate(tissueFade, 1, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
      return;
    }
    // Light paper on air: the drift spring, no bounce of its own — the
    // billow comes from its panels.
    run("tissue", animate(t, to, springs.drift));
  };

  const toggleTissue = (heard: boolean) => {
    if (disabled || turn || !current) return;
    floatTissue(current, current.get() < 90 ? 180 : 0, heard);
  };

  /* -------------------------------- turning -------------------------------- */

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const describe = (s: number) => {
    const left = photos[2 * s - 1];
    const right = photos[2 * s];
    const total = leaves * 2;
    const pages =
      s <= 0
        ? `Page 1 of ${total}`
        : s >= leaves
          ? `Page ${total} of ${total}`
          : `Pages ${2 * s} and ${2 * s + 1} of ${total}`;
    const names = [left?.caption ?? left?.alt, right?.caption ?? right?.alt]
      .filter(Boolean)
      .map((n) => String(n).replace(/[.]$/, ""));
    return names.length ? `${pages}: ${names.join("; ")}.` : `${pages}.`;
  };

  const arrive = (next: number, heard: boolean, report: boolean) => {
    setTurn(null);
    setShown(next);
    if (heard) play(0.55, 0.5);
    if (!report) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    say(describe(next));
  };

  /** Puts every tissue where the leaves say it lies, for a jump. */
  const settleTissues = (s: number) => {
    tissues.forEach((t, k) => t.jump(k < s ? 180 : 0));
  };

  const crossfade = () => {
    fade.jump(0.25);
    run(
      "fade",
      animate(fade, 1, { duration: durations.base, ease: easings.enter }),
    );
  };

  const jumpTo = (next: number, report: boolean) => {
    for (const c of runs.current.values()) c.stop();
    runs.current.clear();
    settleTissues(next);
    crossfade();
    arrive(next, false, report);
  };

  const startTurn = (
    dir: 1 | -1,
    heard: boolean,
    velocity = 0,
    report = true,
  ) => {
    const s = latest.current.shown;
    const next = s + dir;
    if (disabled || next < 0 || next > leaves) return;
    if (!latest.current.motionSafe) {
      // Nothing turns: the spread cross-fades, tissues where they now lie.
      if (heard) play(0.8, 0.35);
      jumpTo(next, report);
      return;
    }
    const t = tissueAt(s);
    let delay = 0;
    if (dir === 1) {
      leaf.jump(0);
      if (t && t.get() < 170) {
        floatTissue(t, 180, heard);
        delay = 0.18;
      }
    } else {
      leaf.jump(180);
      if (t && t.get() > 10) {
        floatTissue(t, 0, heard);
        delay = 0.22;
      }
    }
    setTurn({ dir });
    if (heard) window.setTimeout(() => play(0.8, 0.35), delay * 1000);
    finishTurn(dir, true, velocity, delay, heard, report);
  };

  const finishTurn = (
    dir: 1 | -1,
    commit: boolean,
    velocity: number,
    delay: number,
    heard: boolean,
    report = true,
  ) => {
    const s = latest.current.shown;
    const target = (dir === 1) === commit ? 180 : 0;
    run(
      "leaf",
      animate(leaf, target, {
        ...pageSpring(velocity),
        delay,
        onComplete: () => {
          if (commit) arrive(s + dir, heard, report);
          else setTurn(null);
        },
      }),
    );
  };

  // A host that moves the value gets the same turn a key would; a host that
  // refused a turn gets the spread it asked for. Applied just after the
  // commit that revealed the difference, never inside it.
  const sync = () => {
    const l = latest.current;
    if (l.turn || drag.current || l.index === l.shown) return;
    if (Math.abs(l.index - l.shown) === 1 && l.motionSafe) {
      startTurn(l.index > l.shown ? 1 : -1, false, 0, false);
      return;
    }
    jumpTo(l.index, false);
  };

  React.useEffect(() => {
    api.current = { tick, wake, sync };
    latest.current = {
      tissues,
      shown,
      index,
      turn,
      g,
      weight,
      flutter,
      motionSafe,
      leaves,
    };
  });

  React.useEffect(() => {
    if (turn || index === shown) return;
    const id = window.setTimeout(() => api.current.sync(), 0);
    return () => window.clearTimeout(id);
  }, [index, shown, turn]);

  /* --------------------------------- drag ---------------------------------- */

  /**
   * The album's geometry from its live box: a press can come before the first
   * measurement has re-rendered, and must not be judged on the default size.
   */
  const live = (): Geo => {
    const el = rootRef.current;
    if (!el || el.clientWidth < 1) return latest.current.g;
    const gg = latest.current.g;
    if (gg.w === el.clientWidth && gg.h === el.clientHeight) return gg;
    return geometry(el.clientWidth, el.clientHeight);
  };

  const sideAt = (clientX: number, clientY: number): Side => {
    const el = rootRef.current;
    if (!el) return "recto";
    const r = el.getBoundingClientRect();
    const gg = live();
    return gg.landscape
      ? clientX - r.left < gg.rim + gg.pageW
        ? "verso"
        : "recto"
      : clientY - r.top < gg.rim + gg.pageH
        ? "verso"
        : "recto";
  };

  const gesture = useDrag({
    axis: g.landscape ? "x" : "y",
    threshold: 5,
    disabled,
    onStart: () => {
      const s = latest.current.shown;
      const dir: 1 | -1 = side.current === "verso" ? -1 : 1;
      if ((dir === 1 && s >= leaves) || (dir === -1 && s <= 0)) return;
      if (latest.current.turn && latest.current.turn.dir !== dir) return;
      runs.current.get("leaf")?.stop();
      if (!latest.current.turn) {
        leaf.jump(dir === 1 ? 0 : 180);
        setTurn({ dir });
      }
      // The free edge's distance from the spine, signed: + on the recto side.
      const e0 = Math.cos((leaf.get() * Math.PI) / 180) * live().along;
      drag.current = { dir, e0, released: false };
      play(0.85, 0.3);
    },
    onMove: ({ offset }) => {
      const d = drag.current;
      if (!d) return;
      const gg = live();
      const moved = gg.landscape ? offset.x : offset.y;
      if (!latest.current.motionSafe) return;
      const e = clamp((d.e0 + moved) / gg.along, -1, 1);
      const a = (Math.acos(e) * 180) / Math.PI;
      leaf.set(r2(a));
      // Lift a page and the air gets under the tissue on it.
      const t = tissueAt(latest.current.shown);
      if (!t) return;
      if (d.dir === 1 && a > LIFT_ANGLE && t.get() < 170 && !d.released) {
        d.released = true;
        floatTissue(t, 180, true);
      } else if (
        d.dir === -1 &&
        a < 180 - LIFT_ANGLE &&
        t.get() > 10 &&
        !d.released
      ) {
        d.released = true;
        floatTissue(t, 0, true);
      }
    },
    onEnd: ({ velocity }) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const gg = live();
      const v = gg.landscape ? velocity.x : velocity.y;
      if (!latest.current.motionSafe) {
        // The swipe was judged on pointer-up; nothing is left to settle.
        setTurn(null);
        return;
      }
      const a = leaf.get();
      const e = Math.cos((a * Math.PI) / 180) * gg.along;
      const landing = project(e, v, 0.995);
      const commit = d.dir === 1 ? landing < 0 : landing > 0;
      // The edge's speed as the leaf's angular speed, deg/s.
      const omega = clamp(
        (-v / (gg.along * Math.max(0.3, sinD(a)))) * (180 / Math.PI),
        -900,
        900,
      );
      finishTurn(d.dir, commit, omega, 0, true);
    },
    onCancel: () => {
      const d = drag.current;
      drag.current = null;
      if (d) finishTurn(d.dir, false, 0, 0, false);
    },
    onTap: () => {
      // A tap lifts or lays the tissue on its side, or turns the page when
      // the tissue is already clear of it.
      if (latest.current.turn) return;
      const t = current;
      const tissueOver = t ? t.get() > 90 : true;
      if (side.current === "recto") {
        if (t && !tissueOver) floatTissue(t, 180, true);
        else startTurn(1, true);
      } else if (t && tissueOver) floatTissue(t, 0, true);
      else startTurn(-1, true);
    },
  });

  // Reduced motion: a drag is a swipe, judged on release.
  const swipe = React.useRef({ x: 0, y: 0 });

  /* ------------------------------- keyboard -------------------------------- */

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.target !== event.currentTarget) return;
    const land = live().landscape;
    const nextKeys = ["PageDown", "ArrowRight", ...(land ? [] : ["ArrowDown"])];
    const prevKeys = ["PageUp", "ArrowLeft", ...(land ? [] : ["ArrowUp"])];
    if (nextKeys.includes(event.key)) {
      event.preventDefault();
      if (!turn) startTurn(1, true);
    } else if (prevKeys.includes(event.key)) {
      event.preventDefault();
      if (!turn) startTurn(-1, true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const to = event.key === "Home" ? 0 : leaves;
      if (to !== shown && !turn) {
        play(0.8, 0.35);
        jumpTo(to, true);
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) toggleTissue(true);
    }
  };

  /* ------------------------------- measuring ------------------------------- */

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setBox({ w: node.clientWidth, h: node.clientHeight });
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) api.current.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /* -------------------------------- render --------------------------------- */

  const photoAt = (i: number): Content => {
    const photo = photos[i];
    if (!photo) return { kind: "blank" };
    return { kind: "photo", photo, page: i + 1 };
  };
  const versoOf = (s: number): Content =>
    s <= 0 ? { kind: "plate" } : photoAt(2 * s - 1);
  const rectoOf = (s: number): Content =>
    s >= leaves ? { kind: "end" } : photoAt(2 * s);

  const dir = turn?.dir ?? 0;
  const leftContent = versoOf(dir === -1 ? shown - 1 : shown);
  const rightContent = rectoOf(dir === 1 ? shown + 1 : shown);
  // The tissue lying on each base page, if any.
  const onRight = dir === 1 ? tissueAt(shown + 1) : current;
  const onLeft = dir === -1 ? tissueAt(shown - 1) : current;
  const zeroMv = useMotionValue(0);
  const rightMist = useTransform(onRight ?? zeroMv, (a) =>
    onRight ? r2(1 - smooth(0, 50, a)) : 0,
  );
  const leftMist = useTransform(onLeft ?? zeroMv, (a) =>
    onLeft ? r2(smooth(130, 178, a)) : 0,
  );

  // The turning leaf: the one on the right going forward, on the left going back.
  const turningIndex = dir === 1 ? shown : dir === -1 ? shown - 1 : -1;
  const leafFront = useTransform(leaf, (a) =>
    g.landscape
      ? `perspective(${g.persp}px) rotateY(${r2(-a)}deg)`
      : `perspective(${g.persp}px) rotateX(${r2(a)}deg)`,
  );
  const leafBack = useTransform(leaf, (a) =>
    g.landscape
      ? `perspective(${g.persp}px) rotateY(${r2(-a)}deg) translateX(${r2(g.pageW / 2)}px) rotateY(180deg) translateX(${r2(-g.pageW / 2)}px)`
      : `perspective(${g.persp}px) rotateX(${r2(a)}deg) translateY(${r2(g.pageH / 2)}px) rotateX(180deg) translateY(${r2(-g.pageH / 2)}px)`,
  );
  // Going forward the leaf is under its own tissue until it passes upright;
  // going back it lies over everything it meets.
  const leafZ = useTransform(leaf, (a) =>
    dir === 1 ? (a <= 90 ? 12 : 28) : a <= 90 ? 14 : 26,
  );
  const frontShade = useTransform(leaf, (a) =>
    r2(0.42 * Math.pow(sinD(clamp(a, 0, 90)), 1.4)),
  );
  const backShade = useTransform(leaf, (a) =>
    r2(0.42 * Math.pow(sinD(clamp(180 - a, 0, 90)), 1.4)),
  );
  const castRecto = useTransform(leaf, (a) => (a < 90 ? r2(0.5 * sinD(a)) : 0));
  const castVerso = useTransform(leaf, (a) => (a > 90 ? r2(0.5 * sinD(a)) : 0));

  const versoBox = boxOf(g, "verso");
  const rectoBox = boxOf(g, "recto");
  const face = (content: Content, s: Side, mist?: MotionValue<number>) => (
    <PageFace
      filterId={mist ? `${safeId}-mist-${s}` : undefined}
      content={content}
      side={s}
      g={g}
      tone={tone}
      corners={corners}
      title={title}
      mist={mist}
      tissue={clamp01(tissue)}
    />
  );

  const measured = box !== null;
  const spreadLabel = describe(shown).replace(/:.*$/, "").replace(/\.$/, "");
  const name = label ?? title;

  return (
    <div className={cn("@container w-full", className)}>
      <section
        ref={bindRoot}
        aria-roledescription="carousel"
        aria-label={name}
        aria-describedby={hintId}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        {...gesture}
        onPointerDown={(event) => {
          side.current = sideAt(event.clientX, event.clientY);
          swipe.current = { x: event.clientX, y: event.clientY };
          gesture.onPointerDown(event);
        }}
        onPointerUp={(event) => {
          if (!motionSafe && drag.current) {
            // Under reduced motion a drag past a quarter page turns it.
            const d = drag.current;
            const moved = g.landscape
              ? event.clientX - swipe.current.x
              : event.clientY - swipe.current.y;
            drag.current = null;
            setTurn(null);
            if (
              Math.abs(moved) > g.along * 0.25 &&
              Math.sign(moved) === -d.dir
            ) {
              startTurn(d.dir, true);
            }
          }
          gesture.onPointerUp(event);
        }}
        className={cn(
          "relative isolate block aspect-[100/157] w-full overflow-clip rounded-3 select-none @min-[560px]:aspect-[100/62]",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          g.landscape ? "touch-pan-y" : "touch-pan-x",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-grab",
        )}
        style={{
          backgroundColor: BOARD,
          boxShadow:
            "inset 0 0 0 1px oklch(1 0 0 / 0.08), 0 10px 30px oklch(0 0 0 / 0.22)",
        }}
      >
        <motion.div
          className={cn(
            "absolute inset-0 transition-opacity",
            measured ? "duration-300" : "!opacity-0 duration-0",
          )}
          style={{ opacity: fade }}
        >
          <div
            role="group"
            aria-roledescription="slide"
            aria-label={spreadLabel}
            className="absolute inset-0"
          >
            <div className="absolute" style={{ ...versoBox, zIndex: 0 }}>
              {face(leftContent, "verso", leftMist)}
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 block will-change-[opacity]"
                style={{
                  opacity: castVerso,
                  backgroundImage: `linear-gradient(${g.landscape ? "to left" : "to top"}, oklch(0 0 0 / 0.55), transparent 55%)`,
                }}
              />
            </div>
            <div className="absolute" style={{ ...rectoBox, zIndex: 1 }}>
              {face(rightContent, "recto", rightMist)}
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 block will-change-[opacity]"
                style={{
                  opacity: castRecto,
                  backgroundImage: `linear-gradient(${g.landscape ? "to right" : "to bottom"}, oklch(0 0 0 / 0.55), transparent 55%)`,
                }}
              />
            </div>
          </div>

          {/* The spine's gutter. */}
          <span
            aria-hidden
            className="pointer-events-none absolute z-40 block"
            style={
              g.landscape
                ? {
                    left: g.rim + g.pageW - 10,
                    width: 20,
                    top: g.rim,
                    height: g.pageH,
                    backgroundImage:
                      "linear-gradient(to right, transparent, oklch(0 0 0 / 0.28) 50%, transparent)",
                  }
                : {
                    top: g.rim + g.pageH - 10,
                    height: 20,
                    left: g.rim,
                    width: g.pageW,
                    backgroundImage:
                      "linear-gradient(to bottom, transparent, oklch(0 0 0 / 0.28) 50%, transparent)",
                  }
            }
          />

          {turningIndex >= 0 ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute"
              style={{ ...rectoBox, zIndex: leafZ }}
            >
              {/* Two faces, each carrying the whole turn in its own
                  transform; the back one flipped about the page's middle. */}
              <motion.span
                className="absolute inset-0 block will-change-transform [backface-visibility:hidden]"
                style={{
                  transformOrigin: g.landscape ? "0% 50%" : "50% 0%",
                  transform: leafFront,
                }}
              >
                {face(rectoOf(turningIndex), "recto")}
                <motion.span
                  className="absolute inset-0 block will-change-[opacity]"
                  style={{
                    opacity: frontShade,
                    backgroundImage: `linear-gradient(${g.landscape ? "to right" : "to bottom"}, oklch(0 0 0 / 0.2), oklch(0 0 0 / 0.75))`,
                  }}
                />
              </motion.span>
              <motion.span
                className="absolute inset-0 block will-change-transform [backface-visibility:hidden]"
                style={{
                  transformOrigin: g.landscape ? "0% 50%" : "50% 0%",
                  transform: leafBack,
                }}
              >
                {face(versoOf(turningIndex + 1), "verso")}
                <motion.span
                  className="absolute inset-0 block will-change-[opacity]"
                  style={{
                    opacity: backShade,
                    backgroundImage: `linear-gradient(${g.landscape ? "to left" : "to top"}, oklch(0 0 0 / 0.2), oklch(0 0 0 / 0.75))`,
                  }}
                />
              </motion.span>
            </motion.div>
          ) : null}

          {/* Tissues: the open spread's, and while a page turns the one it uncovers. */}
          {dir === 1 && tissueAt(shown + 1) ? (
            <Tissue
              key={`t${shown + 1}`}
              g={g}
              angle={tissueAt(shown + 1) as MotionValue<number>}
              leaf={null}
              bound={null}
              bend1={zeroMv}
              bend2={zeroMv}
              order={1}
              opacity={clamp01(tissue)}
              printed={printed}
              motionSafe={motionSafe}
              fade={tissueFade}
            />
          ) : null}
          {current ? (
            <Tissue
              key={`t${shown}`}
              g={g}
              angle={current}
              leaf={dir ? leaf : null}
              bound={dir === 1 ? "ahead" : dir === -1 ? "behind" : null}
              bend1={bend1}
              bend2={bend2}
              order={3}
              opacity={clamp01(tissue)}
              printed={printed}
              motionSafe={motionSafe}
              fade={tissueFade}
            />
          ) : null}
          {dir === -1 && tissueAt(shown - 1) ? (
            <Tissue
              key={`t${shown - 1}`}
              g={g}
              angle={tissueAt(shown - 1) as MotionValue<number>}
              leaf={null}
              bound={null}
              bend1={zeroMv}
              bend2={zeroMv}
              order={5}
              opacity={clamp01(tissue)}
              printed={printed}
              motionSafe={motionSafe}
              fade={tissueFade}
            />
          ) : null}
        </motion.div>
      </section>
      <p id={hintId} className="sr-only">
        Drag a page toward the spine to turn it, or use the arrow keys and Page
        Up and Page Down. Enter or Space lifts or lays the tissue over a print.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
