"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type HeadwindCard = {
  /** A picture. Without one, `art` or a drawn landscape is shown. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** The card's title. Defaults to `alt`. */
  caption?: string;
  /** A short line under the title. */
  detail?: string;
  /** Your own art, filling the picture area. */
  art?: React.ReactNode;
};

export type HeadwindCardsProps = {
  /** The cards, in order. @default defaultHeadwindCards */
  items?: HeadwindCard[];
  /** Controlled: the current card. */
  value?: number;
  /** Initial card when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the throw, click or key that chose a card, with the card the row will settle on. */
  onValueChange?: (index: number) => void;
  /** How hard the cards lean into the motion, 0 (upright) to 2. @default 1 */
  skew?: number;
  /** Stiffness of the spring that stands the cards back up, 120 (loose, rocking) to 900 (quick). @default 380 */
  stiffness?: number;
  /** Space between cards, px. @default 16 */
  gap?: number;
  /** A card's width, px; held to 72% of the row on narrow screens. @default 168 */
  cardWidth?: number;
  /** A card's height as a share of its width. @default 1.18 */
  aspect?: number;
  /** The most a card may lean, degrees. @default 14 */
  maxLean?: number;
  /** How much more the leading cards lean than the trailing ones, 0 (all alike) to 1. @default 0.6 */
  spread?: number;
  /** How quickly a throw dies away, 0 (coasts far) to 1 (stops short). @default 0.5 */
  friction?: number;
  /** Where the current card rests: at the start of the row or in its middle. @default "start" */
  align?: "start" | "center";
  /** Faint wind lines drifting through the gaps while the row moves fast. @default true */
  streaks?: boolean;
  /** The row's accessible name. @default "Cards" */
  label?: string;
  /** No drags, clicks or keys; the row dims. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- art ----------------------------------- */

export const defaultHeadwindCards: HeadwindCard[] = [
  {
    alt: "A path along a grassy ridge between two valleys",
    caption: "Ridge Loop",
    detail: "11 km · 3 h 40",
  },
  {
    alt: "Channels of still water winding through a saltmarsh",
    caption: "Saltmarsh Path",
    detail: "7 km · 2 h",
  },
  {
    alt: "A track through tall beech trees",
    caption: "Beech Hollow",
    detail: "5 km · 1 h 30",
  },
  {
    alt: "Steps cut into a cliff above the sea",
    caption: "Cliff Steps",
    detail: "9 km · 3 h",
  },
  {
    alt: "A straight old railway line running to the horizon",
    caption: "Old Rail Line",
    detail: "14 km · 3 h 30",
  },
  {
    alt: "A small mountain lake under steep slopes",
    caption: "Tarn Circuit",
    detail: "12 km · 4 h",
  },
  {
    alt: "A sandy track over low dunes by the shore",
    caption: "Dune Track",
    detail: "6 km · 1 h 50",
  },
  {
    alt: "Lanes between rows of fruit trees",
    caption: "Orchard Lanes",
    detail: "8 km · 2 h 20",
  },
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A pigment: a token's hue at a fixed lightness and chroma, the same in both themes. */
const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

/** The walked route, drawn over each landscape as a dashed line. */
function Route({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeDasharray="3 2.4"
      style={{ stroke: pig("--danger", 0.6, 0.17, 8) }}
    />
  );
}

/** A drawn landscape for each default route: shapes in pigments, no files. */
function RouteArt({ index }: { index: number }) {
  const common = {
    viewBox: "0 0 120 80",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
    "aria-hidden": true,
  } as const;
  const sky = (dh = 0, l = 0.9) => (
    <rect
      width="120"
      height="80"
      style={{ fill: pig("--accent", l, 0.045, dh) }}
    />
  );
  switch (((index % 8) + 8) % 8) {
    case 0:
      return (
        <svg {...common}>
          {sky(-20)}
          <path
            d="M0 46 L22 30 L40 40 L62 22 L84 36 L104 26 L120 34 V80 H0 Z"
            style={{ fill: pig("--accent", 0.66, 0.06, -40) }}
          />
          <path
            d="M0 58 Q30 40 60 50 T120 46 V80 H0 Z"
            style={{ fill: pig("--success", 0.66, 0.11, -30) }}
          />
          <path
            d="M0 70 Q40 58 80 66 T120 62 V80 H0 Z"
            style={{ fill: pig("--success", 0.56, 0.11, -24) }}
          />
          <Route d="M6 74 Q30 56 58 50 T112 44" />
        </svg>
      );
    case 1:
      return (
        <svg {...common}>
          {sky(-30, 0.92)}
          <rect
            y="38"
            width="120"
            height="42"
            style={{ fill: pig("--success", 0.7, 0.07, -40) }}
          />
          <path
            d="M0 50 Q30 44 52 52 T96 48 T120 54 V58 Q96 52 74 58 T30 54 T0 58 Z"
            style={{ fill: pig("--accent", 0.74, 0.07, -24) }}
          />
          <path
            d="M0 66 Q22 62 44 68 T90 64 T120 70 V73 Q92 68 66 72 T20 70 T0 72 Z"
            style={{ fill: pig("--accent", 0.72, 0.07, -24) }}
          />
          {[10, 18, 26, 70, 78, 104, 110].map((x) => (
            <path
              key={x}
              d={`M${x} 46 v-7 M${x + 2} 46 v-5`}
              strokeWidth="0.9"
              style={{ stroke: pig("--warn", 0.6, 0.08, -10) }}
            />
          ))}
          <Route d="M4 62 Q40 58 62 60 T116 56" />
        </svg>
      );
    case 2:
      return (
        <svg {...common}>
          <rect
            width="120"
            height="80"
            style={{ fill: pig("--success", 0.84, 0.06, -60) }}
          />
          {[8, 30, 54, 80, 102].map((x, k) => (
            <g key={x}>
              <rect
                x={x + 6}
                y="20"
                width="4"
                height="60"
                style={{ fill: pig("--ink-2", 0.42, 0.02) }}
              />
              <circle
                cx={x + 8}
                cy={18 + (k % 2) * 6}
                r="16"
                style={{
                  fill: pig("--success", 0.55 + (k % 3) * 0.05, 0.12, -40),
                }}
              />
            </g>
          ))}
          <path
            d="M44 80 Q56 62 60 52 Q64 62 76 80 Z"
            style={{ fill: pig("--warn", 0.78, 0.06, -20) }}
          />
          <Route d="M60 78 Q58 66 60 54" />
        </svg>
      );
    case 3:
      return (
        <svg {...common}>
          {sky(-15)}
          <rect
            y="40"
            width="120"
            height="40"
            style={{ fill: pig("--accent", 0.56, 0.1, -12) }}
          />
          <path
            d="M64 80 L70 34 L88 26 L120 24 V80 Z"
            style={{ fill: pig("--warn", 0.72, 0.06, -30) }}
          />
          <path
            d="M70 34 L88 26 L120 24 V30 L90 32 Z"
            style={{ fill: pig("--success", 0.62, 0.1, -40) }}
          />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <path
              key={k}
              d={`M${74 + k * 3} ${72 - k * 7} h5`}
              strokeWidth="1.2"
              style={{ stroke: pig("--warn", 0.52, 0.05, -30) }}
            />
          ))}
          <path
            d="M0 52 h40 M0 60 h26"
            strokeWidth="1"
            style={{ stroke: pig("--accent", 0.74, 0.07, -12) }}
          />
          <Route d="M74 76 L92 34 Q104 28 116 28" />
        </svg>
      );
    case 4:
      return (
        <svg {...common}>
          {sky(-10, 0.92)}
          <rect
            y="36"
            width="120"
            height="44"
            style={{ fill: pig("--success", 0.74, 0.08, -52) }}
          />
          <path
            d="M40 80 L58 36 L62 36 L80 80 Z"
            style={{ fill: pig("--ink-2", 0.62, 0.02) }}
          />
          {[44, 50, 55, 59, 62].map((y, k) => (
            <path
              key={y}
              d={`M${r3(56 - (80 - y) * 0.42)} ${y + 18 - k * 3} h${r3(8 + (80 - y) * 0.84)}`}
              strokeWidth="0.8"
              style={{ stroke: pig("--ink-2", 0.45, 0.02) }}
            />
          ))}
          {[14, 30, 96].map((x, k) => (
            <path
              key={x}
              d={`M${x} ${60 - k * 6} v-22`}
              strokeWidth="1.2"
              style={{ stroke: pig("--ink-2", 0.4, 0.02) }}
            />
          ))}
          <Route d="M60 78 L60 40" />
        </svg>
      );
    case 5:
      return (
        <svg {...common}>
          {sky(-25)}
          <path
            d="M0 40 L30 12 L52 34 L72 16 L120 44 V80 H0 Z"
            style={{ fill: pig("--accent", 0.5, 0.05, -50) }}
          />
          <path
            d="M26 16 L30 12 L36 18 Z M68 20 L72 16 L78 21 Z"
            style={{ fill: pig("--accent", 0.96, 0.01) }}
          />
          <ellipse
            cx="60"
            cy="58"
            rx="40"
            ry="12"
            style={{ fill: pig("--accent", 0.6, 0.1, -15) }}
          />
          <ellipse
            cx="52"
            cy="55"
            rx="16"
            ry="3"
            style={{ fill: pig("--accent", 0.76, 0.07, -15) }}
          />
          <path
            d="M0 72 Q60 62 120 72 V80 H0 Z"
            style={{ fill: pig("--success", 0.6, 0.1, -30) }}
          />
          <Route d="M20 66 Q20 46 60 44 Q100 44 100 62" />
        </svg>
      );
    case 6:
      return (
        <svg {...common}>
          {sky(-5, 0.93)}
          <rect
            y="34"
            width="120"
            height="10"
            style={{ fill: pig("--accent", 0.66, 0.08, -15) }}
          />
          <path
            d="M0 44 Q20 36 40 44 T80 42 T120 46 V80 H0 Z"
            style={{ fill: pig("--warn", 0.86, 0.07, -20) }}
          />
          <path
            d="M0 60 Q26 50 54 58 T120 56 V80 H0 Z"
            style={{ fill: pig("--warn", 0.8, 0.08, -24) }}
          />
          {[12, 20, 88, 96, 104].map((x, k) => (
            <path
              key={x}
              d={`M${x} ${54 + (k % 2) * 3} l2 -8 M${x + 3} ${54 + (k % 2) * 3} l-1 -7`}
              strokeWidth="0.9"
              style={{ stroke: pig("--success", 0.55, 0.1, -50) }}
            />
          ))}
          <Route d="M4 74 Q34 58 62 64 T116 58" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          {sky(-35)}
          <rect
            y="30"
            width="120"
            height="50"
            style={{ fill: pig("--success", 0.76, 0.09, -45) }}
          />
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3, 4, 5].map((col) => (
              <circle
                key={`${row}-${col}`}
                cx={6 + col * 22 + (row % 2) * 11}
                cy={38 + row * 15}
                r={7 + row * 1.5}
                style={{
                  fill: pig(
                    "--success",
                    0.55 + ((row + col) % 3) * 0.04,
                    0.12,
                    -38,
                  ),
                }}
              />
            )),
          )}
          {[1, 3, 7, 11].map((k) => (
            <circle
              key={k}
              cx={8 + k * 9}
              cy={36 + (k % 3) * 14}
              r="1.4"
              style={{ fill: pig("--danger", 0.6, 0.18) }}
            />
          ))}
          <Route d="M2 76 Q40 70 60 62 T118 50" />
        </svg>
      );
  }
}

/* ---------------------------------- card ---------------------------------- */

type CardProps = {
  card: HeadwindCard;
  index: number;
  count: number;
  gap: number;
  aspect: number;
  lean: MotionValue<number>;
  current: boolean;
  hidden: boolean;
};

/**
 * One card standing on the floor. Its lean is a skew about its foot, so the
 * foot stays planted and the head goes forward; its shadow slides toward the
 * lean and spreads with it.
 */
function Card({
  card,
  index,
  count,
  gap,
  aspect,
  lean,
  current,
  hidden,
}: CardProps) {
  const skewX = useTransform(lean, (l) => r2(-l));
  const shadowX = useTransform(lean, (l) => r2(l * 1.6));
  const shadowScale = useTransform(lean, (l) => r3(1 + Math.abs(l) / 36));
  const title = card.caption ?? card.alt;
  return (
    <div
      className="absolute bottom-0"
      style={{
        left: `calc(${index} * (var(--cw) + ${gap}px))`,
        width: "var(--cw)",
        height: `calc(var(--cw) * ${r3(aspect)})`,
      }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-x-2 -bottom-1.5 h-3 rounded-full"
        style={{
          x: shadowX,
          scaleX: shadowScale,
          backgroundImage:
            "radial-gradient(closest-side, oklch(0 0 0 / 0.22), transparent)",
        }}
      />
      <motion.div
        data-card={index}
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${count}: ${title}`}
        aria-hidden={hidden || undefined}
        inert={hidden}
        className={cn(
          "absolute inset-0 flex flex-col overflow-clip rounded-3 border bg-card transition-colors duration-200",
          current ? "border-hairline-strong" : "border-hairline",
        )}
        style={{ skewX, transformOrigin: "50% 100%" }}
      >
        <div className="relative flex-1 basis-0 overflow-hidden bg-muted">
          {card.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.src}
              alt={card.alt}
              draggable={false}
              className="block size-full object-cover"
            />
          ) : card.art ? (
            card.art
          ) : (
            <RouteArt index={index} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
          <p className="truncate text-sm font-medium text-foreground">
            {title}
          </p>
          {card.detail ? (
            <p className="truncate font-mono text-[10px] tracking-[0.04em] text-ink-3 tabular-nums">
              {card.detail}
            </p>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------- component ------------------------------- */

/** Wind lines: where each sits in the band, how long it is, how far apart. */
const STREAKS = [
  { y: 0.18, w: 54, x: 0.08, k: 0.55 },
  { y: 0.34, w: 80, x: 0.46, k: 0.8 },
  { y: 0.47, w: 38, x: 0.72, k: 0.45 },
  { y: 0.6, w: 66, x: 0.24, k: 0.7 },
  { y: 0.72, w: 46, x: 0.88, k: 0.6 },
  { y: 0.83, w: 72, x: 0.58, k: 0.9 },
] as const;

const FLOOR = 18;
const TOP = 6;
const PAD = 16;

/**
 * A row of standing cards that lean into the drag like walkers into wind.
 * The row follows the hand 1:1 and rubber-bands past its ends; each card
 * skews about its foot in proportion to the row's speed, the cards at the
 * leading end furthest, each on its own spring so a change of direction runs
 * down the row as a wave. A throw is projected to the card it would come to
 * rest on and the row springs there on springs.glide with the release
 * velocity; as it slows the lean targets fall away and every card stands back
 * up on a spring of the given stiffness at the recoil damping ratio, rocking
 * just past upright before it settles. Wind lines drift through the gaps while
 * the row is fast. Arrow keys step one card on springs.snap with half the
 * lean, Home and End travel to the ends on springs.glide, and a click on
 * another card brings it in. Under reduced motion nothing leans: the row
 * still follows a drag, release finishes on a short tween and keys jump.
 */
export function HeadwindCards({
  items = defaultHeadwindCards,
  value,
  defaultValue = 0,
  onValueChange,
  skew = 1,
  stiffness = 380,
  gap = 16,
  cardWidth = 168,
  aspect = 1.18,
  maxLean = 14,
  spread = 0.6,
  friction = 0.5,
  align = "start",
  streaks = true,
  label = "Cards",
  disabled = false,
  className,
}: HeadwindCardsProps) {
  const motionSafe = useMotionSafe();
  const list = items.length > 0 ? items : defaultHeadwindCards;
  const n = list.length;
  const hintId = React.useId();
  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, n - 1),
  );
  const current = clamp(Math.round(value ?? own), 0, n - 1);
  const [said, setSaid] = React.useState("");
  const [width, setWidth] = React.useState(0);

  const offset = useMotionValue(0);
  const dip = useMotionValue(1);
  const leans = React.useMemo(
    () => Array.from({ length: n }, () => motionValue(0)),
    [n],
  );
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const streakRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const heading = React.useRef(current);
  const dragging = React.useRef(false);
  const keyed = React.useRef(false);
  const grab = React.useRef(0);
  const loop = React.useRef<{ wake: () => void } | null>(null);

  /** The row's width, kept by the resize observer so the loop never reads layout. */
  const widthRef = React.useRef(0);
  const geometry = React.useCallback(() => {
    const w = widthRef.current;
    const cw = Math.min(cardWidth, w * 0.72 || cardWidth);
    const pitch = cw + gap;
    const row = n * cw + (n - 1) * gap;
    const min =
      align === "center" ? -(n - 1) * pitch : Math.min(0, w - 2 * PAD - row);
    return { w, cw, pitch, min };
  }, [align, cardWidth, gap, n]);

  /** Where the row rests for card i. */
  const restFor = React.useCallback(
    (i: number) => {
      const g = geometry();
      return Math.max(g.min, -i * g.pitch);
    },
    [geometry],
  );

  const live = React.useRef({
    skew,
    stiffness,
    maxLean,
    spread,
    motionSafe,
    streaks,
    gap,
    align,
  });
  React.useEffect(() => {
    live.current = {
      skew,
      stiffness,
      maxLean,
      spread,
      motionSafe,
      streaks,
      gap,
      align,
    };
  });

  /** Called when the row comes to rest; reconciles with a host that refused the change. */
  const settled = React.useRef(() => {});

  /** Glide or snap to card i; reduced motion finishes on a short tween or jumps. */
  const travel = React.useCallback(
    (i: number, how: "glide" | "snap" | "jump", velocity = 0) => {
      running.current?.stop();
      const to = r2(restFor(i));
      const rest = () => settled.current();
      if (!live.current.motionSafe) {
        if (how === "jump") {
          offset.jump(to);
          animate(dip, [0.55, 1], {
            duration: durations.base,
            ease: easings.enter,
          });
          rest();
          return;
        }
        running.current = animate(offset, to, {
          duration: durations.fast,
          ease: easings.enter,
          onComplete: rest,
        });
        return;
      }
      const spring = how === "snap" ? springs.snap : springs.glide;
      running.current = animate(offset, to, {
        ...spring,
        velocity,
        onComplete: rest,
      });
      loop.current?.wake();
    },
    [dip, offset, restFor],
  );

  // The one loop: the row's speed sets every card's lean target, and each
  // lean follows on its own spring. It runs only while something moves.
  React.useEffect(() => {
    let frame = 0;
    let last = 0;
    let speed = 0;
    let disposed = false;
    const vel = new Float32Array(leans.length);
    const pos = new Float32Array(leans.length);
    const tick = (now: number) => {
      frame = 0;
      if (disposed) return;
      const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
      last = now;
      const k = live.current;
      const raw = offset.getVelocity();
      speed += (raw - speed) * (1 - Math.exp(-dt * 18));
      const g = geometry();
      const dir = Math.sign(speed);
      const gain = keyed.current ? 0.5 : 1;
      const lean0 = k.motionSafe
        ? clamp(k.maxLean, 0, 40) *
          Math.tanh((speed * clamp(k.skew, 0, 2)) / 1400) *
          gain
        : 0;
      const base = clamp(k.stiffness, 60, 1600);
      const origin = k.align === "center" ? g.w / 2 - g.cw / 2 : PAD;
      const x0 = offset.get();
      let moving = Math.abs(speed) > 2 || dragging.current;
      for (let i = 0; i < leans.length; i += 1) {
        // Where the card stands in the view: the leading side takes the wind.
        const centre = origin + i * g.pitch + x0 + g.cw / 2;
        const s = g.w > 0 ? clamp((centre - g.w / 2) / (g.w / 2), -1, 1) : 0;
        const weight = 1 - clamp01(k.spread) * ((1 - dir * s) / 2);
        const target = lean0 * weight;
        const stiff = base * (0.85 + 0.3 * weight);
        const damp = 2 * 0.53 * Math.sqrt(stiff);
        let x = pos[i] ?? 0;
        let v = vel[i] ?? 0;
        let left = dt;
        while (left > 1e-6) {
          const h = Math.min(1 / 240, left);
          left -= h;
          v += (stiff * (target - x) - damp * v) * h;
          x += v * h;
        }
        if (!k.motionSafe) {
          x = 0;
          v = 0;
        }
        pos[i] = x;
        vel[i] = v;
        if (Math.abs(x) > 0.02 || Math.abs(v) > 0.05) moving = true;
        leans[i]?.set(r2(x));
      }
      // Wind lines drift against the travel and show only at speed.
      const show = k.streaks && k.motionSafe;
      const alpha = show ? clamp01((Math.abs(speed) - 160) / 1500) * 0.6 : 0;
      for (let j = 0; j < STREAKS.length; j += 1) {
        const el = streakRefs.current[j];
        const s = STREAKS[j];
        if (!el || !s) continue;
        const span = g.w + 160;
        const at =
          ((((s.x * span - x0 * (0.4 + s.k)) % span) + span) % span) - 80;
        el.style.transform = `translate3d(${r2(at)}px, 0, 0)`;
        el.style.opacity = String(r3(alpha * s.k));
      }
      if (moving) frame = window.requestAnimationFrame(tick);
      else {
        last = 0;
        speed = 0;
        keyed.current = false;
      }
    };
    const wake = () => {
      if (disposed || frame) return;
      frame = window.requestAnimationFrame(tick);
    };
    loop.current = { wake };
    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (loop.current?.wake === wake) loop.current = null;
      // Leave the cards upright for whoever mounts next.
      for (const l of leans) l.jump(0);
    };
  }, [geometry, leans, offset]);

  useMotionValueEvent(offset, "change", () => loop.current?.wake());

  const commit = (i: number) => {
    const next = clamp(i, 0, n - 1);
    heading.current = next;
    const card = list[next];
    setSaid(`${card?.caption ?? card?.alt ?? ""}, ${next + 1} of ${n}.`);
    if (next === current) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  // A controlled host that did not take the new card gets its own card back.
  React.useEffect(() => {
    settled.current = () => {
      if (dragging.current || heading.current === current) return;
      heading.current = current;
      travel(current, "glide");
    };
  });

  // A host that changes `value` brings that card in on glide.
  React.useEffect(() => {
    if (dragging.current || heading.current === current) return;
    heading.current = current;
    travel(current, "glide");
  }, [current, travel]);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        widthRef.current = node.clientWidth;
        setWidth(node.clientWidth);
        if (dragging.current) return;
        running.current?.stop();
        offset.jump(r2(restFor(heading.current)));
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [offset, restFor],
  );

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      running.current?.stop();
      dragging.current = true;
      keyed.current = false;
      grab.current = offset.get();
      loop.current?.wake();
    },
    onMove: ({ offset: o }) => {
      const g = geometry();
      offset.set(r2(rubberClamp(grab.current + o.x, g.min, 0, g.w * 0.5)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const g = geometry();
      const rate = lerp(0.998, 0.99, clamp01(friction));
      const landing = project(offset.get(), velocity.x, rate);
      const i = clamp(Math.round(-landing / g.pitch), 0, n - 1);
      commit(i);
      travel(i, "glide", velocity.x);
    },
    onCancel: () => {
      dragging.current = false;
      travel(heading.current, "glide");
    },
    onTap: (event) => {
      const el = (event.target as Element).closest?.("[data-card]");
      const i = el ? Number(el.getAttribute("data-card")) : NaN;
      if (!Number.isFinite(i) || i === heading.current) return;
      commit(i);
      travel(i, "glide");
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const at = heading.current;
    let to: number | null = null;
    if (event.key === "ArrowRight") to = at + 1;
    else if (event.key === "ArrowLeft") to = at - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to === null) return;
    event.preventDefault();
    to = clamp(to, 0, n - 1);
    if (to === at) return;
    const step = Math.abs(to - at) === 1;
    keyed.current = step;
    commit(to);
    travel(to, live.current.motionSafe ? (step ? "snap" : "glide") : "jump");
  };

  // Cards wholly outside the row are hidden from assistive technology.
  const g = { cw: Math.min(cardWidth, width * 0.72 || cardWidth) };
  const pitch = g.cw + gap;
  const restAt =
    width > 0
      ? align === "center"
        ? -current * pitch
        : Math.max(
            Math.min(0, width - 2 * PAD - (n * g.cw + (n - 1) * gap)),
            -current * pitch,
          )
      : 0;
  const originX = align === "center" ? width / 2 - g.cw / 2 : PAD;
  const hiddenAt = (i: number) => {
    if (width === 0) return false;
    const left = originX + i * pitch + restAt;
    return left + g.cw < 0 || left > width;
  };

  const height = `calc(var(--cw) * ${r3(aspect)} + ${FLOOR + TOP}px)`;

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/headwind-cards [container-type:inline-size] relative w-full overflow-clip rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        !disabled && "cursor-grab touch-pan-y active:cursor-grabbing",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        className="relative"
        style={
          {
            "--cw": `min(${Math.round(cardWidth)}px, 72cqw)`,
            height,
            // Soft edges say the row goes on past them.
            maskImage:
              "linear-gradient(90deg, transparent, black 12px, black calc(100% - 28px), transparent)",
          } as React.CSSProperties
        }
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-hairline-strong"
          style={{ bottom: FLOOR }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0"
          style={{ top: TOP, bottom: FLOOR }}
        >
          {STREAKS.map((s, j) => (
            <span
              key={j}
              ref={(node) => {
                streakRefs.current[j] = node;
              }}
              className="absolute left-0 h-px rounded-full opacity-0"
              style={{
                top: `${s.y * 100}%`,
                width: s.w,
                backgroundImage:
                  "linear-gradient(90deg, transparent, var(--ink-3), transparent)",
              }}
            />
          ))}
        </div>
        <motion.div
          className="absolute"
          style={{
            left: align === "center" ? "calc(50% - var(--cw) / 2)" : PAD,
            right: 0,
            top: TOP,
            bottom: FLOOR,
            x: offset,
            opacity: dip,
          }}
        >
          {list.map((card, i) => (
            <Card
              key={i}
              card={card}
              index={i}
              count={n}
              gap={gap}
              aspect={aspect}
              lean={leans[i] ?? dip}
              current={i === current}
              hidden={hiddenAt(i)}
            />
          ))}
        </motion.div>
      </div>
      <p id={hintId} className="sr-only">
        Drag the row, or use the arrow keys to step one card at a time. Home and
        End go to the first and last card.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
