"use client";

import * as React from "react";

import { ArrowUpRight } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WordWindowScene = "flats" | "harbour" | "orchard" | "fjord";

export type WordWindowTone = "natural" | "duotone" | "mono" | "deep";

export type WordWindowLink = {
  /** Where the word goes. Without it the word is a button. */
  href?: string;
  /** A picture's URL. Without it a scene is drawn in code. */
  src?: string;
  /** Describes the picture, for the card. */
  alt: string;
  /** The card's caption. @default the alt text */
  caption?: string;
  /** The scene drawn when there is no `src`. @default by position */
  scene?: WordWindowScene;
};

export type WordWindowProps = {
  /** The paragraph. Each `[bracketed phrase]` is a link carrying the next picture in `links`. */
  text?: string;
  /** One per bracketed phrase, in order. */
  links?: readonly WordWindowLink[];
  /** The paragraph's element. @default "p" */
  as?: "p" | "div" | "blockquote";
  /** How long the pointer (or focus) rests on a word before its card opens, ms. @default 450 */
  expandDelay?: number;
  /** The card's width, px; its picture is 0.62 as tall, and it shrinks to fit a smaller box. @default 200 */
  cardSize?: number;
  /** How the picture is toned in the letters and the card: as drawn, recoloured to the accent, grey, or deepened toward ink. @default "natural" */
  maskTone?: WordWindowTone;
  /** How far the picture drifts behind the letters against the pointer, px. @default 8 */
  drift?: number;
  /** How long the card waits after the pointer leaves before it closes, ms. @default 140 */
  closeDelay?: number;
  /** Controlled: the index of the link whose card is open, or null. */
  value?: number | null;
  /** Initial open card when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires when a rest, a key or a leave opens or closes a card, with its index or null. */
  onValueChange?: (index: number | null) => void;
  /** The underline's colour and the duotone's hue, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** A dotted underline marks the linked words at rest. @default true */
  underline?: boolean;
  /** Fires when a linked word is clicked or activated, before it navigates. */
  onLinkClick?: (
    link: WordWindowLink,
    index: number,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  /** Keep the words as plain links: no pictures, no cards. @default false */
  disabled?: boolean;
  /** Classes for the box the card stays inside (size it to give the card room). */
  className?: string;
};

type Geo = {
  /** The word, relative to the box. */
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  /** The card, relative to the box. */
  cx: number;
  cy: number;
  cw: number;
  /** The card's picture height and the whole card's height. */
  ph: number;
  ch: number;
};

type Picture = { url: string; ratio: number };

/** The caption strip under the card's picture, px. */
const CAPTION = 36;
const RATIO = 0.62;
/** The picture is cut out of the paragraph a little wider than the word. */
const PAD = 2;
/** Drawn scenes are painted once at this size, enough for a 260 px card at 2×. */
const PAINT_W = 640;
const PAINT_H = 400;
const SCENES: readonly WordWindowScene[] = [
  "flats",
  "harbour",
  "orchard",
  "fjord",
];

export const defaultWordWindowText =
  "Our autumn issue starts on the [salt flats] at first light, crosses the [harbour] as the boats come in, and ends in an [orchard] where the last pears are picked by hand.";

export const defaultWordWindowLinks: readonly WordWindowLink[] = [
  {
    href: "#salt-flats",
    alt: "Salt flats at first light, the crust cracked into pale tiles under a pink sky",
    caption: "Salt flats, 6:40 a.m.",
    scene: "flats",
  },
  {
    href: "#harbour",
    alt: "The harbour at dusk, boats coming in under an orange sky",
    caption: "Harbour at dusk",
    scene: "harbour",
  },
  {
    href: "#orchard",
    alt: "An orchard in October, rows of pear trees in low sun",
    caption: "Orchard, the last picking",
    scene: "orchard",
  },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

type Piece =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; index: number };

function parse(text: string): Piece[] {
  const out: Piece[] = [];
  const re = /\[([^\]]+)\]/g;
  let at = 0;
  let index = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push({ kind: "text", text: text.slice(at, m.index) });
    out.push({ kind: "link", text: m[1] ?? "", index });
    index += 1;
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sky(
  ctx: CanvasRenderingContext2D,
  stops: readonly (readonly [number, string])[],
  h: number,
) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, c] of stops) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PAINT_W, h);
}

function ridge(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  base: number,
  height: number,
  colour: string,
  roughness: number,
) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, PAINT_H);
  let y = base - rand() * height;
  for (let x = 0; x <= PAINT_W; x += 8) {
    y += (rand() - 0.5) * roughness;
    y = clamp(y, base - height, base);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(PAINT_W, PAINT_H);
  ctx.closePath();
  ctx.fill();
}

/** Salt flats at first light: a pink dawn, far ranges, a crust cracked into tiles, one walker. */
function paintFlats(ctx: CanvasRenderingContext2D, rand: () => number) {
  const horizon = PAINT_H * 0.54;
  sky(
    ctx,
    [
      [0, "rgb(122, 140, 192)"],
      [0.55, "rgb(226, 190, 196)"],
      [1, "rgb(252, 226, 204)"],
    ],
    horizon,
  );
  const sun = ctx.createRadialGradient(
    PAINT_W * 0.66,
    horizon - 6,
    2,
    PAINT_W * 0.66,
    horizon - 6,
    120,
  );
  sun.addColorStop(0, "rgba(255, 244, 222, 1)");
  sun.addColorStop(0.12, "rgba(255, 236, 206, 0.9)");
  sun.addColorStop(1, "rgba(255, 226, 200, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, PAINT_W, horizon);
  ridge(ctx, rand, horizon, 46, "rgb(170, 150, 178)", 9);
  ridge(ctx, rand, horizon, 22, "rgb(196, 172, 188)", 5);
  const flat = ctx.createLinearGradient(0, horizon, 0, PAINT_H);
  flat.addColorStop(0, "rgb(246, 234, 228)");
  flat.addColorStop(1, "rgb(222, 214, 220)");
  ctx.fillStyle = flat;
  ctx.fillRect(0, horizon, PAINT_W, PAINT_H - horizon);
  // The sky lying in the wet crust near the horizon.
  ctx.fillStyle = "rgba(255, 236, 214, 0.55)";
  ctx.fillRect(0, horizon, PAINT_W, 10);
  // Tiles of crust, smaller as they recede.
  ctx.strokeStyle = "rgba(176, 160, 172, 0.55)";
  ctx.lineWidth = 1.2;
  for (let row = 0; row < 14; row += 1) {
    const t = row / 13;
    const y = horizon + 14 + (PAINT_H - horizon) * t * t;
    const cell = 18 + 70 * t * t;
    ctx.beginPath();
    for (
      let x = -rand() * cell;
      x < PAINT_W + cell;
      x += cell * (0.8 + rand() * 0.4)
    ) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + cell * 0.5 + (rand() - 0.5) * cell * 0.3, y + cell * 0.18);
      ctx.lineTo(x + cell, y + (rand() - 0.5) * 3);
    }
    ctx.stroke();
  }
  // One walker and a long dawn shadow.
  const wx = PAINT_W * 0.3;
  const wy = horizon + 42;
  ctx.fillStyle = "rgba(110, 96, 120, 0.35)";
  ctx.beginPath();
  ctx.ellipse(wx - 24, wy + 1, 26, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgb(70, 60, 82)";
  ctx.fillRect(wx - 2, wy - 16, 4, 16);
  ctx.beginPath();
  ctx.arc(wx, wy - 19, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** The harbour at dusk: an orange sky, a low sun on the water, boats with their lights on. */
function paintHarbour(ctx: CanvasRenderingContext2D, rand: () => number) {
  const horizon = PAINT_H * 0.56;
  sky(
    ctx,
    [
      [0, "rgb(42, 48, 98)"],
      [0.5, "rgb(126, 82, 124)"],
      [0.85, "rgb(232, 132, 96)"],
      [1, "rgb(248, 176, 112)"],
    ],
    horizon,
  );
  const sx = PAINT_W * 0.62;
  const glow = ctx.createRadialGradient(sx, horizon, 4, sx, horizon, 150);
  glow.addColorStop(0, "rgba(255, 214, 140, 0.95)");
  glow.addColorStop(1, "rgba(255, 170, 110, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, PAINT_W, horizon);
  ctx.fillStyle = "rgb(255, 222, 156)";
  ctx.beginPath();
  ctx.arc(sx, horizon, 22, Math.PI, 0);
  ctx.fill();
  ridge(ctx, rand, horizon, 30, "rgb(56, 46, 82)", 7);
  const sea = ctx.createLinearGradient(0, horizon, 0, PAINT_H);
  sea.addColorStop(0, "rgb(92, 70, 112)");
  sea.addColorStop(1, "rgb(28, 32, 62)");
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, PAINT_W, PAINT_H - horizon);
  // The sun broken on the water: short strokes, wider as they come close.
  for (let i = 0; i < 26; i += 1) {
    const t = i / 25;
    const y = horizon + 3 + (PAINT_H - horizon - 6) * t;
    const w = 10 + 70 * t * (0.5 + rand());
    ctx.fillStyle = `rgba(255, ${Math.round(200 - 50 * t)}, ${Math.round(130 - 30 * t)}, ${(0.85 - 0.6 * t).toFixed(2)})`;
    ctx.fillRect(sx - w / 2 + (rand() - 0.5) * 14, y, w, 1.6 + t * 2);
  }
  // Ripples.
  ctx.strokeStyle = "rgba(160, 130, 170, 0.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i += 1) {
    const y = horizon + 6 + rand() * (PAINT_H - horizon - 8);
    const x = rand() * PAINT_W;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 20 + rand() * 40, y);
    ctx.stroke();
  }
  // Boats coming in, each with a mast and a light.
  for (let i = 0; i < 4; i += 1) {
    const bx = PAINT_W * (0.12 + i * 0.22 + (rand() - 0.5) * 0.06);
    const by = horizon + 22 + i * 24 + rand() * 10;
    const len = 34 + i * 12;
    ctx.fillStyle = "rgb(22, 22, 40)";
    ctx.beginPath();
    ctx.moveTo(bx - len / 2, by);
    ctx.lineTo(bx + len / 2, by);
    ctx.lineTo(bx + len / 2 - 6, by + 6 + i);
    ctx.lineTo(bx - len / 2 + 4, by + 6 + i);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(bx - 6, by - 6, 12, 6);
    ctx.strokeStyle = "rgb(22, 22, 40)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx + 2, by - 6);
    ctx.lineTo(bx + 2, by - 30 - i * 8);
    ctx.stroke();
    ctx.fillStyle = "rgb(255, 214, 120)";
    ctx.beginPath();
    ctx.arc(bx + 2, by - 30 - i * 8, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 200, 110, 0.35)";
    ctx.fillRect(bx, by + 8 + i, 4, 10 + i * 3);
  }
  // The quay on the right, its windows lit.
  ctx.fillStyle = "rgb(34, 30, 56)";
  ctx.fillRect(PAINT_W * 0.82, horizon - 34, PAINT_W * 0.18, 40);
  for (let i = 0; i < 9; i += 1) {
    if (rand() < 0.35) continue;
    ctx.fillStyle = "rgb(255, 206, 128)";
    ctx.fillRect(
      PAINT_W * 0.835 + (i % 3) * 22,
      horizon - 28 + Math.floor(i / 3) * 10,
      6,
      5,
    );
  }
}

/** An orchard in October: rows of pear trees in low, warm sun. */
function paintOrchard(ctx: CanvasRenderingContext2D, rand: () => number) {
  const horizon = PAINT_H * 0.42;
  sky(
    ctx,
    [
      [0, "rgb(176, 202, 222)"],
      [1, "rgb(242, 228, 196)"],
    ],
    horizon + 20,
  );
  ridge(ctx, rand, horizon + 8, 26, "rgb(150, 168, 120)", 6);
  const field = ctx.createLinearGradient(0, horizon, 0, PAINT_H);
  field.addColorStop(0, "rgb(170, 182, 104)");
  field.addColorStop(1, "rgb(116, 140, 70)");
  ctx.fillStyle = field;
  ctx.fillRect(0, horizon + 4, PAINT_W, PAINT_H - horizon);
  // Mown stripes running to the far hedge.
  for (let i = -8; i < 16; i += 1) {
    ctx.fillStyle =
      i % 2 ? "rgba(255, 250, 200, 0.08)" : "rgba(40, 60, 20, 0.06)";
    ctx.beginPath();
    ctx.moveTo(PAINT_W / 2 + i * 6, horizon + 4);
    ctx.lineTo(PAINT_W / 2 + (i + 1) * 6, horizon + 4);
    ctx.lineTo(PAINT_W / 2 + (i + 1) * 90, PAINT_H);
    ctx.lineTo(PAINT_W / 2 + i * 90, PAINT_H);
    ctx.closePath();
    ctx.fill();
  }
  // Trees, far rows first, each a crown of leaves with pears in it.
  for (let row = 0; row < 4; row += 1) {
    const t = row / 3;
    const y = horizon + 18 + (PAINT_H - horizon) * (0.12 + 0.62 * t * t);
    const size = 14 + 44 * t * t;
    const gap = size * 2.3;
    for (let x = -rand() * gap; x < PAINT_W + gap; x += gap) {
      ctx.fillStyle = "rgba(60, 50, 30, 0.25)";
      ctx.beginPath();
      ctx.ellipse(
        x + size * 0.5,
        y + 2,
        size * 0.9,
        size * 0.18,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "rgb(96, 72, 48)";
      ctx.fillRect(x - size * 0.06, y - size * 0.7, size * 0.12, size * 0.7);
      for (let k = 0; k < 7; k += 1) {
        const ox = (rand() - 0.5) * size * 1.1;
        const oy = -size * (1.1 + rand() * 0.6);
        const r = size * (0.42 + rand() * 0.2);
        ctx.fillStyle =
          k % 3 === 0
            ? "rgb(78, 112, 62)"
            : k % 3 === 1
              ? "rgb(104, 136, 70)"
              : "rgb(128, 156, 82)";
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Sun on the left of every crown.
      ctx.fillStyle = "rgba(255, 236, 160, 0.22)";
      ctx.beginPath();
      ctx.arc(x - size * 0.25, y - size * 1.45, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 2 + Math.round(size / 8); k += 1) {
        ctx.fillStyle = "rgb(222, 206, 96)";
        ctx.beginPath();
        ctx.ellipse(
          x + (rand() - 0.5) * size * 1.2,
          y - size * (0.9 + rand() * 0.9),
          Math.max(1.2, size * 0.06),
          Math.max(1.6, size * 0.085),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }
}

/** A fjord on a still morning: steep walls, a mirror of water, a white boat. */
function paintFjord(ctx: CanvasRenderingContext2D, rand: () => number) {
  const horizon = PAINT_H * 0.58;
  sky(
    ctx,
    [
      [0, "rgb(150, 182, 214)"],
      [1, "rgb(222, 232, 238)"],
    ],
    horizon,
  );
  ridge(ctx, rand, horizon, 150, "rgb(84, 104, 120)", 22);
  ridge(ctx, rand, horizon, 90, "rgb(62, 82, 92)", 16);
  const water = ctx.createLinearGradient(0, horizon, 0, PAINT_H);
  water.addColorStop(0, "rgb(120, 146, 160)");
  water.addColorStop(1, "rgb(52, 74, 88)");
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, PAINT_W, PAINT_H - horizon);
  ctx.strokeStyle = "rgba(220, 236, 244, 0.25)";
  for (let i = 0; i < 30; i += 1) {
    const y = horizon + 4 + rand() * (PAINT_H - horizon);
    const x = rand() * PAINT_W;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 30 + rand() * 50, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgb(246, 246, 240)";
  ctx.beginPath();
  ctx.moveTo(PAINT_W * 0.44, horizon + 40);
  ctx.lineTo(PAINT_W * 0.52, horizon + 40);
  ctx.lineTo(PAINT_W * 0.505, horizon + 46);
  ctx.lineTo(PAINT_W * 0.45, horizon + 46);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(246, 246, 240, 0.5)";
  ctx.beginPath();
  ctx.moveTo(PAINT_W * 0.44, horizon + 48);
  ctx.lineTo(PAINT_W * 0.2, horizon + 60);
  ctx.moveTo(PAINT_W * 0.44, horizon + 48);
  ctx.lineTo(PAINT_W * 0.3, horizon + 70);
  ctx.stroke();
}

const PAINTERS: Record<
  WordWindowScene,
  (ctx: CanvasRenderingContext2D, rand: () => number) => void
> = {
  flats: paintFlats,
  harbour: paintHarbour,
  orchard: paintOrchard,
  fjord: paintFjord,
};

/** The picture's layers: the tone over the picture, blended. */
function layersOf(
  picture: Picture,
  tone: WordWindowTone,
  accent: string,
): React.CSSProperties {
  const tint =
    tone === "duotone"
      ? `oklch(from ${accent} 0.62 0.16 h)`
      : tone === "mono"
        ? "oklch(0.6 0 0)"
        : tone === "deep"
          ? "oklch(0.52 0.05 262)"
          : null;
  const url = `url("${picture.url}")`;
  return tint
    ? {
        backgroundImage: `linear-gradient(${tint}, ${tint}), ${url}`,
        backgroundBlendMode: `${tone === "deep" ? "multiply" : "color"}, normal`,
      }
    : { backgroundImage: url };
}

/** Where the picture covers the card's picture area, px: its size and its offset in that area. */
function coverOf(geo: Geo, ratio: number) {
  const w = Math.max(geo.cw, geo.ph * ratio);
  const h = w / ratio;
  return {
    w: r2(w),
    h: r2(h),
    ox: r2((geo.cw - w) / 2),
    oy: r2((geo.ph - h) / 2),
  };
}

type LinkProps = {
  index: number;
  link: WordWindowLink;
  text: string;
  picture: Picture | undefined;
  geo: Geo | undefined;
  hot: boolean;
  warm: boolean;
  tone: WordWindowTone;
  accent: string;
  underline: boolean;
  dx: MotionValue<number>;
  dy: MotionValue<number>;
  describedBy: string | undefined;
  bind: (node: HTMLElement | null) => void;
  onEnter: (event: React.PointerEvent | React.FocusEvent) => void;
  onLeave: () => void;
  onMove: (event: React.PointerEvent) => void;
  onTouchStart: (event: React.PointerEvent) => void;
  onTouchEnd: () => void;
  onKey: (event: React.KeyboardEvent) => void;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  /** The ink has come back: the picture can be taken off the letters. */
  onCooled: () => void;
};

/** One linked phrase: ink at rest, a window onto its picture when hot. */
function WindowLink({
  link,
  text,
  picture,
  geo,
  hot,
  warm,
  tone,
  accent,
  underline,
  dx,
  dy,
  describedBy,
  bind,
  onEnter,
  onLeave,
  onMove,
  onTouchStart,
  onTouchEnd,
  onKey,
  onClick,
  onCooled,
}: LinkProps) {
  const bx = useMotionValue(0);
  const by = useMotionValue(0);
  const cover = geo && picture ? coverOf(geo, picture.ratio) : null;
  React.useEffect(() => {
    if (!geo || !picture) return;
    const c = coverOf(geo, picture.ratio);
    bx.set(r2(geo.cx - geo.wx + c.ox));
    by.set(r2(geo.cy - geo.wy + c.oy));
  }, [geo, picture, bx, by]);
  const position = useTransform(
    [bx, by, dx, dy] as MotionValue<number>[],
    ([x, y, ox, oy]) =>
      `${r2((x as number) + (hot ? (ox as number) : 0))}px ${r2((y as number) + (hot ? (oy as number) : 0))}px`,
  );
  const showing = warm && !!picture && !!cover;
  const Tag = link.href ? motion.a : motion.button;
  return (
    <Tag
      ref={bind as React.Ref<HTMLAnchorElement & HTMLButtonElement>}
      {...(link.href ? { href: link.href } : { type: "button" as const })}
      aria-describedby={describedBy}
      onPointerEnter={(event: React.PointerEvent) => {
        if (event.pointerType !== "touch") onEnter(event);
      }}
      onPointerLeave={(event: React.PointerEvent) => {
        if (event.pointerType !== "touch") onLeave();
      }}
      onPointerMove={onMove}
      onPointerDown={(event: React.PointerEvent) => {
        if (event.pointerType === "touch") onTouchStart(event);
      }}
      onPointerUp={(event: React.PointerEvent) => {
        if (event.pointerType === "touch") onTouchEnd();
      }}
      onPointerCancel={onTouchEnd}
      onFocus={(event: React.FocusEvent) => {
        if ((event.target as Element).matches(":focus-visible")) onEnter(event);
      }}
      onBlur={onLeave}
      onKeyDown={onKey}
      onClick={onClick}
      onTransitionEnd={(event: React.TransitionEvent) => {
        if (event.propertyName === "color" && !hot) onCooled();
      }}
      onContextMenu={(event: React.MouseEvent) => {
        // A long press is how a finger opens the card; the menu would cover it.
        if (hot) event.preventDefault();
      }}
      className={cn(
        "cursor-pointer rounded-1 font-semibold whitespace-nowrap [-webkit-touch-callout:none]",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        underline &&
          "underline decoration-dotted decoration-[0.09em] underline-offset-[0.22em]",
        "transition-[color] duration-200 ease-out",
        hot && showing ? "text-transparent" : "text-inherit",
      )}
      style={{
        textDecorationColor: underline ? accent : undefined,
        ...(showing && picture && cover
          ? {
              ...layersOf(picture, tone, accent),
              backgroundSize: `${cover.w}px ${cover.h}px`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: position,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }
          : {}),
      }}
    >
      {text}
    </Tag>
  );
}

/**
 * A paragraph whose linked words carry pictures inside their letters. Hover
 * a word, or move focus to it, and its ink fades away so the letters become
 * windows onto its picture — placed exactly where the card's picture will be
 * and drifting a few pixels against the pointer on the glide spring, so it
 * reads as a scene behind glass. Rest on the word for `expandDelay` and the
 * card opens out of it: a clip that starts as the word's own box grows to the
 * whole card on glide while the drift springs home, so the window spreads from
 * the letters into the full picture, and its caption follows.
 *
 * The words are real links in real text: selectable, read once, with the
 * card's caption as their description while it is open. Escape closes the
 * card where focus is; a long press opens it on touch. The card stays inside
 * the component's box and shrinks to fit a short one. Under reduced motion
 * nothing drifts or grows: the ink cross-fades to the picture and the card
 * fades in whole.
 */
export function WordWindow({
  text = defaultWordWindowText,
  links = defaultWordWindowLinks,
  as = "p",
  expandDelay = 450,
  cardSize = 200,
  maskTone = "natural",
  drift = 8,
  closeDelay = 140,
  value,
  defaultValue = null,
  onValueChange,
  accent = "var(--accent-bright)",
  underline = true,
  onLinkClick,
  disabled = false,
  className,
}: WordWindowProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const pieces = React.useMemo(() => parse(text), [text]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLElement>());
  const timers = React.useRef({ open: 0, close: 0 });
  const rest = React.useRef({ x: 0, y: 0 });
  const pressed = React.useRef(false);
  const pressOpened = React.useRef(false);

  const [pictures, setPictures] = React.useState<Record<number, Picture>>({});
  const [geos, setGeos] = React.useState<Record<number, Geo>>({});
  const [hot, setHot] = React.useState<number | null>(null);
  const [warm, setWarm] = React.useState<number | null>(null);
  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const open = value !== undefined ? value : own;

  // The card that is leaving stays on screen until its clip has closed.
  const [shownOpen, setShownOpen] = React.useState(open);
  const [closing, setClosing] = React.useState<number | null>(null);
  if (shownOpen !== open) {
    setShownOpen(open);
    setClosing(open === null ? shownOpen : null);
  }
  const cardIndex = open ?? closing;
  const cardGeo = cardIndex === null ? undefined : geos[cardIndex];
  const cardPicture = cardIndex === null ? undefined : pictures[cardIndex];
  const cardLink = cardIndex === null ? undefined : links[cardIndex];

  const dx = useSpring(0, springs.glide);
  const dy = useSpring(0, springs.glide);
  const reveal = useMotionValue(open === null ? 0 : 1);

  // Pictures: a URL is loaded for its shape; a scene is painted once.
  const sources = links
    .map((l, i) => `${i}:${l.src ?? l.scene ?? SCENES[i % SCENES.length]}`)
    .join("|");
  React.useEffect(() => {
    let live = true;
    const made: string[] = [];
    links.forEach((link, i) => {
      if (link.src) {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (!live) return;
          const ratio =
            img.naturalWidth > 0 && img.naturalHeight > 0
              ? img.naturalWidth / img.naturalHeight
              : 1.6;
          setPictures((p) => ({ ...p, [i]: { url: img.src, ratio } }));
        };
        img.src = link.src;
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = PAINT_W;
      canvas.height = PAINT_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const scene = link.scene ?? SCENES[i % SCENES.length] ?? "flats";
      PAINTERS[scene](ctx, rng(0x51ed + i * 977));
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          if (!live) {
            URL.revokeObjectURL(url);
            return;
          }
          made.push(url);
          setPictures((p) => ({
            ...p,
            [i]: { url, ratio: PAINT_W / PAINT_H },
          }));
        },
        "image/jpeg",
        0.9,
      );
    });
    return () => {
      live = false;
      for (const url of made) URL.revokeObjectURL(url);
    };
    // `sources` is the links' identity: a new array with the same pictures paints nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  const measure = React.useCallback(
    (i: number): Geo | null => {
      const root = rootRef.current;
      const node = nodes.current.get(i);
      if (!root || !node) return null;
      const box = root.getBoundingClientRect();
      const word = node.getBoundingClientRect();
      const W = box.width;
      const H = box.height;
      let cw = Math.min(Math.max(80, cardSize), W - 8);
      if (cw * RATIO + CAPTION > H - 8) cw = (H - 8 - CAPTION) / RATIO;
      cw = Math.max(60, Math.round(cw));
      const ph = Math.round(cw * RATIO);
      const ch = ph + CAPTION;
      const wx = word.left - box.left;
      const wy = word.top - box.top;
      const cx = clamp(
        wx + word.width / 2 - cw / 2,
        4,
        Math.max(4, W - cw - 4),
      );
      const cy = clamp(
        wy + word.height / 2 - ph / 2,
        4,
        Math.max(4, H - ch - 4),
      );
      return {
        wx: r2(wx),
        wy: r2(wy),
        ww: r2(word.width),
        wh: r2(word.height),
        cx: Math.round(cx),
        cy: Math.round(cy),
        cw,
        ph,
        ch,
      };
    },
    [cardSize],
  );

  const remember = React.useCallback(
    (i: number) => {
      const g = measure(i);
      if (g) setGeos((all) => ({ ...all, [i]: g }));
      return g;
    },
    [measure],
  );

  const request = (next: number | null) => {
    if (next === open) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const clearTimers = () => {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
  };

  const enter = (i: number, x: number, y: number) => {
    if (disabled) return;
    clearTimers();
    remember(i);
    rest.current = { x, y };
    setHot(i);
    setWarm(i);
    if (open !== null && open !== i) request(null);
    if (open === i) return;
    timers.current.open = window.setTimeout(
      () => {
        if (pressed.current) pressOpened.current = true;
        request(i);
      },
      Math.max(0, expandDelay),
    );
  };

  const leave = (i: number) => {
    if (disabled) return;
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
    timers.current.close = window.setTimeout(
      () => {
        setHot((h) => (h === i ? null : h));
        dx.set(0);
        dy.set(0);
        if (open === i) request(null);
      },
      Math.max(0, closeDelay),
    );
  };

  // Every timer goes with the component.
  React.useEffect(() => {
    const t = timers.current;
    return () => {
      window.clearTimeout(t.open);
      window.clearTimeout(t.close);
    };
  }, []);

  // A card the host opens without a hover still needs its word measured.
  React.useEffect(() => {
    if (open === null || geos[open]) return;
    const frame = window.requestAnimationFrame(() => remember(open));
    return () => window.cancelAnimationFrame(frame);
  }, [open, geos, remember]);

  // The card grows out of the word, and shrinks back into it.
  React.useEffect(() => {
    let c: AnimationPlaybackControls | null = null;
    if (open !== null) {
      c = motionSafe
        ? animate(reveal, 1, springs.glide)
        : animate(reveal, 1, { duration: durations.fast, ease: easings.enter });
    } else if (closing !== null) {
      c = animate(reveal, 0, {
        duration: motionSafe ? durations.base : durations.fast,
        ease: easings.exit,
        onComplete: () => setClosing(null),
      });
    }
    return () => c?.stop();
  }, [open, closing, motionSafe, reveal]);

  const clip = useTransform(reveal, (t) => {
    const g = cardGeo;
    if (!g || !motionSafe) return "inset(0 round 12px)";
    const k = 1 - clamp(t, 0, 1.2);
    const top = Math.max(0, g.wy - PAD - g.cy) * k;
    const left = Math.max(0, g.wx - PAD - g.cx) * k;
    const right = Math.max(0, g.cx + g.cw - (g.wx + g.ww + PAD)) * k;
    const bottom = Math.max(0, g.cy + g.ch - (g.wy + g.wh + PAD)) * k;
    return `inset(${r2(top)}px ${r2(right)}px ${r2(bottom)}px ${r2(left)}px round ${r2(4 + 8 * (1 - k))}px)`;
  });
  const cardOpacity = useTransform(reveal, (t) =>
    motionSafe ? r2(clamp(t * 3, 0, 1)) : r2(clamp(t, 0, 1)),
  );
  const captionOpacity = useTransform(reveal, (t) =>
    r2(clamp((t - 0.55) / 0.4, 0, 1)),
  );
  const cardPosition = useTransform(
    [reveal, dx, dy] as MotionValue<number>[],
    ([t, ox, oy]) => {
      const g = cardGeo;
      const p = cardPicture;
      if (!g || !p) return "0px 0px";
      const c = coverOf(g, p.ratio);
      const k = 1 - clamp(t as number, 0, 1);
      return `${r2(c.ox + (ox as number) * k)}px ${r2(c.oy + (oy as number) * k)}px`;
    },
  );

  const Text = as;
  const captionId = `${uid}-caption`;

  return (
    <div
      ref={rootRef}
      className={cn("relative isolate flex items-center", className)}
    >
      <Text className="w-full">
        {pieces.map((piece, k) => {
          if (piece.kind === "text") {
            return <React.Fragment key={k}>{piece.text}</React.Fragment>;
          }
          const i = piece.index;
          const link = links[i];
          if (!link)
            return <React.Fragment key={k}>{piece.text}</React.Fragment>;
          return (
            <WindowLink
              key={k}
              index={i}
              link={link}
              text={piece.text}
              picture={pictures[i]}
              geo={geos[i]}
              hot={!disabled && hot === i}
              warm={!disabled && warm === i}
              tone={maskTone}
              accent={accent}
              underline={underline}
              dx={dx}
              dy={dy}
              describedBy={open === i ? captionId : undefined}
              bind={(node) => {
                if (node) nodes.current.set(i, node);
                else nodes.current.delete(i);
              }}
              onEnter={(event) => {
                const r = (
                  event.currentTarget as Element
                ).getBoundingClientRect();
                const pointer = "clientX" in event;
                enter(
                  i,
                  pointer ? event.clientX : r.left + r.width / 2,
                  pointer ? event.clientY : r.top + r.height / 2,
                );
              }}
              onLeave={() => {
                if (!pressed.current) leave(i);
              }}
              onMove={(event) => {
                if (disabled || hot !== i || event.pointerType === "touch")
                  return;
                const r = event.currentTarget.getBoundingClientRect();
                const span = Math.max(0, drift);
                if (motionSafe) {
                  dx.set(
                    r2(
                      (-(event.clientX - (r.left + r.width / 2)) /
                        Math.max(1, r.width / 2)) *
                        span,
                    ),
                  );
                  dy.set(
                    r2(
                      (-(event.clientY - (r.top + r.height / 2)) /
                        Math.max(1, r.height / 2)) *
                        span *
                        0.6,
                    ),
                  );
                }
                // The card waits for the pointer to rest, not merely to stay.
                const moved = Math.hypot(
                  event.clientX - rest.current.x,
                  event.clientY - rest.current.y,
                );
                if (moved > 6 && open !== i) {
                  rest.current = { x: event.clientX, y: event.clientY };
                  window.clearTimeout(timers.current.open);
                  timers.current.open = window.setTimeout(
                    () => request(i),
                    Math.max(0, expandDelay),
                  );
                }
              }}
              onTouchStart={(event) => {
                if (disabled) return;
                pressed.current = true;
                pressOpened.current = false;
                enter(i, event.clientX, event.clientY);
              }}
              onTouchEnd={() => {
                if (!pressed.current) return;
                pressed.current = false;
                leave(i);
              }}
              onKey={(event) => {
                if (event.key === "Escape" && open === i) {
                  event.preventDefault();
                  clearTimers();
                  request(null);
                }
              }}
              onCooled={() => setWarm((w) => (w === i ? null : w))}
              onClick={(event) => {
                // A long press that opened the card does not also follow the link.
                if (pressOpened.current) {
                  pressOpened.current = false;
                  event.preventDefault();
                  return;
                }
                onLinkClick?.(link, i, event);
              }}
            />
          );
        })}
      </Text>

      {cardIndex !== null && cardGeo && cardPicture && cardLink ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute z-10 overflow-hidden rounded-3 border border-hairline-strong bg-popover text-popover-foreground shadow-[0_14px_36px_-14px_color-mix(in_oklab,black_45%,transparent)]"
          style={{
            left: cardGeo.cx,
            top: cardGeo.cy,
            width: cardGeo.cw,
            height: cardGeo.ch,
            clipPath: clip,
            opacity: cardOpacity,
          }}
        >
          <motion.div
            className="w-full"
            style={{
              height: cardGeo.ph,
              ...layersOf(cardPicture, maskTone, accent),
              backgroundSize: `${coverOf(cardGeo, cardPicture.ratio).w}px ${coverOf(cardGeo, cardPicture.ratio).h}px`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: cardPosition,
            }}
          />
          <motion.div
            className="flex items-center gap-2 px-3"
            style={{ height: CAPTION, opacity: captionOpacity }}
          >
            <span
              id={captionId}
              className="min-w-0 flex-1 truncate text-xs font-medium"
            >
              {cardLink.caption ?? cardLink.alt}
            </span>
            {cardLink.href ? (
              <ArrowUpRight
                aria-hidden
                className="size-3.5 shrink-0 text-ink-3"
              />
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </div>
  );
}
