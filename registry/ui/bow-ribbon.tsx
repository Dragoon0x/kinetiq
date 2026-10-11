"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type RibbonTag = "h1" | "h2" | "h3" | "p" | "div" | "span";
export type BowRibbonTrigger = "mount" | "inView" | "hover" | "manual";

export type BowRibbonProps = {
  /** The message printed on the ribbon. @default "Thank you for coming" */
  text?: string;
  /** The element the message renders as. @default "h2" */
  as?: RibbonTag;
  /** The ribbon's width, in em of the type: 1.2 is snug, 2.4 generous. @default 1.6 */
  ribbonWidth?: number;
  /** How strongly the satin catches the light as it turns, 0 (matte) to 1. @default 0.6 */
  sheen?: number;
  /** The bow's size relative to the ribbon, 0.6 to 1.6. @default 1 */
  bowSize?: number;
  /** The satin's colour, any CSS colour. @default "oklch(from var(--danger) 0.56 calc(c * 0.9) h)" */
  color?: string;
  /** The printed message's colour. @default "oklch(from var(--danger) 0.97 0.02 h)" */
  textColor?: string;
  /** Full turns the ribbon makes as it comes in, 0 to 3. @default 2 */
  twists?: number;
  /** When the ribbon runs: on mount, when first on screen, on hover or focus, or only when `replayKey` changes. @default "inView" */
  trigger?: BowRibbonTrigger;
  /** Run once, or again each time it returns to view (inView) or is hovered. @default true */
  once?: boolean;
  /** Wait before it starts, ms. @default 0 */
  delay?: number;
  /** How long the ribbon takes to come in and tie, ms (900 to 6000). @default 2400 */
  duration?: number;
  /** Change it to run the ribbon again. */
  replayKey?: string | number;
  /** Fires when a run begins. */
  onStart?: () => void;
  /** Fires when the bow has settled. */
  onComplete?: () => void;
  /** Sets the type size (the ribbon is sized in em) and places it. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Graphemes, so an accented letter or an emoji is printed whole. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** Front shades: the satin lifted toward white by the sheen. Back: matte, deeper. */
const FRONT_LEVELS = 6;
const BACK_LEVELS = 2;
/**
 * A shade's fill, stroked a hair in the same colour: neighbouring pieces of
 * one shade then overlap, so no anti-aliased seam shows between them.
 */
const seam = (fill: string) => ({
  fill,
  stroke: fill,
  strokeWidth: 0.025,
  strokeLinejoin: "round" as const,
});
const frontFill = (color: string, level: number) =>
  `color-mix(in oklab, ${color}, white ${level * 7}%)`;
const backFill = (color: string, level: number) =>
  `color-mix(in oklab, ${color}, black ${30 - level * 10}%)`;

type Pt = { x: number; y: number };
type Curve = [Pt, Pt, Pt, Pt];

/**
 * The bow's centre line, in units of the loop size, from the knot: a right
 * loop, a left loop, then a tail to the lower right. The ribbon arrives at
 * the knot from the left and runs on round this track, so the bow is tied by
 * the ribbon itself sliding home.
 */
const BOW: Curve[] = [
  [
    { x: 0, y: 0 },
    { x: 0.55, y: -0.75 },
    { x: 1.6, y: -1.45 },
    { x: 2.25, y: -0.75 },
  ],
  [
    { x: 2.25, y: -0.75 },
    { x: 2.75, y: -0.2 },
    { x: 2.3, y: 0.55 },
    { x: 1.5, y: 0.45 },
  ],
  [
    { x: 1.5, y: 0.45 },
    { x: 0.85, y: 0.38 },
    { x: 0.3, y: 0.15 },
    { x: 0, y: 0 },
  ],
  [
    { x: 0, y: 0 },
    { x: -0.55, y: -0.75 },
    { x: -1.6, y: -1.45 },
    { x: -2.25, y: -0.75 },
  ],
  [
    { x: -2.25, y: -0.75 },
    { x: -2.75, y: -0.2 },
    { x: -2.3, y: 0.55 },
    { x: -1.5, y: 0.45 },
  ],
  [
    { x: -1.5, y: 0.45 },
    { x: -0.85, y: 0.38 },
    { x: -0.3, y: 0.15 },
    { x: 0, y: 0 },
  ],
  [
    { x: 0, y: 0 },
    { x: 0.35, y: 0.55 },
    { x: 0.75, y: 1.3 },
    { x: 1.05, y: 2.15 },
  ],
];
/** The second tail, tucked under the knot: it drops in as the knot wraps. */
const TAIL: Curve[] = [
  [
    { x: 0, y: 0 },
    { x: -0.3, y: 0.6 },
    { x: -0.8, y: 1.25 },
    { x: -1.0, y: 2.0 },
  ],
];

const bez = (c: Curve, t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  };
};

type Track = {
  x: Float64Array;
  y: Float64Array;
  s: Float64Array;
  /** Which curve each sample is on, and how far along it (for the loops' turn). */
  seg: Uint8Array;
  frac: Float64Array;
  length: number;
};

/** Samples curves (in loop units, scaled by `r`) to a polyline with arc length. */
function track(curves: Curve[], r: number): Track {
  const per = 40;
  const count = curves.length * per + 1;
  const x = new Float64Array(count);
  const y = new Float64Array(count);
  const s = new Float64Array(count);
  const seg = new Uint8Array(count);
  const frac = new Float64Array(count);
  let k = 0;
  let len = 0;
  for (let c = 0; c < curves.length; c += 1) {
    const curve = curves[c];
    if (!curve) continue;
    for (let j = c === 0 ? 0 : 1; j <= per; j += 1) {
      const p = bez(curve, j / per);
      const px = p.x * r;
      const py = p.y * r;
      if (k > 0) len += Math.hypot(px - (x[k - 1] ?? 0), py - (y[k - 1] ?? 0));
      x[k] = px;
      y[k] = py;
      s[k] = len;
      seg[k] = c;
      frac[k] = j / per;
      k += 1;
    }
  }
  return {
    x: x.subarray(0, k),
    y: y.subarray(0, k),
    s: s.subarray(0, k),
    seg: seg.subarray(0, k),
    frac: frac.subarray(0, k),
    length: len,
  };
}

/** The ribbon's width on the bow: it gathers from the band's width at the knot. */
const bowWidth = (l: { wr: number; bw: number; r: number }, v: number) =>
  l.bw + (l.wr - l.bw) * (1 - smooth(0, l.r * 0.55, v));

/** The ribbon's own turn on the bow: each loop narrows toward its far end. */
const bowTurn = (seg: number, frac: number) =>
  seg < 6 ? 0.28 * Math.sin(Math.PI * frac) : 0.14 * Math.sin(Math.PI * frac);

type Layout = {
  /** Width of the band, of the ribbon in the bow, the loop unit, and the knot, em. */
  wr: number;
  bw: number;
  r: number;
  knotW: number;
  knotH: number;
  /** From the box's top to the band's centre, and the box height, em. */
  cy: number;
  height: number;
  /** From the box's right edge to the knot, em. */
  kRight: number;
  /** The bow's own box around the knot, em. */
  left: number;
  right: number;
  up: number;
  down: number;
};

function layoutOf(ribbonWidth: number, bowSize: number): Layout {
  const wr = clamp(ribbonWidth, 1, 3);
  // The bow is tied narrower than the band lies, as a ribbon gathers at a
  // knot: loops three to four times its width read as loops, not a blot.
  const bw = wr * 0.48;
  const r = clamp(bowSize, 0.4, 2) * wr * 0.82;
  const up = Math.max(1.45 * r + bw * 0.55, wr * 0.55);
  const down = 2.2 * r + bw * 0.55;
  const left = 2.62 * r + bw * 0.55;
  const right = 2.62 * r + bw * 0.55;
  return {
    wr,
    bw,
    r,
    knotW: bw * 1.05,
    knotH: wr * 1.02,
    cy: up + 0.1,
    height: up + down + 0.2,
    kRight: right + 0.25,
    left,
    right,
    up,
    down,
  };
}

/** Front and back strips of a ribbon along a centre line, as path data per shade. */
type Strip = { front: string[]; back: string[]; hem: string };

const emptyStrip = (): Strip => ({
  front: Array.from({ length: FRONT_LEVELS }, () => ""),
  back: Array.from({ length: BACK_LEVELS }, () => ""),
  hem: "",
});

/**
 * Lays a strip along points (x, y) with a turn θ at each: half-width w·cos θ,
 * the plain back where cos θ < 0, each piece filed under its shade. `notch`
 * cuts the last end in a V, as ribbon ends are cut.
 */
function stripOf(
  out: Strip,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  th: ArrayLike<number>,
  count: number,
  w: number,
  sheen: number,
  notch: boolean,
  ws?: ArrayLike<number>,
  hems = true,
  slopeK = 0.22,
) {
  const f = (v: number) => r3(v);
  const levelOf = (theta: number, slope: number) => {
    const lit = Math.max(0, Math.cos(theta - 0.5 + slope * slopeK));
    return Math.min(
      FRONT_LEVELS - 1,
      Math.round(sheen * Math.pow(lit, 10) * (FRONT_LEVELS - 1)),
    );
  };
  const front = out.front.map(() => [] as string[]);
  const back = out.back.map(() => [] as string[]);
  const hem: string[] = [];
  let pLx = 0;
  let pLy = 0;
  let pRx = 0;
  let pRy = 0;
  let pC = 1;
  let pX = 0;
  let pY = 0;
  // A V-cut end is one piece of its own, from far enough back to hold the
  // whole notch: cut into the last sample alone, it would fold back over the
  // pieces before it and punch holes where their windings cancel.
  let stop = count - 1;
  let depth = 0;
  if (notch && count > 2) {
    const wEnd = ws ? (ws[count - 1] ?? w) : w;
    depth = wEnd * 0.38;
    let run = 0;
    while (stop > 1 && run < depth) {
      run += Math.hypot(
        (xs[stop] ?? 0) - (xs[stop - 1] ?? 0),
        (ys[stop] ?? 0) - (ys[stop - 1] ?? 0),
      );
      stop -= 1;
    }
  }
  let sLx = 0;
  let sLy = 0;
  let sRx = 0;
  let sRy = 0;
  for (let i = 0; i < count; i += 1) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    let tx = (xs[b] ?? 0) - (xs[a] ?? 0);
    let ty = (ys[b] ?? 0) - (ys[a] ?? 0);
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const c = Math.cos(th[i] ?? 0);
    const hw = ((ws ? (ws[i] ?? w) : w) / 2) * c;
    const x = xs[i] ?? 0;
    const y = ys[i] ?? 0;
    const lx = x - ty * hw;
    const ly = y + tx * hw;
    const rx = x + ty * hw;
    const ry = y - tx * hw;
    if (i === stop) {
      sLx = lx;
      sLy = ly;
      sRx = rx;
      sRy = ry;
    }
    if (notch && i === count - 1 && stop < count - 1) {
      // The cut end: the last stretch as one piece, notched at its centre.
      const nx = x - tx * depth * Math.abs(c);
      const ny = y - ty * depth * Math.abs(c);
      const tip = `M${f(sLx)} ${f(sLy)}L${f(lx)} ${f(ly)}L${f(nx)} ${f(ny)}L${f(rx)} ${f(ry)}L${f(sRx)} ${f(sRy)}Z`;
      if (c >= 0) front[levelOf(th[i] ?? 0, Math.atan2(ty, tx))]?.push(tip);
      else back[0]?.push(tip);
    }
    if (i > 0 && i <= stop) {
      const slope = Math.atan2(ty, tx);
      const quad = (
        ax: number,
        ay: number,
        bx: number,
        by: number,
        cx: number,
        cy: number,
        dx: number,
        dy: number,
      ) =>
        `M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}L${f(dx)} ${f(dy)}Z`;
      if (pC * c >= 0) {
        const mid = (pC + c) / 2;
        const piece = quad(pLx, pLy, lx, ly, rx, ry, pRx, pRy);
        if (mid >= 0) front[levelOf(th[i] ?? 0, slope)]?.push(piece);
        else back[Math.abs(mid) > 0.6 ? 1 : 0]?.push(piece);
        if (hems && mid > 0.35) {
          const inset = 0.16;
          hem.push(
            `M${f(pLx + (pRx - pLx) * inset)} ${f(pLy + (pRy - pLy) * inset)}L${f(lx + (rx - lx) * inset)} ${f(ly + (ry - ly) * inset)}`,
            `M${f(pRx + (pLx - pRx) * inset)} ${f(pRy + (pLy - pRy) * inset)}L${f(rx + (lx - rx) * inset)} ${f(ry + (ly - ry) * inset)}`,
          );
        }
      } else {
        // The strip turns over inside this piece: two triangles, one each side.
        const t = pC / (pC - c);
        const xx = pX + (x - pX) * t;
        const yy = pY + (y - pY) * t;
        const first = `M${f(pLx)} ${f(pLy)}L${f(xx)} ${f(yy)}L${f(pRx)} ${f(pRy)}Z`;
        const second = `M${f(xx)} ${f(yy)}L${f(lx)} ${f(ly)}L${f(rx)} ${f(ry)}Z`;
        if (pC >= 0) front[levelOf(th[i - 1] ?? 0, slope)]?.push(first);
        else back[0]?.push(first);
        if (c >= 0) front[levelOf(th[i] ?? 0, slope)]?.push(second);
        else back[0]?.push(second);
      }
    }
    pLx = lx;
    pLy = ly;
    pRx = rx;
    pRy = ry;
    pC = c;
    pX = x;
    pY = y;
  }
  for (let k = 0; k < FRONT_LEVELS; k += 1) {
    out.front[k] = (out.front[k] ?? "") + (front[k]?.join("") ?? "");
  }
  for (let k = 0; k < BACK_LEVELS; k += 1) {
    out.back[k] = (out.back[k] ?? "") + (back[k]?.join("") ?? "");
  }
  out.hem += hem.join("");
}

/** The tied bow at rest, around the knot at (0, 0), in em: for the still frame. */
function restingBow(l: Layout, sheen: number): Strip & { tail: Strip } {
  const bow = track(BOW, l.r);
  const tail = track(TAIL, l.r);
  const out = emptyStrip();
  const th = new Float64Array(bow.x.length);
  for (let i = 0; i < th.length; i += 1) {
    th[i] = bowTurn(bow.seg[i] ?? 0, bow.frac[i] ?? 0);
  }
  const ws = new Float64Array(bow.x.length);
  for (let i = 0; i < ws.length; i += 1) ws[i] = bowWidth(l, bow.s[i] ?? 0);
  stripOf(out, bow.x, bow.y, th, bow.x.length, l.bw, sheen, true, ws, false, 0);
  const tailOut = emptyStrip();
  const tt = new Float64Array(tail.x.length);
  for (let i = 0; i < tt.length; i += 1)
    tt[i] = 0.18 * Math.sin(Math.PI * (tail.frac[i] ?? 0));
  stripOf(
    tailOut,
    tail.x,
    tail.y,
    tt,
    tail.x.length,
    l.bw,
    sheen,
    true,
    undefined,
    false,
    0,
  );
  return { ...out, tail: tailOut };
}

const knotPath = (l: Layout) => {
  const w = l.knotW;
  const h = l.knotH;
  const rr = Math.min(w, h) * 0.32;
  const x0 = -w / 2;
  const y0 = -h / 2;
  return `M${r3(x0 + rr)} ${r3(y0)}H${r3(x0 + w - rr)}Q${r3(x0 + w)} ${r3(y0)} ${r3(x0 + w)} ${r3(y0 + rr)}V${r3(y0 + h - rr)}Q${r3(x0 + w)} ${r3(y0 + h)} ${r3(x0 + w - rr)} ${r3(y0 + h)}H${r3(x0 + rr)}Q${r3(x0)} ${r3(y0 + h)} ${r3(x0)} ${r3(y0 + h - rr)}V${r3(y0 + rr)}Q${r3(x0)} ${r3(y0)} ${r3(x0 + rr)} ${r3(y0)}Z`;
};

/**
 * A message printed on a satin ribbon that comes in from the left edge and
 * ties itself into a bow. The ribbon slides along its own path like a strip
 * pulled off a spool, twisting as it comes — its width is w·cos θ, the plain
 * back shows where it turns over, and a sheen band runs along the satin as
 * the turn meets the light — while a soft wave rolls along it and dies away.
 * When the message has passed, the head of the ribbon runs on round the
 * bow's track at the knot, so the end loops up, makes a right loop, a left
 * loop and drops into a tail; the knot wraps on, a second tail drops in, and
 * the bow lands with a small bounce on the recoil constants.
 *
 * Everything is in em, so it sizes with the type. The still frame — the
 * ribbon lying flat with the message centred and the bow tied — is plain
 * HTML and SVG the server renders, and it is what reduced motion shows. The
 * message is read once from the heading's own text.
 */
export function BowRibbon({
  text = "Thank you for coming",
  as = "h2",
  ribbonWidth = 1.6,
  sheen = 0.6,
  bowSize = 1,
  color = "oklch(from var(--danger) 0.56 calc(c * 0.9) h)",
  textColor = "oklch(from var(--danger) 0.97 0.02 h)",
  twists = 2,
  trigger = "inView",
  once = true,
  delay = 0,
  duration = 2400,
  replayKey,
  onStart,
  onComplete,
  className,
}: BowRibbonProps) {
  const motionSafe = useMotionSafe();
  const Tag = as;
  const glyphs = React.useMemo(() => graphemes(text), [text]);
  const l = React.useMemo(
    () => layoutOf(ribbonWidth, bowSize),
    [ribbonWidth, bowSize],
  );
  const shine = clamp01(sheen);
  const rest = React.useMemo(() => restingBow(l, shine), [l, shine]);
  const restLevel = Math.min(
    FRONT_LEVELS - 1,
    Math.round(shine * Math.pow(Math.cos(0.5), 10) * (FRONT_LEVELS - 1)),
  );

  const rootRef = React.useRef<HTMLElement | null>(null);
  const stillRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  /** Shade paths: [0] the band, [1] the bow. */
  const frontRefs = React.useRef<(SVGPathElement | null)[][]>([[], []]);
  const backRefs = React.useRef<(SVGPathElement | null)[][]>([[], []]);
  const hemRefs = React.useRef<(SVGPathElement | null)[]>([]);
  const tailRefs = React.useRef<(SVGPathElement | null)[]>([]);
  const knotRef = React.useRef<SVGGElement | null>(null);
  const bowRef = React.useRef<SVGGElement | null>(null);
  const glyphRefs = React.useRef<(SVGTextElement | null)[]>([]);
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const runRef = React.useRef<{
    frame: number;
    timer: number;
    /** A run paused off screen or in a hidden tab, waiting to go on. */
    waiting: ((time: number) => void) | null;
  }>({ frame: 0, timer: 0, waiting: null });
  /** On screen, as the run's own pause sees it (independent of the trigger). */
  const onScreen = React.useRef(true);
  const latest = React.useRef({
    onStart,
    onComplete,
    duration,
    delay,
    twists,
    l,
    shine,
    glyphs,
    motionSafe,
  });
  React.useEffect(() => {
    latest.current = {
      onStart,
      onComplete,
      duration,
      delay,
      twists,
      l,
      shine,
      glyphs,
      motionSafe,
    };
  });

  /** Ends any run and shows the still frame: an interrupted run never freezes half-tied. */
  const stop = React.useCallback(() => {
    const run = runRef.current;
    if (run.frame) window.cancelAnimationFrame(run.frame);
    window.clearTimeout(run.timer);
    run.frame = 0;
    run.timer = 0;
    run.waiting = null;
    if (stillRef.current) stillRef.current.style.opacity = "1";
    if (svgRef.current) svgRef.current.style.opacity = "0";
  }, []);
  const completed = React.useRef(false);

  /** One run: unspool, tie, settle, then hand back to the still frame. */
  const play = React.useCallback(() => {
    stop();
    const root = rootRef.current;
    const svg = svgRef.current;
    const probe = textRef.current;
    const cfg = latest.current;
    if (!root || !svg || !probe) return;
    if (!cfg.motionSafe) {
      completed.current = true;
      cfg.onComplete?.();
      return;
    }
    const style = getComputedStyle(probe);
    const fontPx = parseFloat(getComputedStyle(root).fontSize) || 16;
    const W = root.clientWidth / fontPx;
    const lay = cfg.l;
    if (W < 4) return;
    // Glyph advances from the type's own metrics: prefixes keep the kerning.
    const canvas = document.createElement("canvas");
    const g = canvas.getContext("2d");
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const glyphList = cfg.glyphs;
    const starts: number[] = [];
    const widths: number[] = [];
    let textW = 0;
    let ascent = 0.8;
    let descent = 0.2;
    if (g) {
      g.font = font;
      const spacing = parseFloat(style.letterSpacing) || 0;
      let prefix = "";
      for (const ch of glyphList) {
        const before = g.measureText(prefix).width + spacing * prefix.length;
        prefix += ch;
        const after = g.measureText(prefix).width + spacing * prefix.length;
        starts.push(before / fontPx);
        widths.push((after - before) / fontPx);
      }
      textW =
        (g.measureText(prefix).width +
          spacing * Math.max(0, glyphList.length - 1)) /
        fontPx;
      const m = g.measureText("Hg");
      const textPx = parseFloat(style.fontSize) || fontPx;
      ascent = (m.fontBoundingBoxAscent || textPx * 0.8) / fontPx;
      descent = (m.fontBoundingBoxDescent || textPx * 0.2) / fontPx;
    }
    svg.setAttribute("viewBox", `0 0 ${r3(W)} ${r3(lay.height)}`);
    const KX = W - lay.kRight;
    const cy = lay.cy;
    const lead = lay.wr;
    const SK = lead + KX;
    const bow = track(BOW, lay.r);
    const tail = track(TAIL, lay.r);
    const sEnd = SK + bow.length;
    // The message comes to rest centred on the band left of the bow's left loop.
    const xc = (KX - lay.left) / 2;
    const uc = sEnd - (lead + xc);
    const u0 = uc - textW / 2;
    const textEnd = u0 + textW;
    const step = Math.max(0.12, lay.wr / 7);
    const maxPts = Math.ceil((sEnd + lead) / step) + 4;
    const xs = new Float64Array(maxPts);
    const ys = new Float64Array(maxPts);
    const th = new Float64Array(maxPts);
    const turns = clamp(cfg.twists, 0, 3);
    const total = clamp(cfg.duration, 900, 6000) / 1000;
    const bandStrip = emptyStrip();
    const bowStrip = emptyStrip();
    const fronts = frontRefs.current;
    const backs = backRefs.current;
    const tails = tailRefs.current;
    const glyphEls = glyphRefs.current;
    const knot = knotRef.current;
    const bowG = bowRef.current;
    const baseline = (ascent - descent) / 2;
    const bx = new Float64Array(maxPts);
    const by = new Float64Array(maxPts);
    const bt = new Float64Array(maxPts);
    const bwid = new Float64Array(maxPts);
    const tx = new Float64Array(tail.x.length);
    const ty = new Float64Array(tail.x.length);
    const tt = new Float64Array(tail.x.length);

    let cx = 0;
    let cyy = 0;
    let cSeg = -1;
    let cFrac = 0;
    /** The centre line at path position s (written to cx, cyy): the band, then the bow. */
    const at = (s: number, wave: number, clock: number) => {
      if (s <= SK) {
        const x = s - lead;
        // A soft wave rolls along the band and dies as it settles; it fades
        // out toward the knot, which holds the ribbon still.
        const fadeK = smooth(0, lay.wr * 3, KX - x);
        cx = x;
        cyy = cy + wave * Math.sin(s * 1.1 - clock * 5.2) * fadeK;
        cSeg = -1;
        cFrac = 0;
        return;
      }
      const v = s - SK;
      let lo = 0;
      let hi = bow.s.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if ((bow.s[mid] ?? 0) < v) lo = mid;
        else hi = mid;
      }
      const a = bow.s[lo] ?? 0;
      const b = bow.s[hi] ?? 0;
      const t = b > a ? clamp01((v - a) / (b - a)) : 0;
      cx = KX + (bow.x[lo] ?? 0) + ((bow.x[hi] ?? 0) - (bow.x[lo] ?? 0)) * t;
      cyy = cy + (bow.y[lo] ?? 0) + ((bow.y[hi] ?? 0) - (bow.y[lo] ?? 0)) * t;
      cSeg = bow.seg[hi] ?? 6;
      cFrac =
        (bow.frac[lo] ?? 0) + ((bow.frac[hi] ?? 0) - (bow.frac[lo] ?? 0)) * t;
    };

    let started = -1;
    let lastTime = -1;
    let pausedAt = -1;
    let settleT = -1;
    let scale = 0.88;
    let scaleV = 0;
    let knotS = 0;
    let knotV = 0;
    const recoil = springs.recoil;
    const flick = springs.flick;
    const still = stillRef.current;
    if (still) still.style.opacity = "0";
    svg.style.opacity = "1";
    bowG?.setAttribute("transform", "");
    knot?.setAttribute("transform", "scale(0)");
    tails[0]?.setAttribute("d", "");
    cfg.onStart?.();

    const paint = (strip: Strip, k: number) => {
      for (let j = 0; j < FRONT_LEVELS; j += 1) {
        fronts[k]?.[j]?.setAttribute("d", strip.front[j] ?? "");
      }
      for (let j = 0; j < BACK_LEVELS; j += 1) {
        backs[k]?.[j]?.setAttribute("d", strip.back[j] ?? "");
      }
      hemRefs.current[k]?.setAttribute("d", strip.hem);
    };

    const frame = (time: number) => {
      runRef.current.frame = 0;
      if (!onScreen.current || document.hidden) {
        // Off screen or hidden: no frames; the clock picks up where it stopped.
        runRef.current.waiting = frame;
        lastTime = -1;
        return;
      }
      if (started < 0) started = time;
      if (lastTime < 0 && pausedAt >= 0) started += time - pausedAt;
      pausedAt = time;
      const dt =
        lastTime < 0 ? 1 / 60 : Math.min(0.04, (time - lastTime) / 1000);
      lastTime = time;
      const clock = (time - started) / 1000;
      const p = clamp01(clock / total);
      const sHead = easeInOut(p) * sEnd;
      const wave = lay.wr * 0.32 * Math.pow(1 - p, 1.6);
      const untwist = 1 - smooth(0.62, 0.97, p);
      // Sample the visible material, head first; the band and the bow apart.
      let n = 0;
      let m = 0;
      for (let u = 0; ; u += step) {
        const s = sHead - u;
        if (s < 0 || n >= maxPts || m >= maxPts) break;
        at(s, wave, clock);
        // The ribbon's turn: full twists behind the message, a gentle roll
        // that makes the satin catch the light, and on the bow its own shape.
        let turn = 0;
        if (turns > 0 && u > textEnd + lay.wr * 1.4) {
          const k = (u - textEnd - lay.wr * 1.4) / (lay.wr * 3.2);
          if (k < turns) turn += Math.PI * 2 * (k - Math.floor(k)) * untwist;
        }
        turn += Math.sin(u * 0.55 - clock * 3.4) * 0.42 * untwist;
        if (cSeg >= 0) {
          bx[m] = cx;
          by[m] = cyy;
          bt[m] = bowTurn(cSeg, cFrac) + turn * 0.3;
          bwid[m] = bowWidth(lay, s - SK);
          m += 1;
        } else {
          if (n === 0 && m > 0) {
            // The knot's join: the band starts where the bow left off.
            xs[n] = bx[m - 1] ?? cx;
            ys[n] = by[m - 1] ?? cyy;
            th[n] = turn;
            n += 1;
          }
          xs[n] = cx;
          ys[n] = cyy;
          th[n] = turn;
          n += 1;
        }
      }
      // Drawn tail to head, so the head lies on top.
      xs.subarray(0, n).reverse();
      ys.subarray(0, n).reverse();
      th.subarray(0, n).reverse();
      bx.subarray(0, m).reverse();
      by.subarray(0, m).reverse();
      bt.subarray(0, m).reverse();
      bwid.subarray(0, m).reverse();
      for (const strip of [bandStrip, bowStrip]) {
        strip.front.fill("");
        strip.back.fill("");
        strip.hem = "";
      }
      if (n > 1) stripOf(bandStrip, xs, ys, th, n, lay.wr, cfg.shine, m === 0);
      if (m > 1) {
        stripOf(
          bowStrip,
          bx,
          by,
          bt,
          m,
          lay.bw,
          cfg.shine,
          true,
          bwid,
          false,
          0,
        );
      }
      paint(bandStrip, 0);
      paint(bowStrip, 1);
      // The printed message rides on the front face.
      for (let i = 0; i < glyphEls.length; i += 1) {
        const el = glyphEls[i];
        if (!el) continue;
        // Material runs head to tail, right to left: the first letter sits
        // furthest from the head.
        const u = u0 + textW - ((starts[i] ?? 0) + (widths[i] ?? 0) / 2);
        const s = sHead - u;
        if (s < lead * 0.2 || s > SK) {
          el.setAttribute("opacity", "0");
          continue;
        }
        at(s + 0.05, wave, clock);
        const ax = cx;
        const ay = cyy;
        at(s, wave, clock);
        const ang = (Math.atan2(ay - cyy, ax - cx) * 180) / Math.PI;
        const roll = Math.cos(
          Math.sin(u * 0.55 - clock * 3.4) * 0.42 * untwist,
        );
        el.setAttribute("opacity", roll > 0.2 ? "1" : "0");
        el.setAttribute(
          "transform",
          `translate(${r3(cx)} ${r3(cyy)}) rotate(${r3(ang)}) scale(1 ${r3(roll)})`,
        );
        el.setAttribute("y", String(r3(baseline)));
      }
      // The bow lands: the knot wraps on with the flick constants, the bow
      // gives a small bounce on the recoil constants, the second tail drops.
      if (p >= 1) {
        if (settleT < 0) settleT = clock;
        scaleV +=
          ((-recoil.stiffness * (scale - 1) - recoil.damping * scaleV) /
            recoil.mass) *
          dt;
        scale += scaleV * dt;
        knotV +=
          ((-flick.stiffness * (knotS - 1) - flick.damping * knotV) /
            flick.mass) *
          dt;
        knotS += knotV * dt;
        bowG?.setAttribute(
          "transform",
          `translate(${r3(KX)} ${r3(cy)}) scale(${r3(scale)}) translate(${r3(-KX)} ${r3(-cy)})`,
        );
        knot?.setAttribute(
          "transform",
          `translate(${r3(KX)} ${r3(cy)}) rotate(-8) scale(${r3(Math.max(0, knotS))})`,
        );
        const tailP = smooth(0, 0.32, clock - settleT);
        const cut = Math.max(2, Math.round(tail.x.length * tailP));
        for (let i = 0; i < cut; i += 1) {
          tx[i] = KX + (tail.x[i] ?? 0);
          ty[i] = cy + (tail.y[i] ?? 0);
          tt[i] = 0.18 * Math.sin(Math.PI * (tail.frac[i] ?? 0));
        }
        const ts = emptyStrip();
        stripOf(
          ts,
          tx,
          ty,
          tt,
          cut,
          lay.bw,
          cfg.shine,
          tailP > 0.95,
          undefined,
          false,
          0,
        );
        tails[0]?.setAttribute("d", ts.front.join("") + ts.back.join(""));
        const settled =
          clock - settleT > 0.4 &&
          Math.abs(scale - 1) < 0.002 &&
          Math.abs(scaleV) < 0.02 &&
          tailP >= 1;
        if (settled) {
          // Hand back to the still frame: the same picture, crossfaded.
          if (still) still.style.opacity = "1";
          svg.style.opacity = "0";
          completed.current = true;
          latest.current.onComplete?.();
          return;
        }
      }
      runRef.current.frame = window.requestAnimationFrame(frame);
    };
    runRef.current.frame = window.requestAnimationFrame(frame);
  }, [stop]);

  const start = React.useCallback(() => {
    stop();
    const wait = Math.max(0, latest.current.delay);
    if (wait > 0) runRef.current.timer = window.setTimeout(play, wait);
    else play();
  }, [play, stop]);

  // Triggers. Each effect finishes what it starts and is safe to run twice.
  React.useEffect(() => {
    if (trigger !== "mount") return;
    if (once && completed.current) return;
    start();
    return stop;
  }, [trigger, once, start, stop]);

  React.useEffect(() => {
    if (trigger !== "inView") return;
    const root = rootRef.current;
    if (!root) return;
    let shown = false;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        if (visible && !shown) {
          shown = true;
          if (once && completed.current) return;
          start();
        } else if (!visible) {
          shown = false;
          if (!once) stop();
        }
      },
      { threshold: 0.35 },
    );
    watcher.observe(root);
    return () => {
      watcher.disconnect();
      stop();
    };
  }, [trigger, once, start, stop]);

  const lastReplay = React.useRef(replayKey);
  React.useEffect(() => {
    if (lastReplay.current === replayKey) return;
    lastReplay.current = replayKey;
    start();
  }, [replayKey, start]);

  // A layout change (width, type size) while still is just the still frame;
  // mid-run, the ribbon is laid again from the start.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let lastW = root.clientWidth;
    const sizer = new ResizeObserver(() => {
      const w = root.clientWidth;
      if (Math.abs(w - lastW) < 1) return;
      lastW = w;
      if (runRef.current.frame) play();
    });
    sizer.observe(root);
    return () => sizer.disconnect();
  }, [play]);

  // Reduced motion mid-run: finish on the still frame.
  React.useEffect(() => {
    if (motionSafe) return;
    stop();
    const still = stillRef.current;
    const svg = svgRef.current;
    if (still) still.style.opacity = "1";
    if (svg) svg.style.opacity = "0";
  }, [motionSafe, stop]);

  // The run's pause: frames stop off screen or in a hidden tab and resume.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const wake = () => {
      const run = runRef.current;
      if (!onScreen.current || document.hidden || !run.waiting) return;
      const next = run.waiting;
      run.waiting = null;
      run.frame = window.requestAnimationFrame(next);
    };
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      onScreen.current = Boolean(entry?.isIntersecting);
      wake();
    });
    watcher.observe(root);
    document.addEventListener("visibilitychange", wake);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  React.useEffect(() => stop, [stop]);

  const hover = trigger === "hover";
  const replayOnHover = () => {
    if (!hover || runRef.current.frame) return;
    if (once && completed.current) return;
    start();
  };

  const bandTop = l.cy - l.wr / 2;
  const bowBox = {
    left: `calc(100% - ${r3(l.kRight + l.left)}em)`,
    top: `${r3(l.cy - l.up)}em`,
    width: `${r3(l.left + l.right)}em`,
    height: `${r3(l.up + l.down)}em`,
  };

  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        rootRef.current = node;
      }}
      tabIndex={hover ? 0 : undefined}
      onPointerEnter={replayOnHover}
      onFocus={(event: React.FocusEvent<HTMLElement>) => {
        if (event.currentTarget.matches(":focus-visible")) replayOnHover();
      }}
      className={cn(
        "group/bow-ribbon relative m-0 block w-full overflow-clip leading-none",
        hover &&
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ height: `${r3(l.height)}em` }}
    >
      <span className="sr-only">{text}</span>
      {/* The still frame: the ribbon lying flat, the message centred, the bow tied. */}
      <div
        ref={stillRef}
        aria-hidden
        className="absolute inset-0 transition-opacity duration-150"
      >
        <div
          className="absolute left-0 flex items-center justify-center overflow-clip"
          style={{
            top: `${r3(bandTop)}em`,
            height: `${r3(l.wr)}em`,
            right: `${r3(l.kRight)}em`,
            paddingRight: `${r3(l.left)}em`,
            backgroundColor: frontFill(color, restLevel),
            // The hems: two fine light lines inset from the edges, as on the run.
            backgroundImage: `linear-gradient(transparent 15%, color-mix(in oklab, ${color}, white 30%) 15%, color-mix(in oklab, ${color}, white 30%) calc(15% + 0.04em), transparent calc(15% + 0.04em), transparent calc(85% - 0.04em), color-mix(in oklab, ${color}, white 30%) calc(85% - 0.04em), color-mix(in oklab, ${color}, white 30%) 85%, transparent 85%)`,
          }}
        >
          <span
            ref={textRef}
            className="font-semibold tracking-[0.02em] whitespace-nowrap"
            style={{ color: textColor }}
          >
            {text}
          </span>
        </div>
        <svg
          className="absolute overflow-visible"
          style={bowBox}
          viewBox={`${r3(-l.left)} ${r3(-l.up)} ${r3(l.left + l.right)} ${r3(l.up + l.down)}`}
        >
          <g>
            {rest.tail.front.map((d, k) =>
              d ? (
                <path key={`t${k}`} d={d} style={seam(frontFill(color, k))} />
              ) : null,
            )}
            {rest.tail.back.map((d, k) =>
              d ? (
                <path key={`tb${k}`} d={d} style={seam(backFill(color, k))} />
              ) : null,
            )}
            {rest.back.map((d, k) =>
              d ? (
                <path key={`b${k}`} d={d} style={seam(backFill(color, k))} />
              ) : null,
            )}
            {rest.front.map((d, k) =>
              d ? (
                <path key={`f${k}`} d={d} style={seam(frontFill(color, k))} />
              ) : null,
            )}
            <path
              d={rest.hem}
              fill="none"
              strokeWidth={0.04}
              style={{ stroke: `color-mix(in oklab, ${color}, white 30%)` }}
            />
            <g transform="rotate(-8)">
              <path
                d={knotPath(l)}
                style={{ fill: `color-mix(in oklab, ${color}, black 10%)` }}
              />
              <path
                d={knotPath({
                  ...l,
                  knotW: l.knotW * 0.86,
                  knotH: l.knotH * 0.93,
                })}
                style={{ fill: frontFill(color, restLevel + 1) }}
              />
            </g>
          </g>
        </svg>
      </div>
      {/* The run: drawn frame by frame, hidden at rest. */}
      <svg
        ref={svgRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-150"
        preserveAspectRatio="xMinYMin meet"
      >
        <path
          ref={(node) => {
            tailRefs.current[0] = node;
          }}
          style={seam(frontFill(color, restLevel))}
        />
        {[0, 1].map((part) => (
          <g key={part} ref={part === 1 ? bowRef : undefined}>
            {Array.from({ length: BACK_LEVELS }, (_, k) => (
              <path
                key={`b${k}`}
                ref={(node) => {
                  (backRefs.current[part] ??= [])[k] = node;
                }}
                style={seam(backFill(color, k))}
              />
            ))}
            {Array.from({ length: FRONT_LEVELS }, (_, k) => (
              <path
                key={`f${k}`}
                ref={(node) => {
                  (frontRefs.current[part] ??= [])[k] = node;
                }}
                style={seam(frontFill(color, k))}
              />
            ))}
            <path
              ref={(node) => {
                hemRefs.current[part] = node;
              }}
              fill="none"
              strokeWidth={0.04}
              style={{ stroke: `color-mix(in oklab, ${color}, white 30%)` }}
            />
          </g>
        ))}
        <g ref={knotRef} transform="scale(0)">
          <path
            d={knotPath(l)}
            style={{ fill: `color-mix(in oklab, ${color}, black 10%)` }}
          />
          <path
            d={knotPath({ ...l, knotW: l.knotW * 0.86, knotH: l.knotH * 0.93 })}
            style={{ fill: frontFill(color, restLevel + 1) }}
          />
        </g>
        <g
          className="font-semibold"
          style={{ fill: textColor, fontSize: 1, letterSpacing: "0.02em" }}
        >
          {glyphs.map((ch, i) => (
            <text
              key={i}
              ref={(node) => {
                glyphRefs.current[i] = node;
              }}
              textAnchor="middle"
              opacity={0}
            >
              {ch}
            </text>
          ))}
        </g>
      </svg>
    </Tag>
  );
}
