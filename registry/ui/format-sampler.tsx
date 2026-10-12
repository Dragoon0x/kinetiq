"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  Globe,
  MonitorSmartphone,
  RotateCcw,
  Search,
  TriangleAlert,
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

export type FormatDateStyle = "short" | "medium" | "long";
export type FormatHourCycle = "12" | "24";
export type FormatFirstDay = "monday" | "saturday" | "sunday";

/** Everything the sampler needs to format a line. */
export type FormatValue = {
  /** A BCP 47 tag, e.g. "de-DE". */
  locale: string;
  /** An IANA zone, e.g. "Europe/Lisbon". */
  zone: string;
  dateStyle: FormatDateStyle;
  hourCycle: FormatHourCycle;
  firstDay: FormatFirstDay;
  /** Whether digits are grouped: 1,234,567 or 1234567. */
  grouping: boolean;
  /** An ISO 4217 code, e.g. "EUR". */
  currency: string;
};

export type FormatLocale = {
  /** The BCP 47 tag. */
  id: string;
  /** The name in the current UI language, e.g. "German (Germany)". */
  label: string;
  /** The name in its own language, e.g. "Deutsch (Deutschland)". */
  native: string;
};

export type FormatZone = {
  /** The IANA id. */
  id: string;
  /** The city or zone as people say it, e.g. "Lisbon". */
  label: string;
  /** Where it is, for the second line: "Portugal". */
  region: string;
};

export type FormatCurrency = {
  /** The ISO 4217 code. */
  id: string;
  label: string;
};

/** One office on the world clock strip. */
export type FormatCity = { id: string; name: string; zone: string };

export type FormatSampleSet = "everyday" | "finance" | "engineering";
export type FormatLayout = "sheet" | "cards";
export type FormatDensity = "compact" | "cozy" | "roomy";
export type FormatStatus = "ready" | "loading" | "error";

/** What changed: one field, or "all" when the value was cleared or seeded. */
export type FormatChange = {
  key: keyof FormatValue | "all";
  from: string | boolean | null;
  to: string | boolean | null;
};

export type FormatSamplerProps = {
  /** Sample lines as one sheet of rows, or as a grid of small cards. @default "sheet" */
  samplerLayout?: FormatLayout;
  /** Which lines the sampler shows: everyday life, money, or measurements and timestamps. @default "everyday" */
  sampleSet?: FormatSampleSet;
  /** Row heights, paddings and the sample type size. @default "cozy" */
  density?: FormatDensity;
  /** Controlled value; null means the device's own formats. */
  value?: FormatValue | null;
  /** Initial value when uncontrolled; null starts on device defaults. @default defaultFormatValue */
  defaultValue?: FormatValue | null;
  /** Fires from the press or key that changed a field, with the whole value and what changed. */
  onChange?: (value: FormatValue | null, change: FormatChange) => void;
  /** The languages offered. @default defaultFormatLocales */
  locales?: FormatLocale[];
  /** The time zones offered. @default defaultFormatZones */
  zones?: FormatZone[];
  /** The currencies offered. @default defaultFormatCurrencies */
  currencies?: FormatCurrency[];
  /** The three offices on the world clock strip. @default defaultFormatCities */
  cities?: FormatCity[];
  /** The moment every sample is formatted at, in ms — never read from the clock. @default defaultFormatNow */
  now?: number;
  /** What "Use device" sets the zone to. @default the browser's own zone */
  deviceZone?: string;
  /** What the first pick starts from when the value is null. @default defaultFormatValue */
  seed?: FormatValue;
  /** Whether the choices have arrived. @default "ready" */
  status?: FormatStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Language and formats" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; its columns scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be picked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Monday 12 October 2026, 13:47:20 UTC. */
export const defaultFormatNow = Date.UTC(2026, 9, 12, 13, 47, 20);

export const defaultFormatLocales: FormatLocale[] = [
  { id: "en-GB", label: "English (UK)", native: "English (UK)" },
  { id: "en-US", label: "English (US)", native: "English (US)" },
  { id: "de-DE", label: "German (Germany)", native: "Deutsch (Deutschland)" },
  { id: "fr-FR", label: "French (France)", native: "Francais (France)" },
  { id: "es-ES", label: "Spanish (Spain)", native: "Espanol (Espana)" },
  { id: "pt-BR", label: "Portuguese (Brazil)", native: "Portugues (Brasil)" },
  { id: "it-IT", label: "Italian (Italy)", native: "Italiano (Italia)" },
  {
    id: "nl-NL",
    label: "Dutch (Netherlands)",
    native: "Nederlands (Nederland)",
  },
  { id: "sv-SE", label: "Swedish (Sweden)", native: "Svenska (Sverige)" },
  { id: "pl-PL", label: "Polish (Poland)", native: "Polski (Polska)" },
  { id: "tr-TR", label: "Turkish (Turkiye)", native: "Turkce (Turkiye)" },
  { id: "hi-IN", label: "Hindi (India)", native: "Hindi (Bharat)" },
  { id: "ja-JP", label: "Japanese (Japan)", native: "Nihongo (Nihon)" },
  { id: "ko-KR", label: "Korean (Korea)", native: "Hangugeo (Hanguk)" },
  { id: "zh-CN", label: "Chinese (China)", native: "Zhongwen (Zhongguo)" },
  { id: "ar-EG", label: "Arabic (Egypt)", native: "Arabi (Misr)" },
];

export const defaultFormatZones: FormatZone[] = [
  { id: "UTC", label: "UTC", region: "Coordinated Universal Time" },
  { id: "Europe/London", label: "London", region: "United Kingdom" },
  { id: "Europe/Lisbon", label: "Lisbon", region: "Portugal" },
  { id: "Europe/Berlin", label: "Berlin", region: "Germany" },
  { id: "Europe/Paris", label: "Paris", region: "France" },
  { id: "Europe/Warsaw", label: "Warsaw", region: "Poland" },
  { id: "Africa/Nairobi", label: "Nairobi", region: "Kenya" },
  { id: "Asia/Dubai", label: "Dubai", region: "United Arab Emirates" },
  { id: "Asia/Kolkata", label: "Kolkata", region: "India" },
  { id: "Asia/Singapore", label: "Singapore", region: "Singapore" },
  { id: "Asia/Tokyo", label: "Tokyo", region: "Japan" },
  { id: "Australia/Sydney", label: "Sydney", region: "Australia" },
  { id: "Pacific/Auckland", label: "Auckland", region: "New Zealand" },
  { id: "America/Sao_Paulo", label: "Sao Paulo", region: "Brazil" },
  { id: "America/New_York", label: "New York", region: "United States" },
  { id: "America/Chicago", label: "Chicago", region: "United States" },
  { id: "America/Denver", label: "Denver", region: "United States" },
  { id: "America/Los_Angeles", label: "Los Angeles", region: "United States" },
];

export const defaultFormatCurrencies: FormatCurrency[] = [
  { id: "EUR", label: "Euro" },
  { id: "GBP", label: "Pound sterling" },
  { id: "USD", label: "US dollar" },
  { id: "CHF", label: "Swiss franc" },
  { id: "SEK", label: "Swedish krona" },
  { id: "PLN", label: "Polish zloty" },
  { id: "TRY", label: "Turkish lira" },
  { id: "INR", label: "Indian rupee" },
  { id: "JPY", label: "Japanese yen" },
  { id: "KRW", label: "South Korean won" },
  { id: "CNY", label: "Chinese yuan" },
  { id: "AED", label: "UAE dirham" },
  { id: "SGD", label: "Singapore dollar" },
  { id: "AUD", label: "Australian dollar" },
  { id: "BRL", label: "Brazilian real" },
  { id: "CAD", label: "Canadian dollar" },
];

/** Coldbrook's three offices. */
export const defaultFormatCities: FormatCity[] = [
  { id: "lisbon", name: "Lisbon", zone: "Europe/Lisbon" },
  { id: "nairobi", name: "Nairobi", zone: "Africa/Nairobi" },
  { id: "osaka", name: "Osaka", zone: "Asia/Tokyo" },
];

export const defaultFormatValue: FormatValue = {
  locale: "en-GB",
  zone: "Europe/Lisbon",
  dateStyle: "medium",
  hourCycle: "24",
  firstDay: "monday",
  grouping: true,
  currency: "EUR",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const MIN = 60_000;
const HOUR = 60 * MIN;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

const DENSITY: Record<
  FormatDensity,
  {
    field: string;
    option: string;
    row: string;
    sample: string;
    card: string;
    gap: string;
  }
> = {
  compact: {
    field: "h-8",
    option: "h-7",
    row: "py-1.5",
    sample: "text-[12px]",
    card: "p-2.5",
    gap: "gap-1.5",
  },
  cozy: {
    field: "h-9",
    option: "h-8",
    row: "py-2",
    sample: "text-[13px]",
    card: "p-3",
    gap: "gap-2",
  },
  roomy: {
    field: "h-10",
    option: "h-9",
    row: "py-2.5",
    sample: "text-[14px]",
    card: "p-3.5",
    gap: "gap-2.5",
  },
};

/** Formats with the locale asked for, falling back to en-US and UTC when a tag, zone or code is unknown. */
const fmtDate = (
  locale: string,
  options: Intl.DateTimeFormatOptions,
  ms: number,
): string => {
  try {
    return new Intl.DateTimeFormat(locale, options).format(ms);
  } catch {
    try {
      return new Intl.DateTimeFormat("en-US", {
        ...options,
        timeZone: "UTC",
      }).format(ms);
    } catch {
      return "--";
    }
  }
};

const fmtNumber = (
  locale: string,
  options: Intl.NumberFormatOptions,
  n: number,
): string => {
  try {
    return new Intl.NumberFormat(locale, options).format(n);
  } catch {
    try {
      return new Intl.NumberFormat("en-US", {
        ...options,
        currency: options.currency ? "USD" : undefined,
      }).format(n);
    } catch {
      return "--";
    }
  }
};

const fmtRelative = (
  locale: string,
  n: number,
  unit: Intl.RelativeTimeFormatUnit,
): string => {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
      n,
      unit,
    );
  } catch {
    return `${n} ${unit}`;
  }
};

/** A zone's offset from UTC at `ms`, in minutes; 0 for a zone Intl does not know. */
const offsetMinutes = (zone: string, ms: number): number => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(ms);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");
    const local = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    return Math.round((local - Math.floor(ms / 1000) * 1000) / MIN);
  } catch {
    return 0;
  }
};

/** "GMT+1", "GMT-4:30". */
const offsetLabel = (minutes: number): string => {
  if (minutes === 0) return "GMT";
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
};

/** "+8h", "-5:30", "same time". */
const deltaLabel = (minutes: number): string => {
  if (minutes === 0) return "same time";
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : "h"}`;
};

/** "America/Sao_Paulo" reads "Sao Paulo" when the zone is not in the list. */
const zoneFallbackLabel = (id: string) =>
  (id.split("/").pop() ?? id).replace(/_/g, " ");

const hourOptions = (cycle: FormatHourCycle): Intl.DateTimeFormatOptions =>
  cycle === "24" ? { hourCycle: "h23" } : { hourCycle: "h12" };

export type FormatSample = {
  id: string;
  label: string;
  text: string;
};

/** The sampler's lines for a value, in order. Exported so hosts can show one elsewhere. */
export const buildFormatSamples = (
  set: FormatSampleSet,
  value: FormatValue,
  now: number,
): FormatSample[] => {
  const { locale, zone, hourCycle, grouping, currency } = value;
  const base: Intl.NumberFormatOptions = { useGrouping: grouping };
  const money = (n: number, extra: Intl.NumberFormatOptions = {}) =>
    fmtNumber(locale, { ...base, style: "currency", currency, ...extra }, n);
  const unit = (
    n: number,
    u: string,
    display: "narrow" | "short" | "long" = "short",
    digits = 1,
  ) =>
    fmtNumber(
      locale,
      {
        ...base,
        style: "unit",
        unit: u,
        unitDisplay: display,
        maximumFractionDigits: digits,
      },
      n,
    );
  const date = (extra: Intl.DateTimeFormatOptions) =>
    fmtDate(locale, { timeZone: zone, ...extra }, now);
  const duration = `${unit(1, "hour", "narrow", 0)} ${unit(47, "minute", "narrow", 0)}`;

  if (set === "finance") {
    return [
      {
        id: "price",
        label: "Price",
        text: money(1249.5),
      },
      {
        id: "amount",
        label: "Large amount",
        text: money(1_284_300.75),
      },
      {
        id: "negative",
        label: "Refund",
        text: money(-312.4, { currencySign: "accounting" }),
      },
      {
        id: "change",
        label: "Change",
        text: fmtNumber(
          locale,
          {
            ...base,
            style: "percent",
            signDisplay: "exceptZero",
            maximumFractionDigits: 1,
          },
          0.042,
        ),
      },
      {
        id: "compact",
        label: "Volume",
        text: fmtNumber(
          locale,
          { ...base, notation: "compact", maximumFractionDigits: 1 },
          48_200_000,
        ),
      },
      {
        id: "settle",
        label: "Settles",
        text: date({ dateStyle: value.dateStyle }),
      },
      {
        id: "cutoff",
        label: "Cut-off",
        text: date({
          ...hourOptions(hourCycle),
          hour: "numeric",
          minute: "2-digit",
        }),
      },
      {
        id: "relative",
        label: "Statement",
        text: fmtRelative(locale, 2, "day"),
      },
    ];
  }

  if (set === "engineering") {
    return [
      {
        id: "stamp",
        label: "Timestamp",
        text: date({
          ...hourOptions(hourCycle),
          dateStyle: value.dateStyle,
          timeStyle: "long",
        }),
      },
      {
        id: "duration",
        label: "Build took",
        text: duration,
      },
      {
        id: "size",
        label: "Artifact",
        text: unit(1.84, "gigabyte"),
      },
      {
        id: "rate",
        label: "Throughput",
        text: unit(942.6, "megabit-per-second"),
      },
      {
        id: "count",
        label: "Requests",
        text: fmtNumber(locale, base, 18_432_907),
      },
      {
        id: "sci",
        label: "Samples",
        text: fmtNumber(
          locale,
          { ...base, notation: "engineering", maximumFractionDigits: 2 },
          18_432_907,
        ),
      },
      {
        id: "temp",
        label: "Rack inlet",
        text: unit(23.5, "celsius"),
      },
      {
        id: "relative",
        label: "Last deploy",
        text: fmtRelative(locale, -12, "minute"),
      },
    ];
  }

  return [
    {
      id: "today",
      label: "Today",
      text: date({ dateStyle: value.dateStyle }),
    },
    {
      id: "time",
      label: "Time",
      text: date({
        ...hourOptions(hourCycle),
        hour: "numeric",
        minute: "2-digit",
      }),
    },
    {
      id: "duration",
      label: "A call",
      text: duration,
    },
    {
      id: "price",
      label: "A coffee",
      text: money(3.6),
    },
    {
      id: "large",
      label: "Steps this year",
      text: fmtNumber(locale, base, 2_418_306),
    },
    {
      id: "size",
      label: "A photo",
      text: unit(4.7, "megabyte"),
    },
    {
      id: "relative",
      label: "Last sync",
      text: fmtRelative(locale, -3, "hour"),
    },
  ];
};

const WEEK_ANCHOR = Date.UTC(2026, 9, 12, 12); // a Monday, noon UTC

/** Seven short weekday names in the locale, starting on `firstDay`. */
const weekdays = (
  locale: string,
  firstDay: FormatFirstDay,
): { id: string; label: string }[] => {
  const start = firstDay === "monday" ? 0 : firstDay === "saturday" ? 5 : 6;
  return Array.from({ length: 7 }, (_, i) => {
    const day = (start + i) % 7;
    return {
      id: `d${day}`,
      label: fmtDate(
        locale,
        { weekday: "short", timeZone: "UTC" },
        WEEK_ANCHOR + day * 24 * HOUR,
      ),
    };
  });
};

const DATE_STYLES: { id: FormatDateStyle; label: string }[] = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
];

const FIRST_DAYS: { id: FormatFirstDay; label: string }[] = [
  { id: "monday", label: "Mon" },
  { id: "saturday", label: "Sat" },
  { id: "sunday", label: "Sun" },
];

const FIELD_WORD: Record<keyof FormatValue, string> = {
  locale: "Language",
  zone: "Time zone",
  dateStyle: "Date style",
  hourCycle: "Time",
  firstDay: "Week starts",
  grouping: "Digit grouping",
  currency: "Currency",
};

/* ----------------------------------------------------------------------- */
/*                             Cross-fading text                            */
/* ----------------------------------------------------------------------- */

/**
 * Renders a string one character at a time, keyed by position, so that when
 * the string changes only the characters that differ cross-fade: the old
 * glyph eases out on the exit ease while the new one fades in. Words stay
 * together so a line wraps between them, never inside.
 */
function CharFade({ text, className }: { text: string; className?: string }) {
  const words: { start: number; chars: string[] }[] = [];
  let i = 0;
  for (const token of text.split(/(\s+)/)) {
    if (token.length === 0) continue;
    const chars = Array.from(token);
    words.push({ start: i, chars });
    i += chars.length;
  }
  return (
    <span className={cn("inline", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex flex-wrap">
        {words.map((word) => (
          <span
            key={word.start}
            className="relative inline-flex whitespace-pre"
          >
            {word.chars.map((ch, j) => (
              <span key={word.start + j} className="relative inline-block">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={ch}
                    className="inline-block"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.base) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    {ch}
                  </motion.span>
                </AnimatePresence>
              </span>
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}

/** One sample: label, value, and a wash that lights when the value changes and fades on the exit ease. */
function SampleLine({
  sample,
  layout,
  density,
  live,
  index,
  motionSafe,
}: {
  sample: FormatSample;
  layout: FormatLayout;
  density: FormatDensity;
  live: boolean;
  index: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState(sample.text);
  const [mark, setMark] = React.useState(0);
  if (seen !== sample.text) {
    setSeen(sample.text);
    setMark((m) => m + 1);
  }
  const d = DENSITY[density];
  const card = layout === "cards";
  return (
    <motion.li
      initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        opacity: { duration: durations.base, ease: easings.enter },
        y: motionSafe
          ? { ...springs.glide, delay: r3(index * cascade(8)) }
          : { duration: 0 },
      }}
      className={cn(
        "relative",
        card
          ? cn("flex flex-col gap-1 rounded-3 border border-hairline", d.card)
          : cn(
              "flex flex-col gap-0.5 px-1 @min-[30rem]:flex-row @min-[30rem]:items-baseline @min-[30rem]:justify-between @min-[30rem]:gap-3",
              d.row,
            ),
      )}
    >
      {mark > 0 ? (
        <motion.span
          key={mark}
          aria-hidden
          className="pointer-events-none absolute -inset-x-1 -inset-y-0.5 rounded-2 bg-cobalt-wash"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: durations.slow, ease: easings.exit }}
        />
      ) : null}
      <span className="relative shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {sample.label}
      </span>
      <span
        className={cn(
          "relative min-w-0 font-mono text-foreground tabular-nums",
          d.sample,
          !card && "@min-[30rem]:text-right",
        )}
      >
        {live ? (
          <CharFade text={sample.text} />
        ) : (
          <span
            aria-hidden
            className="inline-block h-[1em] w-24 translate-y-px rounded-1 bg-surface-2"
          />
        )}
      </span>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Pickers                                 */
/* ----------------------------------------------------------------------- */

type PickOption = {
  id: string;
  label: string;
  detail?: string;
  /** Extra text the search matches, e.g. the native name or the IANA id. */
  keywords?: string;
};

type ListPickerProps = {
  id: string;
  name: string;
  /** What the closed field shows. */
  valueLabel: string;
  valueDetail?: string;
  /** True when no value is chosen yet. */
  empty: boolean;
  options: PickOption[];
  selected: string | null;
  open: boolean;
  onOpen: () => void;
  onClose: (returnFocus: boolean) => void;
  onSelect: (id: string) => void;
  placeholder: string;
  foot?: React.ReactNode;
  disabled: boolean;
  motionSafe: boolean;
  density: FormatDensity;
};

type PickerPanelProps = Pick<
  ListPickerProps,
  | "id"
  | "name"
  | "options"
  | "selected"
  | "onClose"
  | "onSelect"
  | "placeholder"
  | "foot"
  | "density"
>;

/**
 * The open half of a picker: a search box over a listbox. It mounts fresh
 * each time the field opens, so the search starts empty and the active row
 * starts on the chosen option. The box is a combobox: typing filters,
 * Up/Down move, Enter picks, Escape closes and returns focus to the field.
 */
function PickerPanel({
  id,
  name,
  options,
  selected,
  onClose,
  onSelect,
  placeholder,
  foot,
  density,
}: PickerPanelProps) {
  const listId = `${id}-list`;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(() => {
    const i = options.findIndex((o) => o.id === selected);
    return i < 0 ? 0 : i;
  });
  const d = DENSITY[density];

  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter((o) =>
        `${o.label} ${o.detail ?? ""} ${o.keywords ?? ""} ${o.id}`
          .toLowerCase()
          .includes(q),
      )
    : options;
  const activeIndex = clamp(active, 0, Math.max(0, shown.length - 1));
  const activeId = shown[activeIndex]?.id;
  const optId = (oid: string) =>
    `${listId}-${oid.replace(/[^a-zA-Z0-9]/g, "_")}`;

  // Focus the box as the panel opens.
  React.useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // The active option stays in view: the chosen one as the panel opens
  // (after its height has arrived), then whichever the arrows land on.
  React.useEffect(() => {
    if (!activeId) return;
    const scroll = () =>
      listRef.current
        ?.querySelector<HTMLElement>(`[data-opt="${CSS.escape(activeId)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    scroll();
    const t = window.setTimeout(scroll, 80);
    return () => window.clearTimeout(t);
  }, [activeId]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(shown.length - 1, activeIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (event.key === "PageDown") {
      event.preventDefault();
      setActive(Math.min(shown.length - 1, activeIndex + 6));
    } else if (event.key === "PageUp") {
      event.preventDefault();
      setActive(Math.max(0, activeIndex - 6));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeId) onSelect(activeId);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose(true);
    } else if (event.key === "Tab") {
      onClose(false);
    }
  };

  return (
    <div className="mt-1.5 flex flex-col overflow-hidden rounded-2 border border-hairline-strong bg-popover">
      <div className="flex items-center gap-2 border-b border-hairline px-2.5">
        <Search aria-hidden className="size-3.5 shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={`Search ${name.toLowerCase()}`}
          aria-autocomplete="list"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={activeId ? optId(activeId) : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-3",
            d.option,
          )}
        />
        {query ? (
          <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
            {shown.length}
          </span>
        ) : null}
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={name}
        className="max-h-44 overflow-y-auto overscroll-contain p-1"
      >
        {shown.length === 0 ? (
          <li className="px-2 py-2 text-[12px] text-ink-3">
            Nothing matches &ldquo;{query.trim()}&rdquo;
          </li>
        ) : (
          shown.map((o, i) => {
            const isSel = o.id === selected;
            const isAct = i === activeIndex;
            return (
              <li
                key={o.id}
                id={optId(o.id)}
                data-opt={o.id}
                role="option"
                aria-selected={isSel}
                onPointerMove={() => {
                  if (!isAct) setActive(i);
                }}
                onClick={() => onSelect(o.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-1 px-2 text-[13px]",
                  d.option,
                  isAct ? "bg-surface-2 text-foreground" : "text-ink-2",
                )}
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {isSel ? (
                    <Check
                      aria-hidden
                      className="size-3.5 text-cobalt-bright"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.detail ? (
                  <span className="shrink-0 truncate font-mono text-[11px] text-ink-3 tabular-nums">
                    {o.detail}
                  </span>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
      {foot ? (
        <div className="border-t border-hairline px-1.5 py-1.5">{foot}</div>
      ) : null}
    </div>
  );
}

/**
 * A field that opens into a search box over a listbox (see PickerPanel).
 * The chevron turns on springs.snap and the panel opens to its height on
 * the same spring; under reduced motion it appears in place with a fade.
 */
function ListPicker({
  id,
  name,
  valueLabel,
  valueDetail,
  empty,
  options,
  selected,
  open,
  onOpen,
  onClose,
  onSelect,
  placeholder,
  foot,
  disabled,
  motionSafe,
  density,
}: ListPickerProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const d = DENSITY[density];

  // Outside presses close the panel.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, onClose]);

  return (
    <div
      ref={rootRef}
      className="flex flex-col"
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !event.currentTarget.contains(next)) {
          onClose(false);
        }
      }}
    >
      <span
        id={`${id}-label`}
        className="mb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {name}
      </span>
      <button
        id={`${id}-field`}
        type="button"
        aria-labelledby={`${id}-label ${id}-field`}
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (disabled) return;
          if (open) onClose(true);
          else onOpen();
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-2 border px-2.5 text-left transition-colors",
          d.field,
          open
            ? "border-hairline-strong bg-surface-1"
            : "border-hairline bg-surface-0 hover:border-hairline-strong",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          FOCUS_RING,
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            empty ? "text-ink-3" : "text-foreground",
          )}
        >
          {valueLabel}
        </span>
        {valueDetail ? (
          <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {valueDetail}
          </span>
        ) : null}
        <motion.span
          aria-hidden
          className="flex shrink-0 text-ink-3"
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            id={`${id}-panel`}
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.snap,
                    opacity: { duration: durations.fast },
                  }
                : {
                    height: { duration: 0 },
                    opacity: { duration: durations.fast },
                  }
            }
          >
            <PickerPanel
              id={id}
              name={name}
              options={options}
              selected={selected}
              onClose={onClose}
              onSelect={onSelect}
              placeholder={placeholder}
              foot={foot}
              density={density}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type SegmentedProps<T extends string> = {
  id: string;
  name: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (id: T) => void;
  disabled: boolean;
  motionSafe: boolean;
  density: FormatDensity;
};

/** A radio group drawn as a segmented control; the chosen pill glides between segments on springs.snap. */
function Segmented<T extends string>({
  id,
  name,
  options,
  value,
  onChange,
  disabled,
  motionSafe,
  density,
}: SegmentedProps<T>) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const tabStop = value ?? options[0]?.id;
  const d = DENSITY[density];
  return (
    <div className="flex flex-col">
      <span
        id={`${id}-label`}
        className="mb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {name}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className={cn(
          "relative grid rounded-2 border border-hairline bg-surface-0 p-0.5",
          d.field,
        )}
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((o, i) => {
          const checked = o.id === value;
          return (
            <button
              key={o.id}
              ref={(node) => {
                if (node) nodes.current.set(o.id, node);
                else nodes.current.delete(o.id);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={disabled || undefined}
              tabIndex={o.id === tabStop ? 0 : -1}
              onClick={() => {
                if (!disabled) onChange(o.id);
              }}
              onKeyDown={(event) => {
                let to = -1;
                if (event.key === "ArrowRight" || event.key === "ArrowDown")
                  to = (i + 1) % options.length;
                else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
                  to = (i - 1 + options.length) % options.length;
                else if (event.key === "Home") to = 0;
                else if (event.key === "End") to = options.length - 1;
                else return;
                event.preventDefault();
                const target = options[to];
                if (!target || disabled) return;
                nodes.current.get(target.id)?.focus();
                onChange(target.id);
              }}
              className={cn(
                "relative z-10 rounded-[4px] text-[12px] transition-colors",
                checked
                  ? "text-foreground"
                  : "text-ink-2 hover:text-foreground",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
                FOCUS_RING,
              )}
            >
              {checked ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? `${id}-pill` : undefined}
                  transition={springs.snap}
                  className="absolute inset-0 -z-10 rounded-[4px] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_14%,transparent)] ring-1 ring-hairline"
                />
              ) : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SwitchProps = {
  id: string;
  name: string;
  checked: boolean | null;
  offLabel: string;
  onLabel: string;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  motionSafe: boolean;
  density: FormatDensity;
};

/** A switch with both of its words beside it; the knob slides on springs.snap. */
function Switch({
  id,
  name,
  checked,
  offLabel,
  onLabel,
  onChange,
  disabled,
  motionSafe,
  density,
}: SwitchProps) {
  const on = checked === true;
  const d = DENSITY[density];
  return (
    <div className="flex flex-col">
      <span
        id={`${id}-label`}
        className="mb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {name}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-words`}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onChange(!on);
        }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-2 border border-hairline bg-surface-0 px-2.5 text-left transition-colors hover:border-hairline-strong",
          d.field,
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200",
            on ? "bg-primary" : "bg-surface-2 ring-1 ring-hairline-strong",
          )}
        >
          <motion.span
            className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)]"
            initial={false}
            animate={{ x: on ? 14 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        </span>
        <span
          id={`${id}-words`}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px]"
        >
          <span className={cn(on ? "text-ink-3" : "text-foreground")}>
            {offLabel}
          </span>
          <span aria-hidden className="text-ink-3">
            /
          </span>
          <span className={cn(on ? "text-foreground" : "text-ink-3")}>
            {onLabel}
          </span>
        </span>
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                World clock                               */
/* ----------------------------------------------------------------------- */

function CityClock({
  city,
  time,
  delta,
  home,
  layoutId,
  motionSafe,
  live,
}: {
  city: FormatCity;
  time: string;
  delta: string;
  home: boolean;
  layoutId: string | undefined;
  motionSafe: boolean;
  live: boolean;
}) {
  return (
    <li className="relative flex min-w-0 flex-col gap-0.5 rounded-2 border border-hairline bg-surface-0 px-2.5 py-2">
      <span className="flex items-center justify-between gap-1">
        <span className="truncate text-[11px] text-ink-2">{city.name}</span>
        {home ? (
          <motion.span
            layoutId={layoutId}
            transition={springs.glide}
            className="shrink-0 rounded-full bg-cobalt-wash px-1.5 font-mono text-[9px] tracking-[0.08em] text-cobalt-bright uppercase"
          >
            here
          </motion.span>
        ) : null}
      </span>
      <span className="relative block h-[1.3em] overflow-hidden font-mono text-[14px] text-foreground tabular-nums">
        {live ? (
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={time}
              className="absolute inset-x-0 top-0 block truncate"
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? -distances.step : 0,
                transition: exitFor(durations.base),
              }}
              transition={
                motionSafe
                  ? { ...springs.glide, opacity: { duration: durations.base } }
                  : { duration: durations.base }
              }
            >
              {time}
            </motion.span>
          </AnimatePresence>
        ) : (
          <span
            aria-hidden
            className="mt-0.5 block h-[1em] w-12 rounded-1 bg-surface-2"
          />
        )}
      </span>
      <span className="truncate font-mono text-[10px] text-ink-3 tabular-nums">
        {live ? delta : " "}
      </span>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type OpenPicker = "locale" | "zone" | "currency" | null;

/**
 * A language-and-formats settings page whose right half is a sampler: a
 * sheet of lines (today's date, a time, a duration, a price, a large number,
 * a file size, a relative time) formatted with Intl at a fixed `now`, so the
 * same value always prints the same text. Pick a language, a time zone, a
 * date style, 12 or 24 hours, the first day of the week, digit grouping or a
 * currency and every line re-renders: only the characters that differ
 * cross-fade, and a wash lights behind the changed line and fades on the
 * exit ease. A strip of three office clocks below slides its times on
 * `springs.glide` when the zone changes and the "here" tag glides to the
 * office in that zone; the week row re-orders on the same spring.
 *
 * Language, zone and currency open into a search box over a listbox; the
 * date style and first day are segmented radio groups whose pill slides on
 * `springs.snap`; the hour cycle and grouping are switches. A null value is
 * the device-defaults state: the sampler shows it and the first pick seeds a
 * full value.
 *
 * Every picker is its own tab stop. In an open list, typing filters, Up and
 * Down move, Enter picks, Escape closes and returns focus to the field;
 * arrows move a radio group and Space flips a switch. Under reduced motion
 * nothing slides or re-orders: panels, pills, clock times and week days
 * change in place, and the character cross-fade is all that remains.
 */
export function FormatSampler({
  samplerLayout = "sheet",
  sampleSet = "everyday",
  density = "cozy",
  value,
  defaultValue = defaultFormatValue,
  onChange,
  locales = defaultFormatLocales,
  zones = defaultFormatZones,
  currencies = defaultFormatCurrencies,
  cities = defaultFormatCities,
  now = defaultFormatNow,
  deviceZone,
  seed = defaultFormatValue,
  status = "ready",
  onRetry,
  title = "Language and formats",
  label,
  height = 540,
  disabled = false,
  className,
}: FormatSamplerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const [own, setOwn] = React.useState<FormatValue | null>(defaultValue);
  const current = value === undefined ? own : value;
  const ready = status === "ready";
  const inert = disabled || !ready;

  // Intl output can differ by a glyph between the server's ICU and the
  // browser's, so the samples are filled in only once the page is live.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [openState, setOpenPicker] = React.useState<OpenPicker>(null);
  // A picker cannot stay open while the surface is loading or read only.
  const openPicker: OpenPicker = inert ? null : openState;
  const [announcement, setAnnouncement] = React.useState("");
  const fieldNodes = React.useRef(new Map<string, HTMLElement>());
  const openRef = React.useRef<OpenPicker>(null);

  React.useEffect(() => {
    openRef.current = openPicker;
  }, [openPicker]);

  /** Closes whichever picker is open, returning focus to its field when asked. */
  const closePicker = React.useCallback((returnFocus: boolean) => {
    const open = openRef.current;
    if (returnFocus && open) {
      fieldNodes.current.get(open)?.focus({ preventScroll: true });
    }
    setOpenPicker(null);
  }, []);

  /* -------------------------------- data ------------------------------- */

  const localeOf = (id: string) => locales.find((l) => l.id === id);
  const zoneOf = (id: string) => zones.find((z) => z.id === id);
  const currencyOf = (id: string) => currencies.find((c) => c.id === id);

  const samples = React.useMemo(
    () => (current ? buildFormatSamples(sampleSet, current, now) : []),
    [sampleSet, current, now],
  );
  const week = React.useMemo(
    () => (current ? weekdays(current.locale, current.firstDay) : []),
    [current],
  );
  const homeOffset = current ? offsetMinutes(current.zone, now) : 0;
  const clocks = React.useMemo(
    () =>
      current
        ? cities.map((city) => {
            const off = offsetMinutes(city.zone, now);
            return {
              city,
              time: fmtDate(
                current.locale,
                {
                  timeZone: city.zone,
                  ...hourOptions(current.hourCycle),
                  hour: "numeric",
                  minute: "2-digit",
                },
                now,
              ),
              delta: deltaLabel(off - homeOffset),
              home: city.zone === current.zone,
            };
          })
        : [],
    [cities, current, now, homeOffset],
  );
  const homeCity = clocks.find((c) => c.home)?.city.id ?? null;

  const localeOptions: PickOption[] = React.useMemo(
    () =>
      locales.map((l) => ({
        id: l.id,
        label: l.label,
        detail: l.id,
        keywords: l.native,
      })),
    [locales],
  );
  const zoneOptions: PickOption[] = React.useMemo(
    () =>
      zones.map((z) => ({
        id: z.id,
        label: z.label,
        detail: live ? offsetLabel(offsetMinutes(z.id, now)) : undefined,
        keywords: `${z.region} ${z.id.replace(/_/g, " ")}`,
      })),
    [zones, now, live],
  );
  const currencyOptions: PickOption[] = React.useMemo(
    () =>
      currencies.map((c) => ({
        id: c.id,
        label: c.label,
        detail: c.id,
      })),
    [currencies],
  );

  /* ------------------------------- changes ----------------------------- */

  const describe = <K extends keyof FormatValue>(
    key: K,
    v: FormatValue[K],
  ): string => {
    if (key === "locale") return localeOf(String(v))?.label ?? String(v);
    if (key === "zone")
      return zoneOf(String(v))?.label ?? zoneFallbackLabel(String(v));
    if (key === "currency") return currencyOf(String(v))?.label ?? String(v);
    if (key === "hourCycle") return v === "24" ? "24-hour" : "12-hour";
    if (key === "grouping") return v ? "on" : "off";
    if (key === "firstDay")
      return FIRST_DAYS.find((f) => f.id === v)?.label ?? String(v);
    return DATE_STYLES.find((s) => s.id === v)?.label ?? String(v);
  };

  const set = <K extends keyof FormatValue>(key: K, to: FormatValue[K]) => {
    if (inert) return;
    const base = current ?? seed;
    if (current && base[key] === to) return;
    const next: FormatValue = { ...base, [key]: to };
    if (value === undefined) setOwn(next);
    onChange?.(next, { key, from: current ? base[key] : null, to });
    const first = buildFormatSamples(sampleSet, next, now)[0];
    setAnnouncement(
      `${FIELD_WORD[key]} ${describe(key, to)}.${
        first ? ` ${first.label} reads ${first.text}.` : ""
      }`,
    );
  };

  const clear = () => {
    if (inert || !current) return;
    setOpenPicker(null);
    if (value === undefined) setOwn(null);
    onChange?.(null, { key: "all", from: current.locale, to: null });
    setAnnouncement("Following device defaults.");
  };

  const useDevice = () => {
    if (inert) return;
    let zone = deviceZone;
    if (!zone) {
      try {
        zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        zone = undefined;
      }
    }
    if (!zone) {
      setAnnouncement("The device did not say which zone it is in.");
      return;
    }
    set("zone", zone);
    closePicker(true);
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const cards = samplerLayout === "cards";
  const zoneLabel = current
    ? (zoneOf(current.zone)?.label ?? zoneFallbackLabel(current.zone))
    : "Device zone";
  const zoneKnown = current ? zoneOf(current.zone) !== undefined : true;

  const pickerField = (key: OpenPicker, node: HTMLDivElement | null) => {
    if (!key) return;
    const btn = node?.querySelector<HTMLElement>("button");
    if (btn) fieldNodes.current.set(key, btn);
    else fieldNodes.current.delete(key);
  };

  const controls = (
    <LayoutGroup id={uid}>
      <div className="flex flex-col gap-3">
        <div ref={(n) => pickerField("locale", n)}>
          <ListPicker
            id={`${uid}-locale`}
            name="Language"
            valueLabel={
              current
                ? (localeOf(current.locale)?.label ?? current.locale)
                : "Device language"
            }
            valueDetail={current ? current.locale : undefined}
            empty={!current}
            options={localeOptions}
            selected={current?.locale ?? null}
            open={openPicker === "locale"}
            onOpen={() => setOpenPicker("locale")}
            onClose={closePicker}
            onSelect={(id) => {
              set("locale", id);
              closePicker(true);
            }}
            placeholder="Search languages"
            disabled={inert}
            motionSafe={motionSafe}
            density={density}
          />
        </div>
        <div ref={(n) => pickerField("zone", n)}>
          <ListPicker
            id={`${uid}-zone`}
            name="Time zone"
            valueLabel={zoneKnown ? zoneLabel : `${zoneLabel} (device)`}
            valueDetail={current && live ? offsetLabel(homeOffset) : undefined}
            empty={!current}
            options={zoneOptions}
            selected={current?.zone ?? null}
            open={openPicker === "zone"}
            onOpen={() => setOpenPicker("zone")}
            onClose={closePicker}
            onSelect={(id) => {
              set("zone", id);
              closePicker(true);
            }}
            placeholder="Search cities and zones"
            disabled={inert}
            motionSafe={motionSafe}
            density={density}
            foot={
              <button
                type="button"
                onClick={useDevice}
                className={cn(
                  "flex h-7 w-full items-center gap-1.5 rounded-1 px-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <MonitorSmartphone aria-hidden className="size-3.5" />
                Use device zone
              </button>
            }
          />
        </div>
        <div className="grid grid-cols-1 gap-3 @min-[24rem]:grid-cols-2 @min-[40rem]:grid-cols-1 @min-[52rem]:grid-cols-2">
          <Segmented
            id={`${uid}-date`}
            name="Date style"
            options={DATE_STYLES}
            value={current?.dateStyle ?? null}
            onChange={(id) => set("dateStyle", id)}
            disabled={inert}
            motionSafe={motionSafe}
            density={density}
          />
          <Switch
            id={`${uid}-hours`}
            name="Time"
            checked={current ? current.hourCycle === "24" : null}
            offLabel="12-hour"
            onLabel="24-hour"
            onChange={(on) => set("hourCycle", on ? "24" : "12")}
            disabled={inert}
            motionSafe={motionSafe}
            density={density}
          />
          <Segmented
            id={`${uid}-week`}
            name="Week starts"
            options={FIRST_DAYS}
            value={current?.firstDay ?? null}
            onChange={(id) => set("firstDay", id)}
            disabled={inert}
            motionSafe={motionSafe}
            density={density}
          />
          <Switch
            id={`${uid}-group`}
            name="Digit grouping"
            checked={current ? current.grouping : null}
            offLabel="1234567"
            onLabel="1,234,567"
            onChange={(on) => set("grouping", on)}
            disabled={inert}
            motionSafe={motionSafe}
            density={density}
          />
        </div>
        <div ref={(n) => pickerField("currency", n)}>
          <ListPicker
            id={`${uid}-currency`}
            name="Currency"
            valueLabel={
              current
                ? (currencyOf(current.currency)?.label ?? current.currency)
                : "Device currency"
            }
            valueDetail={current ? current.currency : undefined}
            empty={!current}
            options={currencyOptions}
            selected={current?.currency ?? null}
            open={openPicker === "currency"}
            onOpen={() => setOpenPicker("currency")}
            onClose={closePicker}
            onSelect={(id) => {
              set("currency", id);
              closePicker(true);
            }}
            placeholder="Search currencies"
            disabled={inert}
            motionSafe={motionSafe}
            density={density}
          />
        </div>
      </div>
    </LayoutGroup>
  );

  const sampler = current ? (
    <div className="flex flex-col gap-3">
      <section aria-labelledby={`${uid}-samples`} className="flex flex-col">
        <h3
          id={`${uid}-samples`}
          className="mb-1.5 flex items-center justify-between font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          <span>Samples</span>
          <span className="tracking-normal normal-case">
            {localeOf(current.locale)?.native ?? current.locale}
          </span>
        </h3>
        <ul
          role="list"
          className={cn(
            cards
              ? cn("grid grid-cols-1 @min-[26rem]:grid-cols-2", d.gap)
              : "flex flex-col divide-y divide-hairline rounded-3 border border-hairline bg-surface-0 px-2.5 py-1",
          )}
        >
          {samples.map((sample, i) => (
            <SampleLine
              key={`${sampleSet}-${sample.id}`}
              sample={sample}
              layout={samplerLayout}
              density={density}
              live={live}
              index={i}
              motionSafe={motionSafe}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${uid}-week-h`} className="flex flex-col">
        <h3
          id={`${uid}-week-h`}
          className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Week
        </h3>
        <ol
          role="list"
          aria-label={`Week starting ${describe("firstDay", current.firstDay)}`}
          className="grid grid-cols-7 gap-1"
        >
          {week.map((day, i) => (
            <motion.li
              key={day.id}
              layout={motionSafe ? "position" : false}
              transition={{ layout: springs.glide }}
              className={cn(
                "flex h-7 items-center justify-center truncate rounded-2 border px-1 text-[11px]",
                i === 0
                  ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright"
                  : "border-hairline bg-surface-0 text-ink-2",
              )}
            >
              {live ? (
                <span className="truncate">{day.label}</span>
              ) : (
                <span
                  aria-hidden
                  className="h-2.5 w-5 rounded-1 bg-surface-2"
                />
              )}
            </motion.li>
          ))}
        </ol>
      </section>

      {cities.length > 0 ? (
        <section aria-labelledby={`${uid}-clock-h`} className="flex flex-col">
          <h3
            id={`${uid}-clock-h`}
            className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Offices
          </h3>
          <ul
            role="list"
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${Math.min(3, cities.length)}, minmax(0, 1fr))`,
            }}
          >
            {clocks.map((c) => (
              <CityClock
                key={c.city.id}
                city={c.city}
                time={c.time}
                delta={c.delta}
                home={c.home}
                layoutId={
                  motionSafe && homeCity !== null ? `${uid}-home` : undefined
                }
                motionSafe={motionSafe}
                live={live}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  ) : (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 rounded-3 border border-dashed border-hairline-strong px-6 py-8 text-center">
      <Globe aria-hidden className="size-5 text-ink-3" />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-foreground">Following device defaults</p>
        <p className="max-w-64 text-[12px] text-ink-2">
          Dates, times and numbers print the way the device does. Pick a
          language, a zone or a style to see samples here.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (inert) return;
          if (value === undefined) setOwn(seed);
          onChange?.(seed, { key: "all", from: null, to: seed.locale });
          setAnnouncement(
            `Formats set. ${FIELD_WORD.locale} ${describe("locale", seed.locale)}.`,
          );
        }}
        aria-disabled={inert || undefined}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
          inert && "cursor-not-allowed opacity-60",
          FOCUS_RING,
        )}
      >
        Choose formats
      </button>
    </div>
  );

  const skeleton = (
    <div
      aria-hidden
      className="grid gap-4 @min-[40rem]:grid-cols-[17rem_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="h-2.5 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            <span
              className={cn(
                "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                d.field,
              )}
              style={{ animationDelay: `${i * 80}ms` }}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className="h-7 rounded-2 bg-surface-2 motion-safe:animate-pulse"
            style={{
              width: `${60 + ((i * 17) % 35)}%`,
              animationDelay: `${i * 70}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );

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
      style={{ height }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {ready
              ? current
                ? `${current.locale} · ${zoneLabel} · ${current.hourCycle}h`
                : "device defaults"
              : status}
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          aria-disabled={inert || !current || undefined}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
            !inert && current
              ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
              : "cursor-default text-ink-3",
            FOCUS_RING,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          <span className="hidden @min-[24rem]:inline">Device defaults</span>
          <span className="@min-[24rem]:hidden">Device</span>
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain @min-[40rem]:overflow-hidden">
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The format choices didn&apos;t load.
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
        ) : status === "loading" ? (
          <div className="p-4">{skeleton}</div>
        ) : (
          <div className="grid h-full gap-4 p-4 @min-[40rem]:grid-cols-[17rem_minmax(0,1fr)] @min-[40rem]:gap-5 @min-[40rem]:p-0">
            <div className="min-h-0 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain @min-[40rem]:border-r @min-[40rem]:border-hairline @min-[40rem]:p-4">
              {controls}
            </div>
            <div className="min-h-0 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain @min-[40rem]:py-4 @min-[40rem]:pr-4">
              {sampler}
            </div>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
