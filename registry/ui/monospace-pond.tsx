"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MonospacePondRamp = "ascii" | "blocks" | "dots" | "marks";

export type MonospacePondProps = {
  /** The paragraph. Line breaks in it are kept; spaces wrap as usual. */
  text?: string;
  /** The element the paragraph renders as. @default "p" */
  as?: "p" | "div" | "blockquote";
  /** How quickly the water settles, 0 (rings for seconds and rebounds off the edges) to 1 (settles like syrup). @default 0.35 */
  damping?: number;
  /** The glyphs a crest turns letters into, light to dense: a named ramp or your own string. @default "ascii" */
  ramp?: MonospacePondRamp | (string & {});
  /** How deep the pond is, 0 to 1: deeper water carries waves faster and bends the letters further. @default 0.5 */
  depth?: number;
  /** How hard the pointer drags waves through the text, 0 to 1. @default 0.6 */
  stir?: number;
  /** The pointer's footprint in characters, 1 to 6. @default 2.5 */
  radius?: number;
  /** How big a dropped stone is, 0 to 1. @default 0.7 */
  stone?: number;
  /** How readily crests swap letters for ramp glyphs, 0 (only the highest) to 1 (any swell). @default 0.5 */
  crest?: number;
  /** Word gaps froth with the lightest glyph on strong crests, so a ring reads across them. @default true */
  foam?: boolean;
  /** A hairline ring rides out from every stone with the wavefront. @default true */
  ring?: boolean;
  /** The ink of the text at rest. @default "var(--foreground)" */
  color?: string;
  /** The ink the crests, the foam and the ring mix toward. @default "var(--accent-bright)" */
  crestColor?: string;
  /** The pointer, touch and keyboard disturb the water. @default true */
  interactive?: boolean;
  /** Freeze the water where it is; it ignores the hand until unpaused. @default false */
  paused?: boolean;
  /** One stone drops by itself the first time the paragraph is seen. @default true */
  intro?: boolean;
  /** Where the intro stone falls and how a stone's droplets fly. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The pond's accessible name. @default "Stir the water" */
  label?: string;
  /** Fires for every stone a click, a tap, Enter or keyboard focus drops, with its line and column (from 0). */
  onStone?: (at: { line: number; column: number }) => void;
  /** Fires when the water starts to move (false) and when it is still again (true). */
  onCalmChange?: (calm: boolean) => void;
  /** Sizes the box and sets its type: the font size is inherited. */
  className?: string;
};

export const MONOSPACE_POND_TEXT =
  "No wind yet. The water holds the far bank so exactly that the pines grow down as well as up, and a heron stands on its own reflection like a pin through a page. Touch it, and the page remembers it is water.";

const RAMPS: Record<MonospacePondRamp, string> = {
  ascii: ".:-=+*#%@",
  blocks: "·░▒▓█",
  dots: "·∘•●",
  marks: "-~≈≡",
};

/** Ink levels between the text's colour and the crest's. */
const INKS = 4;
/** Fixed physics step: the water integrates at 120 Hz whatever the display does. */
const STEP = 1 / 120;
const STONES = 4;
const DROPS = 6;
/** How long a stone takes to fall onto the surface, s. */
const FALL = 0.09;
/** How long a stone's ring stays visible, s. */
const RING_LIFE = 0.9;
/** Under reduced motion a stone's still ring fades over this long, s. */
const STILL_LIFE = durations.page * 1.4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

function lcg(seed: number) {
  let s =
    (Math.imul(Math.round(seed * 7919) | 0, 2654435761) ^ 0x6c8e9cf5) >>> 0 ||
    1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Splits text into graphemes so an emoji or an accented letter stays whole. */
function graphemes(text: string): { segment: string; index: number }[] {
  const Seg = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => {
        segment: (s: string) => Iterable<{ segment: string; index: number }>;
      };
    }
  ).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => ({
        segment: s.segment,
        index: s.index,
      }),
    );
  }
  const out: { segment: string; index: number }[] = [];
  let index = 0;
  for (const ch of Array.from(text)) {
    out.push({ segment: ch, index });
    index += ch.length;
  }
  return out;
}

type Water = {
  gw: number;
  gh: number;
  /** Grid spacing in CSS px: one character wide. */
  cell: number;
  h: Float32Array;
  v: Float32Array;
  a: Float32Array;
  peak: number;
};

/**
 * The text as the page laid it out: every visible grapheme with its centre
 * and its line, in reading order, and the word gaps — one cell per character
 * width — where foam can rise. Positions come from the page, so a glyph that
 * falls back to another font, or a font that is not monospaced, still lands
 * exactly where the DOM put it.
 */
type Grid = {
  W: number;
  H: number;
  dpr: number;
  charW: number;
  boxH: number;
  lines: number;
  left: number;
  /** Top of the glyph box on each line, CSS px. */
  tops: Float32Array;
  /** Glyphs: centre x, line, atlas tile; and where each line's glyphs start. */
  n: number;
  gx: Float32Array;
  gline: Int16Array;
  gtile: Int16Array;
  lineStart: Int32Array;
  /** Foam cells in the gaps: centre x and line. */
  fn: number;
  fx: Float32Array;
  fline: Int16Array;
  /** Atlas: tile size in device px, glyph count, and each ramp step's glyph. */
  tileW: number;
  tileH: number;
  perRow: number;
  count: number;
  ramp: Int16Array;
  atlas: HTMLCanvasElement;
};

type Drop = { angle: number; reach: number; life: number; landed: boolean };

type Stone = {
  live: boolean;
  x: number;
  y: number;
  age: number;
  amp: number;
  size: number;
  hit: boolean;
  drops: Drop[];
};

type Api = {
  layout: () => void;
  draw: () => void;
  kick: () => void;
  tick: (now: number) => void;
  colours: () => void;
  seen: () => void;
};

/**
 * A paragraph of monospaced text that is also the surface of a pond. The
 * words are real DOM text, selectable and read once; once the canvas is live
 * they turn transparent and every character is drawn from a glyph atlas at the
 * place the page laid it out, riding a height field simulated beneath — a
 * damped wave equation on a grid one character wide, with walls that reflect
 * and a viscous term that kills short ripples first, the way water does.
 *
 * On a swell the letters crowd toward the crest and rise, and the crests turn
 * them into denser glyphs from the ramp while the troughs thin the ink; word
 * gaps froth on the strongest crests so a ring reads as a ring. The pointer
 * drags a bow and a wake through the water as strong as it is quick; a click,
 * a tap, Enter or keyboard focus drops a stone — it falls, dents the surface,
 * the water rebounds and rings outward under a hairline ring while a crown of
 * droplets hops out and lands. When the energy is gone the original text is
 * drawn exactly again and the loop stops. Under reduced motion nothing
 * travels: a stone leaves a still ring of swapped glyphs that fades back.
 */
export function MonospacePond({
  text = MONOSPACE_POND_TEXT,
  as: Tag = "p",
  damping = 0.35,
  ramp = "ascii",
  depth = 0.5,
  stir = 0.6,
  radius = 2.5,
  stone = 0.7,
  crest = 0.5,
  foam = true,
  ring = true,
  color = "var(--foreground)",
  crestColor = "var(--accent-bright)",
  interactive = true,
  paused = false,
  intro = true,
  seed = 1,
  dpr = 2,
  label = "Stir the water",
  onStone,
  onCalmChange,
  className,
}: MonospacePondProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const rampText = RAMPS[ramp as MonospacePondRamp] ?? (ramp || RAMPS.ascii);

  const k = {
    damping: clamp01(damping),
    depth: clamp01(depth),
    stir: clamp01(stir),
    radius: clamp(radius, 1, 6),
    stone: clamp01(stone),
    crest: clamp01(crest),
    foam,
    ring,
    interactive,
    paused,
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    rampText,
  };

  const inks = Array.from(
    { length: INKS },
    (_, i) =>
      `color-mix(in oklab, ${crestColor} ${Math.round((i / (INKS - 1)) * 100)}%, ${color})`,
  );
  const inkKey = inks.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const textRef = React.useRef<HTMLElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const grid = React.useRef<Grid | null>(null);
  const water = React.useRef<Water | null>(null);
  const stones = React.useRef<Stone[]>(
    Array.from({ length: STONES }, () => ({
      live: false,
      x: 0,
      y: 0,
      age: 0,
      amp: 0,
      size: 0,
      hit: false,
      drops: Array.from({ length: DROPS }, () => ({
        angle: 0,
        reach: 0,
        life: 0,
        landed: true,
      })),
    })),
  );
  const ink = React.useRef<string[]>([]);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const carry = React.useRef(0);
  const visible = React.useRef(false);
  const calm = React.useRef(true);
  const calming = React.useRef({ on: false, s: 1, v: 0 });
  const hand = React.useRef({ x: 0, y: 0, t: 0, on: false });
  const downAt = React.useRef<{ x: number; y: number; id: number } | null>(
    null,
  );
  const tip = React.useRef(0);
  const introPending = React.useRef(intro);
  const introTimer = React.useRef(0);
  const shownLive = React.useRef(false);
  const flicker = React.useRef(lcg(seed));
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onStone, onCalmChange });

  // The keyboard's fingertip: a short bar under the character it rests on.
  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);
  const tipW = useMotionValue(8);

  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /** The ink levels as canvas colours, read back from their carriers. */
  const colours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    const out: string[] = [];
    for (const span of Array.from(carriers.children)) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out.push(`rgb(${d[0] ?? 0} ${d[1] ?? 0} ${d[2] ?? 0})`);
    }
    if (out.join("|") === ink.current.join("|") && grid.current) return;
    ink.current = out;
    layout();
  };

  /**
   * Reads the paragraph's own layout — one Range per grapheme, so wrapping,
   * alignment and the inherited font are the page's — builds the character
   * grid and the glyph atlas, and sizes the water and the canvas to the box.
   */
  const layout = () => {
    const root = rootRef.current;
    const el = textRef.current;
    const canvas = canvasRef.current;
    if (!root || !el || !canvas || ink.current.length < INKS) return;
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (W < 4 || H < 4) return;
    const scale = Math.min(window.devicePixelRatio || 1, k.dpr);
    canvas.width = Math.max(1, Math.round(W * scale));
    canvas.height = Math.max(1, Math.round(H * scale));
    const style = getComputedStyle(el);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const probe = canvas.getContext("2d");
    if (!probe) return;
    probe.font = font;
    const spacing = parseFloat(style.letterSpacing) || 0;
    const metrics = probe.measureText("0");
    const fontPx = parseFloat(style.fontSize) || 14;
    const charW = metrics.width + spacing;
    const asc = metrics.fontBoundingBoxAscent || fontPx * 0.8;
    const desc = metrics.fontBoundingBoxDescent || fontPx * 0.25;
    if (charW < 1) return;

    const box = root.getBoundingClientRect();
    const ox = box.left + root.clientLeft;
    const oy = box.top + root.clientTop;
    const eb = el.getBoundingClientRect();
    const left = eb.left - ox + (parseFloat(style.paddingLeft) || 0);
    const inner =
      eb.width -
      (parseFloat(style.paddingLeft) || 0) -
      (parseFloat(style.paddingRight) || 0);
    const cols = Math.max(1, Math.floor(inner / charW + 0.02));

    // Every visible grapheme and where the page put it.
    const placed: {
      ch: string;
      x: number;
      top: number;
      w: number;
      h: number;
    }[] = [];
    const node = el.firstChild;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const content = node.textContent ?? "";
      const range = document.createRange();
      for (const { segment, index } of graphemes(content)) {
        if (/^\s+$/.test(segment)) continue;
        range.setStart(node, index);
        range.setEnd(node, index + segment.length);
        const r = range.getClientRects()[0];
        if (!r || r.width === 0) continue;
        placed.push({
          ch: segment,
          x: r.left - ox,
          top: r.top - oy,
          w: r.width,
          h: r.height,
        });
      }
      range.detach?.();
    }
    const boxH = placed[0]?.h ?? fontPx * 1.2;
    const tops: number[] = [];
    for (const p of placed) {
      if (!tops.some((t) => Math.abs(t - p.top) < boxH * 0.4)) tops.push(p.top);
    }
    tops.sort((a, b) => a - b);
    const lines = Math.max(1, tops.length);
    const lineOf = (top: number) => {
      let best = 0;
      for (let t = 1; t < tops.length; t += 1) {
        if (Math.abs((tops[t] ?? 0) - top) < Math.abs((tops[best] ?? 0) - top))
          best = t;
      }
      return best;
    };

    // The atlas: every glyph the paragraph and the ramp need, in every ink.
    const chars: string[] = [];
    const indexOf = new Map<string, number>();
    const add = (ch: string) => {
      const at = indexOf.get(ch);
      if (at !== undefined) return at;
      indexOf.set(ch, chars.length);
      chars.push(ch);
      return chars.length - 1;
    };
    const rampGlyphs = graphemes(k.rampText).map((g) => g.segment);
    const rampIdx = new Int16Array(Math.max(1, rampGlyphs.length));
    rampGlyphs.forEach((g, i) => (rampIdx[i] = add(g)));

    const n = placed.length;
    const gx = new Float32Array(n);
    const gline = new Int16Array(n);
    const gtile = new Int16Array(n);
    const lineStart = new Int32Array(lines + 1).fill(n);
    placed.forEach((p, i) => {
      gx[i] = p.x + p.w / 2;
      gline[i] = lineOf(p.top);
      gtile[i] = add(p.ch);
    });
    for (let i = n - 1; i >= 0; i -= 1) lineStart[gline[i]!] = i;
    for (let l = lines - 1; l >= 0; l -= 1) {
      if (lineStart[l]! > lineStart[l + 1]!) lineStart[l] = lineStart[l + 1]!;
    }
    // Foam cells: every character column on a line that no glyph covers.
    const fxs: number[] = [];
    const flines: number[] = [];
    for (let l = 0; l < lines; l += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = left + (c + 0.5) * charW;
        let covered = false;
        for (let i = lineStart[l]!; i < lineStart[l + 1]! && !covered; i += 1) {
          const half = (placed[i]?.w ?? charW) / 2;
          if (Math.abs(gx[i]! - x) < half + charW * 0.25) covered = true;
        }
        if (!covered) {
          fxs.push(x);
          flines.push(l);
        }
      }
    }

    const pad = 2;
    const widest = chars.reduce(
      (m, ch) => Math.max(m, probe.measureText(ch).width),
      charW,
    );
    const tileW = Math.ceil((widest + pad * 2) * scale);
    const tileH = Math.ceil((asc + desc + pad * 2) * scale);
    const count = chars.length;
    const perRow = Math.max(1, Math.floor(4096 / tileW));
    const tiles = count * INKS;
    const rowsNeeded = Math.ceil(tiles / perRow);
    const atlas = grid.current?.atlas ?? document.createElement("canvas");
    atlas.width = Math.min(perRow, tiles) * tileW;
    atlas.height = rowsNeeded * tileH;
    const ac = atlas.getContext("2d");
    if (!ac) return;
    ac.clearRect(0, 0, atlas.width, atlas.height);
    ac.setTransform(scale, 0, 0, scale, 0, 0);
    ac.font = font;
    ac.textAlign = "center";
    ac.textBaseline = "alphabetic";
    for (let i = 0; i < INKS; i += 1) {
      ac.fillStyle = ink.current[i] ?? "rgb(0 0 0)";
      for (let g = 0; g < count; g += 1) {
        const t = i * count + g;
        const tx = (t % perRow) * tileW;
        const ty = Math.floor(t / perRow) * tileH;
        ac.fillText(
          chars[g] ?? "",
          (tx + tileW / 2) / scale,
          ty / scale + pad + asc,
        );
      }
    }
    ac.setTransform(1, 0, 0, 1, 0, 0);

    grid.current = {
      W,
      H,
      dpr: scale,
      charW,
      boxH: asc + desc,
      lines,
      left,
      // A range's box is the font's content area; the glyph's own box (the
      // ascent over the descent) sits centred in it.
      tops: Float32Array.from(
        tops.length ? tops : [0],
        (t) => t + (boxH - (asc + desc)) / 2,
      ),
      n,
      gx,
      gline,
      gtile,
      lineStart,
      fn: fxs.length,
      fx: Float32Array.from(fxs),
      fline: Int16Array.from(flines),
      tileW,
      tileH,
      perRow,
      count,
      ramp: rampIdx,
      atlas,
    };
    tip.current = clamp(tip.current, 0, Math.max(0, n - 1));

    const cell = charW;
    const gw = Math.ceil(W / cell) + 2;
    const gh = Math.ceil(H / cell) + 2;
    const prev = water.current;
    if (
      !prev ||
      prev.gw !== gw ||
      prev.gh !== gh ||
      Math.abs(prev.cell - cell) > 0.01
    ) {
      water.current = {
        gw,
        gh,
        cell,
        h: new Float32Array(gw * gh),
        v: new Float32Array(gw * gh),
        a: new Float32Array(gw * gh),
        peak: 0,
      };
    }
    placeTip(false);
    draw();
  };

  /** The water's height at a point in CSS px, sampled between grid nodes. */
  const heightAt = (w: Water, x: number, y: number) => {
    const fx = clamp(x / w.cell + 1, 0, w.gw - 1.001);
    const fy = clamp(y / w.cell + 1, 0, w.gh - 1.001);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const i = iy * w.gw + ix;
    const h = w.h;
    const a = h[i]!;
    const b = h[i + 1]!;
    const c = h[i + w.gw]!;
    const d = h[i + w.gw + 1]!;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  /** Under reduced motion the field is only the still rings, fading. */
  const stillAt = (x: number, y: number, cell: number) => {
    let sum = 0;
    for (const s of stones.current) {
      if (!s.live) continue;
      const fade = clamp01(1 - s.age / STILL_LIFE);
      const d = Math.hypot(x - s.x, y - s.y) / cell;
      const e = (d - 2.6 - s.size) / 0.9;
      sum += (0.7 + 0.6 * s.size) * fade * fade * Math.exp(-e * e);
    }
    return sum;
  };

  /** One frame: every character where the water has carried it. */
  const draw = () => {
    const canvas = canvasRef.current;
    const g = grid.current;
    const w = water.current;
    if (!canvas || !g || !w || !visible.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = g.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const still = !k.motionSafe;
    const t0 = 0.6 - 0.45 * k.crest;
    const span = 1.2;
    const lean = (0.15 + 0.5 * k.depth) * g.charW;
    const lift = g.boxH * 0.12;
    const rampLen = g.ramp.length;
    const e = g.charW * 0.5;
    const pad = 2 * s;
    const total = g.n + (k.foam ? g.fn : 0);
    for (let c = 0; c < total; c += 1) {
      const isGlyph = c < g.n;
      const x = isGlyph ? g.gx[c]! : g.fx[c - g.n]!;
      const line = isGlyph ? g.gline[c]! : g.fline[c - g.n]!;
      const top = g.tops[line] ?? 0;
      const cy = top + g.boxH / 2;
      let hgt: number;
      let dx = 0;
      let dy = 0;
      if (still) {
        hgt = stillAt(x, cy, g.charW);
      } else {
        hgt = heightAt(w, x, cy);
        // Letters lean into the swell: toward the crest and up it.
        const sx = (heightAt(w, x + e, cy) - heightAt(w, x - e, cy)) / (2 * e);
        const sy = (heightAt(w, x, cy + e) - heightAt(w, x, cy - e)) / (2 * e);
        dx = clamp(sx * lean * g.charW, -g.charW * 0.6, g.charW * 0.6);
        dy = clamp(
          sy * lean * g.charW - hgt * lift,
          -g.boxH * 0.45,
          g.boxH * 0.45,
        );
      }
      const q = (hgt - t0) / span;
      let tile = isGlyph ? g.gtile[c]! : -1;
      let level = 0;
      let alpha = 1;
      if (q > 0) {
        level = Math.min(INKS - 1, Math.round(q * (INKS - 1) * 1.4));
        if (isGlyph) {
          // A letter is already ink: a crest only ever makes it denser, so
          // letters start a third of the way up the ramp and the light end
          // is left to the foam in the gaps.
          const from = Math.floor(rampLen / 3);
          tile =
            g.ramp[
              Math.min(rampLen - 1, from + Math.floor(q * (rampLen - from)))
            ] ?? tile;
        } else if (q > 0.18) {
          tile =
            g.ramp[
              Math.min(rampLen - 1, Math.floor((q - 0.18) * rampLen * 0.6))
            ] ?? -1;
          alpha = clamp01((q - 0.18) * 1.8) * 0.85;
        }
      } else if (hgt < 0) {
        alpha = clamp(1 + hgt * 0.32, 0.4, 1);
      }
      if (tile < 0) continue;
      const ti = level * g.count + tile;
      const ax = (ti % g.perRow) * g.tileW;
      const ay = Math.floor(ti / g.perRow) * g.tileH;
      let px = x * s - g.tileW / 2 + dx * s;
      let py = top * s - pad + dy * s;
      // At rest a glyph sits on whole device pixels, as crisp as the page's.
      if (Math.abs(dx) + Math.abs(dy) < 0.05) {
        px = Math.round(px);
        py = Math.round(py);
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        g.atlas,
        ax,
        ay,
        g.tileW,
        g.tileH,
        px,
        py,
        g.tileW,
        g.tileH,
      );
    }
    ctx.globalAlpha = 1;
    // The stones: falling, then their rings and droplets.
    const crestInk = ink.current[INKS - 1] ?? "rgb(0 0 0)";
    const baseInk = ink.current[0] ?? "rgb(0 0 0)";
    for (const st of stones.current) {
      if (!st.live) continue;
      const r0 = g.charW * (0.22 + 0.2 * st.size);
      if (still) {
        const fade = clamp01(1 - st.age / STILL_LIFE);
        if (k.ring) {
          ctx.globalAlpha = 0.45 * fade;
          ctx.strokeStyle = crestInk;
          ctx.lineWidth = s;
          ctx.beginPath();
          ctx.arc(
            st.x * s,
            st.y * s,
            (2.6 + st.size) * g.charW * s,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
        continue;
      }
      if (st.age < FALL) {
        const u = st.age / FALL;
        ctx.globalAlpha = 0.25 + 0.75 * u;
        ctx.fillStyle = baseInk;
        ctx.beginPath();
        ctx.arc(
          st.x * s,
          st.y * s,
          r0 * (2.4 - 1.4 * u * u) * s,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        continue;
      }
      const age = st.age - FALL;
      if (k.ring && age < RING_LIFE) {
        const u = age / RING_LIFE;
        const speed = waveSpeed() * g.charW;
        ctx.globalAlpha = 0.5 * (1 - u) * (1 - u);
        ctx.strokeStyle = crestInk;
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.arc(st.x * s, st.y * s, (r0 * 2 + speed * age) * s, 0, Math.PI * 2);
        ctx.stroke();
      }
      // The droplets are type too: the ramp's lightest glyph, thrown out in
      // the crest's ink and bigger at the top of the hop.
      const dropTile = (INKS - 1) * g.count + (g.ramp[0] ?? 0);
      const dsx = (dropTile % g.perRow) * g.tileW;
      const dsy = Math.floor(dropTile / g.perRow) * g.tileH;
      for (const d of st.drops) {
        if (d.landed || age > d.life) continue;
        const u = age / d.life;
        const arc = Math.sin(Math.PI * u);
        const dist = d.reach * g.charW * u;
        const scale = 0.9 + 0.5 * arc;
        const dw = g.tileW * scale;
        const dh = g.tileH * scale;
        const px = (st.x + Math.cos(d.angle) * dist) * s;
        const py =
          (st.y + Math.sin(d.angle) * dist * 0.8 - arc * g.charW * 0.9) * s;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(
          g.atlas,
          dsx,
          dsy,
          g.tileW,
          g.tileH,
          px - dw / 2,
          py - dh * 0.75,
          dw,
          dh,
        );
      }
    }
    ctx.globalAlpha = 1;
    if (!shownLive.current) {
      shownLive.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Wave speed in characters per second: shallow water is slow (c ∝ √depth). */
  const waveSpeed = () => 7 + 18 * Math.sqrt(0.06 + k.depth * 0.94);

  /**
   * A dent in the surface: a stone landing, or a droplet. The water it
   * pushes aside stands up in a shoulder round it — the profile has no net
   * volume — so the pond never ends up lower than it started.
   */
  const dent = (x: number, y: number, amp: number, size: number) => {
    const w = water.current;
    if (!w) return;
    const gx = x / w.cell + 1;
    const gy = y / w.cell + 1;
    const reach = Math.ceil(size * 3.4);
    for (
      let j = Math.max(1, Math.floor(gy - reach));
      j <= Math.min(w.gh - 2, Math.ceil(gy + reach));
      j += 1
    ) {
      for (
        let i = Math.max(1, Math.floor(gx - reach));
        i <= Math.min(w.gw - 2, Math.ceil(gx + reach));
        i += 1
      ) {
        const d2 = ((i - gx) ** 2 + (j - gy) ** 2) / (size * size);
        w.h[j * w.gw + i]! -= amp * (Math.exp(-d2) - 0.5 * Math.exp(-d2 / 2));
      }
    }
  };

  /**
   * A fingertip drawn through the water: it presses a trough where it is and
   * heaps a low rim round it, leaning a little ahead of the motion. Laid
   * along a path faster than the waves travel, the troughs leave a V-shaped
   * wake behind the hand. The footprint has no net volume, so stirring never
   * raises or lowers the pond.
   */
  const push = (
    x: number,
    y: number,
    ux: number,
    uy: number,
    strength: number,
  ) => {
    const w = water.current;
    if (!w) return;
    const R = k.radius;
    const gx = x / w.cell + 1;
    const gy = y / w.cell + 1;
    const reach = Math.ceil(R * 2);
    for (
      let j = Math.max(1, Math.floor(gy - reach));
      j <= Math.min(w.gh - 2, Math.ceil(gy + reach));
      j += 1
    ) {
      for (
        let i = Math.max(1, Math.floor(gx - reach));
        i <= Math.min(w.gw - 2, Math.ceil(gx + reach));
        i += 1
      ) {
        const rx = i - gx;
        const ry = j - gy;
        const d2 = (rx * rx + ry * ry) / (R * R);
        const wgt = Math.exp(-d2);
        const along = (rx * ux + ry * uy) / R;
        w.v[j * w.gw + i]! +=
          strength * (0.35 * along * wgt - (wgt - 0.5 * Math.exp(-d2 / 2)));
      }
    }
  };

  /** Steps the water by one fixed step; tracks the largest motion left. */
  const step = (w: Water) => {
    const { gw, gh, h, v, a } = w;
    const c = waveSpeed();
    const c2 = c * c;
    const nu = 0.04 + 0.5 * k.damping * k.damping;
    const gamma = 0.6 + 6 * Math.pow(k.damping, 1.5);
    for (let j = 1; j < gh - 1; j += 1) {
      let i = j * gw + 1;
      for (let x = 1; x < gw - 1; x += 1, i += 1) {
        const hc = h[i]!;
        const vc = v[i]!;
        const lap = h[i - 1]! + h[i + 1]! + h[i - gw]! + h[i + gw]! - 4 * hc;
        const vl = v[i - 1]! + v[i + 1]! + v[i - gw]! + v[i + gw]! - 4 * vc;
        a[i] = c2 * lap + nu * vl - gamma * vc;
      }
    }
    let sum = 0;
    for (let j = 1; j < gh - 1; j += 1) {
      let i = j * gw + 1;
      for (let x = 1; x < gw - 1; x += 1, i += 1) {
        const nv = v[i]! + a[i]! * STEP;
        const nh = h[i]! + nv * STEP;
        v[i] = nv;
        h[i] = nh;
        sum += nh;
      }
    }
    // The pond's level is fixed: whatever rounding or a hand at the edge adds
    // or takes away is spread back over the whole surface, so the water
    // always settles to the original text instead of a level slightly off it.
    const mean = sum / ((gw - 2) * (gh - 2));
    let peak = 0;
    for (let j = 1; j < gh - 1; j += 1) {
      let i = j * gw + 1;
      for (let x = 1; x < gw - 1; x += 1, i += 1) {
        const nh = h[i]! - mean;
        h[i] = nh;
        const m = Math.abs(nh) + Math.abs(v[i]!) * 0.05;
        if (m > peak) peak = m;
      }
    }
    // Walls that reflect: the edge copies its neighbour, so a wave meets
    // a slope of zero and turns back.
    for (let x = 0; x < gw; x += 1) {
      h[x] = h[x + gw]!;
      h[(gh - 1) * gw + x] = h[(gh - 2) * gw + x]!;
    }
    for (let j = 0; j < gh; j += 1) {
      h[j * gw] = h[j * gw + 1]!;
      h[j * gw + gw - 1] = h[j * gw + gw - 2]!;
    }
    if (!Number.isFinite(peak) || peak > 80) {
      h.fill(0);
      v.fill(0);
      peak = 0;
    }
    w.peak = peak;
  };

  /** Advances the water, the calm and the stones by dt; says whether anything still moves. */
  const advance = (dt: number): boolean => {
    const w = water.current;
    if (!w) return false;
    let moving = false;
    const list = stones.current;
    if (!k.motionSafe) {
      for (const s of list) {
        if (!s.live) continue;
        s.age += dt;
        if (s.age >= STILL_LIFE) s.live = false;
        else moving = true;
      }
      return moving;
    }
    for (const s of list) {
      if (!s.live) continue;
      s.age += dt;
      if (!s.hit && s.age >= FALL) {
        s.hit = true;
        dent(s.x, s.y, s.amp, 1.4 + 1.4 * s.size);
      }
      const age = s.age - FALL;
      for (const d of s.drops) {
        if (d.landed || age < d.life) continue;
        d.landed = true;
        const dist = d.reach * w.cell;
        dent(
          s.x + Math.cos(d.angle) * dist,
          s.y + Math.sin(d.angle) * dist * 0.8,
          s.amp * 0.16,
          0.7,
        );
      }
      if (s.age > FALL + RING_LIFE && s.drops.every((d) => d.landed))
        s.live = false;
      else moving = true;
    }
    carry.current += dt;
    let steps = 0;
    while (carry.current >= STEP && steps < 8) {
      carry.current -= STEP;
      steps += 1;
      step(w);
      // Escape smooths the water on the glide spring: the whole field is
      // scaled down by a value that settles from 1 to 0 without overshoot.
      const cm = calming.current;
      if (cm.on) {
        const G = springs.glide;
        const before = cm.s;
        cm.v += ((-G.stiffness * cm.s - G.damping * cm.v) / G.mass) * STEP;
        cm.s = Math.max(0, cm.s + cm.v * STEP);
        const f = before > 1e-4 ? cm.s / before : 0;
        for (let i = 0; i < w.h.length; i += 1) {
          w.h[i]! *= f;
          w.v[i]! *= f;
        }
        if (cm.s < 0.002) {
          cm.on = false;
          w.h.fill(0);
          w.v.fill(0);
          w.peak = 0;
        }
      }
    }
    if (steps === 8) carry.current = 0;
    const handLive =
      hand.current.on && performance.now() - hand.current.t < 120;
    return moving || handLive || w.peak > 0.035 || calming.current.on;
  };

  const setCalm = (next: boolean) => {
    if (calm.current === next) return;
    calm.current = next;
    report.current.onCalmChange?.(next);
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const dt = last.current
      ? Math.min(0.05, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    const moving = k.paused ? false : advance(dt);
    if (!moving && !k.paused) {
      // Settled: put every letter back exactly and stop.
      const w = water.current;
      if (w) {
        w.h.fill(0);
        w.v.fill(0);
        w.peak = 0;
      }
    }
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else {
      last.current = 0;
      if (!k.paused) setCalm(true);
    }
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** Wakes the water for something the visitor did. */
  const wake = () => {
    setCalm(false);
    kick();
  };

  /** Drops a stone at (x, y) in CSS px; `strength` scales it (focus drops a lighter one). */
  const drop = (x: number, y: number, strength = 1, told = true) => {
    const g = grid.current;
    if (!g || k.paused) return;
    const list = stones.current;
    let slot = list.find((s) => !s.live);
    if (!slot) {
      slot = list.reduce((a, b) => (b.age > a.age ? b : a), list[0]!);
    }
    const rand = flicker.current;
    slot.live = true;
    slot.x = x;
    slot.y = y;
    slot.age = 0;
    slot.hit = false;
    slot.size = k.stone * strength;
    slot.amp = (5 + 9 * k.stone) * strength;
    const n = 4 + Math.floor(rand() * 3);
    slot.drops.forEach((d, i) => {
      if (i >= n || k.stone * strength < 0.25) {
        d.landed = true;
        return;
      }
      d.landed = false;
      d.angle = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.9;
      d.reach = 1.6 + rand() * 2.2 * (0.5 + slot.size);
      d.life = 0.26 + rand() * 0.16;
    });
    calming.current.on = false;
    if (told) {
      let line = 0;
      let best = Infinity;
      g.tops.forEach((top, i) => {
        const d = Math.abs(top + g.boxH / 2 - y);
        if (d < best) {
          best = d;
          line = i;
        }
      });
      const column = Math.max(0, Math.floor((x - g.left) / g.charW));
      report.current.onStone?.({ line, column });
    }
    if (!k.motionSafe) draw();
    wake();
  };

  /** The keyboard's fingertip, in CSS px: the centre of the character's box. */
  const tipPoint = () => {
    const g = grid.current;
    if (!g || g.n === 0) return null;
    const at = clamp(tip.current, 0, g.n - 1);
    return {
      x: g.gx[at] ?? g.left,
      y: (g.tops[g.gline[at] ?? 0] ?? 0) + g.boxH / 2,
    };
  };

  const placeTip = (travel: boolean) => {
    const g = grid.current;
    const p = tipPoint();
    if (!g || !p) return;
    const x = r2(p.x - g.charW / 2);
    const y = r2(p.y + g.boxH / 2 - 1);
    tipW.set(r2(g.charW));
    if (travel && k.motionSafe) {
      animate(tipX, x, springs.snap);
      animate(tipY, y, springs.snap);
    } else {
      tipX.jump(x);
      tipY.jump(y);
    }
  };

  /** First sight: lay the text out and, once, let a stone fall by itself. */
  const seen = () => {
    if (!grid.current) layout();
    draw();
    if (!introPending.current || !grid.current) return;
    introPending.current = false;
    if (!k.motionSafe) return;
    window.clearTimeout(introTimer.current);
    introTimer.current = window.setTimeout(() => {
      const g = grid.current;
      if (!g || !visible.current) return;
      const rand = lcg(k.seed * 13 + 5);
      const line = Math.min(
        g.lines - 1,
        Math.floor(g.lines * (0.3 + 0.4 * rand())),
      );
      const from = g.lineStart[line] ?? 0;
      const to = g.lineStart[line + 1] ?? g.n;
      const at = Math.floor(from + (to - from) * (0.52 + 0.3 * rand()));
      drop(g.gx[at] ?? g.W / 2, (g.tops[line] ?? 0) + g.boxH / 2, 0.85, false);
    }, 450);
  };

  React.useLayoutEffect(() => {
    api.current = { layout, draw, kick, tick, colours, seen };
    report.current = { onStone, onCalmChange };
  });

  React.useEffect(() => {
    api.current?.colours();
  }, [inkKey]);

  // Anything that changes the grid or the atlas: lay out again.
  React.useEffect(() => {
    api.current?.layout();
  }, [text, rampText, k.dpr]);

  // Anything that changes only how the water is drawn: one frame.
  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [k.crest, k.depth, k.damping, foam, ring, paused, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const fonts = document.fonts;
    const refont = () => api.current?.layout();
    fonts?.addEventListener?.("loadingdone", refont);
    void fonts?.ready.then(refont);
    const pending = frame;
    const later = introTimer;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      fonts?.removeEventListener?.("loadingdone", refont);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      window.clearTimeout(later.current);
    };
  }, []);

  // Size and sighting, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.layout());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        api.current?.seen();
        api.current?.kick();
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  /** The hand moved from where it last was to here: drag the water along the way. */
  const stirTo = (x: number, y: number, time: number) => {
    const h = hand.current;
    const w = water.current;
    if (!w || k.paused || !k.motionSafe) {
      h.x = x;
      h.y = y;
      h.t = time;
      h.on = true;
      return;
    }
    if (h.on && time - h.t < 200) {
      const dx = x - h.x;
      const dy = y - h.y;
      const dist = Math.hypot(dx, dy);
      const dt = Math.max(0.008, (time - h.t) / 1000);
      if (dist > 0.5) {
        const speed = dist / dt;
        const ux = dx / dist;
        const uy = dy / dist;
        // Laid along the path every half character, so a fast stroke is a
        // continuous wake, not a row of separate dabs.
        const samples = Math.max(1, Math.ceil(dist / (w.cell * 0.5)));
        const strength = k.stir * Math.min(speed / 400, 2) * 5;
        for (let i = 1; i <= samples; i += 1) {
          const t = i / samples;
          push(h.x + dx * t, h.y + dy * t, ux, uy, strength);
        }
        wake();
      }
    }
    h.x = x;
    h.y = y;
    h.t = time;
    h.on = true;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const p = local(event.clientX, event.clientY);
    stirTo(p.x, p.y, performance.now());
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    downAt.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
    };
    const p = local(event.clientX, event.clientY);
    hand.current = { x: p.x, y: p.y, t: performance.now(), on: true };
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const down = downAt.current;
    downAt.current = null;
    if (!interactive || !down || down.id !== event.pointerId) return;
    // A click or a tap drops a stone; a drag that selected text does not.
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const p = local(event.clientX, event.clientY);
    drop(p.x, p.y);
  };

  const onPointerLeave = () => {
    hand.current.on = false;
    downAt.current = null;
  };

  const moveTip = (index: number) => {
    const g = grid.current;
    if (!g || g.n === 0) return;
    const before = tipPoint();
    tip.current = clamp(index, 0, g.n - 1);
    const after = tipPoint();
    placeTip(true);
    if (!before || !after || !k.motionSafe || k.paused) return;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) return;
    push(after.x, after.y, dx / dist, dy / dist, k.stir * 16);
    wake();
  };

  /** The glyph on `line` nearest to x, for moving straight up or down. */
  const nearestOn = (line: number, x: number) => {
    const g = grid.current;
    if (!g) return 0;
    const from = g.lineStart[line] ?? 0;
    const to = g.lineStart[line + 1] ?? g.n;
    let best = from;
    for (let i = from; i < to; i += 1) {
      if (Math.abs(g.gx[i]! - x) < Math.abs(g.gx[best]! - x)) best = i;
    }
    return best;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || event.target !== event.currentTarget) return;
    const g = grid.current;
    if (!g || g.n === 0) return;
    const at = clamp(tip.current, 0, g.n - 1);
    const line = g.gline[at] ?? 0;
    switch (event.key) {
      case "ArrowLeft":
        moveTip(at - 1);
        break;
      case "ArrowRight":
        moveTip(at + 1);
        break;
      case "ArrowUp":
        if (line > 0) moveTip(nearestOn(line - 1, g.gx[at]!));
        break;
      case "ArrowDown":
        if (line < g.lines - 1) moveTip(nearestOn(line + 1, g.gx[at]!));
        break;
      case "Home":
        moveTip(g.lineStart[line] ?? 0);
        break;
      case "End":
        moveTip((g.lineStart[line + 1] ?? g.n) - 1);
        break;
      case "Enter":
      case " ": {
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        const p = tipPoint();
        if (p) drop(p.x, p.y);
        break;
      }
      case "Escape": {
        // Only a moving pond takes Escape; a still one lets it pass to
        // whatever is listening above.
        if (calm.current) return;
        if (k.motionSafe) {
          calming.current = { on: true, s: 1, v: 0 };
          for (const s of stones.current) s.live = false;
          kick();
        } else {
          for (const s of stones.current) s.live = false;
          draw();
        }
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive || event.target !== event.currentTarget) return;
    if (!event.currentTarget.matches(":focus-visible")) return;
    placeTip(false);
    const p = tipPoint();
    if (p) drop(p.x, p.y, 0.6);
  };

  const onColour = () => api.current?.colours();

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="pond"
      aria-label={label}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className={cn(
        // A sideways finger stirs; an upright swipe still scrolls the page.
        "group/monospace-pond relative isolate block touch-pan-y overflow-clip rounded-3 px-[1em] py-[0.9em] font-mono",
        interactive &&
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={
        {
          "--pond-ink": color,
          "--pond-crest": crestColor,
        } as React.CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 size-full"
      />
      <Tag
        ref={textRef as React.Ref<never>}
        className="relative m-0 whitespace-pre-line text-(--pond-ink) group-data-live/monospace-pond:text-transparent selection:bg-cobalt-wash"
      >
        {text}
      </Tag>
      {interactive ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 h-0.5 rounded-full bg-(--pond-crest) opacity-0 transition-opacity duration-150 group-focus-visible/monospace-pond:opacity-100"
          style={{ x: tipX, y: tipY, width: tipW }}
        />
      ) : null}
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColour}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {inks.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Arrow keys move a fingertip through the text and stir the water as it
          goes; Enter drops a stone; Escape calms the water.
        </span>
      ) : null}
    </div>
  );
}
