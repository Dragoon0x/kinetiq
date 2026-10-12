"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Check,
  Minus,
  Package,
  Plus,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ParcelUnits = "metric" | "imperial";
export type ParcelField = "length" | "width" | "height" | "weight";

/** Always centimetres and kilograms, whatever units are shown. */
export type ParcelValue = {
  length: number;
  width: number;
  height: number;
  weight: number;
};

export type ParcelPreset = {
  id: string;
  /** The preset's name, e.g. "Shoebox". */
  label: string;
  value: ParcelValue;
};

export type ParcelSizeClass =
  "letter" | "small" | "medium" | "large" | "oversize";

/** What a carrier's rate rule is handed: the parcel and what was derived from it. */
export type ParcelQuote = {
  value: ParcelValue;
  sizeClass: ParcelSizeClass;
  /** The longest side, in cm. */
  longest: number;
  /** Twice the sum of the two shorter sides, in cm. */
  girth: number;
  /** Volume over 5000, in kg. */
  volumetric: number;
  /** The greater of the actual and volumetric weights, in kg. */
  billable: number;
};

export type ParcelCarrier = {
  id: string;
  name: string;
  /** The service, e.g. "Express". */
  service: string;
  /** Transit, e.g. "1-2 days". */
  eta: string;
  /** The price for a parcel, or null when the carrier will not take it. */
  rate: (quote: ParcelQuote) => number | null;
};

export type ParcelRate = { carrier: ParcelCarrier; price: number | null };

export type ParcelChange = {
  /** What changed it: typing in a field, stepping one, a preset, or Clear. */
  source: "type" | "step" | "preset" | "clear";
  /** The field, for a typed or stepped change. */
  field?: ParcelField;
  /** The preset's id, for a preset. */
  preset?: string;
};

export type ParcelBoxStyle = "iso" | "flat" | "wire";
export type ParcelDensity = "compact" | "cozy" | "roomy";
export type ParcelStatus = "ready" | "loading" | "error";

export type ParcelSpecProps = {
  /** How the parcel is drawn: three shaded isometric faces, one flat tint, or a wireframe with its hidden edges dashed. @default "iso" */
  boxStyle?: ParcelBoxStyle;
  /** Field heights, row heights and padding. @default "cozy" */
  density?: ParcelDensity;
  /** Controlled dimensions and weight, in centimetres and kilograms whatever units are shown. */
  value?: ParcelValue;
  /** Initial dimensions and weight when uncontrolled. @default defaultParcelValue */
  defaultValue?: ParcelValue;
  /** Fires from the keystroke, step, preset or Clear that changed a field, with the whole value. */
  onChange?: (value: ParcelValue, change: ParcelChange) => void;
  /** Controlled units: centimetres and kilograms, or inches and pounds. */
  units?: ParcelUnits;
  /** Initial units when uncontrolled; a new default shows those units, the way a fresh mount would. @default "metric" */
  defaultUnits?: ParcelUnits;
  /** The units switch was pressed. */
  onUnitsChange?: (units: ParcelUnits) => void;
  /** The presets, as a radio group. @default defaultParcelPresets */
  presets?: ParcelPreset[];
  /** The carriers quoting, each with its rate rule. @default defaultParcelCarriers */
  carriers?: ParcelCarrier[];
  /** Controlled chosen carrier, by id; null for none. */
  carrier?: string | null;
  /** Initial chosen carrier when uncontrolled. @default null */
  defaultCarrier?: string | null;
  /** A carrier row was chosen, with its price at the time. */
  onCarrierChange?: (id: string | null, rate: ParcelRate | null) => void;
  /** Printed before every price. @default "$" */
  currency?: string;
  /** Top of the weight gauge, in kilograms. @default 30 */
  maxWeight?: number;
  /** Whether the rates have arrived: a skeleton while loading, a retry when they failed, with the box still live. @default "ready" */
  status?: ParcelStatus;
  /** Try again was pressed after the rates failed. */
  onRetry?: () => void;
  /** The heading. @default "Parcel" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the form scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be typed, stepped or chosen. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** A shoebox, the middle preset. */
export const defaultParcelValue: ParcelValue = {
  length: 33,
  width: 20,
  height: 12,
  weight: 1.2,
};

/** No dimensions yet: the form's empty state. */
export const emptyParcelValue: ParcelValue = {
  length: 0,
  width: 0,
  height: 0,
  weight: 0,
};

export const defaultParcelPresets: ParcelPreset[] = [
  {
    id: "envelope",
    label: "Envelope",
    value: { length: 35, width: 25, height: 2, weight: 0.3 },
  },
  {
    id: "shoebox",
    label: "Shoebox",
    value: { length: 33, width: 20, height: 12, weight: 1.2 },
  },
  {
    id: "moving",
    label: "Moving box",
    value: { length: 60, width: 40, height: 40, weight: 12 },
  },
];

const r2 = (v: number) => Math.round(v * 100) / 100;

const SURCHARGE: Record<ParcelSizeClass, number> = {
  letter: 0,
  small: 0,
  medium: 2,
  large: 12,
  oversize: 25,
};

/** Five Basinworks Shipping carriers, each with a rule of its own. */
export const defaultParcelCarriers: ParcelCarrier[] = [
  {
    id: "fernmoor",
    name: "Fernmoor Post",
    service: "Standard",
    eta: "3-5 days",
    rate: ({ sizeClass, billable }) =>
      sizeClass === "oversize"
        ? null
        : r2(
            (sizeClass === "letter" ? 1.9 : 4.2) +
              billable * 0.9 +
              (sizeClass === "large" ? 6 : 0),
          ),
  },
  {
    id: "coldbrook",
    name: "Coldbrook Courier",
    service: "Express",
    eta: "1-2 days",
    rate: ({ sizeClass, billable }) =>
      billable > 25 ? null : r2(9.5 + billable * 1.4 + SURCHARGE[sizeClass]),
  },
  {
    id: "basinworks",
    name: "Basinworks Fleet",
    service: "Local",
    eta: "Next day",
    rate: ({ sizeClass, billable }) =>
      sizeClass === "oversize"
        ? null
        : r2(6.8 + Math.max(0, billable - 10) * 0.5),
  },
  {
    id: "gaugeworks",
    name: "Gaugeworks Freight",
    service: "Ground",
    eta: "4-7 days",
    rate: ({ sizeClass, billable }) =>
      sizeClass === "letter" || sizeClass === "small"
        ? null
        : r2(7 + billable * 0.6 + (sizeClass === "oversize" ? 14 : 0)),
  },
  {
    id: "fieldline",
    name: "Fieldline Parcel",
    service: "Economy",
    eta: "5-8 days",
    rate: ({ sizeClass, billable }) =>
      billable > 20 || sizeClass === "oversize"
        ? null
        : r2(3.6 + billable * 0.7 + (sizeClass === "large" ? 5 : 0)),
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const MAX_CM = 400;
const MAX_KG = 250;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const FIELDS: ParcelField[] = ["length", "width", "height", "weight"];

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Number(v.toFixed(3));
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const isLength = (field: ParcelField) => field !== "weight";

const toShown = (field: ParcelField, v: number, units: ParcelUnits) =>
  units === "imperial" ? (isLength(field) ? v / CM_PER_IN : v / KG_PER_LB) : v;

const fromShown = (field: ParcelField, v: number, units: ParcelUnits) =>
  units === "imperial" ? (isLength(field) ? v * CM_PER_IN : v * KG_PER_LB) : v;

const maxOf = (field: ParcelField) => (isLength(field) ? MAX_CM : MAX_KG);

/** One arrow press, in the shown units. */
const stepOf = (field: ParcelField, units: ParcelUnits) =>
  units === "imperial"
    ? isLength(field)
      ? 0.5
      : 0.25
    : isLength(field)
      ? 1
      : 0.1;

const decimalsOf = (field: ParcelField, units: ParcelUnits) =>
  units === "imperial" ? 2 : isLength(field) ? 1 : 2;

/** "33", "12.5", never "33.0". */
const trim = (v: number, decimals: number) => {
  const s = v.toFixed(decimals);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

const shownText = (field: ParcelField, v: number, units: ParcelUnits) =>
  trim(toShown(field, v, units), decimalsOf(field, units));

const UNIT_ABBR: Record<ParcelUnits, { length: string; mass: string }> = {
  metric: { length: "cm", mass: "kg" },
  imperial: { length: "in", mass: "lb" },
};

const UNIT_WORD: Record<ParcelUnits, { length: string; mass: string }> = {
  metric: { length: "centimetres", mass: "kilograms" },
  imperial: { length: "inches", mass: "pounds" },
};

const abbrOf = (field: ParcelField, units: ParcelUnits) =>
  isLength(field) ? UNIT_ABBR[units].length : UNIT_ABBR[units].mass;

const wordOf = (field: ParcelField, units: ParcelUnits) =>
  isLength(field) ? UNIT_WORD[units].length : UNIT_WORD[units].mass;

const FIELD_WORD: Record<ParcelField, string> = {
  length: "Length",
  width: "Width",
  height: "Height",
  weight: "Weight",
};

const CLASS_WORD: Record<ParcelSizeClass, string> = {
  letter: "Letter",
  small: "Small",
  medium: "Medium",
  large: "Large",
  oversize: "Oversize",
};

const DENSITY: Record<
  ParcelDensity,
  {
    field: string;
    row: string;
    preset: string;
    text: string;
    pad: string;
    gap: string;
  }
> = {
  compact: {
    field: "h-8",
    row: "h-8",
    preset: "h-7",
    text: "text-[12px]",
    pad: "px-3 py-2.5",
    gap: "gap-2.5",
  },
  cozy: {
    field: "h-9",
    row: "h-9",
    preset: "h-8",
    text: "text-[13px]",
    pad: "px-4 py-3",
    gap: "gap-3",
  },
  roomy: {
    field: "h-10",
    row: "h-10",
    preset: "h-9",
    text: "text-[13px]",
    pad: "px-5 py-4",
    gap: "gap-4",
  },
};

/** True when there is no box to draw: every side is still zero. */
export const isParcelEmpty = (value: ParcelValue) =>
  value.length <= 0 && value.width <= 0 && value.height <= 0;

const sameValue = (a: ParcelValue, b: ParcelValue) =>
  FIELDS.every((f) => Math.abs(a[f] - b[f]) < 1e-6);

/** The size class a parcel falls in, from its sides alone. */
export function parcelSizeClass(value: ParcelValue): ParcelSizeClass {
  const sides = [value.length, value.width, value.height].sort((a, b) => b - a);
  const [a = 0, b = 0, c = 0] = sides;
  if (a <= 38 && b <= 27 && c <= 3) return "letter";
  const sum = a + b + c;
  if (sum <= 60) return "small";
  if (sum <= 120) return "medium";
  if (sum <= 200) return "large";
  return "oversize";
}

/** Every carrier's price for a parcel, cheapest first, the refusals last. */
export function quoteParcel(
  value: ParcelValue,
  carriers: ParcelCarrier[],
): { quote: ParcelQuote; rates: ParcelRate[] } {
  const sides = [value.length, value.width, value.height].sort((a, b) => b - a);
  const [a = 0, b = 0, c = 0] = sides;
  const volumetric = r4((value.length * value.width * value.height) / 5000);
  const quote: ParcelQuote = {
    value,
    sizeClass: parcelSizeClass(value),
    longest: a,
    girth: 2 * (b + c),
    volumetric,
    billable: Math.max(value.weight, volumetric),
  };
  const empty = isParcelEmpty(value);
  const rates = carriers.map((carrier, i) => ({
    i,
    carrier,
    price: empty ? null : carrier.rate(quote),
  }));
  rates.sort((x, y) => {
    if (x.price === null && y.price === null) return x.i - y.i;
    if (x.price === null) return 1;
    if (y.price === null) return -1;
    return x.price - y.price || x.i - y.i;
  });
  return {
    quote,
    rates: rates.map(({ carrier, price }) => ({ carrier, price })),
  };
}

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

/** Rolls each digit of a formatted number; separators sit still. */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {chars.map((ch, i) => {
        const fromEnd = chars.length - 1 - i;
        if (!/\d/.test(ch)) {
          return (
            <span key={`s${fromEnd}`} style={{ height: `${DIGIT_H}em` }}>
              {ch}
            </span>
          );
        }
        return (
          <span
            key={fromEnd}
            className="relative inline-block overflow-hidden"
            style={{ width: "1ch", height: `${DIGIT_H}em` }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-r3(Number(ch) * DIGIT_H)}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} style={{ height: `${DIGIT_H}em` }}>
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Flip label                                */
/* ----------------------------------------------------------------------- */

/** Turns over about its horizontal axis when its text changes. */
function FlipLabel({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-grid [perspective:360px] [transform-style:preserve-3d]",
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={text}
          initial={{ rotateX: motionSafe ? 90 : 0, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{
            rotateX: motionSafe ? -90 : 0,
            opacity: 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { ...springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
          style={{ originY: 0.5, backfaceVisibility: "hidden" }}
          className="col-start-1 row-start-1 whitespace-nowrap"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Box                                    */
/* ----------------------------------------------------------------------- */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
const VB_W = 240;
const VB_H = 172;
const PAD_X = 34;
const PAD_Y = 22;

type Pt = readonly [number, number];

type Projection = {
  /** Front-top corner, the nearest point. */
  A: Pt;
  /** Right-back top. */
  B: Pt;
  /** Left-back top. */
  C: Pt;
  /** Far top corner. */
  D: Pt;
  /** Front-bottom corner. */
  E: Pt;
  /** Right-bottom. */
  F: Pt;
  /** Left-bottom. */
  G: Pt;
  /** The hidden far-bottom corner. */
  O: Pt;
};

/**
 * A 2:1 isometric projection of an l x w x h box, scaled to fit the stage
 * and centred in it. Length runs to the right and down, width to the left
 * and down, height straight up.
 */
function project(l: number, w: number, h: number): Projection {
  const spanX = (l + w) * COS30;
  const spanY = (l + w) * SIN30 + h;
  const kx = spanX > 0 ? (VB_W - 2 * PAD_X) / spanX : Infinity;
  const ky = spanY > 0 ? (VB_H - 2 * PAD_Y) / spanY : Infinity;
  let k = Math.min(kx, ky);
  if (!Number.isFinite(k)) k = 1;
  const minX = -w * COS30 * k;
  const maxX = l * COS30 * k;
  const minY = -h * k;
  const maxY = (l + w) * SIN30 * k;
  const ox = VB_W / 2 - (minX + maxX) / 2;
  const oy = VB_H / 2 - (minY + maxY) / 2;
  const p = (x: number, y: number, z: number): Pt => [
    r1(ox + (x - y) * COS30 * k),
    r1(oy + (x + y) * SIN30 * k - z * k),
  ];
  return {
    A: p(l, w, h),
    B: p(l, 0, h),
    C: p(0, w, h),
    D: p(0, 0, h),
    E: p(l, w, 0),
    F: p(l, 0, 0),
    G: p(0, w, 0),
    O: p(0, 0, 0),
  };
}

const pt = (p: Pt) => `${p[0]} ${p[1]}`;
const poly = (...pts: Pt[]) => `M ${pts.map(pt).join(" L ")} Z`;
const seg = (a: Pt, b: Pt) => `M ${pt(a)} L ${pt(b)}`;
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function BoxStage({
  value,
  units,
  boxStyle,
  motionSafe,
}: {
  value: ParcelValue;
  units: ParcelUnits;
  boxStyle: ParcelBoxStyle;
  motionSafe: boolean;
}) {
  const empty = isParcelEmpty(value);
  const P = empty
    ? project(36, 26, 22)
    : project(value.length, value.width, value.height);
  const top = poly(P.D, P.B, P.A, P.C);
  const right = poly(P.B, P.F, P.E, P.A);
  const left = poly(P.C, P.A, P.E, P.G);
  const outline = poly(P.D, P.B, P.F, P.E, P.G, P.C);
  const inner = `${seg(P.A, P.B)} ${seg(P.A, P.C)} ${seg(P.A, P.E)}`;
  const hidden = `${seg(P.D, P.O)} ${seg(P.O, P.F)} ${seg(P.O, P.G)}`;
  const glide = motionSafe ? springs.glide : { duration: 0 };
  const lengthAt = mid(P.E, P.F);
  const widthAt = mid(P.E, P.G);
  const heightAt = mid(P.B, P.F);
  const abbr = UNIT_ABBR[units].length;

  const faceStroke =
    boxStyle === "wire"
      ? "currentColor"
      : boxStyle === "flat"
        ? "var(--accent)"
        : "color-mix(in oklab, var(--accent-bright) 80%, var(--bg-0))";

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full text-ink-2"
    >
      <AnimatePresence initial={false} mode="wait">
        {empty ? (
          <motion.g
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="text-ink-3"
          >
            <path
              d={outline}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeLinejoin="round"
            />
            <path
              d={inner}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeLinecap="round"
            />
          </motion.g>
        ) : (
          <motion.g
            key="box"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            {boxStyle === "wire" ? (
              <motion.path
                initial={false}
                animate={{ d: hidden }}
                transition={{ d: glide }}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="2 3"
                strokeLinecap="round"
                className="text-ink-3"
              />
            ) : null}
            {/* Each face keeps its four points, so a change is a morph. */}
            {(
              [
                ["top", top],
                ["right", right],
                ["left", left],
              ] as const
            ).map(([face, d]) => (
              <motion.path
                key={face}
                initial={false}
                animate={{ d }}
                transition={{ d: glide }}
                fill={
                  boxStyle === "wire"
                    ? "none"
                    : boxStyle === "flat"
                      ? "var(--accent-wash)"
                      : `var(--ps-${face})`
                }
                stroke={faceStroke}
                strokeWidth={1}
                strokeLinejoin="round"
              />
            ))}
            <motion.text
              initial={false}
              animate={{ x: lengthAt[0] + 7, y: lengthAt[1] + 11 }}
              transition={glide}
              textAnchor="start"
              className="fill-ink-3 font-mono text-[9px]"
            >
              {shownText("length", value.length, units)} {abbr}
            </motion.text>
            <motion.text
              initial={false}
              animate={{ x: widthAt[0] - 7, y: widthAt[1] + 11 }}
              transition={glide}
              textAnchor="end"
              className="fill-ink-3 font-mono text-[9px]"
            >
              {shownText("width", value.width, units)} {abbr}
            </motion.text>
            <motion.text
              initial={false}
              animate={{ x: heightAt[0] + 7, y: heightAt[1] + 3 }}
              transition={glide}
              textAnchor="start"
              className="fill-ink-3 font-mono text-[9px]"
            >
              {shownText("height", value.height, units)} {abbr}
            </motion.text>
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Gauge                                   */
/* ----------------------------------------------------------------------- */

const G_CX = 60;
const G_CY = 60;
const G_R = 46;

function WeightGauge({
  weight,
  volumetric,
  maxWeight,
  motionSafe,
}: {
  weight: number;
  volumetric: number;
  maxWeight: number;
  motionSafe: boolean;
}) {
  const max = Math.max(0.001, maxWeight);
  const angle = -90 + 180 * clamp(weight / max, 0, 1);
  const volAngle = -90 + 180 * clamp(volumetric / max, 0, 1);
  const over = weight > max;
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 66"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
    >
      <path
        d={`M ${G_CX - G_R} ${G_CY} A ${G_R} ${G_R} 0 0 1 ${G_CX + G_R} ${G_CY}`}
        fill="none"
        stroke="var(--hairline-strong)"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <motion.path
        d={`M ${G_CX - G_R} ${G_CY} A ${G_R} ${G_R} 0 0 1 ${G_CX + G_R} ${G_CY}`}
        fill="none"
        stroke={over ? "var(--warn)" : "var(--accent-bright)"}
        strokeWidth={3}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: clamp(weight / max, 0, 1) }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
      {Array.from({ length: 5 }, (_, i) => (
        <line
          key={i}
          x1={G_CX}
          y1={G_CY - G_R - 5}
          x2={G_CX}
          y2={G_CY - G_R - 9}
          stroke="var(--ink-3)"
          strokeWidth={1}
          transform={`rotate(${-90 + 45 * i} ${G_CX} ${G_CY})`}
        />
      ))}
      {/* Volumetric marker: a small wedge outside the arc, moved on glide. */}
      <motion.g
        initial={false}
        animate={{ rotate: volAngle }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        {/* Symmetric about the pivot, so the group turns about it. */}
        <circle cx={G_CX} cy={G_CY} r={G_R + 12} fill="none" stroke="none" />
        <path
          d={`M ${G_CX} ${G_CY - G_R - 4} l -3 -6 h 6 z`}
          fill="var(--ink-3)"
        />
      </motion.g>
      {/* The needle swings on snap: one crisp overshoot, then still. */}
      <motion.g
        initial={false}
        animate={{ rotate: angle }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        <circle cx={G_CX} cy={G_CY} r={G_R} fill="none" stroke="none" />
        <line
          x1={G_CX}
          y1={G_CY + 4}
          x2={G_CX}
          y2={G_CY - G_R + 8}
          stroke={over ? "var(--warn)" : "var(--ink)"}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </motion.g>
      <circle cx={G_CX} cy={G_CY} r={4} fill="var(--ink)" />
      <circle cx={G_CX} cy={G_CY} r={1.5} fill="var(--bg-0)" />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Field                                   */
/* ----------------------------------------------------------------------- */

type FieldProps = {
  id: string;
  field: ParcelField;
  value: number;
  units: ParcelUnits;
  density: ParcelDensity;
  disabled: boolean;
  hintId: string;
  inputRef: (node: HTMLInputElement | null) => void;
  onType: (field: ParcelField, shown: number | null) => void;
  onStep: (field: ParcelField, direction: 1 | -1, big: boolean) => void;
  onSettle: (field: ParcelField) => void;
};

function Field({
  id,
  field,
  value,
  units,
  density,
  disabled,
  hintId,
  inputRef,
  onType,
  onStep,
  onSettle,
}: FieldProps) {
  const d = DENSITY[density] ?? DENSITY.cozy;
  const [draft, setDraft] = React.useState<string | null>(null);
  const formatted = shownText(field, value, units);
  // A new unit system or an outside change reformats the field, unless the
  // viewer is mid-keystroke in it.
  const [seen, setSeen] = React.useState(`${units}:${formatted}`);
  if (seen !== `${units}:${formatted}`) {
    setSeen(`${units}:${formatted}`);
    if (draft !== null && units !== seen.split(":")[0]) setDraft(null);
  }
  const shown = toShown(field, value, units);
  const step = stepOf(field, units);
  const decimals = decimalsOf(field, units);
  const abbr = abbrOf(field, units);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    if (!/^\d*([.,]\d*)?$/.test(text)) return;
    setDraft(text);
    const n = Number(text.replace(",", "."));
    onType(field, text === "" || !Number.isFinite(n) ? null : n);
  };

  const stepper = (direction: 1 | -1) => (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={() => onStep(field, direction, false)}
      disabled={disabled}
      className={cn(
        "flex w-6 shrink-0 items-center justify-center text-ink-3 transition-colors",
        disabled
          ? "cursor-not-allowed"
          : "hover:bg-surface-2 hover:text-foreground",
        direction < 0 ? "rounded-l-2" : "rounded-r-2",
      )}
    >
      {direction < 0 ? (
        <Minus className="size-3" />
      ) : (
        <Plus className="size-3" />
      )}
    </button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label
        htmlFor={id}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {FIELD_WORD[field]}
      </label>
      <div
        className={cn(
          "flex items-stretch rounded-2 border border-hairline bg-surface-0 transition-colors focus-within:border-hairline-strong",
          d.field,
          disabled && "opacity-70",
        )}
      >
        {stepper(-1)}
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          role="spinbutton"
          aria-valuenow={r4(shown)}
          aria-valuemin={0}
          aria-valuemax={r4(toShown(field, maxOf(field), units))}
          aria-valuetext={`${formatted} ${wordOf(field, units)}`}
          aria-describedby={hintId}
          value={draft ?? formatted}
          readOnly={disabled}
          aria-readonly={disabled || undefined}
          onChange={handleChange}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => {
            setDraft(null);
            onSettle(field);
          }}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              setDraft(null);
              onStep(field, event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
            } else if (event.key === "PageUp" || event.key === "PageDown") {
              event.preventDefault();
              setDraft(null);
              onStep(field, event.key === "PageUp" ? 1 : -1, true);
            } else if (event.key === "Enter") {
              event.preventDefault();
              setDraft(null);
              onSettle(field);
            } else if (event.key === "Escape" && draft !== null) {
              event.preventDefault();
              setDraft(null);
            }
          }}
          className={cn(
            "min-w-0 flex-1 rounded-2 bg-transparent px-1 text-center font-mono text-foreground tabular-nums",
            d.text,
            FOCUS_IN,
          )}
        />
        <span
          aria-hidden
          className="flex shrink-0 items-center pr-1 font-mono text-[10px] text-ink-3"
        >
          {abbr}
        </span>
        {stepper(1)}
      </div>
      <span className="sr-only">
        Step {trim(step, decimals)} {abbr}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A shipping form whose parcel draws itself. Four fields (length, width,
 * height and weight) sit beside an isometric box: as a value changes, every
 * edge of the box morphs on `springs.glide` to the new proportions, its
 * dimension labels riding along; a weight needle swings on `springs.snap`
 * with the billable weight (actual or volumetric, whichever is greater)
 * marked on the arc; and the size class (Letter, Small, Medium, Large,
 * Oversize) turns over on `springs.snap` the moment a threshold is crossed.
 *
 * Presets fill the four fields in a cascade, one field each `cascade(4)`
 * later, so the box grows side by side and the needle lands last. Carrier
 * rates recompute on every change: rows re-sort by price on `springs.glide`,
 * the Cheapest tag travelling to whichever row now earns it, prices rolling
 * digit by digit, and carriers that refuse the parcel settling to the bottom.
 * Switching units converts the fields and rolls every readout.
 *
 * The fields are spinbuttons: arrows step, Shift+arrow and Page keys ten
 * steps, Enter settles. Presets and the units switch are radio groups, and
 * the rates are a listbox with one tab stop. Every change is announced.
 * Under reduced motion the box and the needle take their new place at once,
 * the class cross-fades, and rows re-order without travelling.
 */
export function ParcelSpec({
  boxStyle = "iso",
  density = "cozy",
  value,
  defaultValue = defaultParcelValue,
  onChange,
  units,
  defaultUnits = "metric",
  onUnitsChange,
  presets = defaultParcelPresets,
  carriers = defaultParcelCarriers,
  carrier,
  defaultCarrier = null,
  onCarrierChange,
  currency = "$",
  maxWeight = 30,
  status = "ready",
  onRetry,
  title = "Parcel",
  label,
  height = 540,
  disabled = false,
  className,
}: ParcelSpecProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  /* -------------------------------- state ------------------------------ */

  const [own, setOwn] = React.useState<ParcelValue>(defaultValue);
  const current = value ?? own;

  const [ownUnits, setOwnUnits] = React.useState<ParcelUnits>(defaultUnits);
  // A new default from the host (a tweak panel, a saved preference) shows
  // those units, the way a fresh mount would.
  const [seenUnits, setSeenUnits] = React.useState(defaultUnits);
  if (seenUnits !== defaultUnits) {
    setSeenUnits(defaultUnits);
    setOwnUnits(defaultUnits);
  }
  const u = units ?? ownUnits;

  const [ownCarrier, setOwnCarrier] = React.useState<string | null>(
    defaultCarrier,
  );
  const chosen = carrier !== undefined ? carrier : ownCarrier;

  const [pendingPreset, setPendingPreset] = React.useState<string | null>(null);
  const [activePreset, setActivePreset] = React.useState<string | null>(null);
  const [activeRate, setActiveRate] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const inputs = React.useRef(new Map<ParcelField, HTMLInputElement>());
  const presetNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const rateNodes = React.useRef(new Map<string, HTMLLIElement>());
  const unitNodes = React.useRef(new Map<ParcelUnits, HTMLButtonElement>());
  const timers = React.useRef<number[]>([]);
  const cascadeEnd = React.useRef<ParcelValue | null>(null);
  const settled = React.useRef<ParcelValue>(current);
  const latest = React.useRef(current);
  // Handlers and cascade timers read the value through this ref, so a
  // controlled host's update is seen without rebinding them.
  React.useEffect(() => {
    latest.current = current;
  }, [current]);

  const ready = status === "ready";
  const inert = disabled || status === "loading";

  /* -------------------------------- data ------------------------------- */

  const empty = isParcelEmpty(current);
  const { quote, rates } = quoteParcel(current, carriers);
  const best = rates[0] && rates[0].price !== null ? rates[0] : null;
  const chosenRate = chosen
    ? (rates.find((r) => r.carrier.id === chosen) ?? null)
    : null;
  const matchedPreset =
    pendingPreset ??
    presets.find((p) => sameValue(p.value, current))?.id ??
    null;
  const overGauge = current.weight > maxWeight;

  /* ----------------------------- announcing ---------------------------- */

  const describe = (lead: string, next: ParcelValue, prev: ParcelValue) => {
    const parts = [lead];
    if (isParcelEmpty(next)) {
      parts.push("No dimensions yet.");
      return parts.join(" ");
    }
    const was = quoteParcel(prev, carriers);
    const now = quoteParcel(next, carriers);
    if (isParcelEmpty(prev) || was.quote.sizeClass !== now.quote.sizeClass) {
      parts.push(`${CLASS_WORD[now.quote.sizeClass]}.`);
    }
    if (ready) {
      const nowBest =
        now.rates[0] && now.rates[0].price !== null ? now.rates[0] : null;
      const wasBest =
        was.rates[0] && was.rates[0].price !== null ? was.rates[0] : null;
      if (!nowBest) parts.push("No carrier takes this size.");
      else if (
        !wasBest ||
        wasBest.carrier.id !== nowBest.carrier.id ||
        isParcelEmpty(prev)
      ) {
        parts.push(
          `Cheapest ${nowBest.carrier.name}, ${currency}${(nowBest.price ?? 0).toFixed(2)}.`,
        );
      }
    }
    return parts.join(" ");
  };

  /* ------------------------------- changes ----------------------------- */

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  React.useEffect(() => clearTimers, []);

  const commit = (next: ParcelValue, change: ParcelChange) => {
    if (sameValue(next, latest.current)) return latest.current;
    if (value === undefined) setOwn(next);
    latest.current = next;
    onChange?.(next, change);
    return next;
  };

  /** Lands a running cascade now: nothing waits on a preset. */
  const flushCascade = () => {
    if (timers.current.length === 0) return latest.current;
    clearTimers();
    const end = cascadeEnd.current;
    cascadeEnd.current = null;
    setPendingPreset(null);
    if (!end) return latest.current;
    return commit(end, {
      source: "preset",
      preset: pendingPreset ?? undefined,
    });
  };

  const typeField = (field: ParcelField, shown: number | null) => {
    if (inert) return;
    const base = flushCascade();
    const cm = shown === null ? 0 : fromShown(field, shown, u);
    const next = { ...base, [field]: r4(clamp(cm, 0, maxOf(field))) };
    setPendingPreset(null);
    commit(next, { source: "type", field });
  };

  const stepField = (field: ParcelField, direction: 1 | -1, big: boolean) => {
    if (inert) return;
    const base = flushCascade();
    const step = stepOf(field, u) * (big ? 10 : 1);
    const shown = toShown(field, base[field], u);
    // Snap to the step grid first, so 12.3 steps to 13, not 13.3.
    const snapped = Math.round(shown / step) * step;
    const target = snapped + direction * step;
    const cm = r4(clamp(fromShown(field, target, u), 0, maxOf(field)));
    const next = { ...base, [field]: cm };
    setPendingPreset(null);
    const landed = commit(next, { source: "step", field });
    settled.current = landed;
    setAnnouncement(
      describe(
        `${FIELD_WORD[field]} ${shownText(field, landed[field], u)} ${wordOf(field, u)}.`,
        landed,
        base,
      ),
    );
  };

  /** A typed field was left or entered: announce where it ended up. */
  const settleField = (field: ParcelField) => {
    const now = latest.current;
    const before = settled.current;
    if (sameValue(now, before)) return;
    settled.current = now;
    setAnnouncement(
      describe(
        `${FIELD_WORD[field]} ${shownText(field, now[field], u)} ${wordOf(field, u)}.`,
        now,
        before,
      ),
    );
  };

  const choosePreset = (preset: ParcelPreset) => {
    if (inert) return;
    const base = flushCascade();
    const lead = `${preset.label}: ${FIELDS.slice(0, 3)
      .map((f) => shownText(f, preset.value[f], u))
      .join(
        " by ",
      )} ${UNIT_WORD[u].length}, ${shownText("weight", preset.value.weight, u)} ${UNIT_WORD[u].mass}.`;
    if (sameValue(preset.value, base)) {
      setAnnouncement(`${preset.label} already set.`);
      return;
    }
    if (!motionSafe) {
      const landed = commit(preset.value, {
        source: "preset",
        preset: preset.id,
      });
      settled.current = landed;
      setAnnouncement(describe(lead, landed, base));
      return;
    }
    // One field lands each beat: the box grows side by side and the
    // needle swings last. Each commit carries every field before it, so a
    // controlled host sees a consistent value at every step.
    setPendingPreset(preset.id);
    cascadeEnd.current = preset.value;
    const beat = cascade(FIELDS.length) * 1000;
    FIELDS.forEach((field, i) => {
      const partial: ParcelValue = { ...base };
      for (const f of FIELDS.slice(0, i + 1)) partial[f] = preset.value[f];
      const t = window.setTimeout(() => {
        timers.current = timers.current.filter((x) => x !== t);
        const landed = commit(partial, { source: "preset", preset: preset.id });
        if (i === FIELDS.length - 1) {
          cascadeEnd.current = null;
          setPendingPreset(null);
          settled.current = landed;
          setAnnouncement(describe(lead, landed, base));
        }
      }, i * beat);
      timers.current.push(t);
    });
  };

  const clearAll = () => {
    if (inert || empty) return;
    const base = flushCascade();
    setPendingPreset(null);
    const landed = commit(emptyParcelValue, { source: "clear" });
    settled.current = landed;
    setAnnouncement(describe("Cleared.", landed, base));
  };

  const switchUnits = (next: ParcelUnits) => {
    if (inert || next === u) return;
    flushCascade();
    if (units === undefined) setOwnUnits(next);
    onUnitsChange?.(next);
    const v = latest.current;
    setAnnouncement(
      isParcelEmpty(v)
        ? `${UNIT_WORD[next].length} and ${UNIT_WORD[next].mass}.`
        : `${UNIT_WORD[next].length} and ${UNIT_WORD[next].mass}: ${FIELDS.slice(
            0,
            3,
          )
            .map((f) => shownText(f, v[f], next))
            .join(
              " by ",
            )}, ${shownText("weight", v.weight, next)} ${UNIT_WORD[next].mass}.`,
    );
  };

  const chooseCarrier = (rate: ParcelRate) => {
    if (inert || !ready || rate.price === null) return;
    const id = rate.carrier.id;
    if (carrier === undefined) setOwnCarrier(id);
    onCarrierChange?.(id, rate);
    setAnnouncement(
      `${rate.carrier.name} chosen, ${currency}${rate.price.toFixed(2)}, ${rate.carrier.eta}.`,
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const radioNav = <K,>(
    event: React.KeyboardEvent,
    keys: K[],
    at: number,
    go: (key: K) => void,
  ) => {
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = at + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = at - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = keys.length - 1;
    else return;
    event.preventDefault();
    const key = keys[(to + keys.length) % keys.length];
    if (key !== undefined) go(key);
  };

  const presetIds = presets.map((p) => p.id);
  const presetStop =
    matchedPreset ??
    (activePreset && presetIds.includes(activePreset)
      ? activePreset
      : (presetIds[0] ?? null));

  const rateIds = rates.map((r) => r.carrier.id);
  const rateStop =
    chosen && rateIds.includes(chosen)
      ? chosen
      : activeRate && rateIds.includes(activeRate)
        ? activeRate
        : (rateIds[0] ?? null);

  /* ------------------------------- render ------------------------------ */

  const unitOptions: { id: ParcelUnits; short: string; long: string }[] = [
    { id: "metric", short: "cm · kg", long: "Centimetres and kilograms" },
    { id: "imperial", short: "in · lb", long: "Inches and pounds" },
  ];

  const classText = empty ? "No size" : CLASS_WORD[quote.sizeClass];
  const weightShown = toShown("weight", current.weight, u);
  const billableText = `${shownText("weight", quote.billable, u)} ${UNIT_ABBR[u].mass}`;
  const byVolume = !empty && quote.volumetric > current.weight;

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--ps-top" as string]:
          "color-mix(in oklab, var(--accent) 28%, var(--bg-1))",
        ["--ps-right" as string]:
          "color-mix(in oklab, var(--accent) 50%, var(--bg-1))",
        ["--ps-left" as string]:
          "color-mix(in oklab, var(--accent) 68%, var(--bg-1))",
      }}
    >
      <p id={hintId} className="sr-only">
        Up and Down step. Shift and arrow or Page keys step ten. Enter settles.
      </p>

      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-hairline",
          d.pad,
          "py-2.5",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Package aria-hidden className="size-4 shrink-0 text-ink-3" />
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Units"
            className="inline-flex h-7 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
          >
            {unitOptions.map((option, i) => {
              const checked = option.id === u;
              return (
                <button
                  key={option.id}
                  ref={(node) => {
                    if (node) unitNodes.current.set(option.id, node);
                    else unitNodes.current.delete(option.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={option.long}
                  aria-disabled={inert || undefined}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => switchUnits(option.id)}
                  onKeyDown={(event) =>
                    radioNav(
                      event,
                      unitOptions.map((o) => o.id),
                      i,
                      (id) => {
                        unitNodes.current.get(id)?.focus();
                        switchUnits(id);
                      },
                    )
                  }
                  className={cn(
                    "relative flex items-center rounded-full px-2.5 font-mono text-[11px] whitespace-nowrap transition-colors",
                    checked
                      ? "text-foreground"
                      : "text-ink-3 hover:text-foreground",
                    inert ? "cursor-not-allowed" : "cursor-pointer",
                    FOCUS_RING,
                  )}
                >
                  {checked ? (
                    <motion.span
                      aria-hidden
                      layoutId={`${uid}-units`}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                    />
                  ) : null}
                  <span className="relative">{option.short}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={clearAll}
            aria-disabled={inert || empty || undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
              !inert && !empty
                ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                : "cursor-default text-ink-3",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
            Clear
          </button>
        </div>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain",
          d.pad,
          d.gap,
        )}
      >
        {status === "loading" ? (
          <div aria-hidden className={cn("flex flex-col", d.gap)}>
            <div className="grid grid-cols-1 gap-3 @min-[40rem]:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div className="flex gap-1.5">
                  {Array.from({ length: 3 }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "w-20 rounded-full bg-surface-2 motion-safe:animate-pulse",
                        d.preset,
                      )}
                      style={{ animationDelay: `${i * 70}ms` }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                        d.field,
                      )}
                      style={{ animationDelay: `${i * 90}ms` }}
                    />
                  ))}
                </div>
              </div>
              <span className="h-40 rounded-3 bg-surface-2 motion-safe:animate-pulse" />
            </div>
            <div className="flex flex-col gap-1">
              {Array.from({ length: 4 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                    d.row,
                  )}
                  style={{ animationDelay: `${i * 110}ms` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div
              className={cn(
                "grid shrink-0 grid-cols-1 @min-[40rem]:grid-cols-2",
                d.gap,
              )}
            >
              {/* ------------------------- fields ------------------------ */}
              <div className={cn("flex min-w-0 flex-col", d.gap)}>
                <div
                  role="radiogroup"
                  aria-label="Presets"
                  className="flex flex-wrap gap-1.5"
                >
                  {presets.map((preset, i) => {
                    const checked = preset.id === matchedPreset;
                    return (
                      <button
                        key={preset.id}
                        ref={(node) => {
                          if (node) presetNodes.current.set(preset.id, node);
                          else presetNodes.current.delete(preset.id);
                        }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-disabled={inert || undefined}
                        tabIndex={preset.id === presetStop ? 0 : -1}
                        onFocus={() => setActivePreset(preset.id)}
                        onClick={() => choosePreset(preset)}
                        onKeyDown={(event) => {
                          if (event.key === " " || event.key === "Enter") {
                            event.preventDefault();
                            choosePreset(preset);
                            return;
                          }
                          radioNav(event, presetIds, i, (id) => {
                            presetNodes.current.get(id)?.focus();
                            const target = presets.find((p) => p.id === id);
                            if (target) choosePreset(target);
                          });
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                          d.preset,
                          checked
                            ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright"
                            : "border-hairline bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-foreground",
                          inert ? "cursor-not-allowed" : "cursor-pointer",
                          FOCUS_RING,
                        )}
                      >
                        {checked ? (
                          <svg
                            aria-hidden
                            viewBox="0 0 14 14"
                            className="size-3 shrink-0"
                          >
                            <motion.path
                              d="M3 7.4 5.8 10 11 4.2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={motionSafe ? { pathLength: 0 } : false}
                              animate={{ pathLength: 1 }}
                              transition={
                                motionSafe ? springs.flick : { duration: 0 }
                              }
                            />
                          </svg>
                        ) : null}
                        {preset.label}
                        <span className="hidden font-mono text-[10px] font-normal text-ink-3 @min-[48rem]:inline">
                          {FIELDS.slice(0, 3)
                            .map((f) => shownText(f, preset.value[f], u))
                            .join(" x ")}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {FIELDS.map((field) => (
                    <Field
                      key={field}
                      id={`${uid}-${field}`}
                      field={field}
                      value={current[field]}
                      units={u}
                      density={density}
                      disabled={inert}
                      hintId={hintId}
                      inputRef={(node) => {
                        if (node) inputs.current.set(field, node);
                        else inputs.current.delete(field);
                      }}
                      onType={typeField}
                      onStep={stepField}
                      onSettle={settleField}
                    />
                  ))}
                </div>
              </div>

              {/* -------------------------- stage ------------------------- */}
              <div className="order-first flex min-w-0 flex-col gap-2 @min-[40rem]:order-none">
                <div className="relative h-36 rounded-3 border border-hairline bg-surface-1 @min-[40rem]:h-40">
                  <BoxStage
                    value={current}
                    units={u}
                    boxStyle={boxStyle}
                    motionSafe={motionSafe}
                  />
                  <div className="absolute top-2 left-2.5 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      Class
                    </span>
                    <FlipLabel
                      text={classText}
                      motionSafe={motionSafe}
                      className={cn(
                        "rounded-1 px-1.5 py-0.5 font-mono text-[11px] font-medium",
                        empty
                          ? "text-ink-3"
                          : quote.sizeClass === "oversize"
                            ? "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-warn"
                            : "bg-cobalt-wash text-cobalt-bright",
                      )}
                    />
                  </div>
                  <AnimatePresence>
                    {empty ? (
                      <motion.p
                        key="hint"
                        initial={{
                          opacity: 0,
                          y: motionSafe ? distances.nudge : 0,
                        }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          duration: durations.base,
                          ease: easings.enter,
                        }}
                        className="absolute inset-x-3 bottom-2 text-center text-[11px] text-ink-3"
                      >
                        No dimensions yet. Type a size or pick a preset.
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="flex items-center gap-3 rounded-3 border border-hairline bg-surface-1 px-3 py-2">
                  <div className="h-14 w-24 shrink-0">
                    <WeightGauge
                      weight={current.weight}
                      volumetric={quote.volumetric}
                      maxWeight={maxWeight}
                      motionSafe={motionSafe}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p
                      className={cn(
                        "flex items-baseline gap-1 font-mono text-[15px]",
                        overGauge ? "text-warn" : "text-foreground",
                      )}
                    >
                      <span className="sr-only">
                        Weight {shownText("weight", current.weight, u)}{" "}
                        {UNIT_WORD[u].mass}
                        {overGauge ? ", over the gauge" : ""}
                      </span>
                      <Roll
                        text={weightShown.toFixed(
                          decimalsOf("weight", u) === 2 ? 2 : 1,
                        )}
                        motionSafe={motionSafe}
                      />
                      <span aria-hidden className="text-[11px] text-ink-3">
                        {UNIT_ABBR[u].mass}
                      </span>
                    </p>
                    <p className="flex items-baseline gap-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      <span>Billable</span>
                      <span className="sr-only">{billableText}</span>
                      <Roll
                        text={toShown("weight", quote.billable, u).toFixed(2)}
                        motionSafe={motionSafe}
                        className="text-ink-2"
                      />
                      <span aria-hidden>{UNIT_ABBR[u].mass}</span>
                      <AnimatePresence initial={false}>
                        {byVolume ? (
                          <motion.span
                            key="vol"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={{ duration: durations.fast }}
                            className="normal-case"
                          >
                            · by volume
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* --------------------------- rates --------------------------- */}
            <section
              aria-labelledby={`${uid}-rates`}
              className="flex min-w-0 shrink-0 flex-col gap-1.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3
                  id={`${uid}-rates`}
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  Rates
                </h3>
                {ready && !empty ? (
                  <p className="min-w-0 truncate text-[11px] text-ink-3">
                    {chosenRate
                      ? chosenRate.price === null
                        ? `${chosenRate.carrier.name} will not take this size`
                        : `${chosenRate.carrier.name} · ${chosenRate.carrier.eta}`
                      : best
                        ? `Cheapest ${best.carrier.name}`
                        : "No carrier takes this size"}
                  </p>
                ) : null}
              </div>

              {status === "error" ? (
                <div className="flex flex-col items-center gap-3 rounded-3 border border-hairline px-6 py-6 text-center">
                  <TriangleAlert aria-hidden className="size-5 text-danger" />
                  <p className="text-sm text-foreground">
                    The rates didn&apos;t load.
                  </p>
                  {onRetry ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                        FOCUS_RING,
                      )}
                    >
                      <RotateCcw aria-hidden className="size-3.5" />
                      Try again
                    </button>
                  ) : null}
                </div>
              ) : empty ? (
                <div className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-6 py-5 text-center">
                  <p className="text-sm text-ink-2">
                    Enter a size to see rates.
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {carriers.length} carriers quote on Basinworks Shipping.
                  </p>
                </div>
              ) : (
                <LayoutGroup id={`${uid}-rates`}>
                  <ul
                    role="listbox"
                    aria-label="Carrier rates, cheapest first"
                    aria-disabled={inert || undefined}
                    className="flex flex-col gap-0.5"
                  >
                    {rates.map((rate, i) => {
                      const id = rate.carrier.id;
                      const selected = id === chosen;
                      const cheapest =
                        rate.price !== null && best?.carrier.id === id;
                      const refused = rate.price === null;
                      return (
                        <motion.li
                          key={id}
                          ref={(node) => {
                            if (node) rateNodes.current.set(id, node);
                            else rateNodes.current.delete(id);
                          }}
                          layout={motionSafe ? "position" : false}
                          transition={{ layout: springs.glide }}
                          role="option"
                          aria-selected={selected}
                          aria-disabled={refused || inert || undefined}
                          tabIndex={id === rateStop ? 0 : -1}
                          onFocus={() => setActiveRate(id)}
                          onClick={() => chooseCarrier(rate)}
                          onKeyDown={(event) => {
                            if (event.key === " " || event.key === "Enter") {
                              event.preventDefault();
                              chooseCarrier(rate);
                              return;
                            }
                            radioNav(event, rateIds, i, (next) =>
                              rateNodes.current.get(next)?.focus(),
                            );
                          }}
                          className={cn(
                            "grid items-center gap-x-2 rounded-2 border px-2.5 transition-colors",
                            "grid-cols-[minmax(0,1fr)_auto] @min-[30rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]",
                            d.row,
                            selected
                              ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash"
                              : "border-transparent",
                            refused
                              ? "text-ink-3"
                              : inert
                                ? "cursor-not-allowed"
                                : "cursor-pointer hover:bg-surface-2",
                            FOCUS_RING,
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span
                              className={cn(
                                "truncate font-medium",
                                d.text,
                                refused ? "text-ink-3" : "text-foreground",
                              )}
                            >
                              {rate.carrier.name}
                            </span>
                            {selected ? (
                              <Check
                                aria-hidden
                                className="size-3.5 shrink-0 text-cobalt-bright"
                              />
                            ) : null}
                            {cheapest ? (
                              <motion.span
                                layoutId={
                                  motionSafe ? `${uid}-cheapest` : undefined
                                }
                                transition={springs.glide}
                                className="shrink-0 rounded-1 bg-[color-mix(in_oklab,var(--success)_16%,transparent)] px-1 font-mono text-[9px] tracking-[0.08em] text-success uppercase"
                              >
                                Cheapest
                              </motion.span>
                            ) : null}
                          </span>
                          <span className="hidden min-w-0 truncate text-[11px] text-ink-3 @min-[30rem]:inline">
                            {rate.carrier.service} · {rate.carrier.eta}
                          </span>
                          <span
                            className={cn(
                              "flex items-baseline justify-end font-mono tabular-nums",
                              d.text,
                              refused ? "text-ink-3" : "text-foreground",
                            )}
                          >
                            {rate.price === null ? (
                              <span className="text-[11px]">Not available</span>
                            ) : (
                              <>
                                <span className="sr-only">
                                  {currency}
                                  {rate.price.toFixed(2)},{" "}
                                  {rate.carrier.service}, {rate.carrier.eta}
                                </span>
                                <span aria-hidden className="text-ink-3">
                                  {currency}
                                </span>
                                <Roll
                                  text={rate.price.toFixed(2)}
                                  motionSafe={motionSafe}
                                />
                              </>
                            )}
                          </span>
                        </motion.li>
                      );
                    })}
                  </ul>
                </LayoutGroup>
              )}
            </section>
          </>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
