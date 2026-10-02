"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { Check, RefreshCcw, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type GiftFlip = "turn" | "tumble" | "none";
export type GiftDesignPicker = "swatches" | "tiles" | "swipe";
export type GiftAmountPicker = "chips" | "slider";
export type GiftSide = "front" | "back";
export type GiftState = "idle" | "pending" | "done" | "error";
export type GiftStatus = "ready" | "loading" | "error";
export type GiftArt =
  "meadow" | "confetti" | "linen" | "night" | "bloom" | "tide";

export type GiftDesign = {
  id: string;
  name: string;
  /** The drawing. */
  art: GiftArt;
  /** Its colour, any CSS colour — pass a token, never a hex. Drawn at fixed lightness. */
  tint: string;
};

export type GiftValue = {
  amount: number;
  /** A `GiftDesign` id. */
  design: string;
  /** The recipient's name. */
  to: string;
  /** The sender's name. */
  from: string;
  message: string;
  /** Where the card is sent. */
  email: string;
  /** The day it is sent (YYYY-MM-DD), or null to send now. */
  sendOn: string | null;
};

export type GiftBuilderProps = {
  /** How the card shows its back: turned side to side, tumbled top over bottom, or laid beside the front. @default "turn" */
  flip?: GiftFlip;
  /** How a design is picked: round swatches, miniature cards, or by swiping the card itself. @default "swatches" */
  designs?: GiftDesignPicker;
  /** How the amount is set: preset chips with a custom field, or a detent slider. @default "chips" */
  amount?: GiftAmountPicker;
  /** The designs on offer. @default defaultGiftDesigns */
  designOptions?: GiftDesign[];
  /** The preset amounts. @default [25, 50, 100, 150] */
  amounts?: number[];
  /** The smallest amount. @default 10 */
  min?: number;
  /** The largest amount. @default 500 */
  max?: number;
  /** The slider's step. @default 5 */
  step?: number;
  /** Controlled gift. */
  value?: GiftValue;
  /** Initial gift when uncontrolled. @default defaultGiftValue */
  defaultValue?: GiftValue;
  /** Fires from the chip, key, drag or field that changed the gift. */
  onValueChange?: (value: GiftValue) => void;
  /** Controlled face shown. */
  side?: GiftSide;
  /** Initial face when uncontrolled. @default "front" */
  defaultSide?: GiftSide;
  /** Fires when the visitor moves to the message (back) or the amount and design (front), or turns the card by hand. */
  onSideChange?: (side: GiftSide) => void;
  /** Buy it. Return a promise to hold the button pending; reject to show an error. */
  onSubmit?: (value: GiftValue) => void | Promise<void>;
  /** Controlled purchase state. */
  state?: GiftState;
  /** Fires as the purchase is asked for, done or refused. */
  onStateChange?: (state: GiftState) => void;
  /** Make another was pressed after a purchase. */
  onReset?: () => void;
  /** The shop on the card. @default "Fernworks" */
  brand?: string;
  /** The message's limit, in characters. @default 180 */
  maxMessage?: number;
  /** Days ahead a send can be scheduled. @default 14 */
  scheduleDays?: number;
  /** The builder's moment (Date or ms): send dates count from it. @default defaultGiftNow */
  now?: number | Date;
  /** Amounts to text. @default US dollars, whole when whole */
  formatPrice?: (amount: number) => string;
  /** The heading. @default "Send a gift card" */
  title?: string;
  /** Whether the designs have arrived. @default "ready" */
  status?: GiftStatus;
  /** "Try again" was pressed after loading failed. */
  onRetry?: () => void;
  /** The region's accessible name. @default the title */
  label?: string;
  /** Paper as the card turns and wraps, a swish as a design arrives. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only. @default false */
  disabled?: boolean;
  /** Classes for the root. It is at most 560px tall and scrolls inside itself. */
  className?: string;
};

/* -------------------------------- defaults ------------------------------- */

const DAY_MS = 86_400_000;

/** 2 October 2026, 09:30 UTC. */
export const defaultGiftNow = Date.UTC(2026, 9, 2, 9, 30);

export const defaultGiftDesigns: GiftDesign[] = [
  { id: "meadow", name: "Meadow", art: "meadow", tint: "var(--success)" },
  { id: "confetti", name: "Confetti", art: "confetti", tint: "var(--warn)" },
  { id: "linen", name: "Linen", art: "linen", tint: "var(--warn)" },
  { id: "night", name: "Night", art: "night", tint: "var(--accent-bright)" },
  { id: "bloom", name: "Bloom", art: "bloom", tint: "var(--danger)" },
  { id: "tide", name: "Tide", art: "tide", tint: "var(--signal)" },
];

export const defaultGiftValue: GiftValue = {
  amount: 50,
  design: "meadow",
  to: "Maya",
  from: "Sam",
  message:
    "Happy birthday. Thought you could use a few good bags for the cold months. Save me a cup.",
  email: "maya@fieldline.example",
  sendOn: null,
};

/* -------------------------------- helpers -------------------------------- */

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());
const dayOf = (ms: number) => Math.floor(ms / DAY_MS);
const isoOf = (day: number) =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);
const dayOfIso = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? dayOf(t) : null;
};
const dayText = (day: number) => {
  const d = new Date(day * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""}, ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const usd = (v: number) => (Number.isInteger(v) ? `$${v}` : USD.format(v));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

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

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Fixed art: card stock and its ink, the same in either theme. */
const STOCK = "oklch(from var(--ink) 0.975 0.012 85)";
const STOCK_INK = "oklch(from var(--ink) 0.25 0.02 h)";
const pigment = (tint: string, l: number, c: number) =>
  `oklch(from ${tint} ${l} ${c} h)`;
const DARK_ART: GiftArt[] = ["night"];

/** The slider's scale is logarithmic: small amounts get the room. */
const toPos = (v: number, lo: number, hi: number) =>
  Math.log(Math.max(lo, v) / lo) / Math.log(hi / lo);
const fromPos = (p: number, lo: number, hi: number) =>
  lo * Math.pow(hi / lo, clamp(p, 0, 1));

/* ------------------------------- the art --------------------------------- */

/** A design, drawn in a 320×202 box: the card's own proportions. */
function DesignArt({
  design,
  className,
}: {
  design: GiftDesign;
  className?: string;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const next = seeded(hash(design.id));
  const t = design.tint;
  const gid = `ga-${uid}`;
  let body: React.ReactNode = null;

  if (design.art === "meadow") {
    const hill = (base: number, amp: number, phase: number) => {
      let d = `M0 202 L0 ${base}`;
      for (let x = 0; x <= 320; x += 20) {
        const y = base - amp * Math.sin((x / 320) * Math.PI * 2 + phase);
        d += ` L${x} ${r2(y)}`;
      }
      return `${d} L320 202 Z`;
    };
    body = (
      <>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              style={{ stopColor: pigment("var(--accent-bright)", 0.9, 0.04) }}
            />
            <stop offset="1" style={{ stopColor: pigment(t, 0.93, 0.05) }} />
          </linearGradient>
        </defs>
        <rect width="320" height="202" fill={`url(#${gid})`} />
        <circle
          cx="236"
          cy="62"
          r="26"
          style={{ fill: pigment("var(--warn)", 0.9, 0.09) }}
        />
        <path d={hill(120, 14, 0.6)} style={{ fill: pigment(t, 0.78, 0.07) }} />
        <path d={hill(146, 12, 2.1)} style={{ fill: pigment(t, 0.66, 0.09) }} />
        <path d={hill(170, 10, 4)} style={{ fill: pigment(t, 0.54, 0.1) }} />
      </>
    );
  } else if (design.art === "confetti") {
    const inks = [
      "var(--accent-bright)",
      "var(--warn)",
      "var(--danger)",
      "var(--success)",
      "var(--signal)",
    ];
    const bits = Array.from({ length: 46 }, () => ({
      x: Math.round(next() * 320),
      y: Math.round(next() * 202),
      w: Math.round(5 + next() * 8),
      a: Math.round(next() * 180),
      c: inks[Math.floor(next() * inks.length)] ?? "var(--warn)",
      round: next() > 0.6,
    }));
    body = (
      <>
        <rect
          width="320"
          height="202"
          style={{ fill: pigment(t, 0.95, 0.03) }}
        />
        {bits.map((b, i) =>
          b.round ? (
            <circle
              key={i}
              cx={b.x}
              cy={b.y}
              r={r2(b.w / 2.4)}
              style={{ fill: pigment(b.c, 0.72, 0.14) }}
            />
          ) : (
            <rect
              key={i}
              x={b.x}
              y={b.y}
              width={b.w}
              height="3.5"
              rx="1.5"
              transform={`rotate(${b.a} ${b.x} ${b.y})`}
              style={{ fill: pigment(b.c, 0.7, 0.14) }}
            />
          ),
        )}
      </>
    );
  } else if (design.art === "linen") {
    const lines: string[] = [];
    for (let i = -202; i < 320; i += 7) lines.push(`M${i} 0 L${i + 202} 202`);
    for (let i = 0; i < 522; i += 7) lines.push(`M${i} 0 L${i - 202} 202`);
    body = (
      <>
        <rect
          width="320"
          height="202"
          style={{ fill: pigment(t, 0.93, 0.035) }}
        />
        <path
          d={lines.join(" ")}
          strokeWidth="0.6"
          style={{ stroke: pigment(t, 0.82, 0.05) }}
        />
        <rect
          x="12"
          y="12"
          width="296"
          height="178"
          rx="10"
          fill="none"
          strokeWidth="1.4"
          strokeDasharray="5 4"
          style={{ stroke: pigment(t, 0.6, 0.08) }}
        />
      </>
    );
  } else if (design.art === "night") {
    const stars = Array.from({ length: 40 }, () => ({
      x: Math.round(next() * 320),
      y: Math.round(next() * 150),
      r: r2(0.5 + next() * 1.3),
    }));
    body = (
      <>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: pigment(t, 0.24, 0.07) }} />
            <stop offset="1" style={{ stopColor: pigment(t, 0.36, 0.1) }} />
          </linearGradient>
        </defs>
        <rect width="320" height="202" fill={`url(#${gid})`} />
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            style={{ fill: pigment("var(--warn)", 0.95, 0.04) }}
          />
        ))}
        <circle
          cx="250"
          cy="56"
          r="20"
          style={{ fill: pigment("var(--warn)", 0.93, 0.06) }}
        />
        <circle
          cx="259"
          cy="50"
          r="18"
          style={{ fill: pigment(t, 0.27, 0.08) }}
        />
        <path
          d="M0 202 L0 170 L40 160 L70 168 L110 150 L150 165 L190 152 L230 166 L270 156 L320 168 L320 202 Z"
          style={{ fill: pigment(t, 0.18, 0.05) }}
        />
      </>
    );
  } else if (design.art === "bloom") {
    const flowers = Array.from({ length: 9 }, () => ({
      x: Math.round(next() * 300 + 10),
      y: Math.round(next() * 180 + 10),
      r: Math.round(10 + next() * 14),
      a: Math.round(next() * 72),
    }));
    body = (
      <>
        <rect
          width="320"
          height="202"
          style={{ fill: pigment(t, 0.95, 0.025) }}
        />
        {flowers.map((f, i) => (
          <g key={i} transform={`rotate(${f.a} ${f.x} ${f.y})`}>
            {[0, 72, 144, 216, 288].map((deg) => (
              <ellipse
                key={deg}
                cx={f.x}
                cy={r2(f.y - f.r * 0.55)}
                rx={r2(f.r * 0.36)}
                ry={r2(f.r * 0.56)}
                transform={`rotate(${deg} ${f.x} ${f.y})`}
                style={{ fill: pigment(t, 0.74 + (i % 3) * 0.04, 0.1) }}
              />
            ))}
            <circle
              cx={f.x}
              cy={f.y}
              r={r2(f.r * 0.26)}
              style={{ fill: pigment("var(--warn)", 0.8, 0.12) }}
            />
          </g>
        ))}
      </>
    );
  } else {
    const wave = (base: number, amp: number, k: number, phase: number) => {
      let d = `M0 202 L0 ${base}`;
      for (let x = 0; x <= 320; x += 10) {
        d += ` L${x} ${r2(base + amp * Math.sin((x / 320) * Math.PI * k + phase))}`;
      }
      return `${d} L320 202 Z`;
    };
    body = (
      <>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: pigment(t, 0.9, 0.05) }} />
            <stop offset="1" style={{ stopColor: pigment(t, 0.74, 0.08) }} />
          </linearGradient>
        </defs>
        <rect width="320" height="202" fill={`url(#${gid})`} />
        <path d={wave(98, 8, 4, 0)} style={{ fill: pigment(t, 0.7, 0.08) }} />
        <path
          d={wave(124, 9, 3, 1.4)}
          style={{ fill: pigment(t, 0.6, 0.09) }}
        />
        <path
          d={wave(152, 8, 5, 2.6)}
          style={{ fill: pigment(t, 0.5, 0.09) }}
        />
        <path
          d={wave(176, 6, 4, 0.8)}
          style={{ fill: pigment(t, 0.42, 0.08) }}
        />
      </>
    );
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 320 202"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block size-full", className)}
    >
      {body}
    </svg>
  );
}

/* ----------------------------- small pieces ------------------------------ */

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function RollDigit({
  digit,
  motionSafe,
}: {
  digit: number;
  motionSafe: boolean;
}) {
  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ height: "1em", lineHeight: 1 }}
    >
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-digit}em` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((n) => (
          <span key={n} style={{ height: "1em", lineHeight: 1 }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** A figure whose digits roll on snap, keyed from the right. */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = Array.from(text);
  return (
    <span className={cn("relative inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span
        aria-hidden
        className="inline-flex"
        style={{ height: "1em", lineHeight: 1 }}
      >
        {chars.map((ch, i) => {
          const key = chars.length - i;
          return /\d/.test(ch) ? (
            <RollDigit
              key={`d${key}`}
              digit={Number(ch)}
              motionSafe={motionSafe}
            />
          ) : (
            <span key={`c${key}${ch}`} style={{ height: "1em", lineHeight: 1 }}>
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}

function Spinner({ spin }: { spin: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn("size-4 shrink-0", spin && "animate-spin")}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Arrow keys, Home and End over a radiogroup: selection follows focus. */
function radioKeys(
  event: React.KeyboardEvent,
  index: number,
  count: number,
  choose: (i: number) => void,
) {
  let to = -1;
  if (event.key === "ArrowRight" || event.key === "ArrowDown")
    to = (index + 1) % count;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    to = (index - 1 + count) % count;
  else if (event.key === "Home") to = 0;
  else if (event.key === "End") to = count - 1;
  if (to === -1) return;
  event.preventDefault();
  choose(to);
  const group = (event.currentTarget as HTMLElement).closest(
    "[role='radiogroup']",
  );
  group?.querySelectorAll<HTMLElement>("[role='radio']")[to]?.focus();
}

/* ------------------------------- the card -------------------------------- */

type Layer = {
  key: number;
  design: GiftDesign;
  x: number;
  y: number;
  r: number;
};

/** A design arriving over the last: a circle that grows from the swatch's side. */
function WipeLayer({
  layer,
  motionSafe,
  onDone,
}: {
  layer: Layer;
  motionSafe: boolean;
  onDone: (key: number) => void;
}) {
  const p = useMotionValue(layer.key === 0 ? 1 : 0);
  React.useEffect(() => {
    if (p.get() >= 1) return;
    const a = motionSafe
      ? animate(p, 1, { ...springs.glide, onComplete: () => onDone(layer.key) })
      : animate(p, 1, {
          duration: durations.fast,
          ease: easings.enter,
          onComplete: () => onDone(layer.key),
        });
    return () => a.stop();
    // A re-run carries the wipe on from where it got to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionSafe]);
  const clip = useTransform(p, (v) =>
    !motionSafe || v >= 0.999
      ? "none"
      : `circle(${r2(v * layer.r)}px at ${r2(layer.x)}px ${r2(layer.y)}px)`,
  );
  const opacity = useTransform(p, (v) => (motionSafe ? 1 : r2(v)));
  return (
    <motion.div
      className="absolute inset-0"
      style={{ clipPath: clip, opacity }}
    >
      <DesignArt design={layer.design} />
    </motion.div>
  );
}

type CardProps = {
  value: GiftValue;
  design: GiftDesign;
  designOptions: GiftDesign[];
  brand: string;
  priceText: string;
  sendText: string;
  code: string;
  flip: GiftFlip;
  pickMode: GiftDesignPicker;
  side: GiftSide;
  wrapped: boolean;
  layers: Layer[];
  onLayerDone: (key: number) => void;
  onSwipe: (designId: string) => void;
  onMeasure: (w: number, h: number) => void;
  bindCard: (node: HTMLDivElement | null) => void;
  motionSafe: boolean;
  disabled: boolean;
  ink: { from: number; text: string };
  writing: boolean;
  maxMessage: number;
  label: string;
};

function CardFront({
  value,
  design,
  designOptions,
  brand,
  priceText,
  pickMode,
  wrapped,
  layers,
  onLayerDone,
  pos,
  glare,
  motionSafe,
}: Pick<
  CardProps,
  | "value"
  | "design"
  | "designOptions"
  | "brand"
  | "priceText"
  | "pickMode"
  | "wrapped"
  | "layers"
  | "onLayerDone"
  | "motionSafe"
> & { pos: MotionValue<string>; glare: MotionValue<string> }) {
  const dark = DARK_ART.includes(design.art);
  return (
    <div className="absolute inset-0 overflow-hidden rounded-4 shadow-[0_10px_22px_color-mix(in_oklab,black_16%,transparent)]">
      {pickMode === "swipe" ? (
        <motion.div className="absolute inset-0" style={{ x: pos }}>
          {designOptions.map((d, i) => (
            <div
              key={d.id}
              className="absolute inset-y-0 w-full"
              style={{ left: `${i * 100}%` }}
            >
              <DesignArt design={d} />
            </div>
          ))}
        </motion.div>
      ) : (
        layers.map((layer) => (
          <WipeLayer
            key={layer.key}
            layer={layer}
            motionSafe={motionSafe}
            onDone={onLayerDone}
          />
        ))
      )}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: glare }}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col justify-between p-[6%]",
          dark
            ? "text-[oklch(from_var(--ink)_0.97_0.01_h)]"
            : "text-[oklch(from_var(--ink)_0.22_0.02_h)]",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold tracking-[0.18em] uppercase">
            {brand}
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase opacity-80">
            Gift card
          </span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div
            className="flex flex-col gap-1 rounded-3 px-2.5 py-1.5 backdrop-blur-sm"
            style={{
              background: dark
                ? "color-mix(in oklab, black 22%, transparent)"
                : "color-mix(in oklab, white 55%, transparent)",
            }}
          >
            {value.to.trim() ? (
              <span className="max-w-[9rem] truncate text-[11px] leading-none opacity-80">
                For {value.to.trim()}
              </span>
            ) : null}
            <Roll
              text={priceText}
              motionSafe={motionSafe}
              className="font-mono text-[26px] font-semibold"
            />
          </div>
          <span
            aria-hidden
            className="mb-1 grid grid-cols-2 gap-0.5 opacity-70"
          >
            <span className="size-2.5 rounded-[3px] border border-current" />
            <span className="size-2.5 rounded-[3px] border border-current" />
          </span>
        </div>
      </div>
      <Wrap
        wrapped={wrapped}
        brand={brand}
        design={design}
        motionSafe={motionSafe}
      />
    </div>
  );
}

/** The finish: a paper band wraps across, and the seal lands on it. */
function Wrap({
  wrapped,
  brand,
  design,
  motionSafe,
}: {
  wrapped: boolean;
  brand: string;
  design: GiftDesign;
  motionSafe: boolean;
}) {
  return (
    <AnimatePresence>
      {wrapped ? (
        <motion.div
          key="wrap"
          className="pointer-events-none absolute inset-0"
          exit={{ opacity: 0, transition: exitFor(durations.base) }}
        >
          <motion.div
            className="absolute inset-x-0 top-[38%] h-[26%] origin-left"
            style={{
              background: pigment(design.tint, 0.88, 0.04),
              boxShadow:
                "0 1px 3px color-mix(in oklab, black 18%, transparent)",
            }}
            initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
            animate={motionSafe ? { scaleX: 1 } : { opacity: 1 }}
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
          />
          <motion.div
            className="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 font-mono text-lg font-bold"
            style={{
              background: pigment(design.tint, 0.5, 0.12),
              borderColor: pigment(design.tint, 0.4, 0.1),
              color: STOCK,
              boxShadow:
                "0 2px 6px color-mix(in oklab, black 24%, transparent)",
            }}
            initial={
              motionSafe
                ? { scale: 1.6, rotate: -14, opacity: 0 }
                : { opacity: 0 }
            }
            animate={
              motionSafe ? { scale: 1, rotate: 0, opacity: 1 } : { opacity: 1 }
            }
            transition={
              motionSafe
                ? {
                    scale: { ...springs.recoil, delay: 0.28 },
                    rotate: { ...springs.recoil, delay: 0.28 },
                    opacity: { duration: durations.blink, delay: 0.28 },
                  }
                : { duration: durations.fast, delay: 0.1 }
            }
          >
            {brand.charAt(0).toUpperCase()}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CardBack({
  value,
  brand,
  sendText,
  code,
  ink,
  writing,
  maxMessage,
  motionSafe,
}: Pick<
  CardProps,
  | "value"
  | "brand"
  | "sendText"
  | "code"
  | "ink"
  | "writing"
  | "maxMessage"
  | "motionSafe"
>) {
  const message = value.message.slice(0, maxMessage);
  const n = message.length;
  const size = n <= 60 ? 15 : n <= 110 ? 13 : n <= 150 ? 12 : 11;
  const from = ink.text === value.message ? clamp(ink.from, 0, n) : n;
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden rounded-4 p-[6%] shadow-[0_10px_22px_color-mix(in_oklab,black_16%,transparent)]"
      style={{ background: STOCK, color: STOCK_INK }}
    >
      <p className="text-[12px] italic opacity-80">
        To {value.to.trim() || "…"},
      </p>
      {/* The rules share the text's line height, so the words sit on them
          whatever size the message has shrunk to. */}
      <motion.p
        className="mt-1 flex-1 overflow-hidden whitespace-pre-wrap italic"
        initial={false}
        animate={{ fontSize: `${size}px` }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        style={{
          lineHeight: "20px",
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 19px, color-mix(in oklab, var(--accent-bright) 16%, transparent) 19px 20px)",
        }}
      >
        {motionSafe
          ? // Every character stays the same kind of node, so one still inking
            // keeps its fade when the next is typed.
            Array.from(message).map((ch, i) => (
              <motion.span
                key={i}
                initial={
                  i >= from ? { opacity: 0, filter: "blur(2px)" } : false
                }
                animate={{ opacity: 1, filter: "blur(0px)" }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                {ch}
              </motion.span>
            ))
          : message}
        {writing ? (
          <motion.span
            aria-hidden
            className="ml-px inline-block h-[1em] w-px translate-y-[0.15em] bg-current align-baseline"
            animate={motionSafe ? { opacity: [1, 0, 1] } : { opacity: 1 }}
            transition={
              motionSafe
                ? { duration: 1, repeat: Infinity, ease: "linear" }
                : { duration: 0 }
            }
          />
        ) : null}
      </motion.p>
      <p className="text-right text-[12px] italic opacity-80">
        — {value.from.trim() || "…"}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-current/15 pt-1.5 font-mono text-[9px] tracking-[0.08em] uppercase opacity-70">
        <span className="truncate">{sendText.replace(" · by email", "")}</span>
        <span className="shrink-0">
          {brand} · •••• {code}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- the builder ----------------------------- */

type Said = { n: number; text: string };

/**
 * A gift card you build by looking at it. The amount rolls onto the card's
 * face digit by digit on snap; a design wipes across it as a circle growing
 * on glide from the side its swatch sits on (or slides in under your thumb
 * when you swipe the card itself); writing the message turns the card over on
 * glide and each new run of characters inks onto the back as you type, the
 * type shrinking on glide as the message grows. The card tilts toward the
 * pointer on snap with a glare that follows it.
 *
 * Add to bag runs your promise; when it lands the card turns to its front, a
 * paper band wraps across it on glide and the seal lands on recoil. Every
 * choice is a real radiogroup, slider or field, and the card's turns follow
 * the fields focus is in. Under reduced motion nothing tilts, turns or wipes:
 * faces and designs cross-fade, and every figure and word still shows.
 */
export function GiftBuilder({
  flip = "turn",
  designs = "swatches",
  amount = "chips",
  designOptions = defaultGiftDesigns,
  amounts = [25, 50, 100, 150],
  min = 10,
  max = 500,
  step = 5,
  value,
  defaultValue = defaultGiftValue,
  onValueChange,
  side,
  defaultSide = "front",
  onSideChange,
  onSubmit,
  state,
  onStateChange,
  onReset,
  brand = "Fernworks",
  maxMessage = 180,
  scheduleDays = 14,
  now = defaultGiftNow,
  formatPrice = usd,
  title = "Send a gift card",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: GiftBuilderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const today = dayOf(toMs(now));
  const lo = Math.max(1, Math.min(min, max));
  const hi = Math.max(lo + 1, max);

  const [own, setOwn] = React.useState<GiftValue>(defaultValue);
  const gift = value ?? own;
  const [ownSide, setOwnSide] = React.useState<GiftSide>(defaultSide);
  const shownSide: GiftSide = flip === "none" ? "front" : (side ?? ownSide);
  const [ownState, setOwnState] = React.useState<GiftState>("idle");
  const phase = state ?? ownState;
  const design =
    designOptions.find((d) => d.id === gift.design) ??
    designOptions[0] ??
    defaultGiftDesigns[0]!;
  const designIndex = Math.max(
    0,
    designOptions.findIndex((d) => d.id === design.id),
  );

  const [customOpen, setCustomOpen] = React.useState(
    () => !amounts.includes(defaultValue.amount),
  );
  const [customText, setCustomText] = React.useState(() =>
    amounts.includes(defaultValue.amount) ? "" : String(defaultValue.amount),
  );
  const [ink, setInk] = React.useState({
    from: gift.message.length,
    text: gift.message,
  });
  const [writing, setWriting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // Each design that arrives is a layer over the last; the wipe's origin is
  // set by whatever chose it.
  const [card, setCard] = React.useState({ w: 320, h: 202 });
  const [origin, setOrigin] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  const [layers, setLayers] = React.useState<Layer[]>(() => [
    { key: 0, design, x: 160, y: 101, r: 0 },
  ]);
  const top = layers[layers.length - 1];
  if (top && top.design.id !== design.id) {
    const o = origin ?? { x: card.w / 2, y: card.h / 2 };
    const r = Math.max(
      Math.hypot(o.x, o.y),
      Math.hypot(card.w - o.x, o.y),
      Math.hypot(o.x, card.h - o.y),
      Math.hypot(card.w - o.x, card.h - o.y),
    );
    setLayers([
      ...layers.slice(-2),
      { key: top.key + 1, design, x: o.x, y: o.y, r: r2(r) },
    ]);
    setOrigin(null);
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const [cardNode, setCardNode] = React.useState<HTMLDivElement | null>(null);
  // One stable callback for the card's whole life: a motion element binds
  // its ref once.
  const bindCard = React.useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node;
    setCardNode(node);
  }, []);
  const mounted = React.useRef(true);
  const focusDone = React.useRef(false);
  const shake = useMotionValue(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());

  // The turn, the tilt, the glare and the swipe position.
  const turn = useMotionValue(shownSide === "back" ? 180 : 0);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(30);
  const glareOn = useMotionValue(0);
  const give = useMotionValue(0);
  const pos = useMotionValue(designIndex);
  const swiping = React.useRef<{ start: number; w: number } | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  React.useEffect(() => {
    mounted.current = true;
    const running = anims.current;
    return () => {
      mounted.current = false;
      for (const a of running.values()) a.stop();
      running.clear();
    };
  }, []);

  // The card turns to whatever face is shown, from wherever it is.
  React.useEffect(() => {
    const to = shownSide === "back" ? 180 : 0;
    if (!motionSafe || flip === "none") {
      turn.jump(to);
      return;
    }
    const a = animate(turn, to, springs.glide);
    return () => a.stop();
  }, [shownSide, motionSafe, flip, turn]);

  // The swipe track follows the design, however it was chosen.
  React.useEffect(() => {
    if (swiping.current) return;
    if (!motionSafe) {
      pos.jump(designIndex);
      return;
    }
    const a = animate(pos, designIndex, springs.glide);
    return () => a.stop();
  }, [designIndex, motionSafe, pos]);

  React.useEffect(() => {
    if (!cardNode) return;
    const ro = new ResizeObserver(() => {
      setCard({ w: r2(cardNode.clientWidth), h: r2(cardNode.clientHeight) });
    });
    ro.observe(cardNode);
    return () => ro.disconnect();
  }, [cardNode]);

  const update = (next: GiftValue) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const setSideTo = (next: GiftSide, el?: Element | null) => {
    if (flip === "none" || next === shownSide) return;
    const rect = el?.getBoundingClientRect();
    audio.play("paper", {
      pitch: next === "back" ? 1.05 : 0.92,
      gain: 0.4,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    if (side === undefined) setOwnSide(next);
    onSideChange?.(next);
  };

  const setPhase = (next: GiftState) => {
    if (state === undefined) setOwnState(next);
    onStateChange?.(next);
  };

  /* ------------------------------- choices ------------------------------- */

  const setAmount = (v: number, el?: Element | null, quiet = false) => {
    const a = Math.round(clamp(v, lo, hi) * 100) / 100;
    if (disabled || a === gift.amount) return;
    if (!quiet) {
      const rect = el?.getBoundingClientRect();
      audio.play("swish", {
        pitch: 1.3,
        gain: 0.25,
        pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
      });
    }
    setErrors((e) => ({ ...e, amount: "" }));
    update({ ...gift, amount: a });
  };

  const chooseDesign = (d: GiftDesign, el?: HTMLElement | null) => {
    if (disabled || d.id === gift.design) return;
    const c = cardRef.current?.getBoundingClientRect();
    const s = el?.getBoundingClientRect();
    if (c && s) {
      setOrigin({
        x: r2(clamp(s.left + s.width / 2 - c.left, -20, c.width + 20)),
        y: r2(clamp(s.top + s.height / 2 - c.top, -20, c.height + 20)),
      });
    }
    audio.play("swish", {
      pitch: 0.9 + designOptions.indexOf(d) * 0.05,
      gain: 0.5,
      pan: s ? panFrom(s.left + s.width / 2, null) : 0,
    });
    setSideTo("front", el);
    update({ ...gift, design: d.id });
    say(`${d.name} design.`);
  };

  /* --------------------------------- tilt -------------------------------- */

  const onCardMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== "mouse" ||
      !motionSafe ||
      swiping.current ||
      phase === "done"
    )
      return;
    const r = event.currentTarget.getBoundingClientRect();
    const px = clamp((event.clientX - r.left) / r.width, 0, 1);
    const py = clamp((event.clientY - r.top) / r.height, 0, 1);
    run("tx", animate(tiltX, r2((0.5 - py) * 12), springs.snap));
    run("ty", animate(tiltY, r2((px - 0.5) * 12), springs.snap));
    glareX.set(r2(px * 100));
    glareY.set(r2(py * 100));
    run("glare", animate(glareOn, 1, { duration: durations.base }));
  };
  const onCardLeave = () => {
    run("tx", animate(tiltX, 0, springs.snap));
    run("ty", animate(tiltY, 0, springs.snap));
    run("glare", animate(glareOn, 0, { duration: durations.base }));
  };

  /* -------------------------------- swipe -------------------------------- */

  const n = designOptions.length;
  const swipe = useDrag({
    axis: "x",
    threshold: 4,
    disabled:
      disabled ||
      designs !== "swipe" ||
      shownSide !== "front" ||
      phase === "done",
    onStart: ({ event }) => {
      const w =
        (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
          .width || card.w;
      swiping.current = { start: pos.get(), w };
      onCardLeave();
    },
    onMove: ({ offset }) => {
      const g = swiping.current;
      if (!g) return;
      const raw = g.start - offset.x / g.w;
      const v =
        raw < 0
          ? rubberband(raw, 1)
          : raw > n - 1
            ? n - 1 + rubberband(raw - (n - 1), 1)
            : raw;
      pos.set(Number(v.toFixed(4)));
    },
    onEnd: ({ velocity }) => {
      const g = swiping.current;
      swiping.current = null;
      if (!g) return;
      const landing = -project(-pos.get() * g.w, velocity.x, 0.99) / g.w;
      const base = Math.round(g.start);
      const to = clamp(
        Math.round(landing),
        Math.max(0, base - 1),
        Math.min(n - 1, base + 1),
      );
      const target = designOptions[to];
      const v = -velocity.x / g.w;
      run(
        "pos",
        motionSafe
          ? animate(pos, to, { ...springs.glide, velocity: v })
          : animate(pos, to, { duration: 0 }),
      );
      if (target && target.id !== gift.design) {
        audio.play("swish", { pitch: 0.9 + to * 0.05, gain: 0.5 });
        update({ ...gift, design: target.id });
        say(`${target.name} design.`);
      }
    },
    onCancel: () => {
      swiping.current = null;
      run("pos", animate(pos, designIndex, springs.glide));
    },
  });

  /* -------------------------------- submit ------------------------------- */

  const validate = () => {
    const e: Record<string, string> = {};
    if (!(gift.amount >= lo && gift.amount <= hi))
      e.amount = `Choose ${formatPrice(lo)} to ${formatPrice(hi)}.`;
    if (customOpen && amount === "chips") {
      const typed = Number(customText.replace(/[^0-9.]/g, ""));
      if (!customText.trim() || !(typed >= lo && typed <= hi))
        e.amount = `Enter ${formatPrice(lo)} to ${formatPrice(hi)}.`;
    }
    if (!gift.to.trim()) e.to = "Who is it for?";
    if (!gift.from.trim()) e.from = "Who is it from?";
    if (!EMAIL.test(gift.email.trim()))
      e.email = "Enter an email address like name@example.com.";
    return e;
  };

  const submit = (el: HTMLElement) => {
    if (disabled || phase === "pending" || phase === "done") return;
    const e = validate();
    const bad = Object.keys(e).filter((k) => e[k]);
    setErrors(e);
    setFailure(null);
    if (bad.length) {
      const first = bad[0];
      say(
        `${bad.length} ${bad.length === 1 ? "field needs" : "fields need"} attention.`,
      );
      audio.play("swish", { pitch: 0.6, gain: 0.3 });
      if (motionSafe)
        run(
          "shake",
          animate(shake, [0, -6, 6, -3, 0], {
            duration: 0.32,
            ease: "easeOut",
          }),
        );
      if (first === "to" || first === "from") setSideTo("back", el);
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-gift-field="${first}"]`)
        ?.focus();
      return;
    }
    const finish = () => {
      if (!mounted.current) return;
      focusDone.current = true;
      setSideTo("front", null);
      setPhase("done");
      audio.play("paper", { pitch: 0.85, gain: 0.55 });
      if (motionSafe) {
        run(
          "give",
          animate(give, [0, 2, 0], {
            duration: 0.42,
            delay: 0.3,
            ease: easings.move,
          }),
        );
      }
      say(
        `Added to bag. ${gift.to.trim()} gets it ${sendLine(gift.sendOn, true)}.`,
      );
    };
    const result = onSubmit?.(gift);
    if (result && typeof (result as Promise<void>).then === "function") {
      setPhase("pending");
      say("Adding to bag.");
      (result as Promise<void>).then(finish, (err: unknown) => {
        if (!mounted.current) return;
        setPhase("error");
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "The gift card could not be added. Try again.";
        setFailure(msg);
        say(msg);
      });
      return;
    }
    finish();
  };

  const reset = () => {
    setPhase("idle");
    setFailure(null);
    setErrors({});
    onReset?.();
    say("Ready for another gift card.");
  };

  const sendLine = (iso: string | null, lower = false) => {
    const d = iso ? dayOfIso(iso) : null;
    if (d === null || d <= today)
      return lower ? "today by email" : "Arrives today by email";
    return `${lower ? "on" : "Arrives"} ${dayText(d)}${lower ? "" : " · by email"}`;
  };

  // Focus moves to the confirmation as it arrives.
  const doneRef = React.useCallback((node: HTMLHeadingElement | null) => {
    if (!node || !focusDone.current) return;
    focusDone.current = false;
    node.focus({ preventScroll: true });
  }, []);

  /* ------------------------------ derived ------------------------------- */

  const code = React.useMemo(() => {
    const next = seeded(hash(`${gift.to}|${gift.from}`));
    return Array.from(
      { length: 4 },
      () => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(next() * 32)] ?? "X",
    ).join("");
  }, [gift.to, gift.from]);
  const priceText = formatPrice(gift.amount);
  const cardName = `${brand} gift card, ${priceText}, ${design.name} design${gift.to.trim() ? `, for ${gift.to.trim()}` : ""}${phase === "done" ? ", wrapped" : ""}`;

  // Reduced motion: the card never rotates; its faces cross-fade instead.
  const rotX = useTransform(
    [turn, tiltX] as MotionValue<number>[],
    ([t = 0, x = 0]: number[]) =>
      !motionSafe ? 0 : flip === "tumble" ? r2(t + x) : r2(x),
  );
  const rotY = useTransform(
    [turn, tiltY] as MotionValue<number>[],
    ([t = 0, y = 0]: number[]) =>
      !motionSafe ? 0 : flip === "tumble" ? r2(y) : r2(t + y),
  );
  const glare = useTransform(
    [glareX, glareY, glareOn] as MotionValue<number>[],
    ([x = 50, y = 30, o = 0]: number[]) =>
      o < 0.01
        ? "none"
        : `radial-gradient(circle at ${r2(x)}% ${r2(y)}%, color-mix(in oklab, white ${Math.round(34 * o)}%, transparent), transparent 58%)`,
  );
  const trackX = useTransform(pos, (p) => `${r2(-p * 100)}%`);

  const wrapped = phase === "done";
  const sendText = sendLine(gift.sendOn);

  const frontProps = {
    value: gift,
    design,
    designOptions,
    brand,
    priceText,
    pickMode: designs,
    wrapped,
    layers,
    onLayerDone: (key: number) =>
      setLayers((ls) => {
        const i = ls.findIndex((l) => l.key === key);
        return i > 0 ? ls.slice(i) : ls;
      }),
    motionSafe,
    pos: trackX,
    glare,
  };
  const backProps = {
    value: gift,
    brand,
    sendText,
    code,
    ink,
    writing,
    maxMessage,
    motionSafe,
  };

  const cardFace = (
    <motion.div
      ref={bindCard}
      role="img"
      aria-label={cardName}
      {...swipe}
      onPointerMove={(event) => {
        swipe.onPointerMove(event);
        onCardMove(event);
      }}
      onPointerLeave={onCardLeave}
      className={cn(
        "relative aspect-[1.586] w-full select-none",
        designs === "swipe" && shownSide === "front" && !wrapped
          ? "cursor-grab touch-pan-y active:cursor-grabbing"
          : "",
      )}
      style={{
        rotateX: rotX,
        rotateY: rotY,
        y: give,
        // No filter here: a filter flattens 3D, and the hidden backface with it.
        transformStyle: "preserve-3d",
      }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
        initial={false}
        animate={{ opacity: motionSafe || shownSide === "front" ? 1 : 0 }}
        transition={{ duration: durations.fast }}
      >
        <CardFront {...frontProps} />
      </motion.div>
      {flip !== "none" ? (
        <motion.div
          className="absolute inset-0"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            rotateX: motionSafe && flip === "tumble" ? 180 : 0,
            rotateY: motionSafe && flip !== "tumble" ? 180 : 0,
          }}
          initial={false}
          animate={{ opacity: motionSafe || shownSide === "back" ? 1 : 0 }}
          transition={{ duration: durations.fast }}
        >
          <CardBack {...backProps} />
        </motion.div>
      ) : null}
    </motion.div>
  );

  /* -------------------------------- pickers ------------------------------ */

  const designPicker =
    designs === "swipe" ? (
      <div
        role="radiogroup"
        aria-label="Design"
        className="flex items-center justify-center gap-1.5"
      >
        {designOptions.map((d, i) => {
          const on = d.id === design.id;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={d.name}
              tabIndex={on ? 0 : -1}
              onClick={(event) => chooseDesign(d, event.currentTarget)}
              onKeyDown={(event) =>
                radioKeys(event, i, n, (to) => {
                  const next = designOptions[to];
                  if (next) chooseDesign(next, event.currentTarget);
                })
              }
              className={cn(
                "flex size-6 items-center justify-center rounded-full",
                RING,
              )}
            >
              <motion.span
                aria-hidden
                className={cn(
                  "block h-1.5 rounded-full",
                  on ? "bg-cobalt-bright" : "bg-ink-3/40",
                )}
                initial={false}
                animate={{ width: on ? 16 : 6 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            </button>
          );
        })}
      </div>
    ) : (
      <div
        role="radiogroup"
        aria-label="Design"
        className={cn(
          "flex flex-wrap",
          designs === "tiles" ? "gap-2" : "gap-2.5",
        )}
      >
        {designOptions.map((d, i) => {
          const on = d.id === design.id;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={d.name}
              title={d.name}
              tabIndex={on ? 0 : -1}
              onClick={(event) => chooseDesign(d, event.currentTarget)}
              onKeyDown={(event) =>
                radioKeys(event, i, n, (to) => {
                  const next = designOptions[to];
                  if (next) chooseDesign(next, event.currentTarget);
                })
              }
              className={cn(
                "relative shrink-0 p-[3px]",
                designs === "tiles" ? "rounded-2" : "rounded-full",
                RING,
              )}
            >
              {on ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? `${uid}-design` : undefined}
                  transition={springs.snap}
                  className={cn(
                    "absolute inset-0 border-2 border-cobalt-bright",
                    designs === "tiles" ? "rounded-2" : "rounded-full",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative block overflow-hidden border border-hairline",
                  designs === "tiles"
                    ? "h-9 w-[3.6rem] rounded-[5px]"
                    : "size-8 rounded-full",
                )}
              >
                <DesignArt design={d} />
              </span>
            </button>
          );
        })}
      </div>
    );

  const presetIndex = amounts.indexOf(gift.amount);
  const chipChosen = customOpen ? amounts.length : presetIndex;

  const amountChips = (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-h-amount`}
        className="flex flex-wrap gap-1.5"
      >
        {[...amounts, -1].map((a, i) => {
          const on = i === chipChosen;
          const isCustom = a === -1;
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={on}
              data-gift-field={i === 0 ? "amount" : undefined}
              tabIndex={on || (chipChosen === -1 && i === 0) ? 0 : -1}
              onFocus={(event) => setSideTo("front", event.currentTarget)}
              onClick={(event) => {
                if (isCustom) {
                  setCustomOpen(true);
                  return;
                }
                setCustomOpen(false);
                setAmount(a, event.currentTarget);
              }}
              onKeyDown={(event) =>
                radioKeys(event, i, amounts.length + 1, (to) => {
                  const v = amounts[to];
                  if (v === undefined) setCustomOpen(true);
                  else {
                    setCustomOpen(false);
                    setAmount(v, event.currentTarget);
                  }
                })
              }
              className={cn(
                "relative inline-flex h-9 min-w-14 items-center justify-center rounded-full px-3.5 text-[13px] transition-colors",
                on
                  ? "text-primary-foreground"
                  : "border border-hairline-strong bg-card text-foreground hover:bg-surface-2",
                RING,
              )}
            >
              {on ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? `${uid}-amount` : undefined}
                  transition={springs.snap}
                  className="absolute inset-0 rounded-full bg-cobalt-bright"
                />
              ) : null}
              <span className="relative font-mono tabular-nums">
                {isCustom ? "Custom" : formatPrice(a)}
              </span>
            </button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {customOpen ? (
          <motion.div
            key="custom"
            className="-m-1 overflow-hidden p-1"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
          >
            <label
              htmlFor={`${uid}-custom`}
              className="mb-1 block text-[11px] text-ink-3"
            >
              Amount, {formatPrice(lo)} to {formatPrice(hi)}
            </label>
            <div className="relative w-40">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[13px] text-ink-3"
              >
                $
              </span>
              <input
                id={`${uid}-custom`}
                data-gift-field="custom"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={customText}
                disabled={disabled}
                aria-invalid={!!errors.amount || undefined}
                aria-describedby={
                  errors.amount ? `${uid}-amount-err` : undefined
                }
                onFocus={(event) => setSideTo("front", event.currentTarget)}
                onChange={(event) => {
                  const text = event.currentTarget.value
                    .replace(/[^0-9.]/g, "")
                    .slice(0, 7);
                  setCustomText(text);
                  const v = Number(text);
                  if (text && v >= lo && v <= hi) setAmount(v, null, true);
                }}
                placeholder="75"
                className={cn(
                  "h-9 w-full rounded-2 border bg-card pr-3 pl-6 font-mono text-[13px] text-foreground tabular-nums placeholder:text-ink-3",
                  errors.amount ? "border-danger" : "border-hairline-strong",
                  RING,
                )}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const amountSlider = (
    <AmountSlider
      value={gift.amount}
      lo={lo}
      hi={hi}
      step={step}
      presets={amounts}
      formatPrice={formatPrice}
      labelledBy={`${uid}-h-amount`}
      motionSafe={motionSafe}
      disabled={disabled}
      onFocus={(el) => setSideTo("front", el)}
      onChange={(v) => setAmount(v, null, true)}
      onDetent={(v, el) => {
        const rect = el?.getBoundingClientRect();
        audio.play("swish", {
          pitch: r2(0.8 + toPos(v, lo, hi) * 0.8),
          gain: 0.18,
          pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
        });
      }}
    />
  );

  const field = (
    id: string,
    labelText: string,
    input: React.ReactNode,
    hint?: React.ReactNode,
  ) => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`${uid}-${id}`} className="text-[12px] text-ink-2">
        {labelText}
      </label>
      {input}
      {errors[id] ? (
        <p id={`${uid}-${id}-err`} className="text-[11px] text-danger">
          {errors[id]}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );

  const inputClass = (bad: boolean) =>
    cn(
      "h-9 w-full rounded-2 border bg-card px-3 text-[13px] text-foreground placeholder:text-ink-3",
      bad ? "border-danger" : "border-hairline-strong",
      RING,
    );

  const toBack = (event: React.FocusEvent<HTMLElement>) =>
    setSideTo("back", event.currentTarget);
  const msgLen = gift.message.length;
  const near = msgLen > maxMessage - 20;

  const messageSection = (
    <section aria-labelledby={`${uid}-h-msg`} className="flex flex-col gap-3">
      <h3
        id={`${uid}-h-msg`}
        className="text-[13px] font-medium text-foreground"
      >
        Write
      </h3>
      <div className="grid grid-cols-2 gap-2.5">
        {field(
          "to",
          "To",
          <input
            id={`${uid}-to`}
            data-gift-field="to"
            value={gift.to}
            disabled={disabled}
            autoComplete="off"
            aria-invalid={!!errors.to || undefined}
            aria-describedby={errors.to ? `${uid}-to-err` : undefined}
            onFocus={toBack}
            onChange={(event) => {
              const text = event.currentTarget.value.slice(0, 24);
              setErrors((e) => ({ ...e, to: "" }));
              update({ ...gift, to: text });
            }}
            className={inputClass(!!errors.to)}
          />,
        )}
        {field(
          "from",
          "From",
          <input
            id={`${uid}-from`}
            data-gift-field="from"
            value={gift.from}
            disabled={disabled}
            autoComplete="name"
            aria-invalid={!!errors.from || undefined}
            aria-describedby={errors.from ? `${uid}-from-err` : undefined}
            onFocus={toBack}
            onChange={(event) => {
              const text = event.currentTarget.value.slice(0, 24);
              setErrors((e) => ({ ...e, from: "" }));
              update({ ...gift, from: text });
            }}
            className={inputClass(!!errors.from)}
          />,
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${uid}-msg`} className="text-[12px] text-ink-2">
            Message
          </label>
          <span
            id={`${uid}-msg-count`}
            className={cn(
              "font-mono text-[11px] tabular-nums",
              near ? "text-warn" : "text-ink-3",
            )}
          >
            {msgLen}/{maxMessage}
          </span>
        </div>
        <textarea
          id={`${uid}-msg`}
          data-gift-field="message"
          rows={3}
          value={gift.message}
          disabled={disabled}
          maxLength={maxMessage}
          aria-describedby={`${uid}-msg-count`}
          onFocus={(event) => {
            setWriting(true);
            toBack(event);
          }}
          onBlur={() => setWriting(false)}
          onChange={(event) => {
            const text = event.currentTarget.value.slice(0, maxMessage);
            const before = gift.message;
            // Only what was added at the end inks in; an edit in the middle
            // just reads.
            setInk({
              text,
              from: text.startsWith(before) ? before.length : text.length,
            });
            update({ ...gift, message: text });
          }}
          className={cn(
            "block w-full resize-none rounded-2 border border-hairline-strong bg-card px-3 py-2 text-[13px] leading-relaxed text-foreground",
            RING,
          )}
        />
      </div>
      {field(
        "email",
        "Their email",
        <input
          id={`${uid}-email`}
          data-gift-field="email"
          type="email"
          value={gift.email}
          disabled={disabled}
          autoComplete="off"
          aria-invalid={!!errors.email || undefined}
          aria-describedby={errors.email ? `${uid}-email-err` : undefined}
          onFocus={toBack}
          onChange={(event) => {
            const text = event.currentTarget.value.slice(0, 80);
            setErrors((e) => ({ ...e, email: "" }));
            update({ ...gift, email: text });
          }}
          className={inputClass(!!errors.email)}
        />,
        "We send the card here, with your message.",
      )}
    </section>
  );

  const sendDays = Array.from(
    { length: Math.max(1, scheduleDays) },
    (_, i) => today + 1 + i,
  );
  const scheduled = gift.sendOn !== null;
  const sendDay = gift.sendOn ? dayOfIso(gift.sendOn) : null;

  const deliverySection = (
    <section
      aria-labelledby={`${uid}-h-send`}
      className="flex flex-col gap-2.5"
    >
      <h3
        id={`${uid}-h-send`}
        className="text-[13px] font-medium text-foreground"
      >
        Deliver
      </h3>
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-h-send`}
        className="grid grid-cols-2 gap-1.5"
      >
        {(["now", "later"] as const).map((k, i) => {
          const on = k === "later" ? scheduled : !scheduled;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={(event) => {
                const to = k === "later" ? isoOf(sendDay ?? today + 1) : null;
                if ((to === null) === !scheduled) return;
                audio.play("swish", {
                  pitch: 1.2,
                  gain: 0.2,
                  pan: panFrom(event.clientX, null),
                });
                update({ ...gift, sendOn: to });
              }}
              onKeyDown={(event) =>
                radioKeys(event, i, 2, (to) =>
                  update({
                    ...gift,
                    sendOn: to === 1 ? isoOf(sendDay ?? today + 1) : null,
                  }),
                )
              }
              className={cn(
                "relative h-9 rounded-2 border text-[13px] transition-colors",
                on
                  ? "border-cobalt-bright/60 bg-cobalt-wash text-foreground"
                  : "border-hairline-strong bg-card text-ink-2 hover:bg-surface-2",
                RING,
              )}
            >
              {k === "now" ? "Send now" : "Schedule"}
            </button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {scheduled ? (
          <motion.div
            key="days"
            className="-m-1 overflow-hidden p-1"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
          >
            <div
              role="radiogroup"
              aria-label="Send on"
              className="flex [scrollbar-width:thin] gap-1.5 overflow-x-auto overscroll-x-contain p-1"
            >
              {sendDays.map((d, i) => {
                const on = d === sendDay;
                const date = new Date(d * DAY_MS);
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={dayText(d)}
                    tabIndex={on || (sendDay === null && i === 0) ? 0 : -1}
                    onClick={() => update({ ...gift, sendOn: isoOf(d) })}
                    onKeyDown={(event) =>
                      radioKeys(event, i, sendDays.length, (to) => {
                        const pick = sendDays[to];
                        if (pick !== undefined)
                          update({ ...gift, sendOn: isoOf(pick) });
                      })
                    }
                    className={cn(
                      "flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-2 border transition-colors",
                      on
                        ? "border-cobalt-bright bg-cobalt-bright text-primary-foreground"
                        : "border-hairline bg-card text-foreground hover:bg-surface-2",
                      RING,
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] leading-none",
                        on ? "opacity-90" : "text-ink-3",
                      )}
                    >
                      {(WEEKDAYS[date.getUTCDay()] ?? "").slice(0, 3)}
                    </span>
                    <span className="mt-1 font-mono text-[13px] leading-none tabular-nums">
                      {date.getUTCDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <p className="text-[11px] text-ink-3">{sendLine(gift.sendOn)}.</p>
    </section>
  );

  const submitLabel = `Add to bag · ${formatPrice(gift.amount)}`;
  const pendingLabel = "Adding…";

  const footer = (
    <div className="sticky bottom-0 z-10 -mx-3 flex flex-col gap-2 border-t border-hairline bg-card px-3 pt-3 pb-3 @min-[40rem]:mx-0 @min-[40rem]:px-0">
      {failure ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-[12px] text-danger"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {failure}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12px] text-ink-3">
          {design.name} ·{" "}
          {gift.to.trim() ? `for ${gift.to.trim()}` : "no name yet"}
        </span>
        <button
          type="button"
          aria-busy={phase === "pending" || undefined}
          aria-disabled={disabled || phase === "pending" || undefined}
          onClick={(event) => submit(event.currentTarget)}
          className={cn(
            "inline-grid h-9 shrink-0 items-center rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
            RING,
          )}
        >
          {[submitLabel, pendingLabel].map((text) => {
            const on =
              phase === "pending"
                ? text === pendingLabel
                : text === submitLabel;
            return (
              <span
                key={text}
                aria-hidden={!on || undefined}
                className={cn(
                  "col-start-1 row-start-1 inline-flex items-center justify-center gap-2",
                  !on && "invisible",
                )}
              >
                {text === pendingLabel ? <Spinner spin={motionSafe} /> : null}
                {text}
              </span>
            );
          })}
        </button>
      </div>
    </div>
  );

  const done = (
    <motion.section
      key="done"
      aria-labelledby={`${uid}-h-done`}
      className="flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4"
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              y: { ...springs.glide, delay: 0.5 },
              opacity: { duration: durations.base, delay: 0.5 },
            }
          : { duration: durations.fast }
      }
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-success/15 text-success">
        <Check aria-hidden className="size-4" strokeWidth={2.4} />
      </span>
      <div>
        <h3
          ref={doneRef}
          id={`${uid}-h-done`}
          tabIndex={-1}
          className="text-sm font-medium text-foreground outline-none"
        >
          Added to bag
        </h3>
        <p className="mt-1 text-[12px] leading-snug text-ink-3">
          {gift.to.trim() || "They"} gets a {priceText} {brand} gift card{" "}
          {sendLine(gift.sendOn, true)} at{" "}
          <span className="text-ink-2">{gift.email.trim()}</span>, with your
          message on the back.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
          RING,
        )}
      >
        <RefreshCcw aria-hidden className="size-3.5" />
        Make another
      </button>
    </motion.section>
  );

  const preview = (
    <div className="flex min-w-0 flex-col gap-3 @min-[40rem]:sticky @min-[40rem]:top-0 @min-[40rem]:self-start">
      <div className="px-2 pt-2 pb-1" style={{ perspective: 1100 }}>
        <div className="mx-auto w-full max-w-[19rem] @min-[68rem]:max-w-[24rem]">
          {cardFace}
        </div>
      </div>
      {flip === "none" ? (
        <div className="px-2">
          <div className="relative mx-auto aspect-[1.586] w-full max-w-[19rem] @min-[68rem]:max-w-[24rem]">
            <CardBack {...backProps} />
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        {designPicker}
        {flip !== "none" ? (
          <button
            type="button"
            aria-pressed={shownSide === "back"}
            aria-disabled={disabled || wrapped || undefined}
            onClick={(event) => {
              if (disabled || wrapped) return;
              setSideTo(
                shownSide === "back" ? "front" : "back",
                event.currentTarget,
              );
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              designs === "swipe" && "w-full justify-center",
              RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5 shrink-0" />
            {shownSide === "back" ? "Show front" : "Show back"}
          </button>
        ) : null}
      </div>
    </div>
  );

  const form = (
    <motion.div
      inert={wrapped}
      className="flex min-w-0 flex-col gap-5"
      style={{ x: shake }}
    >
      <div className="grid gap-5 @min-[68rem]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <section
            aria-labelledby={`${uid}-h-amount`}
            className="flex flex-col gap-2.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3
                id={`${uid}-h-amount`}
                className="text-[13px] font-medium text-foreground"
              >
                Amount
              </h3>
              <span className="font-mono text-[12px] text-ink-3 tabular-nums">
                {priceText}
              </span>
            </div>
            {amount === "slider" ? amountSlider : amountChips}
            {errors.amount ? (
              <p id={`${uid}-amount-err`} className="text-[11px] text-danger">
                {errors.amount}
              </p>
            ) : null}
          </section>
          <div className="hidden @min-[68rem]:block">{deliverySection}</div>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {messageSection}
          <div className="@min-[68rem]:hidden">{deliverySection}</div>
        </div>
      </div>
      {footer}
    </motion.div>
  );

  const body = () => {
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className="grid gap-4 p-3 @min-[40rem]:grid-cols-[19rem_minmax(0,1fr)] @min-[40rem]:p-4"
        >
          <p className="sr-only">Loading designs.</p>
          <div className="aspect-[1.586] rounded-4 bg-surface-2" />
          <div className="flex flex-col gap-3">
            <span className="h-9 rounded-2 bg-surface-2" />
            <span className="h-9 w-2/3 rounded-2 bg-surface-2" />
            <span className="h-24 rounded-2 bg-surface-2" />
          </div>
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The designs did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div
        inert={disabled}
        className="grid gap-4 p-3 @min-[40rem]:grid-cols-[19rem_minmax(0,1fr)] @min-[40rem]:p-4 @min-[68rem]:grid-cols-[25rem_minmax(0,1fr)]"
      >
        {preview}
        <div className="min-w-0">
          <AnimatePresence initial={false} mode="popLayout">
            {wrapped ? (
              done
            ) : (
              <motion.div
                key="form"
                exit={{ opacity: 0, transition: exitFor(durations.base) }}
              >
                {form}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    // layoutScroll: the root scrolls, and the pills' layout travel inside it
    // must measure against its scroll position.
    <motion.div
      layoutScroll
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative max-h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            {brand} · sent by email, never expires
          </p>
        </div>
        {status === "ready" ? (
          <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-hairline bg-surface-1 px-2 font-mono text-[11px] text-ink-2 tabular-nums">
            {priceText}
          </span>
        ) : null}
      </header>
      {body()}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </motion.div>
  );
}

/* ------------------------------ amount slider ---------------------------- */

function AmountSlider({
  value,
  lo,
  hi,
  step,
  presets,
  formatPrice,
  labelledBy,
  motionSafe,
  disabled,
  onFocus,
  onChange,
  onDetent,
}: {
  value: number;
  lo: number;
  hi: number;
  step: number;
  presets: number[];
  formatPrice: (v: number) => string;
  labelledBy: string;
  motionSafe: boolean;
  disabled: boolean;
  onFocus: (el: HTMLElement) => void;
  onChange: (v: number) => void;
  onDetent: (v: number, el: HTMLElement | null) => void;
}) {
  const [track, setTrack] = React.useState<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(0);
  const thumb = useMotionValue(0);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const held = React.useRef<{ start: number; last: number } | null>(null);
  const widthRef = React.useRef(0);
  const unit = Math.max(1, step);

  const snapTo = React.useCallback(
    (raw: number) => {
      const near = presets.find((p) => Math.abs(p - raw) <= unit * 0.8);
      if (near !== undefined) return near;
      return clamp(Math.round(raw / unit) * unit, lo, hi);
    },
    [presets, unit, lo, hi],
  );

  React.useEffect(() => {
    if (!track) return;
    const ro = new ResizeObserver(() => {
      const width = r2(track.clientWidth);
      widthRef.current = width;
      setW(width);
    });
    ro.observe(track);
    return () => ro.disconnect();
  }, [track]);

  React.useEffect(() => {
    if (held.current || !w) return;
    anim.current?.stop();
    const to = r2(toPos(value, lo, hi) * w);
    if (!motionSafe || thumb.get() === 0) thumb.jump(to);
    else anim.current = animate(thumb, to, springs.snap);
    return () => anim.current?.stop();
  }, [value, w, lo, hi, motionSafe, thumb]);

  const valueAt = (px: number, width: number) =>
    snapTo(fromPos(px / Math.max(1, width), lo, hi));

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      anim.current?.stop();
      held.current = { start: thumb.get(), last: value };
    },
    onMove: ({ offset, event }) => {
      const g = held.current;
      const width = widthRef.current;
      if (!g || !width) return;
      const raw = g.start + offset.x;
      thumb.set(
        r2(
          raw < 0
            ? rubberband(raw, 40)
            : raw > width
              ? width + rubberband(raw - width, 40)
              : raw,
        ),
      );
      const v = valueAt(clamp(raw, 0, width), width);
      if (v !== g.last) {
        g.last = v;
        onDetent(v, event.currentTarget as HTMLElement | null);
        onChange(v);
      }
    },
    onEnd: ({ velocity }) => {
      const g = held.current;
      held.current = null;
      const width = widthRef.current;
      if (!g || !width) return;
      const v = valueAt(
        clamp(project(thumb.get(), velocity.x, 0.99), 0, width),
        width,
      );
      if (v !== g.last) onChange(v);
      const to = r2(toPos(v, lo, hi) * width);
      anim.current = motionSafe
        ? animate(thumb, to, { ...springs.snap, velocity: velocity.x })
        : animate(thumb, to, { duration: 0 });
    },
    onCancel: () => {
      held.current = null;
      anim.current = animate(
        thumb,
        r2(toPos(value, lo, hi) * widthRef.current),
        springs.snap,
      );
    },
    onTap: (event) => {
      const width = widthRef.current;
      if (!track || !width) return;
      const rect = track.getBoundingClientRect();
      const v = valueAt(clamp(event.clientX - rect.left, 0, width), width);
      if (v === value) return;
      onDetent(v, track);
      onChange(v);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let v = value;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") v += unit;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") v -= unit;
    else if (event.key === "PageUp") v += unit * 5;
    else if (event.key === "PageDown") v -= unit * 5;
    else if (event.key === "Home") v = lo;
    else if (event.key === "End") v = hi;
    else return;
    event.preventDefault();
    v = clamp(Math.round(v / unit) * unit, lo, hi);
    if (v === value) return;
    onDetent(v, event.currentTarget);
    onChange(v);
  };

  const fill = useTransform(thumb, (t) => Math.max(0, r2(t)));
  // Labels that would crowd their neighbour are left to the tick alone.
  const labels: { p: number; at: number; edge: "start" | "mid" | "end" }[] = [];
  for (const p of [lo, ...presets.filter((v) => v > lo && v < hi), hi]) {
    const at = toPos(p, lo, hi);
    const prev = labels[labels.length - 1];
    if (prev && p !== hi && at - prev.at < 0.13) continue;
    if (prev && p === hi && at - prev.at < 0.13) labels.pop();
    labels.push({ p, at, edge: p === lo ? "start" : p === hi ? "end" : "mid" });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        {...drag}
        className={cn(
          "relative h-9 touch-pan-y select-none",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <div
          ref={setTrack}
          className="absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-2"
        >
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
            style={{ width: fill }}
          />
          {presets.map((p) => (
            <span
              key={p}
              aria-hidden
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink-3/45"
              style={{ left: `${r2(toPos(p, lo, hi) * 100)}%` }}
            />
          ))}
          <motion.div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            data-gift-field="amount"
            aria-labelledby={labelledBy}
            aria-valuemin={lo}
            aria-valuemax={hi}
            aria-valuenow={value}
            aria-valuetext={formatPrice(value)}
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            onFocus={(event) => onFocus(event.currentTarget)}
            className={cn(
              "absolute top-1/2 left-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cobalt-bright bg-card shadow-[0_1px_4px_color-mix(in_oklab,black_18%,transparent)]",
              RING,
            )}
            style={{ x: thumb }}
          />
        </div>
      </div>
      <div aria-hidden className="relative mx-3 h-3">
        {labels.map(({ p, at, edge }) => (
          <span
            key={p}
            className={cn(
              "absolute font-mono text-[10px] leading-none tabular-nums",
              edge === "start"
                ? ""
                : edge === "end"
                  ? "-translate-x-full"
                  : "-translate-x-1/2",
              p === value ? "text-cobalt-bright" : "text-ink-3",
            )}
            style={{ left: `${r2(at * 100)}%` }}
          >
            {formatPrice(p)}
          </span>
        ))}
      </div>
    </div>
  );
}
