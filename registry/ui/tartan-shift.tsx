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
import { cn } from "@/registry/lib/utils";

export type TartanShiftSett = "fine" | "bold";
export type TartanShiftPalette = "highland" | "modern" | "earth";

export type TartanShiftProps = {
  /** The pattern's scale and character: narrow lines and overchecks, or broad blocks. A change re-threads the cloth. @default "bold" */
  sett?: TartanShiftSett;
  /** The cloth's colours. A change slides the stripes into the new sett and re-threads it. @default "highland" */
  palette?: TartanShiftPalette;
  /** How far scrolling carries the cloth and how fast it slides by itself, 0 to 1. 0 holds it still. @default 0.5 */
  drift?: number;
  /** What sits on the cloth: a hero, a heading. Rendered in a layer above it. */
  children?: React.ReactNode;
  /** The root fills its container (`h-full w-full`); size it here. */
  className?: string;
};

/** Stripes in one repeat: eight in the half-sett, mirrored. */
const SLOTS = 16;
/** How long the shuttle takes to cross the cloth, s. */
const CROSSING = 0.9;
/** The ambient slide at full drift, px/s, and the smallest step worth a repaint. */
const AMBIENT = 7;
const MIN_STEP = 0.25;
const BG_LIGHT = 0.985;
const BG_DARK = 0.145;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A dye: its lightness on the light theme and on the dark one, its chroma, its hue. */
type Pigment = readonly [
  light: number,
  dark: number,
  chroma: number,
  hue: number,
];
/** One stripe of the half-sett: a colour and a thread count. */
type Stripe = readonly [colour: number, threads: number];

/*
 * Dyes are pigment: a fixed chroma and hue, with a lightness that follows the
 * page's own background, so the cloth is full colour on the light theme and
 * dimmed on the dark one, where a hero has to read over it.
 */
const dye = ([light, dark, c, h]: Pigment) => {
  const b = (light - dark) / (BG_LIGHT - BG_DARK);
  const a = dark - BG_DARK * b;
  return `oklch(from var(--background) calc(${r4(a)} + l * ${r4(b)}) ${c} ${h})`;
};

type PaletteDef = {
  dyes: readonly Pigment[];
  /** The dye the shuttle's thread is drawn in while it re-threads. */
  accent: number;
  /** Half-setts, eight stripes each: fine is 24 threads, bold 36. */
  setts: Record<TartanShiftSett, readonly Stripe[]>;
};

const PALETTES: Record<TartanShiftPalette, PaletteDef> = {
  highland: {
    dyes: [
      [0.42, 0.3, 0.07, 160],
      [0.33, 0.24, 0.07, 262],
      [0.22, 0.16, 0.012, 262],
      [0.53, 0.38, 0.17, 27],
      [0.82, 0.6, 0.14, 92],
    ],
    accent: 4,
    setts: {
      fine: [
        [0, 6],
        [2, 1],
        [1, 6],
        [2, 1],
        [3, 2],
        [1, 2],
        [2, 5],
        [4, 1],
      ],
      bold: [
        [1, 10],
        [2, 2],
        [1, 2],
        [2, 2],
        [0, 12],
        [2, 2],
        [3, 4],
        [4, 2],
      ],
    },
  },
  modern: {
    dyes: [
      [0.86, 0.55, 0.006, 258],
      [0.36, 0.24, 0.01, 258],
      [0.95, 0.62, 0.02, 90],
      [0.7, 0.5, 0.14, 30],
      [0.6, 0.43, 0.09, 200],
    ],
    accent: 3,
    setts: {
      fine: [
        [2, 6],
        [1, 2],
        [2, 2],
        [0, 6],
        [4, 1],
        [0, 2],
        [1, 4],
        [3, 1],
      ],
      bold: [
        [0, 14],
        [1, 4],
        [0, 2],
        [2, 8],
        [3, 1],
        [2, 2],
        [1, 4],
        [4, 1],
      ],
    },
  },
  earth: {
    dyes: [
      [0.4, 0.28, 0.05, 55],
      [0.56, 0.4, 0.13, 42],
      [0.74, 0.53, 0.12, 82],
      [0.52, 0.37, 0.07, 120],
      [0.9, 0.6, 0.03, 85],
    ],
    accent: 4,
    setts: {
      fine: [
        [3, 6],
        [0, 2],
        [2, 1],
        [0, 4],
        [1, 6],
        [4, 1],
        [1, 2],
        [0, 2],
      ],
      bold: [
        [0, 12],
        [2, 2],
        [0, 4],
        [1, 10],
        [4, 1],
        [1, 2],
        [3, 4],
        [2, 1],
      ],
    },
  },
};

/** One repeat of the cloth in px: its size, its thread, and its sixteen stripes. */
type Geometry = { tile: number; u: number; pos: number[]; size: number[] };

type Cloth = {
  key: string;
  geo: Geometry;
  fills: string[];
  accent: string;
};

function clothOf(palette: TartanShiftPalette, sett: TartanShiftSett): Cloth {
  const def = PALETTES[palette] ?? PALETTES.highland;
  const half = def.setts[sett] ?? def.setts.bold;
  const u = sett === "fine" ? 2 : 2.5;
  // A symmetric sett: the half, then the half mirrored about its last stripe.
  const stripes = [...half, ...[...half].reverse()];
  const pos: number[] = [];
  const size: number[] = [];
  const fills: string[] = [];
  let at = 0;
  for (const [colour, threads] of stripes) {
    pos.push(r2(at));
    size.push(r2(threads * u));
    fills.push(dye(def.dyes[colour] ?? def.dyes[0] ?? [0.5, 0.4, 0, 0]));
    at += threads * u;
  }
  return {
    key: `${palette}/${sett}`,
    geo: { tile: r2(at), u, pos, size },
    fills,
    accent: dye(def.dyes[def.accent] ?? def.dyes[0] ?? [0.5, 0.4, 0, 0]),
  };
}

/** The geometry a layer draws, as motion values, so a slide never re-renders. */
type Loom = {
  tile: MotionValue<number>;
  u: MotionValue<number>;
  pos: MotionValue<number>[];
  size: MotionValue<number>[];
};

const loomOf = (g: Geometry): Loom => ({
  tile: motionValue(g.tile),
  u: motionValue(g.u),
  pos: Array.from({ length: SLOTS }, (_, i) => motionValue(g.pos[i] ?? 0)),
  size: Array.from({ length: SLOTS }, (_, i) => motionValue(g.size[i] ?? 0)),
});

const readLoom = (l: Loom): Geometry => ({
  tile: l.tile.get(),
  u: l.u.get(),
  pos: l.pos.map((m) => m.get()),
  size: l.size.map((m) => m.get()),
});

/** Sets a layer partway from one geometry to another. */
function lay(l: Loom, a: Geometry, b: Geometry, t: number) {
  l.tile.set(r2(lerp(a.tile, b.tile, t)));
  l.u.set(r4(lerp(a.u, b.u, t)));
  for (let i = 0; i < SLOTS; i += 1) {
    l.pos[i]?.set(r2(lerp(a.pos[i] ?? 0, b.pos[i] ?? 0, t)));
    l.size[i]?.set(r2(Math.max(0, lerp(a.size[i] ?? 0, b.size[i] ?? 0, t))));
  }
}

/** The 2/2 twill: in every four-by-four block of threads, where the warp shows. */
const TWILL_CELLS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 3],
  [2, 2],
  [3, 1],
  [1, 0],
  [0, 1],
  [2, 3],
  [3, 2],
];

const twillPath = (u: number) =>
  TWILL_CELLS.map(
    ([i, j]) =>
      `M ${r2(i * u)} ${r2(j * u)} h ${r2(u)} v ${r2(u)} h ${r2(-u)} Z`,
  ).join(" ");

/** The shadow along each twill wale, so the weave reads as raised. */
const walePath = (u: number) => {
  const q = r2(u * 4);
  const h = r2(u * 2);
  return `M 0 ${h} L ${h} 0 M 0 ${q} L ${q} 0 M ${h} ${q} L ${q} ${h}`;
};

type Cloths = { from: Cloth; to: Cloth; run: number };

/**
 * One cloth's weft and warp patterns. Each stripe's colour sits on a plain
 * group the rect inherits from: a motion element keeps the static style it
 * mounted with, and a stripe's colour changes with every cloth.
 */
function Weave({
  id,
  loom,
  fills,
  x,
  y,
}: {
  id: string;
  loom: Loom;
  fills: string[];
  x: MotionValue<number>;
  y: MotionValue<number>;
}) {
  return (
    <>
      <motion.pattern
        id={`${id}-weft`}
        patternUnits="userSpaceOnUse"
        x={x}
        y={y}
        width={loom.tile}
        height={loom.tile}
      >
        {fills.map((fill, i) => (
          <g key={i} style={{ fill }}>
            <motion.rect
              x={0}
              y={loom.pos[i]}
              width={loom.tile}
              height={loom.size[i]}
            />
          </g>
        ))}
      </motion.pattern>
      <motion.pattern
        id={`${id}-warp`}
        patternUnits="userSpaceOnUse"
        x={x}
        y={y}
        width={loom.tile}
        height={loom.tile}
      >
        {fills.map((fill, i) => (
          <g key={i} style={{ fill }}>
            <motion.rect
              x={loom.pos[i]}
              y={0}
              width={loom.size[i]}
              height={loom.tile}
            />
          </g>
        ))}
      </motion.pattern>
    </>
  );
}

/**
 * A tartan cloth as a backdrop, built the way a weaver builds it: a
 * symmetric sett laid as the weft (horizontal stripes), the same sett laid as
 * the warp (vertical stripes) and the warp shown only through a 2/2 twill —
 * a stepped diagonal pattern — so where two colours cross they blend on the
 * diagonal the way woven cloth does, with the wales shaded and a broad light
 * across the whole.
 *
 * When the palette or the sett changes, every stripe glides from its old
 * place and width to its new one on the glide spring, and the new colours are
 * laid in behind a diagonal front that crosses the cloth along the twill, a
 * bright thread running along it like a shuttle laying weft. The cloth also
 * drifts: its travel through the viewport (in any scroll container) becomes
 * a diagonal offset the patterns follow on the drift spring, plus a very slow
 * slide of its own while it is on screen. Everything moves the patterns'
 * own attributes, so nothing lays out again.
 *
 * Decorative: the drawing is hidden from assistive technology and has no
 * gesture of its own; its children sit in a normal layer above it. Under
 * reduced motion nothing slides or drifts: a new cloth cross-fades over the
 * old one, already in its new sett.
 */
export function TartanShift({
  sett = "bold",
  palette = "highland",
  drift = 0.5,
  children,
  className,
}: TartanShiftProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const want = clothOf(palette, sett);

  // The cloth shown, and the one being threaded in. A change while one is
  // still crossing finishes that one, and the new one starts from there.
  const [cloths, setCloths] = React.useState<Cloths>(() => ({
    from: want,
    to: want,
    run: 0,
  }));
  if (cloths.to.key !== want.key) {
    setCloths({ from: cloths.to, to: want, run: cloths.run + 1 });
  }

  const [looms] = React.useState(() => ({
    a: loomOf(want.geo),
    b: loomOf(want.geo),
  }));
  const wipe = useMotionValue(0);
  const veil = useMotionValue(1);
  const span = useMotionValue(1200);
  const ambient = useMotionValue(0);
  const scrolled = useMotionValue(0);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const loop = React.useRef({ raf: 0, last: 0, seen: false, at: 0 });
  const api = React.useRef<{
    wake: () => void;
    follow: (jump: boolean) => void;
  } | null>(null);
  const amount = clamp01(drift);

  const drifting = React.useRef<AnimationPlaybackControls | null>(null);

  const stop = React.useCallback(() => {
    for (const a of anims.current) a.stop();
    anims.current = [];
  }, []);

  // The re-thread. Before paint, so the old cloth never shows its new colours
  // uncovered for a frame.
  React.useLayoutEffect(() => {
    const { from, to, run } = cloths;
    stop();
    if (from === to) {
      lay(looms.a, to.geo, to.geo, 1);
      lay(looms.b, to.geo, to.geo, 1);
      wipe.set(0);
      veil.set(1);
      return;
    }
    // From wherever the stripes are now: mid-slide, if this interrupted one.
    const start = readLoom(looms.a);
    const finish = () =>
      setCloths((c) => (c.run === run ? { ...c, from: c.to } : c));
    if (!motionSafe) {
      lay(looms.a, start, start, 1);
      lay(looms.b, to.geo, to.geo, 1);
      wipe.set(1);
      veil.set(0);
      anims.current = [
        animate(veil, 1, {
          duration: durations.slow,
          ease: easings.enter,
          onComplete: finish,
        }),
      ];
      return stop;
    }
    lay(looms.a, start, start, 1);
    lay(looms.b, start, start, 1);
    wipe.set(0);
    veil.set(1);
    anims.current = [
      animate(0, 1, {
        ...springs.glide,
        onUpdate: (t) => {
          lay(looms.a, start, to.geo, t);
          lay(looms.b, start, to.geo, t);
        },
      }),
      animate(wipe, 1, {
        duration: CROSSING,
        ease: easings.move,
        onComplete: finish,
      }),
    ];
    return stop;
  }, [cloths, motionSafe, looms, wipe, veil, stop]);

  React.useEffect(
    () => () => {
      stop();
      drifting.current?.stop();
    },
    [stop],
  );

  /* --------------------------------------------------------------- drift */

  const follow = (jump: boolean) => {
    const root = rootRef.current;
    if (!root || !motionSafe || amount === 0) {
      scrolled.set(0);
      return;
    }
    const rect = root.getBoundingClientRect();
    const centre = rect.top + rect.height / 2 - window.innerHeight / 2;
    const target = r2(-centre * amount * 0.35);
    drifting.current?.stop();
    if (jump) scrolled.jump(target);
    else drifting.current = animate(scrolled, target, springs.drift);
  };

  const sleep = React.useCallback(() => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  }, []);

  // The slow slide of its own: only on screen, in a visible page, with
  // motion welcome. It repaints only when it has moved a visible amount.
  const wake = () => {
    const l = loop.current;
    if (!motionSafe || amount === 0) {
      sleep();
      return;
    }
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const speed = AMBIENT * amount;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 0;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      l.at += speed * dt;
      if (Math.abs(l.at - ambient.get()) >= MIN_STEP) ambient.set(r2(l.at));
      l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  };

  React.useEffect(() => {
    api.current = { wake, follow };
  });

  React.useEffect(() => {
    if (!motionSafe || amount === 0) {
      sleep();
      scrolled.set(0);
      return;
    }
    api.current?.follow(true);
    api.current?.wake();
  }, [motionSafe, amount, sleep, scrolled]);

  React.useEffect(() => {
    const onScroll = () => {
      if (loop.current.seen) api.current?.follow(false);
    };
    const onVisibility = () => {
      if (document.hidden) sleep();
      else api.current?.wake();
    };
    // Capture: a scroll in any container the cloth sits in moves it.
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      sleep();
    };
  }, [sleep]);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const l = loop.current;
      const sizer = new ResizeObserver(() => {
        span.set(Math.round(node.clientWidth + node.clientHeight));
      });
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        l.seen = Boolean(entry?.isIntersecting);
        if (l.seen) {
          api.current?.follow(true);
          api.current?.wake();
        } else if (l.raf) {
          window.cancelAnimationFrame(l.raf);
          l.raf = 0;
        }
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        l.seen = false;
        if (l.raf) window.cancelAnimationFrame(l.raf);
        l.raf = 0;
      };
    },
    [span],
  );

  /* -------------------------------------------------------------- render */

  // The cloth slides along the twill: a little across for every step down.
  const x = useTransform(
    [ambient, scrolled] as MotionValue<number>[],
    ([a = 0, s = 0]: number[]) => r2(a + s * 0.5),
  );
  const y = useTransform(
    [ambient, scrolled] as MotionValue<number>[],
    ([a = 0, s = 0]: number[]) => r2(a * 0.5 + s),
  );
  const cell = useTransform(looms.a.u, (u) => r2(u * 4));
  const twill = useTransform(looms.a.u, twillPath);
  const wales = useTransform(looms.a.u, walePath);
  const front = useTransform(
    [wipe, span] as MotionValue<number>[],
    ([p = 0, s = 0]: number[]) => r2(p * (s + 80) - 40),
  );
  const clip = useTransform(front, (f) =>
    f <= -40 ? "M 0 0 Z" : `M -40 -40 H ${f} L -40 ${f} Z`,
  );
  const thread = useTransform(front, (f) => `M ${f} -2 L -2 ${f}`);
  const threadOpacity = useTransform(wipe, (p) =>
    motionSafe && p > 0 && p < 1 ? r2(Math.min(1, p * 12, (1 - p) * 12)) : 0,
  );
  // The thread's glow is a wider, fainter stroke of the same line: no filter.
  const glowOpacity = useTransform(threadOpacity, (o) => r2(o * 0.28));

  const id = `tartan-${uid}`;
  const full = { width: "100%", height: "100%" } as const;

  return (
    <div
      ref={bindRoot}
      className={cn("relative isolate h-full w-full overflow-clip", className)}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 block size-full"
      >
        <defs>
          <Weave
            id={`${id}-a`}
            loom={looms.a}
            fills={cloths.from.fills}
            x={x}
            y={y}
          />
          <Weave
            id={`${id}-b`}
            loom={looms.b}
            fills={cloths.to.fills}
            x={x}
            y={y}
          />
          <motion.pattern
            id={`${id}-twill`}
            patternUnits="userSpaceOnUse"
            x={x}
            y={y}
            width={cell}
            height={cell}
          >
            <motion.path d={twill} fill="white" />
          </motion.pattern>
          <mask id={`${id}-mask`}>
            <rect {...full} fill={`url(#${id}-twill)`} />
          </mask>
          <motion.pattern
            id={`${id}-wales`}
            patternUnits="userSpaceOnUse"
            x={x}
            y={y}
            width={cell}
            height={cell}
          >
            <motion.path
              d={wales}
              fill="none"
              strokeWidth={0.6}
              strokeLinecap="square"
              style={{ stroke: "color-mix(in oklab, black 16%, transparent)" }}
            />
          </motion.pattern>
          <clipPath id={`${id}-wipe`}>
            <motion.path d={clip} />
          </clipPath>
          <linearGradient id={`${id}-light`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="white" stopOpacity={0.09} />
            <stop offset="0.5" stopColor="white" stopOpacity={0} />
            <stop offset="1" stopColor="black" stopOpacity={0.14} />
          </linearGradient>
        </defs>

        <rect {...full} fill={`url(#${id}-a-weft)`} />
        <rect {...full} fill={`url(#${id}-a-warp)`} mask={`url(#${id}-mask)`} />
        {cloths.from !== cloths.to ? (
          // The new cloth exists only while it is being threaded in; once it
          // has crossed, the old layer has its colours and this one goes.
          <motion.g clipPath={`url(#${id}-wipe)`} style={{ opacity: veil }}>
            <rect {...full} fill={`url(#${id}-b-weft)`} />
            <rect
              {...full}
              fill={`url(#${id}-b-warp)`}
              mask={`url(#${id}-mask)`}
            />
          </motion.g>
        ) : null}
        <rect {...full} fill={`url(#${id}-wales)`} />
        {/* Colours ride on plain groups: a motion element keeps the static
            style it mounted with, and the shuttle's thread changes with each
            cloth. */}
        <g style={{ stroke: cloths.to.accent }}>
          <motion.path
            d={thread}
            fill="none"
            strokeWidth={5}
            strokeLinecap="round"
            style={{ opacity: glowOpacity }}
          />
          <motion.path
            d={thread}
            fill="none"
            strokeWidth={1.4}
            strokeLinecap="round"
            style={{ opacity: threadOpacity }}
          />
        </g>
        <rect {...full} fill={`url(#${id}-light)`} />
      </svg>

      {children !== undefined && children !== null ? (
        <div className="relative h-full w-full">{children}</div>
      ) : null}
    </div>
  );
}
