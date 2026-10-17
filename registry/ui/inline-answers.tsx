"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  CornerDownLeft,
  Equal,
  FileBarChart,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type InlineAnswersAccent = "cobalt" | "plum" | "mint" | "ink";
export type InlineAnswersStatus = "ready" | "loading" | "error";
export type AnswerUnitSystem = "metric" | "imperial";

export type AnswerToken = {
  text: string;
  kind: "number" | "op" | "target" | "word";
  /** The provider guessed this part. */
  unsure?: boolean;
};

export type InlineAnswer = {
  /** The provider that answered. */
  provider: string;
  /** What kind of answer it is: "Sum", "Conversion", "Date", "Time zone". */
  kind: string;
  /** The text copied to the clipboard. */
  value: string;
  /** The part that rolls: digits roll, everything else cross-fades. */
  figure: string;
  /** Shown beside the figure. */
  unit?: string;
  /** How the input was read, as chips. */
  reading: AnswerToken[];
  /** A detail under the answer ("in km · 22.65 mi"). */
  note?: string;
  /** Set when the provider had to guess: what it assumed. */
  unsure?: string;
};

export type AnswerZone = {
  id: string;
  /** How the answer names it. */
  label: string;
  /** Lower-case names that find it. */
  names: string[];
  /** Minutes from UTC (fixed; pass your own for daylight saving). */
  offset: number;
};

export type AnswerContext = {
  now: number;
  locale: string;
  unitSystem: AnswerUnitSystem;
  zones: AnswerZone[];
  homeZone: string;
  maxFractionDigits: number;
  formatNumber: (n: number, maxFractionDigits: number) => string;
  formatDate: (date: Date) => string;
};

export type AnswerProvider = {
  id: string;
  /** Named in the error state: "{label} is unavailable". */
  label: string;
  /** An answer, or null when the query is not this provider's kind of question. May throw. */
  answer: (query: string, context: AnswerContext) => InlineAnswer | null;
};

export type AnswerResultIcon = "site" | "form" | "person" | "report";

export type AnswerResult = {
  id: string;
  title: string;
  group: string;
  detail?: string;
  icon: AnswerResultIcon;
  keywords?: string[];
};

export type InlineAnswersProps = {
  /** Size of the answer's figure, in px. @default 32 */
  answerSize?: number;
  /** How fast the digits roll: a multiple of the snap spring's speed, its damping ratio kept. @default 1 */
  rollSpeed?: number;
  /** The answer row's wash, chips and check. A name or any CSS colour. @default "cobalt" */
  accent?: InlineAnswersAccent | (string & {});
  /** Tried in order; the first answer wins. @default defaultAnswerProviders */
  providers?: AnswerProvider[];
  /** Number formatting locale; also decides whether 12/03 reads day first. @default "en-GB" */
  locale?: string;
  /** Which units a lone quantity converts to when you don't say. @default "metric" */
  unitSystem?: AnswerUnitSystem;
  /** Most decimals in a number. @default 2 */
  maxFractionDigits?: number;
  /** Format a number. @default Intl.NumberFormat with `locale` */
  formatNumber?: (n: number, maxFractionDigits: number) => string;
  /** Format a date. @default "Fri 16 Oct 2026" */
  formatDate?: (date: Date) => string;
  /** Places the time-zone answers know. @default defaultAnswerZones */
  zones?: AnswerZone[];
  /** The zone "here" means, and the one dates are counted in. @default "lisbon" */
  homeZone?: string;
  /** The ordinary results under the answer. @default defaultAnswerResults */
  results?: AnswerResult[];
  /** Controlled query. */
  query?: string;
  /** Initial query when uncontrolled. @default "" */
  defaultQuery?: string;
  /** Fires with every keystroke's new query. */
  onQueryChange?: (query: string) => void;
  /** The answer was copied: Enter on it, a click, or Cmd/Ctrl+C. */
  onCopyAnswer?: (answer: InlineAnswer) => void;
  /** An ordinary result was chosen. */
  onSelect?: (result: AnswerResult) => void;
  /** A provider threw; reported once per query. */
  onProviderError?: (providerId: string, error: unknown) => void;
  /** The time dates and clocks are read from, in ms. @default defaultAnswerNow */
  now?: number;
  /** Whether the ordinary results have arrived; answers work either way. @default "ready" */
  status?: InlineAnswersStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The field's placeholder. @default "Ask or search Fieldline…" */
  placeholder?: string;
  /** The field's accessible name. @default "Search and answers" */
  label?: string;
  /** Escape on an empty field. Without it Escape is left to the page. */
  onDismiss?: () => void;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

/** Friday 16 October 2026, 13:20 UTC. */
export const defaultAnswerNow = Date.UTC(2026, 9, 16, 13, 20);

export const defaultAnswerZones: AnswerZone[] = [
  {
    id: "lisbon",
    label: "Lisbon",
    names: ["lisbon", "hq", "office"],
    offset: 60,
  },
  {
    id: "nairobi",
    label: "Nairobi",
    names: ["nairobi", "basin camp", "camp"],
    offset: 180,
  },
  { id: "denver", label: "Denver", names: ["denver"], offset: -360 },
  { id: "tokyo", label: "Tokyo", names: ["tokyo"], offset: 540 },
  { id: "perth", label: "Perth", names: ["perth"], offset: 480 },
  { id: "reykjavik", label: "Reykjavik", names: ["reykjavik"], offset: 0 },
  { id: "utc", label: "UTC", names: ["utc", "gmt", "zulu"], offset: 0 },
];

export const defaultAnswerResults: AnswerResult[] = [
  {
    id: "site-4",
    title: "Site 4 · North basin",
    group: "Sites",
    detail: "12.4 km from camp",
    icon: "site",
    keywords: ["site", "basin", "plots"],
  },
  {
    id: "basin-camp",
    title: "Basin camp",
    group: "Sites",
    detail: "Field office",
    icon: "site",
    keywords: ["camp", "office"],
  },
  {
    id: "ridge",
    title: "Ridge station",
    group: "Sites",
    detail: "Weather mast",
    icon: "site",
    keywords: ["weather", "rain"],
  },
  {
    id: "soil-log",
    title: "Soil sample log",
    group: "Forms",
    detail: "One per plot",
    icon: "form",
    keywords: ["soil", "sample"],
  },
  {
    id: "safety",
    title: "Daily safety check",
    group: "Forms",
    detail: "Before 07:00",
    icon: "form",
    keywords: ["safety", "check"],
  },
  {
    id: "checkout",
    title: "Equipment checkout",
    group: "Forms",
    detail: "Vehicles and kit",
    icon: "form",
    keywords: ["vehicle", "kit"],
  },
  {
    id: "ada",
    title: "Ada Moreno",
    group: "People",
    detail: "Field lead",
    icon: "person",
    keywords: ["lead"],
  },
  {
    id: "kofi",
    title: "Kofi Mensah",
    group: "People",
    detail: "Hydrologist",
    icon: "person",
    keywords: ["water"],
  },
  {
    id: "rainfall",
    title: "Rainfall, week 41",
    group: "Reports",
    detail: "Updated this morning",
    icon: "report",
    keywords: ["rain", "weekly"],
  },
];

const RECENT = ["site-4", "soil-log", "rainfall"];

const ACCENTS: Record<InlineAnswersAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const RESULT_ICON: Record<AnswerResultIcon, typeof MapPin> = {
  site: MapPin,
  form: ClipboardList,
  person: UserRound,
  report: FileBarChart,
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BODY_H = 372;
const ROW_H = 36;
const HEADER_H = 28;
const noop = () => () => {};
const yes = () => true;
const no = () => false;
const isMac = () =>
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/* ------------------------------- the engine ------------------------------- */

const MIN = 60_000;
const DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A fixed English date: a locale lookup in render could differ between server and browser. */
export const defaultFormatDate = (d: Date): string =>
  `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;

const formats = new Map<string, Intl.NumberFormat>();
export const defaultFormatNumber =
  (locale: string) =>
  (n: number, max: number): string => {
    const key = `${locale}|${max}`;
    let f = formats.get(key);
    if (!f) {
      f = new Intl.NumberFormat(locale, { maximumFractionDigits: max });
      formats.set(key, f);
    }
    return f.format(n);
  };

type Dim = "length" | "mass" | "volume" | "area" | "speed" | "temp";
type UnitDef = { id: string; dim: Dim; factor: number; symbol: string };

const UNIT_LIST: UnitDef[] = [
  { id: "mm", dim: "length", factor: 0.001, symbol: "mm" },
  { id: "cm", dim: "length", factor: 0.01, symbol: "cm" },
  { id: "m", dim: "length", factor: 1, symbol: "m" },
  { id: "km", dim: "length", factor: 1000, symbol: "km" },
  { id: "in", dim: "length", factor: 0.0254, symbol: "in" },
  { id: "ft", dim: "length", factor: 0.3048, symbol: "ft" },
  { id: "yd", dim: "length", factor: 0.9144, symbol: "yd" },
  { id: "mi", dim: "length", factor: 1609.344, symbol: "mi" },
  { id: "g", dim: "mass", factor: 0.001, symbol: "g" },
  { id: "kg", dim: "mass", factor: 1, symbol: "kg" },
  { id: "t", dim: "mass", factor: 1000, symbol: "t" },
  { id: "oz", dim: "mass", factor: 0.028349523125, symbol: "oz" },
  { id: "lb", dim: "mass", factor: 0.45359237, symbol: "lb" },
  { id: "ml", dim: "volume", factor: 0.001, symbol: "ml" },
  { id: "l", dim: "volume", factor: 1, symbol: "L" },
  { id: "qt", dim: "volume", factor: 0.946352946, symbol: "qt" },
  { id: "gal", dim: "volume", factor: 3.785411784, symbol: "gal" },
  { id: "m2", dim: "area", factor: 1, symbol: "m²" },
  { id: "ha", dim: "area", factor: 10_000, symbol: "ha" },
  { id: "km2", dim: "area", factor: 1_000_000, symbol: "km²" },
  { id: "ft2", dim: "area", factor: 0.09290304, symbol: "ft²" },
  { id: "acre", dim: "area", factor: 4046.8564224, symbol: "acres" },
  { id: "kmh", dim: "speed", factor: 1 / 3.6, symbol: "km/h" },
  { id: "ms", dim: "speed", factor: 1, symbol: "m/s" },
  { id: "mph", dim: "speed", factor: 0.44704, symbol: "mph" },
  { id: "kn", dim: "speed", factor: 0.514444, symbol: "kn" },
  { id: "c", dim: "temp", factor: 1, symbol: "°C" },
  { id: "f", dim: "temp", factor: 1, symbol: "°F" },
  { id: "k", dim: "temp", factor: 1, symbol: "K" },
];
const UNITS = new Map(UNIT_LIST.map((u) => [u.id, u]));

const ALIASES: Record<string, string> = {};
for (const [id, words] of Object.entries({
  mm: ["mm", "millimetre", "millimetres", "millimeter", "millimeters"],
  cm: ["cm", "centimetre", "centimetres", "centimeter", "centimeters"],
  m: ["m", "metre", "metres", "meter", "meters"],
  km: ["km", "kms", "kilometre", "kilometres", "kilometer", "kilometers"],
  in: ["in", "inch", "inches"],
  ft: ["ft", "foot", "feet"],
  yd: ["yd", "yds", "yard", "yards"],
  mi: ["mi", "mile", "miles"],
  g: ["g", "gram", "grams"],
  kg: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"],
  t: ["t", "tonne", "tonnes"],
  oz: ["oz", "ounce", "ounces"],
  lb: ["lb", "lbs", "pound", "pounds"],
  ml: ["ml", "millilitre", "millilitres", "milliliter", "milliliters"],
  l: ["l", "litre", "litres", "liter", "liters"],
  qt: ["qt", "quart", "quarts"],
  gal: ["gal", "gallon", "gallons"],
  m2: ["m2", "m²", "sqm"],
  ha: ["ha", "hectare", "hectares"],
  km2: ["km2", "km²"],
  ft2: ["ft2", "ft²", "sqft"],
  acre: ["acre", "acres"],
  kmh: ["km/h", "kmh", "kph"],
  ms: ["m/s"],
  mph: ["mph"],
  kn: ["kn", "knot", "knots"],
  c: ["c", "°c", "celsius"],
  f: ["f", "°f", "fahrenheit"],
  k: ["k", "kelvin"],
})) {
  for (const word of words) ALIASES[word] = id;
}

/** Where a lone quantity goes when you don't say: its counterpart in the other system. */
const COMPANION: Record<string, { metric: string; imperial: string }> = {
  mm: { metric: "in", imperial: "in" },
  cm: { metric: "in", imperial: "in" },
  m: { metric: "ft", imperial: "ft" },
  km: { metric: "mi", imperial: "mi" },
  in: { metric: "cm", imperial: "cm" },
  ft: { metric: "m", imperial: "m" },
  yd: { metric: "m", imperial: "m" },
  mi: { metric: "km", imperial: "km" },
  g: { metric: "oz", imperial: "oz" },
  kg: { metric: "lb", imperial: "lb" },
  t: { metric: "lb", imperial: "lb" },
  oz: { metric: "g", imperial: "g" },
  lb: { metric: "kg", imperial: "kg" },
  ml: { metric: "qt", imperial: "qt" },
  l: { metric: "gal", imperial: "gal" },
  qt: { metric: "l", imperial: "l" },
  gal: { metric: "l", imperial: "l" },
  m2: { metric: "ft2", imperial: "ft2" },
  ha: { metric: "acre", imperial: "acre" },
  km2: { metric: "acre", imperial: "acre" },
  ft2: { metric: "m2", imperial: "m2" },
  acre: { metric: "ha", imperial: "ha" },
  kmh: { metric: "mph", imperial: "mph" },
  ms: { metric: "kmh", imperial: "mph" },
  mph: { metric: "kmh", imperial: "kmh" },
  kn: { metric: "kmh", imperial: "mph" },
  c: { metric: "f", imperial: "f" },
  f: { metric: "c", imperial: "c" },
  k: { metric: "c", imperial: "f" },
};

const toKelvin = (v: number, id: string) =>
  id === "c" ? v + 273.15 : id === "f" ? ((v - 32) * 5) / 9 + 273.15 : v;
const fromKelvin = (k: number, id: string) =>
  id === "c" ? k - 273.15 : id === "f" ? ((k - 273.15) * 9) / 5 + 32 : k;

type Tok =
  | { t: "num"; v: number; text: string }
  | { t: "unit"; u: UnitDef; text: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "(" | ")"; text: string }
  | { t: "to"; text: string }
  | { t: "word"; text: string };

const OP_SHOW: Record<string, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

const tokenize = (input: string): Tok[] => {
  const s = input.toLowerCase();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i] ?? "";
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const rest = s.slice(i);
    const num = /^(\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)/.exec(rest);
    if (num?.[1]) {
      out.push({
        t: "num",
        v: Number.parseFloat(num[1].replace(/,/g, "")),
        text: input.slice(i, i + num[1].length),
      });
      i += num[1].length;
      continue;
    }
    const word = /^(km\/h|m\/s|km²|m²|ft²|°c|°f|[a-z]+[²2]?)/.exec(rest);
    if (word?.[1]) {
      const w = word[1];
      const prev = out[out.length - 1];
      const after = s.slice(i + w.length).trimStart();
      const nextWord =
        /^(km\/h|m\/s|km²|m²|ft²|°c|°f|[a-z]+[²2]?)/.exec(after)?.[1] ?? "";
      const afterNumber =
        prev?.t === "num" || (prev?.t === "op" && prev.v === ")");
      if (w === "x" && (afterNumber || prev?.t === "unit")) {
        out.push({ t: "op", v: "*", text: "×" });
      } else if (
        ["to", "into", "as"].includes(w) ||
        (w === "in" && ALIASES[nextWord] !== undefined)
      ) {
        out.push({ t: "to", text: w });
      } else if (ALIASES[w] !== undefined && prev?.t === "num") {
        const u = UNITS.get(ALIASES[w] ?? "");
        if (u) out.push({ t: "unit", u, text: w });
      } else if (ALIASES[w] !== undefined && prev?.t === "to") {
        const u = UNITS.get(ALIASES[w] ?? "");
        if (u) out.push({ t: "unit", u, text: w });
      } else {
        out.push({ t: "word", text: w });
      }
      i += w.length;
      continue;
    }
    const op = (
      {
        "+": "+",
        "-": "-",
        "−": "-",
        "*": "*",
        "×": "*",
        "/": "/",
        "÷": "/",
        "(": "(",
        ")": ")",
      } as Record<string, "+" | "-" | "*" | "/" | "(" | ")">
    )[ch];
    if (op) {
      out.push({ t: "op", v: op, text: ch });
      i += 1;
      continue;
    }
    out.push({ t: "word", text: ch });
    i += 1;
  }
  return out;
};

type Q = { base: number; unit: UnitDef | null };

/** Sums, products and conversions over quantities with units. */
const mathProvider: AnswerProvider = {
  id: "math",
  label: "Calculator",
  answer: (query, ctx) => {
    const toks = tokenize(query);
    if (!toks.length || toks.some((t) => t.t === "word")) return null;
    if (!toks.some((t) => t.t === "num")) return null;
    let p = 0;
    let ops = 0;
    let onlySums = true;
    let incomplete = false;
    const guesses: string[] = [];
    const reading: AnswerToken[] = [];
    const peek = () => toks[p];

    const factor = (): Q | null => {
      const tok = peek();
      if (!tok) {
        incomplete = true;
        return null;
      }
      if (tok.t === "op" && tok.v === "-") {
        p += 1;
        reading.push({ text: "−", kind: "op" });
        const inner = factor();
        return inner ? { base: -inner.base, unit: inner.unit } : null;
      }
      if (tok.t === "op" && tok.v === "(") {
        p += 1;
        reading.push({ text: "(", kind: "op" });
        const inner = sum();
        if (peek()?.t === "op" && (peek() as { v: string }).v === ")") p += 1;
        reading.push({ text: ")", kind: "op" });
        return inner;
      }
      if (tok.t === "num") {
        p += 1;
        const next = peek();
        if (next?.t === "unit") {
          p += 1;
          reading.push({
            text: `${ctx.formatNumber(tok.v, 6)} ${next.u.symbol}`,
            kind: "number",
          });
          return {
            base: next.u.dim === "temp" ? tok.v : tok.v * next.u.factor,
            unit: next.u,
          };
        }
        reading.push({ text: ctx.formatNumber(tok.v, 6), kind: "number" });
        return { base: tok.v, unit: null };
      }
      return null;
    };

    const product = (): Q | null => {
      let left = factor();
      while (left) {
        const tok = peek();
        if (tok?.t !== "op" || (tok.v !== "*" && tok.v !== "/")) break;
        p += 1;
        ops += 1;
        onlySums = false;
        reading.push({ text: OP_SHOW[tok.v] ?? tok.v, kind: "op" });
        const right = factor();
        if (!right) {
          incomplete = true;
          break;
        }
        if (left.unit?.dim === "temp" || right.unit?.dim === "temp")
          return null;
        if (tok.v === "*") {
          if (left.unit && right.unit) return null;
          left = {
            base: left.base * right.base,
            unit: left.unit ?? right.unit,
          };
        } else {
          if (right.base === 0) return null;
          if (right.unit && !left.unit) return null;
          if (left.unit && right.unit) {
            if (left.unit.dim !== right.unit.dim) return null;
            left = { base: left.base / right.base, unit: null };
          } else left = { base: left.base / right.base, unit: left.unit };
        }
      }
      return left;
    };

    const sum = (): Q | null => {
      let left = product();
      while (left) {
        const tok = peek();
        if (tok?.t !== "op" || (tok.v !== "+" && tok.v !== "-")) break;
        p += 1;
        ops += 1;
        reading.push({ text: OP_SHOW[tok.v] ?? tok.v, kind: "op" });
        const right = product();
        if (!right) {
          incomplete = true;
          break;
        }
        if (left.unit?.dim === "temp" || right.unit?.dim === "temp")
          return null;
        let r = right;
        if (left.unit && !right.unit) {
          // "3 km + 2": the bare number is read in the running unit.
          r = { base: right.base * left.unit.factor, unit: left.unit };
          guesses.push(
            `Read ${ctx.formatNumber(right.base, 6)} as ${ctx.formatNumber(right.base, 6)} ${left.unit.symbol}`,
          );
          const last = reading[reading.length - 1];
          if (last) last.unsure = true;
        } else if (!left.unit && right.unit) {
          left = { base: left.base * right.unit.factor, unit: right.unit };
          guesses.push(`Read the first number in ${right.unit.symbol}`);
        } else if (
          left.unit &&
          right.unit &&
          left.unit.dim !== right.unit.dim
        ) {
          return null;
        }
        left = {
          base: tok.v === "+" ? left.base + r.base : left.base - r.base,
          unit: left.unit ?? r.unit,
        };
      }
      return left;
    };

    const result = sum();
    if (!result) return null;
    let target: UnitDef | null = null;
    let missingTarget = false;
    if (peek()?.t === "to") {
      p += 1;
      const u = peek();
      if (u?.t === "unit") {
        target = u.u;
        p += 1;
      } else missingTarget = true;
    }
    if (p < toks.length) return null;
    if (!ops && !result.unit) return null;
    if (target && result.unit && target.dim !== result.unit.dim) return null;
    if (target && !result.unit) return null;
    if (!target && result.unit && (!ops || missingTarget)) {
      const companion = COMPANION[result.unit.id]?.[ctx.unitSystem];
      target = companion ? (UNITS.get(companion) ?? null) : null;
      if (missingTarget && target) {
        guesses.push(`Nothing after “to”, so ${target.symbol}`);
        reading.push({
          text: `→ ${target.symbol}`,
          kind: "target",
          unsure: true,
        });
      }
    } else if (target) {
      reading.push({ text: `→ ${target.symbol}`, kind: "target" });
    }
    if (incomplete) {
      guesses.push("Waiting for the rest of the sum");
      reading.push({ text: "…", kind: "op", unsure: true });
    }
    const unit = target ?? result.unit;
    const valueIn = (q: Q, u: UnitDef) =>
      u.dim === "temp" && q.unit
        ? fromKelvin(toKelvin(q.base, q.unit.id), u.id)
        : q.base / u.factor;
    const n = unit ? valueIn(result, unit) : result.base;
    if (!Number.isFinite(n)) return null;
    const figure = ctx.formatNumber(n, ctx.maxFractionDigits);
    const companionId =
      !target && result.unit
        ? COMPANION[result.unit.id]?.[ctx.unitSystem]
        : undefined;
    const companion = companionId ? UNITS.get(companionId) : undefined;
    const note = target
      ? `${ctx.formatNumber(result.unit ? valueIn(result, result.unit) : result.base, ctx.maxFractionDigits)} ${result.unit?.symbol ?? ""} → ${target.symbol}`
      : companion && result.unit
        ? `in ${result.unit.symbol} · ${ctx.formatNumber(valueIn(result, companion), ctx.maxFractionDigits)} ${companion.symbol}`
        : undefined;
    return {
      provider: "math",
      kind: target ? "Conversion" : onlySums && ops ? "Sum" : "Calculation",
      value: unit ? `${figure} ${unit.symbol}` : figure,
      figure,
      unit: unit?.symbol,
      reading,
      note,
      unsure: guesses.length ? guesses.join(". ") : undefined,
    };
  },
};

/* ---------------------------------- dates --------------------------------- */

const monthOf = (word: string): number => {
  const i = MONTHS.findIndex((m) => word.startsWith(m.toLowerCase()));
  return i;
};

const homeToday = (ctx: AnswerContext): number => {
  const zone = ctx.zones.find((z) => z.id === ctx.homeZone);
  const d = new Date(ctx.now + (zone?.offset ?? 0) * MIN);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

type ParsedDate = { at: number; text: string; unsure?: string };

const parseDate = (raw: string, ctx: AnswerContext): ParsedDate | null => {
  const s = raw.trim().toLowerCase();
  const today = homeToday(ctx);
  const year = new Date(today).getUTCFullYear();
  if (s === "today" || s === "now") return { at: today, text: "today" };
  if (s === "tomorrow") return { at: today + DAY, text: "tomorrow" };
  if (s === "yesterday") return { at: today - DAY, text: "yesterday" };
  const named = (d: number, m: number, y?: number): ParsedDate | null => {
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    const at = Date.UTC(y ?? year, m, d);
    return { at, text: `${d} ${MONTHS_LONG[m] ?? ""}${y ? ` ${y}` : ""}` };
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return named(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3]
      ? m[3].length === 2
        ? 2000 + Number(m[3])
        : Number(m[3])
      : undefined;
    const dayFirst = !/^en-us/i.test(ctx.locale);
    const parsed = dayFirst ? named(a, b - 1, y) : named(b, a - 1, y);
    if (!parsed) return null;
    // Both halves could be a month: say which way it was read.
    if (a <= 12 && b <= 12 && a !== b)
      parsed.unsure = `Read ${m[0]} as ${parsed.text}`;
    return parsed;
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})(?:\s+(\d{4}))?$/.exec(s);
  if (m)
    return named(
      Number(m[1]),
      monthOf(m[2] ?? ""),
      m[3] ? Number(m[3]) : undefined,
    );
  m = /^([a-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(s);
  if (m)
    return named(
      Number(m[2]),
      monthOf(m[1] ?? ""),
      m[3] ? Number(m[3]) : undefined,
    );
  return null;
};

const shift = (at: number, n: number, unit: string): number => {
  const d = new Date(at);
  if (/^(d|days?)$/.test(unit)) return at + n * DAY;
  if (/^(w|weeks?)$/.test(unit)) return at + n * 7 * DAY;
  if (/^(months?)$/.test(unit))
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());
  if (/^(y|years?)$/.test(unit))
    return Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate());
  return Number.NaN;
};

const UNIT_WORD = "(d|days?|w|weeks?|months?|y|years?)";
const span = (n: number, unit: string) => {
  const base = unit.startsWith("w")
    ? "week"
    : unit.startsWith("m")
      ? "month"
      : unit.startsWith("y")
        ? "year"
        : "day";
  return `${n} ${base}${n === 1 ? "" : "s"}`;
};

/** Date offsets and day counts, counted in the home zone. */
const dateProvider: AnswerProvider = {
  id: "dates",
  label: "Dates",
  answer: (query, ctx) => {
    const s = query.trim().toLowerCase().replace(/\s+/g, " ");
    const dated = (
      at: number,
      reading: AnswerToken[],
      note: string,
      unsure?: string,
    ): InlineAnswer => {
      const figure = ctx.formatDate(new Date(at));
      return {
        provider: "dates",
        kind: "Date",
        value: figure,
        figure,
        reading,
        note,
        unsure,
      };
    };
    let m = new RegExp(`^(.+?) ?([+-]) ?(\\d+) ?${UNIT_WORD}$`).exec(s);
    if (m) {
      const base = parseDate(m[1] ?? "", ctx);
      if (!base) return null;
      const n = Number(m[3]) * (m[2] === "-" ? -1 : 1);
      const at = shift(base.at, n, m[4] ?? "");
      if (!Number.isFinite(at)) return null;
      return dated(
        at,
        [
          { text: base.text, kind: "number", unsure: Boolean(base.unsure) },
          { text: m[2] === "-" ? "−" : "+", kind: "op" },
          { text: span(Math.abs(n), m[4] ?? ""), kind: "number" },
        ],
        `${span(Math.abs(n), m[4] ?? "")} ${n < 0 ? "before" : "after"} ${base.text}`,
        base.unsure,
      );
    }
    m = new RegExp(`^in (\\d+) ?${UNIT_WORD}$`).exec(s);
    if (m) {
      const n = Number(m[1]);
      return dated(
        shift(homeToday(ctx), n, m[2] ?? ""),
        [
          { text: "today", kind: "number" },
          { text: "+", kind: "op" },
          { text: span(n, m[2] ?? ""), kind: "number" },
        ],
        `${span(n, m[2] ?? "")} from today`,
      );
    }
    m = new RegExp(
      `^(\\d+) ?${UNIT_WORD} (from|after|before|ago)(?: (.+))?$`,
    ).exec(s);
    if (m) {
      const n = Number(m[1]);
      const back = m[3] === "before" || m[3] === "ago";
      const base = m[4]
        ? parseDate(m[4], ctx)
        : { at: homeToday(ctx), text: "today" };
      if (!base || (m[3] === "ago" && m[4])) return null;
      return dated(
        shift(base.at, back ? -n : n, m[2] ?? ""),
        [
          {
            text: base.text,
            kind: "number",
            unsure: Boolean((base as ParsedDate).unsure),
          },
          { text: back ? "−" : "+", kind: "op" },
          { text: span(n, m[2] ?? ""), kind: "number" },
        ],
        `${span(n, m[2] ?? "")} ${back ? "before" : "after"} ${base.text}`,
        (base as ParsedDate).unsure,
      );
    }
    m = /^days? (until|till|to|since|from) (.+)$/.exec(s);
    if (m) {
      const target = parseDate(m[2] ?? "", ctx);
      if (!target) return null;
      const today = homeToday(ctx);
      let at = target.at;
      const forward = m[1] !== "since" && m[1] !== "from";
      // "Days until 24 Dec" means the next one.
      if (forward && at < today && !/\d{4}/.test(m[2] ?? ""))
        at = shift(at, 1, "year");
      const days = Math.round(Math.abs(at - today) / DAY);
      const figure = ctx.formatNumber(days, 0);
      return {
        provider: "dates",
        kind: "Days",
        value: `${figure} ${days === 1 ? "day" : "days"}`,
        figure,
        unit: days === 1 ? "day" : "days",
        reading: [
          { text: "today", kind: "number" },
          { text: "→", kind: "op" },
          { text: target.text, kind: "number", unsure: Boolean(target.unsure) },
        ],
        note: `${forward ? "until" : "since"} ${ctx.formatDate(new Date(at))}`,
        unsure: target.unsure,
      };
    }
    return null;
  },
};

/* -------------------------------- time zones ------------------------------- */

const zoneOf = (word: string, ctx: AnswerContext): AnswerZone | undefined => {
  const w = word.trim().toLowerCase();
  if (w === "here" || w === "local")
    return ctx.zones.find((z) => z.id === ctx.homeZone);
  return ctx.zones.find(
    (z) => z.names.includes(w) || z.label.toLowerCase() === w,
  );
};

const clock = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const offsetLabel = (minutes: number) => {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
};

/** The time somewhere now, or a time in one place read in another. */
const zoneProvider: AnswerProvider = {
  id: "zones",
  label: "Time zones",
  answer: (query, ctx) => {
    const s = query.trim().toLowerCase().replace(/\s+/g, " ");
    let m =
      /^(?:time|now|what time is it) in (.+)$/.exec(s) ?? /^(.+) time$/.exec(s);
    if (m) {
      const zone = zoneOf(m[1] ?? "", ctx);
      if (!zone) return null;
      const local = ctx.now + zone.offset * MIN;
      const d = new Date(local);
      const figure = clock(d.getUTCHours() * 60 + d.getUTCMinutes());
      return {
        provider: "zones",
        kind: "Time zone",
        value: `${figure} ${zone.label}`,
        figure,
        unit: zone.label,
        reading: [
          { text: "now", kind: "number" },
          { text: `→ ${zone.label}`, kind: "target" },
        ],
        note: `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} · ${offsetLabel(zone.offset)}`,
      };
    }
    m = /^(\d{1,2})(?::(\d{2}))? ?(am|pm)?(?: (.+?))? (?:in|to) (.+)$/.exec(s);
    if (m) {
      const from = m[4] ? zoneOf(m[4], ctx) : zoneOf("here", ctx);
      const to = zoneOf(m[5] ?? "", ctx);
      if (!from || !to) return null;
      let h = Number(m[1]);
      const min = Number(m[2] ?? 0);
      if (h > 23 || min > 59) return null;
      let unsure: string | undefined;
      if (m[3] === "pm" && h < 12) h += 12;
      if (m[3] === "am" && h === 12) h = 0;
      if (!m[3] && !m[2] && h <= 12)
        unsure = `Read ${m[1]} as ${clock(h * 60)}`;
      const at = h * 60 + min - from.offset + to.offset;
      const dayShift = Math.floor(at / 1440);
      const figure = clock(at);
      return {
        provider: "zones",
        kind: "Time zone",
        value: `${figure} ${to.label}`,
        figure,
        unit: to.label,
        reading: [
          {
            text: `${clock(h * 60 + min)} ${from.label}`,
            kind: "number",
            unsure: Boolean(unsure),
          },
          { text: `→ ${to.label}`, kind: "target" },
        ],
        note: `${dayShift > 0 ? "next day" : dayShift < 0 ? "previous day" : "same day"} · ${offsetLabel(to.offset)}`,
        unsure,
      };
    }
    return null;
  },
};

export const defaultAnswerProviders: AnswerProvider[] = [
  mathProvider,
  dateProvider,
  zoneProvider,
];

type Computed = {
  answer: InlineAnswer | null;
  failed: { id: string; label: string; error: unknown }[];
};

const compute = (
  query: string,
  providers: AnswerProvider[],
  ctx: AnswerContext,
): Computed => {
  const failed: Computed["failed"] = [];
  if (!query.trim()) return { answer: null, failed };
  for (const provider of providers) {
    try {
      const answer = provider.answer(query, ctx);
      if (answer) return { answer, failed };
    } catch (error) {
      failed.push({ id: provider.id, label: provider.label, error });
    }
  }
  return { answer: null, failed };
};

/**
 * The answer the palette would show for a query, for a host that wants it
 * elsewhere (a status line, a history). Same providers, same defaults.
 */
export function answerQuery(
  query: string,
  options: {
    providers?: AnswerProvider[];
    now?: number;
    locale?: string;
    unitSystem?: AnswerUnitSystem;
    zones?: AnswerZone[];
    homeZone?: string;
    maxFractionDigits?: number;
  } = {},
): InlineAnswer | null {
  const locale = options.locale ?? "en-GB";
  return compute(query, options.providers ?? defaultAnswerProviders, {
    now: options.now ?? defaultAnswerNow,
    locale,
    unitSystem: options.unitSystem ?? "metric",
    zones: options.zones ?? defaultAnswerZones,
    homeZone: options.homeZone ?? "lisbon",
    maxFractionDigits: options.maxFractionDigits ?? 2,
    formatNumber: defaultFormatNumber(locale),
    formatDate: defaultFormatDate,
  }).answer;
}

/* ------------------------------ rolling figure ----------------------------- */

const LINE = 1.15;

/**
 * One digit place: a strip of 0–9 that rolls to its digit. In flow it is an
 * invisible 0, so its width is the font's own tabular width at any size.
 */
function DigitColumn({
  digit,
  roll,
  motionSafe,
}: {
  digit: number;
  roll: object;
  motionSafe: boolean;
}) {
  return (
    <motion.span
      className="relative inline-block overflow-hidden align-top"
      style={{ height: `${LINE}em` }}
      initial={motionSafe ? { width: 0, opacity: 0 } : { opacity: 0 }}
      animate={{ width: "auto", opacity: 1 }}
      exit={{
        width: motionSafe ? 0 : "auto",
        opacity: 0,
        transition: { duration: durations.fast, ease: easings.exit },
      }}
      transition={{
        width: motionSafe ? springs.glide : { duration: 0 },
        opacity: { duration: durations.fast },
      }}
    >
      <span className="invisible">0</span>
      {motionSafe ? (
        <motion.span
          className="absolute inset-x-0 top-0 flex flex-col"
          initial={{ y: "0%" }}
          animate={{ y: `${-digit * 10}%` }}
          transition={roll}
        >
          {Array.from({ length: 10 }, (_, d) => (
            <span
              key={d}
              className="block text-center"
              style={{ height: `${LINE}em` }}
            >
              {d}
            </span>
          ))}
        </motion.span>
      ) : (
        <AnimatePresence initial={false}>
          <motion.span
            key={digit}
            className="absolute inset-0 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: durations.fast }}
          >
            {digit}
          </motion.span>
        </AnimatePresence>
      )}
    </motion.span>
  );
}

function RollingFigure({
  text,
  decimal,
  size,
  speed,
  motionSafe,
}: {
  text: string;
  /** The locale's decimal mark: places are counted from it. */
  decimal: string;
  size: number;
  speed: number;
  motionSafe: boolean;
}) {
  // False while hydrating the server's figure (it must arrive whole), true for
  // a figure that appears later: that one rolls in from zero.
  const hydrated = React.useSyncExternalStore(noop, yes, no);
  const [rollIn] = React.useState(hydrated);
  const s = Math.min(3, Math.max(0.25, speed));
  // Faster or slower, the same spring: stiffness by s², damping by s keeps ζ.
  const roll = {
    type: "spring" as const,
    stiffness: springs.snap.stiffness * s * s,
    damping: springs.snap.damping * s,
    mass: springs.snap.mass,
  };
  const chars = Array.from(text);
  const mark = chars.indexOf(decimal);
  const dot = mark === -1 ? chars.length : mark;
  return (
    <span
      aria-hidden
      className="inline-flex items-start font-semibold tracking-[-0.01em] whitespace-nowrap text-foreground tabular-nums"
      // Never wider than the row: a long date at the largest size on a phone
      // shrinks with the container rather than being clipped.
      style={{ fontSize: `min(${size}px, 9cqw)`, lineHeight: LINE }}
    >
      <AnimatePresence initial={rollIn}>
        {chars.map((ch, i) => {
          // Places are counted from the decimal mark, so the units and the
          // decimals stay put while a new leading digit rolls in.
          const place = dot - i;
          return /\d/.test(ch) ? (
            <DigitColumn
              key={`d${place}`}
              digit={Number(ch)}
              roll={roll}
              motionSafe={motionSafe}
            />
          ) : (
            <motion.span
              key={`c${place}${ch}`}
              className="inline-block overflow-hidden whitespace-pre"
              style={{ height: `${LINE}em` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                width: 0,
                transition: { duration: durations.blink },
              }}
              transition={{ duration: durations.fast }}
            >
              {ch}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );
}

/** A tick that draws on the flick spring. */
function DrawnCheck({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <motion.path
        d="M3.5 8.4 6.6 11.2 12.5 4.8"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

/* -------------------------------- component ------------------------------- */

const matchesResult = (result: AnswerResult, query: string) => {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    result.title,
    result.detail ?? "",
    result.group,
    ...(result.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
};

type Row = { key: string; result?: AnswerResult };

/**
 * A command menu that answers small questions inline. A sum with units, a
 * conversion, a date offset or a time-zone question puts its answer in a
 * large first row whose digits roll to each new result on the snap spring as
 * you type — counted from the units place, so a new leading digit rolls in
 * from zero while the rest stay put — with the input read back as chips
 * underneath, dashed where the provider had to guess.
 *
 * Enter on the answer (or Cmd/Ctrl+C with nothing selected in the field)
 * copies it and the hint turns into a check that draws on the flick spring.
 * Up and Down still move through the ordinary results. Providers are props
 * and may throw: the error is reported once and the row says the provider is
 * unavailable. Under reduced motion the digits cross-fade instead of rolling.
 */
export function InlineAnswers({
  answerSize = 32,
  rollSpeed = 1,
  accent = "cobalt",
  providers = defaultAnswerProviders,
  locale = "en-GB",
  unitSystem = "metric",
  maxFractionDigits = 2,
  formatNumber,
  formatDate = defaultFormatDate,
  zones = defaultAnswerZones,
  homeZone = "lisbon",
  results = defaultAnswerResults,
  query,
  defaultQuery = "",
  onQueryChange,
  onCopyAnswer,
  onSelect,
  onProviderError,
  now = defaultAnswerNow,
  status = "ready",
  onRetry,
  placeholder = "Ask or search Fieldline…",
  label = "Search and answers",
  onDismiss,
  className,
}: InlineAnswersProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;

  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const q = query ?? ownQuery;
  const [active, setActive] = React.useState(0);
  const [copied, setCopied] = React.useState(0);
  const [said, setSaid] = React.useState("");
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [bodyEl, setBodyEl] = React.useState<HTMLDivElement | null>(null);
  const [bodyH, setBodyH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!bodyEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setBodyH(Math.round(entry.borderBoxSize[0]?.blockSize ?? 0));
    });
    ro.observe(bodyEl);
    return () => ro.disconnect();
  }, [bodyEl]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const reported = React.useRef<string | null>(null);

  const ctx = React.useMemo<AnswerContext>(
    () => ({
      now,
      locale,
      unitSystem,
      zones,
      homeZone,
      maxFractionDigits: Math.max(
        0,
        Math.min(6, Math.round(maxFractionDigits)),
      ),
      formatNumber: formatNumber ?? defaultFormatNumber(locale),
      formatDate,
    }),
    [
      now,
      locale,
      unitSystem,
      zones,
      homeZone,
      maxFractionDigits,
      formatNumber,
      formatDate,
    ],
  );

  const mac = React.useSyncExternalStore(noop, isMac, no);
  const decimal = React.useMemo(
    () => ctx.formatNumber(1.5, 1).replace(/\d/g, "").charAt(0) || ".",
    [ctx],
  );

  const { answer, failed } = React.useMemo(
    () => compute(q, providers, ctx),
    [q, providers, ctx],
  );
  const broken = !answer && failed.length ? failed[0] : undefined;

  // Errors are reported once per query, from the keystroke that produced
  // them; a host that sets the query itself is answered here.
  const report = React.useCallback(
    (value: string, list: Computed["failed"]) => {
      if (reported.current === value) return;
      reported.current = value;
      for (const f of list) onProviderError?.(f.id, f.error);
    },
    [onProviderError],
  );
  React.useEffect(() => {
    report(q, failed);
  }, [q, failed, report]);

  const rows = React.useMemo<Row[]>(() => {
    if (status !== "ready") return [];
    const trimmed = q.trim();
    const found =
      trimmed && !answer && !broken
        ? results.filter((r) => matchesResult(r, trimmed))
        : [];
    const list =
      trimmed && !answer && !broken
        ? found
        : RECENT.map((id) => results.find((r) => r.id === id)).filter(
            (r): r is AnswerResult => Boolean(r),
          );
    return list.map((result) => ({ key: result.id, result }));
  }, [q, answer, broken, results, status]);

  const sections = React.useMemo(() => {
    const showRecent = !q.trim() || Boolean(answer) || Boolean(broken);
    if (showRecent)
      return rows.length ? [{ id: "recent", label: "Recent", rows }] : [];
    const groups: { id: string; label: string; rows: Row[] }[] = [];
    for (const row of rows) {
      const g = row.result?.group ?? "Results";
      let group = groups.find((x) => x.id === g);
      if (!group) {
        group = { id: g, label: g, rows: [] };
        groups.push(group);
      }
      group.rows.push(row);
    }
    return groups;
  }, [rows, q, answer, broken]);
  const flat = sections.flatMap((s) => s.rows);
  const hasAnswer = Boolean(answer);
  const count = flat.length + (hasAnswer ? 1 : 0);
  const current = Math.min(active, Math.max(0, count - 1));
  const onAnswer = hasAnswer && current === 0;
  const activeRow = flat[current - (hasAnswer ? 1 : 0)];

  // The answer is spoken once typing settles, never per keystroke.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (answer) {
        setSaid(
          `${answer.unsure ? `Not sure. ${answer.unsure}. ` : ""}${answer.value}.`,
        );
      } else if (broken) setSaid(`${broken.label} is unavailable.`);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [answer, broken]);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(0), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const setQ = (value: string) => {
    if (query === undefined) setOwnQuery(value);
    onQueryChange?.(value);
    setActive(0);
    setCopied(0);
    report(value, compute(value, providers, ctx).failed);
  };

  const copy = () => {
    if (!answer) return;
    try {
      void navigator.clipboard?.writeText(answer.value).catch(() => {});
    } catch {
      // No clipboard here; the host still hears about the copy.
    }
    setCopied((n) => n + 1);
    setSaid(`Copied ${answer.value}.`);
    onCopyAnswer?.(answer);
  };

  const reveal = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    const node = list.querySelector<HTMLElement>(`[data-ia-row="${index}"]`);
    if (!node) return;
    const top = node.offsetTop;
    const bottom = top + node.offsetHeight;
    if (top - HEADER_H < list.scrollTop)
      list.scrollTop = Math.max(0, top - HEADER_H);
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight + 6;
  };

  const move = (next: number) => {
    if (!count) return;
    const to = Math.min(count - 1, Math.max(0, next));
    setActive(to);
    reveal(to);
  };

  const choose = (index: number) => {
    if (hasAnswer && index === 0) {
      copy();
      return;
    }
    const row = flat[index - (hasAnswer ? 1 : 0)];
    if (row?.result) {
      setSaid(`Opened ${row.result.title}.`);
      onSelect?.(row.result);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      // A selection in the field copies as usual; otherwise the answer does.
      if (answer && field.selectionStart === field.selectionEnd) {
        event.preventDefault();
        copy();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(current - 1);
        break;
      case "PageDown":
        event.preventDefault();
        move(current + 5);
        break;
      case "PageUp":
        event.preventDefault();
        move(current - 5);
        break;
      case "Enter":
        if (!count) return;
        event.preventDefault();
        choose(current);
        break;
      case "Escape":
        if (q) {
          event.preventDefault();
          setQ("");
        } else if (onDismiss) {
          event.preventDefault();
          onDismiss();
        }
        break;
      default:
        break;
    }
  };

  const optionId = (key: string) => `${uid}-opt-${key}`;
  const activeId = !count
    ? undefined
    : onAnswer
      ? optionId("answer")
      : activeRow
        ? optionId(activeRow.key)
        : undefined;
  const answerName = answer
    ? `${answer.value}, ${answer.kind.toLowerCase()}${answer.note ? `, ${answer.note}` : ""}.${answer.unsure ? ` Not sure: ${answer.unsure}.` : ""} Press Enter to copy.`
    : "";
  const unsure = Boolean(answer?.unsure);

  return (
    <div
      className={cn("@container w-full", className)}
      style={
        {
          "--ia-accent": ACCENTS[accent as InlineAnswersAccent] ?? accent,
        } as React.CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-[36rem] flex-col overflow-clip rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_50px_color-mix(in_oklab,black_22%,transparent)]">
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-hairline px-3">
          <span
            aria-hidden
            className="relative grid size-4 shrink-0 place-items-center"
          >
            <AnimatePresence initial={false}>
              <motion.span
                key={answer ? "equal" : "search"}
                className={cn(
                  "absolute inset-0 grid place-items-center",
                  answer ? "text-[var(--ia-accent)]" : "text-ink-3",
                )}
                initial={
                  motionSafe
                    ? { opacity: 0, scale: 0.6, rotate: -45 }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? 0.6 : 1,
                  transition: { duration: durations.blink },
                }}
                transition={{
                  scale: motionSafe ? springs.snap : { duration: 0 },
                  rotate: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                {answer ? (
                  <Equal className="size-4" />
                ) : (
                  <Search className="size-4" />
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label={label}
            aria-describedby={hintId}
            placeholder={placeholder}
            value={q}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            onChange={(event) => setQ(event.currentTarget.value)}
            onKeyDown={onKeyDown}
            className="h-8 min-w-0 flex-1 rounded-2 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring/25 focus-visible:outline-solid"
          />
          <kbd
            aria-hidden
            className="hidden h-5 shrink-0 items-center rounded-1 border border-hairline px-1.5 font-mono text-[10px] text-ink-3 @min-[30rem]:inline-flex"
          >
            esc
          </kbd>
        </div>
        <p id={hintId} className="sr-only">
          Type a sum, a conversion, a date or a time in another place. Enter on
          the answer copies it. Up and Down move through the results.
        </p>

        <motion.div
          ref={listRef}
          tabIndex={-1}
          className="relative overflow-x-hidden overflow-y-auto overscroll-contain outline-none"
          style={{ maxHeight: BODY_H }}
          // Measured, never reserved: the body is as tall as what it holds, up
          // to its cap, and glides between heights as results come and go.
          initial={false}
          animate={{
            height: bodyH === null ? "auto" : Math.min(BODY_H, bodyH),
          }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <div ref={setBodyEl}>
            <div
              id={listId}
              role="listbox"
              aria-label={label}
              aria-busy={status === "loading" || undefined}
              className="flex flex-col pb-1.5"
            >
              {answer ? (
                <div
                  id={optionId("answer")}
                  role="option"
                  aria-selected={onAnswer}
                  aria-label={answerName}
                  data-ia-row={0}
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerMove={() => {
                    if (current !== 0) setActive(0);
                  }}
                  onClick={() => {
                    inputRef.current?.focus();
                    setActive(0);
                    copy();
                  }}
                  className={cn(
                    "relative mx-1.5 mt-1.5 cursor-pointer overflow-hidden rounded-3 border px-4 py-3 transition-[border-color,background-color] duration-200 select-none",
                    unsure ? "border-dashed" : "",
                    onAnswer
                      ? "border-[color-mix(in_oklab,var(--ia-accent)_50%,transparent)] bg-[color-mix(in_oklab,var(--ia-accent)_9%,var(--popover))]"
                      : "border-hairline bg-[color-mix(in_oklab,var(--ia-accent)_4%,var(--popover))]",
                  )}
                >
                  <div className="flex flex-col gap-2 @min-[30rem]:flex-row @min-[30rem]:items-center @min-[30rem]:justify-between @min-[30rem]:gap-4">
                    <div
                      aria-hidden
                      className="flex min-w-0 flex-wrap items-center gap-1"
                    >
                      {answer.reading.map((tok, i) => (
                        <span
                          key={`${i}-${tok.text}`}
                          className={cn(
                            "inline-flex h-6 items-center rounded-2 text-xs whitespace-nowrap",
                            tok.kind === "op"
                              ? "px-0.5 text-ink-3"
                              : tok.kind === "target"
                                ? "border border-transparent bg-[color-mix(in_oklab,var(--ia-accent)_14%,transparent)] px-2 text-[var(--ia-accent)]"
                                : "border border-hairline bg-surface-1 px-2 font-mono text-[11.5px] text-ink-2 tabular-nums",
                            tok.unsure && "border-dashed border-warn text-warn",
                          )}
                        >
                          {tok.text}
                        </span>
                      ))}
                    </div>
                    <div
                      className={cn(
                        "flex min-w-0 shrink-0 items-baseline gap-1.5 transition-opacity",
                        unsure && "opacity-70",
                      )}
                    >
                      {unsure ? (
                        <span
                          aria-hidden
                          className="text-ink-3"
                          style={{
                            fontSize: `calc(min(${answerSize}px, 9cqw) * 0.6)`,
                          }}
                        >
                          ≈
                        </span>
                      ) : null}
                      <RollingFigure
                        text={answer.figure}
                        decimal={decimal}
                        size={answerSize}
                        speed={rollSpeed}
                        motionSafe={motionSafe}
                      />
                      {answer.unit ? (
                        <AnimatePresence initial={false} mode="popLayout">
                          <motion.span
                            key={answer.unit}
                            aria-hidden
                            className="font-medium whitespace-nowrap text-ink-2"
                            style={{
                              fontSize: `calc(min(${answerSize}px, 9cqw) * 0.5)`,
                            }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{
                              opacity: 0,
                              transition: { duration: durations.blink },
                            }}
                            transition={{ duration: durations.fast }}
                          >
                            {answer.unit}
                          </motion.span>
                        </AnimatePresence>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
                    <span className="min-w-0 text-ink-3">
                      {unsure ? (
                        <span className="inline-flex items-center gap-1 text-warn">
                          <TriangleAlert
                            aria-hidden
                            className="size-3 shrink-0"
                          />
                          {answer.unsure}
                        </span>
                      ) : (
                        `${answer.kind}${answer.note ? ` · ${answer.note}` : ""}`
                      )}
                    </span>
                    <span
                      aria-hidden
                      className="grid shrink-0 [&>*]:[grid-area:1/1]"
                    >
                      <AnimatePresence initial={false}>
                        {copied ? (
                          <motion.span
                            key={`done-${copied}`}
                            className="inline-flex h-6 items-center gap-1 justify-self-end rounded-full bg-[color-mix(in_oklab,var(--ia-accent)_16%,transparent)] px-2 font-medium text-[var(--ia-accent)]"
                            initial={
                              motionSafe
                                ? { opacity: 0, scale: 0.9 }
                                : { opacity: 0 }
                            }
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{
                              opacity: 0,
                              transition: {
                                duration: durations.fast,
                                ease: easings.exit,
                              },
                            }}
                            transition={{
                              scale: motionSafe
                                ? springs.flick
                                : { duration: 0 },
                              opacity: { duration: durations.blink },
                            }}
                          >
                            <DrawnCheck motionSafe={motionSafe} />
                            Copied
                          </motion.span>
                        ) : (
                          <motion.span
                            key="hint"
                            className="inline-flex h-6 items-center gap-1 justify-self-end rounded-full border border-hairline px-2 text-ink-3"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{
                              opacity: 0,
                              transition: { duration: durations.blink },
                            }}
                            transition={{ duration: durations.fast }}
                          >
                            <CornerDownLeft className="size-3 shrink-0" />
                            Copy
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                  </div>
                </div>
              ) : broken ? (
                <div className="mx-1.5 mt-1.5 flex items-start gap-2.5 rounded-3 border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_6%,var(--popover))] px-4 py-3">
                  <TriangleAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-danger"
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground">
                      Couldn’t work that out.
                    </p>
                    <p className="text-xs text-ink-3">{`${broken.label} is unavailable right now; the rest of the palette still works.`}</p>
                  </div>
                </div>
              ) : null}

              {status === "loading" ? (
                <div aria-hidden className="flex flex-col px-3 pt-2">
                  {[60, 44, 70].map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5"
                      style={{ height: ROW_H }}
                    >
                      <span className="size-6 shrink-0 rounded-2 bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]" />
                      <span
                        className={cn(
                          "h-2.5 rounded-full bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]",
                          motionSafe && "animate-pulse",
                        )}
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {sections.map((section) => {
                const headId = `${uid}-h-${section.id}`;
                return (
                  <div key={section.id} role="group" aria-labelledby={headId}>
                    <p
                      id={headId}
                      className="flex items-end px-3 pb-1.5 text-[10.5px] font-medium tracking-[0.06em] text-ink-3 uppercase"
                      style={{ height: HEADER_H }}
                    >
                      {section.label}
                    </p>
                    {section.rows.map((row) => {
                      const index = flat.indexOf(row) + (hasAnswer ? 1 : 0);
                      const on = index === current;
                      const result = row.result;
                      if (!result) return null;
                      const Icon = RESULT_ICON[result.icon] ?? MapPin;
                      return (
                        <div
                          key={row.key}
                          id={optionId(row.key)}
                          role="option"
                          aria-selected={on}
                          aria-label={`${result.title}${result.detail ? `, ${result.detail}` : ""}`}
                          data-ia-row={index}
                          onPointerDown={(event) => event.preventDefault()}
                          onPointerMove={() => {
                            if (!on) setActive(index);
                          }}
                          onClick={() => {
                            inputRef.current?.focus();
                            setActive(index);
                            choose(index);
                          }}
                          className="relative mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-2 px-2.5 select-none"
                          style={{ height: ROW_H }}
                        >
                          {on ? (
                            <motion.span
                              layoutId={`${uid}-pill`}
                              aria-hidden
                              className="absolute inset-0 rounded-2 bg-[color-mix(in_oklab,var(--ia-accent)_12%,transparent)]"
                              transition={
                                motionSafe ? springs.snap : { duration: 0 }
                              }
                            />
                          ) : null}
                          <span
                            aria-hidden
                            className="relative grid size-6 shrink-0 place-items-center rounded-2 bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] text-ink-2"
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <span
                            className={cn(
                              "relative min-w-0 flex-1 truncate text-[13px]",
                              on ? "text-foreground" : "text-ink-2",
                            )}
                            title={result.title}
                          >
                            {result.title}
                          </span>
                          {result.detail ? (
                            <span className="relative hidden max-w-[45%] truncate text-[11px] text-ink-3 @min-[30rem]:block">
                              {result.detail}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {status === "ready" &&
              q.trim() &&
              !answer &&
              !broken &&
              !flat.length ? (
                <p className="px-4 py-5 text-xs text-ink-3">{`Nothing in Fieldline matches “${q.trim()}”. Try a sum like 12 km + 450 m, or “time in Nairobi”.`}</p>
              ) : null}
            </div>
            {status === "error" ? (
              <div className="flex flex-col items-start gap-3 px-4 py-4">
                <p className="text-[13px] text-foreground">
                  Search is offline. Answers still work.
                </p>
                <button
                  type="button"
                  onClick={() => onRetry?.()}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </button>
              </div>
            ) : null}
          </div>
        </motion.div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-3 py-2 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <ArrowUp aria-hidden className="size-3" />
            <ArrowDown aria-hidden className="size-3" />
            move
          </span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft aria-hidden className="size-3" />
            {onAnswer ? "copy" : "open"}
          </span>
          {answer ? (
            <span className="hidden items-center gap-1 @min-[30rem]:inline-flex">
              <kbd className="font-mono text-[10px]">
                {mac ? "⌘C" : "Ctrl C"}
              </kbd>
              copy answer
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
            {status === "loading" ? (
              <LoaderCircle
                aria-hidden
                className={cn("size-3", motionSafe && "animate-spin")}
              />
            ) : null}
            {answer
              ? answer.kind.toLowerCase()
              : status === "error"
                ? "offline"
                : `${flat.length} ${flat.length === 1 ? "result" : "results"}`}
          </span>
        </div>
      </div>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}
