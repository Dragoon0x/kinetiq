"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import {
  Check,
  ChevronDown,
  Languages,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

/**
 * A locale's formats, written out in full so the server and every browser
 * print exactly the same thing. Patterns use `y yy M MM MMM MMMM d dd E EEEE`
 * for dates and `h hh H HH K mm a` for times; text in single quotes is
 * literal.
 */
export type SamplerLocale = {
  id: string;
  /** "English (United Kingdom)". */
  name: string;
  /** Twelve month names, January first. */
  months: string[];
  monthsShort: string[];
  /** Seven weekday names, Sunday first. */
  weekdays: string[];
  weekdaysShort: string[];
  dates: { long: string; medium: string; short: string };
  times: { h12: string; h24: string };
  /** Whether this locale reads the clock in twelve hours by default. */
  hour12: boolean;
  /** Before and after noon. */
  dayPeriods: [string, string];
  decimal: string;
  group: string;
  /** Where the currency mark sits. */
  currency: "before" | "after";
  /** 0 Sunday, 1 Monday, 6 Saturday. */
  weekStart: 0 | 1 | 6;
  /** The word between a date and its time: "at", "um". Empty for none. */
  at: string;
};

/** A time zone at a fixed offset: the offset it has on the sample's dates. */
export type SamplerZone = { id: string; label: string; offset: number };

export type SamplerDateStyle = "auto" | "long" | "medium" | "short" | "iso";
export type SamplerTimeStyle = "auto" | "h12" | "h24";
export type SamplerNumberStyle =
  "auto" | "comma-dot" | "dot-comma" | "space-comma" | "apos-dot";
export type SamplerWeekStart = "auto" | "monday" | "sunday" | "saturday";

export type SamplerSettings = {
  locale: string;
  timeZone: string;
  date: SamplerDateStyle;
  time: SamplerTimeStyle;
  number: SamplerNumberStyle;
  weekStart: SamplerWeekStart;
};

export type SamplerField = keyof SamplerSettings;

/** What the sample shows: an invoice, due on a date at a time. */
export type SamplerSample = {
  from: string;
  reference: string;
  amount: number;
  /** The currency mark, printed where the locale puts it. */
  currency: string;
  /** Due, ms since the epoch (UTC). */
  due: number;
  /** Issued, ms since the epoch (UTC). */
  issued: number;
};

export type SamplerStatus = "ready" | "loading" | "error";
export type SamplerSampleStyle = "card" | "line" | "receipt";
export type SamplerDensity = "compact" | "regular" | "roomy";
export type SamplerAccent = "cobalt" | "signal" | "amber" | "graphite";

export type FormatSamplerProps = {
  /** The languages on offer, each with its full format table. @default defaultSamplerLocales */
  locales?: SamplerLocale[];
  /** The time zones on offer. @default defaultSamplerZones */
  timezones?: SamplerZone[];
  /** Controlled settings. */
  value?: SamplerSettings;
  /** Initial settings when uncontrolled; also what Discard returns to until a save. @default defaultSamplerSettings */
  defaultValue?: SamplerSettings;
  /** Fires with every setting after any change. */
  onValueChange?: (settings: SamplerSettings) => void;
  /** Fires with the field that changed, its new value and every setting. */
  onChange?: (
    field: SamplerField,
    value: string,
    settings: SamplerSettings,
  ) => void;
  /** Save was pressed. Return a promise to show it saving; a rejection keeps the choices and says so. */
  onSave?: (settings: SamplerSettings) => void | Promise<unknown>;
  /** The invoice the sample prints. @default defaultSamplerSample */
  sample?: SamplerSample;
  /** The visitor's locale, offered as a one-click suggestion when it differs. Omit to read the browser's language after mount; null offers nothing. */
  detectedLocale?: string | null;
  /** Whether the settings have loaded. @default "ready" */
  status?: SamplerStatus;
  /** "Try again" was pressed after the settings failed to load. */
  onRetry?: () => void;
  /** How the sample is printed: an invoice card, one sentence, or a mono receipt. @default "card" */
  sampleStyle?: SamplerSampleStyle;
  /** Field heights, gaps and type. @default "regular" */
  density?: SamplerDensity;
  /** The change wash, focused fields and Save: a named token or any CSS colour. @default "cobalt" */
  accent?: SamplerAccent | (string & {});
  /** The heading. @default "Language and region" */
  title?: string;
  /** Height of the surface, px; the body scrolls inside. @default 540 */
  height?: number;
  /** Every field is read-only and Save does nothing; the surface dims. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Twelve months or seven days, written as one line of names. */
const names = (line: string) => line.split(" ");

const EN_MONTHS = names(
  "January February March April May June July August September October November December",
);
const EN_MONTHS_SHORT = EN_MONTHS.map((m) => m.slice(0, 3));
const EN_DAYS = names(
  "Sunday Monday Tuesday Wednesday Thursday Friday Saturday",
);
const EN_DAYS_SHORT = EN_DAYS.map((d) => d.slice(0, 3));

export const defaultSamplerLocales: SamplerLocale[] = [
  {
    id: "en-US",
    name: "English (United States)",
    months: EN_MONTHS,
    monthsShort: EN_MONTHS_SHORT,
    weekdays: EN_DAYS,
    weekdaysShort: EN_DAYS_SHORT,
    dates: { long: "EEEE, MMMM d, y", medium: "MMM d, y", short: "M/d/yy" },
    times: { h12: "h:mm a", h24: "HH:mm" },
    hour12: true,
    dayPeriods: ["AM", "PM"],
    decimal: ".",
    group: ",",
    currency: "before",
    weekStart: 0,
    at: "at",
  },
  {
    id: "en-GB",
    name: "English (United Kingdom)",
    months: EN_MONTHS,
    monthsShort: EN_MONTHS_SHORT,
    weekdays: EN_DAYS,
    weekdaysShort: EN_DAYS_SHORT,
    dates: { long: "EEEE d MMMM y", medium: "d MMM y", short: "dd/MM/y" },
    times: { h12: "h:mm a", h24: "HH:mm" },
    hour12: false,
    dayPeriods: ["am", "pm"],
    decimal: ".",
    group: ",",
    currency: "before",
    weekStart: 1,
    at: "at",
  },
  {
    id: "de-DE",
    name: "Deutsch (Deutschland)",
    months: names(
      "Januar Februar März April Mai Juni Juli August September Oktober November Dezember",
    ),
    monthsShort: names(
      "Jan. Feb. März Apr. Mai Juni Juli Aug. Sept. Okt. Nov. Dez.",
    ),
    weekdays: names(
      "Sonntag Montag Dienstag Mittwoch Donnerstag Freitag Samstag",
    ),
    weekdaysShort: names("So. Mo. Di. Mi. Do. Fr. Sa."),
    dates: { long: "EEEE, d. MMMM y", medium: "dd.MM.y", short: "dd.MM.yy" },
    times: { h12: "h:mm a", h24: "HH:mm" },
    hour12: false,
    dayPeriods: ["AM", "PM"],
    decimal: ",",
    group: ".",
    currency: "after",
    weekStart: 1,
    at: "um",
  },
  {
    id: "fr-FR",
    name: "Français (France)",
    months: names(
      "janvier février mars avril mai juin juillet août septembre octobre novembre décembre",
    ),
    monthsShort: names(
      "janv. févr. mars avr. mai juin juil. août sept. oct. nov. déc.",
    ),
    weekdays: names("dimanche lundi mardi mercredi jeudi vendredi samedi"),
    weekdaysShort: names("dim. lun. mar. mer. jeu. ven. sam."),
    dates: { long: "EEEE d MMMM y", medium: "d MMM y", short: "dd/MM/y" },
    times: { h12: "h:mm a", h24: "HH:mm" },
    hour12: false,
    dayPeriods: ["AM", "PM"],
    decimal: ",",
    group: " ",
    currency: "after",
    weekStart: 1,
    at: "à",
  },
  {
    id: "es-ES",
    name: "Español (España)",
    months: names(
      "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre",
    ),
    monthsShort: names("ene feb mar abr may jun jul ago sept oct nov dic"),
    weekdays: names("domingo lunes martes miércoles jueves viernes sábado"),
    weekdaysShort: names("dom lun mar mié jue vie sáb"),
    dates: {
      long: "EEEE, d 'de' MMMM 'de' y",
      medium: "d MMM y",
      short: "d/M/yy",
    },
    times: { h12: "h:mm a", h24: "H:mm" },
    hour12: false,
    dayPeriods: ["a. m.", "p. m."],
    decimal: ",",
    group: ".",
    currency: "after",
    weekStart: 1,
    at: "a las",
  },
  {
    id: "ja-JP",
    name: "日本語 (日本)",
    months: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
    monthsShort: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
    weekdays: names("日曜日 月曜日 火曜日 水曜日 木曜日 金曜日 土曜日"),
    weekdaysShort: names("日 月 火 水 木 金 土"),
    dates: { long: "y年MMMMd日EEEE", medium: "y/MM/dd", short: "y/MM/dd" },
    times: { h12: "aK:mm", h24: "H:mm" },
    hour12: false,
    dayPeriods: ["午前", "午後"],
    decimal: ".",
    group: ",",
    currency: "before",
    weekStart: 0,
    at: "",
  },
  {
    id: "sv-SE",
    name: "Svenska (Sverige)",
    months: names(
      "januari februari mars april maj juni juli augusti september oktober november december",
    ),
    monthsShort: names(
      "jan. feb. mars apr. maj juni juli aug. sep. okt. nov. dec.",
    ),
    weekdays: names("söndag måndag tisdag onsdag torsdag fredag lördag"),
    weekdaysShort: names("sön mån tis ons tors fre lör"),
    dates: { long: "EEEE d MMMM y", medium: "d MMM y", short: "y-MM-dd" },
    times: { h12: "h:mm a", h24: "HH:mm" },
    hour12: false,
    dayPeriods: ["fm", "em"],
    decimal: ",",
    group: " ",
    currency: "after",
    weekStart: 1,
    at: "kl.",
  },
];

/** Offsets as they stand on the sample's dates, early November. */
export const defaultSamplerZones: SamplerZone[] = [
  { id: "America/Los_Angeles", label: "Pacific Time", offset: -480 },
  { id: "America/New_York", label: "Eastern Time", offset: -300 },
  { id: "Europe/London", label: "London", offset: 0 },
  { id: "Europe/Berlin", label: "Central European", offset: 60 },
  { id: "Asia/Kolkata", label: "India", offset: 330 },
  { id: "Asia/Tokyo", label: "Japan", offset: 540 },
  { id: "Australia/Sydney", label: "Sydney", offset: 660 },
];

export const defaultSamplerSettings: SamplerSettings = {
  locale: "en-US",
  timeZone: "America/New_York",
  date: "auto",
  time: "auto",
  number: "auto",
  weekStart: "auto",
};

export const defaultSamplerSample: SamplerSample = {
  from: "Coldbrook",
  reference: "CB-2041",
  amount: 12480.5,
  currency: "€",
  due: Date.UTC(2026, 10, 3, 21, 30),
  issued: Date.UTC(2026, 9, 12, 14, 0),
};

/* ----------------------------------------------------------------------- */
/*                                Formatting                                */
/* ----------------------------------------------------------------------- */

const pad2 = (n: number) => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;

type Moment = {
  y: number;
  mo: number;
  d: number;
  wd: number;
  h: number;
  mi: number;
};

const momentOf = (ms: number, offset: number): Moment => {
  const t = new Date(ms + offset * 60_000);
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth(),
    d: t.getUTCDate(),
    wd: t.getUTCDay(),
    h: t.getUTCHours(),
    mi: t.getUTCMinutes(),
  };
};

const fieldValue = (f: string, m: Moment, loc: SamplerLocale): string => {
  switch (f[0]) {
    case "y":
      return f.length === 2 ? pad2(m.y % 100) : String(m.y);
    case "M":
      return f.length >= 4
        ? (loc.months[m.mo] ?? "")
        : f.length === 3
          ? (loc.monthsShort[m.mo] ?? "")
          : f.length === 2
            ? pad2(m.mo + 1)
            : String(m.mo + 1);
    case "d":
      return f.length === 2 ? pad2(m.d) : String(m.d);
    case "E":
      return f.length >= 4
        ? (loc.weekdays[m.wd] ?? "")
        : (loc.weekdaysShort[m.wd] ?? "");
    case "h": {
      const h = m.h % 12 || 12;
      return f.length === 2 ? pad2(h) : String(h);
    }
    case "K":
      return String(m.h % 12);
    case "H":
      return f.length === 2 ? pad2(m.h) : String(m.h);
    case "m":
      return f.length === 2 ? pad2(m.mi) : String(m.mi);
    case "a":
      return loc.dayPeriods[m.h < 12 ? 0 : 1];
    default:
      return f;
  }
};

/**
 * A pattern, printed and cut into words (runs between spaces), each word a
 * list of pieces: a field's value or a stretch of literal text. Words are
 * what the sample wraps between; pieces are what roll.
 */
const printPattern = (
  pattern: string,
  m: Moment,
  loc: SamplerLocale,
): string[][] => {
  const pieces: string[] = [];
  const literal = (text: string) => {
    for (const part of text.split(/( +)/)) {
      if (!part) continue;
      pieces.push(part.trim() === "" ? " " : part);
    }
  };
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] ?? "";
    if (ch === "'") {
      const end = pattern.indexOf("'", i + 1);
      literal(pattern.slice(i + 1, end < 0 ? undefined : end));
      i = end < 0 ? pattern.length : end + 1;
    } else if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (pattern[j] === ch) j += 1;
      pieces.push(fieldValue(pattern.slice(i, j), m, loc));
      i = j;
    } else {
      let j = i;
      while (j < pattern.length && !/[A-Za-z']/.test(pattern[j] ?? "")) j += 1;
      literal(pattern.slice(i, j));
      i = j;
    }
  }
  const words: string[][] = [[]];
  for (const p of pieces) {
    if (p === " ") {
      if ((words[words.length - 1] ?? []).length) words.push([]);
    } else {
      words[words.length - 1]?.push(p);
    }
  }
  return words.filter((w) => w.length);
};

const SEPARATORS: Record<
  Exclude<SamplerNumberStyle, "auto">,
  { decimal: string; group: string; label: string }
> = {
  "comma-dot": { decimal: ".", group: ",", label: "Comma groups, point" },
  "dot-comma": { decimal: ",", group: ".", label: "Point groups, comma" },
  "space-comma": { decimal: ",", group: " ", label: "Space groups, comma" },
  "apos-dot": { decimal: ".", group: "’", label: "Apostrophe groups, point" },
};

type Piece = { key: string; text: string };

/** An amount, cut by role so a separator or the mark can change on its own. */
const printAmount = (
  amount: number,
  mark: string,
  loc: SamplerLocale,
  style: SamplerNumberStyle,
): Piece[] => {
  const sep = style === "auto" ? loc : SEPARATORS[style];
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = String(Math.floor(cents / 100));
  const out: Piece[] = [
    { key: "mark-before", text: loc.currency === "before" ? mark : "" },
  ];
  for (let i = 0; i < whole.length; i += 1) {
    const place = whole.length - 1 - i;
    out.push({ key: `i${place}`, text: whole[i] ?? "" });
    if (place > 0 && place % 3 === 0)
      out.push({ key: `g${place}`, text: sep.group });
  }
  out.push({ key: "dec", text: sep.decimal });
  out.push({ key: "frac", text: pad2(cents % 100) });
  out.push({
    key: "mark-after",
    text: loc.currency === "after" ? ` ${mark}` : "",
  });
  return out;
};

const offsetText = (offset: number) => {
  const sign = offset < 0 ? "−" : "+";
  const a = Math.abs(offset);
  return `UTC${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
};

type Printed = {
  loc: SamplerLocale;
  zone: SamplerZone;
  amount: Piece[];
  due: string[][];
  at: string;
  time: string[][];
  zoneText: string;
  issued: string[][];
  week: { label: string; day: string; due: boolean }[];
  weekStartDay: number;
  /** The due line as one plain sentence. */
  sentence: string;
  amountText: string;
};

const datePattern = (loc: SamplerLocale, style: SamplerDateStyle) =>
  style === "iso"
    ? "y-MM-dd"
    : style === "auto"
      ? loc.dates.long
      : loc.dates[style];

const words = (w: string[][]) => w.map((p) => p.join("")).join(" ");

function printAll(
  settings: SamplerSettings,
  locales: SamplerLocale[],
  zones: SamplerZone[],
  sample: SamplerSample,
): Printed {
  const fallbackLoc = defaultSamplerLocales[0] as SamplerLocale;
  const loc =
    locales.find((l) => l.id === settings.locale) ?? locales[0] ?? fallbackLoc;
  const zone = zones.find((z) => z.id === settings.timeZone) ??
    zones[0] ?? { id: "UTC", label: "UTC", offset: 0 };
  const due = momentOf(sample.due, zone.offset);
  const issued = momentOf(sample.issued, zone.offset);
  const h12 = settings.time === "auto" ? loc.hour12 : settings.time === "h12";
  const pattern = datePattern(loc, settings.date);
  const ws =
    settings.weekStart === "auto"
      ? loc.weekStart
      : settings.weekStart === "monday"
        ? 1
        : settings.weekStart === "sunday"
          ? 0
          : 6;
  const lead = (due.wd - ws + 7) % 7;
  const dueDay = Date.UTC(due.y, due.mo, due.d);
  const week = Array.from({ length: 7 }, (_, i) => {
    const t = new Date(dueDay + (i - lead) * DAY_MS);
    const wd = (ws + i) % 7;
    return {
      label: loc.weekdaysShort[wd] ?? "",
      day: String(t.getUTCDate()),
      due: i === lead,
    };
  });
  const amount = printAmount(
    sample.amount,
    sample.currency,
    loc,
    settings.number,
  );
  const dueWords = printPattern(pattern, due, loc);
  const timeWords = printPattern(h12 ? loc.times.h12 : loc.times.h24, due, loc);
  const zoneText = offsetText(zone.offset);
  const sentence = `${words(dueWords)}${loc.at ? ` ${loc.at}` : ""} ${words(timeWords)} (${zoneText})`;
  return {
    loc,
    zone,
    amount,
    due: dueWords,
    at: loc.at,
    time: timeWords,
    zoneText,
    issued: printPattern(pattern, issued, loc),
    week,
    weekStartDay: ws,
    sentence,
    amountText: amount.map((p) => p.text).join(""),
  };
}

/* ----------------------------------------------------------------------- */
/*                                  Roller                                  */
/* ----------------------------------------------------------------------- */

const useIsoLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
/** Every line in the sample is 1.5em tall, so a digit column is too. */
const LINE = 1.5;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * One counter wheel. At rest it is the bare digit; only while it rolls does
 * the strip of ten exist, so a still sample carries no hidden wheels.
 */
function DigitColumn({
  digit,
  delay,
  motionSafe,
}: {
  digit: number;
  delay: number;
  motionSafe: boolean;
}) {
  const [shown, setShown] = React.useState(digit);
  const [roll, setRoll] = React.useState<{
    from: number;
    to: number;
    n: number;
  } | null>(null);
  if (shown !== digit) {
    setShown(digit);
    if (motionSafe) setRoll({ from: shown, to: digit, n: (roll?.n ?? 0) + 1 });
  }

  if (!roll) {
    return (
      <span className="inline-block text-center" style={{ width: "1ch" }}>
        {digit}
      </span>
    );
  }
  return (
    <span
      className="relative inline-block overflow-clip"
      style={{ width: "1ch", height: `${LINE}em` }}
    >
      <motion.span
        key={roll.n}
        className="absolute top-0 left-0 flex w-full flex-col items-center"
        initial={{ y: `${-roll.from * LINE}em` }}
        animate={{ y: `${-roll.to * LINE}em` }}
        transition={{ ...springs.snap, delay }}
        onAnimationComplete={() => setRoll(null)}
      >
        {DIGITS.map((x) => (
          <span key={x} style={{ height: `${LINE}em`, lineHeight: LINE }}>
            {x}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * One slot of the sample. Digits sit on counter wheels that roll to their new
 * figure on `snap`; anything else rolls out upward on the exit ease while the
 * new form rolls in from below. The slot's width glides between the two
 * measured widths on `glide`, so its neighbours slide aside, and a wash of the
 * accent fades behind it so the change is seen.
 */
function Slot({
  text,
  delay,
  motionSafe,
  fresh = false,
}: {
  text: string;
  delay: number;
  motionSafe: boolean;
  fresh?: boolean;
}) {
  const [view, setView] = React.useState({ text, n: fresh ? 1 : 0 });
  if (view.text !== text) setView({ text, n: view.n + 1 });

  const sizer = React.useRef<HTMLSpanElement | null>(null);
  const width = useMotionValue("auto");
  const last = React.useRef<number | null>(fresh ? 0 : null);

  useIsoLayoutEffect(() => {
    const node = sizer.current;
    if (!node) return;
    const next = node.getBoundingClientRect().width;
    const prev = last.current;
    last.current = next;
    if (prev === null || !motionSafe || Math.abs(prev - next) < 0.5) {
      width.set("auto");
      return;
    }
    width.set(`${r2(prev)}px`);
    const controls = animate(prev, next, {
      ...springs.glide,
      delay,
      onUpdate: (v) => width.set(`${r2(Math.max(0, v))}px`),
      onComplete: () => width.set("auto"),
    });
    return () => {
      controls.stop();
      width.set("auto");
    };
    // Measured once per change of text: `n` is the change.
  }, [view.n]);

  const digits = /^\d+$/.test(view.text);
  const chars = Array.from(view.text);

  return (
    <motion.span
      // Tracking would make the text wider or narrower than its wheels: a
      // slot always sets its own letters at normal spacing.
      className="relative inline-block overflow-clip align-top tracking-normal whitespace-pre"
      style={{ width }}
    >
      {view.n > 0 ? (
        <motion.span
          key={`wash-${view.n}`}
          aria-hidden
          className="absolute inset-0 rounded-[3px] bg-[color-mix(in_oklab,var(--fs-accent)_26%,transparent)]"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{
            duration: 0.9,
            delay: delay + 0.12,
            ease: easings.enter,
          }}
        />
      ) : null}
      {/* Digits ride 1ch wheels, so a digit slot is sized in ch too: the
          body font's proportional figures are narrower than its wheels. */}
      <span
        ref={sizer}
        className="invisible inline-block"
        style={digits ? { width: `${chars.length}ch` } : undefined}
      >
        {view.text || "\u200b"}
      </span>
      {digits ? (
        <span className="absolute top-0 left-0 flex">
          {chars.map((ch, i) => {
            const place = chars.length - 1 - i;
            return (
              <DigitColumn
                key={place}
                digit={Number(ch)}
                delay={delay + place * 0.025}
                motionSafe={motionSafe}
              />
            );
          })}
        </span>
      ) : (
        <AnimatePresence initial={fresh}>
          <motion.span
            key={view.n}
            className="absolute top-0 left-0 whitespace-pre"
            initial={{ y: motionSafe ? "100%" : 0, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            // The old form leaves on the exit ease over the same beat the new
            // one arrives on `snap`, so the two cross like a wheel turning.
            exit={{
              y: motionSafe ? "-100%" : 0,
              opacity: 0,
              transition: {
                duration: durations.base,
                ease: easings.exit,
                delay,
              },
            }}
            transition={{
              y: motionSafe ? { ...springs.snap, delay } : { duration: 0 },
              opacity: { duration: durations.base, delay },
            }}
          >
            {view.text}
          </motion.span>
        </AnimatePresence>
      )}
    </motion.span>
  );
}

/** Words of slots: the line wraps only at the spaces between words. */
function Words({
  words: list,
  base,
  motionSafe,
  className,
}: {
  words: string[][];
  base: number;
  motionSafe: boolean;
  className?: string;
}) {
  // A slot is new when the pattern grew past what was printed before: only
  // those roll in from nothing. Kept as state from the previous print, so the
  // server, hydration and a fresh client mount all print the first one still.
  const shape = list.map((w) => w.length).join(",");
  const [history, setHistory] = React.useState({ now: shape, before: shape });
  if (history.now !== shape) setHistory({ now: shape, before: history.now });
  const before = history.before.split(",").map(Number);
  const starts = list.map(
    (_, w) => base + list.slice(0, w).reduce((n, x) => n + x.length, 0),
  );
  return (
    <span className={className}>
      {list.map((word, w) => (
        <React.Fragment key={w}>
          {w > 0 ? " " : null}
          <span className="inline-block whitespace-nowrap">
            {word.map((piece, p) => (
              <Slot
                key={p}
                text={piece}
                delay={Math.min(0.36, ((starts[w] ?? base) + p) * 0.018)}
                motionSafe={motionSafe}
                fresh={p >= (before[w] ?? 0)}
              />
            ))}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Combobox                                 */
/* ----------------------------------------------------------------------- */

type Option = { value: string; label: string; hint?: string };

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * An editable combobox: type to narrow the list (type-ahead), arrows to move,
 * Enter to choose, Escape to close and then to put the chosen label back.
 */
function Combo({
  id,
  label,
  options,
  value,
  onChoose,
  disabled,
  fieldClass,
  motionSafe,
  scroller,
}: {
  id: string;
  label: string;
  options: Option[];
  value: string;
  onChoose: (value: string) => void;
  disabled: boolean;
  fieldClass: string;
  motionSafe: boolean;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const listId = `${id}-list`;
  const chosen = options.find((o) => o.value === value);
  const [text, setText] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [up, setUp] = React.useState(false);
  const input = React.useRef<HTMLInputElement | null>(null);
  const list = React.useRef<HTMLUListElement | null>(null);

  const q = fold(text ?? "");
  const shown =
    text === null || !q
      ? options
      : [
          ...options.filter((o) => fold(o.label).startsWith(q)),
          ...options.filter(
            (o) =>
              !fold(o.label).startsWith(q) &&
              fold(`${o.label} ${o.hint ?? ""} ${o.value}`).includes(q),
          ),
        ];

  const place = () => {
    const box = scroller.current?.getBoundingClientRect();
    const field = input.current?.getBoundingClientRect();
    if (!box || !field) return;
    const below = box.bottom - field.bottom;
    const above = field.top - box.top;
    setUp(below < 200 && above > below);
  };

  const openAt = (index: number) => {
    place();
    setOpen(true);
    setActive(Math.max(0, index));
  };

  const close = () => {
    setOpen(false);
    setText(null);
  };

  const choose = (option: Option | undefined) => {
    if (!option) return;
    setOpen(false);
    setText(null);
    if (option.value !== value) onChoose(option.value);
  };

  // Keeps the active option in view inside the list, never by scrolling the
  // page.
  React.useEffect(() => {
    const box = list.current;
    if (!open || !box) return;
    const item = box.children[active] as HTMLElement | undefined;
    if (!item) return;
    if (item.offsetTop < box.scrollTop) box.scrollTop = item.offsetTop;
    else if (
      item.offsetTop + item.offsetHeight >
      box.scrollTop + box.clientHeight
    )
      box.scrollTop = item.offsetTop + item.offsetHeight - box.clientHeight;
  }, [active, open]);

  const activeOption = open ? shown[active] : undefined;

  return (
    <div className="relative">
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeOption ? `${id}-opt-${activeOption.value}` : undefined
        }
        aria-disabled={disabled || undefined}
        readOnly={disabled}
        autoComplete="off"
        spellCheck={false}
        value={text ?? chosen?.label ?? ""}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setText(next);
          if (!open) place();
          setOpen(true);
          setActive(0);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={close}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const down = event.key === "ArrowDown";
            if (!open) {
              openAt(
                Math.max(
                  0,
                  options.findIndex((o) => o.value === value),
                ),
              );
              return;
            }
            setActive((a) =>
              shown.length === 0
                ? 0
                : (a + (down ? 1 : -1) + shown.length) % shown.length,
            );
          } else if (event.key === "Enter") {
            if (open) {
              event.preventDefault();
              choose(shown[active]);
            }
          } else if (event.key === "Escape") {
            if (open || text !== null) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          } else if (event.key === "Home" && open) {
            event.preventDefault();
            setActive(0);
          } else if (event.key === "End" && open) {
            event.preventDefault();
            setActive(Math.max(0, shown.length - 1));
          }
        }}
        className={cn(fieldClass, "pr-8")}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Show ${label.toLowerCase()} options`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (disabled) return;
          input.current?.focus();
          if (open) close();
          else
            openAt(
              Math.max(
                0,
                options.findIndex((o) => o.value === value),
              ),
            );
        }}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-ink-3 hover:text-foreground"
      >
        <ChevronDown
          aria-hidden
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            ref={list}
            key="list"
            id={listId}
            role="listbox"
            aria-label={label}
            className={cn(
              "absolute inset-x-0 z-30 max-h-56 overflow-y-auto overscroll-contain rounded-2 border border-hairline-strong bg-popover p-1 shadow-[0_12px_28px_color-mix(in_oklab,black_18%,transparent)]",
              up ? "bottom-full mb-1" : "top-full mt-1",
            )}
            initial={{ opacity: 0, y: motionSafe ? (up ? 4 : -4) : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
          >
            {shown.length === 0 ? (
              <li
                role="option"
                aria-selected={false}
                aria-disabled
                className="px-2.5 py-2 text-[12.5px] text-ink-3"
              >
                Nothing matches “{text}”
              </li>
            ) : (
              shown.map((o, i) => (
                <li
                  key={o.value}
                  id={`${id}-opt-${o.value}`}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-baseline justify-between gap-3 rounded-[calc(var(--radius-2)-2px)] px-2.5 py-1.5 text-[12.5px]",
                    i === active
                      ? "bg-[color-mix(in_oklab,var(--fs-accent)_14%,transparent)] text-foreground"
                      : "text-ink-2",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Check
                      aria-hidden
                      className={cn(
                        "size-3 shrink-0 text-(--fs-accent)",
                        o.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{o.label}</span>
                  </span>
                  {o.hint ? (
                    <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                      {o.hint}
                    </span>
                  ) : null}
                </li>
              ))
            )}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Native radios drawn as a segmented control; the mark slides on `snap`. */
function Segments({
  name,
  legend,
  options,
  value,
  onChoose,
  disabled,
  motionSafe,
  markId,
  height,
}: {
  name: string;
  legend: string;
  options: Option[];
  value: string;
  onChoose: (value: string) => void;
  disabled: boolean;
  motionSafe: boolean;
  markId: string;
  height: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-[12px] font-medium text-ink-2">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-0.5 rounded-2 border border-hairline bg-surface-2 p-0.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[calc(var(--radius-2)-2px)] px-2 text-[12px] whitespace-nowrap transition-colors select-none",
                height,
                on ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={on}
                aria-disabled={disabled || undefined}
                onChange={() => {
                  if (!disabled) onChoose(o.value);
                }}
                className="sr-only"
              />
              {on ? (
                <motion.span
                  layoutId={markId}
                  aria-hidden
                  className="absolute inset-0 rounded-[calc(var(--radius-2)-2px)] border border-hairline-strong bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_10%,transparent)]"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span className="relative">{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<SamplerAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const DENSITY: Record<
  SamplerDensity,
  { field: string; seg: string; gap: string; pad: string; body: string }
> = {
  compact: {
    field: "h-8 text-[12.5px]",
    seg: "h-7",
    gap: "gap-3",
    pad: "p-3.5",
    body: "gap-4",
  },
  regular: {
    field: "h-9 text-[13px]",
    seg: "h-8",
    gap: "gap-4",
    pad: "p-4",
    body: "gap-5",
  },
  roomy: {
    field: "h-10 text-[14px]",
    seg: "h-9",
    gap: "gap-5",
    pad: "p-5",
    body: "gap-6",
  },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const FIELDS: SamplerField[] = [
  "locale",
  "timeZone",
  "date",
  "time",
  "number",
  "weekStart",
];
const FIELD_NAME: Record<SamplerField, string> = {
  locale: "Language",
  timeZone: "Time zone",
  date: "Dates",
  time: "Time",
  number: "Numbers",
  weekStart: "Week starts on",
};

const noop = () => () => {};
const same = (a: SamplerSettings, b: SamplerSettings) =>
  FIELDS.every((f) => a[f] === b[f]);

/**
 * Locale and region settings beside a sample that prints them. Every value in
 * the sample — weekday, day, month, year, hour, minute, the "at" word, each
 * separator, the currency mark — is a slot; changing any setting re-prints
 * the sample and every slot whose text changed rolls to its new form in
 * place: digits on counter wheels (`snap`), words out and in, widths gliding
 * (`glide`) so neighbours slide aside, a wash of the accent fading behind each
 * one. Nothing is formatted with `Intl` during render, so the server and the
 * browser print the same sample.
 *
 * Language, time zone, dates and numbers are comboboxes that narrow as you
 * type; time and week start are radio groups whose mark slides on `snap`. A
 * detected locale is offered as a one-click suggestion, Save may return a
 * promise, and a failed save keeps every choice.
 */
export function FormatSampler({
  locales = defaultSamplerLocales,
  timezones = defaultSamplerZones,
  value,
  defaultValue = defaultSamplerSettings,
  onValueChange,
  onChange,
  onSave,
  sample = defaultSamplerSample,
  detectedLocale,
  status = "ready",
  onRetry,
  sampleStyle = "card",
  density = "regular",
  accent = "cobalt",
  title = "Language and region",
  height = 540,
  disabled = false,
  className,
}: FormatSamplerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const d = DENSITY[density] ?? DENSITY.regular;
  const color =
    accent in ACCENTS ? ACCENTS[accent as SamplerAccent] : (accent as string);

  const [own, setOwn] = React.useState<SamplerSettings>(defaultValue);
  const settings = value ?? own;
  const [saved, setSaved] = React.useState<SamplerSettings>(
    value ?? defaultValue,
  );
  const [saving, setSaving] = React.useState<
    "idle" | "pending" | "done" | "failed"
  >("idle");
  const [dismissed, setDismissed] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const alive = React.useRef(true);
  const doneTimer = React.useRef<number | null>(null);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (doneTimer.current !== null) window.clearTimeout(doneTimer.current);
    };
  }, []);

  const browserLanguage = React.useSyncExternalStore(
    noop,
    () => (typeof navigator !== "undefined" ? navigator.language : null),
    () => null,
  );
  const detectedRaw =
    detectedLocale === undefined ? browserLanguage : detectedLocale;
  const detected = detectedRaw
    ? (locales.find((l) => l.id.toLowerCase() === detectedRaw.toLowerCase()) ??
      locales.find(
        (l) =>
          l.id.split("-")[0]?.toLowerCase() ===
          detectedRaw.split("-")[0]?.toLowerCase(),
      ))
    : undefined;

  const printed = printAll(settings, locales, timezones, sample);
  const dirty = !same(settings, saved);
  const changedCount = FIELDS.filter((f) => settings[f] !== saved[f]).length;
  const inert = disabled || status !== "ready";

  const apply = (field: SamplerField, next: string) => {
    if (inert) return;
    const updated = { ...settings, [field]: next } as SamplerSettings;
    if (value === undefined) setOwn(updated);
    if (saving === "done" || saving === "failed") setSaving("idle");
    onValueChange?.(updated);
    onChange?.(field, next, updated);
    const after = printAll(updated, locales, timezones, sample);
    setAnnouncement(
      `${FIELD_NAME[field]} changed. The invoice is now due ${after.sentence}, for ${after.amountText}.`,
    );
  };

  const discard = () => {
    if (inert || !dirty) return;
    if (value === undefined) setOwn(saved);
    setSaving("idle");
    onValueChange?.(saved);
    setAnnouncement("Changes discarded.");
  };

  const save = async () => {
    if (inert || saving === "pending") return;
    if (!dirty && saving !== "failed") return;
    const snapshot = settings;
    setSaving("pending");
    try {
      await onSave?.(snapshot);
      if (!alive.current) return;
      setSaved(snapshot);
      setSaving("done");
      setAnnouncement("Saved.");
      if (doneTimer.current !== null) window.clearTimeout(doneTimer.current);
      doneTimer.current = window.setTimeout(() => {
        doneTimer.current = null;
        setSaving((s) => (s === "done" ? "idle" : s));
      }, 2400);
    } catch {
      if (!alive.current) return;
      setSaving("failed");
      setAnnouncement("Not saved. Your choices are still here.");
    }
  };

  /* --- options, each with a preview printed in the current settings */
  const localeOptions: Option[] = locales.map((l) => ({
    value: l.id,
    label: l.name,
    hint: words(
      printPattern(
        l.dates.medium,
        momentOf(sample.due, printed.zone.offset),
        l,
      ),
    ),
  }));
  const zoneOptions: Option[] = timezones.map((z) => ({
    value: z.id,
    label: z.label,
    hint: offsetText(z.offset),
  }));
  const preview = (patch: Partial<SamplerSettings>) =>
    printAll({ ...settings, ...patch }, locales, timezones, sample);
  const dateOptions: Option[] = (
    ["auto", "long", "medium", "short", "iso"] as SamplerDateStyle[]
  ).map((style) => ({
    value: style,
    label:
      style === "auto"
        ? "Language default"
        : style === "iso"
          ? "ISO 8601"
          : style[0]?.toUpperCase() + style.slice(1),
    hint: words(preview({ date: style }).issued),
  }));
  const numberOptions: Option[] = (
    [
      "auto",
      "comma-dot",
      "dot-comma",
      "space-comma",
      "apos-dot",
    ] as SamplerNumberStyle[]
  ).map((style) => ({
    value: style,
    label: style === "auto" ? "Language default" : SEPARATORS[style].label,
    hint: preview({ number: style })
      .amount.map((p) => p.text)
      .join("")
      .replace(sample.currency, "")
      .trim(),
  }));
  const h12Preview = words(
    printPattern(
      printed.loc.times.h12,
      momentOf(sample.due, printed.zone.offset),
      printed.loc,
    ),
  );
  const h24Preview = words(
    printPattern(
      printed.loc.times.h24,
      momentOf(sample.due, printed.zone.offset),
      printed.loc,
    ),
  );

  const fieldClass = cn(
    "w-full rounded-2 border border-input bg-surface-1 px-3 text-foreground transition-colors placeholder:text-ink-3",
    "outline-none focus-visible:border-(--fs-accent) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--fs-accent) focus-visible:outline-solid",
    d.field,
    inert && "opacity-60",
  );

  /* --- the sample: one running index, so the changes ripple left to right */
  const slotDelay = (index: number) => Math.min(0.36, index * 0.018);
  const amountSlots = (
    <span className="inline-block whitespace-nowrap">
      {printed.amount.map((p, i) => (
        <Slot
          key={p.key}
          text={p.text}
          delay={slotDelay(i)}
          motionSafe={motionSafe}
        />
      ))}
    </span>
  );
  const dueSlots = (
    <Words words={printed.due} base={10} motionSafe={motionSafe} />
  );
  const atSlot = (
    <Slot
      text={printed.at ? `${printed.at}\u00a0` : ""}
      delay={slotDelay(18)}
      motionSafe={motionSafe}
    />
  );
  const timeSlots = (
    <Words words={printed.time} base={18} motionSafe={motionSafe} />
  );
  const zoneSlots = (
    <span className="inline-block whitespace-nowrap text-ink-3">
      <Slot
        text={printed.zoneText}
        delay={slotDelay(22)}
        motionSafe={motionSafe}
      />
    </span>
  );
  const issuedSlots = (
    <Words words={printed.issued} base={22} motionSafe={motionSafe} />
  );

  const weekStrip = (compact: boolean) => (
    <div
      aria-hidden
      className={cn(
        "grid grid-cols-7 gap-1 text-center tabular-nums",
        compact ? "text-[11px]" : "text-[12px]",
      )}
    >
      {printed.week.map((cell, i) => (
        <div
          key={i}
          className="relative flex flex-col items-center rounded-2 py-1"
        >
          {cell.due ? (
            <motion.span
              layoutId={`${uid}-due`}
              className="absolute inset-0 rounded-2 border border-(--fs-accent) bg-[color-mix(in_oklab,var(--fs-accent)_12%,transparent)]"
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          ) : null}
          <span className="relative max-w-full overflow-clip text-[10.5px] text-ink-3">
            <Slot
              text={cell.label}
              delay={slotDelay(14 + i)}
              motionSafe={motionSafe}
            />
          </span>
          <span
            className={cn(
              "relative font-medium",
              cell.due ? "text-foreground" : "text-ink-2",
            )}
          >
            <Slot
              text={cell.day}
              delay={slotDelay(14 + i)}
              motionSafe={motionSafe}
            />
          </span>
        </div>
      ))}
    </div>
  );

  const sampleBody = () => {
    if (status === "loading") {
      return (
        <div aria-hidden className="flex flex-col gap-3">
          {[60, 38, 72, 44].map((w, i) => (
            <span
              key={i}
              className="h-3 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      );
    }
    if (sampleStyle === "line") {
      return (
        <div className="flex flex-col gap-4">
          <p
            className="text-[17px] text-foreground"
            style={{ lineHeight: LINE }}
          >
            {sample.from}’s invoice {sample.reference} for{" "}
            <span className="font-semibold">{amountSlots}</span> is due{" "}
            {dueSlots} {atSlot}
            {timeSlots} {zoneSlots}.
          </p>
          {weekStrip(false)}
        </div>
      );
    }
    if (sampleStyle === "receipt") {
      const row = (label: string, content: React.ReactNode) => (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-ink-3">{label}</span>
          <span
            aria-hidden
            className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-hairline-strong"
          />
          <span className="text-right text-foreground">{content}</span>
        </div>
      );
      return (
        <div
          className="flex flex-col gap-1.5 font-mono text-[12.5px]"
          style={{ lineHeight: LINE }}
        >
          <div className="mb-1 flex justify-between border-b border-dashed border-hairline-strong pb-2 text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            <span>{sample.from}</span>
            <span>{sample.reference}</span>
          </div>
          {row("AMOUNT", amountSlots)}
          {row("DUE", dueSlots)}
          {row(
            "AT",
            <>
              {timeSlots} {zoneSlots}
            </>,
          )}
          {row("ISSUED", issuedSlots)}
          <div className="mt-2 border-t border-dashed border-hairline-strong pt-2">
            {weekStrip(true)}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3" style={{ lineHeight: LINE }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[12px] text-ink-3">
            Invoice{" "}
            <span className="font-mono text-ink-2">{sample.reference}</span>
          </span>
          <span className="text-[12px] font-medium text-ink-2">
            {sample.from}
          </span>
        </div>
        <div>
          <p className="text-[11px] tracking-[0.06em] text-ink-3 uppercase">
            Amount due
          </p>
          <p className="text-[26px] font-semibold text-foreground">
            {amountSlots}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
          <dt className="text-ink-3">Due</dt>
          <dd className="text-foreground">
            {dueSlots} {atSlot}
            {timeSlots}
          </dd>
          <dt className="text-ink-3">Zone</dt>
          <dd>{zoneSlots}</dd>
          <dt className="text-ink-3">Issued</dt>
          <dd className="text-ink-2">{issuedSlots}</dd>
        </dl>
        <div className="border-t border-hairline pt-3">{weekStrip(false)}</div>
      </div>
    );
  };

  const sampleCard = (
    <div
      role="group"
      aria-label="Sample"
      className={cn(
        "rounded-3 border border-hairline bg-surface-1 tabular-nums",
        d.pad,
        sampleStyle === "receipt" && "border-dashed bg-card",
      )}
    >
      <p className="sr-only">
        {sample.from} invoice {sample.reference} for {printed.amountText}, due{" "}
        {printed.sentence}.
      </p>
      <div aria-hidden>{sampleBody()}</div>
    </div>
  );

  const suggestion =
    detected &&
    detected.id !== settings.locale &&
    !dismissed &&
    status === "ready";

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--fs-accent" as string]: color }}
    >
      <header className="flex flex-col gap-0.5 border-b border-hairline px-4 pt-3.5 pb-3">
        <h2 id={titleId} className="text-sm font-semibold">
          {title}
        </h2>
        <p className="text-[12px] text-ink-3">
          How {sample.from} prints dates, times and amounts on invoices, exports
          and email.
        </p>
      </header>

      <div
        ref={scroller}
        className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <TriangleAlert aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-ink-2">These settings did not load.</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "grid grid-cols-1 p-4 @min-[44rem]:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]",
              d.body,
            )}
          >
            <div className="@min-[44rem]:sticky @min-[44rem]:top-0 @min-[44rem]:order-2 @min-[44rem]:self-start">
              {sampleCard}
            </div>

            <form
              className={cn("flex min-w-0 flex-col", d.gap)}
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
              aria-busy={status === "loading" || undefined}
            >
              <AnimatePresence initial={false}>
                {suggestion ? (
                  <motion.div
                    key="suggest"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{
                      height: 0,
                      opacity: 0,
                      transition: exitFor(durations.base),
                    }}
                    transition={{
                      height: motionSafe ? springs.glide : { duration: 0 },
                      opacity: { duration: durations.base },
                    }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-2 border border-[color-mix(in_oklab,var(--fs-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--fs-accent)_7%,transparent)] px-3 py-2.5">
                      <Languages
                        aria-hidden
                        className="size-4 shrink-0 text-(--fs-accent)"
                      />
                      <p className="min-w-0 flex-1 basis-40 text-[12.5px] leading-snug text-ink-2">
                        Your browser reads{" "}
                        <span className="font-medium text-foreground">
                          {detected.name}
                        </span>
                        .
                      </p>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => apply("locale", detected.id)}
                          className={cn(
                            "inline-flex h-7 items-center rounded-2 bg-(--fs-accent) px-2.5 text-[12px] font-medium text-background hover:opacity-90",
                            FOCUS_RING,
                          )}
                        >
                          Use it
                        </button>
                        <button
                          type="button"
                          aria-label="Dismiss the suggestion"
                          onClick={() => setDismissed(true)}
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground",
                            FOCUS_RING,
                          )}
                        >
                          <X aria-hidden className="size-3.5" />
                        </button>
                      </span>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {status === "loading" ? (
                Array.from({ length: 5 }, (_, i) => (
                  <div key={i} aria-hidden className="flex flex-col gap-1.5">
                    <span className="h-2.5 w-20 rounded-full bg-surface-2" />
                    <span
                      className={cn(
                        "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                        d.field,
                      )}
                    />
                  </div>
                ))
              ) : (
                <>
                  {(
                    [
                      ["locale", "Language", localeOptions],
                      ["timeZone", "Time zone", zoneOptions],
                      ["date", "Dates", dateOptions],
                      ["number", "Numbers", numberOptions],
                    ] as const
                  ).map(([field, label, options]) => (
                    <div key={field} className="flex flex-col gap-1.5">
                      <label
                        htmlFor={`${uid}-${field}`}
                        className="text-[12px] font-medium text-ink-2"
                      >
                        {label}
                      </label>
                      <Combo
                        id={`${uid}-${field}`}
                        label={label}
                        options={options}
                        value={settings[field]}
                        onChoose={(v) => apply(field, v)}
                        disabled={inert}
                        fieldClass={fieldClass}
                        motionSafe={motionSafe}
                        scroller={scroller}
                      />
                    </div>
                  ))}
                  <Segments
                    name={`${uid}-time`}
                    legend="Time"
                    markId={`${uid}-time-mark`}
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: "h12", label: h12Preview },
                      { value: "h24", label: h24Preview },
                    ]}
                    value={settings.time}
                    onChoose={(v) => apply("time", v)}
                    disabled={inert}
                    motionSafe={motionSafe}
                    height={d.seg}
                  />
                  <Segments
                    name={`${uid}-week`}
                    legend="Week starts on"
                    markId={`${uid}-week-mark`}
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: "monday", label: "Mon" },
                      { value: "sunday", label: "Sun" },
                      { value: "saturday", label: "Sat" },
                    ]}
                    value={settings.weekStart}
                    onChoose={(v) => apply("weekStart", v)}
                    disabled={inert}
                    motionSafe={motionSafe}
                    height={d.seg}
                  />
                </>
              )}
            </form>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline px-4 py-2.5">
        <p
          className={cn(
            "flex min-w-0 flex-1 basis-40 items-center gap-1.5 text-[12px]",
            saving === "failed" ? "text-danger" : "text-ink-3",
          )}
        >
          {saving === "failed" ? (
            <>
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
              Not saved. Your choices are still here.
            </>
          ) : saving === "done" ? (
            <>
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="size-3.5 shrink-0"
              >
                <motion.path
                  d="M3.5 8.5 6.5 11.5 12.5 4.5"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: motionSafe ? 0 : 1 }}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
              Saved
            </>
          ) : dirty ? (
            <>
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-(--fs-accent)"
              />
              {changedCount} unsaved {changedCount === 1 ? "change" : "changes"}
            </>
          ) : (
            "Everything is saved"
          )}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <AnimatePresence initial={false}>
            {dirty ? (
              <motion.button
                key="discard"
                type="button"
                onClick={discard}
                initial={{ opacity: 0, x: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  x: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                Discard
              </motion.button>
            ) : null}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => void save()}
            aria-disabled={
              (!dirty && saving !== "failed") || inert || undefined
            }
            aria-busy={saving === "pending" || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3.5 text-[12.5px] font-medium transition-colors",
              dirty || saving === "failed"
                ? "bg-(--fs-accent) text-background hover:opacity-90"
                : "cursor-default bg-surface-2 text-ink-3",
              FOCUS_RING,
            )}
          >
            {saving === "pending" ? (
              <LoaderCircle
                aria-hidden
                className="size-3.5 motion-safe:animate-spin"
              />
            ) : null}
            {saving === "pending"
              ? "Saving…"
              : saving === "failed"
                ? "Try again"
                : "Save"}
          </button>
        </span>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
