"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PlainDateWeekStart = "mon" | "sun" | "sat";
export type PlainDateFormat = "short" | "long" | "iso" | "relative";

export type PlainDateProps = {
  /** What the date is for. Shown above the field and tied to it. */
  label: string;
  /**
   * The moment phrases are read against. Pass it from the host — a fixed
   * moment, or one taken in an effect — never `new Date()` during render.
   */
  now: Date;
  /** Controlled committed date. `null` is no date. */
  value?: Date | null;
  /** Committed date when uncontrolled. @default null */
  defaultValue?: Date | null;
  /** Fires from the Enter, chip click or blur that committed it. */
  onValueChange?: (value: Date | null, detail: { hasTime: boolean }) => void;
  /** The phrase the field starts with, uncommitted. */
  defaultText?: string;
  /** @default "tomorrow 9am" */
  placeholder?: string;
  /** The calendar's first column, and where "this week" ends. @default "mon" */
  weekStart?: PlainDateWeekStart;
  /** How the chip writes the date. @default "short" */
  format?: PlainDateFormat;
  /** Show the mini calendar beside the field. @default true */
  calendar?: boolean;
  /** Read only the exact grammar and never guess between readings. @default false */
  strict?: boolean;
  /** Chime when the date changes, click when it is set. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------------------------------------------ dates */

const DAY_MS = 86_400_000;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
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
] as const;
const FIRST_DAY: Record<PlainDateWeekStart, number> = {
  sun: 0,
  mon: 1,
  sat: 6,
};
/** Each day of the week has its own chime: a pentatonic step from the week's start. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14] as const;

const r2 = (v: number) => Math.round(v * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, "0");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const weekdayName = (i: number) => WEEKDAYS[i] ?? "";
const monthName = (i: number) => MONTHS[i] ?? "";

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Whole days from a to b; rounded, so a daylight-saving day still counts as one. */
const daysBetween = (a: Date, b: Date) =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
const daysIn = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();
const weekStartOf = (d: Date, first: number) =>
  addDays(d, -((d.getDay() - first + 7) % 7));

const clock12 = (d: Date) => {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad2(d.getMinutes())} ${h < 12 ? "am" : "pm"}`;
};
const clock24 = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function relativeOf(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  const n = Math.abs(days);
  const span = n >= 14 && n % 7 === 0 ? `${n / 7} weeks` : `${n} days`;
  return days > 0 ? `in ${span}` : `${span} ago`;
}

/** The date as a sentence: "Friday 23 October 2026 at 3:00 pm". */
function spoken(r: PlainDateReading): string {
  const d = r.date;
  const day = `${weekdayName(d.getDay())} ${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`;
  return r.hasTime ? `${day} at ${clock12(d)}` : day;
}

/**
 * A date written back as a phrase this field reads: "fri 23 oct 3:00pm".
 * Used when the host sets a value the field did not report.
 */
function phraseOf(date: Date, now: Date): string {
  const wd = weekdayName(date.getDay()).slice(0, 3).toLowerCase();
  const mo = monthName(date.getMonth()).slice(0, 3).toLowerCase();
  const year =
    date.getFullYear() !== now.getFullYear() ||
    startOfDay(date) < startOfDay(now)
      ? ` ${date.getFullYear()}`
      : "";
  const h = date.getHours();
  const m = date.getMinutes();
  const time =
    h === 0 && m === 0
      ? ""
      : ` ${h % 12 || 12}:${pad2(m)}${h < 12 ? "am" : "pm"}`;
  return `${wd} ${date.getDate()} ${mo}${year}${time}`;
}

/* ---------------------------------------------------------------- grammar */

export type PlainDateReading = {
  date: Date;
  hasTime: boolean;
  /** The chip's second-line note: "next week" / "this week" for a split phrase, else how far off. */
  note: string;
  /** How far off, always: "in 10 days". */
  relative: string;
  key: string;
};

type Role = "used" | "filler" | "skipped" | "stop" | "typing";
type Token = { raw: string; word: string; start: number; end: number };
type DaySpec =
  | { kind: "offset"; days: number }
  | { kind: "weekday"; weekday: number; mode: "bare" | "this" | "next" }
  | { kind: "date"; month: number; day: number; year: number | null };

type Parse = {
  tokens: Token[];
  roles: Role[];
  readings: PlainDateReading[];
  /** Two readings, and choosing between them is a guess. */
  ambiguous: boolean;
  /** What stopped the parse, in words. */
  problem: string | null;
  /** The phrase is not finished; what it still needs. */
  prompt: string | null;
  /** Words the forgiving reader passed over. */
  skipped: string[];
};

const TOKEN = /\p{L}+|\p{Nd}+(?::\p{Nd}+)?\p{L}*|[^\s\p{L}\p{Nd}]/gu;
const FILLER = new Set(["at", "on", "the", "of", "by", ",", ".", ";", "@"]);
const WEEKDAY_WORDS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};
const MONTH_WORDS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};
const TOMORROW_LOOSE = new Set(["tmrw", "tmr", "tmw", "tmro"]);
/** Whole words a forgiving reader lets a unique prefix stand for. */
const LOOSE: readonly (readonly [string, string])[] = [
  ...WEEKDAYS.map((w, i) => [w.toLowerCase(), `wd${i}`] as const),
  ...MONTHS.map((m, i) => [m.toLowerCase(), `mo${i}`] as const),
  ["today", "today"],
  ["tomorrow", "tomorrow"],
  ["noon", "noon"],
  // Listed so "th" is not read as Thursday while "this" is being typed.
  ["this", "this"],
];
/** Every word the grammar knows, to tell a word still being typed from a wrong one. */
const VOCAB = [
  ...Object.keys(WEEKDAY_WORDS),
  ...Object.keys(MONTH_WORDS),
  ...LOOSE.map(([w]) => w),
  "in",
  "this",
  "next",
  "day",
  "days",
  "week",
  "weeks",
  "am",
  "pm",
  "midday",
];

function loose(word: string): string | null {
  if (word.length < 2) return null;
  const hits = new Set(
    LOOSE.filter(([full]) => full.startsWith(word)).map(([, id]) => id),
  );
  return hits.size === 1 ? ([...hits][0] ?? null) : null;
}

/**
 * The grammar, read left to right over word tokens (positions kept, so the
 * field can light the words it used):
 *
 *   today | tomorrow | in <n> days|weeks | [this|next] <weekday>
 *   | <month> <day> [<year>] | <day> <month> [<year>]
 *   + an optional time anywhere: 3pm, 3 pm, 3:30pm, 15:00, noon
 *
 * "at", "on", "the", "of" and punctuation are filler. Forgiving mode also
 * takes short forms (tmrw, 2w), unique prefixes (fr, oct), a bare hour after
 * a day, and skips words it does not know. It never throws: every failure is
 * a `problem` or a `prompt`.
 */
function readPhrase(
  text: string,
  now: Date,
  first: number,
  strict: boolean,
): Parse {
  const tokens: Token[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    tokens.push({
      raw: m[0],
      word: m[0].normalize("NFKC").toLowerCase(),
      start,
      end: start + m[0].length,
    });
  }
  const n = tokens.length;
  const roles: Role[] = tokens.map((t) =>
    FILLER.has(t.word) ? "filler" : "skipped",
  );
  const skipped: string[] = [];
  // Declared through `as`, so the reads after the loop are not narrowed to
  // the initial null: the closures below assign them.
  let day = null as DaySpec | null;
  let dayAt = -1;
  let check = null as { weekday: number; at: number } | null;
  let clock = null as { h: number; m: number } | null;
  let problem = null as string | null;
  let prompt = null as string | null;

  const next = (from: number) => {
    let j = from;
    while (j < n && roles[j] === "filler") j += 1;
    return j;
  };
  const word = (j: number) => tokens[j]?.word ?? "";
  const raw = (j: number) => tokens[j]?.raw ?? "";
  const mark = (...at: number[]) => {
    for (const j of at) roles[j] = "used";
  };
  const stop = (at: number, message: string) => {
    if (problem !== null) return;
    problem = message;
    roles[at] = "stop";
  };
  const ask = (message: string) => {
    if (prompt === null) prompt = message;
  };
  /** The last word, touching the end of the text, that could still grow into a known one. */
  const growing = (j: number) => {
    const t = tokens[j];
    if (!t || j !== n - 1 || t.end !== text.length) return false;
    return (
      /^\p{L}+$/u.test(t.word) &&
      VOCAB.some((v) => v !== t.word && v.startsWith(t.word))
    );
  };
  const weekdayOf = (w: string): number | null => {
    const exact = WEEKDAY_WORDS[w];
    if (exact !== undefined) return exact;
    const id = strict ? null : loose(w);
    return id?.startsWith("wd") ? Number(id.slice(2)) : null;
  };
  const monthOf = (w: string): number | null => {
    const exact = MONTH_WORDS[w];
    if (exact !== undefined) return exact;
    const id = strict ? null : loose(w);
    return id?.startsWith("mo") ? Number(id.slice(2)) : null;
  };
  const unitOf = (w: string): number | null => {
    if (w === "day" || w === "days") return 1;
    if (w === "week" || w === "weeks") return 7;
    if (strict || w === "") return null;
    if (w === "d" || "days".startsWith(w)) return 1;
    if (w === "w" || w === "wk" || w === "wks" || "weeks".startsWith(w)) {
      return 7;
    }
    return null;
  };
  const meridiem = (s: string): "am" | "pm" | null => {
    if (s === "am" || s === "pm") return s;
    if (!strict && (s === "a" || s === "p")) return s === "a" ? "am" : "pm";
    return null;
  };

  const setDay = (spec: DaySpec, at: number) => {
    if (day === null) {
      day = spec;
      dayAt = at;
      return;
    }
    // A weekday beside a date is a check on it, not a second day.
    if (
      spec.kind === "date" &&
      day.kind === "weekday" &&
      day.mode === "bare" &&
      check === null
    ) {
      check = { weekday: day.weekday, at: dayAt };
      day = spec;
      dayAt = at;
      return;
    }
    if (
      spec.kind === "weekday" &&
      spec.mode === "bare" &&
      day.kind === "date" &&
      check === null
    ) {
      check = { weekday: spec.weekday, at };
      return;
    }
    stop(at, "Two days there. Keep one");
  };
  const setClock = (h: number, m: number, at: number) => {
    if (clock !== null) {
      stop(at, "Two times there. Keep one");
      return;
    }
    clock = { h, m };
  };

  const readNumber = (i: number, m: RegExpExecArray): number => {
    const value = Number(m[1]);
    const minutes = m[2];
    const suffix = m[3] ?? "";
    const j = next(i + 1);
    const own = meridiem(suffix);
    const after = suffix === "" ? meridiem(word(j)) : null;

    // A time: 3pm, 3:30pm, 3 pm, 15:00.
    if (own || after || minutes !== undefined) {
      if (suffix !== "" && !own) {
        stop(i, `Didn’t catch “${raw(i)}”`);
        return i;
      }
      const half = own ?? after;
      const mm = minutes === undefined ? 0 : Number(minutes);
      let h = value;
      if (half) {
        if (value < 1 || value > 12) {
          stop(i, "Hours run 1 to 12 with am or pm");
          return i;
        }
        h = (value % 12) + (half === "pm" ? 12 : 0);
      } else if (value > 23) {
        stop(i, "Hours run 0 to 23 on a 24-hour clock");
        return i;
      }
      if (mm > 59) {
        stop(i, "Minutes run 0 to 59");
        return i;
      }
      mark(i);
      if (after) mark(j);
      setClock(h, mm, i);
      return after ? j : i;
    }

    // A day of the month before its month: 23 oct, 23rd of october 2027.
    const ordinal = /^(st|nd|rd|th)$/.test(suffix);
    if (suffix === "" || ordinal) {
      const mo = monthOf(word(j));
      if (mo !== null) {
        mark(i, j);
        const k = next(j + 1);
        const year = /^\d{4}$/.test(word(k)) ? Number(word(k)) : null;
        if (year !== null) mark(k);
        setDay({ kind: "date", month: mo, day: value, year }, i);
        return year !== null ? k : j;
      }
      if (ordinal) {
        if (j >= n) {
          mark(i);
          ask(`The ${raw(i)} of which month?`);
        } else {
          stop(i, `The ${raw(i)} of which month?`);
        }
        return i;
      }
    }

    // A compact span: 2w, 3d.
    if (suffix !== "") {
      const u = unitOf(suffix);
      if (u === null || strict) {
        stop(i, `Didn’t catch “${raw(i)}”`);
        return i;
      }
      mark(i);
      setDay({ kind: "offset", days: value * u }, i);
      return i;
    }

    // A span without its "in": 2 weeks.
    const u = unitOf(word(j));
    if (u !== null && j < n) {
      if (strict) {
        stop(i, `Start with “in”: in ${value} ${word(j)}`);
        return j;
      }
      mark(i, j);
      setDay({ kind: "offset", days: value * u }, i);
      return j;
    }

    if (value >= 1000) {
      stop(i, "A year goes after the date");
      return i;
    }
    // A bare hour: guessed from the working day when forgiving.
    if (!strict && value <= 23) {
      const h =
        value === 0 || value >= 12 ? value : value >= 7 ? value : value + 12;
      mark(i);
      setClock(h, 0, i);
      return i;
    }
    if (j >= n) {
      mark(i);
      ask(`${value} what? Add am or pm`);
      return i;
    }
    stop(i, `“${raw(i)}” needs am or pm`);
    return i;
  };

  const readIn = (i: number): number => {
    const j = next(i + 1);
    if (j >= n) {
      mark(i);
      ask("In how many days or weeks?");
      return i;
    }
    const w = word(j);
    const count = /^(\d+)(\p{L}*)$/u.exec(w);
    let amount: number | null = null;
    let unit: number | null = null;
    if (w === "a" || w === "an" || w === "one") amount = 1;
    else if (count) {
      amount = Number(count[1]);
      if (count[2]) {
        unit = strict ? null : unitOf(count[2]);
        if (unit === null) {
          stop(j, `Didn’t catch “${raw(j)}”`);
          return j;
        }
      }
    }
    if (amount === null) {
      if (growing(j)) {
        mark(i);
        roles[j] = "typing";
        ask("In how many days or weeks?");
        return j;
      }
      stop(j, "In how many days or weeks?");
      return j;
    }
    let last = j;
    if (unit === null) {
      const k = next(j + 1);
      if (k >= n) {
        mark(i, j);
        ask("Days or weeks?");
        return j;
      }
      unit = unitOf(word(k));
      if (unit === null) {
        if (growing(k)) {
          mark(i, j);
          roles[k] = "typing";
          ask("Days or weeks?");
          return k;
        }
        stop(k, "Days or weeks?");
        return k;
      }
      last = k;
      mark(k);
    }
    mark(i, j);
    if (amount * unit > 3660) {
      stop(j, "That is further out than this field looks");
      return last;
    }
    setDay({ kind: "offset", days: amount * unit }, i);
    return last;
  };

  const readRelative = (i: number, which: "this" | "next"): number => {
    const j = next(i + 1);
    const hint = `${capital(which)} what? A weekday`;
    if (j >= n) {
      mark(i);
      ask(hint);
      return i;
    }
    const wd = weekdayOf(word(j));
    if (wd === null) {
      if (growing(j)) {
        mark(i);
        roles[j] = "typing";
        ask(hint);
        return j;
      }
      stop(j, `“${which}” needs a weekday after it`);
      return j;
    }
    mark(i, j);
    setDay({ kind: "weekday", weekday: wd, mode: which }, i);
    return j;
  };

  const readMonth = (i: number, mo: number): number => {
    const j = next(i + 1);
    if (j >= n) {
      mark(i);
      ask(`Which day of ${monthName(mo)}?`);
      return i;
    }
    const d = /^(\d{1,2})(st|nd|rd|th)?$/.exec(word(j));
    if (!d) {
      stop(j, `Which day of ${monthName(mo)}?`);
      return j;
    }
    mark(i, j);
    const k = next(j + 1);
    const year = /^\d{4}$/.test(word(k)) ? Number(word(k)) : null;
    if (year !== null) mark(k);
    setDay({ kind: "date", month: mo, day: Number(d[1]), year }, i);
    return year !== null ? k : j;
  };

  let i = next(0);
  while (i < n && problem === null) {
    const w = word(i);
    let last = i;
    const num = /^(\d+)(?::(\d{1,2}))?(\p{L}*)$/u.exec(w);
    const wd = num ? null : weekdayOf(w);
    const mo = num || wd !== null ? null : monthOf(w);
    const alias = strict ? null : loose(w);
    if (num) last = readNumber(i, num);
    else if (w === "today" || alias === "today") {
      mark(i);
      setDay({ kind: "offset", days: 0 }, i);
    } else if (
      w === "tomorrow" ||
      alias === "tomorrow" ||
      (!strict && TOMORROW_LOOSE.has(w))
    ) {
      mark(i);
      setDay({ kind: "offset", days: 1 }, i);
    } else if (w === "noon" || w === "midday" || alias === "noon") {
      mark(i);
      setClock(12, 0, i);
    } else if (w === "in") last = readIn(i);
    else if (w === "this" || w === "next") last = readRelative(i, w);
    else if (wd !== null) {
      mark(i);
      setDay({ kind: "weekday", weekday: wd, mode: "bare" }, i);
    } else if (mo !== null) last = readMonth(i, mo);
    else if (growing(i)) roles[i] = "typing";
    else if (strict) stop(i, `Didn’t catch “${raw(i)}”`);
    else skipped.push(raw(i));
    i = next(last + 1);
  }

  const none: Parse = {
    tokens,
    roles,
    readings: [],
    ambiguous: false,
    problem,
    prompt: problem === null ? prompt : null,
    skipped,
  };
  if (problem !== null || (day === null && clock === null)) return none;

  const today = startOfDay(now);
  let bases: { date: Date; note: string | null }[] = [];
  let ambiguous = false;
  const spec = day as DaySpec | null;
  if (spec?.kind === "offset") {
    bases = [{ date: addDays(today, spec.days), note: null }];
  } else if (spec?.kind === "weekday") {
    const diff = (spec.weekday - today.getDay() + 7) % 7;
    if (spec.mode === "this") {
      bases = [{ date: addDays(today, diff), note: null }];
    } else if (spec.mode === "bare") {
      bases = [{ date: addDays(today, diff || 7), note: null }];
    } else {
      const coming = addDays(today, diff || 7);
      const weekEnd = addDays(weekStartOf(today, first), 7);
      if (coming < weekEnd) {
        // Said while its day is still ahead this week: this week's, or the
        // one in the week after. The literal "next week" leads.
        ambiguous = true;
        bases = [
          { date: addDays(coming, 7), note: "next week" },
          { date: coming, note: "this week" },
        ];
      } else {
        bases = [{ date: coming, note: null }];
      }
    }
  } else if (spec?.kind === "date") {
    let year = spec.year ?? today.getFullYear();
    // Without a year it is the next time the date comes round, today included.
    if (
      spec.year === null &&
      (spec.month < today.getMonth() ||
        (spec.month === today.getMonth() && spec.day < today.getDate()))
    ) {
      year += 1;
    }
    // 29 February comes round in the next leap year.
    if (spec.year === null && spec.month === 1 && spec.day === 29) {
      while (daysIn(year, 1) < 29) year += 1;
    }
    const most = daysIn(year, spec.month);
    if (spec.day < 1 || spec.day > most) {
      stop(
        dayAt,
        spec.day > 31 || spec.day < 1
          ? `No month has a day ${spec.day}`
          : spec.year !== null
            ? `${monthName(spec.month)} ${year} has ${most} days`
            : spec.month === 1
              ? "February has 28 days, 29 in a leap year"
              : `${monthName(spec.month)} has ${most} days`,
      );
      return { ...none, problem, prompt: null };
    }
    const date = new Date(year, spec.month, spec.day);
    const said = check as { weekday: number; at: number } | null;
    if (said && said.weekday !== date.getDay()) {
      if (strict) {
        stop(
          said.at,
          `${date.getDate()} ${monthName(date.getMonth())} is a ${weekdayName(date.getDay())}`,
        );
        return { ...none, problem, prompt: null };
      }
      roles[said.at] = "skipped";
      skipped.push(raw(said.at));
    }
    bases = [{ date, note: null }];
  } else {
    // A time alone is the next time it comes round.
    const c = clock as { h: number; m: number } | null;
    const ahead =
      c !== null && c.h * 60 + c.m > now.getHours() * 60 + now.getMinutes();
    bases = [{ date: ahead ? today : addDays(today, 1), note: null }];
  }

  const t = clock as { h: number; m: number } | null;
  const readings = bases.map(({ date, note }) => {
    const at = t
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.h, t.m)
      : date;
    const relative = relativeOf(daysBetween(today, at));
    return {
      date: at,
      hasTime: t !== null,
      note: note ?? relative,
      relative,
      key: `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}${t ? `-${t.h}-${t.m}` : ""}`,
    };
  });
  return {
    tokens,
    roles,
    readings,
    ambiguous,
    problem: null,
    prompt,
    skipped,
  };
}

/* ------------------------------------------------------------------- face */

function faceOf(
  r: PlainDateReading,
  format: PlainDateFormat,
  now: Date,
): { primary: string; secondary: string } {
  const d = r.date;
  const year =
    d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : "";
  const wd = weekdayName(d.getDay());
  const mo = monthName(d.getMonth());
  const shortDate = `${wd.slice(0, 3)} ${d.getDate()} ${mo.slice(0, 3)}${year}`;
  const time = r.hasTime ? (format === "iso" ? clock24(d) : clock12(d)) : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  switch (format) {
    case "long":
      return {
        primary: `${wd} ${d.getDate()} ${mo}${year}`,
        secondary: join(time, r.note),
      };
    case "iso":
      return {
        primary: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        secondary: join(time, r.note),
      };
    case "relative":
      return {
        primary: capital(r.relative),
        secondary: join(shortDate, time),
      };
    default:
      return { primary: shortDate, secondary: join(time, r.note) };
  }
}

function sentenceOf(p: Parse, active: number | null): string {
  if (p.problem) return `${p.problem}.`;
  const [a, b] = p.readings;
  if (!a) return p.prompt ?? "";
  const tail = p.prompt ? ` ${p.prompt}` : "";
  if (b) {
    if (active === null) {
      return `Two readings: ${spoken(a)}, or ${spoken(b)}. Up and Down arrows choose.${tail}`;
    }
    const chosen = active === 1 ? b : a;
    const other = active === 1 ? a : b;
    return `${spoken(chosen)}, ${chosen.note}. Or ${spoken(other)}, ${other.note}. Up and Down arrows switch.${tail}`;
  }
  return `${spoken(a)}, ${a.relative}.${tail}`;
}

/* --------------------------------------------------------------- calendar */

type MonthProps = {
  year: number;
  month: number;
  first: number;
  today: Date;
  light: Date | null;
  solid: boolean;
  rings: Date[];
  motionSafe: boolean;
};

const cellAt = (i: number) => ({
  x: `${(i % 7) * 100}%`,
  y: `${Math.floor(i / 7) * 100}%`,
});

function MonthGrid({
  year,
  month,
  first,
  today,
  light,
  solid,
  rings,
  motionSafe,
}: MonthProps) {
  const start = weekStartOf(new Date(year, month, 1), first);
  const slot = (d: Date | null) => {
    if (!d) return -1;
    const i = daysBetween(start, d);
    return i >= 0 && i < 42 ? i : -1;
  };
  const lit = slot(light);
  const travel = motionSafe ? springs.snap : { duration: 0 };
  const fade = { duration: durations.fast, ease: easings.enter };

  return (
    <div className="relative grid grid-cols-7">
      <AnimatePresence initial={false}>
        {rings.map((d) => {
          const i = slot(d);
          if (i < 0) return null;
          return (
            <motion.span
              key={`ring-${d.getTime()}`}
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 grid aspect-square w-[calc(100%/7)] place-items-center"
              initial={{ ...cellAt(i), opacity: 0 }}
              animate={{ ...cellAt(i), opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ ...travel, opacity: fade }}
            >
              <span className="size-[84%] rounded-full border border-dashed border-cobalt-bright/70" />
            </motion.span>
          );
        })}
        {lit >= 0 ? (
          <motion.span
            key="light"
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 grid aspect-square w-[calc(100%/7)] place-items-center"
            initial={{
              ...cellAt(lit),
              opacity: 0,
              scale: motionSafe ? 0.6 : 1,
            }}
            animate={{ ...cellAt(lit), opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: motionSafe ? 0.6 : 1,
              transition: exitFor(durations.fast),
            }}
            transition={{
              ...travel,
              opacity: fade,
              scale: motionSafe ? springs.flick : { duration: 0 },
            }}
          >
            <span
              className={cn(
                "size-[84%] rounded-full transition-colors",
                solid
                  ? "bg-primary"
                  : "bg-cobalt-wash ring-1 ring-cobalt-bright/45 ring-inset",
              )}
            />
          </motion.span>
        ) : null}
      </AnimatePresence>
      {Array.from({ length: 42 }, (_, i) => {
        const d = addDays(start, i);
        const inMonth = d.getMonth() === month;
        const isToday = daysBetween(today, d) === 0;
        return (
          <span
            key={i}
            className={cn(
              "relative flex aspect-square items-center justify-center font-mono text-[10px] tabular-nums transition-colors @md:text-[11px]",
              i === lit
                ? solid
                  ? "font-medium text-primary-foreground"
                  : "font-medium text-cobalt-bright"
                : inMonth
                  ? "text-ink-2"
                  : "text-ink-3/45",
            )}
          >
            {d.getDate()}
            {isToday ? (
              <span className="absolute bottom-[8%] left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-current opacity-70" />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

type CalendarProps = Omit<MonthProps, "year" | "month"> & {
  focus: Date;
  direction: number;
  disabled: boolean;
};

/**
 * The month of the chosen reading, lighting its day. Moving within a month
 * the light hops; moving to another month the page turns 16px and the light
 * is already waiting on its day.
 */
function MiniCalendar({ focus, direction, disabled, ...month }: CalendarProps) {
  const year = focus.getFullYear();
  const m = focus.getMonth();
  const key = `${year}-${m}`;
  const letters = Array.from({ length: 7 }, (_, i) =>
    weekdayName((month.first + i) % 7).charAt(0),
  );
  const turn = {
    enter: (d: number) =>
      month.motionSafe
        ? { x: d * distances.shift, opacity: 0 }
        : { x: 0, opacity: 0 },
    rest: {
      x: 0,
      opacity: 1,
      transition: month.motionSafe
        ? { ...springs.glide, opacity: { duration: durations.base } }
        : { duration: durations.fast },
    },
    leave: (d: number) => ({
      x: month.motionSafe ? -d * distances.shift : 0,
      opacity: 0,
      transition: exitFor(durations.fast),
    }),
  };

  return (
    <div
      aria-hidden
      className={cn(
        // Beside the field when there is room for both. The calendar only
        // echoes the chip (it is hidden from assistive technology), so a
        // component too narrow for both keeps the field and lets it go.
        "hidden w-[140px] shrink-0 select-none @min-[340px]:block @md:w-[168px]",
        disabled && "opacity-50",
      )}
    >
      <div className="grid overflow-clip">
        <AnimatePresence initial={false} custom={direction}>
          <motion.p
            key={key}
            custom={direction}
            variants={turn}
            initial="enter"
            animate="rest"
            exit="leave"
            className="flex items-baseline justify-between gap-2 px-1 pb-1.5 text-[11px] [grid-area:1/1]"
          >
            <span className="truncate font-medium text-foreground">
              {monthName(m)}
            </span>
            <span className="font-mono text-ink-3 tabular-nums">{year}</span>
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="grid grid-cols-7 pb-0.5 text-center font-mono text-[9px] leading-4 text-ink-3 uppercase">
        {letters.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className="grid overflow-clip">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={key}
            custom={direction}
            variants={turn}
            initial="enter"
            animate="rest"
            exit="leave"
            className="[grid-area:1/1]"
          >
            <MonthGrid year={year} month={m} {...month} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- chip */

type ChipProps = {
  id: string;
  reading: PlainDateReading;
  format: PlainDateFormat;
  now: Date;
  selected: boolean;
  set: boolean;
  direction: number;
  motionSafe: boolean;
  disabled: boolean;
  /** Fly in from the phrase; false for chips already there when the field mounts. */
  arrive: boolean;
  originOf: () => { x: number; y: number } | null;
  onChoose: () => void;
};

const roll = {
  enter: ({ d, safe }: { d: number; safe: boolean }) => ({
    y: safe ? d * distances.step : 0,
    opacity: 0,
  }),
  rest: ({ safe }: { d: number; safe: boolean }) => ({
    y: 0,
    opacity: 1,
    transition: safe
      ? { ...springs.snap, opacity: { duration: durations.fast } }
      : { duration: durations.fast },
  }),
  leave: ({ d, safe }: { d: number; safe: boolean }) => ({
    y: safe ? -d * distances.step : 0,
    opacity: 0,
    transition: exitFor(durations.fast),
  }),
};

/**
 * One reading. It arrives out of the phrase: on mount it starts at the end of
 * the words that made it, level with the text, small and clear, and springs
 * to its place under the field. While the phrase changes it stays, and its
 * words roll to the new date.
 */
function Chip({
  id,
  reading,
  format,
  now,
  selected,
  set,
  direction,
  motionSafe,
  disabled,
  arrive,
  originOf,
  onChoose,
}: ChipProps) {
  const face = React.useRef<HTMLButtonElement | null>(null);
  // Whether it arrived by typing is decided once, when it mounts.
  const [flies] = React.useState(arrive);
  // Measured once, before any transform: a StrictMode re-run of the effect
  // replays the same flight rather than measuring a chip already in the air.
  const flight = React.useRef<{ dx: number; dy: number } | null>(null);

  React.useLayoutEffect(() => {
    const el = face.current;
    if (!el || !flies) return;
    const fade = animate(
      el,
      { opacity: [0, 1] },
      { duration: durations.fast, ease: easings.enter },
    );
    if (!motionSafe) {
      // Reduced motion arriving mid-flight lands the chip; it never hangs
      // where the interrupted flight left it.
      const land = animate(el, { x: 0, y: 0, scale: 1 }, { duration: 0 });
      return () => {
        fade.stop();
        land.stop();
      };
    }
    if (!flight.current) {
      const from = originOf();
      const rect = el.getBoundingClientRect();
      flight.current = from
        ? {
            dx: r2(from.x - rect.left),
            dy: r2(from.y - (rect.top + rect.height / 2)),
          }
        : { dx: 0, dy: -distances.step };
    }
    const { dx, dy } = flight.current;
    const fly = animate(
      el,
      { x: [dx, 0], y: [dy, 0], scale: [0.55, 1] },
      springs.snap,
    );
    return () => {
      fade.stop();
      fly.stop();
    };
  }, [flies, motionSafe, originOf]);

  const { primary, secondary } = faceOf(reading, format, now);

  return (
    <motion.div
      role="none"
      className="max-w-full min-w-0"
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.92 : 1,
        transition: exitFor(durations.fast),
      }}
    >
      <button
        ref={face}
        id={id}
        type="button"
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        disabled={disabled}
        // A press must not take focus from the field: typing carries on.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onChoose}
        style={{ transformOrigin: "0% 50%" }}
        className={cn(
          "grid max-w-full min-w-0 rounded-2 border px-2.5 py-1.5 text-left transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed",
          set
            ? "border-transparent bg-primary text-primary-foreground"
            : selected
              ? "border-cobalt-bright/40 bg-cobalt-wash text-foreground"
              : "border-hairline-strong bg-surface-1 text-foreground enabled:hover:bg-surface-2",
        )}
      >
        <AnimatePresence
          initial={false}
          custom={{ d: direction, safe: motionSafe }}
        >
          <motion.span
            key={reading.key}
            custom={{ d: direction, safe: motionSafe }}
            variants={roll}
            initial="enter"
            animate="rest"
            exit="leave"
            className="flex min-w-0 flex-col [grid-area:1/1]"
          >
            <span className="flex items-center gap-1.5 text-xs leading-4 font-medium">
              {set ? (
                <svg
                  aria-hidden
                  viewBox="0 0 12 12"
                  className="size-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <motion.path
                    d="M2.5 6.4 5 8.8 9.6 3.4"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={springs.flick}
                  />
                </svg>
              ) : null}
              <span className="min-w-0">{primary}</span>
            </span>
            {secondary ? (
              <span
                className={cn(
                  "text-[11px] leading-4",
                  set ? "text-primary-foreground/75" : "text-ink-3",
                )}
              >
                {secondary}
              </span>
            ) : null}
          </motion.span>
        </AnimatePresence>
      </button>
    </motion.div>
  );
}

/* -------------------------------------------------------------- component */

const EXAMPLES = "Try “tomorrow”, “next fri 3pm”, “in 2 weeks”";

/**
 * A date field you type in words. It reads a small grammar of plain phrases
 * against `now` — today, tomorrow, next friday, in 2 weeks, oct 23, 3pm — and
 * shows what it understood three ways as you type: the words it used light
 * up in the field, the date slides out of the end of the phrase as a chip on
 * the snap spring, and a mini calendar lights the day, the light hopping on
 * snap as the date moves and the page turning when the month changes.
 *
 * A phrase with two readings ("next fri" while this Friday is still ahead)
 * offers both chips; ArrowDown and ArrowUp choose, a click or Enter sets.
 * Forgiving by default — short forms, prefixes, a bare hour, unknown words
 * skipped, the likelier reading pre-chosen — or `strict`, where it guesses
 * nothing. The field is a real input with the combobox pattern: typing,
 * selection, IME, paste and undo stay native, the readings are its options,
 * and the result is announced once typing settles. Under reduced motion the
 * chips and the light fade in place instead of travelling.
 */
export function PlainDate({
  label,
  now,
  value,
  defaultValue,
  onValueChange,
  defaultText,
  placeholder = "tomorrow 9am",
  weekStart = "mon",
  format = "short",
  calendar = true,
  strict = false,
  sound = false,
  disabled = false,
  className,
}: PlainDateProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const baseId = React.useId();
  const inputId = `${baseId}-field`;
  const listId = `${baseId}-readings`;
  const hintId = `${baseId}-hint`;
  const optionId = (i: number) => `${baseId}-reading-${i}`;
  const first = FIRST_DAY[weekStart] ?? 1;
  const nowTime = now.getTime();

  const [text, setText] = React.useState(
    () => defaultText ?? (defaultValue ? phraseOf(defaultValue, now) : ""),
  );
  const [own, setOwn] = React.useState<Date | null>(defaultValue ?? null);
  const committed = value !== undefined ? value : own;
  const committedTime = committed ? committed.getTime() : null;

  // A host that moves the value to a date this field did not report: the
  // field says it back in words it can read.
  const [heard, setHeard] = React.useState(committedTime);
  const [reported, setReported] = React.useState(committedTime);
  const [savedText, setSavedText] = React.useState(text);
  if (committedTime !== heard) {
    setHeard(committedTime);
    if (committedTime !== reported) {
      const said = committed ? phraseOf(committed, new Date(nowTime)) : "";
      setText(said);
      setSavedText(said);
      setReported(committedTime);
    }
  }

  const parse = React.useMemo(
    () => readPhrase(text, new Date(nowTime), first, strict),
    [text, nowTime, first, strict],
  );
  const readings = parse.readings;
  const readingKey = readings.map((r) => r.key).join("|");
  const pending = parse.prompt !== null;
  const fallbackOf = (p: Parse) =>
    p.readings.length === 0 || (p.ambiguous && strict) ? null : 0;
  const [pick, setPick] = React.useState<{ key: string; index: number } | null>(
    null,
  );
  const active =
    pick !== null && pick.key === readingKey && pick.index < readings.length
      ? pick.index
      : fallbackOf(parse);
  const chosen = active === null ? null : (readings[active] ?? null);

  // The chips roll the way time moved; the calendar turns the way the month did.
  const leadTime = readings[0]?.date.getTime() ?? null;
  const [lastLead, setLastLead] = React.useState(leadTime);
  const [rollDir, setRollDir] = React.useState(1);
  if (leadTime !== lastLead) {
    if (leadTime !== null && lastLead !== null) {
      setRollDir(leadTime > lastLead ? 1 : -1);
    }
    setLastLead(leadTime);
  }
  const focusDate =
    chosen?.date ?? readings[0]?.date ?? committed ?? new Date(nowTime);
  const monthIndex = focusDate.getFullYear() * 12 + focusDate.getMonth();
  const [lastMonth, setLastMonth] = React.useState(monthIndex);
  const [monthDir, setMonthDir] = React.useState(1);
  if (monthIndex !== lastMonth) {
    setMonthDir(monthIndex > lastMonth ? 1 : -1);
    setLastMonth(monthIndex);
  }

  const [announcement, setAnnouncement] = React.useState("");
  // Chips fly out of the phrase only once someone has typed: the ones the
  // field opens with are already in place when the page arrives.
  const [typed, setTyped] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const mirrorRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const composing = React.useRef(false);
  const announceTimer = React.useRef<number | null>(null);
  const nudging = React.useRef<AnimationPlaybackControls | null>(null);
  const scrollX = useMotionValue(0);

  const syncScroll = React.useCallback(() => {
    const el = inputRef.current;
    if (el) scrollX.set(-el.scrollLeft);
  }, [scrollX]);
  React.useLayoutEffect(() => syncScroll(), [text, syncScroll]);

  React.useEffect(
    () => () => {
      if (announceTimer.current !== null) {
        window.clearTimeout(announceTimer.current);
      }
      nudging.current?.stop();
    },
    [],
  );

  /** Where a chip starts: the end of the last word read, level with the text. */
  const originOf = React.useCallback(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return null;
    const box = input.getBoundingClientRect();
    const lastWord = mirror.querySelector<HTMLElement>("[data-last]");
    const shelf = mirror.getBoundingClientRect();
    const x = lastWord
      ? shelf.left +
        lastWord.offsetLeft +
        lastWord.offsetWidth -
        input.scrollLeft
      : box.left + 12;
    return {
      x: Math.min(Math.max(x, box.left + 12), box.right - 12),
      y: box.top + box.height / 2,
    };
  }, []);

  const panOf = () => {
    const el = inputRef.current;
    if (!el) return 0;
    const box = el.getBoundingClientRect();
    return panFrom(box.left + box.width / 2, null);
  };

  const chime = (r: PlainDateReading) => {
    const column = (r.date.getDay() - first + 7) % 7;
    audio.play("chime", {
      pitch: r2(0.8 * semitones(PENTATONIC[column] ?? 0)),
      gain: 0.3,
      pan: r2((column / 6 - 0.5) * 1.1),
    });
  };

  const announceLater = (sentence: string) => {
    if (announceTimer.current !== null) {
      window.clearTimeout(announceTimer.current);
    }
    announceTimer.current = window.setTimeout(() => {
      announceTimer.current = null;
      setAnnouncement(sentence);
    }, 900);
  };

  /** A new phrase, from typing, paste, autofill, undo or the end of an IME run. */
  const heardText = (next: string) => {
    const p = readPhrase(next, new Date(nowTime), first, strict);
    const key = p.readings.map((r) => r.key).join("|");
    const nextActive = key === readingKey ? active : fallbackOf(p);
    const nextChosen =
      nextActive === null ? null : (p.readings[nextActive] ?? null);
    if (nextChosen && nextChosen.key !== chosen?.key) chime(nextChosen);
    announceLater(sentenceOf(p, nextActive));
  };

  const commit = (reading: PlainDateReading | null) => {
    if (announceTimer.current !== null) {
      window.clearTimeout(announceTimer.current);
      announceTimer.current = null;
    }
    const time = reading ? reading.date.getTime() : null;
    setSavedText(text);
    setReported(time);
    if (value === undefined) setOwn(time === null ? null : new Date(time));
    audio.play("click", { gain: 0.5, pitch: 1.05, pan: panOf() });
    setAnnouncement(reading ? `Set: ${spoken(reading)}.` : "Date cleared.");
    onValueChange?.(time === null ? null : new Date(time), {
      hasTime: reading?.hasTime ?? false,
    });
  };

  /** Replaces the text through the editing command, so undo can bring it back. */
  const replaceText = (next: string) => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    let done = false;
    try {
      done =
        next === ""
          ? document.execCommand("delete")
          : document.execCommand("insertText", false, next);
    } catch {
      done = false;
    }
    if (!done || el.value !== next) {
      setText(next);
      setTyped(true);
      heardText(next);
    }
  };

  const nudge = () => {
    const list = listRef.current;
    if (!list || !motionSafe) return;
    nudging.current?.stop();
    nudging.current = animate(
      list,
      { y: [0, -distances.nudge, 0] },
      { duration: durations.base, ease: easings.move },
    );
  };

  const choose = (index: number) => {
    const r = readings[index];
    if (!r) return;
    setPick({ key: readingKey, index });
    if (r.key !== chosen?.key) chime(r);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composing.current) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const count = readings.length;
      if (count === 0 || (count === 1 && active === 0)) return;
      event.preventDefault();
      const down = event.key === "ArrowDown";
      const next =
        active === null
          ? down
            ? 0
            : count - 1
          : (active + (down ? 1 : -1) + count) % count;
      choose(next);
      return;
    }
    if (event.key === "Enter") {
      if (text.trim() === "") {
        if (committed !== null) {
          event.preventDefault();
          commit(null);
        }
        return;
      }
      if (chosen && !pending && chosen.date.getTime() === committedTime) {
        return;
      }
      event.preventDefault();
      if (!chosen || pending || parse.problem) {
        nudge();
        return;
      }
      commit(chosen);
      return;
    }
    if (event.key === "Escape" && text !== savedText) {
      event.preventDefault();
      replaceText(savedText);
    }
  };

  const onBlur = () => {
    if (disabled) return;
    if (text.trim() === "") {
      if (committed !== null) commit(null);
      return;
    }
    if (!chosen || pending || parse.problem) return;
    if (chosen.date.getTime() === committedTime) return;
    commit(chosen);
  };

  // The height of the chips and hint, measured and sprung. It clips only
  // below: a chip still flying up out of the phrase stays visible.
  const [shelf, setShelf] = React.useState<HTMLDivElement | null>(null);
  const shelfHeight = useMotionValue(-1);
  const shelfStyle = useTransform(shelfHeight, (h) =>
    h < 0 ? "auto" : `${h}px`,
  );
  React.useEffect(() => {
    if (!shelf) return;
    let run: AnimationPlaybackControls | null = null;
    const measure = () => {
      const h = r2(shelf.offsetHeight);
      if (shelfHeight.get() < 0 || !motionSafe) {
        run?.stop();
        shelfHeight.set(h);
        return;
      }
      if (h === shelfHeight.get()) return;
      run?.stop();
      run = animate(shelfHeight, h, springs.glide);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shelf);
    return () => {
      observer.disconnect();
      run?.stop();
    };
  }, [shelf, shelfHeight, motionSafe]);

  // The mirror: the same text, transparent, with the words it used washed.
  let lastUsed = -1;
  parse.roles.forEach((role, i) => {
    if (role === "used") lastUsed = i;
  });
  const segments: React.ReactNode[] = [];
  {
    let cursor = 0;
    let run: { start: number; end: number; last: boolean } | null = null;
    const flush = () => {
      if (!run) return;
      segments.push(
        <span
          key={`u${run.start}`}
          data-last={run.last || undefined}
          className="rounded-1 bg-cobalt-wash [box-shadow:0_0_0_2px_var(--accent-wash)]"
        >
          {text.slice(run.start, run.end)}
        </span>,
      );
      cursor = run.end;
      run = null;
    };
    parse.tokens.forEach((t, i) => {
      const role = parse.roles[i];
      // Filler and spaces inside a run of used words join the run, so the
      // phrase reads as one lit piece.
      if (role === "used" || (role === "filler" && run)) {
        if (!run) {
          if (t.start > cursor) segments.push(text.slice(cursor, t.start));
          run = { start: t.start, end: t.end, last: i === lastUsed };
        } else if (role === "used") {
          run.end = t.end;
          run.last = run.last || i === lastUsed;
        }
        return;
      }
      flush();
      if (t.start > cursor) segments.push(text.slice(cursor, t.start));
      segments.push(
        <span
          key={`t${t.start}`}
          className={cn(
            role === "skipped" &&
              "underline decoration-ink-3 decoration-dotted underline-offset-4",
            role === "stop" &&
              "underline decoration-danger decoration-wavy underline-offset-4",
          )}
        >
          {t.raw}
        </span>,
      );
      cursor = t.end;
    });
    flush();
    if (cursor < text.length) segments.push(text.slice(cursor));
  }

  const isSet = (r: PlainDateReading) => r.date.getTime() === committedTime;
  const empty = text.trim() === "";
  const skippedNote =
    parse.skipped.length > 0 && readings.length > 0
      ? ` · skipped “${parse.skipped.join(" ")}”`
      : "";
  let hint: { text: string; tone: "quiet" | "danger" | "done" };
  if (parse.problem) hint = { text: parse.problem, tone: "danger" };
  else if (empty) {
    hint = {
      text: committed !== null ? "Enter clears the date" : EXAMPLES,
      tone: "quiet",
    };
  } else if (readings.length === 0) {
    hint = {
      text:
        parse.prompt ??
        (parse.skipped.length > 0
          ? `Didn’t catch “${parse.skipped.join(" ")}”`
          : EXAMPLES),
      tone: "quiet",
    };
  } else if (pending) hint = { text: parse.prompt ?? "", tone: "quiet" };
  else if (chosen && isSet(chosen)) {
    hint = { text: `Set${skippedNote}`, tone: "done" };
  } else if (readings.length > 1 && active === null) {
    hint = {
      text: "Two readings · pick one with ↑\u00a0↓ or a click",
      tone: "quiet",
    };
  } else if (readings.length > 1) {
    hint = {
      text: `Two readings · ↑\u00a0↓ to switch · Enter sets${skippedNote}`,
      tone: "quiet",
    };
  } else hint = { text: `Enter sets it${skippedNote}`, tone: "quiet" };

  const light = chosen?.date ?? (readings.length === 0 ? committed : null);
  const solid = light !== null && light.getTime() === committedTime;
  const rings = readings.filter((r) => r !== chosen).map((r) => r.date);

  return (
    <div className={cn("@container relative w-full", className)}>
      <div className="flex items-start gap-4 @md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label
            htmlFor={inputId}
            className={cn("text-xs text-ink-3", disabled && "opacity-50")}
          >
            {label}
          </label>
          <div className="relative rounded-3 bg-surface-1">
            <div
              ref={mirrorRef}
              aria-hidden
              className="pointer-events-none absolute inset-px flex items-center overflow-clip rounded-3 px-3 text-sm"
            >
              <motion.span
                className="leading-5 whitespace-pre text-transparent"
                style={{ x: scrollX }}
              >
                {segments}
              </motion.span>
            </div>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              aria-expanded={readings.length > 0}
              aria-controls={readings.length > 0 ? listId : undefined}
              aria-autocomplete="none"
              aria-activedescendant={
                active !== null && readings.length > 0
                  ? optionId(active)
                  : undefined
              }
              aria-describedby={hintId}
              aria-invalid={parse.problem !== null || undefined}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
              placeholder={placeholder}
              value={text}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.value;
                setText(next);
                setTyped(true);
                if (!composing.current) heardText(next);
              }}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={(event) => {
                composing.current = false;
                heardText(event.currentTarget.value);
              }}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              onScroll={syncScroll}
              onSelect={syncScroll}
              className={cn(
                "relative block h-10 w-full min-w-0 rounded-3 border bg-transparent px-3 text-sm text-foreground transition-colors outline-none placeholder:text-ink-3",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed disabled:opacity-50",
                parse.problem
                  ? "border-danger/70"
                  : "border-input enabled:hover:border-ink-3/50",
              )}
            />
          </div>

          <motion.div
            style={{
              height: shelfStyle,
              clipPath: "inset(-240px -240px 0 -240px)",
            }}
          >
            <div ref={setShelf} className="flex flex-col gap-2 pt-1">
              {readings.length > 0 ? (
                <div
                  ref={listRef}
                  id={listId}
                  role="listbox"
                  aria-label={`Readings of “${text.trim()}”`}
                  aria-orientation="horizontal"
                  className="flex flex-wrap gap-1.5"
                >
                  <AnimatePresence initial={false}>
                    {readings.map((r, i) => (
                      <Chip
                        key={`slot-${i}`}
                        id={optionId(i)}
                        reading={r}
                        format={format}
                        now={now}
                        selected={active === i}
                        set={isSet(r)}
                        direction={rollDir}
                        motionSafe={motionSafe}
                        disabled={disabled}
                        arrive={typed}
                        originOf={originOf}
                        onChoose={() => {
                          choose(i);
                          commit(r);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : null}
              <p
                id={hintId}
                className={cn(
                  "text-[11px] leading-4",
                  hint.tone === "danger"
                    ? "text-danger"
                    : hint.tone === "done"
                      ? "text-signal"
                      : "text-ink-3",
                )}
              >
                {hint.text}
              </p>
            </div>
          </motion.div>
        </div>

        {calendar ? (
          <MiniCalendar
            focus={focusDate}
            direction={monthDir}
            disabled={disabled}
            first={first}
            today={new Date(nowTime)}
            light={light}
            solid={solid}
            rings={rings}
            motionSafe={motionSafe}
          />
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
