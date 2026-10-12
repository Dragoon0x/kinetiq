"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  AtSign,
  CalendarDays,
  CornerDownLeft,
  Flag,
  Hash,
  Inbox,
  Info,
  Pin,
  RotateCcw,
  Timer,
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

export type CaptureProject = {
  /** The slug typed after `#`, e.g. "roads". */
  id: string;
  name: string;
};

export type CapturePerson = {
  id: string;
  name: string;
  /** The handle typed after `@`, e.g. "mira". */
  handle: string;
};

export type CaptureTokenKind =
  "date" | "project" | "person" | "priority" | "duration";

/** One phrase the parser recognised in the field. */
export type CaptureToken = {
  kind: CaptureTokenKind;
  /** Where it sits in the text, as [start, end). */
  start: number;
  end: number;
  /** The phrase as typed. */
  raw: string;
  /** A project or person id, a priority 1–4, minutes, or a due time in ms. */
  value: string | number;
  /** What its chip reads. */
  label: string;
  /** Dates only: no time of day was given. */
  allDay?: boolean;
};

export type CapturePriority = 1 | 2 | 3 | 4;

export type CaptureTask = {
  id: string;
  title: string;
  /** Due time in ms, when a date was given. */
  dueAt?: number;
  /** The date had no time of day. */
  allDay?: boolean;
  /** A project id. */
  project?: string;
  /** A person id. */
  assignee?: string;
  priority?: CapturePriority;
  /** Minutes. */
  duration?: number;
  /** When it was captured, in ms. */
  capturedAt: number;
};

/** The chips kept for the next task after Cmd/Ctrl+Enter. */
export type CaptureSticky = { project?: CaptureToken; date?: CaptureToken };

export type CaptureStatus = "ready" | "loading" | "error";
export type CaptureChipPlacement = "below" | "inline";
export type CaptureDensity = "compact" | "cozy" | "roomy";

export type QuickCaptureProps = {
  /** Where recognised chips sit: in a row beneath the field, or inside it after the text. @default "below" */
  chipPlacement?: CaptureChipPlacement;
  /** Whether the parse legend is shown; the header's Legend button toggles it from here. @default false */
  legend?: boolean;
  /** Field height, chip size and row padding. @default "cozy" */
  density?: CaptureDensity;
  /** The projects `#slug` can name and the listbox suggests. @default defaultCaptureProjects */
  projects?: CaptureProject[];
  /** The people `@handle` can name and the listbox suggests. @default defaultCapturePeople */
  people?: CapturePerson[];
  /** Controlled text in the field. */
  value?: string;
  /** Initial text when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires on every edit with the text and what the parser found in it. */
  onChange?: (value: string, tokens: CaptureToken[]) => void;
  /** Controlled list of captured tasks, newest first. */
  tasks?: CaptureTask[];
  /** Initial list when uncontrolled. @default defaultCaptureTasks */
  defaultTasks?: CaptureTask[];
  /** Enter or Cmd/Ctrl+Enter captured a task, with the list it now heads. */
  onCapture?: (task: CaptureTask, tasks: CaptureTask[]) => void;
  /** A task was removed from the list, with the list without it. */
  onRemove?: (task: CaptureTask, tasks: CaptureTask[]) => void;
  /** The moment dates are read from ("tomorrow", "fri"), in ms — never the clock. @default defaultCaptureNow */
  now?: number;
  /** Whether the list has arrived and the last capture landed: a skeleton while loading, and when a capture failed the task stays in the field with a Retry. @default "ready" */
  status?: CaptureStatus;
  /** Retry was pressed after a failed capture; the field's text is then captured again. */
  onRetry?: () => void;
  /** The heading. @default "Quick capture" */
  title?: string;
  /** The field's placeholder. @default a sample task with every token */
  placeholder?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the captured list scrolls inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be typed, captured or removed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 08:30 UTC. */
export const defaultCaptureNow = Date.UTC(2026, 9, 12, 8, 30);

export const defaultCaptureProjects: CaptureProject[] = [
  { id: "roads", name: "Roads" },
  { id: "drainage", name: "Drainage" },
  { id: "lighting", name: "Street lighting" },
  { id: "depot", name: "Depot" },
  { id: "inspections", name: "Inspections" },
  { id: "winter", name: "Winter plan" },
];

export const defaultCapturePeople: CapturePerson[] = [
  { id: "mira", name: "Mira Okafor", handle: "mira" },
  { id: "jonah", name: "Jonah Feld", handle: "jonah" },
  { id: "sana", name: "Sana Verhoeven", handle: "sana" },
  { id: "ruben", name: "Ruben Castellane", handle: "ruben" },
  { id: "ada", name: "Ada Nkemelu", handle: "ada" },
];

/** Five tasks already on Fieldline Tasks' list, newest first. */
export const defaultCaptureTasks: CaptureTask[] = [
  {
    id: "t-1041",
    title: "Walk the Harbour Road resurfacing with the contractor",
    dueAt: defaultCaptureNow + DAY + 30 * MIN,
    project: "roads",
    assignee: "jonah",
    priority: 2,
    duration: 90,
    capturedAt: defaultCaptureNow - 25 * MIN,
  },
  {
    id: "t-1040",
    title: "Order gully grates for the Mill Lane culvert",
    dueAt: defaultCaptureNow + 3 * DAY,
    allDay: true,
    project: "drainage",
    priority: 3,
    capturedAt: defaultCaptureNow - 2 * HOUR,
  },
  {
    id: "t-1039",
    title: "Chase the lamp column survey",
    project: "lighting",
    assignee: "sana",
    duration: 20,
    capturedAt: defaultCaptureNow - 5 * HOUR,
  },
  {
    id: "t-1038",
    title: "Book the gritter service slot",
    dueAt: defaultCaptureNow + 9 * DAY + 30 * MIN,
    project: "winter",
    assignee: "ruben",
    priority: 1,
    capturedAt: defaultCaptureNow - DAY,
  },
  {
    id: "t-1037",
    title: "Reply to the depot fencing quote",
    assignee: "ada",
    duration: 15,
    capturedAt: defaultCaptureNow - DAY - 3 * HOUR,
  },
];

export const defaultCaptureValue = "";

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const KIND_ORDER: CaptureTokenKind[] = [
  "date",
  "project",
  "person",
  "priority",
  "duration",
];

const KIND_WORD: Record<CaptureTokenKind, string> = {
  date: "Date",
  project: "Project",
  person: "Assignee",
  priority: "Priority",
  duration: "Duration",
};

const KIND_SAMPLE: Record<CaptureTokenKind, string> = {
  date: "tomorrow 9am",
  project: "#roads",
  person: "@mira",
  priority: "!2",
  duration: "~45m",
};

const KIND_COLOR: Record<CaptureTokenKind, string> = {
  date: "var(--accent-bright)",
  project: "var(--signal)",
  person: "var(--success)",
  priority: "var(--warn)",
  duration: "var(--ink-2)",
};

const KIND_ICON: Record<
  CaptureTokenKind,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  date: CalendarDays,
  project: Hash,
  person: AtSign,
  priority: Flag,
  duration: Timer,
};

const DENSITY: Record<
  CaptureDensity,
  { field: string; text: string; chip: string; row: string; badge: string }
> = {
  compact: {
    field: "min-h-8 py-1",
    text: "text-[13px] leading-5",
    chip: "h-6 text-[11px]",
    row: "py-1",
    badge: "h-[18px] text-[10px]",
  },
  cozy: {
    field: "min-h-9 py-1.5",
    text: "text-sm leading-5",
    chip: "h-[26px] text-xs",
    row: "py-1.5",
    badge: "h-5 text-[10px]",
  },
  roomy: {
    field: "min-h-10 py-2",
    text: "text-[15px] leading-5",
    chip: "h-7 text-[13px]",
    row: "py-2",
    badge: "h-[22px] text-[11px]",
  },
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
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

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const WEEKDAY_RE =
  "monday|tuesday|wednesday|thursday|friday|saturday|sunday|tues|thurs|thur|mon|tue|wed|thu|fri|sat|sun";

const DATE_RE = new RegExp(
  `\\b(today|tonight|tomorrow|tmrw|next week|next (?:${WEEKDAY_RE})|(?:${WEEKDAY_RE})|in (\\d{1,2}) (days?|weeks?|hours?))\\b`,
  "gi",
);
/** A time right after a date word: "tomorrow 9am", "fri at 14:00", "today noon". */
const TIME_AFTER_RE =
  /^(\s+(?:at\s+)?(?:(noon|midnight)|(\d{1,2})(?::(\d{2}))?\s?(am|pm)|(\d{1,2}):(\d{2})|at\s+(\d{1,2})))\b/i;
/** A time on its own reads as today. */
const TIME_ALONE_RE =
  /\b((?:at\s+)?(?:(noon|midnight)|(\d{1,2})(?::(\d{2}))?\s?(am|pm)|(\d{1,2}):(\d{2})))\b/gi;
const PROJECT_RE = /(^|\s)#([a-z0-9][a-z0-9_-]*)/gi;
const PERSON_RE = /(^|\s)@([a-z0-9][a-z0-9._-]*)/gi;
const PRIORITY_RE = /(^|\s)!([1-4])\b/g;
const DURATION_RE =
  /(^|\s)~(\d{1,3})(h|hr|hrs|m|min|mins)?(?:(\d{1,2})(?:m|min)?)?\b/gi;

const pad2 = (n: number) => String(n).padStart(2, "0");
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const startOfDay = (at: number) => at - (((at % DAY) + DAY) % DAY);

/** Reads a matched time; `atHour` is the bare "at 9" form. */
const timeOf = (
  word: string | undefined,
  h12: string | undefined,
  m12: string | undefined,
  ampm: string | undefined,
  h24: string | undefined,
  m24: string | undefined,
  atHour: string | undefined,
): { h: number; m: number } | null => {
  if (word)
    return word.toLowerCase() === "noon" ? { h: 12, m: 0 } : { h: 0, m: 0 };
  if (h12 !== undefined && ampm) {
    let h = Number(h12) % 12;
    if (ampm.toLowerCase() === "pm") h += 12;
    return { h, m: Number(m12 ?? 0) };
  }
  if (h24 !== undefined && m24 !== undefined) {
    return { h: clamp(Number(h24), 0, 23), m: clamp(Number(m24), 0, 59) };
  }
  if (atHour !== undefined) {
    const h = Number(atHour);
    // "at 3" is an afternoon; "at 9" a morning.
    return { h: h < 7 ? h + 12 : clamp(h, 0, 23), m: 0 };
  }
  return null;
};

/** Prints a due time relative to `now`: "Today", "Tomorrow 9:00", "Fri 16 Oct". */
export const formatDue = (at: number, allDay: boolean, now: number) => {
  const day = startOfDay(at);
  const today = startOfDay(now);
  const diff = Math.round((day - today) / DAY);
  const d = new Date(at);
  let word: string;
  if (diff === 0) word = "Today";
  else if (diff === 1) word = "Tomorrow";
  else if (diff === -1) word = "Yesterday";
  else if (diff > 1 && diff < 7) word = DAY_NAMES[d.getUTCDay()] ?? "";
  else
    word = `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
  if (allDay) return word;
  return `${word} ${d.getUTCHours()}:${pad2(d.getUTCMinutes())}`;
};

const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
};

const resolveDate = (
  phrase: string,
  count: string | undefined,
  unit: string | undefined,
  time: { h: number; m: number } | null,
  now: number,
): { at: number; allDay: boolean } => {
  const word = phrase.toLowerCase();
  const today = startOfDay(now);
  const weekday = new Date(now).getUTCDay();
  const coming = (target: number) => {
    const ahead = (target - weekday + 7) % 7;
    return today + (ahead === 0 ? 7 : ahead) * DAY;
  };
  let day = today;
  let fixedTime: { h: number; m: number } | null = null;
  if (word === "tomorrow" || word === "tmrw") day = today + DAY;
  else if (word === "tonight") fixedTime = { h: 19, m: 0 };
  else if (word === "next week") day = coming(1);
  else if (word.startsWith("next ")) {
    const target = WEEKDAYS[word.slice(5)] ?? weekday;
    day = coming(target) + 7 * DAY;
  } else if (word.startsWith("in ") && count && unit) {
    const n = Number(count);
    if (unit.startsWith("hour")) {
      return { at: now + n * HOUR, allDay: false };
    }
    day = today + n * (unit.startsWith("week") ? 7 : 1) * DAY;
  } else if (word in WEEKDAYS) {
    day = coming(WEEKDAYS[word] ?? weekday);
  }
  const t = time ?? fixedTime;
  if (t) return { at: day + t.h * HOUR + t.m * MIN, allDay: false };
  return { at: day, allDay: true };
};

const overlaps = (tokens: CaptureToken[], start: number, end: number) =>
  tokens.some((t) => start < t.end && end > t.start);

/**
 * Reads the field once, left to right, and returns the first phrase of each
 * kind it finds: a date (with any time that follows it, or a bare time read
 * as today), a `#project` and `@person` that exist, a `!priority` and a
 * `~duration`. Exported so hosts can preview a capture before it lands.
 */
export function parseCapture(
  text: string,
  options: {
    projects: CaptureProject[];
    people: CapturePerson[];
    now: number;
  },
): CaptureToken[] {
  const tokens: CaptureToken[] = [];
  const { projects, people, now } = options;

  PROJECT_RE.lastIndex = 0;
  for (let m = PROJECT_RE.exec(text); m; m = PROJECT_RE.exec(text)) {
    const lead = m[1] ?? "";
    const slug = (m[2] ?? "").toLowerCase();
    const project = projects.find((p) => p.id.toLowerCase() === slug);
    if (!project) continue;
    const start = m.index + lead.length;
    tokens.push({
      kind: "project",
      start,
      end: start + slug.length + 1,
      raw: text.slice(start, start + slug.length + 1),
      value: project.id,
      label: project.name,
    });
    break;
  }

  PERSON_RE.lastIndex = 0;
  for (let m = PERSON_RE.exec(text); m; m = PERSON_RE.exec(text)) {
    const lead = m[1] ?? "";
    const handle = (m[2] ?? "").toLowerCase();
    const person = people.find((p) => p.handle.toLowerCase() === handle);
    if (!person) continue;
    const start = m.index + lead.length;
    tokens.push({
      kind: "person",
      start,
      end: start + handle.length + 1,
      raw: text.slice(start, start + handle.length + 1),
      value: person.id,
      label: person.name,
    });
    break;
  }

  PRIORITY_RE.lastIndex = 0;
  const pm = PRIORITY_RE.exec(text);
  if (pm) {
    const start = pm.index + (pm[1] ?? "").length;
    const level = Number(pm[2]) as CapturePriority;
    tokens.push({
      kind: "priority",
      start,
      end: start + 2,
      raw: text.slice(start, start + 2),
      value: level,
      label: `P${level}`,
    });
  }

  DURATION_RE.lastIndex = 0;
  const dm = DURATION_RE.exec(text);
  if (dm) {
    const start = dm.index + (dm[1] ?? "").length;
    const n = Number(dm[2]);
    const unit = (dm[3] ?? "m").toLowerCase();
    const extra = dm[4] !== undefined ? Number(dm[4]) : 0;
    const minutes = unit.startsWith("h") ? n * 60 + extra : n;
    if (minutes > 0) {
      tokens.push({
        kind: "duration",
        start,
        end: start + dm[0].length - (dm[1] ?? "").length,
        raw: text.slice(start, start + dm[0].length - (dm[1] ?? "").length),
        value: minutes,
        label: formatDuration(minutes),
      });
    }
  }

  let date: CaptureToken | null = null;
  DATE_RE.lastIndex = 0;
  for (let m = DATE_RE.exec(text); m; m = DATE_RE.exec(text)) {
    const start = m.index;
    let end = start + m[0].length;
    if (overlaps(tokens, start, end)) continue;
    const after = TIME_AFTER_RE.exec(text.slice(end));
    let time: { h: number; m: number } | null = null;
    if (after) {
      time = timeOf(
        after[2],
        after[3],
        after[4],
        after[5],
        after[6],
        after[7],
        after[8],
      );
      if (time) end += (after[1] ?? "").length;
    }
    const resolved = resolveDate(m[1] ?? "", m[2], m[3], time, now);
    date = {
      kind: "date",
      start,
      end,
      raw: text.slice(start, end),
      value: resolved.at,
      label: formatDue(resolved.at, resolved.allDay, now),
      allDay: resolved.allDay,
    };
    break;
  }
  if (!date) {
    TIME_ALONE_RE.lastIndex = 0;
    for (let m = TIME_ALONE_RE.exec(text); m; m = TIME_ALONE_RE.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(tokens, start, end)) continue;
      const time = timeOf(m[2], m[3], m[4], m[5], m[6], m[7], undefined);
      if (!time) continue;
      const at = startOfDay(now) + time.h * HOUR + time.m * MIN;
      date = {
        kind: "date",
        start,
        end,
        raw: text.slice(start, end),
        value: at,
        label: formatDue(at, false, now),
        allDay: false,
      };
      break;
    }
  }
  if (date) tokens.push(date);

  return tokens.sort((a, b) => a.start - b.start);
}

/** The task's title: the text with every recognised phrase lifted out. */
export const titleOf = (text: string, tokens: CaptureToken[]) => {
  let out = "";
  let i = 0;
  for (const t of tokens) {
    out += text.slice(i, t.start);
    i = t.end;
  }
  out += text.slice(i);
  return out.replace(/\s+/g, " ").trim();
};

type Suggest = {
  kind: "project" | "person";
  start: number;
  end: number;
  query: string;
  items: { id: string; slug: string; name: string }[];
};

/** The word under the caret, if it is a `#` or `@` being typed. */
const suggestAt = (
  text: string,
  caret: number,
  projects: CaptureProject[],
  people: CapturePerson[],
): Suggest | null => {
  const start = text.lastIndexOf(" ", Math.max(0, caret - 1)) + 1;
  const nextSpace = text.indexOf(" ", caret);
  const end = nextSpace === -1 ? text.length : nextSpace;
  if (caret < start || caret > end) return null;
  const word = text.slice(start, end);
  const lead = word[0];
  if (lead !== "#" && lead !== "@") return null;
  const query = word.slice(1).toLowerCase();
  const kind = lead === "#" ? "project" : "person";
  const items = (
    kind === "project"
      ? projects.map((p) => ({ id: p.id, slug: p.id, name: p.name }))
      : people.map((p) => ({ id: p.id, slug: p.handle, name: p.name }))
  )
    .filter(
      (it) =>
        it.slug.toLowerCase().startsWith(query) ||
        it.name.toLowerCase().includes(query),
    )
    .slice(0, 6);
  return { kind, start, end, query, items };
};

const noopSubscribe = () => () => {};

const taskParts = (
  task: CaptureTask,
  projects: CaptureProject[],
  people: CapturePerson[],
  now: number,
): { kind: CaptureTokenKind; label: string }[] => {
  const out: { kind: CaptureTokenKind; label: string }[] = [];
  if (task.dueAt !== undefined) {
    out.push({
      kind: "date",
      label: formatDue(task.dueAt, task.allDay ?? false, now),
    });
  }
  if (task.project) {
    const p = projects.find((x) => x.id === task.project);
    out.push({ kind: "project", label: p?.name ?? task.project });
  }
  if (task.assignee) {
    const p = people.find((x) => x.id === task.assignee);
    out.push({ kind: "person", label: p?.name ?? task.assignee });
  }
  if (task.priority !== undefined) {
    out.push({ kind: "priority", label: `P${task.priority}` });
  }
  if (task.duration !== undefined) {
    out.push({ kind: "duration", label: formatDuration(task.duration) });
  }
  return out;
};

/* ----------------------------------------------------------------------- */
/*                                   Chips                                  */
/* ----------------------------------------------------------------------- */

function Chip({
  kind,
  label,
  sticky,
  pulse,
  live,
  motionSafe,
  density,
  onRelease,
}: {
  kind: CaptureTokenKind;
  label: string;
  sticky: boolean;
  pulse: number;
  live: boolean;
  motionSafe: boolean;
  density: CaptureDensity;
  onRelease?: () => void;
}) {
  const Icon = KIND_ICON[kind];
  return (
    <motion.span
      layout={motionSafe ? "position" : false}
      initial={
        live
          ? motionSafe
            ? { opacity: 0, y: -distances.nudge, scale: 0.92 }
            : { opacity: 0 }
          : false
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.96 : 1,
        transition: exitFor(durations.fast),
      }}
      transition={
        motionSafe
          ? {
              ...springs.snap,
              layout: springs.glide,
              opacity: { duration: durations.fast, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
      className="inline-flex shrink-0"
      style={{ ["--qc-c" as string]: KIND_COLOR[kind] }}
    >
      <motion.span
        key={pulse}
        initial={live && motionSafe && sticky ? { scale: 1.12 } : false}
        animate={{ scale: 1 }}
        transition={motionSafe ? springs.recoil : { duration: 0 }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border pr-2 pl-1.5 font-medium whitespace-nowrap",
          "border-[color-mix(in_oklab,var(--qc-c)_38%,transparent)] bg-[color-mix(in_oklab,var(--qc-c)_12%,transparent)] text-[color-mix(in_oklab,var(--qc-c)_82%,var(--ink))]",
          sticky && "border-dashed",
          DENSITY[density].chip,
        )}
      >
        {sticky ? (
          <Pin aria-hidden className="size-3" />
        ) : (
          <Icon aria-hidden className="size-3" />
        )}
        <span className="sr-only">{KIND_WORD[kind]}: </span>
        {label}
        {sticky && onRelease ? (
          <button
            type="button"
            onClick={onRelease}
            aria-label={`Release ${KIND_WORD[kind].toLowerCase()} ${label}`}
            className={cn(
              "-mr-1 ml-0.5 inline-flex size-4 items-center justify-center rounded-full transition-colors hover:bg-[color-mix(in_oklab,var(--qc-c)_22%,transparent)]",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-2.5" />
          </button>
        ) : null}
      </motion.span>
    </motion.span>
  );
}

function Badge({
  kind,
  label,
  density,
}: {
  kind: CaptureTokenKind;
  label: string;
  density: CaptureDensity;
}) {
  const Icon = KIND_ICON[kind];
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink items-center gap-1 rounded-full border px-1.5 whitespace-nowrap",
        "border-[color-mix(in_oklab,var(--qc-c)_30%,transparent)] bg-[color-mix(in_oklab,var(--qc-c)_9%,transparent)] text-[color-mix(in_oklab,var(--qc-c)_80%,var(--ink))]",
        DENSITY[density].badge,
      )}
      style={{ ["--qc-c" as string]: KIND_COLOR[kind] }}
    >
      <Icon aria-hidden className="size-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Task row                                 */
/* ----------------------------------------------------------------------- */

function TaskRow({
  task,
  index,
  parts,
  active,
  density,
  disabled,
  motionSafe,
  step,
  nodeRef,
  onFocus,
  onRemove,
  onNav,
}: {
  task: CaptureTask;
  index: number;
  parts: { kind: CaptureTokenKind; label: string }[];
  active: boolean;
  density: CaptureDensity;
  disabled: boolean;
  motionSafe: boolean;
  step: number;
  nodeRef: (node: HTMLLIElement | null) => void;
  onFocus: () => void;
  onRemove: () => void;
  onNav: (event: React.KeyboardEvent) => void;
}) {
  const detail = parts.map((p) => p.label).join(", ");
  return (
    <motion.li
      ref={nodeRef}
      role="option"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      aria-label={detail ? `${task.title}. ${detail}` : task.title}
      onFocus={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          if (!disabled) onRemove();
          return;
        }
        onNav(event);
      }}
      layout={motionSafe ? "position" : false}
      initial={{ opacity: 0, y: motionSafe ? -distances.shift : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        layout: springs.glide,
        y: motionSafe
          ? { ...springs.glide, delay: r3(Math.min(index, 8) * step) }
          : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className={cn(
        "group relative grid cursor-default grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 rounded-2 px-2 transition-colors hover:bg-surface-2 aria-selected:bg-surface-1",
        DENSITY[density].row,
        FOCUS_RING,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:gap-2">
        <span
          className={cn(
            "min-w-0 truncate text-foreground",
            DENSITY[density].text,
          )}
        >
          {task.title}
        </span>
        {parts.length > 0 ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1 @min-[40rem]:ml-auto @min-[40rem]:shrink-0 @min-[40rem]:flex-nowrap">
            {parts.map((p) => (
              <Badge
                key={p.kind}
                kind={p.kind}
                label={p.label}
                density={density}
              />
            ))}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Remove ${task.title}`}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) onRemove();
        }}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center self-center rounded-full text-ink-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface-2 hover:text-foreground",
          disabled && "pointer-events-none",
        )}
      >
        <X aria-hidden className="size-3" />
      </button>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A quick-add bar for a task app. One field reads what is typed as it is
 * typed: a date phrase ("tomorrow 9am", "fri"), a `#project`, an `@person`,
 * a `!priority` and a `~duration`. Each phrase the parser recognises is
 * underlined in the field in its kind's colour and drawn as a chip that
 * lands on `springs.snap`; editing the phrase away releases the chip on the
 * exit ease. While a `#` or `@` word is under the caret, a small listbox
 * suggests projects or people.
 *
 * Enter captures: the task slides down out of the field into the list
 * beneath on `springs.glide`, its chips now badges, the rows below gliding
 * down to make room, and the field clears. Cmd/Ctrl+Enter captures and keeps
 * the project and the date for the next task: those chips stay, pinned,
 * and pulse once on `springs.recoil`. A legend of the five phrases can be
 * toggled from the header.
 *
 * The field is a combobox over the suggestions (Up/Down move, Enter or Tab
 * accept, Escape closes); the captured list is a listbox (Up/Down, Home/End,
 * Delete removes). Every chip, capture and removal is announced in words.
 * Under reduced motion nothing travels or pulses: chips and rows cross-fade
 * into place.
 */
export function QuickCapture({
  chipPlacement = "below",
  legend = false,
  density = "cozy",
  projects = defaultCaptureProjects,
  people = defaultCapturePeople,
  value,
  defaultValue = defaultCaptureValue,
  onChange,
  tasks,
  defaultTasks = defaultCaptureTasks,
  onCapture,
  onRemove,
  now = defaultCaptureNow,
  status = "ready",
  onRetry,
  title = "Quick capture",
  placeholder = 'Add a task: "Call the depot tomorrow 9am #roads @mira !2 ~45m"',
  label,
  height = 520,
  disabled = false,
  className,
}: QuickCaptureProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const listId = `${uid}-suggest`;
  const legendId = `${uid}-legend`;
  const optionId = (id: string) => `${uid}-opt-${id}`;

  const [ownText, setOwnText] = React.useState(defaultValue);
  const text = value ?? ownText;
  const [ownTasks, setOwnTasks] = React.useState(defaultTasks);
  const list = tasks ?? ownTasks;
  const inert = disabled || status === "loading";

  // The header's button toggles the legend on top of the prop; a new prop
  // value wins again until the next press.
  const [legendOverride, setLegendOverride] = React.useState<{
    base: boolean;
    open: boolean;
  } | null>(null);
  const legendOpen =
    legendOverride && legendOverride.base === legend
      ? legendOverride.open
      : legend;

  const [caret, setCaret] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState<string | null>(null);
  // Keyed by the suggestion query, so a new query starts at the first item
  // without an effect.
  const [activeOpt, setActiveOpt] = React.useState<{
    key: string | null;
    index: number;
  }>({ key: null, index: 0 });
  const [sticky, setSticky] = React.useState<CaptureSticky>({});
  const [pulse, setPulse] = React.useState(0);
  const [activeTask, setActiveTask] = React.useState<string | null>(null);
  const [attemptSeq, setAttemptSeq] = React.useState(0);
  const [shift, setShift] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so chips already on the page
  // never fade in; true for chips that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());
  const caretReq = React.useRef<number | null>(null);
  const attempt = React.useRef<string | null>(null);
  const frame = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    },
    [],
  );
  const seq = React.useRef(0);

  /* -------------------------------- data ------------------------------- */

  const tokens = React.useMemo(
    () => parseCapture(text, { projects, people, now }),
    [text, projects, people, now],
  );
  const byKind = new Map(tokens.map((t) => [t.kind, t]));
  const suggest =
    focused && !inert ? suggestAt(text, caret, projects, people) : null;
  const suggestKey = suggest
    ? `${suggest.start}:${suggest.kind}${suggest.query}`
    : null;
  const listOpen =
    suggest !== null && suggest.items.length > 0 && dismissed !== suggestKey;
  const activeIndex = activeOpt.key === suggestKey ? activeOpt.index : 0;
  const activeItem = listOpen
    ? (suggest.items[clamp(activeIndex, 0, suggest.items.length - 1)] ?? null)
    : null;

  // What a capture would carry: the field's chips, then the pinned ones.
  const effective = KIND_ORDER.map((kind) => {
    const own = byKind.get(kind);
    if (own) return { kind, token: own, sticky: false };
    const kept =
      kind === "project"
        ? sticky.project
        : kind === "date"
          ? sticky.date
          : undefined;
    return kept ? { kind, token: kept, sticky: true } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  /* ------------------------------ text edits --------------------------- */

  /** Commits an edit, and says which chips it brought or took away. */
  const setText = (next: string) => {
    const nextTokens = parseCapture(next, { projects, people, now });
    if (value === undefined) setOwnText(next);
    onChange?.(next, nextTokens);
    // Chips are announced as they arrive and leave, never per keystroke.
    const after = new Map(nextTokens.map((t) => [t.kind, t.label]));
    const said: string[] = [];
    for (const [kind, lbl] of after) {
      if (byKind.get(kind)?.label !== lbl)
        said.push(`${KIND_WORD[kind]} ${lbl}.`);
    }
    for (const kind of byKind.keys()) {
      if (!after.has(kind)) said.push(`${KIND_WORD[kind]} released.`);
    }
    if (said.length) setAnnouncement(said.join(" "));
  };

  // A suggestion was accepted: the caret belongs after what was inserted.
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    const at = caretReq.current;
    if (!el || at === null) return;
    caretReq.current = null;
    el.setSelectionRange(at, at);
    setCaret(at);
  }, [text]);

  // The underline layer scrolls with the field.
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const next = el.scrollLeft;
    setShift((prev) => (prev === next ? prev : next));
  }, [text, caret]);

  // A failed capture puts the task back in the field, so it can be retried.
  React.useEffect(() => {
    if (status !== "error") return;
    const last = attempt.current;
    if (last === null) return;
    const el = inputRef.current;
    if (el && el.value === "") {
      if (value === undefined) setOwnText(last);
      onChange?.(last, parseCapture(last, { projects, people, now }));
      setAnnouncement("Capture failed. The task is back in the field.");
    }
  }, [status, attemptSeq, value, onChange, projects, people, now]);

  /* ------------------------------- actions ----------------------------- */

  const say = (s: string) => setAnnouncement(s);

  const accept = (item: { slug: string; name: string }) => {
    if (!suggest) return;
    const insert = `${suggest.kind === "project" ? "#" : "@"}${item.slug} `;
    const rest = text.slice(suggest.end).replace(/^\s/, "");
    const next = `${text.slice(0, suggest.start)}${insert}${rest}`;
    caretReq.current = suggest.start + insert.length;
    setText(next);
    setDismissed(null);
    say(`${suggest.kind === "project" ? "Project" : "Assignee"} ${item.name}.`);
  };

  const commitTasks = (next: CaptureTask[]) => {
    if (tasks === undefined) setOwnTasks(next);
  };

  const capture = (keep: boolean) => {
    if (inert) return;
    const name = titleOf(text, tokens);
    if (!name) {
      say("Nothing to capture. Type a task first.");
      return;
    }
    seq.current += 1;
    const task: CaptureTask = {
      id: `cap-${now}-${seq.current}`,
      title: name,
      capturedAt: now,
    };
    for (const e of effective) {
      const t = e.token;
      if (t.kind === "date") {
        task.dueAt = Number(t.value);
        task.allDay = t.allDay ?? false;
      } else if (t.kind === "project") task.project = String(t.value);
      else if (t.kind === "person") task.assignee = String(t.value);
      else if (t.kind === "priority")
        task.priority = Number(t.value) as CapturePriority;
      else if (t.kind === "duration") task.duration = Number(t.value);
    }
    const next = [task, ...list];
    attempt.current = text;
    setAttemptSeq((s) => s + 1);
    commitTasks(next);
    onCapture?.(task, next);
    let kept = "";
    if (keep) {
      const nextSticky: CaptureSticky = {
        project: byKind.get("project") ?? sticky.project,
        date: byKind.get("date") ?? sticky.date,
      };
      setSticky(nextSticky);
      setPulse((p) => p + 1);
      const names = [
        nextSticky.project ? `project ${nextSticky.project.label}` : null,
        nextSticky.date ? `date ${nextSticky.date.label}` : null,
      ].filter(Boolean);
      kept = names.length ? ` Keeping ${names.join(" and ")}.` : "";
    }
    setText("");
    setDismissed(null);
    const detail = taskParts(task, projects, people, now)
      .map((p) => p.label)
      .join(", ");
    say(
      `Captured ${name}.${detail ? ` ${detail}.` : ""} ${next.length} ${next.length === 1 ? "task" : "tasks"}.${kept}`,
    );
  };

  const retry = () => {
    onRetry?.();
    capture(false);
  };

  const release = (kind: "project" | "date") => {
    const t = sticky[kind];
    setSticky((s) => ({ ...s, [kind]: undefined }));
    say(`${KIND_WORD[kind]} ${t?.label ?? ""} released.`);
    inputRef.current?.focus({ preventScroll: true });
  };

  const remove = (id: string) => {
    if (disabled) return;
    const i = list.findIndex((t) => t.id === id);
    const task = list[i];
    if (!task) return;
    const next = list.filter((t) => t.id !== id);
    commitTasks(next);
    onRemove?.(task, next);
    const neighbour = next[Math.min(i, next.length - 1)];
    if (neighbour) {
      setActiveTask(neighbour.id);
      // Bound after the row has gone, so focus lands on the row beside it.
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        rowNodes.current.get(neighbour.id)?.focus({ preventScroll: true });
      });
    } else inputRef.current?.focus({ preventScroll: true });
    say(
      `Removed ${task.title}. ${next.length} ${next.length === 1 ? "task" : "tasks"} left.`,
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onFieldKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (listOpen && suggest) {
      const n = suggest.items.length;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveOpt({ key: suggestKey, index: (activeIndex + 1) % n });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveOpt({ key: suggestKey, index: (activeIndex - 1 + n) % n });
        return;
      }
      if (event.key === "Home" && event.altKey) {
        event.preventDefault();
        setActiveOpt({ key: suggestKey, index: 0 });
        return;
      }
      if (event.key === "End" && event.altKey) {
        event.preventDefault();
        setActiveOpt({ key: suggestKey, index: n - 1 });
        return;
      }
      if (
        (event.key === "Enter" && !event.metaKey && !event.ctrlKey) ||
        event.key === "Tab"
      ) {
        if (activeItem) {
          event.preventDefault();
          accept(activeItem);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(suggestKey);
        say("Suggestions closed.");
        return;
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      capture(event.metaKey || event.ctrlKey);
    }
  };

  const onRowNav = (event: React.KeyboardEvent, index: number) => {
    const to =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? list.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    if (to < 0) {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const target = list[clamp(to, 0, list.length - 1)];
    if (target) rowNodes.current.get(target.id)?.focus({ preventScroll: true });
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const step = cascade(Math.min(list.length, 8));
  const activeRow =
    activeTask && list.some((t) => t.id === activeTask)
      ? activeTask
      : (list[0]?.id ?? null);
  const stickyCount = (sticky.project ? 1 : 0) + (sticky.date ? 1 : 0);
  const hasChips = effective.length > 0;

  // The field's text, repeated beneath it so each phrase can be underlined.
  const mirror: React.ReactNode[] = [];
  {
    let i = 0;
    for (const t of tokens) {
      if (t.start > i) mirror.push(text.slice(i, t.start));
      mirror.push(
        <span
          key={`${t.kind}-${t.start}`}
          className="rounded-[1px] border-b-2"
          style={{ borderColor: KIND_COLOR[t.kind] }}
        >
          {text.slice(t.start, t.end)}
        </span>,
      );
      i = t.end;
    }
    if (i < text.length) mirror.push(text.slice(i));
  }

  const chips = (
    <AnimatePresence initial={false}>
      {effective.map((e) => (
        <Chip
          key={e.kind}
          kind={e.kind}
          label={e.token.label}
          sticky={e.sticky}
          pulse={e.sticky ? pulse : 0}
          live={live}
          motionSafe={motionSafe}
          density={density}
          onRelease={
            e.sticky && !inert
              ? () => release(e.kind === "project" ? "project" : "date")
              : undefined
          }
        />
      ))}
    </AnimatePresence>
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
      <p id={hintId} className="sr-only">
        Type a task. A date, hash project, at person, exclamation priority and
        tilde duration become chips. Enter captures. Control or Command and
        Enter captures and keeps the project and date. Up and Down choose a
        suggestion.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {status === "ready" ? (
            <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
              {list.length} {list.length === 1 ? "task" : "tasks"}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-pressed={legendOpen}
          aria-controls={legendOpen ? legendId : undefined}
          onClick={() => setLegendOverride({ base: legend, open: !legendOpen })}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
            legendOpen
              ? "bg-surface-2 text-foreground"
              : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <Info aria-hidden className="size-3.5" />
          Legend
        </button>
      </header>

      <AnimatePresence initial={false}>
        {legendOpen ? (
          <motion.div
            key="legend"
            id={legendId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitFor() }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
            className="shrink-0 overflow-hidden"
          >
            <dl className="mx-4 mb-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-3 border border-hairline bg-surface-1 px-3 py-2.5 @min-[40rem]:grid-cols-5 @min-[40rem]:gap-x-2">
              {KIND_ORDER.map((kind) => (
                <div key={kind} className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: KIND_COLOR[kind] }}
                  />
                  <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {KIND_WORD[kind]}
                  </dt>
                  <dd className="min-w-0 truncate font-mono text-[11px] text-ink-2">
                    {KIND_SAMPLE[kind]}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* The field, its chips and the suggestions. */}
      <div className="relative shrink-0 px-4 pb-2.5">
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-3 border bg-surface-0 px-2.5 transition-colors",
            focused ? "border-border" : "border-hairline-strong",
            inert && "cursor-not-allowed",
            d.field,
            d.text,
          )}
        >
          <div className="relative min-w-[8rem] flex-1">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-transparent"
            >
              <span style={{ transform: `translateX(${-shift}px)` }}>
                {mirror}
              </span>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={text}
              placeholder={placeholder}
              disabled={inert}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={listOpen}
              aria-controls={listOpen ? listId : undefined}
              aria-activedescendant={
                listOpen && activeItem ? optionId(activeItem.id) : undefined
              }
              aria-describedby={hintId}
              aria-label={`${title} field`}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => {
                const el = event.currentTarget;
                setText(el.value);
                setCaret(el.selectionStart ?? el.value.length);
              }}
              onSelect={(event) =>
                setCaret(event.currentTarget.selectionStart ?? 0)
              }
              onScroll={(event) => setShift(event.currentTarget.scrollLeft)}
              onKeyDown={onFieldKey}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="relative block w-full bg-transparent text-foreground outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
            />
          </div>
          {chipPlacement === "inline" ? (
            <div
              aria-label="Recognised"
              className="flex min-w-0 flex-wrap items-center gap-1"
            >
              {chips}
            </div>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => capture(false)}
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
              inert && "pointer-events-none",
            )}
          >
            <CornerDownLeft className="size-3.5" />
          </button>
        </div>

        {chipPlacement === "below" ? (
          <div
            aria-label="Recognised"
            className={cn(
              "flex min-h-[34px] min-w-0 flex-wrap items-center gap-1 overflow-hidden pt-1.5",
            )}
          >
            {chips}
            {!hasChips ? (
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Enter captures
                <span className="hidden @min-[40rem]:inline">
                  {" "}
                  · Ctrl or Cmd + Enter keeps project and date
                </span>
              </span>
            ) : null}
          </div>
        ) : null}

        <AnimatePresence>
          {listOpen && suggest ? (
            <motion.ul
              key={`${suggest.kind}-${suggest.start}`}
              id={listId}
              role="listbox"
              aria-label={suggest.kind === "project" ? "Projects" : "People"}
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="absolute top-full right-4 left-4 z-20 -mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)] @min-[40rem]:right-auto @min-[40rem]:w-72"
            >
              {suggest.items.map((item, i) => {
                const isActive = activeItem?.id === item.id;
                return (
                  <li
                    key={item.id}
                    id={optionId(item.id)}
                    role="option"
                    aria-selected={isActive}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => accept(item)}
                    onPointerMove={() => {
                      if (!isActive)
                        setActiveOpt({ key: suggestKey, index: i });
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-2 px-2 py-1.5 text-[13px]",
                      isActive ? "bg-surface-2 text-foreground" : "text-ink-2",
                    )}
                  >
                    {suggest.kind === "project" ? (
                      <Hash aria-hidden className="size-3.5 text-ink-3" />
                    ) : (
                      <AtSign aria-hidden className="size-3.5 text-ink-3" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="font-mono text-[11px] text-ink-3">
                      {suggest.kind === "project" ? "#" : "@"}
                      {item.slug}
                    </span>
                  </li>
                );
              })}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {status === "error" ? (
          <motion.div
            key="error"
            role="alert"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="mx-4 mb-2.5 flex shrink-0 items-center gap-2 rounded-3 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-3 py-2 text-xs text-foreground"
          >
            <TriangleAlert
              aria-hidden
              className="size-4 shrink-0 text-danger"
            />
            <span className="min-w-0 flex-1">
              Capture failed. The task is still in the field.
            </span>
            <button
              type="button"
              onClick={retry}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Retry
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-1.5 px-4 py-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="h-4 flex-1 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    maxWidth: `${52 + ((i * 17) % 30)}%`,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
                <span
                  className="ml-auto h-4 w-14 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90 + 40}ms` }}
                />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <Inbox aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-ink-2">No tasks yet.</p>
            <p className="text-xs text-ink-3">
              Type one above and press Enter.
            </p>
          </div>
        ) : (
          <ul
            role="listbox"
            aria-label="Captured tasks"
            className="flex flex-col px-2 py-1.5"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {list.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  index={i}
                  parts={taskParts(task, projects, people, now)}
                  active={task.id === activeRow}
                  density={density}
                  disabled={disabled}
                  motionSafe={motionSafe}
                  step={step}
                  nodeRef={(node) => {
                    if (node) rowNodes.current.set(task.id, node);
                    else rowNodes.current.delete(task.id);
                  }}
                  onFocus={() => setActiveTask(task.id)}
                  onRemove={() => remove(task.id)}
                  onNav={(event) => onRowNav(event, i)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {stickyCount > 0 ? (
        <p className="sr-only">
          {stickyCount === 1 ? "One chip is" : "Two chips are"} kept for the
          next task.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
