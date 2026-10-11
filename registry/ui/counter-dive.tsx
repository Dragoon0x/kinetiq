"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CounterDivePhase = "word" | "diving" | "through";

export type CounterDiveProps = {
  /** The word, in capitals A–Z and spaces; other characters are dropped. @default "BROOK" */
  word?: string;
  /** Which letter to dive through, by its index in the word, or the most central letter with a hole. @default "auto" */
  letter?: number | "auto";
  /** Stroke weight of the letters, 0 to 1: hairline letters with wide counters to heavy ones with portholes. @default 0.5 */
  weight?: number;
  /** How far the word magnifies, 40 to 200: a gentle dive to a rush through the hole. @default 90 */
  zoom?: number;
  /** Scroll distance the dive takes, px (400 to 1600). @default 900 */
  range?: number;
  /** Height of the pinned stage, px. Give it the height of the scroll container it sits in. @default 480 */
  height?: number;
  /** The picture: in the letters, and beyond the hole. @default a drawn valley at dusk */
  src?: string;
  /** Describes the picture for assistive technology. */
  alt?: string;
  /** The plain ground the word sits on, any CSS colour. @default var(--background) */
  ground?: string;
  /** The flat colour the strokes become as they magnify past you, any CSS colour. @default a dusk pigment */
  ink?: string;
  /** The element that carries the word for assistive technology. @default "h2" */
  as?: "h1" | "h2" | "h3";
  /** Shown in the picture once you are through. */
  children?: React.ReactNode;
  /** Fires as the dive progresses, 0 to 1, from the scroll that moved it. */
  onProgressChange?: (progress: number) => void;
  /** Fires when the dive moves between the word, diving and through. */
  onPhaseChange?: (phase: CounterDivePhase) => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------------ */
/* The alphabet: geometric monoline capitals, cap height 100. Centrelines   */
/* sit half a stroke inside the box, so weight thickens inward and a        */
/* letter's width never changes; every hole's shape is known exactly.       */
/* ------------------------------------------------------------------------ */

type Counter = {
  /** The hole's centreline, closed: the stroke covers its edge. */
  d: string;
  cx: number;
  cy: number;
  /** Distance from the centre to the inside of the stroke. */
  r: number;
};

type Glyph = { width: number; d: string; counters: Counter[] };

const WIDTHS: Record<string, number> = {
  A: 84,
  B: 72,
  C: 84,
  D: 82,
  E: 64,
  F: 60,
  G: 88,
  H: 78,
  I: 0,
  J: 58,
  K: 74,
  L: 58,
  M: 94,
  N: 80,
  O: 94,
  P: 70,
  Q: 94,
  R: 74,
  S: 70,
  T: 74,
  U: 78,
  V: 82,
  W: 114,
  X: 78,
  Y: 80,
  Z: 70,
  " ": 34,
};

function glyph(ch: string, w: number): Glyph {
  const i = w / 2;
  const G = ch === "I" ? w + 2 : (WIDTHS[ch] ?? 34);
  const T = i;
  const B = 100 - i;
  const xl = i;
  const xr = G - i;
  const xc = G / 2;
  const n = (v: number) => r2(v);
  const at = (rx: number, ry: number, a: number, cy = 50) =>
    `${n(xc + rx * Math.cos(a))} ${n(cy + ry * Math.sin(a))}`;
  const DEG = Math.PI / 180;
  /** A bowl: the stem at xl, straight top and bottom, a half-ellipse on the right. */
  const bowl = (top: number, bottom: number, right: number) => {
    const ry = (bottom - top) / 2;
    const rx = Math.min(ry, (right - xl) * 0.62);
    const xm = right - rx;
    return {
      d: `M${n(xl)} ${n(top)}H${n(xm)}A${n(rx)} ${n(ry)} 0 0 1 ${n(xm)} ${n(bottom)}H${n(xl)}Z`,
      counter: {
        cx: n((xl + right) / 2),
        cy: n((top + bottom) / 2),
        r: Math.max(0, Math.min(ry, (right - xl) / 2) - i),
      },
    };
  };
  switch (ch) {
    case "A": {
      const bar = 66;
      const legX = (y: number, side: number) =>
        xc + side * (xc - xl) * ((y - T) / (B - T));
      const l = legX(bar, -1);
      const rr = legX(bar, 1);
      // The triangle's inscribed circle, less half a stroke.
      const a = Math.hypot(xc - l, bar - T);
      const base = rr - l;
      const s = (2 * a + base) / 2;
      const area = (base * (bar - T)) / 2;
      const inr = area / s;
      return {
        width: G,
        d: `M${n(xl)} ${n(B)}L${n(xc)} ${n(T)}L${n(xr)} ${n(B)}M${n(l)} ${bar}H${n(rr)}`,
        counters: [
          {
            d: `M${n(xc)} ${n(T)}L${n(rr)} ${bar}H${n(l)}Z`,
            cx: n(xc),
            cy: n(bar - inr),
            r: Math.max(0, inr - i),
          },
        ],
      };
    }
    case "B": {
      const mid = 47;
      const up = bowl(T, mid, xr - 7);
      const low = bowl(mid, B, xr);
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}V${n(B)}${up.d}${low.d}`,
        counters: [
          { d: low.d, ...low.counter },
          { d: up.d, ...up.counter },
        ],
      };
    }
    case "C": {
      const rx = xc - xl;
      const ry = 50 - T;
      return {
        width: G,
        d: `M${at(rx, ry, -44 * DEG)}A${n(rx)} ${n(ry)} 0 1 0 ${at(rx, ry, 44 * DEG)}`,
        counters: [],
      };
    }
    case "D": {
      const d = bowl(T, B, xr);
      return {
        width: G,
        d: d.d,
        counters: [{ d: d.d, ...d.counter }],
      };
    }
    case "E":
      return {
        width: G,
        d: `M${n(xr)} ${n(T)}H${n(xl)}V${n(B)}H${n(xr)}M${n(xl)} 50H${n(xr - 7)}`,
        counters: [],
      };
    case "F":
      return {
        width: G,
        d: `M${n(xr)} ${n(T)}H${n(xl)}V${n(B)}M${n(xl)} 52H${n(xr - 7)}`,
        counters: [],
      };
    case "G": {
      const rx = xc - xl;
      const ry = 50 - T;
      return {
        width: G,
        d: `M${at(rx, ry, -42 * DEG)}A${n(rx)} ${n(ry)} 0 1 0 ${at(rx, ry, 6 * DEG)}H${n(xc + 4)}`,
        counters: [],
      };
    }
    case "H":
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}V${n(B)}M${n(xr)} ${n(T)}V${n(B)}M${n(xl)} 50H${n(xr)}`,
        counters: [],
      };
    case "I":
      return { width: G, d: `M${n(xc)} ${n(T)}V${n(B)}`, counters: [] };
    case "J": {
      const r = (xr - xl) / 2;
      return {
        width: G,
        d: `M${n(xr)} ${n(T)}V${n(B - r)}A${n(r)} ${n(r)} 0 0 1 ${n(xl)} ${n(B - r)}`,
        counters: [],
      };
    }
    case "K": {
      const t = 0.55;
      const jx = xr + (xl - xr) * t;
      const jy = T + (62 - T) * t;
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}V${n(B)}M${n(xr)} ${n(T)}L${n(xl)} 62M${n(jx)} ${n(jy)}L${n(xr)} ${n(B)}`,
        counters: [],
      };
    }
    case "L":
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}V${n(B)}H${n(xr)}`,
        counters: [],
      };
    case "M":
      return {
        width: G,
        d: `M${n(xl)} ${n(B)}V${n(T)}L${n(xc)} ${n(B - 26)}L${n(xr)} ${n(T)}V${n(B)}`,
        counters: [],
      };
    case "N":
      return {
        width: G,
        d: `M${n(xl)} ${n(B)}V${n(T)}L${n(xr)} ${n(B)}V${n(T)}`,
        counters: [],
      };
    case "O":
    case "Q": {
      const rx = xc - xl;
      const ry = 50 - T;
      const ring = `M${n(xc - rx)} 50A${n(rx)} ${n(ry)} 0 1 0 ${n(xc + rx)} 50A${n(rx)} ${n(ry)} 0 1 0 ${n(xc - rx)} 50Z`;
      const tail = ch === "Q" ? `M${n(xc + 10)} 64L${n(xr)} ${n(B)}` : "";
      return {
        width: G,
        d: ring + tail,
        counters: [
          {
            d: ring,
            cx: n(xc),
            cy: 50,
            r: Math.max(0, Math.min(rx, ry) - i),
          },
        ],
      };
    }
    case "P":
    case "R": {
      const p = bowl(T, 56, xr);
      const leg =
        ch === "R" ? `M${n(xl + (xr - xl) * 0.42)} 56L${n(xr)} ${n(B)}` : "";
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}V${n(B)}${p.d}${leg}`,
        counters: [{ d: p.d, ...p.counter }],
      };
    }
    case "S":
      return {
        width: G,
        d: `M${n(xr)} ${n(T + 16)}C${n(xr - 2)} ${n(T - 3)} ${n(xl)} ${n(T - 4)} ${n(xl)} ${n(T + 21)}C${n(xl)} ${n(47)} ${n(xr)} ${n(46)} ${n(xr)} ${n(B - 23)}C${n(xr)} ${n(B + 4)} ${n(xl + 2)} ${n(B + 3)} ${n(xl)} ${n(B - 16)}`,
        counters: [],
      };
    case "T":
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}H${n(xr)}M${n(xc)} ${n(T)}V${n(B)}`,
        counters: [],
      };
    case "U": {
      const r = (xr - xl) / 2;
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}V${n(B - r)}A${n(r)} ${n(r)} 0 0 0 ${n(xr)} ${n(B - r)}V${n(T)}`,
        counters: [],
      };
    }
    case "V":
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}L${n(xc)} ${n(B)}L${n(xr)} ${n(T)}`,
        counters: [],
      };
    case "W":
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}L${n(xl + (xr - xl) * 0.25)} ${n(B)}L${n(xc)} ${n(T + 26)}L${n(xl + (xr - xl) * 0.75)} ${n(B)}L${n(xr)} ${n(T)}`,
        counters: [],
      };
    case "X":
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}L${n(xr)} ${n(B)}M${n(xr)} ${n(T)}L${n(xl)} ${n(B)}`,
        counters: [],
      };
    case "Y":
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}L${n(xc)} 52L${n(xr)} ${n(T)}M${n(xc)} 52V${n(B)}`,
        counters: [],
      };
    case "Z":
      return {
        width: G,
        d: `M${n(xl)} ${n(T)}H${n(xr)}L${n(xl)} ${n(B)}H${n(xr)}`,
        counters: [],
      };
    default:
      return { width: G, d: "", counters: [] };
  }
}

/** Space between letters, in cap-height units. */
const TRACK = 12;

type Layout = {
  /** Each letter's stroke path, in its own units, and where it sits. */
  pieces: { x: number; d: string }[];
  width: number;
  /** The hole the dive goes through (its path in its letter's units, `x` its letter's place), or null. */
  hole: (Counter & { x: number }) | null;
  /** Where the dive aims when the letter has no hole: its middle. */
  aim: { x: number; y: number };
  text: string;
};

function layoutWord(raw: string, w: number, letter: number | "auto"): Layout {
  const text = raw
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let x = 0;
  const placed: { x: number; g: Glyph }[] = [];
  for (const ch of text) {
    const g = glyph(ch, w);
    placed.push({ x, g });
    x += g.width + TRACK;
  }
  const width = Math.max(1, x - TRACK);
  const middle = width / 2;
  let pick: { x: number; g: Glyph } | undefined;
  if (typeof letter === "number") {
    pick = placed[clamp(Math.round(letter), 0, Math.max(0, placed.length - 1))];
  } else {
    // The letter with a hole nearest the middle of the word.
    let best = Infinity;
    for (const p of placed) {
      if (p.g.counters.length === 0) continue;
      const dist = Math.abs(p.x + p.g.width / 2 - middle);
      if (dist < best - 0.5) {
        best = dist;
        pick = p;
      }
    }
    pick ??= placed[Math.floor(placed.length / 2)];
  }
  const hole = pick?.g.counters[0];
  return {
    pieces: placed.filter((p) => p.g.d).map((p) => ({ x: r2(p.x), d: p.g.d })),
    width,
    hole:
      hole && pick
        ? { ...hole, cx: r2(hole.cx + pick.x), x: r2(pick.x) }
        : null,
    aim: pick
      ? { x: r2(pick.x + pick.g.width / 2), y: 50 }
      : { x: r2(width / 2), y: 50 },
    text,
  };
}

/* ------------------------------------------------------------------------ */
/* The picture: a valley at dusk with a brook, drawn in a 1200 × 800 frame.  */
/* Fixed art: the same in either theme.                                      */
/* ------------------------------------------------------------------------ */

function Valley({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.4 0.07 268)" />
          <stop offset="0.5" stopColor="oklch(0.66 0.09 25)" />
          <stop offset="0.72" stopColor="oklch(0.86 0.09 70)" />
        </linearGradient>
        <linearGradient id={`${id}-brook`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.9 0.08 75)" />
          <stop offset="1" stopColor="oklch(0.62 0.08 40)" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="oklch(0.97 0.06 88)" />
          <stop
            offset="0.4"
            stopColor="oklch(0.93 0.1 80)"
            stopOpacity="0.85"
          />
          <stop offset="1" stopColor="oklch(0.9 0.1 70)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="800" fill={`url(#${id}-sky)`} />
      <circle cx="640" cy="452" r="150" fill={`url(#${id}-sun)`} />
      <circle cx="640" cy="452" r="46" fill="oklch(0.96 0.07 88)" />
      <path
        d="M0 470 L130 432 L240 450 L370 404 L480 436 L600 398 L730 430 L850 392 L990 430 L1100 408 L1200 430 L1200 800 L0 800 Z"
        fill="oklch(0.6 0.06 320)"
        opacity="0.6"
      />
      <path
        d="M0 512 L150 470 L280 496 L420 452 L540 490 L660 466 L800 500 L940 458 L1070 492 L1200 470 L1200 800 L0 800 Z"
        fill="oklch(0.46 0.06 300)"
        opacity="0.85"
      />
      <path
        d="M0 566 C180 520 330 560 480 536 C620 514 760 552 900 530 C1040 508 1120 540 1200 528 L1200 800 L0 800 Z"
        fill="oklch(0.38 0.05 200)"
      />
      <path
        d="M0 620 C200 590 360 612 540 600 C720 588 900 616 1200 596 L1200 800 L0 800 Z"
        fill="oklch(0.32 0.05 165)"
      />
      <path
        d="M620 540 C600 566 560 580 580 606 C602 634 700 640 690 676 C680 716 520 726 470 800 L840 800 C830 742 770 718 790 680 C810 640 700 620 672 600 C650 584 664 562 640 540 Z"
        fill={`url(#${id}-brook)`}
      />
      <path
        d="M600 612 C640 622 690 630 700 650 M560 704 C620 700 700 712 760 740"
        stroke="oklch(0.97 0.04 85)"
        strokeWidth="3"
        fill="none"
        opacity="0.7"
      />
      {[
        [180, 600, 34],
        [228, 606, 26],
        [262, 596, 40],
        [880, 604, 36],
        [930, 612, 28],
        [1010, 598, 44],
        [1080, 606, 30],
        [120, 640, 52],
        [1120, 644, 56],
      ].map(([x = 0, y = 0, h = 30], k) => (
        <path
          key={k}
          d={`M${x} ${y - h} L${x + h * 0.36} ${y} L${x - h * 0.36} ${y} Z`}
          fill="oklch(0.24 0.04 250)"
        />
      ))}
      {[
        [420, 300],
        [460, 286],
        [760, 330],
      ].map(([x = 0, y = 0], k) => (
        <path
          key={k}
          d={`M${x - 12} ${y - 5} Q${x - 5} ${y - 9} ${x} ${y} Q${x + 5} ${y - 9} ${x + 12} ${y - 5}`}
          stroke="oklch(0.3 0.04 270)"
          strokeWidth="3"
          fill="none"
        />
      ))}
    </>
  );
}

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) {
      return el;
    }
  }
  return null;
}

const phaseOf = (p: number): CounterDivePhase =>
  p < 0.02 ? "word" : p > 0.97 ? "through" : "diving";

/**
 * A giant word in a geometric monoline alphabet, its strokes filled with a
 * picture, on a plain ground. As its scroll container scrolls through the
 * section, the stage pins and the word magnifies around one letter's hole —
 * the counter of the O by default — while sliding it to the middle of the
 * frame. The hole is a window: as you near it the ground inside thins away
 * and the picture beyond appears at its own depth, settling from 1.3× to
 * 1×; the strokes rush out past the edges, their texture giving way to a flat
 * ink as it magnifies, and you pass through into the picture, where the
 * caption rises in. Scrolling back pulls you out through the same hole.
 *
 * The shown progress follows the scroll on a critically damped spring with
 * the springs.glide constants, and the scale is exponential in progress, so
 * the dive keeps a steady speed through depth. The stage is focusable: Down,
 * Page Down and Space dive deeper, Up and Page Up back out, Home and End jump
 * to either end. Under reduced motion nothing zooms: past halfway the picture
 * cross-fades in over the word.
 */
export function CounterDive({
  word = "BROOK",
  letter = "auto",
  weight = 0.5,
  zoom = 90,
  range = 900,
  height = 480,
  src,
  alt = "A brook winding down a valley toward a low sun at dusk",
  ground = "var(--background)",
  ink = "oklch(0.34 0.06 285)",
  as = "h2",
  children,
  onProgressChange,
  onPhaseChange,
  className,
}: CounterDiveProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const id = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${id}-hint`;
  const Heading = as;
  const stroke = lerp(7, 26, clamp(weight, 0, 1));
  const span = clamp(range, 200, 4000);

  const layout = React.useMemo(
    () => layoutWord(word, stroke, letter),
    [word, stroke, letter],
  );
  const pieces = layout.pieces;

  const [w, setW] = React.useState(720);
  const [phase, setPhase] = React.useState<CounterDivePhase>("word");
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  // The word at rest: 86% of the width or half the height, whichever binds.
  const fit = Math.min((w * 0.86) / layout.width, (height * 0.5) / 100);
  const ox = (w - layout.width * fit) / 2;
  const oy = (height - 100 * fit) / 2;
  const target = layout.hole ?? {
    cx: layout.aim.x,
    cy: layout.aim.y,
    r: stroke,
    d: "",
    x: 0,
  };
  // The scale at which the hole's inside reaches past the frame's corners.
  const through =
    Math.hypot(w, height) / 2 / Math.max(0.5, target.r * fit) / 0.92;
  const top = Math.max(clamp(zoom, 10, 400), through * 1.15);

  const sectionRef = React.useRef<HTMLElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const zoomRef = React.useRef<SVGGElement | null>(null);
  const clipRef = React.useRef<SVGPathElement | null>(null);
  const portalRef = React.useRef<SVGGElement | null>(null);
  const beyondRef = React.useRef<SVGGElement | null>(null);
  const flatRef = React.useRef<SVGRectElement | null>(null);
  const wordRef = React.useRef<SVGGElement | null>(null);
  const captionRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<{ kick: () => void } | null>(null);

  const config = {
    fit,
    ox,
    oy,
    w,
    height,
    cx: target.cx,
    cy: target.cy,
    holeX: target.x,
    hasHole: Boolean(layout.hole),
    top,
    span,
    motionSafe,
    onProgressChange,
    onPhaseChange,
  };
  const latest = React.useRef(config);
  const phaseRef = React.useRef<CounterDivePhase>("word");
  React.useEffect(() => {
    latest.current = config;
    engine.current?.kick();
  });

  React.useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const scroller = scrollParent(section);
    const target: HTMLElement | Window = scroller ?? window;
    let shown = -1;
    let velocity = 0;
    let frame = 0;
    let last = 0;
    let visible = true;
    let reported = -1;
    // Only what changed is written: a resting dive touches nothing.
    let written = new WeakMap<Element, Record<string, string>>();
    const set = (el: Element | null, name: string, value: string) => {
      if (!el) return;
      const seen = written.get(el) ?? {};
      if (seen[name] === value) return;
      seen[name] = value;
      written.set(el, seen);
      if (name === "opacity") (el as HTMLElement).style.opacity = value;
      else if (name === "transform-css") {
        (el as HTMLElement).style.transform = value;
      } else el.setAttribute(name, value);
    };

    const goal = () => {
      const c = latest.current;
      const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
      const rel = section.getBoundingClientRect().top - top0;
      return clamp(-rel / c.span, 0, 1);
    };

    const paint = (p: number) => {
      const c = latest.current;
      // Reduced motion has no dive: past halfway the picture simply arrives.
      const nextPhase: CounterDivePhase = c.motionSafe
        ? phaseOf(p)
        : p >= 0.5
          ? "through"
          : "word";
      if (nextPhase !== phaseRef.current) {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
        c.onPhaseChange?.(nextPhase);
        if (nextPhase !== "diving") {
          setSaid((s) => ({
            n: s.n + 1,
            text:
              nextPhase === "through"
                ? "Through the hole, in the picture."
                : "Back at the word.",
          }));
        }
      }
      const rounded = Math.round(p * 1000) / 1000;
      if (rounded !== reported) {
        reported = rounded;
        c.onProgressChange?.(rounded);
      }
      if (!c.motionSafe) {
        // Reduced motion: the word holds still and the picture cross-fades.
        const rest = `translate(${r2(c.ox)} ${r2(c.oy)}) scale(${r3(c.fit)})`;
        set(zoomRef.current, "transform", rest);
        set(wordRef.current, "opacity", "1");
        set(flatRef.current, "opacity", "0");
        set(portalRef.current, "opacity", "0");
        return;
      }
      // Exponential in progress: equal scroll, equal ratio of magnification.
      const e = Math.pow(p, 1.18);
      const s = c.fit * Math.pow(c.top, e);
      const restX = c.ox + c.fit * c.cx;
      const restY = c.oy + c.fit * c.cy;
      const glide = smooth(0, 0.55, p);
      const mx = lerp(restX, c.w / 2, glide);
      const my = lerp(restY, c.height / 2, glide);
      const transform = `translate(${r2(mx)} ${r2(my)}) scale(${r3(s)}) translate(${r2(-c.cx)} ${r2(-c.cy)})`;
      set(zoomRef.current, "transform", transform);
      set(clipRef.current, "transform", `${transform} translate(${c.holeX} 0)`);
      const open = c.hasHole ? smooth(0.12, 0.56, p) : 0;
      set(portalRef.current, "opacity", String(r3(open)));
      const depth = lerp(1.32, 1, smooth(0.1, 1, p));
      set(
        beyondRef.current,
        "transform",
        `translate(${r2(c.w / 2)} ${r2(c.height / 2)}) scale(${r3(depth)}) translate(${r2(-c.w / 2)} ${r2(-c.height / 2)})`,
      );
      set(flatRef.current, "opacity", String(r3(smooth(0.22, 0.6, p) * 0.9)));
      set(
        wordRef.current,
        "opacity",
        String(r3(c.hasHole ? 1 - smooth(0.9, 0.99, p) : 1)),
      );
      const caption = smooth(0.84, 1, p);
      if (captionRef.current) {
        set(captionRef.current, "opacity", String(r3(caption)));
        set(
          captionRef.current,
          "transform-css",
          `translateY(${r2((1 - caption) * 8)}px)`,
        );
      }
    };

    const frameOnce = (now: number) => {
      frame = 0;
      const c = latest.current;
      const want = goal();
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (shown < 0 || !c.motionSafe) {
        shown = want;
        velocity = 0;
      } else {
        // The glide constants: critically damped, a breath behind the scroll.
        const k = springs.glide.stiffness / springs.glide.mass;
        const d = springs.glide.damping / springs.glide.mass;
        const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
        const h = dt / steps;
        for (let i = 0; i < steps; i += 1) {
          velocity += (-k * (shown - want) - d * velocity) * h;
          shown += velocity * h;
        }
        if (Math.abs(shown - want) < 0.0005 && Math.abs(velocity) < 0.001) {
          shown = want;
          velocity = 0;
        }
      }
      paint(clamp(shown, 0, 1));
      if (shown !== want && visible && !document.hidden) {
        frame = window.requestAnimationFrame(frameOnce);
      } else last = 0;
    };

    const kick = () => {
      if (frame || !visible) return;
      frame = window.requestAnimationFrame(frameOnce);
    };
    engine.current = {
      kick: () => {
        written = new WeakMap();
        kick();
      },
    };

    const onScroll = () => kick();
    target.addEventListener("scroll", onScroll, { passive: true });
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (visible) kick();
    });
    watcher.observe(section);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    kick();
    return () => {
      target.removeEventListener("scroll", onScroll);
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      engine.current = null;
    };
  }, []);

  const bindStage = React.useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const next = Math.round(node.clientWidth);
      if (next > 0) setW((prev) => (prev === next ? prev : next));
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  /** Scrolls the container so the dive stands at `p`. */
  const diveTo = (p: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const scroller = scrollParent(section);
    const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
    const now = scroller ? scroller.scrollTop : window.scrollY;
    const start = section.getBoundingClientRect().top - top0 + now;
    const top = Math.max(0, start + clamp(p, 0, 1) * span);
    const behavior: ScrollBehavior = motionSafe ? "smooth" : "auto";
    if (scroller) scroller.scrollTo({ top, behavior });
    else window.scrollTo({ top, behavior });
  };

  const progressNow = () => {
    const section = sectionRef.current;
    if (!section) return 0;
    const scroller = scrollParent(section);
    const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
    return clamp(-(section.getBoundingClientRect().top - top0) / span, 0, 1);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const p = progressNow();
    const moves: Record<string, number> = {
      ArrowDown: p + 0.1,
      ArrowUp: p - 0.1,
      PageDown: p + 0.34,
      PageUp: p - 0.34,
      " ": p + 0.34,
      Home: 0,
      End: 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    diveTo(to);
  };

  const view = `0 0 ${w} ${height}`;
  const rest = `translate(${r2(ox)} ${r2(oy)}) scale(${r3(fit)})`;
  const coverFrame = (() => {
    // The picture covers the frame (1200 × 800, centred).
    const s = Math.max(w / 1200, height / 800);
    return `translate(${r2((w - 1200 * s) / 2)} ${r2((height - 800 * s) / 2)}) scale(${r3(s)})`;
  })();
  const coverWord = (() => {
    const s = Math.max(layout.width / 1200, 100 / 800) * 1.1;
    return `translate(${r2((layout.width - 1200 * s) / 2)} ${r2((100 - 800 * s) / 2)}) scale(${r3(s)})`;
  })();
  const picture = src ? (
    <image
      href={src}
      width="1200"
      height="800"
      preserveAspectRatio="xMidYMid slice"
    />
  ) : (
    <Valley id={`${id}-v`} />
  );

  return (
    <section
      ref={sectionRef}
      className={cn("group/counter-dive relative w-full", className)}
      style={{ height: height + span }}
      aria-labelledby={`${id}-word`}
    >
      <div
        ref={bindStage}
        role="group"
        aria-roledescription="scroll scene"
        aria-labelledby={`${id}-word`}
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          "sticky top-0 isolate w-full overflow-clip outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ height, backgroundColor: ground }}
      >
        <Heading id={`${id}-word`} className="sr-only">
          {layout.text}
        </Heading>
        <span role="img" aria-label={alt} className="sr-only" />
        <svg
          aria-hidden
          viewBox={view}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 block size-full"
        >
          <defs>
            <g id={`${id}-pic`}>{picture}</g>
            <mask
              id={`${id}-mask`}
              maskUnits="userSpaceOnUse"
              x={-40}
              y={-40}
              width={r2(layout.width + 80)}
              height={180}
            >
              {pieces.map((p, k) => (
                <path
                  key={k}
                  d={p.d}
                  transform={`translate(${p.x} 0)`}
                  fill="none"
                  stroke="white"
                  strokeWidth={r2(stroke)}
                  strokeLinejoin="round"
                />
              ))}
            </mask>
            <clipPath id={`${id}-hole`} clipPathUnits="userSpaceOnUse">
              <path
                ref={clipRef}
                d={target.d || "M0 0Z"}
                transform={`${rest} translate(${target.x} 0)`}
              />
            </clipPath>
          </defs>
          <g
            ref={portalRef}
            clipPath={`url(#${id}-hole)`}
            style={{ opacity: 0 }}
          >
            <g ref={beyondRef}>
              <use href={`#${id}-pic`} transform={coverFrame} />
            </g>
          </g>
          <g ref={wordRef}>
            <g ref={zoomRef} transform={rest}>
              <g mask={`url(#${id}-mask)`}>
                <use href={`#${id}-pic`} transform={coverWord} />
                <rect
                  ref={flatRef}
                  x={-40}
                  y={-40}
                  width={r2(layout.width + 80)}
                  height={180}
                  style={{ fill: ink, opacity: 0 }}
                />
              </g>
            </g>
          </g>
        </svg>
        {/* Reduced motion: the picture cross-fades in past halfway. */}
        <svg
          aria-hidden
          viewBox={view}
          preserveAspectRatio="xMidYMid slice"
          className={cn(
            "pointer-events-none absolute inset-0 block size-full transition-opacity duration-400",
            !motionSafe && phase === "through" ? "opacity-100" : "opacity-0",
            motionSafe && "hidden",
          )}
        >
          <use href={`#${id}-pic`} transform={coverFrame} />
        </svg>
        {children ? (
          <div
            ref={captionRef}
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5",
              !motionSafe &&
                (phase === "through"
                  ? "opacity-100 transition-opacity duration-400"
                  : "opacity-0 transition-opacity duration-400"),
            )}
            style={motionSafe ? { opacity: 0 } : undefined}
          >
            {children}
          </div>
        ) : null}
        <p id={hintId} className="sr-only">
          Scroll to dive through the letter into the picture. Down, Page Down
          and Space dive deeper, Up and Page Up back out, Home and End jump to
          either end.
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </section>
  );
}
