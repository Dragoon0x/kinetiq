"use client";

import * as React from "react";

import {
  Bell,
  Check,
  ChevronDown,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  Star,
  TriangleAlert,
  Truck,
  ZoomIn,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type ProductVariantsStyle = "swatches" | "tiles" | "chips";
export type ProductStatus = "ready" | "loading" | "error";

export type ProductColour = {
  id: string;
  /** The colour's name, as the shop says it: "Ember". */
  name: string;
  /** The colour itself, any CSS colour. A pigment: give it a fixed lightness so it reads the same in both themes. */
  swatch: string;
  /** Added to the price in this colour; negative for a colour on sale. @default 0 */
  priceDelta?: number;
  /** Nothing left in this colour, whatever the size. */
  soldOut?: boolean;
};

export type ProductSize = {
  id: string;
  /** "12 oz" */
  label: string;
  /** A quieter second line: "350 ml". */
  detail?: string;
  /** Added to the price in this size. @default 0 */
  priceDelta?: number;
  /** Units left. 0 is sold out; leave it out for plenty. */
  stock?: number;
  /** How large the pictures draw this size, relative to 1. @default 1 */
  scale?: number;
  /** The size chosen first when nothing else is asked for. */
  featured?: boolean;
};

export type ProductVariant = { colour: ProductColour; size: ProductSize };

export type ProductView = {
  id: string;
  /** Names the picture: the thumbnail's accessible name. */
  label: string;
  /** The picture, square, for a colour and size. It is drawn again inside the loupe at its power, so vector art stays sharp. */
  render: (variant: ProductVariant) => React.ReactNode;
  /** A close-up: the size's scale does not apply. */
  fixed?: boolean;
};

export type ProductDetailSection = {
  id: string;
  title: string;
  body: React.ReactNode;
};

export type ProductInfo = {
  id: string;
  brand: string;
  name: string;
  /** A short line over the name: "Thrown by hand". */
  badge?: string;
  /** One or two sentences under the price. */
  summary?: string;
  /** The base price in the currency's major unit (32 is €32.00). */
  price: number;
  /** A price it used to be, struck through when above the current one. */
  compareAt?: number;
  rating?: { value: number; count: number };
  colours: ProductColour[];
  sizes: ProductSize[];
  views: ProductView[];
  /** Combinations with nothing left, as "colourId:sizeId". */
  unavailable?: string[];
  sections?: ProductDetailSection[];
};

export type ProductSelection = { colour: string; size: string };

export type DeliveryEstimate = {
  /** The answer in a few words: "Arrives Thu 8 Oct". */
  label: string;
  /** A quieter line: the window, a cut-off, the cost. */
  detail?: string;
};

export type ProductDetailProps = {
  /** The product: its colours, sizes, pictures and details. @default defaultProduct */
  product?: ProductInfo;
  /** Controlled colour and size. */
  value?: ProductSelection;
  /** Initial colour and size when uncontrolled. @default the first colour that has the featured size */
  defaultValue?: ProductSelection;
  /** Fires from the swatch, tile or size the visitor chose, with the new selection. */
  onValueChange?: (selection: ProductSelection) => void;
  /** Controlled count in the bag for the selected variant. */
  quantity?: number;
  /** Initial count in the bag for the first selection when uncontrolled. @default 0 */
  defaultQuantity?: number;
  /** Fires from Add to bag and the stepper with the new count and the variant it is for. */
  onQuantityChange?: (quantity: number, selection: ProductSelection) => void;
  /** Add to bag was pressed. Return a promise to hold the button pending; a rejection's message is shown. */
  onAdd?: (selection: ProductSelection) => void | Promise<void>;
  /** Notify me was pressed on a sold-out variant. */
  onNotify?: (selection: ProductSelection) => void;
  /** Controlled picture index. */
  view?: number;
  /** Initial picture when uncontrolled. @default 0 */
  defaultView?: number;
  /** Fires from the drag, thumbnail or key that changed the picture. */
  onViewChange?: (index: number) => void;
  /** Answers a postcode with a delivery estimate, now or as a promise. @default defaultEstimate */
  estimate?: (
    postcode: string,
    now: number,
  ) => DeliveryEstimate | null | Promise<DeliveryEstimate | null>;
  /** A postcode already known; its estimate shows from the start. */
  defaultPostcode?: string;
  /** Fires with each checked postcode and its answer (null: no delivery there). */
  onEstimate?: (postcode: string, estimate: DeliveryEstimate | null) => void;
  /** The moment estimates count from. Never read from the clock during render. @default 2 Oct 2026, 09:30 UTC */
  now?: Date | number;
  /** The most one variant can have in the bag; never more than its stock. @default 10 */
  maxQuantity?: number;
  /** The loupe's power, 1.5 to 4. @default 2.5 */
  lens?: number;
  /** How colours are offered: glaze dots, little pictures, or named pills. @default "swatches" */
  variants?: ProductVariantsStyle;
  /** Dock a buy bar at the bottom of the scroll box while the buy row is out of it, and pin the pictures beside the details. @default true */
  sticky?: boolean;
  /** Formats an amount for display. @default euros */
  format?: (amount: number) => string;
  /** The buy button's words. @default "Add to bag" */
  addLabel?: string;
  /** Loading draws placeholders; error offers Retry. @default "ready" */
  status?: ProductStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** The region's accessible name when it should differ from the product's name. */
  label?: string;
  /** Play the picks and the add. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the product but takes no input. */
  disabled?: boolean;
  className?: string;
};

/* -------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r6 = (v: number) => Number(v.toFixed(6));
const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const cents = (v: number) => Math.round(v * 100) / 100;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const EURO = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});
const euro = (amount: number) => EURO.format(cents(amount));

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same speckle on the server and in the browser. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isPromise = <T,>(v: unknown): v is Promise<T> =>
  !!v && typeof (v as { then?: unknown }).then === "function";

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : fallback;

/* ------------------------------ default art ------------------------------ */

/*
 * The default product is drawn, not fetched: a speckled stoneware mug in a
 * 400 × 400 box. No gradients and no clip paths, so nothing needs an id — a
 * copy drawn inside the loupe or a hidden thumbnail can never break the one
 * on show. Shading is flat translucent shapes; the speckle is seeded.
 */
const CLAY = "oklch(0.8 0.035 70)";
const CLAY_DARK = "oklch(0.6 0.035 62)";
const IRON = "oklch(0.3 0.035 50)";
const COFFEE = "oklch(0.33 0.045 52)";
const CREMA = "oklch(0.56 0.07 62)";

type Pt = readonly [number, number];

const line = (pts: readonly Pt[]) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"} ${r2(x)} ${r2(y)}`).join(" ");

/** A smooth run through points: quadratic curves between midpoints. */
function smooth(pts: readonly Pt[]): string {
  const first = pts[0];
  if (!first) return "";
  let d = `M ${r2(first[0])} ${r2(first[1])}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const p = pts[i];
    const q = pts[i + 1];
    if (!p || !q) continue;
    d += ` Q ${r2(p[0])} ${r2(p[1])} ${r2((p[0] + q[0]) / 2)} ${r2((p[1] + q[1]) / 2)}`;
  }
  const last = pts[pts.length - 1];
  if (last && pts.length > 1) d += ` L ${r2(last[0])} ${r2(last[1])}`;
  return d;
}

type Dot = { x: number; y: number; r: number; o?: number };

/**
 * Many small dots as one path per opacity band: a speckle of sixty is one
 * node, not sixty, which matters when the art is drawn ten times over.
 */
function Dots({
  dots,
  fill,
  bands,
}: {
  dots: Dot[];
  fill: string;
  bands: number[];
}) {
  const runs = bands.map(() => [] as string[]);
  for (const d of dots) {
    const o = d.o ?? bands[0] ?? 1;
    let at = 0;
    bands.forEach((b, i) => {
      if (Math.abs(b - o) < Math.abs((bands[at] ?? 0) - o)) at = i;
    });
    // A tenth of a unit in a 400-unit picture is finer than any screen.
    const r = r1(d.r);
    runs[at]?.push(
      `M${r1(d.x - r)} ${r1(d.y)}a${r} ${r} 0 1 0 ${r1(2 * r)} 0a${r} ${r} 0 1 0 ${r1(-2 * r)} 0`,
    );
  }
  return (
    <>
      {runs.map((run, i) =>
        run.length > 0 ? (
          <path key={i} d={run.join("")} fill={fill} opacity={bands[i]} />
        ) : null,
      )}
    </>
  );
}

function MugFront({
  cx,
  foot,
  s,
  glaze,
  seed,
}: {
  cx: number;
  foot: number;
  s: number;
  glaze: string;
  seed: number;
}) {
  const rand = seeded(seed);
  const top = foot - 196 * s;
  const ht = 84 * s;
  const hf = 78 * s;
  const rad = 10 * s;
  const w = (y: number) => ht + ((hf - ht) * (y - top)) / (foot - top);
  const dripY = foot - 34 * s;

  const body = `M ${r2(cx - ht)} ${r2(top)} L ${r2(cx - hf)} ${r2(foot - rad)} Q ${r2(cx - hf)} ${r2(foot)} ${r2(cx - hf + rad)} ${r2(foot)} L ${r2(cx + hf - rad)} ${r2(foot)} Q ${r2(cx + hf)} ${r2(foot)} ${r2(cx + hf)} ${r2(foot - rad)} L ${r2(cx + ht)} ${r2(top)} Z`;

  // The glaze stops in a wavering line above the foot, with a few drips.
  const drip: Pt[] = [];
  const steps = 16;
  const edge = w(dripY);
  for (let i = 0; i <= steps; i += 1) {
    const x = cx - edge + (2 * edge * i) / steps;
    const run = i > 0 && i < steps && rand() < 0.26 ? (6 + rand() * 9) * s : 0;
    drip.push([x, dripY + Math.sin(i * 1.9 + seed) * 2.6 * s + run]);
  }
  const lastDrip = drip[drip.length - 1] ?? [cx + edge, dripY];
  const clay = `${smooth(drip)} L ${r2(lastDrip[0])} ${r2(dripY)} L ${r2(cx + hf)} ${r2(foot - rad)} Q ${r2(cx + hf)} ${r2(foot)} ${r2(cx + hf - rad)} ${r2(foot)} L ${r2(cx - hf + rad)} ${r2(foot)} Q ${r2(cx - hf)} ${r2(foot)} ${r2(cx - hf)} ${r2(foot - rad)} Z`;

  const band = (from: number, to: number): Pt[] => [
    [cx + from * ht, top],
    [cx + to * ht, top],
    [cx + to * hf, foot - 1.5 * s],
    [cx + from * hf, foot - 1.5 * s],
  ];

  const specks: { x: number; y: number; r: number; o: number }[] = [];
  // Fewer specks on a smaller mug: the same density, not the same count.
  const count = Math.round(64 * s * s);
  for (let i = 0; i < count; i += 1) {
    const y = top + 16 * s + rand() * (dripY - top - 20 * s);
    const half = w(y) - 4 * s;
    specks.push({
      x: r2(cx - half + rand() * 2 * half),
      y: r2(y),
      r: r2((0.6 + rand() * 1.5) * s),
      o: r2(0.3 + rand() * 0.55),
    });
  }
  const grains: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < Math.round(22 * s); i += 1) {
    const y = dripY + 6 * s + rand() * (foot - dripY - 10 * s);
    const half = hf - 5 * s;
    grains.push({
      x: r2(cx - half + rand() * 2 * half),
      y: r2(y),
      r: r2((0.6 + rand() * 0.8) * s),
    });
  }

  const hy1 = top + 40 * s;
  const hy2 = top + 150 * s;
  const handle = `M ${r2(cx + w(hy1) - 6 * s)} ${r2(hy1)} C ${r2(cx + ht + 64 * s)} ${r2(hy1 - 12 * s)} ${r2(cx + ht + 68 * s)} ${r2(hy2 + 6 * s)} ${r2(cx + w(hy2) - 6 * s)} ${r2(hy2)}`;

  return (
    <g>
      <ellipse
        cx={r2(cx + 8 * s)}
        cy={r2(foot + 3 * s)}
        rx={r2(hf + 34 * s)}
        ry={r2(9 * s)}
        fill="black"
        opacity={0.13}
      />
      <path
        d={handle}
        fill="none"
        stroke={glaze}
        strokeWidth={r2(21 * s)}
        strokeLinecap="round"
      />
      <path
        d={handle}
        fill="none"
        stroke="black"
        strokeOpacity={0.12}
        strokeWidth={r2(21 * s)}
        strokeLinecap="round"
      />
      <path
        d={handle}
        fill="none"
        stroke="white"
        strokeOpacity={0.3}
        strokeWidth={r2(3.5 * s)}
        strokeLinecap="round"
        transform={`translate(${r2(-2 * s)} ${r2(-4 * s)})`}
      />
      <path d={body} fill={glaze} />
      <Dots dots={specks} fill={IRON} bands={[0.4, 0.6, 0.8]} />
      <path d={clay} fill={CLAY} />
      <Dots dots={grains} fill={CLAY_DARK} bands={[0.5]} />
      <path
        d={smooth(drip)}
        fill="none"
        stroke="black"
        strokeOpacity={0.16}
        strokeWidth={r2(2 * s)}
      />
      <path d={`${line(band(0.34, 1))} Z`} fill="black" opacity={0.1} />
      <path d={`${line(band(0.72, 1))} Z`} fill="black" opacity={0.1} />
      <path d={`${line(band(-0.74, -0.5))} Z`} fill="white" opacity={0.18} />
      <path d={`${line(band(-0.67, -0.6))} Z`} fill="white" opacity={0.2} />
      <ellipse
        cx={r2(cx)}
        cy={r2(top)}
        rx={r2(ht)}
        ry={r2(12 * s)}
        fill={glaze}
      />
      <ellipse
        cx={r2(cx)}
        cy={r2(top + 1.5 * s)}
        rx={r2(ht - 7 * s)}
        ry={r2(8.5 * s)}
        fill="black"
        opacity={0.3}
      />
      <ellipse
        cx={r2(cx)}
        cy={r2(top)}
        rx={r2(ht - 1.5 * s)}
        ry={r2(11 * s)}
        fill="none"
        stroke="white"
        strokeOpacity={0.4}
        strokeWidth={r2(1.4 * s)}
      />
    </g>
  );
}

function MugTop({ glaze, seed }: { glaze: string; seed: number }) {
  const rand = seeded(seed);
  const cx = 192;
  const cy = 200;
  const specks: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < 70; i += 1) {
    const a = rand() * Math.PI * 2;
    const inner = rand() < 0.55;
    const d = inner ? 86 + rand() * 9 : 99 + rand() * 11;
    specks.push({
      x: r2(cx + Math.cos(a) * d),
      y: r2(cy + Math.sin(a) * d),
      r: r2(0.7 + rand() * 1.5),
      o: r2(0.3 + rand() * 0.5),
    });
  }
  const arc = (r: number, from: number, to: number) => {
    const p = (deg: number): Pt => [
      cx + r * Math.cos((deg * Math.PI) / 180),
      cy + r * Math.sin((deg * Math.PI) / 180),
    ];
    const [x1, y1] = p(from);
    const [x2, y2] = p(to);
    return `M ${r2(x1)} ${r2(y1)} A ${r} ${r} 0 0 1 ${r2(x2)} ${r2(y2)}`;
  };
  return (
    <g>
      <circle cx={cx + 10} cy={cy + 12} r={118} fill="black" opacity={0.1} />
      <rect x={292} y={184} width={66} height={32} rx={15} fill={glaze} />
      <rect
        x={292}
        y={200}
        width={66}
        height={16}
        rx={8}
        fill="black"
        opacity={0.12}
      />
      <circle cx={cx} cy={cy} r={112} fill={glaze} />
      <path
        d={arc(108, 200, 290)}
        fill="none"
        stroke="white"
        strokeOpacity={0.35}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={97} fill={glaze} />
      <circle cx={cx} cy={cy} r={97} fill="black" opacity={0.26} />
      <circle cx={cx} cy={cy} r={84} fill={COFFEE} />
      <circle
        cx={cx}
        cy={cy}
        r={83}
        fill="none"
        stroke={CREMA}
        strokeOpacity={0.55}
        strokeWidth={4}
      />
      <ellipse
        cx={cx - 22}
        cy={cy - 26}
        rx={38}
        ry={15}
        fill="white"
        opacity={0.1}
        transform={`rotate(-28 ${cx - 22} ${cy - 26})`}
      />
      <Dots dots={specks} fill={IRON} bands={[0.4, 0.6, 0.8]} />
    </g>
  );
}

function MugDetail({ glaze, seed }: { glaze: string; seed: number }) {
  const rand = seeded(seed);
  const edge: Pt[] = [];
  for (let i = 0; i <= 14; i += 1) {
    const x = -10 + (420 * i) / 14;
    const run = i > 0 && i < 14 && rand() < 0.3 ? 18 + rand() * 46 : 0;
    edge.push([x, 226 + Math.sin(i * 1.3 + seed) * 7 + run]);
  }
  const glazeShape = `M -10 -10 L 410 -10 L 410 ${r2(edge[edge.length - 1]?.[1] ?? 226)} ${smooth([...edge].reverse()).replace(/^M/, "L")} Z`;
  const specks: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < 64; i += 1) {
    specks.push({
      x: r2(rand() * 400),
      y: r2(rand() * 214),
      r: r2(1.1 + rand() * 3.6),
      o: r2(0.3 + rand() * 0.55),
    });
  }
  const grains: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < 96; i += 1) {
    grains.push({
      x: r2(rand() * 400),
      y: r2(240 + rand() * 160),
      r: r2(0.8 + rand() * 1.8),
      o: r2(0.25 + rand() * 0.4),
    });
  }
  return (
    <g>
      <rect x={0} y={0} width={400} height={400} fill={CLAY} />
      <Dots dots={grains} fill={CLAY_DARK} bands={[0.3, 0.5]} />
      <g opacity={0.75}>
        <circle
          cx={300}
          cy={328}
          r={28}
          fill="none"
          stroke={CLAY_DARK}
          strokeWidth={3}
        />
        <circle
          cx={300}
          cy={328}
          r={22}
          fill="none"
          stroke={CLAY_DARK}
          strokeWidth={1}
        />
        <text
          x={300}
          y={336}
          textAnchor="middle"
          fontSize={21}
          fontWeight={600}
          fill={CLAY_DARK}
        >
          FW
        </text>
      </g>
      <path d={glazeShape} fill={glaze} />
      <Dots dots={specks} fill={IRON} bands={[0.4, 0.6, 0.8]} />
      <path
        d="M -10 60 L 410 -40 L 410 40 L -10 150 Z"
        fill="white"
        opacity={0.12}
      />
      <path
        d={smooth(edge)}
        fill="none"
        stroke="black"
        strokeOpacity={0.2}
        strokeWidth={4}
      />
      <path
        d="M 300 -10 L 410 -10 L 410 330 L 340 330 Z"
        fill="black"
        opacity={0.08}
      />
    </g>
  );
}

const MUG_SEED = { front: 11, top: 23, detail: 37, pair: 53 };

function MugArt({
  kind,
  glaze,
}: {
  kind: "front" | "top" | "detail" | "pair";
  glaze: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      className="block size-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {kind === "front" ? (
        <MugFront
          cx={188}
          foot={312}
          s={1}
          glaze={glaze}
          seed={MUG_SEED.front}
        />
      ) : kind === "top" ? (
        <MugTop glaze={glaze} seed={MUG_SEED.top} />
      ) : kind === "detail" ? (
        <MugDetail glaze={glaze} seed={MUG_SEED.detail} />
      ) : (
        <>
          <MugFront
            cx={122}
            foot={298}
            s={0.72}
            glaze={glaze}
            seed={MUG_SEED.pair}
          />
          <MugFront
            cx={252}
            foot={320}
            s={0.9}
            glaze={glaze}
            seed={MUG_SEED.pair + 1}
          />
        </>
      )}
    </svg>
  );
}

/* -------------------------------- defaults ------------------------------- */

const DEFAULT_NOW = Date.UTC(2026, 9, 2, 9, 30);

export const defaultProduct: ProductInfo = {
  id: "field-mug",
  brand: "Fernworks Studio Pottery",
  name: "Field Mug",
  badge: "Thrown by hand",
  summary:
    "Iron-speckled stoneware with a glaze that pools at the foot. Every mug is thrown, trimmed and dipped by hand, so no two speckle alike.",
  price: 32,
  rating: { value: 4.8, count: 212 },
  colours: [
    { id: "ember", name: "Ember", swatch: "oklch(0.62 0.13 42)" },
    { id: "moss", name: "Moss", swatch: "oklch(0.62 0.07 138)" },
    {
      id: "slate",
      name: "Slate",
      swatch: "oklch(0.5 0.035 248)",
      priceDelta: -4,
    },
    { id: "bone", name: "Bone", swatch: "oklch(0.91 0.02 85)" },
  ],
  sizes: [
    {
      id: "8oz",
      label: "8 oz",
      detail: "240 ml",
      priceDelta: -4,
      scale: 0.84,
    },
    { id: "12oz", label: "12 oz", detail: "350 ml", scale: 1, featured: true },
    {
      id: "16oz",
      label: "16 oz",
      detail: "470 ml",
      priceDelta: 4,
      stock: 3,
      scale: 1.12,
    },
  ],
  unavailable: ["bone:16oz"],
  views: [
    {
      id: "front",
      label: "Front",
      render: ({ colour }) => <MugArt kind="front" glaze={colour.swatch} />,
    },
    {
      id: "top",
      label: "From above",
      render: ({ colour }) => <MugArt kind="top" glaze={colour.swatch} />,
    },
    {
      id: "detail",
      label: "Glaze and foot",
      fixed: true,
      render: ({ colour }) => <MugArt kind="detail" glaze={colour.swatch} />,
    },
    {
      id: "pair",
      label: "A pair",
      fixed: true,
      render: ({ colour }) => <MugArt kind="pair" glaze={colour.swatch} />,
    },
  ],
  sections: [
    {
      id: "details",
      title: "Details",
      body: (
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>Thrown, trimmed and dipped by hand in the Fernworks studio.</li>
          <li>Iron-speckled stoneware, fired once to 1260 °C.</li>
          <li>8 oz holds 240 ml, 12 oz 350 ml, 16 oz 470 ml.</li>
        </ul>
      ),
    },
    {
      id: "care",
      title: "Materials and care",
      body: (
        <p>
          Dishwasher and microwave safe. The foot is left raw so it grips the
          table; let it dry before stacking. The glaze pools differently on
          every mug.
        </p>
      ),
    },
    {
      id: "delivery",
      title: "Delivery and returns",
      body: (
        <p>
          Packed in a recycled pulp cradle and sent within two working days.
          Free delivery over €60, otherwise €4.95. Return it unused within 30
          days, free.
        </p>
      ),
    },
  ],
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY_MS = 86_400_000;
/** Orders placed before this hour (UTC) leave the same working day. */
const CUTOFF_HOUR = 16;

const isWorkday = (ms: number) => {
  const d = new Date(ms).getUTCDay();
  return d !== 0 && d !== 6;
};
const addWorkdays = (ms: number, n: number) => {
  let t = ms;
  let left = n;
  while (left > 0) {
    t += DAY_MS;
    if (isWorkday(t)) left -= 1;
  }
  return t;
};
const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const rangeOf = (a: number, b: number) => {
  const x = new Date(a);
  const y = new Date(b);
  return x.getUTCMonth() === y.getUTCMonth()
    ? `${DAYS[x.getUTCDay()]} ${x.getUTCDate()} – ${dayOf(b)}`
    : `${dayOf(a)} – ${dayOf(b)}`;
};

/**
 * The default answer to a postcode: two to four working days, read from a
 * hash of the code so the same postcode always gets the same date, counted
 * from `now` and from the day's dispatch cut-off.
 */
export function defaultEstimate(
  postcode: string,
  now: number,
): DeliveryEstimate {
  const code = postcode.toUpperCase().replace(/\s+/g, "");
  const days = 2 + (hash(code) % 3);
  const at = new Date(now);
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  const today = isWorkday(now) && minutes < CUTOFF_HOUR * 60;
  const start = addWorkdays(now, days + (today ? 0 : 1));
  const end = addWorkdays(start, 2);
  const left = CUTOFF_HOUR * 60 - minutes;
  const window = `${rangeOf(start, end)} at the latest`;
  return {
    label: `Arrives ${dayOf(start)}`,
    detail: today
      ? `Order in the next ${Math.floor(left / 60)} h ${left % 60} min to send it today · ${window}`
      : `Sent next working day · ${window}`,
  };
}

const POSTCODE = /^[a-z0-9][a-z0-9 -]{1,8}[a-z0-9]$/i;
const tidyPostcode = (p: string) => p.trim().toUpperCase().replace(/\s+/g, " ");

/* ------------------------------- primitives ------------------------------ */

const DIGITS = Array.from({ length: 10 }, (_, n) => n);

/** One digit as a column of 0–9 that rolls to its value on snap. */
function Digit({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span
      className="relative inline-block overflow-clip"
      style={{ height: "1.2em", lineHeight: "1.2em" }}
    >
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-value * 10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((n) => (
          <span
            key={n}
            className="block"
            style={{ height: "1.2em", lineHeight: "1.2em" }}
          >
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * A figure whose digits roll. Columns are keyed from the right so the units
 * stay the units, and the widest figure it will show is reserved in the same
 * cell, so a new digit never shifts what sits beside it.
 */
function Roll({
  text,
  widest,
  motionSafe,
  className,
  align = "start",
}: {
  text: string;
  widest?: string;
  motionSafe: boolean;
  className?: string;
  align?: "start" | "end";
}) {
  const chars = [...text];
  const room = widest && widest.length > text.length ? widest : text;
  return (
    <span className={cn("inline-grid tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 whitespace-pre"
        style={{ lineHeight: "1.2em" }}
      >
        {room}
      </span>
      <span
        aria-hidden
        className={cn(
          "col-start-1 row-start-1 inline-flex whitespace-pre",
          align === "end" ? "justify-self-end" : "justify-self-start",
        )}
        style={{ lineHeight: "1.2em" }}
      >
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          return ch >= "0" && ch <= "9" ? (
            <Digit
              key={`d${fromRight}`}
              value={Number(ch)}
              motionSafe={motionSafe}
            />
          ) : (
            <span key={`c${fromRight}${ch}`} className="inline-block">
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = clamp(value - i, 0, 1);
        return (
          <span key={i} className="relative size-3.5 shrink-0">
            <Star className="absolute inset-0 size-3.5 fill-ink-3/25 stroke-none" />
            <span
              className="absolute inset-y-0 left-0 overflow-clip"
              style={{ width: `${Math.round(fill * 100)}%` }}
            >
              <Star className="size-3.5 fill-warn stroke-none" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* --------------------------------- art --------------------------------- */

/** A view drawn for a variant, standing on its size: the piece grows from its foot. */
function ViewArt({
  view,
  variant,
  motionSafe,
  floor = true,
}: {
  view: ProductView;
  variant: ProductVariant;
  motionSafe: boolean;
  floor?: boolean;
}) {
  const scale = view.fixed ? 1 : (variant.size.scale ?? 1);
  return (
    <div className="absolute inset-0">
      {floor ? (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[24%] bg-ink-3/[0.07]"
        />
      ) : null}
      <motion.div
        className="absolute inset-0"
        style={{ originX: 0.5, originY: 0.78 }}
        initial={false}
        animate={{ scale }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        {view.render(variant)}
      </motion.div>
    </div>
  );
}

/* -------------------------------- gallery -------------------------------- */

type LensVia = "hover" | "touch" | "key";

type GalleryProps = {
  uid: string;
  name: string;
  views: ProductView[];
  colour: ProductColour;
  size: ProductSize;
  /** The glaze being flooded over, while it is. */
  under: ProductColour | null;
  reveal: MotionValue<number>;
  floodX: MotionValue<number>;
  floodY: MotionValue<number>;
  index: number;
  onSelect: (index: number, via: "drag" | "thumb" | "key") => void;
  power: number;
  motionSafe: boolean;
  disabled: boolean;
  bindFrame: (node: HTMLDivElement | null) => void;
  onLensOpen: (el: Element | null) => void;
};

/** How far a touch loupe sits above the finger, so the finger never covers it. */
const LIFT = 64;

type GalleryApi = { glideTo: (i: number, velocity?: number) => void };

function Gallery({
  uid,
  name,
  views,
  colour,
  size,
  under,
  reveal,
  floodX,
  floodY,
  index,
  onSelect,
  power,
  motionSafe,
  disabled,
  bindFrame,
  onLensOpen,
}: GalleryProps) {
  const n = views.length;
  const frameId = `${uid}-frame`;
  const tabId = (i: number) => `${uid}-pic-${i}`;

  const pos = useMotionValue(index);
  const fade = useMotionValue(1);
  const target = React.useRef(index);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const [check, setCheck] = React.useState(0);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [frameNode, setFrameNode] = React.useState<HTMLDivElement | null>(null);
  const [frameW, setFrameW] = React.useState(0);
  const tabs = React.useRef(new Map<number, HTMLButtonElement>());
  const dragFrom = React.useRef(0);
  const dragW = React.useRef(1);
  const [dragging, setDragging] = React.useState(false);
  const [lensVia, setLensVia] = React.useState<LensVia | null>(null);
  // The magnified copy exists only while the loupe is on screen (or fading).
  const [lensLive, setLensLive] = React.useState(false);
  const touch = React.useRef<{
    id: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const api = React.useRef<GalleryApi | null>(null);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const lift = useMotionValue(0);
  const show = useMotionValue(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const glideTo = (i: number, velocity = 0) => {
    if (!motionSafe) {
      halt("pos");
      pos.jump(i);
      // An instant swap still reads as a change: the new picture fades up.
      fade.jump(0.35);
      run("fade", animate(fade, 1, { duration: durations.fast }));
      return;
    }
    run("pos", animate(pos, i, { ...springs.glide, velocity }));
  };

  /**
   * Asks for a picture. The strip heads there at once; if a host holding
   * `view` refuses, the check that follows its answer brings it back.
   */
  const select = (i: number, via: "drag" | "thumb" | "key", velocity = 0) => {
    const to = clamp(Math.round(i), 0, Math.max(0, n - 1));
    target.current = to;
    glideTo(to, velocity);
    if (to !== index) onSelect(to, via);
    React.startTransition(() => setCheck((c) => c + 1));
  };

  React.useEffect(() => {
    api.current = { glideTo };
  });

  React.useEffect(() => {
    if (target.current === index) return;
    target.current = index;
    api.current?.glideTo(index, pos.getVelocity());
  }, [index, check, pos]);

  React.useEffect(() => {
    const map = anims.current;
    return () => {
      for (const c of map.values()) c.stop();
      map.clear();
    };
  }, []);

  const setFrame = React.useCallback(
    (node: HTMLDivElement | null) => {
      frameRef.current = node;
      bindFrame(node);
      setFrameNode(node);
    },
    [bindFrame],
  );

  React.useEffect(() => {
    if (!frameNode) return;
    const ro = new ResizeObserver(() =>
      setFrameW(Math.round(frameNode.clientWidth)),
    );
    ro.observe(frameNode);
    return () => ro.disconnect();
  }, [frameNode]);

  /* -------------------------------- loupe -------------------------------- */

  const L = frameW > 0 && frameW < 300 ? 96 : 112;
  const p = clamp(power, 1.5, 4);

  const placeLens = (clientX: number, clientY: number, via: LensVia) => {
    const f = frameRef.current;
    if (!f) return;
    const r = f.getBoundingClientRect();
    const x = clamp(clientX - r.left, 0, r.width);
    const y = clamp(clientY - r.top, 0, r.height);
    halt("px");
    halt("py");
    px.set(r2(x));
    py.set(r2(y));
    // Under the finger it would be hidden: it rides above, or below near the top.
    lift.jump(via === "touch" ? (y - LIFT - L / 2 < -L / 4 ? LIFT : -LIFT) : 0);
  };

  const openLens = (via: LensVia, clientX?: number, clientY?: number) => {
    if (disabled) return;
    if (clientX !== undefined && clientY !== undefined) {
      placeLens(clientX, clientY, via);
    } else {
      const w = frameRef.current?.clientWidth ?? frameW;
      px.jump(r2(w / 2));
      py.jump(r2(w / 2));
      lift.jump(0);
    }
    setLensVia(via);
    setLensLive(true);
    run(
      "show",
      animate(
        show,
        1,
        motionSafe ? springs.snap : { duration: durations.fast },
      ),
    );
    if (via !== "hover") onLensOpen(frameRef.current);
  };

  const closeLens = () => {
    setLensVia(null);
    const c = animate(show, 0, {
      duration: durations.fast,
      ease: easings.exit,
    });
    run("show", c);
    void c.then(() => {
      if (show.get() < 0.01) setLensLive(false);
    });
  };

  const nudgeLens = (dx: number, dy: number) => {
    const f = frameRef.current;
    if (!f) return;
    const w = f.clientWidth;
    const h = f.clientHeight;
    const x = r2(clamp(px.get() + dx, 0, w));
    const y = r2(clamp(py.get() + dy, 0, h));
    lift.jump(0);
    if (!motionSafe) {
      px.set(x);
      py.set(y);
      return;
    }
    run("px", animate(px, x, springs.snap));
    run("py", animate(py, y, springs.snap));
  };

  const touchLens = lensVia === "touch";

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    // With one picture a drag has nowhere to go, but a tap still opens the loupe.
    disabled: disabled || touchLens,
    onStart: () => {
      halt("pos");
      dragFrom.current = pos.get();
      dragW.current = Math.max(1, frameRef.current?.clientWidth ?? 1);
      setDragging(true);
    },
    onMove: ({ offset }) => {
      const w = dragW.current;
      const raw = dragFrom.current * w - offset.x;
      pos.set(r6(rubberClamp(raw, 0, (n - 1) * w, w) / w));
    },
    onEnd: ({ velocity }) => {
      setDragging(false);
      const w = dragW.current;
      const landing = project(pos.get() * w, -velocity.x, 0.99) / w;
      // A throw moves one picture at most: the neighbour, never a skip.
      const from = Math.round(dragFrom.current);
      const to = clamp(Math.round(landing), from - 1, from + 1);
      select(to, "drag", r6(-velocity.x / w));
    },
    onCancel: () => {
      setDragging(false);
      glideTo(target.current);
    },
    onTap: (event) => {
      if (event.pointerType !== "touch") return;
      openLens("touch", event.clientX, event.clientY);
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerDown(event);
    if (touchLens && event.pointerType === "touch") {
      touch.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      placeLens(event.clientX, event.clientY, "touch");
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    const t = touch.current;
    if (touchLens && t && t.id === event.pointerId) {
      if (Math.hypot(event.clientX - t.x, event.clientY - t.y) > 6) {
        t.moved = true;
      }
      placeLens(event.clientX, event.clientY, "touch");
      return;
    }
    if (event.pointerType === "touch") return;
    if (lensVia === "hover" && !dragging) {
      placeLens(event.clientX, event.clientY, "hover");
    } else if (lensVia === null && event.buttons === 0 && !disabled) {
      openLens("hover", event.clientX, event.clientY);
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerUp(event);
    const t = touch.current;
    if (t && t.id === event.pointerId) {
      touch.current = null;
      // A tap with the loupe open puts it away; a drag leaves it where it is.
      if (!t.moved) closeLens();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const on = lensVia !== null;
    if (event.key === "Escape") {
      if (!on) return;
      // Handled here, where focus is; the page must not also see it.
      event.preventDefault();
      closeLens();
      return;
    }
    if (
      (event.key === "Enter" || event.key === " ") &&
      event.target === event.currentTarget
    ) {
      event.preventDefault();
      if (on) closeLens();
      else openLens("key");
      return;
    }
    const step = event.shiftKey ? 48 : 16;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    if (on) {
      event.preventDefault();
      if (lensVia !== "key") setLensVia("key");
      nudgeLens(move[0] * step, move[1] * step);
      return;
    }
    if (move[0] === 0) return;
    event.preventDefault();
    select(index + move[0], "key");
  };

  const onTabsKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: n - 1,
    };
    const to = keys[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = (to + n) % n;
    tabs.current.get(next)?.focus();
    select(next, "thumb");
  };

  /* -------------------------------- view --------------------------------- */

  const stripX = useTransform(pos, (v) => `${r2(-v * 100)}%`);
  const floodClip = useTransform(
    [reveal, floodX, floodY] as MotionValue<number>[],
    ([r = 1, x = 100, y = 50]: number[]) =>
      r >= 0.999
        ? "none"
        : `circle(${r2(Math.max(0, r) * 150)}% at ${r2(x)}% ${r2(y)}%)`,
  );
  const lensX = useTransform(px, (x) => r2(x - L / 2));
  const lensY = useTransform(
    [py, lift] as MotionValue<number>[],
    ([y = 0, l = 0]: number[]) => r2(y + l - L / 2),
  );
  const innerX = useTransform(px, (x) => r2(L / 2 - x * p));
  const innerY = useTransform(py, (y) => r2(L / 2 - y * p));
  const lensScale = useTransform(show, (s) =>
    motionSafe ? r2(0.6 + 0.4 * s) : 1,
  );

  const current = views[index];
  const strip = (glaze: ProductColour, top: boolean) => (
    <motion.div
      className="absolute inset-0"
      style={
        top
          ? motionSafe
            ? { clipPath: floodClip }
            : { opacity: reveal }
          : undefined
      }
    >
      <motion.div
        className="absolute inset-0"
        style={{ x: stripX, opacity: fade }}
      >
        {views.map((v, i) => {
          const named = top && i === index;
          return (
            <div
              key={v.id}
              role={named ? "img" : undefined}
              aria-label={
                named ? `${name}, ${glaze.name}, ${v.label}` : undefined
              }
              aria-hidden={named ? undefined : true}
              className="absolute top-0 h-full w-full"
              style={{ left: `${i * 100}%` }}
            >
              <ViewArt
                view={v}
                variant={{ colour: glaze, size }}
                motionSafe={motionSafe}
              />
            </div>
          );
        })}
      </motion.div>
    </motion.div>
  );

  return (
    <div className="grid gap-3 @min-[40rem]/pd:grid-cols-[3.5rem_minmax(0,1fr)]">
      <div
        ref={setFrame}
        id={frameId}
        role="tabpanel"
        aria-labelledby={tabId(index)}
        aria-describedby={`${uid}-gallery-hint`}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => {
          drag.onPointerCancel(event);
          touch.current = null;
        }}
        onLostPointerCapture={drag.onLostPointerCapture}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch" && lensVia === "hover") {
            closeLens();
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (
            lensVia === "key" &&
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            closeLens();
          }
        }}
        className={cn(
          "relative aspect-square w-full overflow-clip rounded-3 bg-surface-2 select-none [-webkit-touch-callout:none] @min-[40rem]/pd:order-2",
          touchLens ? "touch-none" : "touch-pan-y",
          lensVia === "hover"
            ? "cursor-none"
            : dragging
              ? "cursor-grabbing"
              : n > 1
                ? "cursor-grab"
                : "cursor-zoom-in",
          FOCUS,
        )}
      >
        {under ? strip(under, false) : null}
        {strip(colour, true)}

        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-10 overflow-clip rounded-full border-2 border-background bg-surface-2 shadow-[0_10px_28px_color-mix(in_oklab,black_28%,transparent)] ring-1 ring-hairline-strong",
            // Hidden, not faded, while the strip is thrown: its opacity is the loupe's own.
            dragging && "invisible",
          )}
          style={{
            width: L,
            height: L,
            x: lensX,
            y: lensY,
            scale: lensScale,
            opacity: show,
          }}
        >
          {current && frameW > 0 && lensLive ? (
            <motion.div
              className="absolute top-0 left-0"
              style={{
                width: Math.round(frameW * p),
                height: Math.round(frameW * p),
                x: innerX,
                y: innerY,
              }}
            >
              <ViewArt
                view={current}
                variant={{ colour, size }}
                motionSafe={motionSafe}
              />
            </motion.div>
          ) : null}
          <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-1.5 font-mono text-[9px] leading-4 text-ink-2 tabular-nums">
            {r2(p)}×
          </span>
        </motion.div>

        <button
          type="button"
          aria-label="Look closer"
          aria-pressed={lensVia !== null}
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={() => {
            if (lensVia !== null) closeLens();
            else openLens("key");
          }}
          className={cn(
            "absolute top-2 right-2 z-20 inline-flex size-8 items-center justify-center rounded-full border border-hairline bg-card/85 text-ink-2 backdrop-blur-sm transition-colors hover:text-foreground aria-pressed:border-cobalt-bright/60 aria-pressed:text-cobalt-bright",
            FOCUS,
          )}
        >
          <ZoomIn aria-hidden className="size-4" />
        </button>
        {n > 1 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-2 left-2 z-20 rounded-full bg-card/85 px-2 font-mono text-[10px] leading-5 text-ink-2 tabular-nums backdrop-blur-sm"
          >
            {index + 1} / {n}
          </span>
        ) : null}
        <span id={`${uid}-gallery-hint`} className="sr-only">
          Left and Right change the picture. Enter opens the loupe; arrows move
          it, Shift moves it further, Escape puts it away.
        </span>
      </div>

      {n > 1 ? (
        <div
          role="tablist"
          aria-label={`${name} pictures`}
          onKeyDown={onTabsKey}
          className="flex gap-2 @min-[40rem]/pd:order-1 @min-[40rem]/pd:flex-col"
        >
          {views.map((v, i) => {
            const on = i === index;
            return (
              <button
                key={v.id}
                ref={(node) => {
                  if (node) tabs.current.set(i, node);
                  else tabs.current.delete(i);
                }}
                id={tabId(i)}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={frameId}
                aria-label={v.label}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => select(i, "thumb")}
                className={cn(
                  "relative size-14 shrink-0 overflow-clip rounded-2 bg-surface-2 transition-opacity",
                  on ? "opacity-100" : "opacity-75 hover:opacity-100",
                  FOCUS,
                )}
              >
                <ViewArt
                  view={v}
                  variant={{ colour, size }}
                  motionSafe={motionSafe}
                />
                {on ? (
                  <motion.span
                    layoutId={`${uid}-pic-ring`}
                    aria-hidden
                    className="absolute inset-0 rounded-2 border-2 border-foreground"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------- pickers -------------------------------- */

type RadioKeys = {
  count: number;
  at: number;
  choose: (i: number, el: HTMLElement | null) => void;
};

/** Arrow keys move and choose, as native radios do; Home and End jump. */
function radioKeys(
  event: React.KeyboardEvent<HTMLElement>,
  { count, at, choose }: RadioKeys,
) {
  const keys: Record<string, number> = {
    ArrowRight: at + 1,
    ArrowDown: at + 1,
    ArrowLeft: at - 1,
    ArrowUp: at - 1,
    Home: 0,
    End: count - 1,
  };
  const to = keys[event.key];
  if (to === undefined || count === 0) return;
  event.preventDefault();
  const next = (to + count) % count;
  const el =
    event.currentTarget.querySelectorAll<HTMLElement>("[role='radio']")[next];
  el?.focus();
  choose(next, el ?? null);
}

function ColourPicker({
  uid,
  product,
  colour,
  size,
  style,
  soldOutIn,
  motionSafe,
  disabled,
  onChoose,
}: {
  uid: string;
  product: ProductInfo;
  colour: ProductColour;
  size: ProductSize;
  style: ProductVariantsStyle;
  soldOutIn: (c: ProductColour, s: ProductSize) => boolean;
  motionSafe: boolean;
  disabled: boolean;
  onChoose: (c: ProductColour, i: number, el: HTMLElement | null) => void;
}) {
  const labelId = `${uid}-colour-label`;
  const at = Math.max(
    0,
    product.colours.findIndex((c) => c.id === colour.id),
  );
  const first = product.views[0];
  const ring = motionSafe ? springs.snap : { duration: 0 };
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2 text-[12px]">
        <span id={labelId} className="font-medium text-ink-2">
          Colour
        </span>
        <span className="text-foreground">{colour.name}</span>
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={(event) =>
          radioKeys(event, {
            count: product.colours.length,
            at,
            choose: (i, el) => {
              const c = product.colours[i];
              if (c) onChoose(c, i, el);
            },
          })
        }
        className={cn(
          style === "tiles"
            ? "grid grid-cols-4 gap-2 @min-[64rem]/pd:grid-cols-[repeat(4,4.5rem)]"
            : "flex flex-wrap gap-2",
        )}
      >
        {product.colours.map((c, i) => {
          const on = c.id === colour.id;
          const out = soldOutIn(c, size);
          const name = `${c.name}${out ? ", sold out" : ""}`;
          const common = {
            role: "radio" as const,
            "aria-checked": on,
            "aria-label": name,
            title: name,
            tabIndex: on ? 0 : -1,
            disabled,
            onClick: (event: React.MouseEvent<HTMLButtonElement>) =>
              onChoose(c, i, event.currentTarget),
          };
          if (style === "tiles") {
            return (
              <button
                key={c.id}
                type="button"
                {...common}
                className={cn("flex min-w-0 flex-col gap-1 rounded-2", FOCUS)}
              >
                <span className="relative block aspect-square w-full overflow-clip rounded-2 bg-surface-2">
                  {first ? (
                    <ViewArt
                      view={first}
                      variant={{ colour: c, size }}
                      motionSafe={motionSafe}
                      floor={false}
                    />
                  ) : null}
                  {out ? (
                    <span className="absolute inset-x-1 bottom-1 rounded-1 bg-card/90 text-center text-[10px] leading-4 text-ink-2">
                      Sold out
                    </span>
                  ) : null}
                  {on ? (
                    <motion.span
                      layoutId={`${uid}-colour`}
                      aria-hidden
                      className="absolute inset-0 rounded-2 border-2 border-foreground"
                      transition={ring}
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "truncate text-center text-[11px]",
                    on ? "text-foreground" : "text-ink-3",
                  )}
                >
                  {c.name}
                </span>
              </button>
            );
          }
          if (style === "chips") {
            return (
              <button
                key={c.id}
                type="button"
                {...common}
                className={cn(
                  "relative inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12px] transition-colors",
                  on
                    ? "border-transparent text-foreground"
                    : "border-hairline text-ink-2 hover:border-hairline-strong hover:text-foreground",
                  FOCUS,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-colour`}
                    aria-hidden
                    className="absolute -inset-px rounded-full border-2 border-foreground"
                    transition={ring}
                  />
                ) : null}
                <span
                  aria-hidden
                  className="relative size-3 shrink-0 rounded-full ring-1 ring-black/10 ring-inset"
                  style={{ background: c.swatch }}
                />
                <span className={cn("relative", out && "line-through")}>
                  {c.name}
                </span>
              </button>
            );
          }
          return (
            <button
              key={c.id}
              type="button"
              {...common}
              className={cn(
                "relative grid size-9 place-items-center rounded-full",
                FOCUS,
              )}
            >
              <span
                aria-hidden
                className="size-7 rounded-full ring-1 ring-black/10 ring-inset"
                style={{ background: c.swatch }}
              />
              {out ? (
                <span
                  aria-hidden
                  className="absolute h-px w-8 rotate-45 bg-ink-2"
                />
              ) : null}
              {on ? (
                <motion.span
                  layoutId={`${uid}-colour`}
                  aria-hidden
                  className="absolute inset-0 rounded-full border-2 border-foreground"
                  transition={ring}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SizePicker({
  uid,
  product,
  colour,
  size,
  style,
  soldOutIn,
  money,
  motionSafe,
  disabled,
  onChoose,
}: {
  uid: string;
  product: ProductInfo;
  colour: ProductColour;
  size: ProductSize;
  style: ProductVariantsStyle;
  soldOutIn: (c: ProductColour, s: ProductSize) => boolean;
  money: (amount: number) => string;
  motionSafe: boolean;
  disabled: boolean;
  onChoose: (s: ProductSize, i: number, el: HTMLElement | null) => void;
}) {
  const labelId = `${uid}-size-label`;
  const at = Math.max(
    0,
    product.sizes.findIndex((s) => s.id === size.id),
  );
  const ring = motionSafe ? springs.snap : { duration: 0 };
  const pills = style === "chips";
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2 text-[12px]">
        <span id={labelId} className="font-medium text-ink-2">
          Size
        </span>
        <span className="text-foreground">
          {size.label}
          {size.detail ? (
            <span className="text-ink-3"> · {size.detail}</span>
          ) : null}
        </span>
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={(event) =>
          radioKeys(event, {
            count: product.sizes.length,
            at,
            choose: (i, el) => {
              const s = product.sizes[i];
              if (s) onChoose(s, i, el);
            },
          })
        }
        className={
          pills
            ? "flex flex-wrap gap-2"
            : "grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2"
        }
      >
        {product.sizes.map((s, i) => {
          const on = s.id === size.id;
          const out = soldOutIn(colour, s);
          const delta = s.priceDelta ?? 0;
          const deltaText =
            delta === 0
              ? ""
              : `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}`;
          const name = [
            s.label,
            s.detail,
            delta > 0
              ? `${money(delta)} more`
              : delta < 0
                ? `${money(-delta)} less`
                : "",
            out ? "sold out" : "",
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={name}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={(event) => onChoose(s, i, event.currentTarget)}
              className={cn(
                "relative rounded-2 border transition-colors",
                pills
                  ? "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px]"
                  : "flex h-12 min-w-0 flex-col items-center justify-center px-1",
                on
                  ? "border-transparent"
                  : "border-hairline hover:border-hairline-strong",
                FOCUS,
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${uid}-size`}
                  aria-hidden
                  className={cn(
                    "absolute -inset-px border-2 border-foreground",
                    pills ? "rounded-full" : "rounded-2",
                  )}
                  transition={ring}
                />
              ) : null}
              <span
                className={cn(
                  "relative truncate text-[13px] font-medium",
                  out ? "text-ink-3 line-through" : "text-foreground",
                  pills && "text-[12px]",
                )}
              >
                {s.label}
              </span>
              {pills ? (
                s.detail ? (
                  <span className="relative text-ink-3">{s.detail}</span>
                ) : null
              ) : (
                <span className="relative truncate text-[11px] text-ink-3 tabular-nums">
                  {out ? "Sold out" : deltaText || s.detail || " "}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ buy control ------------------------------ */

type BuyControlProps = {
  quantity: number;
  max: number;
  pending: boolean;
  soldOut: boolean;
  notified: boolean;
  label: string;
  priceText: string;
  compact: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onAdd: (el: Element | null) => void;
  onStep: (delta: 1 | -1, el: Element | null) => void;
  onNotify: (el: Element | null) => void;
  /** The control is out of sight (the docked bar while hidden): nothing in it is reachable. */
  hidden?: boolean;
};

/**
 * Add to bag, and then the bag's count, in one box. The primary fill
 * contracts from both ends onto the count on glide while − and + scale in at
 * the ends on snap, so the button you pressed becomes the stepper rather
 * than being swapped for one.
 */
function BuyControl({
  quantity,
  max,
  pending,
  soldOut,
  notified,
  label,
  priceText,
  compact,
  motionSafe,
  disabled,
  onAdd,
  onStep,
  onNotify,
  hidden = false,
}: BuyControlProps) {
  const inBag = quantity > 0;
  const h = compact ? 36 : 44;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const want = React.useRef<"plus" | "add" | null>(null);
  const [plusNode, setPlusNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [addNode, setAddNode] = React.useState<HTMLButtonElement | null>(null);
  const inset = useMotionValue(inBag ? h + 6 : 0);
  const fillOpacity = useMotionValue(soldOut && !inBag ? 0 : 1);

  const target = inBag ? h + 6 : 0;
  React.useEffect(() => {
    const c = animate(
      inset,
      target,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => c.stop();
  }, [target, motionSafe, inset]);

  const fillOn = !(soldOut && !inBag);
  React.useEffect(() => {
    const c = animate(fillOpacity, fillOn ? 1 : 0, {
      duration: durations.fast,
    });
    return () => c.stop();
  }, [fillOn, fillOpacity]);

  // Focus follows the press into the control it became, once it exists.
  React.useEffect(() => {
    if (plusNode && want.current === "plus") {
      want.current = null;
      plusNode.focus({ preventScroll: true });
    }
  }, [plusNode]);
  React.useEffect(() => {
    if (addNode && want.current === "add") {
      want.current = null;
      addNode.focus({ preventScroll: true });
    }
  }, [addNode]);

  const hadFocus = () =>
    !!rootRef.current?.contains(document.activeElement ?? null);

  const clip = useTransform(
    inset,
    (v) => `inset(0px ${r2(v)}px 0px ${r2(v)}px round 9999px)`,
  );
  const lift = motionSafe ? distances.step : 0;
  const atMax = quantity >= max;

  return (
    <div
      ref={rootRef}
      inert={hidden || undefined}
      className="relative w-full"
      style={{ height: h }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary"
        style={{ clipPath: clip, opacity: fillOpacity }}
      />
      <AnimatePresence initial={false}>
        {inBag ? (
          <motion.div
            key="stepper"
            role="group"
            aria-label="Quantity in bag"
            className="absolute inset-0"
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            <motion.button
              type="button"
              aria-label={quantity === 1 ? "Remove from bag" : "Remove one"}
              disabled={disabled}
              onClick={(event) => {
                if (quantity === 1 && hadFocus()) want.current = "add";
                onStep(-1, event.currentTarget);
              }}
              initial={
                motionSafe ? { opacity: 0, scale: 0.6, x: 10 } : { opacity: 0 }
              }
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className={cn(
                "absolute top-0 left-0 inline-flex items-center justify-center rounded-full border border-hairline-strong bg-card text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
              style={{ width: h, height: h }}
            >
              <Minus aria-hidden className="size-4" />
            </motion.button>
            <motion.span
              className={cn(
                "absolute inset-y-0 flex items-center justify-center font-medium text-primary-foreground",
                compact ? "text-[13px]" : "text-[14px]",
              )}
              style={{ left: h + 6, right: h + 6 }}
              initial={{ opacity: 0, y: lift }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.base } }
                  : { duration: durations.fast }
              }
            >
              <span className="flex items-baseline gap-1">
                <Roll text={String(quantity)} motionSafe={motionSafe} />
                {compact ? (
                  <span className="sr-only">in bag</span>
                ) : (
                  <span>in bag</span>
                )}
              </span>
            </motion.span>
            <motion.button
              ref={setPlusNode}
              type="button"
              aria-label={atMax ? `Add one, ${max} is the most` : "Add one"}
              aria-disabled={atMax || undefined}
              disabled={disabled}
              onClick={(event) => {
                if (atMax) return;
                onStep(1, event.currentTarget);
              }}
              initial={
                motionSafe ? { opacity: 0, scale: 0.6, x: -10 } : { opacity: 0 }
              }
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className={cn(
                "absolute top-0 right-0 inline-flex items-center justify-center rounded-full border border-hairline-strong bg-card text-foreground transition-colors hover:bg-surface-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
                FOCUS,
              )}
              style={{ width: h, height: h }}
            >
              <Plus aria-hidden className="size-4" />
            </motion.button>
          </motion.div>
        ) : soldOut ? (
          <motion.button
            key="notify"
            ref={setAddNode}
            type="button"
            aria-disabled={notified || undefined}
            disabled={disabled}
            onClick={(event) => {
              if (!notified) onNotify(event.currentTarget);
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
            className={cn(
              "absolute inset-0 inline-flex items-center justify-center gap-2 rounded-full border border-hairline-strong font-medium text-foreground transition-colors enabled:hover:bg-surface-2",
              compact ? "text-[13px]" : "text-[14px]",
              FOCUS,
            )}
          >
            {notified ? (
              <>
                <Check aria-hidden className="size-4 text-success" />
                {compact ? "We'll email you" : "We'll email you when it's back"}
              </>
            ) : (
              <>
                <Bell aria-hidden className="size-4" />
                Notify me
              </>
            )}
          </motion.button>
        ) : (
          <motion.button
            key="add"
            ref={setAddNode}
            type="button"
            aria-busy={pending || undefined}
            disabled={disabled}
            onClick={(event) => {
              if (pending) return;
              if (hadFocus()) want.current = "plus";
              onAdd(event.currentTarget);
            }}
            initial={{ opacity: 0, y: -lift }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: -lift,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
            className={cn(
              "absolute inset-0 inline-flex items-center justify-center gap-2 rounded-full px-4 font-medium text-primary-foreground",
              compact ? "text-[13px]" : "text-[14px]",
              pending ? "cursor-progress" : "cursor-pointer",
              FOCUS,
            )}
          >
            {pending ? (
              <>
                <LoaderCircle
                  aria-hidden
                  className={cn("size-4", motionSafe && "animate-spin")}
                />
                Adding…
              </>
            ) : (
              <span className="truncate">
                {compact ? "Add" : label}
                <span className="opacity-70"> · </span>
                {priceText}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------- delivery ------------------------------- */

type Answer = { postcode: string; result: DeliveryEstimate | null };

function DeliveryCheck({
  uid,
  estimate,
  now,
  defaultPostcode,
  onEstimate,
  motionSafe,
  disabled,
  say,
}: {
  uid: string;
  estimate: NonNullable<ProductDetailProps["estimate"]>;
  now: number;
  defaultPostcode: string;
  onEstimate?: ProductDetailProps["onEstimate"];
  motionSafe: boolean;
  disabled: boolean;
  say: (text: string) => void;
}) {
  const inputId = `${uid}-postcode`;
  const errorId = `${uid}-postcode-error`;
  const [text, setText] = React.useState(defaultPostcode);
  const [answer, setAnswer] = React.useState<Answer | null>(() => {
    const code = tidyPostcode(defaultPostcode);
    if (!code || !POSTCODE.test(code)) return null;
    const r = estimate(code, now);
    return isPromise(r) ? null : { postcode: code, result: r };
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ticket = React.useRef(0);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const settle = (code: string, result: DeliveryEstimate | null) => {
    setAnswer({ postcode: code, result });
    onEstimate?.(code, result);
    say(
      result
        ? `${result.label}${result.detail ? `. ${result.detail}` : ""}.`
        : `Fernworks doesn't deliver to ${code} yet.`,
    );
  };

  const submit = async () => {
    if (disabled) return;
    const code = tidyPostcode(text);
    if (!POSTCODE.test(code)) {
      setError("Enter a postcode, like D08 X2F7.");
      say("Enter a postcode, like D08 X2F7.");
      return;
    }
    setError(null);
    ticket.current += 1;
    const mine = ticket.current;
    const r = estimate(code, now);
    if (!isPromise<DeliveryEstimate | null>(r)) {
      settle(code, r);
      return;
    }
    setPending(true);
    try {
      const result = await r;
      if (!alive.current || mine !== ticket.current) return;
      setPending(false);
      settle(code, result);
    } catch (err) {
      if (!alive.current || mine !== ticket.current) return;
      setPending(false);
      setError(messageOf(err, "That postcode didn't check. Try again."));
    }
  };

  return (
    <div className="rounded-3 border border-hairline p-3">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-1.5"
      >
        <label htmlFor={inputId} className="text-[12px] font-medium text-ink-2">
          Delivery to
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="text"
            value={text}
            disabled={disabled}
            autoComplete="postal-code"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Postcode"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setText(event.currentTarget.value);
              if (error) setError(null);
            }}
            className={cn(
              "h-9 min-w-0 flex-1 rounded-2 border bg-background px-3 text-[13px] text-foreground uppercase transition-colors placeholder:text-ink-3 placeholder:normal-case",
              error
                ? "border-danger/70"
                : "border-input hover:border-hairline-strong",
              FOCUS,
            )}
          />
          <button
            type="submit"
            disabled={disabled}
            aria-busy={pending || undefined}
            className={cn(
              "inline-grid h-9 shrink-0 place-items-center rounded-2 border border-hairline-strong px-3 text-[13px] text-foreground transition-colors enabled:hover:bg-surface-2",
              FOCUS,
            )}
          >
            <span
              className={cn("col-start-1 row-start-1", pending && "invisible")}
            >
              Check
            </span>
            {pending ? (
              <LoaderCircle
                aria-label="Checking"
                className={cn(
                  "col-start-1 row-start-1 size-4",
                  motionSafe && "animate-spin",
                )}
              />
            ) : null}
          </button>
        </div>
        <AnimatePresence initial={false}>
          {error ? (
            <motion.p
              key="error"
              id={errorId}
              className="flex items-center gap-1.5 text-[12px] leading-4 text-danger"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </form>
      <AnimatePresence initial={false}>
        {answer ? (
          <motion.div
            key="answer"
            className="overflow-clip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitFor() }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
          >
            <div className="grid pt-3">
              <AnimatePresence initial={false}>
                <motion.div
                  key={answer.postcode}
                  className="col-start-1 row-start-1 flex items-start gap-2.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <motion.span
                    aria-hidden
                    className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-cobalt-bright"
                    initial={motionSafe ? { x: -distances.step } : false}
                    animate={{ x: 0 }}
                    transition={springs.snap}
                  >
                    <Truck className="size-4" />
                  </motion.span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-foreground">
                      {answer.result
                        ? answer.result.label
                        : `No delivery to ${answer.postcode} yet`}
                    </span>
                    <span className="block text-[12px] leading-4 text-ink-3">
                      {answer.result
                        ? (answer.result.detail ?? `To ${answer.postcode}`)
                        : "Collect it from the Fernworks studio instead."}
                    </span>
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------- sections ------------------------------- */

function Sections({
  uid,
  sections,
  motionSafe,
}: {
  uid: string;
  sections: ProductDetailSection[];
  motionSafe: boolean;
}) {
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set());
  if (sections.length === 0) return null;
  return (
    <div className="flex flex-col border-t border-hairline">
      {sections.map((s) => {
        const on = open.has(s.id);
        const btnId = `${uid}-sec-${s.id}`;
        const panelId = `${btnId}-panel`;
        return (
          <div key={s.id} className="border-b border-hairline">
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={on}
                aria-controls={panelId}
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
                className={cn(
                  "flex h-11 w-full items-center justify-between gap-3 rounded-1 text-left text-[13px] font-medium text-foreground",
                  FOCUS_IN,
                )}
              >
                {s.title}
                <motion.span
                  aria-hidden
                  className="flex size-4 shrink-0 items-center justify-center text-ink-3"
                  initial={false}
                  animate={{ rotate: on ? 180 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                >
                  <ChevronDown className="size-4" />
                </motion.span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {on ? (
                <motion.div
                  key="panel"
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  className="overflow-clip"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0, transition: exitFor() }}
                  transition={
                    motionSafe
                      ? {
                          height: springs.glide,
                          opacity: { duration: durations.base },
                        }
                      : { duration: 0 }
                  }
                >
                  <div className="pb-3 text-[13px] leading-5 text-ink-2">
                    {s.body}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- main --------------------------------- */

const keyOf = (s: ProductSelection) => `${s.colour}:${s.size}`;

const FALLBACK_COLOUR: ProductColour = {
  id: "",
  name: "",
  swatch: "var(--ink-3)",
};
const FALLBACK_SIZE: ProductSize = { id: "", label: "" };

/**
 * The buying half of a product page, and every choice shows on the piece.
 * Pictures sit in a strip you can throw — 1:1 under the finger, rubber-banded
 * at the ends, committed by projection on glide — with a thumbnail rail
 * beside it, and a loupe that follows the pointer 1:1 to show the glaze at
 * `lens`× (a tap opens it above a finger; the keyboard moves it with the
 * arrows). Choosing a colour floods the new glaze across the picture from the
 * edge nearest the picker, a circle growing on drift; a size grows or settles
 * the piece from its foot; the price rolls its digits on snap.
 *
 * Add to bag becomes the bag's stepper in the same box — the fill contracts
 * onto the count on glide while − and + scale in on snap — and a postcode
 * gives a delivery date counted from `now`. With `sticky`, a buy bar docks at
 * the bottom of the component's own scroll box whenever the buy row is out of
 * it, and the pictures stay pinned beside the details.
 *
 * Colours and sizes are radio groups (arrows move and choose), the pictures a
 * tablist with a focusable panel, the stepper a labelled group; every change
 * is announced politely. Under reduced motion nothing travels or grows: the
 * glaze and the pictures cross-fade, the loupe fades, the price swaps — and
 * every state still shows.
 */
export function ProductDetail({
  product = defaultProduct,
  value,
  defaultValue,
  onValueChange,
  quantity,
  defaultQuantity = 0,
  onQuantityChange,
  onAdd,
  onNotify,
  view,
  defaultView = 0,
  onViewChange,
  estimate = defaultEstimate,
  defaultPostcode = "",
  onEstimate,
  now,
  maxQuantity = 10,
  lens = 2.5,
  variants = "swatches",
  sticky = true,
  format,
  addLabel = "Add to bag",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: ProductDetailProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const nameId = `${uid}-name`;
  const money = format ?? euro;
  const nowMs =
    now === undefined
      ? DEFAULT_NOW
      : typeof now === "number"
        ? now
        : now.getTime();

  const { colours, sizes, views } = product;

  const soldOutIn = React.useCallback(
    (c: ProductColour, s: ProductSize) =>
      !!c.soldOut ||
      s.stock === 0 ||
      !!product.unavailable?.includes(`${c.id}:${s.id}`),
    [product.unavailable],
  );

  const fallback = (): ProductSelection => {
    const featured = sizes.find((s) => s.featured) ?? sizes[0];
    for (const c of colours) {
      if (featured && !soldOutIn(c, featured)) {
        return { colour: c.id, size: featured.id };
      }
    }
    return { colour: colours[0]?.id ?? "", size: featured?.id ?? "" };
  };

  const [ownSel, setOwnSel] = React.useState<ProductSelection>(
    () => defaultValue ?? fallback(),
  );
  const asked = value ?? ownSel;
  const colour =
    colours.find((c) => c.id === asked.colour) ?? colours[0] ?? FALLBACK_COLOUR;
  const size =
    sizes.find((s) => s.id === asked.size) ?? sizes[0] ?? FALLBACK_SIZE;
  const sel: ProductSelection = { colour: colour.id, size: size.id };
  const key = keyOf(sel);

  const [ownQty, setOwnQty] = React.useState<Record<string, number>>(() =>
    defaultQuantity > 0
      ? { [keyOf(defaultValue ?? fallback())]: defaultQuantity }
      : {},
  );
  const max = Math.max(1, Math.min(maxQuantity, size.stock ?? Infinity));
  const qty = clamp(Math.round(quantity ?? ownQty[key] ?? 0), 0, 999);

  const [ownView, setOwnView] = React.useState(() =>
    clamp(defaultView, 0, Math.max(0, views.length - 1)),
  );
  const viewAt = clamp(view ?? ownView, 0, Math.max(0, views.length - 1));

  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [notified, setNotified] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );

  const priceOf = (c: ProductColour, s: ProductSize) =>
    cents(product.price + (c.priceDelta ?? 0) + (s.priceDelta ?? 0));
  const wasOf = (c: ProductColour, s: ProductSize) => {
    const was =
      product.compareAt !== undefined
        ? cents(product.compareAt + (s.priceDelta ?? 0))
        : (c.priceDelta ?? 0) < 0
          ? cents(product.price + (s.priceDelta ?? 0))
          : null;
    return was !== null && was > priceOf(c, s) ? was : null;
  };
  const price = priceOf(colour, size);
  const was = wasOf(colour, size);
  const widest = React.useMemo(() => {
    let w = "";
    for (const c of colours) {
      for (const s of sizes) {
        const t = money(
          cents(product.price + (c.priceDelta ?? 0) + (s.priceDelta ?? 0)),
        );
        if (t.length > w.length) w = t;
      }
    }
    return w;
  }, [colours, sizes, money, product.price]);
  const soldOut = soldOutIn(colour, size);

  // What is said follows what is shown, so a host that refuses a choice is
  // never announced as having taken it.
  const [spoken, setSpoken] = React.useState({ key, qty });
  if (spoken.key !== key || spoken.qty !== qty) {
    const text =
      spoken.key !== key
        ? `${colour.name}, ${size.label}. ${money(price)}${soldOut ? ", sold out in this size" : ""}.`
        : qty > spoken.qty
          ? qty === 1
            ? "Added to bag. 1 in bag."
            : `${qty} in bag.`
          : qty === 0
            ? "Removed from bag."
            : `${qty} in bag.`;
    setSpoken({ key, qty });
    setSaid((s) => ({ n: s.n + 1, text }));
  }

  /* ---------------------------- glaze flood ---------------------------- */

  const reveal = useMotionValue(1);
  const floodX = useMotionValue(100);
  const floodY = useMotionValue(50);
  const [origin, setOrigin] = React.useState({ x: 100, y: 50 });
  const [glazeShown, setGlazeShown] = React.useState(colour.id);
  const [flood, setFlood] = React.useState<{
    from: string;
    key: number;
    x: number;
    y: number;
  } | null>(null);
  if (glazeShown !== colour.id) {
    setGlazeShown(colour.id);
    setFlood((f) => ({
      from: glazeShown,
      key: (f?.key ?? 0) + 1,
      x: origin.x,
      y: origin.y,
    }));
  }
  const floodKey = flood?.key;
  const floodAtX = flood?.x ?? 100;
  const floodAtY = flood?.y ?? 50;
  // Started before paint, so the new glaze is never seen whole for a frame
  // before its circle opens.
  React.useLayoutEffect(() => {
    if (floodKey === undefined) return;
    floodX.jump(floodAtX);
    floodY.jump(floodAtY);
    reveal.jump(0);
    // The whole picture is a large surface: it floods on drift, slow enough
    // to watch the new glaze reach the far corner.
    const c = animate(
      reveal,
      1,
      motionSafe
        ? springs.drift
        : { duration: durations.base, ease: easings.enter },
    );
    // Finishing is a promise, so a StrictMode re-run that restarts it never
    // drops the old glaze early.
    void c.then(() => setFlood((f) => (f && f.key === floodKey ? null : f)));
    return () => c.stop();
  }, [floodKey, floodAtX, floodAtY, motionSafe, reveal, floodX, floodY]);

  const under = flood
    ? (colours.find((c) => c.id === flood.from) ?? null)
    : null;

  /* -------------------------------- refs -------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const frameEl = React.useRef<HTMLDivElement | null>(null);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const bindFrame = React.useCallback((node: HTMLDivElement | null) => {
    frameEl.current = node;
  }, []);

  const panOf = (el: Element | null | undefined) => {
    const r = el?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };

  /** Where the flood starts: the frame edge nearest the control pressed. */
  const originOf = (el: Element | null) => {
    const f = frameEl.current?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    if (!f || !r || f.width === 0 || f.height === 0) return { x: 100, y: 50 };
    const x = clamp(r.left + r.width / 2, f.left, f.right);
    const y = clamp(r.top + r.height / 2, f.top, f.bottom);
    return {
      x: r2(((x - f.left) / f.width) * 100),
      y: r2(((y - f.top) / f.height) * 100),
    };
  };

  /* --------------------------- the visitor's moves --------------------------- */

  const choose = (
    next: ProductSelection,
    el: Element | null,
    pitchAt: number,
  ) => {
    if (disabled) return;
    if (next.colour === sel.colour && next.size === sel.size) return;
    if (next.colour !== sel.colour) setOrigin(originOf(el));
    setAddError(null);
    if (value === undefined) setOwnSel(next);
    onValueChange?.(next);
    audio.play("plip", {
      pitch: r2(0.92 + pitchAt * 0.1),
      gain: 0.45,
      pan: panOf(el),
    });
  };

  const setCount = (n: number, forSel: ProductSelection, forMax: number) => {
    const q = clamp(n, 0, forMax);
    const k = keyOf(forSel);
    if (quantity === undefined) setOwnQty((m) => ({ ...m, [k]: q }));
    onQuantityChange?.(q, forSel);
  };

  const add = async (el: Element | null) => {
    if (disabled || adding || soldOut) return;
    const forSel = sel;
    const forMax = max;
    setAddError(null);
    audio.play("pop", { pitch: 1, gain: 0.55, pan: panOf(el) });
    let result: void | Promise<void>;
    try {
      result = onAdd?.(forSel);
    } catch (error) {
      setAddError(messageOf(error, "That didn't go in the bag. Try again."));
      return;
    }
    if (isPromise<void>(result)) {
      setAdding(true);
      try {
        await result;
      } catch (error) {
        if (!alive.current) return;
        setAdding(false);
        setAddError(messageOf(error, "That didn't go in the bag. Try again."));
        return;
      }
      if (!alive.current) return;
      setAdding(false);
    }
    setCount(1, forSel, forMax);
  };

  const step = (delta: 1 | -1, el: Element | null) => {
    if (disabled) return;
    const next = qty + delta;
    if (next > max) return;
    audio.play("pop", {
      pitch: delta > 0 ? r2(1 + Math.min(next, 8) * 0.06) : 0.78,
      gain: delta > 0 ? 0.5 : 0.4,
      pan: panOf(el),
    });
    setCount(next, sel, max);
  };

  const notify = (el: Element | null) => {
    if (disabled) return;
    audio.play("plip", { pitch: 1.2, gain: 0.4, pan: panOf(el) });
    setNotified((s) => new Set(s).add(key));
    onNotify?.(sel);
    say(`We'll email you when ${colour.name}, ${size.label} is back.`);
  };

  const pickView = (i: number, via: "drag" | "thumb" | "key") => {
    if (view === undefined) setOwnView(i);
    onViewChange?.(i);
    audio.play("plip", {
      pitch: r2(0.9 + i * 0.08),
      gain: 0.35,
      pan: panOf(frameEl.current),
    });
    const v = views[i];
    if (v && via !== "thumb") say(`${v.label}, ${i + 1} of ${views.length}.`);
  };

  const onLensOpen = React.useCallback(
    (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      audio.play("plip", {
        pitch: 1.3,
        gain: 0.3,
        pan: r ? panFrom(r.left + r.width / 2, null) : 0,
      });
    },
    [audio],
  );

  /* ------------------------------ docked bar ------------------------------ */

  const [buyRow, setBuyRow] = React.useState<HTMLDivElement | null>(null);
  const [away, setAway] = React.useState(false);
  // The bar answers to the component's own scroll box: it shows while the buy
  // row is out of it, above (scrolled past) or below (not reached yet).
  React.useEffect(() => {
    const root = rootRef.current;
    if (!buyRow || !root || !sticky) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry) setAway(!entry.isIntersecting);
      },
      { root, threshold: 0 },
    );
    io.observe(buyRow);
    return () => io.disconnect();
  }, [buyRow, sticky]);
  const barShown = sticky && away && status === "ready";

  /* --------------------------------- view --------------------------------- */

  const buy = (compact: boolean, hidden = false) => (
    <BuyControl
      quantity={qty}
      max={max}
      pending={adding}
      soldOut={soldOut}
      notified={notified.has(key)}
      label={addLabel}
      priceText={money(price)}
      compact={compact}
      motionSafe={motionSafe}
      disabled={disabled}
      hidden={hidden}
      onAdd={(el) => void add(el)}
      onStep={step}
      onNotify={notify}
    />
  );

  const stockNote = soldOut
    ? `Sold out in ${colour.name}, ${size.label}. Notify me and we'll email you when the kiln has more.`
    : size.stock !== undefined && size.stock <= 5
      ? `Only ${size.stock} left in ${size.label}.`
      : null;

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div
        aria-hidden
        className="grid gap-5 p-4 @min-[40rem]/pd:grid-cols-2 @min-[40rem]/pd:gap-6 @min-[40rem]/pd:p-5"
      >
        <div
          className={cn(
            "aspect-square rounded-3 bg-ink-3/10",
            motionSafe && "animate-pulse",
          )}
        />
        <div className="flex flex-col gap-3">
          <span className="h-3 w-24 rounded-1 bg-ink-3/15" />
          <span className="h-5 w-40 rounded-1 bg-ink-3/15" />
          <span className="h-4 w-20 rounded-1 bg-ink-3/15" />
          <span className="mt-2 h-9 w-48 rounded-2 bg-ink-3/10" />
          <span className="h-12 rounded-2 bg-ink-3/10" />
          <span
            className={cn(
              "h-11 rounded-full bg-ink-3/15",
              motionSafe && "animate-pulse",
            )}
          />
        </div>
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center-safe justify-center-safe gap-3 px-6 py-12 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">
          This product didn&apos;t load.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={onRetry}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[13px] text-foreground transition-colors enabled:hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Retry
        </button>
      </div>
    );
  } else {
    body = (
      <div
        className={cn(
          "grid gap-5 p-4 @min-[40rem]/pd:grid-cols-2 @min-[40rem]/pd:gap-6 @min-[40rem]/pd:p-5 @min-[64rem]/pd:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] @min-[64rem]/pd:gap-8 @min-[64rem]/pd:p-6",
          barShown && "pb-20 @min-[40rem]/pd:pb-20",
        )}
      >
        <div
          className={cn(
            "min-w-0",
            sticky &&
              "@min-[40rem]/pd:sticky @min-[40rem]/pd:top-5 @min-[40rem]/pd:self-start @min-[64rem]/pd:top-6",
          )}
        >
          {views.length > 0 ? (
            <Gallery
              uid={uid}
              name={product.name}
              views={views}
              colour={colour}
              size={size}
              under={under}
              reveal={reveal}
              floodX={floodX}
              floodY={floodY}
              index={viewAt}
              onSelect={pickView}
              power={lens}
              motionSafe={motionSafe}
              disabled={disabled}
              bindFrame={bindFrame}
              onLensOpen={onLensOpen}
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            {product.badge ? (
              <span className="inline-flex h-5 w-fit items-center rounded-full bg-cobalt-wash px-2 text-[11px] font-medium text-cobalt-bright">
                {product.badge}
              </span>
            ) : null}
            <p className="text-[12px] text-ink-3">{product.brand}</p>
            <h2
              id={nameId}
              className="text-[18px] leading-6 font-semibold text-foreground @min-[40rem]/pd:text-[20px] @min-[40rem]/pd:leading-7"
            >
              {product.name}
            </h2>
            {product.rating ? (
              <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
                <Stars value={product.rating.value} />
                <span className="sr-only">
                  Rated {product.rating.value} out of 5,
                </span>
                <span aria-hidden className="text-ink-2 tabular-nums">
                  {product.rating.value.toFixed(1)}
                </span>
                <span>
                  ·{" "}
                  {product.rating.count === 1
                    ? "1 review"
                    : `${product.rating.count} reviews`}
                </span>
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Roll
                text={money(price)}
                widest={widest}
                motionSafe={motionSafe}
                className="text-[20px] font-medium text-foreground"
              />
              {was !== null ? (
                <span className="text-[13px] text-ink-3 tabular-nums line-through">
                  <span className="sr-only">was </span>
                  {money(was)}
                </span>
              ) : null}
              <span className="text-[12px] text-ink-3">VAT included</span>
            </div>
          </div>

          {product.summary ? (
            <p className="text-[13px] leading-5 text-ink-2">
              {product.summary}
            </p>
          ) : null}

          <ColourPicker
            uid={uid}
            product={product}
            colour={colour}
            size={size}
            style={variants}
            soldOutIn={soldOutIn}
            motionSafe={motionSafe}
            disabled={disabled}
            onChoose={(c, i, el) =>
              choose({ colour: c.id, size: size.id }, el, i)
            }
          />
          <SizePicker
            uid={uid}
            product={product}
            colour={colour}
            size={size}
            style={variants}
            soldOutIn={soldOutIn}
            money={money}
            motionSafe={motionSafe}
            disabled={disabled}
            onChoose={(s, i, el) =>
              choose({ colour: colour.id, size: s.id }, el, i)
            }
          />

          <div ref={setBuyRow} className="flex flex-col gap-2">
            {stockNote ? (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-[12px] leading-4",
                  soldOut ? "text-ink-2" : "text-warn",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    soldOut ? "bg-ink-3" : "bg-warn",
                  )}
                />
                {stockNote}
              </p>
            ) : null}
            {buy(false)}
            <AnimatePresence initial={false}>
              {addError ? (
                <motion.p
                  key="add-error"
                  role="alert"
                  className="flex items-center gap-1.5 text-[12px] leading-4 text-danger"
                  initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                  {addError}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <DeliveryCheck
            uid={uid}
            estimate={estimate}
            now={nowMs}
            defaultPostcode={defaultPostcode}
            onEstimate={onEstimate}
            motionSafe={motionSafe}
            disabled={disabled}
            say={say}
          />

          {product.sections && product.sections.length > 0 ? (
            <Sections
              uid={uid}
              sections={product.sections}
              motionSafe={motionSafe}
            />
          ) : null}
        </div>
      </div>
    );
  }

  const first = views[0];

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : nameId}
      aria-label={label}
      aria-busy={status === "loading" || adding || undefined}
      className={cn(
        "@container/pd relative isolate w-full [scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      {status !== "ready" && !label ? (
        <span id={nameId} className="sr-only">
          {product.name}
        </span>
      ) : null}
      {body}

      {sticky && status === "ready" ? (
        <div className="pointer-events-none sticky bottom-0 z-30 h-0">
          <motion.div
            aria-hidden={!barShown || undefined}
            inert={!barShown || undefined}
            className={cn(
              "absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-3 border border-hairline-strong bg-popover/95 p-2 shadow-[0_10px_30px_color-mix(in_oklab,black_18%,transparent)] backdrop-blur-md",
              barShown ? "pointer-events-auto" : "pointer-events-none",
            )}
            initial={false}
            animate={
              barShown
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: motionSafe ? distances.shift : 0 }
            }
            transition={
              barShown
                ? {
                    y: motionSafe ? springs.snap : { duration: 0 },
                    opacity: { duration: durations.fast },
                  }
                : exitFor(durations.fast)
            }
          >
            {first ? (
              <span className="relative size-10 shrink-0 overflow-clip rounded-2 bg-surface-2">
                <ViewArt
                  view={first}
                  variant={{ colour, size }}
                  motionSafe={motionSafe}
                  floor={false}
                />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {product.name}
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                {colour.name} · {size.label}
                <span className="hidden @min-[40rem]/pd:inline">
                  {" "}
                  ·{" "}
                  <span className="text-ink-2 tabular-nums">
                    {money(price)}
                  </span>
                </span>
              </span>
            </span>
            <span className="w-32 shrink-0 @min-[40rem]/pd:w-44">
              {buy(true, !barShown)}
            </span>
          </motion.div>
        </div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
