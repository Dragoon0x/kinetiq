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
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type StreakPagerItem = {
  /** The slide's heading. */
  title: string;
  /** What the slide's picture shows, for assistive technology. */
  alt: string;
  /** A short mono line above the title, e.g. "Survey 01". */
  kicker?: string;
  /** One or two lines under the title. */
  body?: string;
  /** A small label under the picture, e.g. "4.2 light years". */
  caption?: string;
  /** An image URL for the picture. Without one, a body of the sky is drawn in code. */
  src?: string;
};

export type StreakPagerProps = {
  /** The slides, in order. @default four Waylight survey slides */
  items?: StreakPagerItem[];
  /** The slide on screen (controlled), by index. */
  value?: number;
  /** The slide on screen to begin with. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, key, button or dot that chose a new slide, as soon as it is chosen. */
  onValueChange?: (index: number) => void;
  /** How far the stars stretch into streaks at full speed, 0 (points) to 1 (long trails). @default 0.6 */
  streak?: number;
  /** How many stars fill the sky, 0 to 1. @default 0.5 */
  density?: number;
  /** The colour a fast swipe tints the streaks, any CSS colour. @default "var(--accent-bright)" */
  tint?: string;
  /** How far the stars drift with the slides, 0 (fixed sky) to 1. @default 0.5 */
  parallax?: number;
  /** Height of the warp point on the edge the slides travel toward, 0 (top) to 1 (bottom). @default 0.5 */
  horizon?: number;
  /** Carry on from the last slide to the first. @default false */
  loop?: boolean;
  /** Move to the next slide every this many ms while nobody is using the pager; 0 never. @default 0 */
  interval?: number;
  /** Show the dots and the previous and next buttons. @default true */
  controls?: boolean;
  /** Seeds the starfield. @default 7 */
  seed?: number;
  /** Fires when a new slide has come to rest, with its index. */
  onLand?: (index: number) => void;
  /** The pager's accessible name. @default "Slides" */
  label?: string;
  /** No dragging, keys or buttons. @default false */
  disabled?: boolean;
  /** Cap on the starfield's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the pager; give it a height. @default "h-56 w-full" */
  className?: string;
};

/* ---------------------------------- helpers --------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const mod = (v: number, n: number) => ((v % n) + n) % n;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Pigment: a token's hue and chroma at a fixed lightness, the same in both themes. */
const pigment = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Resolves any CSS colour to sRGB 0–1 through a 1px canvas. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[0] = (d[0] ?? 0) / 255;
    out[1] = (d[1] ?? 0) / 255;
    out[2] = (d[2] ?? 0) / 255;
  };
}

/* ------------------------------------ art ----------------------------------- */

/** The default slides: four places on the Waylight survey. */
export const defaultStreakPagerItems: StreakPagerItem[] = [
  {
    kicker: "Survey 01",
    title: "The Lantern Cluster",
    body: "Nine young suns close enough to read by, burning warm through a thin veil of dust.",
    caption: "1,240 light years",
    alt: "A tight cluster of warm, glowing stars.",
  },
  {
    kicker: "Survey 02",
    title: "Ash Moon",
    body: "A grey world with a slow day: craters in long shadow along the terminator.",
    caption: "Tidally locked",
    alt: "A grey cratered moon, half in shadow.",
  },
  {
    kicker: "Survey 03",
    title: "Coldbrook Belt",
    body: "A banded giant wearing a ring of ice, tilted toward us this season.",
    caption: "Rings at 16°",
    alt: "A banded planet with a tilted ring.",
  },
  {
    kicker: "Survey 04",
    title: "Fernworks Nebula",
    body: "Gas lit from inside in teal and rose, where the next stars are forming.",
    caption: "Still forming",
    alt: "A soft teal and rose nebula with a few bright stars.",
  },
];

/** A body of the sky in gradients: cluster, moon, ringed giant or nebula. */
function SkyArt({ kind }: { kind: number }) {
  if (kind === 0) {
    const spots: [number, number, number][] = [
      [50, 46, 1],
      [38, 36, 0.7],
      [62, 32, 0.6],
      [30, 58, 0.55],
      [66, 60, 0.8],
      [48, 68, 0.5],
      [56, 22, 0.45],
      [74, 44, 0.5],
      [24, 40, 0.4],
    ];
    const warm = pigment("--warn", 0.84, 0.12, -18);
    const glow = pigment("--warn", 0.78, 0.15, -30);
    return (
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          backgroundImage: [
            ...spots.map(
              ([x, y, s]) =>
                `radial-gradient(circle at ${x}% ${y}%, ${pigment("--warn", 0.98, 0.03)} 0 ${r2(1.6 * s)}%, ${warm} ${r2(2.4 * s)}%, color-mix(in oklab, ${glow} 40%, transparent) ${r2(5 * s)}%, transparent ${r2(11 * s)}%)`,
            ),
            `radial-gradient(circle at 50% 48%, color-mix(in oklab, ${glow} 26%, transparent), transparent 62%)`,
          ].join(", "),
        }}
      />
    );
  }
  if (kind === 1) {
    const lit = pigment("--ink-3", 0.86, 0.01);
    const mid = pigment("--ink-3", 0.62, 0.012);
    const dark = pigment("--ink-3", 0.3, 0.014);
    const crater = (x: number, y: number, r: number) =>
      `radial-gradient(circle at ${x}% ${y}%, color-mix(in oklab, ${dark} 46%, transparent) 0 ${r}%, color-mix(in oklab, ${lit} 30%, transparent) ${r2(r * 1.15)}%, transparent ${r2(r * 1.4)}%)`;
    return (
      <span
        aria-hidden
        className="absolute inset-[14%] rounded-full shadow-[0_0_40px_color-mix(in_oklab,var(--foreground)_10%,transparent)]"
        style={{
          backgroundImage: [
            `radial-gradient(circle at 78% 64%, transparent 0 34%, color-mix(in oklab, black 62%, transparent) 62%)`,
            crater(36, 34, 9),
            crater(58, 52, 6),
            crater(30, 62, 5),
            crater(52, 24, 4),
            crater(66, 74, 7),
            `radial-gradient(circle at 34% 30%, ${lit}, ${mid} 58%, ${dark})`,
          ].join(", "),
        }}
      />
    );
  }
  if (kind === 2) {
    const band = (l: number, c: number) => pigment("--warn", l, c, 10);
    const ring = pigment("--accent", 0.82, 0.04, -60);
    return (
      <span aria-hidden className="absolute inset-0">
        <span
          className="absolute inset-x-[-6%] top-[38%] h-[24%] -rotate-[16deg] rounded-[50%] border-[3px] [clip-path:inset(0_0_50%_0)]"
          style={{ borderColor: ring }}
        />
        <span
          className="absolute inset-[18%] rounded-full"
          style={{
            backgroundImage: [
              `radial-gradient(circle at 74% 70%, transparent 0 30%, color-mix(in oklab, black 58%, transparent) 64%)`,
              `linear-gradient(164deg, ${band(0.86, 0.05)} 0 18%, ${band(0.7, 0.09)} 18% 30%, ${band(0.8, 0.07)} 30% 44%, ${band(0.62, 0.1)} 44% 52%, ${band(0.78, 0.06)} 52% 70%, ${band(0.66, 0.08)} 70%)`,
            ].join(", "),
          }}
        />
        <span
          className="absolute inset-x-[-6%] top-[38%] h-[24%] -rotate-[16deg] rounded-[50%] border-[3px] [clip-path:inset(50%_0_0_0)]"
          style={{ borderColor: ring }}
        />
      </span>
    );
  }
  const teal = pigment("--signal", 0.72, 0.11);
  const rose = pigment("--danger", 0.7, 0.13, -14);
  return (
    <span
      aria-hidden
      className="absolute inset-0 rounded-full"
      style={{
        backgroundImage: [
          `radial-gradient(circle at 58% 44%, ${pigment("--signal", 0.98, 0.02)} 0 1.4%, transparent 3%)`,
          `radial-gradient(circle at 34% 60%, ${pigment("--danger", 0.97, 0.02)} 0 1%, transparent 2.4%)`,
          `radial-gradient(circle at 70% 66%, ${pigment("--signal", 0.96, 0.02)} 0 0.8%, transparent 2%)`,
          `radial-gradient(40% 32% at 40% 42%, color-mix(in oklab, ${teal} 70%, transparent), transparent)`,
          `radial-gradient(36% 30% at 62% 60%, color-mix(in oklab, ${rose} 64%, transparent), transparent)`,
          `radial-gradient(52% 40% at 52% 52%, color-mix(in oklab, ${teal} 26%, transparent), transparent)`,
        ].join(", "),
      }}
    />
  );
}

/* ---------------------------------- the sky --------------------------------- */

type SkyConfig = {
  streak: number;
  density: number;
  parallax: number;
  horizon: number;
  seed: number;
  motionSafe: boolean;
  dpr: number;
  tint: string;
};

type Sky = {
  configure: (cfg: SkyConfig) => void;
  readColours: () => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

const POOL = 900;
const WIDTHS = [0.8, 1.15, 1.7];
const ALPHAS = [0.3, 0.56, 0.9];

/**
 * The starfield. It reads the pager's position each frame, measures its speed
 * and turns that into a warp: stars pushed out from a warp point on the edge
 * the slides travel toward, each trailing a tail back into it. When the pager
 * rests and the warp has fallen away, it draws one still frame and stops.
 */
function createSky(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  pos: MotionValue<number>,
  glowLeft: MotionValue<number>,
  glowRight: MotionValue<number>,
): Sky {
  const ctx = canvas.getContext("2d");
  const sx = new Float32Array(POOL);
  const sy = new Float32Array(POOL);
  const sz = new Float32Array(POOL);
  const sm = new Uint8Array(POOL);
  const ink = new Float32Array(3);
  const tint = new Float32Array(3);
  const read = rgbReader();
  let cfg: SkyConfig | null = null;
  let seeded = Number.NaN;
  let w = 0;
  let h = 0;
  let ratio = 1;
  let frame = 0;
  let last = 0;
  let lastP = pos.get();
  let vel = 0;
  let warp = 0;
  let wx = 1;
  let visible = false;
  let disposed = false;

  const seedStars = (seed: number) => {
    const rnd = lcg(seed);
    for (let i = 0; i < POOL; i += 1) {
      sx[i] = rnd();
      sy[i] = rnd();
      // Most stars are far and faint; a few are near and bright.
      sz[i] = 0.2 + 0.8 * Math.pow(rnd(), 1.8);
      const m = rnd();
      sm[i] = m < 0.64 ? 0 : m < 0.91 ? 1 : 2;
    }
    seeded = seed;
  };

  const readColours = () => {
    const kids = carriers.children;
    const a = kids[0];
    const b = kids[1];
    if (a) read(getComputedStyle(a).color, ink);
    if (b) read(getComputedStyle(b).color, tint);
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || w < 1 || h < 1) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const count = Math.min(
      POOL,
      Math.round(((w * h) / 300) * clamp(c.density, 0, 1)),
    );
    const p = c.motionSafe ? pos.get() : 0;
    const drift = clamp(c.parallax, 0, 1) * 0.28;
    const Wx = wx * w;
    const Wy = clamp(c.horizon, 0, 1) * h;
    const push = 0.12 * warp;
    const tail = clamp(c.streak, 0, 1) * 0.5 * warp;
    // Above half speed the streaks take the tint, fully at full speed.
    // Above half speed the streaks take the tint, fully at full speed; the
    // brightest stars carry a little of it even at rest.
    const m = smooth(0.45, 1, warp) * 0.9;
    const colourFor = (k: number) => {
      const r = Math.round(
        255 * ((ink[0] ?? 0) + ((tint[0] ?? 0) - (ink[0] ?? 0)) * k),
      );
      const g = Math.round(
        255 * ((ink[1] ?? 0) + ((tint[1] ?? 0) - (ink[1] ?? 0)) * k),
      );
      const b = Math.round(
        255 * ((ink[2] ?? 0) + ((tint[2] ?? 0) - (ink[2] ?? 0)) * k),
      );
      return `rgb(${r}, ${g}, ${b})`;
    };
    const plain = colourFor(m);
    const bright = colourFor(Math.max(m, 0.45));
    ctx.lineCap = "round";
    const streaking = warp > 0.002;
    for (let b = 0; b < 3; b += 1) {
      ctx.beginPath();
      ctx.lineWidth = WIDTHS[b] ?? 1;
      ctx.strokeStyle = b === 2 ? bright : plain;
      // A long streak spreads a star's light along it.
      ctx.globalAlpha = (ALPHAS[b] ?? 0.5) * (1 - 0.22 * warp);
      for (let i = 0; i < count; i += 1) {
        if (sm[i] !== b) continue;
        const d = sz[i] ?? 0.5;
        let x = mod((sx[i] ?? 0) - p * drift * d, 1) * w;
        let y = (sy[i] ?? 0) * h;
        if (streaking) {
          const k = 1 + push * (0.4 + 0.6 * d);
          x = Wx + (x - Wx) * k;
          y = Wy + (y - Wy) * k;
          const t = tail * (0.3 + 0.7 * d);
          ctx.moveTo(x, y);
          ctx.lineTo(x - (x - Wx) * t, y - (y - Wy) * t);
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.01, y);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible || document.hidden || !c) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const p = pos.get();
    const moved = p - lastP;
    lastP = p;
    if (c.motionSafe) {
      const v = moved / dt;
      vel += (v - vel) * (1 - Math.exp(-dt / 0.05));
      if (Math.abs(vel) > 0.05) {
        wx += ((vel > 0 ? 1 : 0) - wx) * (1 - Math.exp(-dt / 0.06));
      }
      // Speed in slides per second, eased in fast and let go slower, so the
      // streaks build with the throw and relax as the slide lands.
      const target = Math.pow(clamp(Math.abs(vel) / 9, 0, 1), 0.8);
      const tau = target > warp ? 0.04 : 0.14;
      warp += (target - warp) * (1 - Math.exp(-dt / tau));
      if (warp < 0.002 && Math.abs(moved) < 1e-5) warp = 0;
    } else {
      vel = 0;
      warp = 0;
    }
    glowLeft.set(r2(warp * (1 - wx)));
    glowRight.set(r2(warp * wx));
    draw();
    if (Math.abs(moved) > 1e-5 || warp > 0) {
      frame = window.requestAnimationFrame(tick);
    } else {
      last = 0;
    }
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 1 || nh < 1) return;
    w = nw;
    h = nh;
    ratio = Math.min(window.devicePixelRatio || 1, clamp(c?.dpr ?? 2, 0.5, 2));
    const bw = Math.round(w * ratio);
    const bh = Math.round(h * ratio);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    draw();
  };

  const unsubscribe = pos.on("change", kick);

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (next.seed !== seeded) seedStars(next.seed);
      if (!was) readColours();
      else if (was.tint !== next.tint) readColours();
      if (!was || was.dpr !== next.dpr) resize();
      if (!next.motionSafe) {
        warp = 0;
        glowLeft.set(0);
        glowRight.set(0);
      }
      draw();
      kick();
    },
    readColours() {
      readColours();
      draw();
    },
    resize,
    setVisible(on) {
      visible = on;
      if (on) {
        lastP = pos.get();
        draw();
        kick();
      }
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      unsubscribe();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/* ---------------------------------- a slide --------------------------------- */

type SlideProps = {
  item: StreakPagerItem;
  index: number;
  count: number;
  pos: MotionValue<number>;
  loop: boolean;
  front: boolean;
  landed: boolean;
  motionSafe: boolean;
  id: string;
};

/**
 * One slide. Its place is a function of its distance from the pager's
 * position, so a drag halfway shows two slides half in; the picture rides a
 * little faster than the words for a touch of depth.
 */
function Slide({
  item,
  index,
  count,
  pos,
  loop,
  front,
  landed,
  motionSafe,
  id,
}: SlideProps) {
  const offset = useTransform(pos, (p) => {
    const d = index - p;
    return loop ? mod(d + count / 2, count) - count / 2 : d;
  });
  const x = useTransform(offset, (d) => `${r3(clamp(d, -2, 2) * 100)}%`);
  const artX = useTransform(offset, (d) => `${r3(clamp(d, -2, 2) * 34)}%`);

  return (
    <motion.div
      id={id}
      role="tabpanel"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}: ${item.title}`}
      aria-hidden={!front || undefined}
      inert={!front}
      className="absolute inset-0"
      style={{ x: motionSafe ? x : "0%" }}
      initial={false}
      animate={{ opacity: motionSafe || front ? 1 : 0 }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      <motion.div
        className="absolute top-[9%] right-[4%] aspect-square h-[46%] @min-[420px]:top-[12%] @min-[420px]:right-[7%] @min-[420px]:h-[66%]"
        style={{ x: motionSafe ? artX : "0%" }}
      >
        {item.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt=""
            draggable={false}
            className="absolute inset-[8%] size-[84%] rounded-full object-cover"
          />
        ) : (
          <SkyArt kind={index % 4} />
        )}
        {item.caption ? (
          <span className="absolute inset-x-0 -bottom-1 hidden truncate text-center font-mono text-[9px] tracking-[0.1em] text-ink-3 uppercase @min-[420px]:block">
            {item.caption}
          </span>
        ) : null}
      </motion.div>
      <div className="relative flex h-full max-w-[64%] flex-col justify-center gap-1.5 pr-2 pb-9 pl-4 [text-shadow:0_0_10px_var(--card),0_0_2px_var(--card)] @min-[420px]:max-w-[56%] @min-[420px]:pl-6">
        {item.kicker ? (
          <span className="flex items-center gap-2">
            <motion.span
              aria-hidden
              className="h-0.5 w-5 shrink-0 origin-left rounded-full bg-cobalt-bright"
              initial={false}
              animate={{ scaleX: landed ? 1 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
            <span className="truncate font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">
              {item.kicker}
            </span>
          </span>
        ) : null}
        <span className="text-[19px] leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground @min-[420px]:text-[26px]">
          {item.title}
        </span>
        {item.body ? (
          <span className="line-clamp-2 hidden text-[13px] leading-snug text-ink-2 @min-[300px]:block">
            {item.body}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

/* --------------------------------- the pager -------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * A slide pager set on a quiet starfield. Drag, swipe or press the arrows and
 * the stars are thrown into sideways streaks that sweep into a warp point on
 * the edge the slides are travelling toward; as the new slide lands on the
 * glide spring, the speed falls away and the streaks relax back to points.
 * A fast flick stretches them further and tints them; a long jump (a dot,
 * Home or End) warps hardest of all.
 *
 * The pager's position is one motion value: every slide's place, the
 * pictures' parallax and the warp itself are read from it, so a drag
 * halfway shows two slides half in and a sky half thrown. The stars are a
 * Canvas 2D field that only draws while something moves. It is a carousel
 * with a tab stop on the slides (arrows, Home, End), a dot tablist and
 * previous and next buttons. Under reduced motion slides cross-fade, and the
 * sky stays still.
 */
export function StreakPager({
  items,
  value,
  defaultValue = 0,
  onValueChange,
  streak = 0.6,
  density = 0.5,
  tint = "var(--accent-bright)",
  parallax = 0.5,
  horizon = 0.5,
  loop = false,
  interval = 0,
  controls = true,
  seed = 7,
  onLand,
  label = "Slides",
  disabled = false,
  dpr = 2,
  className,
}: StreakPagerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list = items && items.length > 0 ? items : defaultStreakPagerItems;
  const n = list.length;

  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, n - 1),
  );
  const front = clamp(Math.round(value ?? own), 0, n - 1);
  const [landed, setLanded] = React.useState(front);

  const pos = useMotionValue(front);
  const glowLeft = useMotionValue(0);
  const glowRight = useMotionValue(0);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seen, setSeen] = React.useState(front);
  if (seen !== front) {
    setSeen(front);
    const it = list[front];
    setSaid((x) => ({
      n: x.n + 1,
      text: it ? `${it.title}, slide ${front + 1} of ${n}.` : "",
    }));
  }

  const [hover, setHover] = React.useState(false);
  const [focusWithin, setFocusWithin] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [onScreen, setOnScreen] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const tabNodes = React.useRef(new Map<number, HTMLButtonElement>());
  const sky = React.useRef<Sky | null>(null);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const shown = React.useRef(front);
  const dragFrom = React.useRef<number | null>(null);
  const widthAtDrag = React.useRef(1);

  const config: SkyConfig = {
    streak,
    density,
    parallax,
    horizon,
    seed,
    motionSafe,
    dpr,
    tint,
  };
  const latest = React.useRef({ config, n, loop, motionSafe, front, onLand });
  React.useEffect(() => {
    latest.current = { config, n, loop, motionSafe, front, onLand };
    sky.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const s = createSky(root, canvas, carriers, pos, glowLeft, glowRight);
    sky.current = s;
    s.configure(latest.current.config);
    const sizer = new ResizeObserver(() => s.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const on = Boolean(entry?.isIntersecting);
      s.setVisible(on);
      setOnScreen(on);
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) s.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      s.dispose();
      if (sky.current === s) sky.current = null;
    };
  }, [pos, glowLeft, glowRight]);

  React.useEffect(
    () => () => {
      running.current?.stop();
    },
    [],
  );

  /** Settles the pager on a slide, from where it is, with a velocity in slides/s. */
  const settle = (target: number, velocity = 0) => {
    running.current?.stop();
    const L = latest.current;
    const land = () => {
      const i = mod(Math.round(target), L.n);
      setLanded(i);
      L.onLand?.(i);
    };
    if (!L.motionSafe) {
      running.current = animate(pos, target, {
        duration: 0,
        onComplete: land,
      });
      return;
    }
    running.current = animate(pos, target, {
      ...springs.glide,
      velocity,
      onComplete: land,
    });
  };

  const choose = (i: number) => {
    const next = mod(i, n);
    shown.current = next;
    setLanded(-1);
    if (value === undefined) setOwn(next);
    if (next !== front) onValueChange?.(next);
  };

  /** The resting position for slide `i` nearest the current one (it differs only when looping). */
  const restFor = (i: number) => {
    if (!loop) return i;
    const p = pos.get();
    return i + Math.round((p - i) / n) * n;
  };

  const goTo = (i: number, velocity = 0) => {
    if (disabled) return;
    const target = loop ? i : clamp(i, 0, n - 1);
    choose(target);
    settle(target, velocity);
  };

  /** One slide on; autoplay (`wrap`) comes back round to the start, a person at the end stays. */
  const step = (d: number, wrap = false) => {
    const at = Math.round(pos.get());
    if (!loop && (at + d < 0 || at + d > n - 1)) {
      if (wrap) goTo(0);
      return;
    }
    goTo(at + d);
  };

  const api = React.useRef({ step });
  React.useEffect(() => {
    api.current = { step };
  });

  // A host that moves `value` gets the same move a key would.
  React.useEffect(() => {
    if (shown.current === front && Math.abs(mod(pos.get(), n) - front) < 0.001)
      return;
    if (dragFrom.current !== null) return;
    shown.current = front;
    settle(restFor(front));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front, n]);

  // Autoplay: only on screen, only when nobody is using it, never reduced.
  const held = hover || focusWithin || dragging;
  React.useEffect(() => {
    if (interval <= 0 || !motionSafe || held || !onScreen || disabled) return;
    const t = window.setTimeout(
      () => api.current.step(1, true),
      Math.max(1500, interval),
    );
    return () => window.clearTimeout(t);
  }, [interval, motionSafe, held, onScreen, disabled, front]);

  const gesture = useDrag({
    axis: "x",
    threshold: 5,
    disabled,
    onStart: () => {
      running.current?.stop();
      dragFrom.current = pos.get();
      widthAtDrag.current = Math.max(1, rootRef.current?.clientWidth ?? 1);
      setDragging(true);
    },
    onMove: ({ offset }) => {
      const from = dragFrom.current;
      if (from === null || !motionSafe) return;
      const raw = from - offset.x / widthAtDrag.current;
      const p = loop
        ? raw
        : raw < 0
          ? rubberband(raw, 1)
          : raw > n - 1
            ? n - 1 + rubberband(raw - (n - 1), 1)
            : raw;
      pos.set(r3(p));
    },
    onEnd: ({ velocity, offset }) => {
      const from = dragFrom.current ?? pos.get();
      dragFrom.current = null;
      setDragging(false);
      const width = widthAtDrag.current;
      if (!motionSafe) {
        // No travel under reduced motion: a deliberate swipe turns the page.
        if (Math.abs(offset.x) > 40) step(offset.x < 0 ? 1 : -1);
        return;
      }
      const v = -velocity.x / width;
      const landing = project(pos.get() * width, -velocity.x, 0.994) / width;
      const start = Math.round(from);
      let target = clamp(Math.round(landing), start - 2, start + 2);
      // A deliberate pull past a quarter turns the page even when let go slowly.
      const pulled = pos.get() - start;
      if (target === start && Math.abs(pulled) > 0.25) {
        target = start + Math.sign(pulled);
      }
      if (!loop) target = clamp(target, 0, n - 1);
      choose(target);
      settle(target, v);
    },
    onCancel: () => {
      dragFrom.current = null;
      setDragging(false);
      settle(restFor(latest.current.front));
    },
  });

  const onViewportKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    const at = Math.round(pos.get());
    if (event.key === "ArrowRight") next = at + 1;
    else if (event.key === "ArrowLeft") next = at - 1;
    else if (event.key === "Home") next = loop ? restFor(0) : 0;
    else if (event.key === "End") next = loop ? restFor(n - 1) : n - 1;
    if (next === null) return;
    event.preventDefault();
    if (!loop) next = clamp(next, 0, n - 1);
    if (mod(next, n) === front && !loop) return;
    goTo(next);
  };

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = loop ? mod(front + 1, n) : front + 1;
    else if (event.key === "ArrowLeft")
      next = loop ? mod(front - 1, n) : front - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    if (next === null) return;
    event.preventDefault();
    next = clamp(next, 0, n - 1);
    tabNodes.current.get(next)?.focus();
    if (next !== front) goTo(restFor(next));
  };

  const atStart = !loop && front === 0;
  const atEnd = !loop && front === n - 1;
  const glowAt = `${Math.round(clamp(horizon, 0, 1) * 100)}%`;
  const glowColour = `color-mix(in oklab, ${tint} 30%, transparent)`;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocusWithin(false);
      }}
      className={cn(
        "@container relative isolate h-56 w-full overflow-clip rounded-3 border border-hairline bg-card [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_40%,color-mix(in_oklab,var(--foreground)_5%,transparent))]"
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2"
        style={{
          opacity: glowLeft,
          backgroundImage: `radial-gradient(60% 70% at 0% ${glowAt}, ${glowColour}, transparent)`,
        }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2"
        style={{
          opacity: glowRight,
          backgroundImage: `radial-gradient(60% 70% at 100% ${glowAt}, ${glowColour}, transparent)`,
        }}
      />

      <div
        ref={viewportRef}
        role="group"
        aria-label={`${label}: slide ${front + 1} of ${n}`}
        aria-describedby={hintId}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onViewportKey}
        {...gesture}
        className={cn(
          "absolute inset-0 touch-pan-y rounded-3 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      >
        {list.map((item, i) => (
          <Slide
            key={i}
            item={item}
            index={i}
            count={n}
            pos={pos}
            loop={loop}
            front={i === front}
            landed={i === landed}
            motionSafe={motionSafe}
            id={`${uid}-slide-${i}`}
          />
        ))}
      </div>

      {controls ? (
        <div className="pointer-events-none absolute inset-x-2.5 bottom-2 flex items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Choose a slide"
            className="pointer-events-auto flex items-center"
          >
            {list.map((item, i) => {
              const on = i === front;
              return (
                <button
                  key={i}
                  ref={(node) => {
                    if (node) tabNodes.current.set(i, node);
                    else tabNodes.current.delete(i);
                  }}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls={`${uid}-slide-${i}`}
                  aria-label={`Slide ${i + 1}: ${item.title}`}
                  tabIndex={on ? 0 : -1}
                  disabled={disabled}
                  onClick={() => {
                    if (i !== front) goTo(restFor(i));
                  }}
                  onKeyDown={onTabKey}
                  className={cn(
                    "grid h-7 w-5 place-items-center rounded-1",
                    FOCUS_RING,
                    disabled ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                >
                  <motion.span
                    aria-hidden
                    className={cn(
                      "h-1.5 rounded-full transition-colors",
                      on ? "bg-cobalt-bright" : "bg-ink-3/45",
                    )}
                    initial={false}
                    animate={{ width: on ? 14 : 6 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                </button>
              );
            })}
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous slide"
              aria-disabled={atStart || undefined}
              disabled={disabled}
              onClick={() => step(-1)}
              className={cn(
                "grid size-8 place-items-center rounded-full border border-hairline-strong bg-card/80 text-ink-2 backdrop-blur-sm transition-colors",
                "not-aria-disabled:enabled:hover:text-foreground disabled:cursor-not-allowed aria-disabled:opacity-40",
                FOCUS_RING,
              )}
            >
              <ChevronLeft aria-hidden className="size-4 shrink-0" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              aria-disabled={atEnd || undefined}
              disabled={disabled}
              onClick={() => step(1)}
              className={cn(
                "grid size-8 place-items-center rounded-full border border-hairline-strong bg-card/80 text-ink-2 backdrop-blur-sm transition-colors",
                "not-aria-disabled:enabled:hover:text-foreground disabled:cursor-not-allowed aria-disabled:opacity-40",
                FOCUS_RING,
              )}
            >
              <ChevronRight aria-hidden className="size-4 shrink-0" />
            </button>
          </div>
        </div>
      ) : null}

      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => sky.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span
          className="transition-colors duration-1"
          style={{ color: "var(--foreground)" }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: tint }}
        />
      </span>
      <p id={hintId} className="sr-only">
        Drag or swipe sideways, or use the arrow keys, Home and End, to move
        between slides.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
