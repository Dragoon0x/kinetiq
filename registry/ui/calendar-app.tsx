"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  PanelLeft,
  RotateCcw,
  Trash2,
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";
import {
  MeetingCard,
  type MeetingAgendaItem,
  type MeetingAttendee,
} from "@/registry/ui/meeting-card";
import {
  defaultWeekCalendars,
  WeekPlanner,
  type WeekCalendar,
  type WeekEvent,
} from "@/registry/ui/week-planner";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type CalendarView = "month" | "week";
export type CalendarDrawer = "side" | "over" | "sheet";
export type CalendarDensity = "compact" | "cozy" | "roomy";
export type CalendarStatus = "ready" | "loading" | "error";

/** A week-planner event, plus what the drawer shows about it. */
export type CalendarEvent = WeekEvent & {
  /** Who is invited. An event with attendees opens as a meeting card. */
  attendees?: MeetingAttendee[];
  /** The meeting's running order. */
  agenda?: MeetingAgendaItem[];
  /** A line or two under the details. */
  notes?: string;
};

export type CalendarAppProps = {
  /** Controlled view: the month, or the focused day's week. */
  view?: CalendarView;
  /** Initial view when uncontrolled. @default "month" */
  defaultView?: CalendarView;
  /** Fires from the switch, a day's number or the keyboard that changed the view. */
  onViewChange?: (view: CalendarView) => void;
  /** How the event drawer arrives: docked at the right (the calendar narrows), over the calendar above a scrim, or as a sheet from the bottom. A phone always uses the sheet. @default "side" */
  drawer?: CalendarDrawer;
  /** Month chips (two, three with times, or three filled), row spacing, and the week's hour height. @default "cozy" */
  density?: CalendarDensity;
  /** Controlled events. */
  events?: CalendarEvent[];
  /** Initial events when uncontrolled. @default defaultCalendarEvents */
  defaultEvents?: CalendarEvent[];
  /** Fires from the drag, edit, creation or deletion that changed the events, with all of them. */
  onEventsChange?: (events: CalendarEvent[]) => void;
  /** The calendars events belong to, with their tints. @default defaultCalendarCalendars */
  calendars?: WeekCalendar[];
  /** Controlled hidden calendar ids. */
  hidden?: string[];
  /** Initially hidden calendars when uncontrolled. @default [] */
  defaultHidden?: string[];
  onHiddenChange?: (ids: string[]) => void;
  /** Controlled focused day (any moment in it): the month and the week shown, and the agenda. */
  day?: Date | number;
  /** Initial focused day when uncontrolled. @default the day of `now` */
  defaultDay?: Date | number;
  /** Fires with the new day's midnight (epoch ms). */
  onDayChange?: (day: number) => void;
  /** Controlled event in the drawer, or null. */
  selected?: string | null;
  /** Initial event in the drawer when uncontrolled. @default null */
  defaultSelected?: string | null;
  onSelectedChange?: (id: string | null) => void;
  /** The current moment (Date or ms): today, the now line, the agenda's Now and countdowns. @default defaultCalendarNow */
  now?: Date | number;
  /** Minutes east of UTC that times are shown in, so server and browser agree. @default 0 */
  zoneOffset?: number;
  /** 1 starts weeks on Monday, 0 on Sunday. @default 1 */
  weekStartsOn?: 0 | 1;
  /** An event was drawn or added in the week. */
  onCreate?: (event: CalendarEvent) => void;
  /** An event was deleted, from the drawer or the week. */
  onDelete?: (event: CalendarEvent) => void;
  /** The viewer joined (true) or left a meeting from its card. */
  onJoinedChange?: (id: string, joined: boolean) => void;
  /** Loading draws placeholder chips; error offers Retry. @default "ready" */
  status?: CalendarStatus;
  onRetry?: () => void;
  /** The screen's accessible name. @default "Calendar" */
  label?: string;
  /** Play the morph, the drawer and the day cursor's ticks. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be moved, made or deleted. */
  disabled?: boolean;
  /** Classes for the root. It is 560px tall by default; pass a height class to change it. */
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Defaults: Gaugeworks' product team in October 2026                   */
/* ------------------------------------------------------------------ */

const MIN = 60_000;
const DAY = 86_400_000;

/** Friday 2 October 2026, 10:20 UTC: ten minutes before the design review. */
export const defaultCalendarNow = Date.UTC(2026, 9, 2, 10, 20);

export const defaultCalendarCalendars: WeekCalendar[] = [
  ...defaultWeekCalendars,
  { id: "team", label: "Team", tint: "var(--signal)" },
];

const person = (id: string, name: string): MeetingAttendee => ({
  id,
  name,
  joinedAt: null,
});
const P = {
  amara: person("amara", "Amara Osei"),
  priya: person("priya", "Priya Nandakumar"),
  jun: person("jun", "Jun Takeda"),
  lina: person("lina", "Lina Moreau"),
  rae: person("rae", "Rae Okafor"),
  tomas: person("tomas", "Tomas Ilunga"),
};

const ev = (
  id: string,
  title: string,
  month: number,
  date: number,
  from: string,
  to: string,
  calendar: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => {
  const t = (s: string) => {
    const [h = "0", m = "0"] = s.split(":");
    return Date.UTC(2026, month - 1, date, Number(h), Number(m));
  };
  return { id, title, start: t(from), end: t(to), calendar, ...extra };
};

/** Mondays, Wednesdays and Fridays from 28 September to 30 October. */
const standUps: CalendarEvent[] = Array.from({ length: 35 }, (_, i) => i)
  .map((i) => Date.UTC(2026, 8, 28 + i))
  .filter((ms) => [1, 3, 5].includes(new Date(ms).getUTCDay()))
  .map((ms) => {
    const d = new Date(ms);
    return ev(
      `standup-${d.getUTCMonth() + 1}-${d.getUTCDate()}`,
      "Stand-up",
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      "09:30",
      "09:45",
      "team",
      { location: "Studio" },
    );
  });

export const defaultCalendarEvents: CalendarEvent[] = [
  ...standUps,
  ev("roadmap", "Q4 roadmap", 9, 28, "10:00", "12:00", "focus"),
  ev("vendor", "Basinworks vendor call", 9, 28, "15:00", "16:00", "work", {
    location: "Room 2",
    attendees: [P.amara, P.rae],
    agenda: [
      {
        id: "units",
        title: "Logger unit count",
        minutes: 20,
        owner: "Amara Osei",
      },
      { id: "kit", title: "Calibration kit", minutes: 20, owner: "Rae Okafor" },
      { id: "terms", title: "Lead time and terms", minutes: 20 },
    ],
  }),
  ev("critique", "Pricing page critique", 9, 29, "11:00", "12:30", "work", {
    location: "Studio",
  }),
  ev("focus-29", "Focus block", 9, 29, "15:30", "17:30", "focus"),
  ev("audit", "Coldbrook Bank audit window", 9, 30, "10:00", "11:30", "work"),
  ev("one-priya", "1:1 with Priya", 9, 30, "14:00", "14:30", "work", {
    attendees: [P.priya],
    agenda: [
      {
        id: "hiring",
        title: "Design hiring",
        minutes: 15,
        owner: "Priya Nandakumar",
      },
      { id: "growth", title: "Growth plan", minutes: 15 },
    ],
  }),
  ev("climb-30", "Climbing", 9, 30, "18:00", "19:30", "personal", {
    location: "North wall",
  }),
  ev("pricing", "Pricing page", 10, 1, "10:00", "11:30", "focus"),
  ev("lunch-1", "Lunch", 10, 1, "12:00", "12:45", "personal"),
  ev("waylight", "Waylight Pay check-in", 10, 1, "14:30", "15:15", "work", {
    attendees: [P.amara, P.tomas],
    agenda: [
      {
        id: "payouts",
        title: "September payouts",
        minutes: 25,
        owner: "Amara Osei",
      },
      {
        id: "api",
        title: "Webhook retries",
        minutes: 20,
        owner: "Tomas Ilunga",
      },
    ],
  }),
  ev("dentist", "Dentist", 10, 1, "16:30", "17:15", "personal"),
  ev("review", "Design review", 10, 2, "10:30", "11:15", "work", {
    location: "Fern room · video",
    attendees: [P.priya, P.lina, P.rae, P.jun, P.amara],
    agenda: [
      {
        id: "goals",
        title: "Goals for the review",
        minutes: 5,
        owner: "Priya Nandakumar",
      },
      {
        id: "search",
        title: "Search results page",
        minutes: 15,
        owner: "Lina Moreau",
      },
      {
        id: "nav",
        title: "Phone navigation",
        minutes: 10,
        owner: "Rae Okafor",
      },
      {
        id: "a11y",
        title: "Accessibility pass",
        minutes: 10,
        owner: "Jun Takeda",
      },
      { id: "owners", title: "Decisions and owners", minutes: 5 },
    ],
    notes:
      "Bring the pricing comparison on a phone. Recording goes to the design channel.",
  }),
  ev("demo", "Sprint demo", 10, 2, "14:00", "15:00", "team", {
    location: "Studio",
    attendees: [P.priya, P.jun, P.tomas, P.lina],
    agenda: [
      { id: "maps", title: "Offline maps", minutes: 20, owner: "Jun Takeda" },
      {
        id: "sync",
        title: "Quieter sync badge",
        minutes: 20,
        owner: "Tomas Ilunga",
      },
      { id: "qa", title: "Questions", minutes: 20 },
    ],
  }),
  ev("retro-2", "Retro", 10, 2, "15:30", "16:15", "team"),
  ev("climb-2", "Climbing", 10, 2, "18:00", "19:30", "personal", {
    location: "North wall",
  }),
  ev("market", "Farmers market", 10, 3, "10:00", "11:00", "personal"),
  ev("planning", "Sprint planning", 10, 5, "10:00", "11:30", "team"),
  ev("gauge-sync", "Gaugeworks sync", 10, 5, "14:00", "14:45", "work"),
  ev("interview", "Interview: data engineer", 10, 6, "11:30", "12:15", "work"),
  ev("focus-6", "Focus block", 10, 6, "15:00", "17:00", "focus"),
  ev("field", "Field visit: North basin", 10, 7, "09:00", "15:00", "team", {
    location: "Basin Road",
  }),
  ev("board", "Board prep", 10, 8, "13:00", "14:30", "work"),
  ev("freeze", "3.1 freeze", 10, 9, "17:00", "17:30", "team"),
  ev("dinner", "Dinner with Amara", 10, 9, "19:00", "21:00", "personal"),
  ev("quarterly", "Quarterly review", 10, 12, "10:00", "12:00", "work"),
  ev("dentist-2", "Dentist follow-up", 10, 13, "08:30", "09:00", "personal"),
  ev("renewal", "Coldbrook Bank renewal", 10, 14, "15:00", "16:00", "work"),
  ev("climb-14", "Climbing", 10, 14, "18:00", "19:30", "personal"),
  ev("release", "Release 3.1", 10, 15, "10:00", "11:00", "team"),
  ev("offsite", "Offsite day", 10, 16, "09:00", "17:00", "team", {
    location: "Fernworks loft",
  }),
  ev("review-19", "Design review", 10, 19, "10:30", "11:15", "work"),
  ev("hiring", "Hiring sync", 10, 21, "13:00", "13:30", "work"),
  ev("qbr", "Waylight Pay review", 10, 22, "11:00", "12:00", "work"),
  ev("retro-23", "Retro", 10, 23, "15:30", "16:15", "team"),
  ev("hike", "Hike", 10, 24, "08:00", "13:00", "personal"),
  ev("roadmap-26", "Roadmap review", 10, 26, "14:00", "15:30", "focus"),
  ev("climb-28", "Climbing", 10, 28, "18:00", "19:30", "personal"),
  ev("budget", "Budget close", 10, 29, "10:00", "11:00", "work"),
  ev("lunch-30", "Team lunch", 10, 30, "12:00", "13:30", "team"),
];

/* ------------------------------------------------------------------ */
/* Look and helpers                                                     */
/* ------------------------------------------------------------------ */

type Mode = "phone" | "tablet" | "desktop";
type Said = { n: number; text: string };

const PHONE_MAX = 640;
const DESKTOP_MIN = 1040;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const TOOL = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  FOCUS,
);

type DensitySpec = {
  chips: number;
  chip: string;
  time: boolean;
  fill: boolean;
};
const DENSITY: Record<CalendarDensity, DensitySpec> = {
  compact: { chips: 2, chip: "h-4 text-[10px]", time: false, fill: false },
  cozy: { chips: 3, chip: "h-[18px] text-[11px]", time: true, fill: false },
  roomy: { chips: 3, chip: "h-5 text-[11px]", time: true, fill: true },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const toMs = (v: Date | number) => (typeof v === "number" ? v : v.getTime());
const pad2 = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const WD = "Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(
  " ",
);
const MONTHS =
  "January February March April May June July August September October November December".split(
    " ",
  );
const midnight = (ms: number, off: number) =>
  Math.floor((ms + off * MIN) / DAY) * DAY - off * MIN;
const partsOf = (ms: number, off: number) => {
  const d = new Date(ms + off * MIN);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    date: d.getUTCDate(),
    wd: d.getUTCDay(),
    minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
};
const dayAt = (y: number, m: number, date: number, off: number) =>
  Date.UTC(y, m, date) - off * MIN;
const hhmm = (ms: number, off: number) => {
  const p = partsOf(ms, off);
  return `${pad2(Math.floor(p.minute / 60))}:${pad2(p.minute % 60)}`;
};
const longDay = (ms: number, off: number) => {
  const p = partsOf(ms, off);
  return `${WD[p.wd]} ${p.date} ${MONTHS[p.m]}`;
};
const shortDay = (ms: number, off: number) => {
  const p = partsOf(ms, off);
  return `${(WD[p.wd] ?? "").slice(0, 3)} ${p.date} ${(MONTHS[p.m] ?? "").slice(0, 3)}`;
};
const panOf = (el?: Element | null) => {
  const rect = el?.getBoundingClientRect();
  return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
};
const inMinutes = (ms: number) => {
  const m = Math.round(ms / MIN);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `in ${h} h ${m % 60} min` : `in ${h} h`;
};

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

type ChipFocus = { day: number; index: number } | null;
type Morph = "in" | "out" | null;

/**
 * A complete calendar screen: a month grid and week-planner's week that
 * morph into each other, a sidebar with a mini month, the calendars and the
 * day ahead, and an event drawer with meeting-card in it. The week you are
 * in is a row of the month, so going to Week grows that row to fill the grid
 * on glide while the other weeks fold away around it, then the planner
 * cross-fades in over it; going back shrinks the row into its month. The
 * view switch's pill travels on snap, and a new month slides in from 16px.
 *
 * Choosing an event docks the drawer at the right on glide, slides it over
 * the calendar, or raises it as a sheet whose handle pulls it down 1:1
 * (`drawer`). It holds the meeting card — countdown, faces, agenda, Join —
 * read against `now`, which also drives today, the agenda's Now and its
 * countdowns.
 *
 * The month is a real grid: arrows, Home, End and Page keys move the day,
 * Enter steps into its events. Under reduced motion the morph is a
 * cross-fade and the drawers fade in place; every date, chip and count still
 * changes.
 */
export function CalendarApp({
  view,
  defaultView = "month",
  onViewChange,
  drawer = "side",
  density = "cozy",
  events,
  defaultEvents,
  onEventsChange,
  calendars = defaultCalendarCalendars,
  hidden,
  defaultHidden,
  onHiddenChange,
  day,
  defaultDay,
  onDayChange,
  selected,
  defaultSelected = null,
  onSelectedChange,
  now = defaultCalendarNow,
  zoneOffset = 0,
  weekStartsOn = 1,
  onCreate,
  onDelete,
  onJoinedChange,
  status = "ready",
  onRetry,
  label = "Calendar",
  sound = false,
  disabled = false,
  className,
}: CalendarAppProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const nowMs = toMs(now);
  const off = zoneOffset;
  const dn = DENSITY[density] ?? DENSITY.cozy;
  const gridId = `${uid}-grid`;
  const hintId = `${uid}-hint`;
  const drawerHeadId = `${uid}-drawer`;
  const sideHeadId = `${uid}-side`;

  /* ------------------------------ the data ------------------------------ */

  const [ownEvents, setOwnEvents] = React.useState<CalendarEvent[]>(
    () => defaultEvents ?? defaultCalendarEvents,
  );
  const all = events ?? ownEvents;
  const allRef = React.useRef(all);
  React.useEffect(() => {
    allRef.current = all;
  }, [all]);
  const commit = (next: CalendarEvent[]) => {
    allRef.current = next;
    if (events === undefined) setOwnEvents(next);
    onEventsChange?.(next);
  };

  const [ownHidden, setOwnHidden] = React.useState<string[]>(
    () => defaultHidden ?? [],
  );
  const hiddenIds = hidden ?? ownHidden;
  const visible = all.filter(
    (e) => !e.calendar || !hiddenIds.includes(e.calendar),
  );
  const tintOf = (id?: string) =>
    calendars.find((c) => c.id === id)?.tint ?? "var(--accent-bright)";
  const calendarOf = (id?: string) => calendars.find((c) => c.id === id);

  const today = midnight(nowMs, off);
  const [ownDay, setOwnDay] = React.useState(() =>
    midnight(defaultDay !== undefined ? toMs(defaultDay) : nowMs, off),
  );
  const focusDay = midnight(day !== undefined ? toMs(day) : ownDay, off);
  const [ownView, setOwnView] = React.useState<CalendarView>(defaultView);
  const shownView = view ?? ownView;
  const [ownSel, setOwnSel] = React.useState<string | null>(defaultSelected);
  const selId = selected !== undefined ? selected : ownSel;
  const picked = selId ? all.find((e) => e.id === selId) : undefined;
  const [joined, setJoined] = React.useState<string[]>([]);

  const byDay = React.useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const e of visible) {
      const k = midnight(e.start, off);
      const list = map.get(k) ?? [];
      list.push(e);
      map.set(k, list);
    }
    for (const list of map.values())
      list.sort((a, b) => a.start - b.start || a.end - b.end);
    return map;
  }, [visible, off]);

  // The month around the focused day, as whole weeks.
  const fp = partsOf(focusDay, off);
  const monthStart = dayAt(fp.y, fp.m, 1, off);
  const lead = (partsOf(monthStart, off).wd - weekStartsOn + 7) % 7;
  const gridStart = monthStart - lead * DAY;
  const daysInMonth = new Date(Date.UTC(fp.y, fp.m + 1, 0)).getUTCDate();
  const weekCount = Math.ceil((lead + daysInMonth) / 7);
  const weeks = Array.from({ length: weekCount }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => gridStart + (w * 7 + i) * DAY),
  );
  const focusRow = Math.min(
    weekCount - 1,
    Math.max(0, Math.floor((focusDay - gridStart) / DAY / 7)),
  );
  const monthKey = fp.y * 12 + fp.m;
  const monthTitle = `${MONTHS[fp.m]} ${fp.y}`;
  const weekdayNames = Array.from(
    { length: 7 },
    (_, i) => WD[(i + weekStartsOn) % 7] ?? "",
  );

  /* ------------------------------ the frame ----------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    if (!root) return;
    const read = () => setWidth(Math.round(root.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);
  const W = width ?? 760;
  const mode: Mode =
    W < PHONE_MAX ? "phone" : W >= DESKTOP_MIN ? "desktop" : "tablet";
  const phone = mode === "phone";
  const desktop = mode === "desktop";
  const drawerMode: CalendarDrawer = phone ? "sheet" : drawer;
  const sideW = desktop ? 300 : 280;
  const overW = Math.min(desktop ? 340 : 320, W - 48);

  /* ------------------------------- state -------------------------------- */

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [chipFocus, setChipFocus] = React.useState<ChipFocus>(null);
  const [morph, setMorph] = React.useState<Morph>(null);
  const [slide, setSlide] = React.useState(1);
  const [miniMonth, setMiniMonth] = React.useState<number | null>(null);
  const [plannerPick, setPlannerPick] = React.useState<string | null>(null);

  const focusNext = React.useRef<(() => HTMLElement | null | undefined) | null>(
    null,
  );
  const opener = React.useRef<HTMLElement | null>(null);
  const sideOpener = React.useRef<HTMLElement | null>(null);
  const cells = React.useRef(new Map<number, HTMLDivElement>());
  const chips = React.useRef(new Map<string, HTMLButtonElement>());
  const creating = React.useRef<string | null>(null);
  const morphAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const sheetY = useMotionValue(0);

  React.useEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    const node = next();
    if (node?.isConnected && !node.closest("[inert]")) {
      node.focus({ preventScroll: true });
    }
  });

  // The morph: 0 is the month, 1 the focused week grown to fill the grid.
  const progress = useMotionValue(shownView === "week" ? 1 : 0);
  const otherGrow = useTransform(progress, (p) =>
    r2(Math.min(1, Math.max(0, 1 - p))),
  );
  // The morph is known in the render that switches the view, so the month
  // never leaves the screen for a frame before it starts to fold.
  const [seenView, setSeenView] = React.useState(shownView);
  if (seenView !== shownView) {
    setSeenView(shownView);
    setMorph(motionSafe ? (shownView === "week" ? "in" : "out") : null);
  }
  React.useEffect(() => {
    const target = shownView === "week" ? 1 : 0;
    morphAnim.current?.stop();
    if (Math.abs(progress.get() - target) < 0.001) return;
    if (!motionSafe) {
      progress.jump(target);
      return;
    }
    morphAnim.current = animate(progress, target, {
      ...springs.glide,
      onComplete: () => setMorph(null),
    });
  }, [shownView, motionSafe, progress]);
  React.useEffect(() => () => morphAnim.current?.stop(), []);

  /* ------------------------------- actions ------------------------------ */

  const swish = (up: boolean, by?: Element | null) =>
    audio.play("swish", { pitch: up ? 1.1 : 0.85, gain: 0.4, pan: panOf(by) });
  const tick = (ms: number, by?: Element | null) =>
    audio.play("tick", {
      pitch: r2(0.9 + partsOf(ms, off).wd * 0.06),
      gain: 0.3,
      pan: panOf(by),
    });

  const setDay = (ms: number) => {
    const d = midnight(ms, off);
    if (d === focusDay) return;
    const was = partsOf(focusDay, off);
    const is = partsOf(d, off);
    const delta = is.y * 12 + is.m - (was.y * 12 + was.m);
    if (delta !== 0) setSlide(delta > 0 ? 1 : -1);
    if (day === undefined) setOwnDay(d);
    onDayChange?.(d);
  };

  const setView = (next: CalendarView, by?: Element | null) => {
    if (next === shownView) return;
    swish(next === "week", by);
    if (view === undefined) setOwnView(next);
    onViewChange?.(next);
    setChipFocus(null);
    say(
      next === "week"
        ? `Week of ${longDay(focusDay - ((partsOf(focusDay, off).wd - weekStartsOn + 7) % 7) * DAY, off)}.`
        : `${monthTitle}.`,
    );
  };

  const setSel = (id: string | null) => {
    if (selected === undefined) setOwnSel(id);
    onSelectedChange?.(id);
  };

  const openEvent = (id: string, by?: HTMLElement | null) => {
    const e = allRef.current.find((x) => x.id === id);
    if (!e) return;
    if (!selId) swish(true, by);
    const at = document.activeElement;
    opener.current = by ?? (at instanceof HTMLElement ? at : null);
    sheetY.jump(0);
    setSel(id);
    setPlannerPick(null);
    focusNext.current = () => document.getElementById(drawerHeadId);
    say(
      `${e.title}, ${shortDay(e.start, off)}, ${hhmm(e.start, off)} to ${hhmm(e.end, off)}.`,
    );
  };

  const closeDrawer = (by?: Element | null) => {
    if (!selId) return;
    swish(false, by);
    const back = opener.current;
    const from = selId;
    opener.current = null;
    setSel(null);
    focusNext.current = () =>
      back?.isConnected && !back.closest("[inert]")
        ? back
        : (chips.current.get(from) ?? cells.current.get(focusDay) ?? null);
  };

  const removeEvent = (id: string) => {
    const e = allRef.current.find((x) => x.id === id);
    if (!e || disabled) return;
    commit(allRef.current.filter((x) => x.id !== id));
    onDelete?.(e);
    setSel(null);
    focusNext.current = () => cells.current.get(focusDay) ?? null;
    say(`Deleted ${e.title}.`);
  };

  const toggleCalendar = (id: string) => {
    const on = hiddenIds.includes(id);
    const next = on ? hiddenIds.filter((x) => x !== id) : [...hiddenIds, id];
    if (hidden === undefined) setOwnHidden(next);
    onHiddenChange?.(next);
    const c = calendarOf(id);
    say(`${c?.label ?? id} ${on ? "shown" : "hidden"}.`);
    if (picked && picked.calendar === id && !on) setSel(null);
  };

  const openSidebar = (by: HTMLElement) => {
    sideOpener.current = by;
    swish(true, by);
    setSidebarOpen(true);
    focusNext.current = () => document.getElementById(sideHeadId);
  };
  const closeSidebar = () => {
    if (!sidebarOpen) return;
    swish(false);
    setSidebarOpen(false);
    const back = sideOpener.current;
    focusNext.current = () => (back?.isConnected ? back : null);
  };

  const pickDay = (ms: number, by?: Element | null, fromSidebar = false) => {
    tick(ms, by);
    setDay(ms);
    setChipFocus(null);
    if (fromSidebar && !desktop) closeSidebar();
    const n = byDay.get(midnight(ms, off))?.length ?? 0;
    say(`${longDay(ms, off)}, ${plural(n, "event")}.`);
  };

  const zoomTo = (ms: number, by?: Element | null) => {
    setDay(ms);
    setView("week", by);
  };

  const onCellKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    ms: number,
  ) => {
    if (event.target !== event.currentTarget) return;
    let next: number | null = null;
    const p = partsOf(ms, off);
    const col = (p.wd - weekStartsOn + 7) % 7;
    switch (event.key) {
      case "ArrowLeft":
        next = ms - DAY;
        break;
      case "ArrowRight":
        next = ms + DAY;
        break;
      case "ArrowUp":
        next = ms - 7 * DAY;
        break;
      case "ArrowDown":
        next = ms + 7 * DAY;
        break;
      case "Home":
        next = ms - col * DAY;
        break;
      case "End":
        next = ms + (6 - col) * DAY;
        break;
      case "PageUp":
      case "PageDown": {
        const m = p.m + (event.key === "PageUp" ? -1 : 1);
        const last = new Date(Date.UTC(p.y, m + 1, 0)).getUTCDate();
        next = dayAt(p.y, m, Math.min(p.date, last), off);
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        const list = byDay.get(ms) ?? [];
        if (list.length === 0) {
          say(`${longDay(ms, off)}, no events.`);
          return;
        }
        setChipFocus({ day: ms, index: 0 });
        focusNext.current = () => chips.current.get(list[0]?.id ?? "");
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    if (next === null) return;
    const target = next;
    tick(target, event.currentTarget);
    setDay(target);
    focusNext.current = () => cells.current.get(target) ?? null;
    const n = byDay.get(target)?.length ?? 0;
    say(`${longDay(target, off)}, ${plural(n, "event")}.`);
  };

  const onChipKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    ms: number,
    index: number,
  ) => {
    const list = byDay.get(ms) ?? [];
    const go = (j: number) => {
      const t = list[Math.min(list.length - 1, Math.max(0, j))];
      if (!t) return;
      setChipFocus({ day: ms, index: j });
      focusNext.current = () => chips.current.get(t.id);
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(index + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(index - 1);
        return;
      case "Escape":
        // Handled here, where focus is: back to the day, not out of the screen.
        event.preventDefault();
        setChipFocus(null);
        cells.current.get(ms)?.focus();
        return;
    }
  };

  /* ------------------------------- parts -------------------------------- */

  const viewSwitch = (
    <div
      role="radiogroup"
      aria-label="View"
      onKeyDown={(event) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        const next = shownView === "month" ? "week" : "month";
        // Read now: React clears currentTarget once the handler returns.
        const group = event.currentTarget;
        setView(next, group);
        focusNext.current = () =>
          group.querySelector<HTMLElement>(`[data-view="${next}"]`);
      }}
      className="relative inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline bg-surface-1 p-0.5"
    >
      {(["month", "week"] as const).map((v) => {
        const on = v === shownView;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            data-view={v}
            tabIndex={on ? 0 : -1}
            onClick={(event) => setView(v, event.currentTarget)}
            className={cn(
              "relative inline-flex h-full items-center rounded-1 px-2.5 text-xs font-medium transition-colors",
              on ? "text-foreground" : "text-ink-3 hover:text-foreground",
              FOCUS_IN,
            )}
          >
            {on ? (
              <motion.span
                aria-hidden
                layoutId={`${idBase}-view`}
                className="absolute inset-0 rounded-1 bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative">{v === "month" ? "Month" : "Week"}</span>
          </button>
        );
      })}
    </div>
  );

  const toolbar = (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b border-hairline px-2 @min-[40rem]:gap-2 @min-[40rem]:px-3">
      {!desktop ? (
        <button
          type="button"
          aria-label="Calendars and agenda"
          aria-expanded={sidebarOpen}
          onClick={(event) => openSidebar(event.currentTarget)}
          className={TOOL}
        >
          <PanelLeft aria-hidden className="size-4" />
        </button>
      ) : null}
      {shownView === "month" ? (
        <>
          <button
            type="button"
            aria-label="Previous month"
            onClick={(event) => {
              const m = fp.m - 1;
              const last = new Date(Date.UTC(fp.y, m + 1, 0)).getUTCDate();
              pickDay(
                dayAt(fp.y, m, Math.min(fp.date, last), off),
                event.currentTarget,
              );
            }}
            className={cn(TOOL, phone && "size-7 @max-[19rem]:hidden")}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={(event) => {
              const m = fp.m + 1;
              const last = new Date(Date.UTC(fp.y, m + 1, 0)).getUTCDate();
              pickDay(
                dayAt(fp.y, m, Math.min(fp.date, last), off),
                event.currentTarget,
              );
            }}
            className={cn(TOOL, phone && "size-7 @max-[19rem]:hidden")}
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </>
      ) : null}
      <h2 className="min-w-0 flex-1 truncate pl-1 text-sm font-semibold tabular-nums">
        {phone ? `${(MONTHS[fp.m] ?? "").slice(0, 3)} ${fp.y}` : monthTitle}
      </h2>
      {shownView === "month" && !phone ? (
        <button
          type="button"
          onClick={(event) => pickDay(today, event.currentTarget)}
          disabled={focusDay === today}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
            FOCUS,
          )}
        >
          Today
        </button>
      ) : null}
      {viewSwitch}
    </div>
  );

  const chipRow = (
    e: CalendarEvent,
    ms: number,
    index: number,
    fill: boolean,
  ) => {
    const tint = tintOf(e.calendar);
    const inChips = chipFocus?.day === ms;
    const past = e.end <= nowMs;
    return (
      <li key={e.id}>
        <button
          ref={(node) => {
            if (!node) return;
            chips.current.set(e.id, node);
            return () => {
              if (chips.current.get(e.id) === node) chips.current.delete(e.id);
            };
          }}
          type="button"
          tabIndex={inChips && chipFocus?.index === index ? 0 : -1}
          aria-label={`${e.title}, ${hhmm(e.start, off)} to ${hhmm(e.end, off)}`}
          onClick={(event) => {
            event.stopPropagation();
            openEvent(e.id, event.currentTarget);
          }}
          onKeyDown={(event) => onChipKey(event, ms, index)}
          className={cn(
            "flex w-full items-center gap-1 overflow-hidden rounded-1 px-1 text-left leading-none transition-colors",
            dn.chip,
            fill ? "text-foreground" : "text-ink-2 hover:bg-surface-2",
            past && "opacity-60",
            selId === e.id && "ring-1 ring-cobalt-bright",
            FOCUS_IN,
          )}
          style={
            fill
              ? {
                  background: `color-mix(in oklab, ${tint} 18%, transparent)`,
                  boxShadow: `inset 2px 0 0 ${tint}`,
                }
              : undefined
          }
        >
          {fill ? null : (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: tint }}
            />
          )}
          {dn.time ? (
            <span className="hidden shrink-0 font-mono text-[10px] text-ink-3 tabular-nums @min-[50rem]/month:inline">
              {hhmm(e.start, off)}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate">{e.title}</span>
        </button>
      </li>
    );
  };

  const morphing = morph !== null;
  const monthGrid = (
    <div
      id={gridId}
      role="grid"
      aria-label={monthTitle}
      aria-describedby={hintId}
      aria-busy={status === "loading" || undefined}
      className="flex h-full flex-col"
    >
      <div
        role="row"
        className="grid shrink-0 grid-cols-7 border-b border-hairline"
      >
        {weekdayNames.map((name) => (
          <div
            key={name}
            role="columnheader"
            aria-label={name}
            className="py-1.5 text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {phone ? name.slice(0, 1) : name.slice(0, 3)}
          </div>
        ))}
      </div>
      <div className="@container/month relative flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={slide}>
          <motion.div
            key={monthKey}
            custom={slide}
            className="absolute inset-0 flex flex-col"
            variants={{
              enter: (s: number) => ({
                opacity: 0,
                x: motionSafe ? s * distances.shift : 0,
              }),
              rest: { opacity: 1, x: 0 },
              leave: (s: number) => ({
                opacity: 0,
                x: motionSafe ? -s * distances.shift : 0,
                transition: exitFor(durations.fast),
              }),
            }}
            initial="enter"
            animate="rest"
            exit="leave"
            transition={
              motionSafe
                ? { ...springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
          >
            {weeks.map((week, wi) => {
              const isFocusRow = wi === focusRow;
              return (
                <motion.div
                  key={week[0]}
                  role="row"
                  className="grid basis-0 grid-cols-7 overflow-hidden border-b border-hairline last:border-b-0"
                  style={{
                    flexGrow: isFocusRow ? 1 : otherGrow,
                    opacity: isFocusRow ? 1 : otherGrow,
                  }}
                >
                  {week.map((ms) => {
                    const p = partsOf(ms, off);
                    const inMonth = p.m === fp.m;
                    const isToday = ms === today;
                    const on = ms === focusDay;
                    const list = byDay.get(ms) ?? [];
                    const limit =
                      morphing || shownView === "week" ? 12 : dn.chips;
                    const shownChips = list.slice(0, limit);
                    const more = list.length - shownChips.length;
                    return (
                      <div
                        key={ms}
                        ref={(node) => {
                          if (!node) return;
                          // A month sliding out can share days with the one
                          // arriving: only a cell's own node is forgotten.
                          cells.current.set(ms, node);
                          return () => {
                            if (cells.current.get(ms) === node)
                              cells.current.delete(ms);
                          };
                        }}
                        role="gridcell"
                        tabIndex={on && !chipFocus ? 0 : -1}
                        aria-selected={on}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={`${longDay(ms, off)}, ${plural(list.length, "event")}`}
                        onClick={(event) => pickDay(ms, event.currentTarget)}
                        onKeyDown={(event) => onCellKey(event, ms)}
                        className={cn(
                          "relative flex flex-col gap-0.5 overflow-hidden border-r border-hairline p-1 text-left transition-colors last:border-r-0",
                          inMonth ? "" : "bg-surface-1/60",
                          on
                            ? "bg-[color-mix(in_oklab,var(--accent-bright)_7%,transparent)]"
                            : "hover:bg-surface-1",
                          FOCUS_IN,
                        )}
                      >
                        <span className="flex items-center justify-between">
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label={`Week of ${longDay(ms, off)}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              zoomTo(ms, event.currentTarget);
                            }}
                            className={cn(
                              "inline-flex size-6 items-center justify-center rounded-full font-mono text-[11px] tabular-nums transition-colors",
                              isToday
                                ? "bg-cobalt-bright font-semibold text-background"
                                : on
                                  ? "text-foreground ring-1 ring-cobalt-bright"
                                  : inMonth
                                    ? "text-ink-2 hover:bg-surface-2"
                                    : "text-ink-3 hover:bg-surface-2",
                            )}
                          >
                            {p.date}
                          </button>
                          {more > 0 && !phone ? (
                            <span className="pr-1 font-mono text-[10px] text-ink-3 tabular-nums">
                              +{more}
                            </span>
                          ) : null}
                        </span>
                        {status === "loading" ? (
                          (p.date * 7) % 3 === 0 ? (
                            <span
                              aria-hidden
                              className="mx-1 h-3 rounded-1 bg-surface-2"
                            />
                          ) : null
                        ) : phone ? (
                          list.length ? (
                            <span
                              aria-hidden
                              className="flex justify-center gap-0.5 pt-0.5"
                            >
                              {list.slice(0, 3).map((e) => (
                                <span
                                  key={e.id}
                                  className="size-1 rounded-full"
                                  style={{ background: tintOf(e.calendar) }}
                                />
                              ))}
                            </span>
                          ) : null
                        ) : (
                          <ul role="list" className="flex flex-col gap-0.5">
                            {shownChips.map((e, i) =>
                              chipRow(e, ms, i, dn.fill),
                            )}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
        {status === "error" ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center-safe justify-center-safe gap-2 bg-card/95 p-6 text-center">
            <p className="text-[13px] text-foreground">Events did not load.</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  const dayList = byDay.get(focusDay) ?? [];
  const nextUp = dayList.find((e) => e.start > nowMs);
  const agenda = (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2 px-3 pt-3 pb-1.5">
        <h3 className="truncate text-xs font-semibold">
          {focusDay === today
            ? `Today · ${shortDay(focusDay, off)}`
            : longDay(focusDay, off)}
        </h3>
        <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
          {plural(dayList.length, "event")}
        </span>
      </div>
      {dayList.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-ink-3">Nothing planned.</p>
      ) : (
        <motion.ul
          // The day arrives as one list; its rows never replay an entrance
          // when an edit re-sorts them.
          key={focusDay}
          role="list"
          aria-label="The day ahead"
          className="flex flex-col px-1.5 pb-2"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { ...springs.snap, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
        >
          {dayList.map((e) => {
            const live = e.start <= nowMs && nowMs < e.end;
            const past = e.end <= nowMs;
            const soon = nextUp?.id === e.id && e.start - nowMs < 6 * 60 * MIN;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={(event) => openEvent(e.id, event.currentTarget)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-2 px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2",
                    past && "opacity-55",
                    selId === e.id && "bg-cobalt-wash",
                    FOCUS_IN,
                  )}
                >
                  <span
                    aria-hidden
                    className="mt-0.5 h-8 w-[3px] shrink-0 rounded-full"
                    style={{ background: tintOf(e.calendar) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-5 font-medium text-foreground">
                      {e.title}
                    </span>
                    <span className="block truncate font-mono text-[11px] leading-4 text-ink-3 tabular-nums">
                      {hhmm(e.start, off)}–{hhmm(e.end, off)}
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                  </span>
                  {live ? (
                    <span className="mt-0.5 shrink-0 rounded-full bg-signal px-1.5 font-mono text-[10px] leading-4 font-semibold text-background">
                      Now
                    </span>
                  ) : soon && focusDay === today ? (
                    <span className="mt-0.5 shrink-0 font-mono text-[10px] leading-4 text-cobalt-bright tabular-nums">
                      {inMinutes(e.start - nowMs)}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </motion.ul>
      )}
    </div>
  );

  const shownMini = miniMonth ?? monthKey;
  const miniY = Math.floor(shownMini / 12);
  const miniM = shownMini % 12;
  const miniStart = dayAt(miniY, miniM, 1, off);
  const miniLead = (partsOf(miniStart, off).wd - weekStartsOn + 7) % 7;
  const miniDays = Array.from(
    { length: 42 },
    (_, i) => miniStart + (i - miniLead) * DAY,
  );
  const miniMonthView = (
    <div className="px-3 pt-3">
      <div className="flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold">
          {MONTHS[miniM]} {miniY}
        </p>
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMiniMonth(shownMini - 1)}
          className={cn(TOOL, "size-7")}
        >
          <ChevronLeft aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMiniMonth(shownMini + 1)}
          className={cn(TOOL, "size-7")}
        >
          <ChevronRight aria-hidden className="size-3.5" />
        </button>
      </div>
      <div
        role="group"
        aria-label={`${MONTHS[miniM]} ${miniY}`}
        className="mt-1 grid grid-cols-7"
      >
        {weekdayNames.map((n) => (
          <span
            key={n}
            aria-hidden
            className="flex h-6 items-center justify-center font-mono text-[9px] text-ink-3 uppercase"
          >
            {n.slice(0, 1)}
          </span>
        ))}
        {miniDays.map((ms) => {
          const p = partsOf(ms, off);
          const on = ms === focusDay;
          const has = (byDay.get(ms)?.length ?? 0) > 0;
          return (
            <button
              key={ms}
              type="button"
              aria-pressed={on}
              aria-label={`${longDay(ms, off)}${has ? ", has events" : ""}`}
              tabIndex={on ? 0 : -1}
              onClick={(event) => {
                setMiniMonth(null);
                pickDay(ms, event.currentTarget, true);
              }}
              onKeyDown={(event) => {
                const step =
                  event.key === "ArrowLeft"
                    ? -1
                    : event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowUp"
                        ? -7
                        : event.key === "ArrowDown"
                          ? 7
                          : 0;
                if (!step) return;
                event.preventDefault();
                const target = ms + step * DAY;
                // The group outlives the day buttons, which change with the
                // month; read it now, before React clears currentTarget.
                const group = event.currentTarget.parentElement;
                setMiniMonth(null);
                tick(target, event.currentTarget);
                setDay(target);
                focusNext.current = () =>
                  group?.querySelector<HTMLElement>("[aria-pressed='true']");
              }}
              className={cn(
                "relative flex h-7 flex-col items-center justify-center rounded-full font-mono text-[11px] tabular-nums transition-colors",
                p.m === miniM ? "text-ink-2" : "text-ink-3/60",
                ms === today && "font-semibold text-cobalt-bright",
                on ? "bg-cobalt-wash text-foreground" : "hover:bg-surface-2",
                FOCUS_IN,
              )}
            >
              {p.date}
              {has ? (
                <span
                  aria-hidden
                  className="absolute bottom-0.5 size-[3px] rounded-full bg-ink-3"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const calendarsList = (
    <div className="px-3 pt-3">
      <p className="pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        My calendars
      </p>
      <ul role="list" className="flex flex-col">
        {calendars.map((c) => {
          const on = !hiddenIds.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggleCalendar(c.id)}
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-2 px-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                <span
                  aria-hidden
                  className="flex size-4 shrink-0 items-center justify-center rounded-1 border-2 transition-colors"
                  style={{
                    borderColor: c.tint,
                    background: on ? c.tint : "transparent",
                  }}
                >
                  {on ? (
                    <svg viewBox="0 0 12 12" className="size-3 text-background">
                      <path
                        d="M2.5 6.2 5 8.5l4.5-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const sidebarBody = (
    <div className="flex flex-col pb-3">
      {miniMonthView}
      {calendarsList}
      <div className="mt-2 border-t border-hairline">{agenda}</div>
    </div>
  );

  /* ------------------------------ the drawer ---------------------------- */

  const sheetH = React.useRef(1);
  // One stable callback: a motion element binds its ref once.
  const bindSheet = React.useCallback((node: HTMLDivElement | null) => {
    if (node) sheetH.current = node.offsetHeight;
  }, []);
  const sheetAnim = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => () => sheetAnim.current?.stop(), []);
  const pull = useDrag({
    axis: "y",
    threshold: 4,
    disabled: !motionSafe,
    onStart: () => {
      sheetAnim.current?.stop();
    },
    onMove: ({ offset }) => {
      // Down follows 1:1; up resists past where it rests.
      sheetY.set(
        r2(
          offset.y >= 0
            ? offset.y
            : -rubberband(-offset.y, sheetH.current * 0.25),
        ),
      );
    },
    onEnd: ({ velocity }) => {
      const rest = project(sheetY.get(), velocity.y, 0.99);
      if (rest > sheetH.current * 0.4) {
        closeDrawer(null);
        return;
      }
      sheetAnim.current = animate(sheetY, 0, {
        ...springs.glide,
        velocity: velocity.y,
      });
    },
    onCancel: () => {
      sheetAnim.current = animate(sheetY, 0, springs.glide);
    },
  });

  const drawerContent = (e: CalendarEvent) => {
    const c = calendarOf(e.calendar);
    const meeting = !!e.attendees?.length;
    const on = joined.includes(e.id);
    return (
      <div className="flex h-full flex-col">
        {drawerMode === "sheet" ? (
          <div
            aria-hidden
            {...pull}
            onPointerDown={(event) => {
              pull.onPointerDown(event);
              // The handle is pulled, never clicked: it holds the pointer at
              // once, so a quick pull that leaves the strip is still a pull.
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // A synthetic pointer cannot be captured; the pull still works.
              }
            }}
            className="flex h-6 shrink-0 cursor-grab touch-pan-x items-center justify-center"
          >
            <span className="h-1 w-10 rounded-full bg-hairline-strong" />
          </div>
        ) : null}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-3">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: tintOf(e.calendar) }}
          />
          <h2
            id={drawerHeadId}
            tabIndex={-1}
            className="min-w-0 flex-1 truncate text-sm font-semibold outline-none"
          >
            <span className="sr-only">{e.title}, </span>
            {c?.label ?? "Event"} · {shortDay(e.start, off)}
          </h2>
          <button
            type="button"
            aria-label="Close event"
            onClick={(event) => closeDrawer(event.currentTarget)}
            className={TOOL}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="flex flex-1 [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain p-3">
          {meeting ? (
            <MeetingCard
              key={e.id}
              title={e.title}
              place={e.location ?? c?.label ?? ""}
              start={e.start}
              end={e.end}
              now={nowMs}
              attendees={e.attendees}
              agendaItems={e.agenda ?? []}
              joined={on}
              onJoinedChange={(j) => {
                setJoined((list) =>
                  j
                    ? [...list.filter((x) => x !== e.id), e.id]
                    : list.filter((x) => x !== e.id),
                );
                onJoinedChange?.(e.id, j);
                say(j ? `Joined ${e.title}.` : `Left ${e.title}.`);
              }}
              headingLevel={3}
              sound={sound}
              disabled={disabled}
            />
          ) : (
            <div className="flex flex-col gap-1 rounded-3 border border-hairline bg-surface-1 p-3">
              <h3 className="text-[15px] font-semibold">{e.title}</h3>
              <p className="flex items-center gap-1.5 text-xs text-ink-2 tabular-nums">
                <Clock aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                {shortDay(e.start, off)} · {hhmm(e.start, off)}–
                {hhmm(e.end, off)}
              </p>
              {e.location ? (
                <p className="flex items-center gap-1.5 text-xs text-ink-2">
                  <MapPin
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-3"
                  />
                  {e.location}
                </p>
              ) : null}
            </div>
          )}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-1 text-xs">
            <dt className="text-ink-3">When</dt>
            <dd className="text-ink-2 tabular-nums">
              {longDay(e.start, off)}, {hhmm(e.start, off)}–{hhmm(e.end, off)}
            </dd>
            <dt className="text-ink-3">Calendar</dt>
            <dd className="flex items-center gap-1.5 text-ink-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: tintOf(e.calendar) }}
              />
              {c?.label ?? "None"}
            </dd>
            {e.notes ? (
              <>
                <dt className="text-ink-3">Notes</dt>
                <dd className="text-ink-2">{e.notes}</dd>
              </>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2 px-1">
            {shownView === "month" ? (
              <button
                type="button"
                onClick={(event) => {
                  setDay(e.start);
                  setView("week", event.currentTarget);
                }}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                Show in week
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeEvent(e.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-danger transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
                FOCUS,
              )}
            >
              <Trash2 aria-hidden className="size-3.5" />
              Delete event
            </button>
          </div>
        </div>
      </div>
    );
  };

  const trap = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (event.currentTarget.dataset.drawer) closeDrawer(null);
      else closeSidebar();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input, [tabindex='0']",
      ),
    ].filter((n) => !n.closest("[inert]"));
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const modalDrawer = drawerMode !== "side" && !!picked;
  const blocked = modalDrawer || (sidebarOpen && !desktop);

  /* ------------------------------ the views ----------------------------- */

  const weekView = (
    <WeekPlanner
      density={density}
      now={nowMs}
      today={today}
      events={visible}
      onEventsChange={(next) => {
        const byId = new Map(allRef.current.map((x) => [x.id, x]));
        const kept = allRef.current.filter(
          (x) => x.calendar && hiddenIds.includes(x.calendar),
        );
        commit([
          ...kept,
          ...next.map((x) => ({ ...(byId.get(x.id) ?? {}), ...x })),
        ]);
      }}
      calendars={calendars.filter((c) => !hiddenIds.includes(c.id))}
      day={focusDay}
      onDayChange={(d) => setDay(d)}
      selected={selId ?? plannerPick}
      onSelectedChange={(id) => {
        if (id && creating.current === id) {
          creating.current = null;
          setPlannerPick(id);
          return;
        }
        if (id) openEvent(id);
        else {
          setPlannerPick(null);
          if (selId && drawerMode === "side") closeDrawer(null);
        }
      }}
      weekStartsOn={weekStartsOn}
      zoneOffset={off}
      onCreate={(e) => {
        creating.current = e.id;
        onCreate?.(e);
      }}
      onDelete={(e) => {
        const full = allRef.current.find((x) => x.id === e.id) ?? e;
        onDelete?.(full);
        if (selId === e.id) setSel(null);
      }}
      label={`Week of ${shortDay(focusDay - ((partsOf(focusDay, off).wd - weekStartsOn + 7) % 7) * DAY, off)}`}
      status={status}
      onRetry={onRetry}
      sound={sound}
      disabled={disabled}
      className="h-full rounded-none border-0"
    />
  );

  const showMonth = shownView === "month" || morphing;
  const views = (
    <div className="relative flex-1 overflow-hidden">
      {showMonth ? (
        <div
          className="absolute inset-0"
          inert={shownView === "week" || undefined}
          aria-hidden={shownView === "week" || undefined}
        >
          {phone ? (
            <div className="flex h-full flex-col">
              <div className="h-[15.5rem] shrink-0">{monthGrid}</div>
              <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain border-t border-hairline">
                {agenda}
              </div>
            </div>
          ) : (
            monthGrid
          )}
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {shownView === "week" ? (
          <motion.div
            key="week"
            className="absolute inset-0 z-10 bg-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              duration: durations.base,
              ease: easings.enter,
              delay: motionSafe ? 0.18 : 0,
            }}
          >
            {weekView}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const main = (
    <div
      className="flex h-full min-w-0 flex-1 flex-col"
      inert={blocked || undefined}
    >
      {toolbar}
      {views}
    </div>
  );

  return (
    <div
      ref={setRoot}
      role="region"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== "Escape") return;
        if (picked) {
          event.preventDefault();
          closeDrawer(null);
        } else if (sidebarOpen) {
          event.preventDefault();
          closeSidebar();
        }
      }}
      className={cn(
        "@container relative isolate h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <div className="flex h-full">
        {desktop ? (
          <aside
            aria-labelledby={sideHeadId}
            className="h-full w-[248px] shrink-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain border-r border-hairline bg-surface-1"
            inert={modalDrawer || undefined}
          >
            <h2 id={sideHeadId} className="sr-only">
              Calendars and agenda
            </h2>
            {sidebarBody}
          </aside>
        ) : null}
        {main}
        {drawerMode === "side" ? (
          <AnimatePresence initial={false}>
            {picked ? (
              <motion.aside
                key="side"
                aria-labelledby={drawerHeadId}
                className="flex h-full shrink-0 justify-end overflow-hidden border-l border-hairline bg-card"
                initial={
                  motionSafe ? { width: 0 } : { width: sideW, opacity: 0 }
                }
                animate={{ width: sideW, opacity: 1 }}
                exit={
                  motionSafe
                    ? { width: 0, transition: exitFor(durations.base) }
                    : { opacity: 0, transition: exitFor(durations.fast) }
                }
                transition={
                  motionSafe ? springs.glide : { duration: durations.fast }
                }
              >
                <div className="h-full shrink-0" style={{ width: sideW }}>
                  {drawerContent(picked)}
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        ) : null}
      </div>

      {/* Over and sheet drawers, and the sidebar drawer, sit over the frame. */}
      <AnimatePresence>
        {modalDrawer || (sidebarOpen && !desktop) ? (
          <motion.div
            key="scrim"
            aria-hidden
            className="absolute inset-0 z-20 bg-[color-mix(in_oklab,black_28%,transparent)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.base, ease: easings.enter }}
            onPointerDown={() => (picked ? closeDrawer(null) : closeSidebar())}
          />
        ) : null}
        {sidebarOpen && !desktop ? (
          <motion.div
            key="sidebar"
            role="dialog"
            aria-modal="true"
            aria-labelledby={sideHeadId}
            onKeyDown={trap}
            className="absolute inset-y-0 left-0 z-30 w-[min(280px,calc(100%-3rem))] [scrollbar-width:thin] overflow-y-auto overscroll-contain border-r border-hairline-strong bg-surface-1 shadow-[0_0_36px_color-mix(in_oklab,black_20%,transparent)]"
            initial={motionSafe ? { x: "-100%" } : { opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={
              motionSafe
                ? { x: "-100%", transition: exitFor(durations.base) }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
          >
            <div className="flex h-12 items-center gap-2 border-b border-hairline px-3">
              <h2
                id={sideHeadId}
                tabIndex={-1}
                className="min-w-0 flex-1 truncate text-sm font-semibold outline-none"
              >
                Calendars and agenda
              </h2>
              <button
                type="button"
                aria-label="Close calendars and agenda"
                onClick={closeSidebar}
                className={TOOL}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            {sidebarBody}
          </motion.div>
        ) : null}
        {picked && drawerMode === "over" ? (
          <motion.div
            key={`over-${picked.id}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerHeadId}
            data-drawer="over"
            onKeyDown={trap}
            className="absolute inset-y-0 right-0 z-30 border-l border-hairline-strong bg-card shadow-[0_0_36px_color-mix(in_oklab,black_20%,transparent)]"
            style={{ width: overW }}
            initial={motionSafe ? { x: "100%" } : { opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={
              motionSafe
                ? { x: "100%", transition: exitFor(durations.base) }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
          >
            {drawerContent(picked)}
          </motion.div>
        ) : null}
        {picked && drawerMode === "sheet" ? (
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerHeadId}
            data-drawer="sheet"
            onKeyDown={trap}
            ref={bindSheet}
            className="absolute inset-x-0 bottom-0 z-30 h-[min(76%,30rem)]"
            initial={motionSafe ? { y: "100%" } : { opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={
              motionSafe
                ? { y: "100%", transition: exitFor(durations.base) }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
          >
            <motion.div
              className="mx-auto h-full max-w-xl rounded-t-4 border border-b-0 border-hairline-strong bg-card shadow-[0_-12px_36px_color-mix(in_oklab,black_20%,transparent)]"
              style={{ y: sheetY }}
            >
              {drawerContent(picked)}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p id={hintId} className="sr-only">
        Arrow keys move the day, Home and End to the week&apos;s ends, Page Up
        and Page Down a month. Enter steps into the day&apos;s events, Escape
        steps back out.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
