"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Bus,
  Check,
  ChevronDown,
  Inbox,
  Plane,
  RotateCcw,
  Ship,
  TrainFront,
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

export type ForecastMode = "rail" | "coach" | "ferry" | "air";

/** One Waylight trip on the board. */
export type ForecastTrip = {
  id: string;
  /** Service code, e.g. "WL 214". */
  code: string;
  from: string;
  to: string;
  mode: ForecastMode;
  /** Short day label, e.g. "Tue 14". */
  day: string;
  /** Departure, in minutes after midnight. */
  departs: number;
  /** Duration in minutes. */
  minutes: number;
  stops: number;
  fare: number;
};

export type ForecastOption = {
  id: string;
  label: string;
  /** Whether a trip survives this option. */
  match: (trip: ForecastTrip) => boolean;
};

export type ForecastFilter = {
  id: string;
  /** The menu's name on its trigger, e.g. "Mode". */
  label: string;
  /** The option that clears this filter. @default "Any <label>" */
  anyLabel?: string;
  options: ForecastOption[];
};

/** Filter id → applied option id, or null (or absent) for "any". */
export type ForecastValue = Record<string, string | null>;

/** What a commit changed. `filterId` is null when every filter was cleared. */
export type ForecastChange = {
  filterId: string | null;
  optionId: string | null;
};

export type ForecastPreview = {
  filterId: string;
  optionId: string | null;
  /** The selection the preview stands for. */
  value: ForecastValue;
  /** Trips on the board that would survive it. */
  kept: number;
  /** Trips on the board in all. */
  total: number;
};

export type ForecastLayout = "cards" | "compact" | "rows";
export type ForecastStatus = "ready" | "loading" | "error";

export type HoverForecastProps = {
  /** How faint a card the previewed option would remove becomes, 0–1. @default 0.3 */
  ghostOpacity?: number;
  /** Full trip cards with a route line, two-line compact cards, or one-line rows. @default "cards" */
  layout?: ForecastLayout;
  /** Scales the ghosts' lean, their step aside and the stagger, 0–2. 0 keeps the fade only. @default 1 */
  motionScale?: number;
  /** The trips on the board. @default defaultForecastTrips */
  records?: ForecastTrip[];
  /** The filter menus, in bar order. @default defaultForecastFilters */
  filters?: ForecastFilter[];
  /** Controlled applied selection. */
  value?: ForecastValue;
  /** Initial selection when uncontrolled. @default {} */
  defaultValue?: ForecastValue;
  /** Fires when an option is committed (Enter, Space or a click) or the filters are reset, with the whole new selection. */
  onApply?: (value: ForecastValue, change: ForecastChange) => void;
  /** Fires when a preview starts, moves to another option, or ends (null), so results can be fetched ahead. */
  onPreview?: (preview: ForecastPreview | null) => void;
  /** The would-be total for a previewed selection: a number, or a promise of one. @default counts matching records */
  forecast?: (value: ForecastValue) => number | Promise<number>;
  /** A trip card was opened. */
  onOpen?: (trip: ForecastTrip) => void;
  /** Whether the trips have arrived. @default "ready" */
  status?: ForecastStatus;
  /** "Try again" was pressed after the trips failed to load. */
  onRetry?: () => void;
  /** The board's heading. @default "This week's trips" */
  title?: string;
  /** The line under the heading. @default "Waylight · 14–18 Oct" */
  subtitle?: string;
  /** What one record is called. @default { one: "trip", other: "trips" } */
  noun?: { one: string; other: string };
  /** Prints a fare. @default whole dollars */
  formatFare?: (fare: number) => string;
  /** The board's accessible name. @default the title */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const trip = (
  id: string,
  code: string,
  mode: ForecastMode,
  from: string,
  to: string,
  day: string,
  departs: string,
  minutes: number,
  stops: number,
  fare: number,
): ForecastTrip => {
  const [h = 0, m = 0] = departs.split(":").map(Number);
  return {
    id,
    code,
    mode,
    from,
    to,
    day,
    departs: h * 60 + m,
    minutes,
    stops,
    fare,
  };
};

/** Twelve Waylight departures between the six harbour and valley towns. */
export const defaultForecastTrips: ForecastTrip[] = [
  trip(
    "t1",
    "WL 214",
    "rail",
    "Coldbrook",
    "Fernmoor",
    "Tue 14",
    "07:40",
    135,
    1,
    48,
  ),
  trip(
    "t2",
    "WL 220",
    "rail",
    "Coldbrook",
    "Basin Quay",
    "Tue 14",
    "09:15",
    95,
    0,
    36,
  ),
  trip(
    "t3",
    "WC 31",
    "coach",
    "Fernmoor",
    "Larkspire",
    "Tue 14",
    "12:30",
    170,
    2,
    22,
  ),
  trip(
    "t4",
    "WF 7",
    "ferry",
    "Basin Quay",
    "Saltreach",
    "Wed 15",
    "08:05",
    80,
    0,
    29,
  ),
  trip(
    "t5",
    "WA 402",
    "air",
    "Coldbrook",
    "Gauge Point",
    "Wed 15",
    "18:20",
    70,
    0,
    129,
  ),
  trip(
    "t6",
    "WL 238",
    "rail",
    "Larkspire",
    "Coldbrook",
    "Wed 15",
    "16:45",
    150,
    1,
    54,
  ),
  trip(
    "t7",
    "WC 44",
    "coach",
    "Saltreach",
    "Fernmoor",
    "Thu 16",
    "06:50",
    205,
    2,
    31,
  ),
  trip(
    "t8",
    "WL 251",
    "rail",
    "Gauge Point",
    "Basin Quay",
    "Thu 16",
    "13:10",
    110,
    1,
    62,
  ),
  trip(
    "t9",
    "WF 12",
    "ferry",
    "Saltreach",
    "Basin Quay",
    "Thu 16",
    "19:30",
    85,
    0,
    34,
  ),
  trip(
    "t10",
    "WA 418",
    "air",
    "Gauge Point",
    "Fernmoor",
    "Fri 17",
    "10:40",
    65,
    0,
    96,
  ),
  trip(
    "t11",
    "WC 52",
    "coach",
    "Basin Quay",
    "Larkspire",
    "Fri 17",
    "15:20",
    140,
    1,
    44,
  ),
  trip(
    "t12",
    "WL 266",
    "rail",
    "Fernmoor",
    "Coldbrook",
    "Fri 17",
    "20:05",
    125,
    0,
    58,
  ),
];

export const defaultForecastFilters: ForecastFilter[] = [
  {
    id: "mode",
    label: "Mode",
    anyLabel: "Any mode",
    options: [
      { id: "rail", label: "Rail", match: (t) => t.mode === "rail" },
      { id: "coach", label: "Coach", match: (t) => t.mode === "coach" },
      { id: "ferry", label: "Ferry", match: (t) => t.mode === "ferry" },
      { id: "air", label: "Air", match: (t) => t.mode === "air" },
    ],
  },
  {
    id: "departs",
    label: "Departs",
    anyLabel: "Any time",
    options: [
      { id: "morning", label: "Morning", match: (t) => t.departs < 720 },
      {
        id: "afternoon",
        label: "Afternoon",
        match: (t) => t.departs >= 720 && t.departs < 1020,
      },
      { id: "evening", label: "Evening", match: (t) => t.departs >= 1020 },
    ],
  },
  {
    id: "stops",
    label: "Stops",
    anyLabel: "Any stops",
    options: [
      { id: "direct", label: "Direct only", match: (t) => t.stops === 0 },
      { id: "one", label: "One stop at most", match: (t) => t.stops <= 1 },
    ],
  },
  {
    id: "fare",
    label: "Fare",
    anyLabel: "Any fare",
    options: [
      { id: "u40", label: "Under $40", match: (t) => t.fare < 40 },
      { id: "u80", label: "Under $80", match: (t) => t.fare < 80 },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ANY = "__any";
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const MODE_LABEL: Record<ForecastMode, string> = {
  rail: "Rail",
  coach: "Coach",
  ferry: "Ferry",
  air: "Air",
};

const MODE_ICON: Record<ForecastMode, typeof TrainFront> = {
  rail: TrainFront,
  coach: Bus,
  ferry: Ship,
  air: Plane,
};

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${r3(clamp(v, 0, 1) * 100)}%`;

const defaultFormatFare = (fare: number) => `$${Math.round(fare)}`;

/** Fixed 24-hour clock: a locale lookup during render would not survive hydration. */
const clock = (minutes: number) => {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const span = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

const stopsText = (n: number) =>
  n === 0 ? "Direct" : n === 1 ? "1 stop" : `${n} stops`;

/** Whether a trip survives every applied filter. */
const survives = (
  record: ForecastTrip,
  value: ForecastValue,
  filters: ForecastFilter[],
) => {
  for (const filter of filters) {
    const chosen = value[filter.id];
    if (chosen == null) continue;
    const option = filter.options.find((o) => o.id === chosen);
    if (option && !option.match(record)) return false;
  }
  return true;
};

/** Counts the records a selection keeps — the local forecast. */
export const countForecast = (
  records: ForecastTrip[],
  filters: ForecastFilter[],
  value: ForecastValue,
) => records.filter((r) => survives(r, value, filters)).length;

const keyOf = (value: ForecastValue, filters: ForecastFilter[]) =>
  filters.map((f) => `${f.id}=${value[f.id] ?? ""}`).join("&");

const anyLabelOf = (filter: ForecastFilter) =>
  filter.anyLabel ?? `Any ${filter.label.toLowerCase()}`;

const optionLabel = (filter: ForecastFilter, optionId: string | null) =>
  optionId === null
    ? anyLabelOf(filter)
    : (filter.options.find((o) => o.id === optionId)?.label ?? optionId);

/** "Rail and Evening" — the applied option labels, in bar order. */
const describe = (value: ForecastValue, filters: ForecastFilter[]) => {
  const parts = filters
    .filter((f) => value[f.id] != null)
    .map((f) => optionLabel(f, value[f.id] ?? null));
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

/** Columns the grid draws at a container width — mirrors the CSS below. */
const colsFor = (width: number) =>
  width >= 688 ? 4 : width >= 512 ? 3 : width >= 304 ? 2 : 1;

type ForecastResult = { status: "loading" | "ready" | "error"; count: number };
type ForecastCache = {
  fn: HoverForecastProps["forecast"];
  map: Record<string, ForecastResult>;
};
type MenuState = {
  filterId: string;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

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
      style={{ width: "1ch", height: `${DIGIT_H}em` }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        initial={false}
        animate={{ y: `${-r3(digit * DIGIT_H)}em` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((d) => (
          <span key={d} style={{ height: `${DIGIT_H}em` }}>
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** A count whose digits roll in their own slots, so the width never jumps mid-roll. */
function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      {/* Gives the row a text baseline, so a noun beside it lines up. */}
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <RollDigit
          key={digits.length - 1 - i}
          digit={Number(d)}
          motionSafe={motionSafe}
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Trip card                                */
/* ----------------------------------------------------------------------- */

function RouteLine({ trip: t }: { trip: ForecastTrip }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] text-ink-2 tabular-nums">
      <span>{clock(t.departs)}</span>
      <span aria-hidden className="relative h-px flex-1 bg-hairline-strong">
        <span className="absolute -top-[2.5px] left-0 size-1.5 rounded-full border border-ink-3 bg-card" />
        {Array.from({ length: t.stops }, (_, i) => (
          <span
            key={i}
            className="absolute -top-[1.5px] size-1 rounded-full bg-ink-3"
            style={{ left: pct((i + 1) / (t.stops + 1)) }}
          />
        ))}
        <span className="absolute -top-[2.5px] right-0 size-1.5 rounded-full bg-ink-3" />
      </span>
      <span>{clock(t.departs + t.minutes)}</span>
    </div>
  );
}

function CardBody({
  trip: t,
  layout,
  fare,
}: {
  trip: ForecastTrip;
  layout: ForecastLayout;
  fare: string;
}) {
  const Icon = MODE_ICON[t.mode];
  if (layout === "rows") {
    return (
      <span className="flex w-full items-center gap-3">
        <Icon aria-hidden className="size-4 shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className="font-medium">{t.from}</span>
          <span aria-hidden className="text-ink-3">
            {" "}
            →{" "}
          </span>
          <span className="text-ink-2">{t.to}</span>
        </span>
        <span className="hidden font-mono text-[11px] text-ink-3 tabular-nums @min-[26rem]:inline">
          {t.day}
        </span>
        <span className="font-mono text-[11px] text-ink-2 tabular-nums">
          {clock(t.departs)}
        </span>
        <span className="hidden w-14 text-[11px] text-ink-3 @min-[34rem]:inline">
          {stopsText(t.stops)}
        </span>
        <span className="w-10 text-right font-mono text-[13px] tabular-nums">
          {fare}
        </span>
      </span>
    );
  }
  if (layout === "compact") {
    return (
      <span className="flex w-full flex-col gap-1">
        <span
          className="truncate text-[13px] font-medium"
          title={`${t.from} to ${t.to}`}
        >
          {t.from}
          <span aria-hidden className="font-normal text-ink-3">
            {" "}
            →{" "}
          </span>
          <span className="font-normal text-ink-2">{t.to}</span>
        </span>
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[11px] text-ink-3">
            {MODE_LABEL[t.mode]} · {t.day} {clock(t.departs)} ·{" "}
            {stopsText(t.stops)}
          </span>
          <span className="shrink-0 font-mono text-[13px] tabular-nums">
            {fare}
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex w-full flex-col">
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
          <Icon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{t.code}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
          {t.day}
        </span>
      </span>
      <span className="mt-1.5 truncate text-[13px] leading-snug font-medium">
        {t.from}
      </span>
      <span className="truncate text-[13px] leading-snug text-ink-2">
        <span aria-hidden className="text-ink-3">
          →{" "}
        </span>
        {t.to}
      </span>
      <span className="mt-2">
        <RouteLine trip={t} />
      </span>
      <span className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-ink-3">
          <span className="@min-[19rem]:hidden @min-[32rem]:inline">
            {span(t.minutes)} ·{" "}
          </span>
          {stopsText(t.stops)}
        </span>
        <span className="font-mono text-[13px] tabular-nums">{fare}</span>
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A trip board whose filters tell you what they would do before you choose
 * them. Resting on an option in a filter menu — pointer or arrow keys — turns
 * the cards it would remove into ghosts: they fade to `ghostOpacity`, drop to a
 * dashed outline and lean aside about their foot, away from the grid's centre
 * line, row by row down the board on `springs.snap`. The forecast count rolls
 * to the would-be total, the meter glides to the share that would remain, and
 * leaving the option springs everything back on the same spring. Committing
 * exits the ghosts on the exit ease while the survivors glide into the gaps.
 *
 * Forecasts may be asynchronous (`forecast` returning a promise): pending,
 * zero and failed forecasts are each said in plain words, while the ghosting —
 * local to each option's `match` — stays instant. `onPreview` and `onApply`
 * fire separately so a host can fetch ahead of the commit.
 *
 * The bar is a toolbar of menu buttons; each menu is `menuitemradio`s where
 * arrows preview, Enter or Space commits and Escape abandons. Trip cards are
 * one roving tab stop moved by arrows across the measured columns. Under
 * reduced motion the ghosts only cross-fade and nothing travels — the count,
 * the meter and the wording still change, because they are the forecast.
 */
export function HoverForecast({
  ghostOpacity = 0.3,
  layout = "cards",
  motionScale = 1,
  records = defaultForecastTrips,
  filters = defaultForecastFilters,
  value,
  defaultValue,
  onApply,
  onPreview,
  forecast,
  onOpen,
  status = "ready",
  onRetry,
  title = "This week's trips",
  subtitle = "Waylight · 14–18 Oct",
  noun = { one: "trip", other: "trips" },
  formatFare = defaultFormatFare,
  label,
  disabled = false,
  className,
}: HoverForecastProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const menuId = `${uid}-menu`;
  const triggerId = (filterId: string) => `${uid}-trigger-${filterId}`;

  const [own, setOwn] = React.useState<ForecastValue>(() => defaultValue ?? {});
  const applied = value ?? own;

  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [cols, setCols] = React.useState(4);
  const [barIndex, setBarIndex] = React.useState(0);
  const [activeCard, setActiveCard] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [cache, setCache] = React.useState<ForecastCache>(() => ({
    fn: forecast,
    map: {},
  }));
  // A new forecaster makes every cached answer stale.
  if (cache.fn !== forecast) setCache({ fn: forecast, map: {} });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const triggers = React.useRef(new Map<string, HTMLButtonElement>());
  const items = React.useRef(new Map<string, HTMLButtonElement>());
  const cards = React.useRef(new Map<string, HTMLButtonElement>());
  const resetRef = React.useRef<HTMLButtonElement | null>(null);
  const pendingFocus = React.useRef<string | null>(null);
  // Synchronous mirrors of the preview inputs: a focus that follows a hover
  // change inside one event must see the new hover, not the last render's.
  const live = React.useRef<{
    filterId: string | null;
    hovered: string | null;
    focused: string | null;
    reported: string;
    spoken: string;
  }>({
    filterId: null,
    hovered: null,
    focused: null,
    reported: "",
    spoken: "",
  });

  const ready = status === "ready";
  const inert = disabled || !ready;
  const ms = clamp(motionScale, 0, 2);
  const ghost = clamp(ghostOpacity, 0, 1);
  const total = records.length;
  const nounFor = (n: number) => (n === 1 ? noun.one : noun.other);

  const visible = records.filter((r) => survives(r, applied, filters));
  const shown = visible.length;
  const anyApplied = filters.some((f) => applied[f.id] != null);

  /* ------------------------------ preview ------------------------------ */

  const menuFilter = menu
    ? (filters.find((f) => f.id === menu.filterId) ?? null)
    : null;
  const previewKey = menuFilter ? (hovered ?? focused) : null;
  const previewOption =
    previewKey === null ? undefined : previewKey === ANY ? null : previewKey;
  const previewValue: ForecastValue | null =
    menuFilter &&
    previewOption !== undefined &&
    previewOption !== (applied[menuFilter.id] ?? null)
      ? { ...applied, [menuFilter.id]: previewOption }
      : null;
  const kept = previewValue
    ? new Set(
        records
          .filter((r) => survives(r, previewValue, filters))
          .map((r) => r.id),
      )
    : null;
  const forecastResult: ForecastResult | null = previewValue
    ? forecast
      ? (cache.map[keyOf(previewValue, filters)] ?? {
          status: "loading",
          count: 0,
        })
      : { status: "ready", count: kept?.size ?? 0 }
    : null;
  const previewLabel =
    menuFilter && previewOption !== undefined
      ? optionLabel(menuFilter, previewOption)
      : "";

  /** The forecast in words — the same sentence the live region speaks. */
  const sentence = (
    label: string,
    n: number,
    current: number,
    next: ForecastValue,
  ) => {
    if (n === 0)
      return `No ${noun.other} would match ${describe(next, filters) || label}`;
    if (n < current)
      return `${label} would leave ${n} of ${current} ${noun.other}`;
    if (n > current)
      return `${label} would bring back ${n - current} ${nounFor(n - current)}`;
    return `${label} changes nothing here`;
  };

  let phrase: string;
  if (status === "loading") phrase = `Loading ${noun.other}…`;
  else if (status === "error") phrase = `The ${noun.other} didn't load`;
  else if (forecastResult && previewValue) {
    phrase =
      forecastResult.status === "loading"
        ? `Forecasting ${previewLabel}…`
        : forecastResult.status === "error"
          ? `Couldn't forecast ${previewLabel}. Current results stand`
          : sentence(previewLabel, forecastResult.count, shown, previewValue);
  } else if (!anyApplied) phrase = `Showing all ${total}`;
  else if (shown === 0)
    phrase = `Nothing matches ${describe(applied, filters)}`;
  else phrase = `Filtered by ${describe(applied, filters)}`;

  const readout =
    forecastResult && forecastResult.status === "ready"
      ? forecastResult.count
      : shown;
  const forecasting = forecastResult?.status === "loading";

  /* --------------------------- forecast fetch -------------------------- */

  /**
   * Asks the host's forecaster about a selection, once per selection. The
   * answer is spoken only while a keyboard visitor still rests on it.
   */
  const requestForecast = (next: ForecastValue, label: string) => {
    if (!forecast) return;
    const key = keyOf(next, filters);
    const current = shown;
    const say = (text: string) => {
      if (live.current.spoken === key) setAnnouncement(text);
    };
    const known = cache.map[key];
    if (known && known.status !== "error") {
      if (known.status === "ready") {
        say(`${sentence(label, known.count, current, next)}.`);
      }
      return;
    }
    const fn = forecast;
    const put = (result: ForecastResult) =>
      setCache((c) =>
        c.fn === fn ? { fn: c.fn, map: { ...c.map, [key]: result } } : c,
      );
    let answer: number | Promise<number>;
    try {
      answer = fn(next);
    } catch {
      put({ status: "error", count: 0 });
      say(`Couldn't forecast ${label}.`);
      return;
    }
    if (typeof answer === "number") {
      put({ status: "ready", count: answer });
      say(`${sentence(label, answer, current, next)}.`);
      return;
    }
    put({ status: "loading", count: 0 });
    answer.then(
      (n) => {
        put({ status: "ready", count: n });
        say(`${sentence(label, n, current, next)}.`);
      },
      () => {
        put({ status: "error", count: 0 });
        say(`Couldn't forecast ${label}.`);
      },
    );
  };

  /** Reports the preview the visitor now rests on, once per change. */
  const syncPreview = (cause: "hover" | "focus" | "close") => {
    const state = live.current;
    const filter = state.filterId
      ? (filters.find((f) => f.id === state.filterId) ?? null)
      : null;
    const key = filter ? (state.hovered ?? state.focused) : null;
    let next: ForecastValue | null = null;
    let optionId: string | null = null;
    if (filter && key !== null) {
      optionId = key === ANY ? null : key;
      if (optionId !== (applied[filter.id] ?? null)) {
        next = { ...applied, [filter.id]: optionId };
      }
    }
    const signature = next ? keyOf(next, filters) : "";
    // Spoken once per keyboard arrival, even when a resting pointer already
    // previewed the same option silently.
    const speak =
      cause === "focus" && next !== null && signature !== state.spoken;
    state.spoken = cause === "focus" ? signature : "";
    const label = filter && next ? optionLabel(filter, optionId) : "";
    if (signature !== state.reported) {
      state.reported = signature;
      if (!next || !filter) {
        onPreview?.(null);
        return;
      }
      onPreview?.({
        filterId: filter.id,
        optionId,
        value: next,
        kept: countForecast(records, filters, next),
        total,
      });
      if (forecast) {
        requestForecast(next, label);
        return;
      }
    }
    if (!speak || !next) return;
    if (forecast) requestForecast(next, label);
    else {
      const survivors = countForecast(records, filters, next);
      setAnnouncement(`${sentence(label, survivors, shown, next)}.`);
    }
  };

  const hover = (key: string | null) => {
    live.current.hovered = key;
    setHovered(key);
    syncPreview("hover");
  };

  const focusOption = (key: string) => {
    live.current.focused = key;
    setFocused(key);
    syncPreview("focus");
  };

  const shut = () => {
    live.current.filterId = null;
    live.current.hovered = null;
    live.current.focused = null;
    pendingFocus.current = null;
    setMenu(null);
    setHovered(null);
    setFocused(null);
    syncPreview("close");
  };

  const abandon = (returnFocus: boolean) => {
    const filterId = live.current.filterId;
    shut();
    if (returnFocus && filterId) triggers.current.get(filterId)?.focus();
  };

  const openMenu = (filterId: string, at: "applied" | "last") => {
    const root = rootRef.current;
    const trigger = triggers.current.get(filterId);
    const filter = filters.find((f) => f.id === filterId);
    if (!root || !trigger || !filter || inert) return;
    const rr = root.getBoundingClientRect();
    const tr = trigger.getBoundingClientRect();
    const width = Math.round(Math.min(236, rr.width - 16));
    const top = Math.round(tr.bottom - rr.top + 6);
    live.current.filterId = filterId;
    live.current.hovered = null;
    live.current.focused = null;
    setHovered(null);
    setFocused(null);
    setMenu({
      filterId,
      width,
      top,
      left: Math.round(clamp(tr.left - rr.left, 8, rr.width - width - 8)),
      maxHeight: Math.round(Math.max(120, rr.height - top - 10)),
    });
    const current = applied[filterId] ?? null;
    const last = filter.options[filter.options.length - 1];
    pendingFocus.current =
      at === "last" && last ? last.id : current === null ? ANY : current;
    syncPreview("close");
  };

  const commit = (filterId: string | null, optionId: string | null) => {
    if (inert) return;
    const next: ForecastValue =
      filterId === null ? {} : { ...applied, [filterId]: optionId };
    const changed = keyOf(next, filters) !== keyOf(applied, filters);
    shut();
    if (filterId) triggers.current.get(filterId)?.focus();
    if (!changed) return;
    if (value === undefined) setOwn(next);
    onApply?.(next, { filterId, optionId });
    const n = countForecast(records, filters, next);
    const filter = filters.find((f) => f.id === filterId);
    setAnnouncement(
      filter
        ? `${filter.label}: ${optionLabel(filter, optionId)}. ${n} ${nounFor(n)}.`
        : `Filters cleared. ${n} ${nounFor(n)}.`,
    );
  };

  const reset = () => {
    commit(null, null);
    // The Reset button leaves with the filters; never strand focus on it.
    setBarIndex(0);
    const first = filters[0];
    if (first) triggers.current.get(first.id)?.focus();
  };

  // Latest handlers for listeners that outlive a render.
  const abandonRef = React.useRef(abandon);
  React.useEffect(() => {
    abandonRef.current = abandon;
  });

  // A press outside the open menu and its trigger abandons the preview.
  const menuOpenFor = menu?.filterId ?? null;
  React.useEffect(() => {
    if (!menuOpenFor) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (triggers.current.get(menuOpenFor)?.contains(target)) return;
      abandonRef.current(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [menuOpenFor]);

  // Columns for arrow keys and lean direction; a width change also closes an
  // open menu, whose position was measured for the old width.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    let last = -1;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setCols(colsFor(width));
      if (last >= 0 && Math.abs(width - last) > 1 && live.current.filterId) {
        abandonRef.current(false);
      }
      last = width;
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ keyboard ----------------------------- */

  const barCount = filters.length + (anyApplied ? 1 : 0);
  const barFocus = clamp(barIndex, 0, Math.max(0, barCount - 1));
  const focusBar = (index: number) => {
    const i = (index + barCount) % barCount;
    const filter = filters[i];
    if (filter) triggers.current.get(filter.id)?.focus();
    else resetRef.current?.focus();
  };

  const onBarKey = (event: React.KeyboardEvent, index: number) => {
    const filter = filters[index];
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusBar(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusBar(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusBar(0);
        break;
      case "End":
        event.preventDefault();
        focusBar(barCount - 1);
        break;
      case "ArrowDown":
        if (!filter) break;
        event.preventDefault();
        openMenu(filter.id, "applied");
        break;
      case "ArrowUp":
        if (!filter) break;
        event.preventDefault();
        openMenu(filter.id, "last");
        break;
      default:
        break;
    }
  };

  const onMenuKey = (
    event: React.KeyboardEvent,
    keys: string[],
    index: number,
  ) => {
    const go = (i: number) => {
      const key = keys[(i + keys.length) % keys.length];
      if (!key) return;
      // The keyboard takes over from a resting pointer.
      live.current.hovered = null;
      setHovered(null);
      items.current.get(key)?.focus();
    };
    const filterIndex = filters.findIndex((f) => f.id === menu?.filterId);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        go(index - 1);
        break;
      case "Home":
        event.preventDefault();
        go(0);
        break;
      case "End":
        event.preventDefault();
        go(keys.length - 1);
        break;
      case "Escape":
        // The stage closes on any Escape left unhandled.
        event.preventDefault();
        abandon(true);
        break;
      case "Tab":
        event.preventDefault();
        abandon(true);
        break;
      case "ArrowRight":
      case "ArrowLeft": {
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        const neighbour =
          filters[(filterIndex + step + filters.length) % filters.length];
        if (neighbour) {
          shut();
          setBarIndex(filters.indexOf(neighbour));
          openMenu(neighbour.id, "applied");
        }
        break;
      }
      default: {
        if (event.key.length !== 1 || !menuFilter) break;
        const letter = event.key.toLowerCase();
        const labels = keys.map((k) =>
          optionLabel(menuFilter, k === ANY ? null : k).toLowerCase(),
        );
        for (let step = 1; step <= keys.length; step += 1) {
          const i = (index + step) % keys.length;
          if (labels[i]?.startsWith(letter)) {
            go(i);
            break;
          }
        }
      }
    }
  };

  const activeId =
    activeCard && visible.some((r) => r.id === activeCard)
      ? activeCard
      : (visible[0]?.id ?? null);
  const colsNow = layout === "rows" ? 1 : cols;

  const onCardKey = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    switch (event.key) {
      case "ArrowRight":
        next = index + 1;
        break;
      case "ArrowLeft":
        next = index - 1;
        break;
      case "ArrowDown":
        next = index + colsNow;
        break;
      case "ArrowUp":
        next = index - colsNow;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = visible.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = visible[clamp(next, 0, visible.length - 1)];
    if (target) cards.current.get(target.id)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const rowsCount = Math.max(1, Math.ceil(visible.length / colsNow));
  const step = cascade(rowsCount) * Math.min(1, ms);
  const lean = motionSafe ? ms : 0;
  const tilt = layout === "rows" ? 0.5 : layout === "compact" ? 1.8 : 2.4;
  const shove = layout === "rows" ? 12 : 7;

  const shownFrac = total ? shown / total : 0;
  const foreFrac = kept && total ? kept.size / total : shownFrac;
  const lo = Math.min(shownFrac, foreFrac);
  const hi = Math.max(shownFrac, foreFrac);
  const meterSpring = motionSafe ? springs.glide : { duration: 0 };

  const menuKeys = menuFilter
    ? [ANY, ...menuFilter.options.map((o) => o.id)]
    : [];

  const gridClass =
    layout === "rows"
      ? "grid grid-cols-1 gap-1.5"
      : cn(
          "grid grid-cols-1 @min-[19rem]:grid-cols-2 @min-[32rem]:grid-cols-3 @min-[43rem]:grid-cols-4",
          layout === "compact" ? "gap-2" : "gap-2.5",
        );

  const body = () => {
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The {noun.other} didn&apos;t load.
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
      );
    }
    if (status === "loading") {
      return (
        <div aria-hidden className={gridClass}>
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2.5",
                layout === "cards"
                  ? "h-28"
                  : layout === "compact"
                    ? "h-14"
                    : "h-9",
              )}
            >
              <span
                className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{
                  width: `${40 + ((i * 29) % 45)}%`,
                  animationDelay: `${i * 90}ms`,
                }}
              />
              {layout === "rows" ? null : (
                <span
                  className="h-2.5 w-1/3 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90 + 60}ms` }}
                />
              )}
            </div>
          ))}
        </div>
      );
    }
    if (total === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">No {noun.other} planned yet.</p>
        </div>
      );
    }
    return (
      <>
        <ul
          role="list"
          aria-label={title}
          aria-describedby={hintId}
          className={cn("relative", gridClass)}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((t, i) => {
              const row = Math.floor(i / colsNow);
              const col = i % colsNow;
              const removed = kept !== null && !kept.has(t.id);
              // Ghosts part from the centre line, like a queue making way.
              const dir =
                colsNow === 1
                  ? 1
                  : col * 2 < colsNow - 1
                    ? -1
                    : col * 2 > colsNow - 1
                      ? 1
                      : row % 2 === 0
                        ? -1
                        : 1;
              const delay = motionSafe ? r3(row * step) : 0;
              const fare = formatFare(t.fare);
              return (
                <motion.li
                  key={t.id}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0, scale: motionSafe ? 0.96 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: motionSafe ? 0.94 : 1,
                    transition: exitFor(durations.base),
                  }}
                  transition={{
                    layout: springs.glide,
                    scale: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                  className="relative"
                >
                  <motion.button
                    ref={(node: HTMLButtonElement | null) => {
                      if (node) cards.current.set(t.id, node);
                      else cards.current.delete(t.id);
                    }}
                    type="button"
                    tabIndex={t.id === activeId ? 0 : -1}
                    aria-label={`${t.from} to ${t.to}, ${MODE_LABEL[t.mode]} ${t.code}, ${t.day} at ${clock(t.departs)}, ${span(t.minutes)}, ${stopsText(t.stops).toLowerCase()}, ${fare}${removed ? `, ${previewLabel} would remove it` : ""}`}
                    aria-disabled={disabled || undefined}
                    onFocus={() => setActiveCard(t.id)}
                    onKeyDown={(event) => onCardKey(event, i)}
                    onClick={() => {
                      if (!disabled) onOpen?.(t);
                    }}
                    initial={false}
                    animate={
                      removed
                        ? {
                            opacity: ghost,
                            x: r3(dir * shove * lean),
                            y: r3(2 * lean),
                            rotate: r3(dir * tilt * lean),
                          }
                        : { opacity: 1, x: 0, y: 0, rotate: 0 }
                    }
                    whileTap={
                      motionSafe && !disabled ? { scale: 0.985 } : undefined
                    }
                    transition={
                      motionSafe
                        ? {
                            x: { ...springs.snap, delay },
                            y: { ...springs.snap, delay },
                            rotate: { ...springs.snap, delay },
                            scale: springs.flick,
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                              delay,
                            },
                          }
                        : { duration: durations.fast, ease: easings.enter }
                    }
                    style={{ originX: 0.5, originY: 1 }}
                    className={cn(
                      "flex w-full rounded-3 border text-left text-foreground transition-colors duration-200",
                      layout === "rows" ? "px-3 py-2" : "px-2.5 py-2",
                      removed
                        ? "border-dashed border-hairline-strong bg-transparent"
                        : "border-hairline bg-surface-1 hover:border-hairline-strong",
                      disabled ? "cursor-default" : "cursor-pointer",
                      FOCUS_RING,
                    )}
                  >
                    <CardBody trip={t} layout={layout} fare={fare} />
                  </motion.button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {shown === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Inbox aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-ink-2">
              No {noun.other} match {describe(applied, filters)}.
            </p>
            <button
              type="button"
              onClick={reset}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Clear filters
            </button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <p id={hintId} className="sr-only">
        Open a filter to preview it. Arrow keys preview options, Enter applies,
        Escape keeps the current results. Arrow keys move between {noun.other}.
      </p>

      <header className="flex shrink-0 flex-col gap-1 px-4 pt-3 pb-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-semibold">
              {title}
            </p>
            <p className="truncate text-[11px] text-ink-3">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-baseline gap-1.5">
            {ready ? (
              <>
                <span className="sr-only">
                  {readout} {nounFor(readout)}
                </span>
                <Roll
                  value={readout}
                  motionSafe={motionSafe}
                  className={cn(
                    "font-mono text-xl font-medium transition-[color,opacity] duration-200",
                    previewValue ? "text-cobalt-bright" : "text-foreground",
                    forecasting && "opacity-40",
                  )}
                />
                <span aria-hidden className="text-[11px] text-ink-3">
                  {nounFor(readout)}
                </span>
              </>
            ) : (
              <span
                aria-hidden
                className="h-6 w-14 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              />
            )}
          </div>
        </div>
        <div className="grid h-4 text-[12px] leading-4 text-ink-2">
          <AnimatePresence initial={false}>
            <motion.p
              key={phrase}
              title={phrase}
              className="col-start-1 row-start-1 truncate"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {phrase}
            </motion.p>
          </AnimatePresence>
        </div>
      </header>

      <div
        role="toolbar"
        aria-label="Filters"
        className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3"
      >
        {filters.map((filter, index) => {
          const chosen = applied[filter.id] ?? null;
          const open = menu?.filterId === filter.id;
          return (
            <button
              key={filter.id}
              id={triggerId(filter.id)}
              ref={(node) => {
                if (node) triggers.current.set(filter.id, node);
                else triggers.current.delete(filter.id);
              }}
              type="button"
              tabIndex={index === barFocus ? 0 : -1}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              aria-describedby={hintId}
              aria-disabled={inert || undefined}
              onFocus={() => setBarIndex(index)}
              onKeyDown={(event) => onBarKey(event, index)}
              onClick={() => {
                if (open) abandon(false);
                else openMenu(filter.id, "applied");
              }}
              className={cn(
                "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                chosen !== null
                  ? "border-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)] bg-cobalt-wash"
                  : "border-hairline-strong bg-surface-1 hover:bg-surface-2",
                open && "bg-surface-2",
                inert && "cursor-not-allowed opacity-60",
                FOCUS_RING,
              )}
            >
              <span className="text-ink-3">{filter.label}</span>
              <span
                className={cn(
                  "truncate font-medium",
                  chosen !== null ? "text-cobalt-bright" : "text-foreground",
                )}
              >
                {chosen === null ? "Any" : optionLabel(filter, chosen)}
              </span>
              <motion.span
                aria-hidden
                className="inline-flex shrink-0 text-ink-3"
                initial={false}
                animate={{ rotate: open ? 180 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <ChevronDown className="size-3.5" />
              </motion.span>
            </button>
          );
        })}
        {anyApplied ? (
          <button
            ref={resetRef}
            type="button"
            tabIndex={barFocus === filters.length ? 0 : -1}
            onFocus={() => setBarIndex(filters.length)}
            onKeyDown={(event) => onBarKey(event, filters.length)}
            onClick={reset}
            aria-disabled={inert || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-ink-2 transition-colors hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3" />
            Reset
          </button>
        ) : null}
      </div>

      <div
        aria-hidden
        className="relative mx-4 h-[3px] shrink-0 overflow-hidden rounded-full bg-surface-2"
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_oklab,var(--accent-bright)_70%,transparent)]"
          initial={false}
          animate={{ width: pct(ready ? lo : 0) }}
          transition={meterSpring}
        />
        <motion.div
          className={cn(
            "absolute inset-y-0",
            foreFrac < shownFrac
              ? "bg-[repeating-linear-gradient(135deg,var(--accent-bright)_0_2px,transparent_2px_5px)] opacity-70"
              : "bg-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)]",
          )}
          initial={false}
          animate={{
            left: pct(ready ? lo : 0),
            width: pct(ready ? hi - lo : 0),
          }}
          transition={meterSpring}
        />
      </div>

      <motion.div
        layoutScroll
        className="relative flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-3"
      >
        {body()}
      </motion.div>

      <AnimatePresence>
        {menu && menuFilter ? (
          <motion.div
            key={menu.filterId}
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId(menu.filterId)}
            onPointerLeave={() => hover(null)}
            initial={{
              opacity: 0,
              y: motionSafe ? -distances.nudge : 0,
              scale: motionSafe ? 0.98 : 1,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            style={{
              left: menu.left,
              top: menu.top,
              width: menu.width,
              maxHeight: menu.maxHeight,
              originX: 0,
              originY: 0,
            }}
            className="absolute z-20 flex flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 text-popover-foreground shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
          >
            {menuKeys.map((key, index) => {
              const optionId = key === ANY ? null : key;
              const isApplied = (applied[menuFilter.id] ?? null) === optionId;
              const n = countForecast(records, filters, {
                ...applied,
                [menuFilter.id]: optionId,
              });
              return (
                <button
                  key={key}
                  ref={(node) => {
                    if (!node) {
                      items.current.delete(key);
                      return;
                    }
                    items.current.set(key, node);
                    if (pendingFocus.current === key) {
                      pendingFocus.current = null;
                      node.focus({ preventScroll: true });
                    }
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isApplied}
                  tabIndex={-1}
                  onPointerEnter={() => hover(key)}
                  onPointerLeave={() => hover(null)}
                  onFocus={() => focusOption(key)}
                  onKeyDown={(event) => onMenuKey(event, menuKeys, index)}
                  onClick={() => commit(menuFilter.id, optionId)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-2 rounded-2 px-2.5 text-left text-[13px] transition-colors hover:bg-surface-1 focus-visible:bg-surface-1",
                    "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center text-cobalt-bright">
                    {isApplied ? (
                      <Check aria-hidden className="size-3.5" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {optionLabel(menuFilter, optionId)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      n === 0 ? "text-danger" : "text-ink-3",
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
