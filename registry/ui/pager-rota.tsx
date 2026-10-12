"use client";

import * as React from "react";

import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";
import {
  CalendarPlus,
  Clock3,
  Paintbrush,
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

export type RotaLayer = "primary" | "secondary";
export type RotaTone =
  "accent" | "signal" | "success" | "warn" | "danger" | "ink";

export type RotaPerson = {
  id: string;
  name: string;
  /** Avatar initials. @default the first letters of the name */
  initials?: string;
  /** The colour the person's blocks and bar are drawn in. @default cycles through the tones in roster order */
  tone?: RotaTone;
};

/** One 24-hour shift: a layer on a day holds a person from one handoff to the next. */
export type RotaShift = {
  id: string;
  layer: RotaLayer;
  /** Days after `weekStart`, from 0. */
  day: number;
  /** A person's id. */
  person: string;
};

/** Part of a shift handed to someone else, in whole hours since that shift's handoff (0–24). */
export type RotaOverride = {
  id: string;
  layer: RotaLayer;
  day: number;
  from: number;
  to: number;
  /** The person covering, by id. */
  person: string;
};

export type RotaShiftChange =
  | { kind: "swap"; layer: RotaLayer; from: number; to: number }
  | { kind: "lay"; layer: RotaLayer; day: number; person: string }
  /** Escape after a pickup put the shifts back as they were. */
  | { kind: "restore" };

export type RotaOverrideChange =
  | { kind: "paint"; override: RotaOverride }
  | { kind: "clear"; layer: RotaLayer; day: number; removed: RotaOverride[] };

export type RotaBlockStyle = "solid" | "outline" | "striped";
export type RotaAccent = "cobalt" | "signal" | "success" | "warn";
export type RotaStatus = "ready" | "loading" | "error";

export type PagerRotaProps = {
  /** Everyone on the rota, in roster order. @default defaultRotaPeople */
  people?: RotaPerson[];
  /** Controlled shifts: at most one per layer per day. */
  shifts?: RotaShift[];
  /** Initial shifts when uncontrolled. @default defaultRotaShifts */
  defaultShifts?: RotaShift[];
  /** Fires after a swap, a laid shift or an Escape that put a carried block back, with every shift. */
  onShiftsChange?: (shifts: RotaShift[], change: RotaShiftChange) => void;
  /** Controlled overrides. */
  overrides?: RotaOverride[];
  /** Initial overrides when uncontrolled. @default defaultRotaOverrides */
  defaultOverrides?: RotaOverride[];
  /** Fires after an override is painted or a shift's overrides are cleared, with every override. */
  onChange?: (overrides: RotaOverride[], change: RotaOverrideChange) => void;
  /** The roster pick changed; null when painting ended. */
  onPick?: (person: RotaPerson | null) => void;
  /** Midnight UTC of the first day shown, in ms. @default defaultRotaWeekStart */
  weekStart?: number;
  /** Days in the cycle: 7 for a week, 14 for a fortnight. Anything from 1 to 14 is drawn. @default 7 */
  days?: number;
  /** The hour (UTC) shifts hand over, 0–23. @default 9 */
  handoffHour?: number;
  /** The moment the countdown and the now-line are drawn from, in ms — never read from the clock. @default defaultRotaNow */
  now?: number;
  /** Advance the countdown a minute at a time from `now` while the tab is visible and the rota is on screen. @default true */
  live?: boolean;
  /** Shift block finish: tinted fills, hairline outlines, or diagonal stripes in the holder's colour. @default "solid" */
  blockStyle?: RotaBlockStyle;
  /** The colour of overrides, the next handoff, the now-line and the roster pick. @default "cobalt" */
  accent?: RotaAccent;
  /** Whether the schedule has arrived. @default "ready" */
  status?: RotaStatus;
  /** Retry was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "On-call rota" */
  title?: string;
  /** The team named under the heading. @default "Fieldline platform" */
  team?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the roster and the fairness bars scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be swapped, painted or laid. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Monday 5 October 2026, midnight UTC. */
export const defaultRotaWeekStart = Date.UTC(2026, 9, 5);

/** Wednesday 7 October 2026, 06:48 UTC — two hours and twelve minutes before the handoff. */
export const defaultRotaNow = Date.UTC(2026, 9, 7, 6, 48);

export const defaultRotaPeople: RotaPerson[] = [
  { id: "ada", name: "Ada Okafor" },
  { id: "ruben", name: "Ruben Sato" },
  { id: "lena", name: "Lena Marsh" },
  { id: "dev", name: "Dev Anand" },
  { id: "sofia", name: "Sofia Brandt" },
  { id: "milo", name: "Milo Quist" },
];

// Fourteen days of each layer, Monday first; no one holds both on one day.
const PRIMARY =
  "ada ada ruben ruben lena lena lena dev dev sofia sofia milo milo ada".split(
    " ",
  );
const SECONDARY =
  "dev sofia sofia milo milo dev dev ruben lena lena ada ada ruben ruben".split(
    " ",
  );

/** Two weeks of Fieldline platform on-call: a primary and a secondary every day. */
export const defaultRotaShifts: RotaShift[] = [
  ...PRIMARY.map((person, day) => ({
    id: `p-${day}`,
    layer: "primary" as const,
    day,
    person,
  })),
  ...SECONDARY.map((person, day) => ({
    id: `s-${day}`,
    layer: "secondary" as const,
    day,
    person,
  })),
];

/** Lena covers Ada's Tuesday afternoon; Ruben takes the first hours of Milo's Friday. */
export const defaultRotaOverrides: RotaOverride[] = [
  { id: "ov-1", layer: "primary", day: 1, from: 5, to: 11, person: "lena" },
  { id: "ov-2", layer: "secondary", day: 4, from: 0, to: 6, person: "ruben" },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const SMALL_LABEL =
  "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const TONE_VAR: Record<RotaTone, string> = {
  accent: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  ink: "var(--ink-2)",
};

const TONE_CYCLE: RotaTone[] = [
  "accent",
  "signal",
  "warn",
  "success",
  "danger",
  "ink",
];

const ACCENTS: Record<RotaAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
  warn: "var(--warn)",
};

const LAYERS: RotaLayer[] = ["primary", "secondary"];
const LAYER_WORD: Record<RotaLayer, string> = {
  primary: "Primary",
  secondary: "Secondary",
};

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_SHORT = [
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

/** The pointer must travel this far before a press becomes a drag. */
const CAPTURE_PX = 4;
/** Hours a tap lays when painting, so a touch without a drag still shows. */
const TAP_HOURS = 4;
/** How long a conflict's recoil and flash are kept before the state clears. */
const KICK_MS = 700;
const LABEL_H = 18;
const SLOT_H = 56;
const CARD_TOP = 2;
const CARD_H = 30;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${r3(v * 100)}%`;
const pad2 = (n: number) => String(n).padStart(2, "0");
const noopSubscribe = () => () => {};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

const dateOf = (weekStart: number, day: number) =>
  new Date(weekStart + day * DAY);

/** "Tuesday 6" */
const dayLong = (weekStart: number, day: number) => {
  const d = dateOf(weekStart, day);
  return `${DAY_LONG[d.getUTCDay()] ?? ""} ${d.getUTCDate()}`;
};

/** "Mon 5 – Sun 11 Oct", with both months when the cycle crosses one. */
const rangeOf = (weekStart: number, days: number) => {
  const a = dateOf(weekStart, 0);
  const b = dateOf(weekStart, days - 1);
  const ma = MONTH_SHORT[a.getUTCMonth()] ?? "";
  const mb = MONTH_SHORT[b.getUTCMonth()] ?? "";
  const first = `${DAY_SHORT[a.getUTCDay()] ?? ""} ${a.getUTCDate()}${ma === mb ? "" : ` ${ma}`}`;
  return `${first} – ${DAY_SHORT[b.getUTCDay()] ?? ""} ${b.getUTCDate()} ${mb}`;
};

const fmtClock = (hour: number) => `${pad2(((hour % 24) + 24) % 24)}:00`;

/** "2h 12m", "48m", "3d 4h". */
const fmtCountdown = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

/** Whole hours a segment snaps to, coarser as the columns get narrower. */
const stepFor = (pxPerHour: number) =>
  pxPerHour >= 6 ? 1 : pxPerHour >= 3 ? 2 : pxPerHour >= 1.5 ? 4 : 6;

const slotKey = (layer: RotaLayer, day: number) => `${layer}:${day}`;
const other = (layer: RotaLayer): RotaLayer =>
  layer === "primary" ? "secondary" : "primary";

/** Who holds a layer at an hour of a day: the override there, else the shift's person. */
const holderAt = (
  layer: RotaLayer,
  day: number,
  hour: number,
  shifts: RotaShift[],
  overrides: RotaOverride[],
): string | null =>
  overrides.find(
    (o) => o.layer === layer && o.day === day && o.from <= hour && hour < o.to,
  )?.person ??
  shifts.find((s) => s.layer === layer && s.day === day)?.person ??
  null;

/** The person who would hold both layers at once on a day, if anyone. */
const doubleBooked = (
  day: number,
  shifts: RotaShift[],
  overrides: RotaOverride[],
): string | null => {
  for (let hour = 0; hour < 24; hour += 1) {
    const p = holderAt("primary", day, hour, shifts, overrides);
    const s = holderAt("secondary", day, hour, shifts, overrides);
    if (p !== null && p === s) return p;
  }
  return null;
};

const freshId = (prefix: string, taken: { id: string }[]) => {
  const ids = new Set(taken.map((t) => t.id));
  let n = taken.length + 1;
  while (ids.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
};

/**
 * Hours each person holds across the cycle's days: their shifts less the
 * hours handed away, plus the hours they cover for others. For hosts that
 * show the balance elsewhere.
 */
export const rotaHours = (
  people: RotaPerson[],
  shifts: RotaShift[],
  overrides: RotaOverride[],
  days: number,
): Record<string, number> => {
  const hours: Record<string, number> = {};
  for (const p of people) hours[p.id] = 0;
  for (const s of shifts) {
    if (s.day < 0 || s.day >= days) continue;
    const handed = overrides
      .filter((o) => o.layer === s.layer && o.day === s.day)
      .reduce((sum, o) => sum + (o.to - o.from), 0);
    hours[s.person] = (hours[s.person] ?? 0) + 24 - handed;
  }
  for (const o of overrides) {
    if (o.day < 0 || o.day >= days) continue;
    hours[o.person] = (hours[o.person] ?? 0) + (o.to - o.from);
  }
  return hours;
};

/* ----------------------------------------------------------------------- */
/*                             Small subcomponents                          */
/* ----------------------------------------------------------------------- */

function Avatar({
  initials,
  tone,
  className,
}: {
  initials: string;
  tone: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-mono text-[9px] font-semibold tracking-[0.02em] text-foreground",
        className,
      )}
      style={{
        background: `color-mix(in oklab, ${tone} 28%, var(--bg-2))`,
        borderColor: `color-mix(in oklab, ${tone} 60%, transparent)`,
      }}
    >
      {initials}
    </span>
  );
}

function Card({
  person,
  tone,
  blockStyle,
  wideNames,
  lifted,
}: {
  person: RotaPerson;
  tone: string;
  blockStyle: RotaBlockStyle;
  /** Names appear from 40rem for a week, 64rem for a fortnight. */
  wideNames: boolean;
  lifted: boolean;
}) {
  const stripes = `repeating-linear-gradient(135deg, color-mix(in oklab, ${tone} 18%, transparent) 0 3px, transparent 3px 9px)`;
  return (
    <div
      className={cn(
        "flex h-full items-center gap-1.5 rounded-2 border px-1 transition-shadow duration-200",
        blockStyle === "outline" && "border-transparent bg-transparent",
        blockStyle === "solid" && "border-transparent",
        blockStyle === "striped" && "border-hairline bg-surface-1",
        lifted &&
          "shadow-[0_10px_24px_-10px_color-mix(in_oklab,black_55%,transparent)]",
      )}
      style={{
        background:
          blockStyle === "solid"
            ? `color-mix(in oklab, ${tone} 20%, var(--bg-1))`
            : blockStyle === "striped"
              ? stripes
              : undefined,
        borderColor:
          blockStyle === "outline"
            ? `color-mix(in oklab, ${tone} 55%, transparent)`
            : undefined,
      }}
    >
      {blockStyle === "outline" ? (
        <span
          className="h-4 w-[3px] shrink-0 rounded-full"
          style={{ background: tone }}
        />
      ) : null}
      <Avatar
        initials={person.initials ?? initialsOf(person.name)}
        tone={tone}
        className="size-5 @min-[40rem]:size-6"
      />
      <span
        className={cn(
          "hidden min-w-0 truncate text-[11px] font-medium",
          wideNames ? "@min-[40rem]:inline" : "@min-[64rem]:inline",
        )}
      >
        {person.name.split(" ")[0]}
      </span>
    </div>
  );
}

const HATCH =
  "repeating-linear-gradient(45deg, color-mix(in oklab, var(--rp-accent) 70%, transparent) 0 2px, color-mix(in oklab, var(--rp-accent) 16%, transparent) 2px 6px)";

/**
 * A hatched span of hours on a shift's rail, in the accent, carrying its
 * cover's initials when it is wide enough to hold them.
 */
function Segment({
  initials,
  rejected = false,
  style,
  ...rest
}: {
  initials: string | null;
  rejected?: boolean;
} & HTMLMotionProps<"span">) {
  return (
    <motion.span
      {...rest}
      style={{ ...style, backgroundImage: HATCH }}
      className={cn(
        "absolute inset-y-0 flex items-center justify-center overflow-hidden border-x font-mono text-[9px] font-semibold text-foreground",
        rejected ? "border-danger" : "border-(--rp-accent)",
      )}
    >
      {initials ? (
        <span className="rounded-[2px] bg-card px-0.5 leading-none">
          {initials}
        </span>
      ) : null}
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Active = { layer: RotaLayer; day: number };

type Drag = {
  id: string;
  layer: RotaLayer;
  day: number;
  /** The card's offset from its slot, in px. */
  dx: number;
  /** The neighbour it would swap with: -1, 0 or 1. */
  dir: -1 | 0 | 1;
};

type Grab = Drag & {
  x0: number;
  captured: boolean;
};

type Carry = {
  id: string;
  layer: RotaLayer;
  day: number;
  /** The shifts before the pickup, for Escape. */
  origin: RotaShift[];
};

type Kick = {
  /** The card that recoils. */
  id: string | null;
  /** The slot that flashes. */
  slot: string;
  /** Where the recoil starts, in px. */
  from: number;
  seq: number;
};

type Draft = {
  layer: RotaLayer;
  day: number;
  from: number;
  to: number;
  person: string;
  mode: "paint" | "keys";
  rejected: boolean;
};

type Paint = {
  layer: RotaLayer;
  day: number;
  person: string;
  anchor: number;
  left: number;
  width: number;
  step: number;
  moved: boolean;
  from: number;
  to: number;
};

/**
 * A week — or a fortnight — of on-call shifts in two layers, a primary and a
 * secondary, each day a block carrying its holder's initials and name. A
 * block drags sideways to swap with its neighbour: the neighbour slides over
 * to make room on `springs.glide`, and on release both glide into their new
 * slots. A swap that would leave one person holding both layers at once is
 * refused — the block recoils back on `springs.recoil` while the slot flashes
 * — and nothing changes.
 *
 * Pick a person from the roster strip and the blocks become paint surfaces:
 * drag across the hours of a shift and a hatched override segment stretches
 * under the pointer, settling on `springs.flick` when it lands; a tap lays
 * four hours. The handoffs are tick marks along the day header, the next one
 * in the accent with a count-down beside the heading that advances once a
 * minute while the rota is on screen. Under the grid a fairness bar per
 * person glides to its new length after every change.
 *
 * The rota is a grid: arrows move among shifts, Space picks a block up and
 * Left/Right swap it along (Space drops, Escape puts it back), O starts an
 * override on the focused shift (arrows widen it, Shift+arrows narrow it,
 * Enter commits, Escape cancels), Delete clears a shift's overrides, and the
 * roster is a radio group. Every change is announced. Under reduced motion
 * nothing travels: blocks appear in their new slots with a cross-fade, the
 * segment and the bars change length at once, and a refused swap only flashes.
 */
export function PagerRota({
  people = defaultRotaPeople,
  shifts,
  defaultShifts = defaultRotaShifts,
  onShiftsChange,
  overrides,
  defaultOverrides = defaultRotaOverrides,
  onChange,
  onPick,
  weekStart = defaultRotaWeekStart,
  days: daysProp = 7,
  handoffHour = 9,
  now = defaultRotaNow,
  live = true,
  blockStyle = "solid",
  accent = "cobalt",
  status = "ready",
  onRetry,
  title = "On-call rota",
  team = "Fieldline platform",
  label,
  height = 540,
  disabled = false,
  className,
}: PagerRotaProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const rosterHintId = `${uid}-roster-hint`;

  const [ownShifts, setOwnShifts] = React.useState<RotaShift[]>(defaultShifts);
  const allShifts = shifts ?? ownShifts;
  const [ownOverrides, setOwnOverrides] =
    React.useState<RotaOverride[]>(defaultOverrides);
  const allOverrides = overrides ?? ownOverrides;

  const [picked, setPicked] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<Active>({
    layer: "primary",
    day: 0,
  });
  const [rosterActive, setRosterActive] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [carry, setCarry] = React.useState<Carry | null>(null);
  const [kick, setKick] = React.useState<Kick | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [colW, setColW] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);
  const [awake, setAwake] = React.useState(true);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so nothing already on the
  // page enters; true for cards and segments that mount later.
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  // A new `now` restarts the count from it.
  const [prevNow, setPrevNow] = React.useState(now);
  if (prevNow !== now) {
    setPrevNow(now);
    setElapsed(0);
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [rowsEl, setRowsEl] = React.useState<HTMLDivElement | null>(null);
  const cellNodes = React.useRef(new Map<string, HTMLDivElement>());
  const rosterNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const grab = React.useRef<Grab | null>(null);
  const paint = React.useRef<Paint | null>(null);
  const kickTimer = React.useRef<number | null>(null);
  const draftTimer = React.useRef<number | null>(null);
  const kickSeq = React.useRef(0);

  const ready = status === "ready";
  const inert = disabled || !ready;
  const accentColor = ACCENTS[accent] ?? ACCENTS.cobalt;
  const days = clamp(Math.round(daysProp) || 7, 1, 14);

  /* -------------------------------- data ------------------------------- */

  const byId = new Map(people.map((p) => [p.id, p]));
  const toneOf = (personId: string) => {
    const i = people.findIndex((p) => p.id === personId);
    const person = people[i];
    const tone =
      person?.tone ?? TONE_CYCLE[(i < 0 ? 0 : i) % TONE_CYCLE.length] ?? "ink";
    return TONE_VAR[tone];
  };
  const nameOf = (personId: string) => byId.get(personId)?.name ?? personId;
  const firstNameOf = (personId: string) => nameOf(personId).split(" ")[0];
  const initialsFor = (personId: string) =>
    byId.get(personId)?.initials ?? initialsOf(nameOf(personId));

  const shown = allShifts.filter((s) => s.day >= 0 && s.day < days);
  const shiftAt = new Map(shown.map((s) => [slotKey(s.layer, s.day), s]));
  const shownOverrides = allOverrides.filter(
    (o) => o.day >= 0 && o.day < days && o.to > o.from,
  );
  const overridesAt = (layer: RotaLayer, day: number) =>
    shownOverrides
      .filter((o) => o.layer === layer && o.day === day)
      .sort((a, b) => a.from - b.from);

  const hours = rotaHours(people, allShifts, allOverrides, days);
  const maxHours = Math.max(1, ...people.map((p) => hours[p.id] ?? 0));

  const start = weekStart + handoffHour * HOUR;
  const current = now + elapsed;
  let nextIdx = -1;
  for (let i = 0; i <= days; i += 1) {
    if (start + i * DAY > current) {
      nextIdx = i;
      break;
    }
  }
  const nextAt = nextIdx >= 0 ? start + nextIdx * DAY : null;
  const nowPos = (current - start) / DAY;
  const nowShown = nowPos >= 0 && nowPos <= days;
  const todayIdx = nowShown ? Math.floor(nowPos) : -1;
  const nextHolder =
    nextIdx >= 0 ? shiftAt.get(slotKey("primary", nextIdx)) : undefined;

  const step = stepFor(colW / 24);
  const clock = (hour: number) => fmtClock(handoffHour + hour);
  const pickedPerson = picked ? (byId.get(picked) ?? null) : null;

  /* ----------------------------- measuring ----------------------------- */

  React.useEffect(() => {
    if (!rowsEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width ?? 0;
      setColW((prev) => {
        const next = Math.floor(width / days);
        return prev === next ? prev : next;
      });
    });
    ro.observe(rowsEl);
    return () => ro.disconnect();
  }, [rowsEl, days]);

  /* ------------------------------ ticking ------------------------------ */

  // The count-down advances a minute at a time, and only while someone
  // could see it: a hidden tab or an off-screen rota stops the interval.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let visible = !document.hidden;
    let onScreen = true;
    const sync = () => setAwake(visible && onScreen);
    const onVisibility = () => {
      visible = !document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    let watcher: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        onScreen = Boolean(entry?.isIntersecting);
        sync();
      });
      watcher.observe(root);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      watcher?.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (!live || !awake || !ready) return;
    const id = window.setInterval(() => {
      setElapsed((e) => e + MINUTE);
    }, MINUTE);
    return () => window.clearInterval(id);
  }, [live, awake, ready]);

  React.useEffect(
    () => () => {
      if (kickTimer.current !== null) window.clearTimeout(kickTimer.current);
      if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    },
    [],
  );

  /* ------------------------------- changes ----------------------------- */

  const say = (text: string) => setAnnouncement(text);

  const setShifts = (next: RotaShift[], change: RotaShiftChange) => {
    if (shifts === undefined) setOwnShifts(next);
    onShiftsChange?.(next, change);
  };

  const setOverrides = (next: RotaOverride[], change: RotaOverrideChange) => {
    if (overrides === undefined) setOwnOverrides(next);
    onChange?.(next, change);
  };

  const pick = (id: string | null) => {
    setPicked(id);
    onPick?.(id ? (byId.get(id) ?? null) : null);
    if (id) {
      say(
        `Painting as ${nameOf(id)}. Drag across a shift's hours to lay an override.`,
      );
    } else say("Painting ended.");
  };

  const kickAt = (id: string | null, slot: string, from: number) => {
    kickSeq.current += 1;
    setKick({ id, slot, from, seq: kickSeq.current });
    if (kickTimer.current !== null) window.clearTimeout(kickTimer.current);
    kickTimer.current = window.setTimeout(() => {
      kickTimer.current = null;
      setKick(null);
    }, KICK_MS);
  };

  /** Swaps the shifts of two days in a layer; false when refused or nothing to swap. */
  const trySwap = (
    layer: RotaLayer,
    from: number,
    to: number,
    via: "drag" | "keys",
    dx = 0,
  ): boolean => {
    if (to < 0 || to >= days || to === from) return false;
    const a = shiftAt.get(slotKey(layer, from));
    const b = shiftAt.get(slotKey(layer, to));
    const moved = a ?? b;
    if (!moved) return false;
    const next = allShifts.map((s) =>
      s.layer !== layer
        ? s
        : s.day === from
          ? { ...s, day: to }
          : s.day === to
            ? { ...s, day: from }
            : s,
    );
    for (const day of [to, from]) {
      const clash = doubleBooked(day, next, allOverrides);
      if (clash) {
        kickAt(
          a?.id ?? null,
          slotKey(layer, from),
          via === "drag" ? dx : (to - from) * distances.step,
        );
        say(
          `Can't swap: ${nameOf(clash)} would hold both layers on ${dayLong(weekStart, day)}.`,
        );
        return false;
      }
    }
    setShifts(next, { kind: "swap", layer, from, to });
    say(
      a && b
        ? `${nameOf(a.person)} now ${layer} on ${dayLong(weekStart, to)}, ${nameOf(b.person)} on ${dayLong(weekStart, from)}.`
        : `${nameOf(moved.person)} moved to ${dayLong(weekStart, to)}, ${layer}.`,
    );
    return true;
  };

  const lay = (layer: RotaLayer, day: number, personId: string) => {
    if (inert || shiftAt.has(slotKey(layer, day))) return;
    const next: RotaShift[] = [
      ...allShifts,
      { id: freshId("shift", allShifts), layer, day, person: personId },
    ];
    const clash = doubleBooked(day, next, allOverrides);
    if (clash) {
      kickAt(null, slotKey(layer, day), 0);
      say(
        `Can't lay: ${nameOf(clash)} already holds the other layer on ${dayLong(weekStart, day)}.`,
      );
      return;
    }
    setShifts(next, { kind: "lay", layer, day, person: personId });
    say(`${nameOf(personId)} laid as ${layer} on ${dayLong(weekStart, day)}.`);
  };

  const clearSlot = (layer: RotaLayer, day: number) => {
    if (inert) return;
    const removed = overridesAt(layer, day);
    if (removed.length === 0) {
      say(`No overrides on ${dayLong(weekStart, day)}, ${layer}.`);
      return;
    }
    const ids = new Set(removed.map((o) => o.id));
    setOverrides(
      allOverrides.filter((o) => !ids.has(o.id)),
      { kind: "clear", layer, day, removed },
    );
    say(
      `Cleared ${removed.length === 1 ? "the override" : `${removed.length} overrides`} on ${dayLong(weekStart, day)}, ${layer}.`,
    );
  };

  const rejectDraft = (d: Draft, why: string) => {
    setDraft({ ...d, rejected: true });
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      draftTimer.current = null;
      setDraft(null);
    }, KICK_MS);
    say(why);
  };

  const commitDraft = (d: Draft) => {
    if (d.to - d.from <= 0) {
      setDraft(null);
      return;
    }
    for (let hour = d.from; hour < d.to; hour += 1) {
      const across = holderAt(
        other(d.layer),
        d.day,
        hour,
        allShifts,
        allOverrides,
      );
      if (across === d.person) {
        rejectDraft(
          d,
          `Can't cover: ${nameOf(d.person)} holds ${other(d.layer)} at ${clock(hour)} on ${dayLong(weekStart, d.day)}.`,
        );
        return;
      }
    }
    // The new segment takes its hours from any older ones it lies across.
    const kept = allOverrides.flatMap((o) => {
      if (o.layer !== d.layer || o.day !== d.day) return [o];
      if (o.to <= d.from || o.from >= d.to) return [o];
      const parts: RotaOverride[] = [];
      if (o.from < d.from) parts.push({ ...o, to: d.from });
      if (o.to > d.to) {
        parts.push({ ...o, id: freshId("ov", allOverrides), from: d.to });
      }
      return parts;
    });
    const override: RotaOverride = {
      id: freshId("ov", [...allOverrides, ...kept]),
      layer: d.layer,
      day: d.day,
      from: d.from,
      to: d.to,
      person: d.person,
    };
    setOverrides([...kept, override], { kind: "paint", override });
    setDraft(null);
    const holder = shiftAt.get(slotKey(d.layer, d.day));
    say(
      `${nameOf(d.person)} covers ${clock(d.from)} to ${clock(d.to)} on ${dayLong(weekStart, d.day)}${holder ? ` for ${nameOf(holder.person)}` : ""}.`,
    );
  };

  /* ------------------------------- pointer ----------------------------- */

  const cancelPointer = () => {
    if (grab.current) {
      grab.current = null;
      setDrag(null);
    }
    if (paint.current) {
      paint.current = null;
      setDraft((d) => (d && d.mode === "paint" && !d.rejected ? null : d));
    }
  };

  const hourAt = (p: Paint, clientX: number) =>
    clamp(
      Math.round((((clientX - p.left) / p.width) * 24) / p.step) * p.step,
      0,
      24,
    );

  const onSlotPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    layer: RotaLayer,
    day: number,
  ) => {
    if (inert || event.button !== 0) return;
    const shift = shiftAt.get(slotKey(layer, day));
    if (draft?.mode === "keys") return;
    if (picked) {
      if (!shift) return;
      if (shift.person === picked) {
        say(`${nameOf(picked)} already holds this shift.`);
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const s = stepFor(rect.width / 24);
      const p: Paint = {
        layer,
        day,
        person: picked,
        anchor: 0,
        left: rect.left,
        width: Math.max(1, rect.width),
        step: s,
        moved: false,
        from: 0,
        to: 0,
      };
      p.anchor = Math.min(hourAt(p, event.clientX), 24 - s);
      p.from = p.anchor;
      p.to = p.anchor + s;
      paint.current = p;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic press has no live pointer to capture.
      }
      setDraft({
        layer,
        day,
        from: p.from,
        to: p.to,
        person: picked,
        mode: "paint",
        rejected: false,
      });
      return;
    }
    if (!shift) return;
    grab.current = {
      id: shift.id,
      layer,
      day,
      dx: 0,
      dir: 0,
      x0: event.clientX,
      captured: false,
    };
  };

  const onSlotPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (g) {
      const raw = event.clientX - g.x0;
      if (!g.captured) {
        if (Math.abs(raw) < CAPTURE_PX) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A synthetic sweep has no live pointer to capture.
        }
        g.captured = true;
        setCarry(null);
      }
      const edge = (g.day === 0 && raw < 0) || (g.day === days - 1 && raw > 0);
      const dx = edge ? raw * 0.3 : raw;
      let dir: -1 | 0 | 1 =
        colW > 0 && raw > colW / 2 ? 1 : colW > 0 && raw < -colW / 2 ? -1 : 0;
      if (g.day + dir < 0 || g.day + dir >= days) dir = 0;
      g.dx = dx;
      g.dir = dir;
      setDrag({ id: g.id, layer: g.layer, day: g.day, dx, dir });
      return;
    }
    const p = paint.current;
    if (p) {
      const cur = hourAt(p, event.clientX);
      if (cur !== p.anchor) p.moved = true;
      let from = Math.min(p.anchor, cur);
      let to = Math.max(p.anchor, cur);
      if (to - from < p.step) {
        to = Math.min(24, from + p.step);
        from = to - p.step;
      }
      p.from = from;
      p.to = to;
      setDraft((d) => (d && d.mode === "paint" ? { ...d, from, to } : d));
    }
  };

  const onSlotPointerUp = () => {
    const g = grab.current;
    if (g) {
      grab.current = null;
      if (g.captured) {
        if (g.dir !== 0) trySwap(g.layer, g.day, g.day + g.dir, "drag", g.dx);
        setDrag(null);
      }
      return;
    }
    const p = paint.current;
    if (p) {
      paint.current = null;
      const to = p.moved ? p.to : Math.min(24, p.from + TAP_HOURS);
      commitDraft({
        layer: p.layer,
        day: p.day,
        from: p.from,
        to,
        person: p.person,
        mode: "paint",
        rejected: false,
      });
    }
  };

  /* ------------------------------ keyboard ----------------------------- */

  const focusCell = (layer: RotaLayer, day: number) => {
    setActive({ layer, day });
    cellNodes.current.get(slotKey(layer, day))?.focus({ preventScroll: true });
  };

  const startKeyDraft = (layer: RotaLayer, day: number) => {
    const shift = shiftAt.get(slotKey(layer, day));
    if (!shift) {
      say("No shift here to cover. Lay one first.");
      return;
    }
    if (picked === shift.person) {
      say(
        `${nameOf(shift.person)} already holds this shift. Pick someone else.`,
      );
      return;
    }
    const person =
      picked ?? people.find((p) => p.id !== shift.person)?.id ?? null;
    if (!person) return;
    const to = Math.min(24, Math.max(step, TAP_HOURS));
    setDraft({
      layer,
      day,
      from: 0,
      to,
      person,
      mode: "keys",
      rejected: false,
    });
    say(
      `Covering as ${nameOf(person)}, ${clock(0)} to ${clock(to)}. Arrows widen, Shift and arrows narrow, Enter commits, Escape cancels.`,
    );
  };

  const onDraftKey = (event: React.KeyboardEvent, d: Draft) => {
    if (d.rejected) return;
    let from = d.from;
    let to = d.to;
    switch (event.key) {
      case "ArrowRight":
        if (event.shiftKey) to = Math.max(from + step, to - step);
        else to = Math.min(24, to + step);
        break;
      case "ArrowLeft":
        if (event.shiftKey) from = Math.min(to - step, from + step);
        else from = Math.max(0, from - step);
        break;
      case "Home":
        from = 0;
        break;
      case "End":
        to = 24;
        break;
      case "Enter":
        event.preventDefault();
        commitDraft(d);
        return;
      case "Escape":
        event.preventDefault();
        setDraft(null);
        say("Override cancelled.");
        return;
      default:
        return;
    }
    event.preventDefault();
    if (from === d.from && to === d.to) return;
    setDraft({ ...d, from, to });
    say(`${clock(from)} to ${clock(to)}`);
  };

  const onCarryKey = (event: React.KeyboardEvent, c: Carry) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        event.preventDefault();
        const to = c.day + (event.key === "ArrowRight" ? 1 : -1);
        if (to < 0 || to >= days) return;
        if (trySwap(c.layer, c.day, to, "keys")) {
          setCarry({ ...c, day: to });
          focusCell(c.layer, to);
        }
        return;
      }
      case " ":
      case "Enter":
        event.preventDefault();
        setCarry(null);
        say(`Dropped on ${dayLong(weekStart, c.day)}.`);
        return;
      case "Escape": {
        event.preventDefault();
        const origin = c.origin.find((s) => s.id === c.id);
        const changed = allShifts.some((s) => {
          const was = c.origin.find((o) => o.id === s.id);
          return !was || was.day !== s.day || was.layer !== s.layer;
        });
        if (changed) setShifts(c.origin, { kind: "restore" });
        setCarry(null);
        if (origin) focusCell(origin.layer, origin.day);
        say("Put back.");
        return;
      }
      default:
    }
  };

  const onCellKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    layer: RotaLayer,
    day: number,
  ) => {
    if (draft?.mode === "keys") {
      onDraftKey(event, draft);
      return;
    }
    if (carry) {
      onCarryKey(event, carry);
      return;
    }
    const shift = shiftAt.get(slotKey(layer, day));
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusCell(layer, clamp(day + 1, 0, days - 1));
        return;
      case "ArrowLeft":
        event.preventDefault();
        focusCell(layer, clamp(day - 1, 0, days - 1));
        return;
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        focusCell(other(layer), day);
        return;
      case "Home":
        event.preventDefault();
        focusCell(layer, 0);
        return;
      case "End":
        event.preventDefault();
        focusCell(layer, days - 1);
        return;
      case " ":
        event.preventDefault();
        if (inert || !shift) return;
        setCarry({ id: shift.id, layer, day, origin: allShifts });
        say(
          `Picked up ${nameOf(shift.person)}. Left or Right swaps with a neighbour, Space drops, Escape puts it back.`,
        );
        return;
      case "Enter":
        event.preventDefault();
        if (inert) return;
        if (!shift) {
          if (picked) lay(layer, day, picked);
          else say("Open. Pick a person in the roster, then press Enter here.");
        }
        return;
      case "o":
      case "O":
        event.preventDefault();
        if (!inert) startKeyDraft(layer, day);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        clearSlot(layer, day);
        return;
      default:
    }
  };

  const onRosterKey = (event: React.KeyboardEvent, i: number) => {
    const n = people.length;
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    else if (event.key === "Escape" && picked) {
      event.preventDefault();
      pick(null);
      return;
    } else return;
    event.preventDefault();
    const target = people[(to + n) % n];
    if (!target) return;
    rosterNodes.current.get(target.id)?.focus();
    if (!inert) pick(target.id);
  };

  /* ------------------------------- render ------------------------------ */

  const activeCell =
    active.day < days ? active : { layer: active.layer, day: 0 };
  const rosterTab =
    rosterActive && byId.has(rosterActive)
      ? rosterActive
      : (picked ?? people[0]?.id ?? null);
  const cardsStep = cascade(Math.min(days * 2, 12));

  const describe = (layer: RotaLayer, day: number) => {
    const shift = shiftAt.get(slotKey(layer, day));
    const parts = [`${dayLong(weekStart, day)}, ${layer}`];
    parts.push(shift ? nameOf(shift.person) : "open");
    for (const o of overridesAt(layer, day)) {
      parts.push(
        `${nameOf(o.person)} covers ${clock(o.from)} to ${clock(o.to)}`,
      );
    }
    if (carry?.id === shift?.id && shift) parts.push("picked up");
    if (day === todayIdx) parts.push("today");
    return parts.join(", ");
  };

  const renderRow = (layer: RotaLayer, rowIndex: number) => {
    const cards = shown.filter((s) => s.layer === layer);
    return (
      <div
        key={layer}
        role="row"
        aria-rowindex={rowIndex + 2}
        className="relative"
        style={{ height: LABEL_H + SLOT_H }}
      >
        <div
          role="rowheader"
          className={cn(
            SMALL_LABEL,
            "absolute top-0 left-0 flex h-[18px] items-center gap-1.5",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              layer === "primary" ? "bg-foreground" : "bg-ink-3",
            )}
          />
          {LAYER_WORD[layer]}
        </div>

        {/* The holders. Visual only: the grid's cells are the slots below. */}
        <div aria-hidden className="absolute inset-0">
          {cards.map((shift, i) => {
            const person = byId.get(shift.person);
            if (!person) return null;
            // The dragged card's offset, or how far a neighbour slides over
            // to make room for it.
            const dragX = drag && drag.id === shift.id ? drag.dx : null;
            const roomX =
              drag &&
              drag.dir !== 0 &&
              drag.layer === layer &&
              shift.day === drag.day + drag.dir
                ? -drag.dir * colW
                : 0;
            const dragging = dragX !== null;
            const carried = carry?.id === shift.id;
            const kicked = kick?.id === shift.id ? kick : null;
            const x = !motionSafe
              ? 0
              : kicked
                ? [kicked.from, 0]
                : dragX !== null
                  ? dragX
                  : roomX;
            return (
              <motion.div
                key={motionSafe ? shift.id : `${shift.id}:${shift.day}`}
                initial={
                  mounted
                    ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                    : false
                }
                animate={{
                  opacity: 1,
                  y: 0,
                  x,
                  scale: dragging || carried ? 1.04 : 1,
                  left: pct(shift.day / days),
                }}
                transition={{
                  opacity: { duration: durations.base, ease: easings.enter },
                  y: motionSafe
                    ? { ...springs.glide, delay: r3(i * cardsStep) }
                    : { duration: 0 },
                  x: !motionSafe
                    ? { duration: 0 }
                    : kicked
                      ? springs.recoil
                      : dragging
                        ? { duration: 0 }
                        : springs.glide,
                  scale: motionSafe ? springs.snap : { duration: 0 },
                  left: motionSafe ? springs.glide : { duration: 0 },
                }}
                className="absolute"
                style={{
                  top: LABEL_H + CARD_TOP,
                  height: CARD_H,
                  width: pct(1 / days),
                  zIndex: dragging || carried ? 2 : 1,
                }}
              >
                <div className="mx-0.5 h-full">
                  <Card
                    person={person}
                    tone={toneOf(shift.person)}
                    blockStyle={blockStyle}
                    wideNames={days === 7}
                    lifted={dragging || carried}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>

        {Array.from({ length: days }, (_, day) => {
          const key = slotKey(layer, day);
          const shift = shiftAt.get(key);
          const slotOverrides = overridesAt(layer, day);
          const isActive = activeCell.layer === layer && activeCell.day === day;
          const target =
            drag !== null &&
            drag.dir !== 0 &&
            drag.layer === layer &&
            day === drag.day + drag.dir;
          const flashing = kick?.slot === key;
          const slotDraft =
            draft && draft.layer === layer && draft.day === day ? draft : null;
          const showInitials = (from: number, to: number) =>
            colW > 0 && (colW * (to - from)) / 24 >= 22;
          return (
            <div
              key={key}
              ref={(node) => {
                if (node) cellNodes.current.set(key, node);
                else cellNodes.current.delete(key);
              }}
              role="gridcell"
              aria-colindex={day + 1}
              aria-label={describe(layer, day)}
              aria-describedby={hintId}
              tabIndex={isActive ? 0 : -1}
              onFocus={() => setActive({ layer, day })}
              onKeyDown={(event) => onCellKey(event, layer, day)}
              onPointerDown={(event) => onSlotPointerDown(event, layer, day)}
              onPointerMove={onSlotPointerMove}
              onPointerUp={onSlotPointerUp}
              onPointerCancel={cancelPointer}
              onLostPointerCapture={cancelPointer}
              onClick={() => {
                if (inert || shift) return;
                if (picked) lay(layer, day, picked);
                else
                  say(
                    "Open. Pick a person in the roster, then press Enter here.",
                  );
              }}
              className={cn(
                "absolute z-[3] rounded-2 select-none",
                FOCUS_RING,
                inert
                  ? "cursor-default"
                  : picked
                    ? shift
                      ? "cursor-crosshair"
                      : "cursor-copy"
                    : shift
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-default",
                target &&
                  "outline-2 outline-offset-[-2px] outline-(--rp-accent) outline-dashed",
                flashing && "outline-2 outline-offset-[-2px] outline-danger",
              )}
              style={{
                top: LABEL_H,
                height: SLOT_H,
                left: pct(day / days),
                width: pct(1 / days),
                touchAction: "none",
              }}
            >
              {/* An open slot's placeholder, where no card is. */}
              <AnimatePresence initial={false}>
                {!shift ? (
                  <motion.span
                    key="open"
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                    className={cn(
                      "absolute inset-x-0.5 flex items-center justify-center rounded-2 border border-dashed border-hairline-strong font-mono text-[10px] text-ink-3",
                      picked && "border-(--rp-accent) text-(--rp-accent)",
                    )}
                    style={{ top: CARD_TOP, height: CARD_H }}
                  >
                    <span className="hidden @min-[40rem]:inline">
                      {picked ? "Lay" : "Open"}
                    </span>
                    <CalendarPlus className="size-3 @min-[40rem]:hidden" />
                  </motion.span>
                ) : null}
              </AnimatePresence>

              {/* The hour rail: the shift's 24 hours, with its overrides. */}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0.5 bottom-1 block overflow-hidden rounded-1 bg-surface-1",
                  !shift && "opacity-40",
                )}
                style={{ height: SLOT_H - CARD_TOP - CARD_H - 8 }}
              >
                {[0.25, 0.5, 0.75].map((f) => (
                  <span
                    key={f}
                    className="absolute inset-y-0 w-px bg-hairline"
                    style={{ left: pct(f) }}
                  />
                ))}
                <AnimatePresence initial={false}>
                  {slotOverrides.map((o) => (
                    <Segment
                      key={o.id}
                      initials={
                        showInitials(o.from, o.to)
                          ? initialsFor(o.person)
                          : null
                      }
                      initial={
                        mounted
                          ? { opacity: 0, scaleY: motionSafe ? 0.5 : 1 }
                          : false
                      }
                      animate={{
                        opacity: 1,
                        scaleY: 1,
                        left: pct(o.from / 24),
                        width: pct((o.to - o.from) / 24),
                      }}
                      exit={{
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={{
                        opacity: { duration: durations.fast },
                        scaleY: motionSafe ? springs.flick : { duration: 0 },
                        left: motionSafe ? springs.glide : { duration: 0 },
                        width: motionSafe ? springs.glide : { duration: 0 },
                      }}
                      style={{ originY: 1 }}
                    />
                  ))}
                </AnimatePresence>
                {slotDraft ? (
                  <Segment
                    key={`draft-${slotDraft.mode}`}
                    initials={
                      showInitials(slotDraft.from, slotDraft.to)
                        ? initialsFor(slotDraft.person)
                        : null
                    }
                    rejected={slotDraft.rejected}
                    initial={false}
                    animate={{
                      opacity: slotDraft.rejected ? 0.35 : 1,
                      left: pct(slotDraft.from / 24),
                      width: pct((slotDraft.to - slotDraft.from) / 24),
                      x:
                        slotDraft.rejected && motionSafe
                          ? [distances.step, 0]
                          : 0,
                    }}
                    transition={{
                      opacity: { duration: durations.fast },
                      x: springs.recoil,
                      // Keys widen on glide; a painted segment tracks the pointer.
                      left:
                        slotDraft.mode === "keys" && motionSafe
                          ? springs.glide
                          : { duration: 0 },
                      width:
                        slotDraft.mode === "keys" && motionSafe
                          ? springs.glide
                          : { duration: 0 },
                    }}
                  />
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const skeleton = (
    <div aria-hidden className="flex flex-col gap-3 px-4 pb-4">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: days }, (_, i) => (
          <span
            key={i}
            className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
      {LAYERS.map((layer, r) => (
        <div key={layer} className="flex flex-col gap-1">
          <span className="h-3 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: days }, (_, i) => (
              <span
                key={i}
                className="h-[52px] rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${(r * days + i) * 40}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="h-7 w-20 rounded-full bg-surface-2 motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
            style={{
              width: `${55 + ((i * 17) % 40)}%`,
              animationDelay: `${i * 90}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );

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
      style={{ height, ["--rp-accent" as string]: accentColor }}
    >
      <p id={hintId} className="sr-only">
        Arrows move among shifts. Space picks a block up; Left and Right then
        swap it with a neighbour, Space drops, Escape puts it back. O starts an
        override on the shift, arrows widen it, Enter commits. Delete clears the
        shift&apos;s overrides.
      </p>
      <p id={rosterHintId} className="sr-only">
        Pick who covers, then drag across a shift&apos;s hours or press O on it.
      </p>

      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className={cn(SMALL_LABEL, "truncate")}>
            {team} · {rangeOf(weekStart, days)} · handoffs{" "}
            {fmtClock(handoffHour)}
          </p>
        </div>
        {ready ? (
          <div className="flex shrink-0 flex-col items-end">
            <p className={SMALL_LABEL}>Next handoff</p>
            {nextAt !== null ? (
              <p className="flex items-center gap-1 font-mono text-[12px] tabular-nums">
                <Clock3 aria-hidden className="size-3 text-(--rp-accent)" />
                <span className="hidden text-ink-2 @min-[30rem]:inline">
                  {DAY_SHORT[new Date(nextAt).getUTCDay()]}{" "}
                  {fmtClock(handoffHour)} ·
                </span>
                <span className="text-foreground">
                  in {fmtCountdown(nextAt - current)}
                </span>
                {nextHolder ? (
                  <span className="hidden text-ink-3 @min-[40rem]:inline">
                    · {firstNameOf(nextHolder.person)} takes primary
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="font-mono text-[12px] text-ink-3">
                none left this cycle
              </p>
            )}
          </div>
        ) : null}
      </header>

      {status === "loading" ? (
        skeleton
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The schedule didn&apos;t load.
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
      ) : allShifts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <CalendarPlus aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-foreground">No schedule yet.</p>
          <p className="max-w-[28ch] text-[12px] text-ink-2">
            Lay the first shift and fill the rest from the roster.
          </p>
          <button
            type="button"
            onClick={() => {
              const first = people[0];
              if (first) lay("primary", 0, first.id);
            }}
            aria-disabled={inert || people.length === 0 || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs text-primary-foreground transition-opacity",
              (inert || people.length === 0) && "cursor-default opacity-60",
              FOCUS_RING,
            )}
          >
            Lay the first shift
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            role="grid"
            aria-label={`${title}, shifts`}
            aria-rowcount={3}
            aria-colcount={days}
            className="shrink-0 px-4 pb-2"
          >
            {/* Day header, with a tick at every handoff. */}
            <div
              role="row"
              aria-rowindex={1}
              className="relative grid h-7"
              style={{
                gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: days }, (_, day) => (
                <div
                  key={day}
                  role="columnheader"
                  aria-colindex={day + 1}
                  className={cn(
                    SMALL_LABEL,
                    "truncate px-0.5 text-center",
                    day === todayIdx && "text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      days === 14 ? "hidden @min-[40rem]:inline" : "inline",
                    )}
                  >
                    {DAY_SHORT[dateOf(weekStart, day).getUTCDay()]}{" "}
                  </span>
                  {dateOf(weekStart, day).getUTCDate()}
                </div>
              ))}
              {Array.from({ length: days + 1 }, (_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={cn(
                    "absolute bottom-0 -translate-x-1/2",
                    i === nextIdx
                      ? "h-2.5 w-[2px] bg-(--rp-accent)"
                      : "h-1.5 w-px bg-hairline-strong",
                  )}
                  style={{ left: pct(i / days) }}
                />
              ))}
            </div>

            <div ref={setRowsEl} className="relative flex flex-col gap-1">
              {nowShown ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 z-[4] w-px bg-(--rp-accent)"
                  style={{ left: pct(nowPos / days) }}
                >
                  <span className="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-(--rp-accent)" />
                </span>
              ) : null}
              {LAYERS.map((layer, i) => renderRow(layer, i))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hairline">
            {/* Roster: who paints. */}
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
              <span className={cn(SMALL_LABEL, "flex items-center gap-1")}>
                <Paintbrush aria-hidden className="size-3" />
                <span className="hidden @min-[30rem]:inline">Cover as</span>
              </span>
              <div
                role="radiogroup"
                aria-label="Cover as"
                aria-describedby={rosterHintId}
                className="flex flex-wrap items-center gap-1.5"
              >
                {people.map((person, i) => {
                  const on = picked === person.id;
                  return (
                    <button
                      key={person.id}
                      ref={(node) => {
                        if (node) rosterNodes.current.set(person.id, node);
                        else rosterNodes.current.delete(person.id);
                      }}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={`${person.name}, ${hours[person.id] ?? 0} hours`}
                      aria-disabled={inert || undefined}
                      tabIndex={rosterTab === person.id ? 0 : -1}
                      onFocus={() => setRosterActive(person.id)}
                      onKeyDown={(event) => onRosterKey(event, i)}
                      onClick={() => {
                        if (inert) return;
                        pick(on ? null : person.id);
                      }}
                      className={cn(
                        "relative flex h-7 items-center gap-1.5 rounded-full border border-hairline-strong pr-2.5 pl-1 text-[11px] transition-colors",
                        on
                          ? "text-foreground"
                          : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                        inert ? "cursor-default" : "cursor-pointer",
                        FOCUS_RING,
                      )}
                    >
                      {on ? (
                        <motion.span
                          aria-hidden
                          layoutId={motionSafe ? `${uid}-pick` : undefined}
                          transition={springs.snap}
                          className="absolute -inset-px rounded-full border-2 border-(--rp-accent)"
                        />
                      ) : null}
                      <Avatar
                        initials={person.initials ?? initialsOf(person.name)}
                        tone={toneOf(person.id)}
                        className="size-5"
                      />
                      <span className="hidden @min-[40rem]:inline">
                        {person.name.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
              <AnimatePresence>
                {pickedPerson ? (
                  <motion.div
                    key="painting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-ink-2"
                  >
                    <span className="hidden @min-[48rem]:inline">
                      Drag across a shift&apos;s hours
                    </span>
                    <button
                      type="button"
                      onClick={() => pick(null)}
                      aria-label="Stop painting"
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Fairness: hours each person holds this cycle. */}
            <div className="px-4 pt-1 pb-4">
              <p className={cn(SMALL_LABEL, "mb-2")}>
                Hours this cycle · {days} days
              </p>
              <ul
                role="list"
                aria-label="Hours this cycle"
                className="grid grid-cols-1 gap-x-6 gap-y-1.5 @min-[36rem]:grid-cols-2"
              >
                {people.map((person) => {
                  const h = hours[person.id] ?? 0;
                  return (
                    <li
                      key={person.id}
                      className="grid grid-cols-[1.25rem_minmax(0,5.5rem)_minmax(0,1fr)_2.5rem] items-center gap-2 @min-[40rem]:grid-cols-[1.25rem_minmax(0,7rem)_minmax(0,1fr)_2.5rem]"
                    >
                      <Avatar
                        initials={person.initials ?? initialsOf(person.name)}
                        tone={toneOf(person.id)}
                        className="size-5"
                      />
                      <span className="truncate text-[11px]">
                        <span className="@min-[40rem]:hidden">
                          {person.name.split(" ")[0]}
                        </span>
                        <span className="hidden @min-[40rem]:inline">
                          {person.name}
                        </span>
                      </span>
                      <span
                        role="meter"
                        aria-label={`${person.name}, hours this cycle`}
                        aria-valuemin={0}
                        aria-valuemax={maxHours}
                        aria-valuenow={h}
                        aria-valuetext={`${h} hours`}
                        className="relative block h-2 overflow-hidden rounded-full bg-surface-2"
                      >
                        <motion.span
                          initial={false}
                          animate={{ width: pct(h / maxHours) }}
                          transition={
                            motionSafe ? springs.glide : { duration: 0 }
                          }
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{
                            background: `color-mix(in oklab, ${toneOf(person.id)} 70%, var(--bg-2))`,
                          }}
                        />
                      </span>
                      <span className="text-right font-mono text-[11px] text-ink-2 tabular-nums">
                        {h}h
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
