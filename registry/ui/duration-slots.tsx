"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Globe,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  durations as tweens,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type SlotPillShape = "round" | "soft" | "square";
export type SlotDensity = "compact" | "cozy" | "roomy";
export type SlotStatus = "ready" | "loading" | "error";

export type SlotPick = {
  /** ISO date, "2026-10-22". */
  date: string;
  /** Minutes from midnight on the host's clock. */
  start: number;
  /** Minutes from midnight on the host's clock, exclusive. */
  end: number;
};

export type SlotZone = {
  id: string;
  /** A place name: "Lisbon". */
  label: string;
  /** Minutes ahead of UTC on the dates shown. */
  offset: number;
};

export type SlotHost = {
  name: string;
  role: string;
  place: string;
  about?: string;
  /** The zone id the availability is written in. */
  zone: string;
};

export type DurationSlotsProps = {
  /** The corners of every pill; the liquid join keeps them. @default "soft" */
  pillShape?: SlotPillShape;
  /** Pill height, gaps and type: 32, 38 or 44px pills. @default "cozy" */
  density?: SlotDensity;
  /** Any CSS colour: the picked pill, the day and length pills, the free dots. @default "var(--accent-bright)" */
  accent?: string;
  /** Free slot starts per ISO date, "HH:MM" on the host's clock, one per `slotMinutes`. @default defaultSlotAvailability */
  availability?: Record<string, string[]>;
  /** The grain of `availability`, minutes. @default 30 */
  slotMinutes?: number;
  /** The lengths offered, each a multiple of `slotMinutes`. @default [30, 60, 90] */
  durations?: number[];
  /** Controlled length, minutes. */
  duration?: number;
  /** Initial length when uncontrolled. @default the first of `durations` */
  defaultDuration?: number;
  /** Fires from the press or key that changed the length. */
  onDurationChange?: (minutes: number) => void;
  /** Controlled day, ISO. */
  date?: string;
  /** Initial day when uncontrolled. @default "2026-10-22" */
  defaultDate?: string;
  /** Fires from the press or key that changed the day. */
  onDateChange?: (iso: string) => void;
  /** Controlled pick, or null. */
  value?: SlotPick | null;
  /** Initial pick when uncontrolled. @default null */
  defaultValue?: SlotPick | null;
  /** A time was picked (or cleared by a change of day or length). */
  onPick?: (pick: SlotPick | null) => void;
  /** Confirm was pressed with the pick. */
  onConfirm?: (pick: SlotPick) => void;
  /** Zones offered by the time zone box. @default defaultSlotZones */
  zones?: SlotZone[];
  /** Controlled zone id. */
  zone?: string;
  /** Initial zone when uncontrolled. @default the host's zone */
  defaultZone?: string;
  /** Fires when a zone is chosen. */
  onZoneChange?: (id: string) => void;
  /** Who is being booked. @default defaultSlotHost */
  host?: SlotHost;
  /** The current time, ms; days before it are past. Never read from the clock. @default defaultSlotNow */
  now?: number;
  /** Whether the availability has arrived. @default "ready" */
  status?: SlotStatus;
  /** "Try again" was pressed after the availability failed to load. */
  onRetry?: () => void;
  /** Height of the page, px; its body scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be picked or confirmed. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** Wednesday 21 October 2026, 09:00 in Lisbon. */
export const defaultSlotNow = Date.UTC(2026, 9, 21, 8, 0);

export const defaultSlotHost: SlotHost = {
  name: "Hana Ito",
  role: "Registered dietitian",
  place: "Coldbrook Clinic",
  about:
    "A first conversation about what you eat, how you feel and what you would like to change. Bring any notes you have.",
  zone: "lisbon",
};

/** Offsets as they stand in late October 2026. */
export const defaultSlotZones: SlotZone[] = [
  { id: "lisbon", label: "Lisbon", offset: 60 },
  { id: "london", label: "London", offset: 60 },
  { id: "madrid", label: "Madrid", offset: 120 },
  { id: "berlin", label: "Berlin", offset: 120 },
  { id: "helsinki", label: "Helsinki", offset: 180 },
  { id: "dubai", label: "Dubai", offset: 240 },
  { id: "mumbai", label: "Mumbai", offset: 330 },
  { id: "singapore", label: "Singapore", offset: 480 },
  { id: "sao-paulo", label: "São Paulo", offset: -180 },
  { id: "new-york", label: "New York", offset: -240 },
  { id: "chicago", label: "Chicago", offset: -300 },
  { id: "denver", label: "Denver", offset: -360 },
  { id: "los-angeles", label: "Los Angeles", offset: -420 },
];

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * October at the clinic: a full Thursday, a Friday with nothing left (it
 * points to Monday), and the rest of the month seeded — weekdays only, the
 * mornings and afternoons broken where other clients already booked.
 */
export const defaultSlotAvailability: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {
    "2026-10-21": ["14:00", "14:30", "16:00"],
    "2026-10-22": [
      "09:00",
      "09:30",
      "10:00",
      "11:00",
      "11:30",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "16:30",
    ],
    "2026-10-23": [],
    "2026-10-26": [
      "09:00",
      "09:30",
      "10:30",
      "11:00",
      "14:00",
      "14:30",
      "15:00",
    ],
  };
  const rand = mulberry32(2210);
  for (let d = 27; d <= 31; d += 1) {
    const iso = `2026-10-${d}`;
    const weekday = new Date(Date.UTC(2026, 9, d)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const list: string[] = [];
    for (let m = 9 * 60; m < 17 * 60; m += 30) {
      if (m >= 12 * 60 && m < 13 * 60) continue;
      if (rand() < 0.58) list.push(hhmm(m));
    }
    out[iso] = list;
  }
  return out;
})();

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const DENSITY: Record<
  SlotDensity,
  { h: number; g: number; text: string; brk: number }
> = {
  compact: { h: 32, g: 6, text: "text-[12px]", brk: 14 },
  cozy: { h: 38, g: 8, text: "text-[13px]", brk: 16 },
  roomy: { h: 44, g: 10, text: "text-sm", brk: 18 },
};

const RADIUS: Record<SlotPillShape, (h: number) => number> = {
  round: (h) => h / 2,
  soft: () => 10,
  square: () => 4,
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
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

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeInOut = (x: number) =>
  x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

const minutesOf = (text: string) => {
  const [h = 0, m = 0] = text.split(":").map(Number);
  return h * 60 + m;
};

const isoParts = (iso: string) => {
  const [y = 2026, m = 1, d = 1] = iso.split("-").map(Number);
  return { y, m, d };
};
const isoOf = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const weekdayOf = (iso: string) => {
  const { y, m, d } = isoParts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const dayLabel = (iso: string, long = false) => {
  const { m, d } = isoParts(iso);
  const wd = WEEKDAYS[weekdayOf(iso)] ?? "";
  const mo = MONTHS[m - 1] ?? "";
  return long ? `${wd} ${d} ${mo}` : `${wd.slice(0, 3)} ${d} ${mo.slice(0, 3)}`;
};

const offsetLabel = (offset: number) => {
  const sign = offset < 0 ? "−" : "+";
  const a = Math.abs(offset);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
};

const lengthLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};

/** A host-clock minute on the visitor's clock, with a day marker when it crosses midnight. */
const shiftClock = (minute: number, delta: number) => {
  const v = minute + delta;
  const day = Math.floor(v / 1440);
  const m = ((v % 1440) + 1440) % 1440;
  return { text: hhmm(m), day };
};

/**
 * The liquid join between two stacked pills, in a box `gap + 2` tall whose
 * width is stretched to the pill's (x runs 0–100). A thread forms at the
 * centre, its attach points spread along the facing edges — never past the
 * flat part of an edge whose corners are still round — and the waist
 * follows behind, so it reads as a neck until it is a straight band.
 */
function joinPath(t: number, gap: number, width: number, radius: number) {
  const j = clamp01(t);
  if (j <= 0.002) return "";
  const r = radius * (1 - smooth(0.5, 1, j));
  const flat = 50 - (r / Math.max(1, width)) * 100;
  // The thread stays a thread for the spring's quick first stretch, then
  // the neck fills out over its slower settle.
  const A = Math.max(
    0,
    Math.min(flat, 50 * easeInOut(clamp01(Math.pow(j, 1.6) / 0.9))),
  );
  const N = A * Math.pow(j, 2.2);
  const H = gap + 2;
  const top = 1;
  const bot = gap + 1;
  const mid = 1 + gap / 2;
  const k = (A - N) * 0.55;
  const c = gap * 0.22;
  const L = r2(50 - A);
  const R = r2(50 + A);
  const f = (v: number) => r2(v);
  return [
    `M ${L} 0 L ${R} 0 L ${R} ${top}`,
    `C ${f(50 + A - k)} ${top} ${f(50 + N)} ${f(mid - c)} ${f(50 + N)} ${f(mid)}`,
    `C ${f(50 + N)} ${f(mid + c)} ${f(50 + A - k)} ${bot} ${R} ${bot}`,
    `L ${R} ${H} L ${L} ${H} L ${L} ${bot}`,
    `C ${f(50 - A + k)} ${bot} ${f(50 - N)} ${f(mid + c)} ${f(50 - N)} ${f(mid)}`,
    `C ${f(50 - N)} ${f(mid - c)} ${f(50 - A + k)} ${top} ${L} ${top} Z`,
  ].join(" ");
}

/* ----------------------------------------------------------------------- */
/*                                  Layout                                 */
/* ----------------------------------------------------------------------- */

type Run = { id: string; slots: number[] };
type Group = {
  id: string;
  run: string;
  /** Index of the group's first slot within its run. */
  from: number;
  /** Slots in the group. */
  k: number;
  start: number;
  end: number;
  short: boolean;
  top: number;
  height: number;
  column: number;
};
type ColumnLayout = {
  runs: { run: Run; top: number }[];
  breaks: number[];
  height: number;
};

function runsOf(slots: number[], grain: number): Run[] {
  const out: Run[] = [];
  for (const m of slots) {
    const last = out[out.length - 1];
    const prev = last?.slots[last.slots.length - 1];
    if (last && prev !== undefined && m - prev === grain) last.slots.push(m);
    else out.push({ id: `r${m}`, slots: [m] });
  }
  return out;
}

/** Morning and afternoon: a run belongs to the part of the day it starts in. */
function columnsOf(
  runs: Run[],
  h: number,
  g: number,
  brk: number,
): ColumnLayout[] {
  const cols: ColumnLayout[] = [
    { runs: [], breaks: [], height: 0 },
    { runs: [], breaks: [], height: 0 },
  ];
  for (const run of runs) {
    const col = cols[(run.slots[0] ?? 0) < 12 * 60 ? 0 : 1];
    if (!col) continue;
    if (col.runs.length > 0) {
      col.breaks.push(col.height + brk / 2);
      col.height += brk;
    }
    col.runs.push({ run, top: col.height });
    col.height += run.slots.length * h + (run.slots.length - 1) * g;
  }
  return cols;
}

/** Each run partitioned from its start into groups of `k`; what is left cannot hold the length. */
function groupsOf(
  cols: ColumnLayout[],
  k: number,
  grain: number,
  h: number,
  g: number,
): Group[] {
  const out: Group[] = [];
  cols.forEach((col, column) => {
    for (const { run, top } of col.runs) {
      const n = run.slots.length;
      const full = Math.floor(n / k) * k;
      for (let i = 0; i < n;) {
        const short = i >= full;
        const size = short ? 1 : k;
        const start = run.slots[i] ?? 0;
        out.push({
          id: `${run.id}-${i}-${size}`,
          run: run.id,
          from: i,
          k: size,
          start,
          end: start + (short ? grain : k * grain),
          short,
          top: top + i * (h + g),
          height: size * h + (size - 1) * g,
          column,
        });
        i += size;
      }
    }
  });
  return out.sort((a, b) => a.start - b.start);
}

const joinActive = (i: number, n: number, k: number) =>
  k > 1 &&
  Math.floor(i / k) === Math.floor((i + 1) / k) &&
  i + 1 < Math.floor(n / k) * k;

/* ----------------------------------------------------------------------- */
/*                                 Drawing                                 */
/* ----------------------------------------------------------------------- */

const ZERO = motionValue(0);

function Pill({
  top,
  h,
  radius,
  above,
  below,
  tone,
}: {
  top: number;
  h: number;
  radius: number;
  above?: MotionValue<number>;
  below?: MotionValue<number>;
  tone: "free" | "picked" | "short";
}) {
  const a = above ?? ZERO;
  const b = below ?? ZERO;
  // The facing corners square off in the second half of a join.
  const rTop = useTransform(a, (v) => r2(radius * (1 - smooth(0.5, 1, v))));
  const rBottom = useTransform(b, (v) => r2(radius * (1 - smooth(0.5, 1, v))));
  return (
    <motion.div
      className={cn(
        "absolute inset-x-0 transition-[background-color,border-color] duration-150",
        tone === "short"
          ? "border border-dashed border-hairline-strong bg-transparent"
          : tone === "picked"
            ? "border border-transparent bg-(--ds-pick)"
            : "border border-transparent bg-(--ds-tint)",
      )}
      style={{
        top,
        height: h,
        borderTopLeftRadius: rTop,
        borderTopRightRadius: rTop,
        borderBottomLeftRadius: rBottom,
        borderBottomRightRadius: rBottom,
      }}
    />
  );
}

function Join({
  top,
  gap,
  width,
  radius,
  t,
  seam,
  picked,
  motionSafe,
}: {
  top: number;
  gap: number;
  width: number;
  radius: number;
  t: MotionValue<number>;
  seam: MotionValue<number>;
  picked: boolean;
  motionSafe: boolean;
}) {
  const d = useTransform(t, (v) => joinPath(v, gap, width, radius));
  const seamOpacity = useTransform(
    [seam, t] as MotionValue<number>[],
    ([s, v]) => r2(clamp01(Number(s ?? 0)) * clamp01(Number(v ?? 0))),
  );
  // Under reduced motion the join is never drawn half way: it is either a
  // band or nothing, and it fades between the two.
  const shown = useTransform(t, (v) => (v > 0.5 ? 1 : 0));
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0"
      style={{ top: top - 1, height: gap + 2 }}
    >
      <motion.svg
        viewBox={`0 0 100 ${gap + 2}`}
        preserveAspectRatio="none"
        className={cn(
          "absolute inset-0 size-full",
          !motionSafe && "transition-opacity duration-150",
        )}
        style={motionSafe ? undefined : { opacity: shown }}
      >
        <motion.path
          d={d}
          className={cn(
            "transition-[fill] duration-150",
            picked ? "fill-(--ds-pick)" : "fill-(--ds-tint)",
          )}
        />
      </motion.svg>
      <motion.span
        className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-card"
        style={{ scaleX: seam, opacity: seamOpacity }}
      />
    </div>
  );
}

/**
 * One run of consecutive free slots: its pills and the joins between them.
 * Each join owns a value from 0 (apart) to 1 (one pill); a change of length
 * drives every join toward its new state — merging on glide, a cascade
 * apart, or splitting on snap after a seam has drawn across it.
 */
function RunShape({
  run,
  top,
  k,
  h,
  g,
  radius,
  width,
  picked,
  motionSafe,
}: {
  run: Run;
  top: number;
  k: number;
  h: number;
  g: number;
  radius: number;
  width: number;
  picked: { from: number; k: number } | null;
  motionSafe: boolean;
}) {
  const n = run.slots.length;
  const [joins] = React.useState(() =>
    Array.from({ length: Math.max(0, n - 1) }, (_, i) =>
      motionValue(joinActive(i, n, k) ? 1 : 0),
    ),
  );
  const [seams] = React.useState(() =>
    Array.from({ length: Math.max(0, n - 1) }, () => motionValue(0)),
  );
  const activeKey = joins.map((_, i) => (joinActive(i, n, k) ? 1 : 0)).join("");

  React.useEffect(() => {
    const running: AnimationPlaybackControls[] = [];
    let order = 0;
    joins.forEach((mv, i) => {
      const target = activeKey[i] === "1" ? 1 : 0;
      const seam = seams[i];
      if (!seam || Math.abs(mv.get() - target) < 0.001) return;
      if (!motionSafe) {
        mv.jump(target);
        seam.jump(0);
        return;
      }
      const delay = order * 0.05;
      order += 1;
      if (target === 1) {
        seam.jump(0);
        running.push(animate(mv, 1, { ...springs.glide, delay }));
      } else {
        // Split: the seam draws across from the centre, then the neck pinches.
        running.push(
          animate(seam, 1, {
            duration: 0.12,
            ease: easings.move,
            delay: delay + 0.06,
          }),
        );
        running.push(animate(mv, 0, { ...springs.snap, delay: delay + 0.18 }));
      }
    });
    // A re-run (StrictMode, a quick second change) carries on from where
    // these left off, so a join never freezes half formed.
    return () => {
      for (const c of running) c.stop();
    };
  }, [activeKey, joins, seams, motionSafe]);

  const inPick = (i: number) =>
    picked !== null && i >= picked.from && i < picked.from + picked.k;
  const full = Math.floor(n / k) * k;

  return (
    <>
      {run.slots.map((m, i) => (
        <Pill
          key={m}
          top={top + i * (h + g)}
          h={h}
          radius={radius}
          above={joins[i - 1]}
          below={joins[i]}
          tone={inPick(i) ? "picked" : i >= full && k > 1 ? "short" : "free"}
        />
      ))}
      {joins.map((t, i) => {
        const seam = seams[i];
        if (!seam) return null;
        return (
          <Join
            key={i}
            top={top + i * (h + g) + h}
            gap={g}
            width={width}
            radius={radius}
            t={t}
            seam={seam}
            picked={inPick(i) && inPick(i + 1)}
            motionSafe={motionSafe}
          />
        );
      })}
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                              The booking page                            */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };

/**
 * A public booking page: the host, the length, the time zone, a month strip
 * and the chosen day's free times as pills in two columns. Changing the
 * length is the signature: from 30 to 60 minutes every pair of neighbouring
 * pills joins — a liquid thread forms between them, its attach points spread
 * and its waist follows on glide until the two are one tall pill — while the
 * two times drift together and "09:00 – 10:00" fades in; a pill that cannot
 * hold the length turns to a dashed outline and keeps its place. Back to 30,
 * a seam draws across each pill and it splits on snap.
 *
 * The times are a listbox (Up and Down, Home and End, Enter picks), the days
 * and lengths are radiogroups, and the zone is a combobox with type-ahead.
 * Under reduced motion the joins cross-fade instead of flowing, and every
 * time, count and pick still changes.
 */
export function DurationSlots({
  pillShape = "soft",
  density = "cozy",
  accent = "var(--accent-bright)",
  availability = defaultSlotAvailability,
  slotMinutes = 30,
  durations = [30, 60, 90],
  duration,
  defaultDuration,
  onDurationChange,
  date,
  defaultDate = "2026-10-22",
  onDateChange,
  value,
  defaultValue = null,
  onPick,
  onConfirm,
  zones = defaultSlotZones,
  zone,
  defaultZone,
  onZoneChange,
  host = defaultSlotHost,
  now = defaultSlotNow,
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: DurationSlotsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ready = status === "ready";
  const grain = Math.max(5, Math.round(slotMinutes));
  const lengths = durations.filter((d) => d > 0 && d % grain === 0);
  const geom = DENSITY[density] ?? DENSITY.cozy;
  const { h, g, brk } = geom;
  const radius = Math.min(h / 2, (RADIUS[pillShape] ?? RADIUS.soft)(h));

  /* ------------------------------- values -------------------------------- */

  const [ownLen, setOwnLen] = React.useState(
    () => defaultDuration ?? lengths[0] ?? grain,
  );
  const len = duration ?? ownLen;
  const k = Math.max(1, Math.round(len / grain));
  const [ownDate, setOwnDate] = React.useState(defaultDate);
  const day = date ?? ownDate;
  const [ownPick, setOwnPick] = React.useState<SlotPick | null>(defaultValue);
  const pick = value !== undefined ? value : ownPick;
  const hostZone = zones.find((z) => z.id === host.zone) ?? zones[0];
  const [ownZone, setOwnZone] = React.useState(
    () => defaultZone ?? hostZone?.id ?? "",
  );
  const zoneId = zone ?? ownZone;
  const viewer = zones.find((z) => z.id === zoneId) ?? hostZone;
  const delta = (viewer?.offset ?? 0) - (hostZone?.offset ?? 0);
  const [confirmed, setConfirmed] = React.useState<string | null>(null);
  const pickKey = pick ? `${pick.date}|${pick.start}|${pick.end}` : "";
  const isConfirmed = confirmed !== null && confirmed === pickKey;
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // The previous length, so labels can drift from where they were.
  const [lastLen, setLastLen] = React.useState({ now: len, before: len });
  if (lastLen.now !== len) setLastLen({ now: len, before: lastLen.now });
  const kBefore = Math.max(1, Math.round(lastLen.before / grain));

  /* ------------------------------- layout -------------------------------- */

  const slots = React.useMemo(
    () =>
      [...new Set((availability[day] ?? []).map(minutesOf))].sort(
        (a, b) => a - b,
      ),
    [availability, day],
  );
  const runs = React.useMemo(() => runsOf(slots, grain), [slots, grain]);
  const cols = React.useMemo(
    () => columnsOf(runs, h, g, brk),
    [runs, h, g, brk],
  );
  const groups = React.useMemo(
    () => groupsOf(cols, k, grain, h, g),
    [cols, k, grain, h, g],
  );
  const groupsBefore = React.useMemo(
    () => groupsOf(cols, kBefore, grain, h, g),
    [cols, kBefore, grain, h, g],
  );
  const options = groups;
  const bookable = options.filter((o) => !o.short);

  const pickedGroup =
    pick && pick.date === day
      ? options.find(
          (o) => !o.short && o.start === pick.start && o.end === pick.end,
        )
      : undefined;

  const [width, setWidth] = React.useState(180);
  const [colNode, setColNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!colNode) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(colNode.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    });
    ro.observe(colNode);
    return () => ro.disconnect();
  }, [colNode]);

  /* --------------------------- the month strip --------------------------- */

  const { y: year, m: month } = isoParts(day);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const nowDate = new Date(now);
  const todayIso = isoOf(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth() + 1,
    nowDate.getUTCDate(),
  );
  const monthDays = Array.from({ length: daysInMonth }, (_, i) =>
    isoOf(year, month, i + 1),
  );
  const maxFree = Math.max(
    1,
    ...monthDays.map((iso) => (availability[iso] ?? []).length),
  );
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const dayRefs = React.useRef(new Map<string, HTMLButtonElement>());

  React.useLayoutEffect(() => {
    const el = stripRef.current;
    const node = dayRefs.current.get(day);
    if (!el || !node) return;
    const l = node.offsetLeft - el.offsetLeft;
    if (
      l < el.scrollLeft ||
      l + node.offsetWidth > el.scrollLeft + el.clientWidth
    ) {
      el.scrollLeft = Math.max(
        0,
        l - el.clientWidth / 2 + node.offsetWidth / 2,
      );
    }
  }, [day]);

  /* ------------------------------- actions ------------------------------- */

  const setPick = (next: SlotPick | null) => {
    if (value === undefined) setOwnPick(next);
    onPick?.(next);
  };

  const chooseLength = (next: number) => {
    if (disabled || next === len) return;
    if (duration === undefined) setOwnLen(next);
    onDurationChange?.(next);
    const kn = Math.max(1, Math.round(next / grain));
    const count = groupsOf(cols, kn, grain, h, g).filter(
      (o) => !o.short,
    ).length;
    if (pick) setPick(null);
    say(
      `${lengthLabel(next)}. ${count === 1 ? "1 time" : `${count} times`} on ${dayLabel(day, true)}.`,
    );
  };

  const chooseDay = (iso: string) => {
    if (disabled || iso === day) return;
    if (date === undefined) setOwnDate(iso);
    onDateChange?.(iso);
    if (pick) setPick(null);
    const free = groupsOf(
      columnsOf(
        runsOf(
          [...new Set((availability[iso] ?? []).map(minutesOf))].sort(
            (a, b) => a - b,
          ),
          grain,
        ),
        h,
        g,
        brk,
      ),
      k,
      grain,
      h,
      g,
    ).filter((o) => !o.short).length;
    say(
      `${dayLabel(iso, true)}. ${free === 0 ? "No times" : free === 1 ? "1 time" : `${free} times`}.`,
    );
  };

  const choose = (o: Group) => {
    if (disabled || !ready || o.short) return;
    const next = { date: day, start: o.start, end: o.end };
    setPick(next);
    setActiveOpt(o.id);
    say(`Picked ${timeText(o.start, o.end)}.`);
  };

  const confirm = () => {
    if (disabled || !pick || isConfirmed) return;
    setConfirmed(pickKey);
    say(
      `Booked ${dayLabel(pick.date, true)}, ${timeText(pick.start, pick.end)}.`,
    );
    onConfirm?.(pick);
  };

  const timeText = (s: number, e: number) => {
    const a = shiftClock(s, delta);
    const b = shiftClock(e, delta);
    return `${a.text} to ${b.text}${a.day > 0 ? " next day" : a.day < 0 ? " the day before" : ""}, ${viewer?.label ?? ""} time`;
  };

  /* ------------------------------ listbox -------------------------------- */

  const [activeOpt, setActiveOpt] = React.useState<string | null>(null);
  const activeId =
    activeOpt && options.some((o) => o.id === activeOpt)
      ? activeOpt
      : (pickedGroup?.id ?? bookable[0]?.id ?? options[0]?.id ?? null);
  const optRefs = React.useRef(new Map<string, HTMLDivElement>());

  const onOptionKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    o: Group,
  ) => {
    const at = options.findIndex((x) => x.id === o.id);
    const go = (i: number) => {
      const next = options[Math.max(0, Math.min(options.length - 1, i))];
      if (!next) return;
      setActiveOpt(next.id);
      optRefs.current.get(next.id)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(at + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(at - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(options.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(o);
        return;
      default:
        return;
    }
  };

  /* ------------------------------ combobox ------------------------------- */

  const [zoneOpenAt, setZoneOpenAt] = React.useState<"side" | "foot" | null>(
    null,
  );
  const [query, setQuery] = React.useState<string | null>(null);
  const [zoneActive, setZoneActive] = React.useState(0);
  const zoneText = (z: SlotZone | undefined) =>
    z ? `${z.label} (${offsetLabel(z.offset)})` : "";
  const filtered = zones.filter((z) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      z.label.toLowerCase().includes(q) ||
      offsetLabel(z.offset).toLowerCase().includes(q)
    );
  });
  const listId = `${uid}-zones`;
  const optId = (where: string, i: number) => `${uid}-${where}-zone-${i}`;

  const pickZone = (z: SlotZone) => {
    if (zone === undefined) setOwnZone(z.id);
    onZoneChange?.(z.id);
    setZoneOpenAt(null);
    setQuery(null);
    say(`Times shown in ${z.label}, ${offsetLabel(z.offset)}.`);
  };

  /* -------------------------------- render ------------------------------- */

  const lengthGroup = (
    <div
      role="radiogroup"
      aria-label="Length"
      className="relative flex h-9 items-center gap-0.5 rounded-3 border border-hairline bg-surface-2 p-0.5"
    >
      {lengths.map((l, i) => {
        const on = l === len;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            aria-disabled={disabled || undefined}
            onClick={() => chooseLength(l)}
            onKeyDown={(event) => {
              const step =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!step) return;
              event.preventDefault();
              const next =
                lengths[(i + step + lengths.length) % lengths.length];
              if (next === undefined) return;
              chooseLength(next);
              const parent = event.currentTarget.parentElement;
              const target =
                parent?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[
                  (i + step + lengths.length) % lengths.length
                ];
              target?.focus();
            }}
            className={cn(
              "relative z-[1] inline-flex h-8 flex-1 items-center justify-center rounded-2 px-2 text-[12px] font-medium whitespace-nowrap transition-colors",
              on
                ? "text-primary-foreground"
                : "text-ink-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-length`}
                aria-hidden
                className="absolute inset-0 -z-[1] rounded-2 bg-(--ds-pick)"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            {lengthLabel(l)}
          </button>
        );
      })}
    </div>
  );

  const zoneBox = (where: "side" | "foot") => {
    const zoneOpen = zoneOpenAt === where;
    const setZoneOpen = (open: boolean) => setZoneOpenAt(open ? where : null);
    return (
      <div className="relative">
        <label
          htmlFor={`${uid}-zone-${where}`}
          className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-3"
        >
          <Globe aria-hidden className="size-3.5" />
          Time zone
        </label>
        <div className="relative">
          <input
            id={`${uid}-zone-${where}`}
            role="combobox"
            aria-expanded={zoneOpen}
            aria-controls={`${listId}-${where}`}
            aria-autocomplete="list"
            aria-activedescendant={
              zoneOpen && filtered[zoneActive]
                ? optId(where, zoneActive)
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={query ?? zoneText(viewer)}
            onFocus={(event) => event.currentTarget.select()}
            onClick={() => setZoneOpen(true)}
            onChange={(event) => {
              const text = event.currentTarget.value;
              setQuery(text);
              setZoneOpen(true);
              setZoneActive(0);
            }}
            onBlur={() => {
              setZoneOpen(false);
              setQuery(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!zoneOpen) {
                  setZoneOpen(true);
                  const at = filtered.findIndex((z) => z.id === viewer?.id);
                  setZoneActive(Math.max(0, at));
                  return;
                }
                const d = event.key === "ArrowDown" ? 1 : -1;
                setZoneActive((a) =>
                  filtered.length === 0
                    ? 0
                    : (a + d + filtered.length) % filtered.length,
                );
              } else if (event.key === "Enter") {
                if (!zoneOpen) return;
                event.preventDefault();
                const z = filtered[zoneActive];
                if (z) pickZone(z);
              } else if (event.key === "Escape") {
                if (!zoneOpen && query === null) return;
                event.preventDefault();
                event.stopPropagation();
                setZoneOpen(false);
                setQuery(null);
              }
            }}
            className={cn(
              "h-9 w-full rounded-2 border border-input bg-surface-1 pr-8 pl-3 text-[13px] text-foreground disabled:cursor-not-allowed",
              FOCUS_RING,
            )}
          />
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3"
          />
        </div>
        <AnimatePresence>
          {zoneOpen ? (
            <motion.ul
              key="zones"
              id={`${listId}-${where}`}
              role="listbox"
              aria-label="Time zones"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-44 overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_30px_-10px_color-mix(in_oklab,black_35%,transparent)]"
              initial={{ opacity: 0, y: motionSafe ? -4 : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(tweens.fast) }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: tweens.fast } }
                  : { duration: tweens.fast }
              }
            >
              {filtered.length === 0 ? (
                <li className="px-2.5 py-2 text-[12px] text-ink-3">
                  No zone matches
                </li>
              ) : (
                filtered.map((z, i) => (
                  <li
                    key={z.id}
                    id={optId(where, i)}
                    role="option"
                    aria-selected={z.id === viewer?.id}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => pickZone(z)}
                    onPointerEnter={() => setZoneActive(i)}
                    className={cn(
                      "flex h-8 cursor-pointer items-center justify-between gap-2 rounded-2 px-2.5 text-[13px]",
                      i === zoneActive
                        ? "bg-surface-2 text-foreground"
                        : "text-ink-2",
                    )}
                  >
                    <span className="truncate">{z.label}</span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">
                      {offsetLabel(z.offset)}
                    </span>
                  </li>
                ))
              )}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  const hostCard = (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--ds-accent) 16%, var(--card))",
            color: "var(--ds-ink)",
          }}
        >
          {host.name
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p.charAt(0))
            .join("")}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-ink-3">{host.place}</p>
          <h2
            id={`${uid}-title`}
            className="text-[15px] leading-snug font-semibold"
          >
            Consultation with {host.name}
          </h2>
          <p className="truncate text-[12px] text-ink-2">{host.role}</p>
        </div>
      </div>
      {host.about ? (
        <p className="hidden text-[12px] leading-5 text-ink-2 @min-[40rem]:block">
          {host.about}
        </p>
      ) : null}
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-3">
          <CalendarClock aria-hidden className="size-3.5" />
          Length
        </p>
        {lengthGroup}
      </div>
      <div className="hidden @min-[40rem]:block">{zoneBox("side")}</div>
    </div>
  );

  const strip = (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-foreground">
        {MONTHS[month - 1]} {year}
      </p>
      <div
        ref={stripRef}
        role="radiogroup"
        aria-label="Day"
        className="flex [scrollbar-width:none] gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)] px-1 pt-0.5 pb-1 @min-[64rem]:[mask-image:none]"
      >
        {monthDays.map((iso, i) => {
          const on = iso === day;
          const past = iso < todayIso;
          const count = (availability[iso] ?? []).length;
          const wd = WEEKDAYS[weekdayOf(iso)] ?? "";
          return (
            <button
              key={iso}
              ref={(node) => {
                if (node) dayRefs.current.set(iso, node);
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${dayLabel(iso, true)}${past ? ", past" : count === 0 ? ", no times" : `, ${count} free slots`}`}
              aria-disabled={past || disabled || undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => {
                if (!past) chooseDay(iso);
              }}
              onKeyDown={(event) => {
                const step =
                  event.key === "ArrowRight"
                    ? 1
                    : event.key === "ArrowLeft"
                      ? -1
                      : event.key === "Home"
                        ? -i
                        : event.key === "End"
                          ? monthDays.length - 1 - i
                          : 0;
                if (!step) return;
                event.preventDefault();
                let j = Math.max(0, Math.min(monthDays.length - 1, i + step));
                // Past days cannot be chosen: walk on to the first that can.
                while (
                  (monthDays[j] ?? "") < todayIso &&
                  j < monthDays.length - 1
                )
                  j += 1;
                const target = monthDays[j];
                if (!target) return;
                chooseDay(target);
                dayRefs.current.get(target)?.focus();
              }}
              className={cn(
                "relative flex h-14 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-3 transition-colors @min-[64rem]:w-auto @min-[64rem]:flex-1",
                on
                  ? "text-primary-foreground"
                  : past
                    ? "cursor-not-allowed text-ink-3/50"
                    : "text-foreground hover:bg-surface-2",
                iso === todayIso &&
                  !on &&
                  "ring-1 ring-hairline-strong ring-inset",
                FOCUS_RING,
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${uid}-day`}
                  aria-hidden
                  className="absolute inset-0 rounded-3 bg-(--ds-pick)"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span
                className={cn(
                  "relative text-[10px] tracking-[0.04em] uppercase",
                  on ? "text-primary-foreground/80" : "text-ink-3",
                )}
              >
                {wd.charAt(0)}
              </span>
              <span className="relative text-[13px] font-medium tabular-nums">
                {i + 1}
              </span>
              <span
                aria-hidden
                className={cn(
                  "relative size-1 rounded-full",
                  on ? "bg-primary-foreground" : "bg-(--ds-accent)",
                )}
                style={{
                  opacity:
                    !ready || past || count === 0
                      ? 0
                      : r2(0.35 + (0.65 * count) / maxFree),
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );

  const nextOpen = monthDays.find(
    (iso) =>
      iso > day &&
      iso >= todayIso &&
      groupsOf(
        columnsOf(
          runsOf(
            [...new Set((availability[iso] ?? []).map(minutesOf))].sort(
              (a, b) => a - b,
            ),
            grain,
          ),
          h,
          g,
          brk,
        ),
        k,
        grain,
        h,
        g,
      ).some((o) => !o.short),
  );

  const columnLabel = (i: number) => (i === 0 ? "Morning" : "Afternoon");
  const labelGroups = (column: number) =>
    groups.filter((o) => o.column === column);
  const centreOf = (o: Group) => o.top + o.height / 2;

  const slotColumn = (column: number) => {
    const col = cols[column];
    if (!col || col.runs.length === 0) return null;
    const mine = labelGroups(column);
    const before = groupsBefore.filter((o) => o.column === column);
    // Where each slot's group sits now and before the last change, so a
    // label can drift from its old place toward its new one.
    const centreNow = new Map<number, number>();
    for (const o of mine) {
      for (let s = 0; s < o.k; s += 1)
        centreNow.set(o.start + s * grain, centreOf(o));
    }
    const centreBefore = new Map<number, number>();
    for (const o of before) {
      for (let s = 0; s < o.k; s += 1)
        centreBefore.set(o.start + s * grain, centreOf(o));
    }
    const headingId = `${uid}-col-${column}`;
    return (
      <div
        key={column}
        role="group"
        aria-labelledby={headingId}
        className="min-w-0"
      >
        <p
          id={headingId}
          className="mb-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {columnLabel(column)}
        </p>
        <div
          ref={column === 0 || !cols[0]?.runs.length ? setColNode : undefined}
          className="relative"
          style={{ height: col.height }}
        >
          <div aria-hidden className="absolute inset-0">
            {col.runs.map(({ run, top }) => {
              const p =
                pickedGroup && pickedGroup.run === run.id
                  ? { from: pickedGroup.from, k: pickedGroup.k }
                  : null;
              return (
                <RunShape
                  key={`${day}-${run.id}-${run.slots.length}`}
                  run={run}
                  top={top}
                  k={k}
                  h={h}
                  g={g}
                  radius={radius}
                  width={width}
                  picked={p}
                  motionSafe={motionSafe}
                />
              );
            })}
            {col.breaks.map((y) => (
              <span
                key={y}
                className="absolute inset-x-3 border-t border-dotted border-hairline-strong"
                style={{ top: y }}
              />
            ))}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <AnimatePresence initial={false} custom={centreNow}>
              {mine.map((o) => {
                const own = centreOf(o);
                const from = centreBefore.get(o.start) ?? own;
                const isPick = pickedGroup?.id === o.id;
                return (
                  <motion.span
                    key={`${day}-${o.id}`}
                    custom={centreNow}
                    className={cn(
                      "absolute inset-x-2 flex items-center justify-center font-mono tabular-nums transition-colors duration-150",
                      geom.text,
                      o.short
                        ? "text-ink-3"
                        : isPick
                          ? "text-primary-foreground"
                          : "text-(--ds-ink)",
                    )}
                    style={{ top: o.top, height: o.height }}
                    variants={{
                      enter: {
                        opacity: 0,
                        y: motionSafe ? r2((from - own) * 0.6) : 0,
                      },
                      shown: { opacity: 1, y: 0 },
                      leave: (centres: Map<number, number>) => ({
                        opacity: 0,
                        y: motionSafe
                          ? r2(((centres.get(o.start) ?? own) - own) * 0.6)
                          : 0,
                        transition: {
                          duration: tweens.blink,
                          ease: easings.exit,
                        },
                      }),
                    }}
                    initial="enter"
                    animate="shown"
                    exit="leave"
                    transition={
                      motionSafe
                        ? {
                            y: { ...springs.glide, delay: 0.08 },
                            opacity: {
                              duration: tweens.base,
                              ease: easings.enter,
                              delay: 0.12,
                            },
                          }
                        : { duration: tweens.fast }
                    }
                  >
                    {(() => {
                      const a = shiftClock(o.start, delta);
                      const b = shiftClock(o.end, delta);
                      return o.k > 1 ? (
                        <span className="truncate">
                          {a.text} – {b.text}
                          {b.day !== 0 ? (
                            <sup className="ml-0.5 text-[9px]">
                              {b.day > 0 ? "+1" : "−1"}
                            </sup>
                          ) : null}
                        </span>
                      ) : (
                        <span className="truncate">
                          {a.text}
                          {a.day !== 0 ? (
                            <sup className="ml-0.5 text-[9px]">
                              {a.day > 0 ? "+1" : "−1"}
                            </sup>
                          ) : null}
                          {o.short ? (
                            <span className="ml-1.5 font-sans text-[10px]">
                              too short
                            </span>
                          ) : null}
                        </span>
                      );
                    })()}
                  </motion.span>
                );
              })}
            </AnimatePresence>
          </div>
          {mine.map((o) => {
            const isPick = pickedGroup?.id === o.id;
            const isActive = o.id === activeId;
            return (
              <div
                key={`${day}-${o.id}`}
                ref={(node) => {
                  if (node) optRefs.current.set(o.id, node);
                }}
                id={`${uid}-opt-${o.id}`}
                role="option"
                aria-selected={isPick}
                aria-disabled={o.short || disabled || undefined}
                tabIndex={isActive ? 0 : -1}
                onFocus={() => setActiveOpt(o.id)}
                onClick={() => choose(o)}
                onKeyDown={(event) => onOptionKey(event, o)}
                className={cn(
                  "absolute inset-x-0 transition-colors",
                  o.short
                    ? "cursor-not-allowed"
                    : "cursor-pointer hover:bg-[color-mix(in_oklab,var(--ds-accent)_10%,transparent)]",
                  FOCUS_RING,
                )}
                style={{
                  top: o.top,
                  height: o.height,
                  borderRadius: radius,
                }}
              >
                <span className="sr-only">
                  {o.short
                    ? `${shiftClock(o.start, delta).text}, too short for ${lengthLabel(len)}`
                    : timeText(o.start, o.end)}
                </span>
                {isPick ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute -inset-1 border-[1.5px] border-(--ds-pick)"
                    style={{ borderRadius: radius + 4 }}
                    initial={{ opacity: 0, scale: motionSafe ? 1.06 : 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={
                      motionSafe
                        ? {
                            scale: springs.flick,
                            opacity: { duration: tweens.fast },
                          }
                        : { duration: tweens.fast }
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const loadingPills = (
    <div
      aria-hidden
      className="grid grid-cols-1 gap-5 @min-[40rem]:grid-cols-2"
    >
      {[0, 1].map((c) => (
        <div key={c} className="flex flex-col" style={{ gap: g }}>
          <span className="mb-2 h-2 w-16 rounded-full bg-surface-2" />
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className="border border-dashed border-hairline-strong motion-safe:animate-pulse"
              style={{ height: h, borderRadius: radius }}
            />
          ))}
        </div>
      ))}
    </div>
  );

  const slotsView =
    status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">Times did not load.</p>
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
      <div aria-busy="true">
        <p className="sr-only">Loading times.</p>
        {loadingPills}
      </div>
    ) : bookable.length === 0 ? (
      <div className="flex flex-col items-start gap-3 rounded-3 border border-dashed border-hairline-strong px-4 py-6">
        <p className="text-sm text-foreground">
          Nothing free on {dayLabel(day)}
          {slots.length > 0 ? ` for ${lengthLabel(len)}` : ""}.
        </p>
        {nextOpen ? (
          <button
            type="button"
            onClick={() => chooseDay(nextOpen)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
              FOCUS_RING,
            )}
            style={{ backgroundColor: "var(--ds-pick)" }}
          >
            Next open day: {dayLabel(nextOpen)}
          </button>
        ) : (
          <p className="text-[12px] text-ink-3">
            Nothing else is open this month.
          </p>
        )}
      </div>
    ) : (
      <div
        role="listbox"
        aria-label={`Times on ${dayLabel(day, true)}`}
        className="grid grid-cols-1 gap-x-5 gap-y-4 @min-[40rem]:grid-cols-2"
      >
        {slotColumn(0)}
        {slotColumn(1)}
      </div>
    );

  const confirmBar = (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
      <div className="min-w-0 flex-1 basis-40 text-[12px]">
        {pick ? (
          <>
            <p className="truncate font-medium text-foreground tabular-nums">
              {dayLabel(pick.date)} · {shiftClock(pick.start, delta).text} –{" "}
              {shiftClock(pick.end, delta).text}
            </p>
            <p className="truncate text-ink-3">
              {lengthLabel(pick.end - pick.start)} · {viewer?.label} time
            </p>
          </>
        ) : (
          <p className="text-ink-3">Pick a time to book it.</p>
        )}
      </div>
      <button
        type="button"
        onClick={confirm}
        aria-disabled={!pick || disabled || undefined}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2 px-4 text-[13px] font-medium text-primary-foreground transition-opacity",
          pick && !disabled
            ? "hover:opacity-90"
            : "cursor-not-allowed opacity-50",
          FOCUS_RING,
        )}
        style={{ backgroundColor: "var(--ds-pick)" }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {isConfirmed ? (
            <motion.span
              key="ok"
              className="inline-flex"
              initial={{ opacity: 0, scale: motionSafe ? 1.6 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(tweens.fast) }}
              transition={
                motionSafe
                  ? {
                      scale: springs.recoil,
                      opacity: { duration: tweens.fast },
                    }
                  : { duration: tweens.fast }
              }
            >
              <Check aria-hidden className="size-4" strokeWidth={2.5} />
            </motion.span>
          ) : null}
        </AnimatePresence>
        {isConfirmed ? "Booked" : "Confirm"}
      </button>
    </div>
  );

  const count = bookable.length;

  return (
    <div
      role="region"
      aria-labelledby={`${uid}-title`}
      className={cn(
        "@container grid w-full grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--ds-accent" as string]: accent,
        ["--ds-pick" as string]: `oklch(from ${accent} 0.56 0.16 h)`,
        ["--ds-tint" as string]: `color-mix(in oklab, ${accent} 14%, var(--card))`,
        ["--ds-ink" as string]: `color-mix(in oklab, ${accent} 62%, var(--foreground))`,
      }}
    >
      <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-1 @min-[40rem]:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="border-b border-hairline p-4 @min-[40rem]:border-r @min-[40rem]:border-b-0">
            {hostCard}
          </div>
          <div className="flex min-w-0 flex-col gap-4 p-4">
            {strip}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[13px] font-medium">{dayLabel(day, true)}</p>
              <p className="text-[11px] text-ink-3 tabular-nums">
                {ready
                  ? `${count === 1 ? "1 time" : `${count} times`} · ${lengthLabel(len)} · ${viewer?.label ?? ""} time`
                  : "Loading"}
              </p>
            </div>
            {slotsView}
            <div className="@min-[40rem]:hidden">{zoneBox("foot")}</div>
          </div>
        </div>
      </div>
      {confirmBar}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
