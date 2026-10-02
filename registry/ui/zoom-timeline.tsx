"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  frame,
  motion,
  motionValue,
  useIsPresent,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { Minus, Plus } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ZoomTimelineUnit = "year" | "month" | "day" | "hour" | "minute";

export type ZoomTimelineLevels =
  "years-minutes" | "years-days" | "months-hours" | "days-minutes";

export type ZoomTimelineTone = "default" | "success" | "warn" | "danger";

export type ZoomTimelineEvent = {
  /** Unique: the value that names this event. */
  id: string;
  /** When it happened: ms since the epoch, an ISO string (read as UTC unless it says otherwise) or a Date. */
  at: number | string | Date;
  /** One line: the marker's label and the start of its accessible name. */
  title: string;
  /** A second line, shown in the readout when the event is selected. */
  detail?: string;
  /** The marker's colour. @default "default" (the accent) */
  tone?: ZoomTimelineTone;
};

export type ZoomTimelineView = {
  /** The view's left and right edges, ms since the epoch. */
  start: number;
  end: number;
  /** The unit the axis is labelled in. */
  unit: ZoomTimelineUnit;
  /** Events inside the view. */
  visible: number;
  /** Counted bubbles inside the view. */
  bubbles: number;
};

export type ZoomTimelineProps = {
  /** The events to place. @default defaultTimelineEvents */
  events?: ZoomTimelineEvent[];
  /** Controlled: the selected event's id, or null. */
  value?: string | null;
  /** The selected event when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the press or key that selected an event (or cleared it, with null). */
  onValueChange?: (id: string | null) => void;
  /** The view once a gesture, a step or a coast has settled. */
  onViewChange?: (view: ZoomTimelineView) => void;
  /** Where the view opens. @default the middle of the events */
  defaultCenter?: number | string | Date;
  /** The unit the view opens on. @default the ladder's second unit */
  defaultUnit?: ZoomTimelineUnit;
  /** The zoom ladder: how far out and in the view can go. Changing it re-frames the view on its opening unit. @default "years-minutes" */
  levels?: ZoomTimelineLevels;
  /** How close markers get, in px, before they merge into a counted bubble; 0 never merges. @default 28 */
  cluster?: number;
  /** How far a throw coasts, 0 to 1: 0 stops almost under the finger, 1 glides a long way. @default 0.6 */
  momentum?: number;
  /** Draws a now line here. Passed in, never read from the clock, so the server and the browser agree. */
  now?: number | string | Date;
  /** Minutes added to UTC for every label and readout, e.g. 60 for UTC+1. @default 0 */
  utcOffset?: number;
  /** The timeline's accessible name. @default "Timeline" */
  label?: string;
  /** The readout's and every accessible name's time. @default "14 Mar 2026 14:20" (time only when it is not midnight) */
  formatTime?: (ms: number, unit: ZoomTimelineUnit) => string;
  /** Show the zoom out, unit and zoom in controls. @default true */
  zoomControls?: boolean;
  /** Total height, px: a 36px readout row, the marker lane and a 52px axis. @default 200 */
  height?: number;
  /** Selection, bubbles and the now line; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the ticks as the axis changes unit and the whoosh of a throw. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- defaults -------------------------------- */

const ev = (
  id: string,
  at: string,
  title: string,
  tone: ZoomTimelineTone = "default",
  detail?: string,
): ZoomTimelineEvent => ({ id, at, title, tone, detail });

/** The Fieldline Basin Road survey programme, 2025 to 2026. */
export const defaultTimelineEvents: ZoomTimelineEvent[] = [
  ev(
    "grant",
    "2025-01-14T10:00:00Z",
    "Grant awarded",
    "success",
    "Coldbrook Fund, three years",
  ),
  ev(
    "permits",
    "2025-02-03T09:00:00Z",
    "Permits filed",
    "default",
    "County water board",
  ),
  ev("approved", "2025-03-21T15:30:00Z", "Permits approved", "success"),
  ev(
    "walk",
    "2025-04-07T08:30:00Z",
    "Site walk",
    "default",
    "With the four landowners",
  ),
  ev(
    "order",
    "2025-05-12T11:00:00Z",
    "Sensors ordered",
    "default",
    "42 moisture probes",
  ),
  ev(
    "install",
    "2025-06-02T07:45:00Z",
    "Probes installed",
    "default",
    "14 plots, three depths",
  ),
  ev("gateway", "2025-06-03T16:20:00Z", "Gateway online"),
  ev("first", "2025-06-05T00:00:00Z", "First readings", "success"),
  ev(
    "drought",
    "2025-08-18T13:00:00Z",
    "Drought alert",
    "warn",
    "Moisture under 12% on 9 plots",
  ),
  ev(
    "a-crew",
    "2025-10-14T08:40:00Z",
    "Crew on site",
    "default",
    "Autumn field day",
  ),
  ev("a-p3", "2025-10-14T09:10:00Z", "Plot 3 cored"),
  ev("a-p7", "2025-10-14T10:25:00Z", "Plot 7 cored"),
  ev("a-p9", "2025-10-14T11:05:00Z", "Plot 9 cored"),
  ev("a-p12", "2025-10-14T13:30:00Z", "Plot 12 cored"),
  ev("a-lab", "2025-10-14T15:50:00Z", "Samples to lab", "success"),
  ev(
    "interim",
    "2025-11-20T12:00:00Z",
    "Interim report",
    "default",
    "Shared with the board",
  ),
  ev(
    "offline",
    "2025-12-09T03:14:00Z",
    "Probe 9 offline",
    "danger",
    "No readings for 41 hours",
  ),
  ev("board", "2026-01-15T14:00:00Z", "Board review"),
  ev(
    "s-crew",
    "2026-03-14T08:50:00Z",
    "Crew on site",
    "default",
    "Spring field day",
  ),
  ev("s-p3", "2026-03-14T09:15:00Z", "Plot 3 cored"),
  ev("s-p4", "2026-03-14T09:20:00Z", "Plot 4 cored"),
  ev("s-p9", "2026-03-14T10:40:00Z", "Plot 9 cored"),
  ev("s-p12", "2026-03-14T11:35:00Z", "Plot 12 cored"),
  ev(
    "s-p14",
    "2026-03-14T14:20:00Z",
    "Plot 14 resampled",
    "warn",
    "First core was cracked",
  ),
  ev("s-lab", "2026-03-14T16:05:00Z", "Samples to lab", "success"),
  ev("results", "2026-04-02T10:00:00Z", "Lab results back", "success"),
  ev(
    "season",
    "2026-05-18T09:00:00Z",
    "Season report",
    "default",
    "Published to Fieldline",
  ),
  ev("review", "2026-06-30T15:00:00Z", "Programme review"),
];

/* --------------------------------- time ---------------------------------- */

const DAY_MS = 86_400_000;

/** Whether the page has had the press or key that lets audio start. */
const activated = () =>
  typeof navigator === "undefined" ||
  !("userActivation" in navigator) ||
  navigator.userActivation.hasBeenActive;
const UNITS: ZoomTimelineUnit[] = ["year", "month", "day", "hour", "minute"];
const LADDERS: Record<ZoomTimelineLevels, ZoomTimelineUnit[]> = {
  "years-minutes": ["year", "month", "day", "hour", "minute"],
  "years-days": ["year", "month", "day"],
  "months-hours": ["month", "day", "hour"],
  "days-minutes": ["day", "hour", "minute"],
};
/** A unit's length in days, and the step between its ticks in its own index. */
const UNIT_DAYS: Record<ZoomTimelineUnit, number> = {
  year: 365.2425,
  month: 30.436875,
  day: 1,
  hour: 1 / 24,
  minute: 1 / 1440,
};
const BASE: Record<ZoomTimelineUnit, number> = {
  year: 1,
  month: 1,
  day: 1,
  hour: 1,
  minute: 5,
};
/** Label strides: the important ticks label first as room appears. */
const STRIDES: Record<ZoomTimelineUnit, number[]> = {
  year: [10, 5, 1],
  month: [6, 3, 1],
  day: [7, 1],
  hour: [12, 6, 3, 1],
  minute: [30, 15, 5],
};
const PLURAL: Record<ZoomTimelineUnit, string> = {
  year: "Years",
  month: "Months",
  day: "Days",
  hour: "Hours",
  minute: "Minutes",
};
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
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Label spacing, px: below LO a label is hidden, above HI fully drawn. */
const LO = 48;
const HI = 68;
/** Label slots per pool: a prime, so no two visible ticks share a slot. */
const POOL = 41;
const CTX_POOL = 5;
/** The width the server lays out for; the browser corrects it once measured. */
const NOMINAL_W = 1600;
const HEADER_H = 36;
const AXIS_H = 52;

const mod = (a: number, b: number) => ((a % b) + b) % b;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const pad2 = (n: number) => String(n).padStart(2, "0");

const toMs = (at: number | string | Date | undefined): number => {
  if (at === undefined) return NaN;
  if (typeof at === "number") return at;
  if (at instanceof Date) return at.getTime();
  return Date.parse(at);
};
const dateOf = (days: number) => new Date(Math.round(days * DAY_MS));

function indexAt(u: ZoomTimelineUnit, d: number): number {
  switch (u) {
    case "year":
      return dateOf(d).getUTCFullYear();
    case "month": {
      const t = dateOf(d);
      return t.getUTCFullYear() * 12 + t.getUTCMonth();
    }
    case "day":
      return Math.floor(d + 1e-9);
    case "hour":
      return Math.floor(d * 24 + 1e-7);
    case "minute":
      return Math.floor((d * 1440) / 5 + 1e-6) * 5;
  }
}

function posOf(u: ZoomTimelineUnit, k: number): number {
  switch (u) {
    case "year":
      return Date.UTC(k, 0, 1) / DAY_MS;
    case "month":
      return Date.UTC(Math.floor(k / 12), mod(k, 12), 1) / DAY_MS;
    case "day":
      return k;
    case "hour":
      return k / 24;
    case "minute":
      return k / 1440;
  }
}

/** The biggest stride a tick sits on, in its unit's index. */
function rankOf(u: ZoomTimelineUnit, k: number): number {
  // 1 Jan 1970 was a Thursday: day 4 is the first Monday.
  if (u === "day") return mod(k - 4, 7) === 0 ? 7 : 1;
  for (const s of STRIDES[u]) if (mod(k, s) === 0) return s;
  return BASE[u];
}

function tickText(u: ZoomTimelineUnit, k: number, spacing: number): string {
  if (u === "year") return String(k);
  if (u === "month") return MONTHS[mod(k, 12)] ?? "";
  if (u === "day") {
    const t = dateOf(k);
    return spacing >= 76
      ? `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()}`
      : String(t.getUTCDate());
  }
  if (u === "hour") return `${pad2(mod(k, 24))}:00`;
  return `${pad2(Math.floor(mod(k, 1440) / 60))}:${pad2(mod(k, 60))}`;
}

function contextText(u: ZoomTimelineUnit, k: number): string {
  if (u === "year") return String(k);
  if (u === "month") return `${MONTHS_LONG[mod(k, 12)]} ${Math.floor(k / 12)}`;
  const t = dateOf(posOf(u, k));
  const date = `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
  if (u === "day") return `${date} ${t.getUTCFullYear()}`;
  return `${date}, ${pad2(t.getUTCHours())}:00`;
}

const defaultFormat = (ms: number) => {
  const t = new Date(ms);
  const date = `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
  const hm = t.getUTCHours() * 60 + t.getUTCMinutes();
  return hm === 0
    ? date
    : `${date} ${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
};

/** The zoom (log2 px per day) at which a unit's base ticks sit `px` apart. */
const zoomFor = (u: ZoomTimelineUnit, px: number) =>
  Math.log2(px / (UNIT_DAYS[u] * BASE[u]));

/* ---------------------------- the drawn frame ---------------------------- */

type LabelOut = { slot: number; x: number; text: string; o: number };

type FrameOut = {
  primary: ZoomTimelineUnit;
  /** Labels per pool: even and odd units of the full list. */
  labels: [LabelOut[], LabelOut[]];
  context: [LabelOut[], LabelOut[]];
  ticks: [string, string];
  marks: [string, string];
  tickO: [number, number];
  minor: string;
  minorO: number;
};

/**
 * Everything the axis draws, from the view alone: which units are legible
 * (by the spacing of their sparsest labels), each label's opacity (by the
 * spacing of the biggest stride it sits on), the tick paths, and the sticky
 * context labels pinned to the left until the next one pushes them off.
 */
function computeFrame(
  c: number,
  z: number,
  w: number,
  ladder: ZoomTimelineUnit[],
  offset: number,
  laneH: number,
): FrameOut {
  const ppd = 2 ** z;
  const cd = c + offset / 1440;
  const half = w / 2 / ppd;
  const d0 = cd - half;
  const d1 = cd + half;
  const owns = ladder.map((u) =>
    smooth(LO, HI, UNIT_DAYS[u] * ppd * Math.max(...STRIDES[u])),
  );
  // A unit hands the axis to the next one through (almost) nothing, so the
  // two sets of labels never print over each other.
  const vis = ladder.map(
    (_, i) =>
      (i === 0 ? 1 : smooth(0.45, 0.9, owns[i] ?? 0)) *
      (1 - smooth(0.1, 0.55, owns[i + 1] ?? 0)),
  );
  let primary = ladder[0] ?? "month";
  owns.forEach((o, i) => {
    if (o >= 0.5) primary = ladder[i] ?? primary;
  });

  const out: FrameOut = {
    primary,
    labels: [[], []],
    context: [[], []],
    ticks: ["", ""],
    marks: ["", ""],
    tickO: [0, 0],
    minor: "",
    minorO: 0,
  };
  const y0 = laneH;
  let finest = -1;
  ladder.forEach((u, i) => {
    const v = vis[i] ?? 0;
    if (v <= 0.004) return;
    finest = Math.max(finest, UNITS.indexOf(u));
    const p = (UNITS.indexOf(u) % 2) as 0 | 1;
    const spacing = UNIT_DAYS[u] * ppd;
    const step = BASE[u];
    const ticks: string[] = [];
    const marks: string[] = [];
    let k = indexAt(u, d0);
    for (let guard = 0; guard < 900; guard += 1) {
      const at = posOf(u, k);
      if (at > d1) break;
      const x = r1((at - cd) * ppd);
      const a = v * smooth(LO, HI, spacing * rankOf(u, k));
      if (spacing * step >= 3) ticks.push(`M${x} ${y0}v4`);
      if (a > 0.25) marks.push(`M${x} ${y0}v8`);
      if (a > 0.01) {
        out.labels[p].push({
          slot: mod(k / step, POOL),
          x: r1(x + 4),
          text: tickText(u, k, spacing),
          o: r2(a),
        });
      }
      k += step;
    }
    out.ticks[p] = ticks.join("");
    out.marks[p] = marks.join("");
    out.tickO[p] = r2(Math.max(out.tickO[p], v));

    // The unit above names where you are, pinned to the left edge.
    const ci = UNITS.indexOf(u) - 1;
    const cu = UNITS[ci];
    if (!cu) return;
    const cp = (ci % 2) as 0 | 1;
    const left = -w / 2 + 10;
    let ck = indexAt(cu, d0);
    for (let guard = 0; guard < 12; guard += 1) {
      const start = posOf(cu, ck);
      if (start > d1) break;
      const end = posOf(cu, ck + BASE[cu]);
      const text = contextText(cu, ck);
      const est = text.length * 6.4 + 6;
      const xs = (start - cd) * ppd;
      const xe = (end - cd) * ppd;
      const x = Math.min(Math.max(xs + 4, left), xe - est - 10);
      if (x + est > -w / 2 && x < w / 2) {
        out.context[cp].push({
          slot: mod(ck / BASE[cu], CTX_POOL),
          x: r1(x),
          text,
          // Fading as the next one pushes it off the left edge.
          o: r2(v * smooth(est * 0.2, est, xe - left - 10)),
        });
      }
      ck += BASE[cu];
    }
  });

  // Minor ticks one unit finer than anything labelled.
  const mu = UNITS[finest + 1];
  if (mu) {
    const spacing = UNIT_DAYS[mu] * ppd * BASE[mu];
    if (spacing >= 3) {
      const ticks: string[] = [];
      let k = indexAt(mu, d0);
      for (let guard = 0; guard < 900; guard += 1) {
        const at = posOf(mu, k);
        if (at > d1) break;
        ticks.push(`M${r1((at - cd) * ppd)} ${y0}v3`);
        k += BASE[mu];
      }
      out.minor = ticks.join("");
      out.minorO = r2(0.7 * smooth(3, 10, spacing));
    }
  }
  return out;
}

/* -------------------------------- clusters ------------------------------- */

type Placed = {
  id: string;
  /** Days since the epoch. */
  t: number;
  ms: number;
  title: string;
  detail?: string;
  tone: ZoomTimelineTone;
  row: number;
  /** The next event in the same row, for room to label. */
  next: number | null;
};

type Cluster = {
  id: string;
  members: string[];
  mean: number;
  first: number;
  last: number;
  row: number;
};

/**
 * Markers closer than `radius` px chain into a bubble (its span capped at
 * three radii). A pair already joined holds until it is 10% further apart
 * than the radius, and a pair apart joins at 10% closer, so a bubble never
 * flickers at the edge.
 */
function clusterize(
  list: Placed[],
  ppd: number,
  radius: number,
  joined: Set<string>,
): { clusters: Cluster[]; pairs: Set<string> } {
  const pairs = new Set<string>();
  const clusters: Cluster[] = [];
  if (radius <= 0 || list.length < 2) return { clusters, pairs };
  let group: Placed[] = [];
  const close = () => {
    const head = group[0];
    const tail = group[group.length - 1];
    if (group.length >= 2 && head && tail) {
      clusters.push({
        id: head.id,
        members: group.map((g) => g.id),
        mean: group.reduce((s, g) => s + g.t, 0) / group.length,
        first: head.t,
        last: tail.t,
        row: head.row,
      });
    }
    group = [];
  };
  for (const item of list) {
    const prev = group[group.length - 1];
    const head = group[0];
    if (prev && head) {
      const key = `${prev.id}|${item.id}`;
      const th = radius * (joined.has(key) ? 1.1 : 0.9);
      const gap = (item.t - prev.t) * ppd;
      const span = (item.t - head.t) * ppd;
      if (gap < th && span < th * 3) {
        pairs.add(key);
        group.push(item);
        continue;
      }
      close();
    }
    group.push(item);
  }
  close();
  return { clusters, pairs };
}

const clusterKey = (list: Cluster[]) =>
  list.map((c) => c.members.join(",")).join(";");

/* ------------------------------- markers --------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const TONE_DOT: Record<ZoomTimelineTone, string> = {
  default: "bg-[var(--zoom-timeline-accent)]",
  success: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
};

type MarkerCommon = {
  center: MotionValue<number>;
  zoom: MotionValue<number>;
  laneH: number;
  rowY: number;
  motionSafe: boolean;
  disabled: boolean;
  tabbable: boolean;
  bind: React.RefCallback<HTMLButtonElement>;
  onPress: (el: HTMLButtonElement) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  name: string;
};

/**
 * One event. Its drawn time is its own time pulled toward its bubble's by a
 * `merge` value, which springs when it joins or leaves, so a split reads as
 * the members flying out of the bubble and a merge as them flying in.
 */
function EventMarker({
  item,
  anchor,
  clusterId,
  selected,
  center,
  zoom,
  laneH,
  rowY,
  motionSafe,
  disabled,
  tabbable,
  bind,
  onPress,
  onKeyDown,
  onFocus,
  name,
}: MarkerCommon & {
  item: Placed;
  anchor: number | null;
  clusterId: string | null;
  selected: boolean;
}) {
  const merge = useMotionValue(anchor !== null ? 1 : 0);
  const anchorAt = useMotionValue(anchor ?? item.t);
  const running = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    const target = clusterId !== null ? 1 : 0;
    if (clusterId !== null && anchor !== null) {
      // Re-anchored on a new bubble: keep where it is drawn, then fly in.
      const drawn = item.t + merge.get() * (anchorAt.get() - item.t);
      const span = anchor - item.t;
      anchorAt.set(anchor);
      merge.jump(Math.abs(span) > 1e-9 ? clamp01((drawn - item.t) / span) : 1);
    }
    running.current?.stop();
    if (!motionSafe) {
      merge.jump(target);
      return;
    }
    if (Math.abs(merge.get() - target) < 1e-4) return;
    running.current = animate(merge, target, springs.snap);
  }, [clusterId, anchor, motionSafe, item.t, merge, anchorAt]);

  React.useEffect(() => () => running.current?.stop(), []);

  const x = useTransform(
    [center, zoom, merge, anchorAt] as MotionValue<number>[],
    ([c = 0, z = 0, m = 0, a = 0]: number[]) =>
      r2((item.t + m * (a - item.t) - c) * 2 ** z),
  );
  const opacity = useTransform(merge, (m) => r2(1 - smooth(0.15, 0.85, m)));
  const labelW = Math.min(144, item.title.length * 6.2 + 22);
  const labelOpacity = useTransform(
    [zoom, merge] as MotionValue<number>[],
    ([z = 0, m = 0]: number[]) =>
      r2(
        (item.next === null
          ? 1
          : smooth(labelW, labelW + 28, (item.next - item.t) * 2 ** z)) *
          (1 - m),
      ),
  );
  const hidden = clusterId !== null;

  return (
    <motion.li
      className="absolute top-0 left-1/2"
      style={{ x, opacity }}
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      <span
        aria-hidden
        className={cn(
          "absolute w-px",
          selected ? "bg-[var(--zoom-timeline-accent)]" : "bg-hairline-strong",
        )}
        style={{
          left: 0,
          top: rowY + 5,
          height: Math.max(0, laneH - rowY - 5),
        }}
      />
      <button
        ref={bind}
        type="button"
        data-timeline-marker=""
        aria-label={name}
        aria-pressed={selected}
        tabIndex={tabbable && !hidden ? 0 : -1}
        disabled={disabled}
        onClick={(event) => onPress(event.currentTarget)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={cn(
          "absolute flex h-5 items-center gap-1.5 rounded-full pr-1.5 pl-[3px] whitespace-nowrap transition-colors",
          "enabled:hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] disabled:cursor-not-allowed",
          FOCUS_RING,
        )}
        style={{ left: -8, top: rowY - 10 }}
      >
        <span
          aria-hidden
          className={cn(
            "size-2.5 shrink-0 rounded-full ring-2 transition-[box-shadow,transform] duration-150",
            TONE_DOT[item.tone],
            selected
              ? "scale-125 ring-[color-mix(in_oklab,var(--zoom-timeline-accent)_40%,transparent)]"
              : "ring-card",
          )}
        />
        <motion.span
          aria-hidden
          className={cn(
            "max-w-36 truncate text-[11px] leading-none",
            selected ? "font-medium text-foreground" : "text-ink-2",
          )}
          style={{ opacity: labelOpacity }}
        >
          {item.title}
        </motion.span>
      </button>
    </motion.li>
  );
}

function ClusterMarker({
  cluster,
  center,
  zoom,
  laneH,
  rowY,
  motionSafe,
  disabled,
  tabbable,
  bind,
  onPress,
  onKeyDown,
  onFocus,
  name,
  holdsSelection,
}: MarkerCommon & { cluster: Cluster; holdsSelection: boolean }) {
  const mean = useMotionValue(cluster.mean);
  React.useEffect(() => {
    if (Math.abs(mean.get() - cluster.mean) < 1e-9) return;
    if (!motionSafe) {
      mean.jump(cluster.mean);
      return;
    }
    const a = animate(mean, cluster.mean, springs.snap);
    return () => a.stop();
  }, [cluster.mean, motionSafe, mean]);

  const x = useTransform(
    [center, zoom, mean] as MotionValue<number>[],
    ([c = 0, z = 0, m = 0]: number[]) => r2((m - c) * 2 ** z),
  );
  const size = 20 + Math.round(4 * Math.log2(cluster.members.length));
  // A bubble on its way out is not something to press or focus.
  const present = useIsPresent();

  return (
    <motion.li
      className="absolute top-0 left-1/2"
      style={{ x }}
      inert={!present}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.fast, ease: easings.enter }}
    >
      <span
        aria-hidden
        className="absolute w-px bg-[color-mix(in_oklab,var(--zoom-timeline-accent)_45%,transparent)]"
        style={{
          left: 0,
          top: rowY + size / 2,
          height: Math.max(0, laneH - rowY - size / 2),
        }}
      />
      <motion.button
        ref={bind}
        type="button"
        data-timeline-marker=""
        aria-label={name}
        tabIndex={tabbable ? 0 : -1}
        disabled={disabled}
        onClick={(event) => onPress(event.currentTarget)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        initial={motionSafe ? { scale: 0.55 } : false}
        animate={{ scale: 1 }}
        exit={motionSafe ? { scale: 0.8 } : undefined}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        className={cn(
          "absolute flex items-center justify-center rounded-full border font-mono text-[11px] font-medium text-foreground tabular-nums transition-colors",
          "bg-[color-mix(in_oklab,var(--zoom-timeline-accent)_16%,var(--card))] enabled:hover:bg-[color-mix(in_oklab,var(--zoom-timeline-accent)_26%,var(--card))]",
          holdsSelection
            ? "border-[var(--zoom-timeline-accent)]"
            : "border-[color-mix(in_oklab,var(--zoom-timeline-accent)_50%,transparent)]",
          "disabled:cursor-not-allowed",
          FOCUS_RING,
        )}
        style={{
          width: size,
          height: size,
          left: -size / 2,
          top: rowY - size / 2,
        }}
      >
        {cluster.members.length}
      </motion.button>
    </motion.li>
  );
}

/* ------------------------------- component ------------------------------- */

type Slot = {
  x: MotionValue<number>;
  text: MotionValue<string>;
  o: MotionValue<number>;
};

const makeSlots = (count: number, init: LabelOut[]): Slot[] => {
  const byIndex = new Map(init.map((l) => [l.slot, l]));
  return Array.from({ length: count }, (_, i) => {
    const l = byIndex.get(i);
    return {
      x: motionValue(l?.x ?? 0),
      text: motionValue(l?.text ?? ""),
      o: motionValue(l?.o ?? 0),
    };
  });
};

const writeSlots = (slots: Slot[], list: LabelOut[]) => {
  const used = new Set<number>();
  for (const l of list) {
    const s = slots[l.slot];
    if (!s || used.has(l.slot)) continue;
    used.add(l.slot);
    s.x.set(l.x);
    if (s.text.get() !== l.text) s.text.set(l.text);
    s.o.set(l.o);
  }
  slots.forEach((s, i) => {
    if (!used.has(i) && s.o.get() !== 0) s.o.set(0);
  });
};

type Gesture = {
  pinch: { d0: number; z0: number; t0: number } | null;
  pointers: Map<number, { x: number; y: number }>;
  stale: boolean;
  startC: number;
};

type Api = {
  write: () => void;
  settle: () => void;
};

/**
 * A timeline you zoom from years to minutes. Ctrl or Cmd with the wheel (or
 * a trackpad pinch) zooms about the pointer on the flick spring, so the time
 * under it stays put; a two-finger pinch zooms 1:1 about the fingers; the +
 * and - keys and buttons step three times in or out on glide. The axis is
 * semantic: each tick's label fades in as the room around it grows — the
 * quarters before every month, the Mondays before every day, every third hour
 * before every hour — the finest legible unit owns the axis, and the unit
 * above it becomes a row of context labels pinned to the left edge until the
 * next one pushes them off.
 *
 * Markers closer than `cluster` px merge into a counted bubble, and each
 * member springs in and out of it on snap as you zoom, so a bubble visibly
 * splits into its events. Dragging pans 1:1 and rubber-bands past the events;
 * a throw coasts to where `project` says it would rest, on a critically
 * damped spring whose time constant is the projection's — an inertial decay
 * carrying the release velocity. Every per-frame number lives in motion
 * values; React only hears when a bubble forms or splits, or the unit
 * changes.
 *
 * Markers are one roving list in time order: arrows move between them and
 * pan to keep them in view, + and - zoom about them, Enter selects an event
 * or opens a bubble, Page Up and Page Down pan a screen. Under reduced motion
 * steps and pans jump and bubbles swap in place; labels still cross-fade by
 * spacing, because which labels are legible is information.
 */
export function ZoomTimeline({
  events = defaultTimelineEvents,
  value,
  defaultValue = null,
  onValueChange,
  onViewChange,
  defaultCenter,
  defaultUnit,
  levels = "years-minutes",
  cluster = 28,
  momentum = 0.6,
  now,
  utcOffset = 0,
  label = "Timeline",
  formatTime,
  zoomControls = true,
  height = 200,
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: ZoomTimelineProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const ladder = LADDERS[levels] ?? LADDERS["years-minutes"];
  const laneH = Math.max(72, height - HEADER_H - AXIS_H);
  const rows = [0.2, 0.47, 0.74].map((f) => Math.round(laneH * f));
  const offset = Math.round(utcOffset);
  const fmt = (ms: number, unit: ZoomTimelineUnit) =>
    formatTime ? formatTime(ms, unit) : defaultFormat(ms + offset * 60_000);

  /* ------------------------------- the data ------------------------------ */

  const placed = React.useMemo<Placed[]>(() => {
    const list = events
      .map((e) => ({ e, ms: toMs(e.at) }))
      .filter((p) => Number.isFinite(p.ms))
      .sort((a, b) => a.ms - b.ms || a.e.id.localeCompare(b.e.id));
    return list.map(({ e, ms }, i) => ({
      id: e.id,
      t: ms / DAY_MS,
      ms,
      title: e.title,
      detail: e.detail,
      tone: e.tone ?? "default",
      row: i % 3,
      next: list[i + 3] ? (list[i + 3]?.ms ?? 0) / DAY_MS : null,
    }));
  }, [events]);

  const firstT = placed[0]?.t;
  const lastT = placed[placed.length - 1]?.t;
  const opening = toMs(defaultCenter);
  const center0 = Number.isFinite(opening)
    ? opening / DAY_MS
    : firstT !== undefined && lastT !== undefined
      ? (firstT + lastT) / 2
      : 0;
  const span = firstT !== undefined && lastT !== undefined ? lastT - firstT : 0;
  const bound = Math.max(1, span * 0.12);
  const minC = firstT !== undefined ? firstT - bound : center0 - 365;
  const maxC = lastT !== undefined ? lastT + bound : center0 + 365;
  const coarse = ladder[0] ?? "month";
  const fine = ladder[ladder.length - 1] ?? "day";
  const minZ = zoomFor(coarse, 72);
  const maxZ = zoomFor(fine, 120);
  const openUnit =
    defaultUnit && ladder.includes(defaultUnit)
      ? defaultUnit
      : (ladder[1] ?? coarse);
  const zoom0 = Math.min(maxZ, Math.max(minZ, zoomFor(openUnit, 64)));
  const clampZ = (z: number) => Math.min(maxZ, Math.max(minZ, z));
  const clampC = (c: number) => Math.min(maxC, Math.max(minC, c));

  /* ----------------------------- motion values --------------------------- */

  const center = useMotionValue(clampC(center0));
  const zoom = useMotionValue(zoom0);
  const vw = useMotionValue(NOMINAL_W);

  const [initial] = React.useState(() =>
    computeFrame(clampC(center0), zoom0, NOMINAL_W, ladder, offset, laneH),
  );
  const [pools] = React.useState(() => [
    makeSlots(POOL, initial.labels[0]),
    makeSlots(POOL, initial.labels[1]),
  ]);
  const [ctxPools] = React.useState(() => [
    makeSlots(CTX_POOL, initial.context[0]),
    makeSlots(CTX_POOL, initial.context[1]),
  ]);
  const ticksA = useMotionValue(initial.ticks[0]);
  const ticksB = useMotionValue(initial.ticks[1]);
  const marksA = useMotionValue(initial.marks[0]);
  const marksB = useMotionValue(initial.marks[1]);
  const tickOA = useMotionValue(initial.tickO[0]);
  const tickOB = useMotionValue(initial.tickO[1]);
  const minor = useMotionValue(initial.minor);
  const minorO = useMotionValue(initial.minorO);

  const [primary, setPrimary] = React.useState(initial.primary);
  const [clusters, setClusters] = React.useState<Cluster[]>(
    () => clusterize(placed, 2 ** zoom0, cluster, new Set()).clusters,
  );
  const pairs = React.useRef<Set<string>>(new Set());

  const [ownValue, setOwnValue] = React.useState<string | null>(defaultValue);
  const selected = value !== undefined ? value : ownValue;
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [grabbing, setGrabbing] = React.useState(false);

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (...keys: string[]) => {
    for (const k of keys) {
      anims.current.get(k)?.stop();
      anims.current.delete(k);
    }
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null);
  const markerNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const pivot = React.useRef<{ t: number; p: number } | null>(null);
  const zoomGoal = React.useRef(zoom0);
  const visitor = React.useRef(false);
  const shownPrimary = React.useRef(initial.primary);
  const spokenPrimary = React.useRef(initial.primary);
  const settleTimer = React.useRef(0);
  const focusInside = React.useRef(false);
  const pendingFocus = React.useRef<string | null>(null);
  const gesture = React.useRef<Gesture>({
    pinch: null,
    pointers: new Map(),
    stale: false,
    startC: 0,
  });
  const api = React.useRef<Api | null>(null);

  const clusterOf = new Map<string, Cluster>();
  for (const c of clusters) for (const m of c.members) clusterOf.set(m, c);
  const keyOf = (id: string) => {
    const c = clusterOf.get(id);
    return c ? `c:${c.id}` : `e:${id}`;
  };
  // The markers in time order: free events and bubbles, one stop each.
  const markers: { key: string; id: string; t: number }[] = [];
  for (const p of placed) {
    const c = clusterOf.get(p.id);
    if (!c) markers.push({ key: `e:${p.id}`, id: p.id, t: p.t });
    else if (c.id === p.id)
      markers.push({ key: `c:${c.id}`, id: p.id, t: c.mean });
  }
  const focusKey = focusId
    ? keyOf(focusId)
    : (markers.find((m) => m.key === keyOf(selected ?? ""))?.key ??
      markers[0]?.key);

  /* ------------------------------- drawing ------------------------------- */

  const write = () => {
    const f = computeFrame(
      center.get(),
      zoom.get(),
      vw.get(),
      ladder,
      offset,
      laneH,
    );
    writeSlots(pools[0] ?? [], f.labels[0]);
    writeSlots(pools[1] ?? [], f.labels[1]);
    writeSlots(ctxPools[0] ?? [], f.context[0]);
    writeSlots(ctxPools[1] ?? [], f.context[1]);
    ticksA.set(f.ticks[0]);
    ticksB.set(f.ticks[1]);
    marksA.set(f.marks[0]);
    marksB.set(f.marks[1]);
    tickOA.set(f.tickO[0]);
    tickOB.set(f.tickO[1]);
    minor.set(f.minor);
    minorO.set(f.minorO);
    if (f.primary !== shownPrimary.current) {
      const finer =
        UNITS.indexOf(f.primary) > UNITS.indexOf(shownPrimary.current);
      shownPrimary.current = f.primary;
      setPrimary(f.primary);
      // A Ctrl-wheel is not a gesture audio may start from: until the page
      // has had a press or a key, the unit changes silently.
      if (visitor.current && activated()) {
        audio.play("tick", {
          pitch: r2(0.8 + 0.14 * UNITS.indexOf(f.primary)),
          gain: finer ? 0.5 : 0.4,
        });
      }
    }
    // Membership only: React hears when a bubble forms or splits.
    const next = clusterize(placed, 2 ** zoom.get(), cluster, pairs.current);
    pairs.current = next.pairs;
    setClusters((prev) =>
      clusterKey(prev) === clusterKey(next.clusters) &&
      prev.every((c, i) => c.mean === next.clusters[i]?.mean)
        ? prev
        : next.clusters,
    );
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => api.current?.settle(), 280);
  };

  const settle = () => {
    visitor.current = false;
    const c = center.get();
    const ppd = 2 ** zoom.get();
    const half = vw.get() / 2 / ppd;
    const inView = (t: number) => t >= c - half && t <= c + half;
    const unit = shownPrimary.current;
    if (unit !== spokenPrimary.current) {
      spokenPrimary.current = unit;
      say(`Showing ${PLURAL[unit].toLowerCase()}.`);
    }
    onViewChange?.({
      start: Math.round((c - half) * DAY_MS),
      end: Math.round((c + half) * DAY_MS),
      unit,
      visible: placed.filter((p) => inView(p.t)).length,
      bubbles: clusters.filter((cl) => inView(cl.mean)).length,
    });
  };

  React.useEffect(() => {
    api.current = { write, settle };
  });

  // Redraw on every change of the view, once per frame.
  React.useEffect(() => {
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      frame.update(() => {
        queued = false;
        api.current?.write();
      });
    };
    const offs = [center, zoom, vw].map((v) => v.on("change", schedule));
    schedule();
    return () => {
      for (const off of offs) off();
    };
  }, [center, zoom, vw, ladder, offset, laneH, cluster, placed]);

  // Zooming about a pivot keeps the time under it where it is.
  React.useEffect(
    () =>
      zoom.on("change", (z) => {
        const p = pivot.current;
        if (!p) return;
        center.set(clampC(p.t - p.p / 2 ** z));
      }),
    // clampC reads the bounds of this render; the subscription follows them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom, center, minC, maxC],
  );

  React.useEffect(() => {
    if (!viewport) return;
    const read = () => vw.set(Math.max(1, Math.round(viewport.clientWidth)));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport, vw]);

  // A new ladder re-frames the view on its opening unit.
  const shownLadder = React.useRef(levels);
  React.useEffect(() => {
    if (shownLadder.current === levels) return;
    shownLadder.current = levels;
    pivot.current = null;
    zoomGoal.current = zoom0;
    if (!motionSafe) {
      zoom.jump(zoom0);
      center.jump(clampC(center.get()));
      return;
    }
    run("zoom", animate(zoom, zoom0, springs.glide));
    run("center", animate(center, clampC(center.get()), springs.glide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  // Focus follows its marker into and out of bubbles: a focused event that
  // merges hands focus to its bubble, a focused bubble that splits to its
  // first member, once that member's own marker has arrived.
  const markersKey = markers.map((m) => m.key).join("|");
  React.useEffect(() => {
    const want = pendingFocus.current ?? focusId;
    if (!want || !focusInside.current) return;
    const at = document.activeElement;
    const node = markerNodes.current.get(keyOf(want));
    if (!node || node === at) return;
    // Lost to the page, or left on a marker that is no longer the one this
    // event is drawn as (a bubble leaving while a bigger one takes over).
    const lost =
      !at ||
      at === document.body ||
      at.closest("[inert]") !== null ||
      at.hasAttribute("data-timeline-marker");
    if (lost || pendingFocus.current) {
      pendingFocus.current = null;
      node.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey]);

  // A pinch or a Ctrl-wheel belongs to the timeline; a plain vertical wheel
  // is the page's.
  React.useEffect(() => {
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (disabled) return;
      const { x: dx, y: dy } = wheelPixels(event);
      const rect = viewport.getBoundingClientRect();
      const p = event.clientX - rect.left - rect.width / 2;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        halt("center");
        visitor.current = true;
        const goal = clampZ(zoomGoal.current - dy * 0.0042);
        zoomGoal.current = goal;
        pivot.current = { t: center.get() + p / 2 ** zoom.get(), p };
        if (!motionSafe) {
          halt("zoom");
          zoom.set(goal);
          return;
        }
        run("zoom", animate(zoom, goal, springs.flick));
        return;
      }
      const sideways = event.shiftKey
        ? dy
        : Math.abs(dx) > Math.abs(dy)
          ? dx
          : 0;
      if (sideways === 0) return;
      event.preventDefault();
      halt("center", "zoom");
      pivot.current = null;
      center.set(clampC(center.get() + sideways / 2 ** zoom.get()));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, disabled, motionSafe, minZ, maxZ, minC, maxC]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      window.clearTimeout(settleTimer.current);
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ------------------------------- actions ------------------------------- */

  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** Zoom by `dz` octaves about `p` px from the centre, on glide. */
  const zoomStep = (dz: number, p: number, el?: Element | null) => {
    if (disabled) return;
    const goal = clampZ(zoomGoal.current + dz);
    if (Math.abs(goal - zoom.get()) < 0.001) return;
    visitor.current = true;
    zoomGoal.current = goal;
    halt("center");
    pivot.current = { t: center.get() + p / 2 ** zoom.get(), p };
    audio.play("whoosh", {
      pitch: dz > 0 ? 1.2 : 0.8,
      gain: 0.3,
      pan: panOf(el),
    });
    if (!motionSafe) {
      halt("zoom");
      zoom.jump(goal);
      return;
    }
    run("zoom", animate(zoom, goal, springs.glide));
  };

  const glideTo = (c: number, z?: number) => {
    pivot.current = null;
    const target = clampC(c);
    if (!motionSafe) {
      halt("center", "zoom");
      center.jump(target);
      if (z !== undefined) {
        zoomGoal.current = clampZ(z);
        zoom.jump(zoomGoal.current);
      }
      return;
    }
    const ppd = 2 ** zoom.get();
    run(
      "center",
      animate(center, target, {
        ...springs.glide,
        restDelta: 0.3 / ppd,
        restSpeed: 2 / ppd,
      }),
    );
    if (z !== undefined) {
      zoomGoal.current = clampZ(z);
      run("zoom", animate(zoom, zoomGoal.current, springs.glide));
    }
  };

  const markerX = (t: number) => (t - center.get()) * 2 ** zoom.get();

  const keepInView = (t: number) => {
    const half = vw.get() / 2;
    const x = markerX(t);
    if (Math.abs(x) <= half - 56) return;
    glideTo(t - (Math.sign(x) * (half - 96)) / 2 ** zoom.get());
  };

  const choose = (id: string | null, el?: Element | null) => {
    if (disabled) return;
    audio.play("tick", { pitch: 1.3, gain: 0.35, pan: panOf(el) });
    if (id === selected) return;
    if (value === undefined) setOwnValue(id);
    onValueChange?.(id);
    const p = placed.find((x) => x.id === id);
    say(
      p
        ? `Selected ${p.title}, ${fmt(p.ms, shownPrimary.current)}.`
        : "Selection cleared.",
    );
  };

  const openCluster = (c: Cluster, el?: Element | null) => {
    if (disabled) return;
    const w = vw.get();
    const spanDays = Math.max(c.last - c.first, 3 / 1440);
    const z = clampZ(Math.log2((w * 0.55) / spanDays));
    visitor.current = true;
    audio.play("whoosh", { pitch: 1.15, gain: 0.32, pan: panOf(el) });
    if (focusInside.current) pendingFocus.current = c.members[0] ?? null;
    setFocusId(c.members[0] ?? null);
    glideTo(c.mean, z);
  };

  const onMarkerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: string,
  ) => {
    const i = markers.findIndex((m) => m.key === key);
    if (i === -1) return;
    const go = (j: number) => {
      const m = markers[Math.max(0, Math.min(markers.length - 1, j))];
      if (!m) return;
      setFocusId(m.id);
      markerNodes.current.get(m.key)?.focus({ preventScroll: true });
      keepInView(m.t);
      audio.play("tick", {
        pitch: 1.1,
        gain: 0.2,
        pan: panOf(markerNodes.current.get(m.key)),
      });
    };
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        go(i + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        go(i - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(markers.length - 1);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const m = markers[i];
        if (!m) return;
        const c = key.startsWith("c:") ? clusterOf.get(m.id) : undefined;
        if (c) openCluster(c, event.currentTarget);
        else choose(m.id === selected ? null : m.id, event.currentTarget);
        return;
      }
    }
  };

  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const focusedMarker = markers.find((m) => m.key === focusKey);
    const pivotPx =
      event.target instanceof HTMLElement &&
      event.target.closest("li") &&
      focusedMarker
        ? markerX(focusedMarker.t)
        : 0;
    switch (event.key) {
      case "+":
      case "=":
        event.preventDefault();
        zoomStep(Math.log2(3), pivotPx, event.target as Element);
        return;
      case "-":
      case "_":
        event.preventDefault();
        zoomStep(-Math.log2(3), pivotPx, event.target as Element);
        return;
      case "PageUp":
      case "PageDown": {
        event.preventDefault();
        const dir = event.key === "PageDown" ? 1 : -1;
        glideTo(center.get() + (dir * vw.get() * 0.8) / 2 ** zoom.get());
        return;
      }
      case "Escape":
        if (selected === null) return;
        // Handled here, where focus is; the stage must not also close.
        event.preventDefault();
        choose(null, event.target as Element);
        return;
    }
  };

  /* -------------------------------- gestures ----------------------------- */

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      const g = gesture.current;
      g.startC = center.get();
      halt("center", "zoom");
      zoomGoal.current = zoom.get();
      pivot.current = null;
      setGrabbing(true);
    },
    onMove: ({ offset }) => {
      const g = gesture.current;
      if (g.pinch || g.stale) return;
      const ppd = 2 ** zoom.get();
      const raw = (g.startC - offset.x / ppd) * ppd;
      center.set(rubberClamp(raw, minC * ppd, maxC * ppd, vw.get()) / ppd);
    },
    onEnd: ({ velocity }) => {
      setGrabbing(false);
      const g = gesture.current;
      if (g.pinch || g.stale) return;
      const ppd = 2 ** zoom.get();
      const v = -velocity.x / ppd;
      const c = center.get();
      if (Math.abs(velocity.x) > 600) {
        audio.play("whoosh", {
          pitch: 1,
          gain: r2(Math.min(0.6, Math.abs(velocity.x) / 4000)),
        });
      }
      if (!motionSafe) {
        center.jump(clampC(c));
        return;
      }
      const rate = lerp(0.99, 0.998, clamp01(momentum));
      const rest = project(c, v, rate);
      const tau = rate / (1 - rate) / 1000;
      const restDelta = 0.3 / ppd;
      if (rest < minC || rest > maxC || c < minC || c > maxC) {
        // Thrown past the events: the end catches it with one bounce.
        run(
          "center",
          animate(center, clampC(rest), {
            ...springs.glide,
            velocity: v,
            restDelta,
            restSpeed: 2 / ppd,
          }),
        );
        return;
      }
      // A critically damped spring whose time constant is the projection's
      // is exactly an inertial decay carrying the release velocity.
      const omega = 1 / tau;
      run(
        "center",
        animate(center, rest, {
          type: "spring",
          stiffness: omega * omega,
          damping: 2 * omega,
          mass: 1,
          velocity: v,
          restDelta,
          restSpeed: 2 / ppd,
        }),
      );
    },
    onCancel: () => {
      setGrabbing(false);
      center.set(clampC(center.get()));
    },
  });

  const pinchDistance = () => {
    const pts = [...gesture.current.pointers.values()];
    const a = pts[0];
    const b = pts[1];
    if (!a || !b) return null;
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (event.pointerType === "touch") {
      g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (g.pointers.size === 2 && viewport) {
        const m = pinchDistance();
        if (m && m.d > 8) {
          halt("center", "zoom");
          const rect = viewport.getBoundingClientRect();
          const p = m.mx - rect.left - rect.width / 2;
          g.pinch = {
            d0: m.d,
            z0: zoom.get(),
            t0: center.get() + p / 2 ** zoom.get(),
          };
          g.stale = true;
          pivot.current = null;
          visitor.current = true;
        }
        return;
      }
    }
    if (g.pointers.size <= 1) {
      g.stale = false;
      drag.onPointerDown(event);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g.pointers.has(event.pointerId)) {
      g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (g.pinch && viewport) {
      const m = pinchDistance();
      if (!m) return;
      const z = clampZ(g.pinch.z0 + Math.log2(m.d / g.pinch.d0));
      const rect = viewport.getBoundingClientRect();
      const p = m.mx - rect.left - rect.width / 2;
      zoomGoal.current = z;
      zoom.set(z);
      center.set(clampC(g.pinch.t0 - p / 2 ** z));
      return;
    }
    drag.onPointerMove(event);
  };

  const onPointerEnd = (
    event: React.PointerEvent<HTMLDivElement>,
    cancel: boolean,
  ) => {
    const g = gesture.current;
    g.pointers.delete(event.pointerId);
    if (g.pinch && g.pointers.size < 2) g.pinch = null;
    if (cancel) drag.onPointerCancel(event);
    else drag.onPointerUp(event);
  };

  /* --------------------------- derived drawing --------------------------- */

  const nowMs = toMs(now);
  const nowT = Number.isFinite(nowMs) ? nowMs / DAY_MS : null;
  const nowX = useTransform(
    [center, zoom] as MotionValue<number>[],
    ([c = 0, z = 0]: number[]) => (nowT === null ? 0 : r2((nowT - c) * 2 ** z)),
  );

  const selectedItem = placed.find((p) => p.id === selected) ?? null;
  const nameOf = (p: Placed) => `${p.title}, ${fmt(p.ms, primary)}`;
  const clusterName = (c: Cluster) => {
    const a = placed.find((p) => p.id === c.members[0]);
    const b = placed.find((p) => p.id === c.members[c.members.length - 1]);
    const range =
      a && b
        ? fmt(a.ms, primary) === fmt(b.ms, primary)
          ? fmt(a.ms, primary)
          : `${fmt(a.ms, primary)} to ${fmt(b.ms, primary)}`
        : "";
    return `${c.members.length} events, ${range}, press to zoom in`;
  };

  /* -------------------------------- render ------------------------------- */

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="timeline"
      aria-label={label}
      aria-describedby={hintId}
      onKeyDown={onRootKeyDown}
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={(event) => {
        const to =
          event.relatedTarget instanceof Node ? event.relatedTarget : null;
        if (to && event.currentTarget.contains(to)) return;
        // A marker that went inert or left (it merged into a bubble, or its
        // bubble split) lost focus to the page, not to the visitor: focus is
        // still ours to put back.
        const from = event.target instanceof Element ? event.target : null;
        if (!to && from && (!from.isConnected || from.closest("[inert]"))) {
          return;
        }
        focusInside.current = false;
      }}
      className={cn(
        "@container relative flex w-full flex-col overflow-clip rounded-3 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={
        { height, "--zoom-timeline-accent": accent } as React.CSSProperties
      }
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b border-hairline px-3"
        style={{ height: HEADER_H }}
      >
        <div className="grid min-w-0 flex-1 items-center">
          <AnimatePresence initial={false}>
            <motion.div
              key={selectedItem?.id ?? "none"}
              className="col-start-1 row-start-1 flex min-w-0 items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {selectedItem ? (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      TONE_DOT[selectedItem.tone],
                    )}
                  />
                  <span
                    className="min-w-0 truncate text-[13px] font-medium"
                    title={selectedItem.title}
                  >
                    {selectedItem.title}
                  </span>
                  <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 tabular-nums @min-[420px]:inline">
                    {fmt(selectedItem.ms, primary)}
                  </span>
                  {selectedItem.detail ? (
                    <span className="hidden min-w-0 truncate text-[11px] text-ink-3 @min-[640px]:inline">
                      · {selectedItem.detail}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="min-w-0 truncate text-[12px] text-ink-3">
                  <span className="@max-[419px]:hidden">
                    Ctrl or ⌘ + scroll to zoom · drag to pan
                  </span>
                  <span className="@min-[420px]:hidden">
                    Pinch to zoom · drag to pan
                  </span>
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        {zoomControls ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Zoom out"
              disabled={disabled}
              onClick={(event) =>
                zoomStep(-Math.log2(3), 0, event.currentTarget)
              }
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors",
                "enabled:hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] enabled:hover:text-foreground disabled:cursor-not-allowed",
                FOCUS_RING,
              )}
            >
              <Minus aria-hidden className="size-4" />
            </button>
            <span className="hidden w-16 text-center font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase @min-[400px]:inline">
              {PLURAL[primary]}
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={disabled}
              onClick={(event) =>
                zoomStep(Math.log2(3), 0, event.currentTarget)
              }
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors",
                "enabled:hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] enabled:hover:text-foreground disabled:cursor-not-allowed",
                FOCUS_RING,
              )}
            >
              <Plus aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={setViewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => onPointerEnd(event, false)}
        onPointerCancel={(event) => onPointerEnd(event, true)}
        onLostPointerCapture={drag.onLostPointerCapture}
        className={cn(
          "relative flex-1 touch-pan-y overflow-clip select-none",
          disabled
            ? "cursor-not-allowed"
            : grabbing
              ? "cursor-grabbing"
              : "cursor-grab",
        )}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 h-px bg-hairline-strong"
          style={{ top: laneH }}
        />
        <svg
          aria-hidden
          width="1"
          height={laneH + AXIS_H}
          className="pointer-events-none absolute top-0 left-1/2 overflow-visible"
          shapeRendering="crispEdges"
        >
          <motion.path
            d={minor}
            strokeWidth={1}
            className="stroke-ink-3"
            style={{ opacity: minorO }}
          />
          <motion.path
            d={ticksA}
            strokeWidth={1}
            className="stroke-ink-3"
            style={{ opacity: tickOA }}
          />
          <motion.path
            d={ticksB}
            strokeWidth={1}
            className="stroke-ink-3"
            style={{ opacity: tickOB }}
          />
          <motion.path
            d={marksA}
            strokeWidth={1}
            className="stroke-ink-2"
            style={{ opacity: tickOA }}
          />
          <motion.path
            d={marksB}
            strokeWidth={1}
            className="stroke-ink-2"
            style={{ opacity: tickOB }}
          />
        </svg>

        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 w-0"
          style={{ top: laneH + 13 }}
        >
          {pools.map((pool, p) =>
            pool.map((s, i) => (
              <motion.span
                key={`${p}-${i}`}
                className="absolute top-0 left-0 font-mono text-[10px] leading-none whitespace-nowrap text-ink-2 tabular-nums"
                style={{ x: s.x, opacity: s.o }}
              >
                {s.text}
              </motion.span>
            )),
          )}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 w-0"
          style={{ top: laneH + 31 }}
        >
          {ctxPools.map((pool, p) =>
            pool.map((s, i) => (
              <motion.span
                key={`c${p}-${i}`}
                className="absolute top-0 left-0 text-[11px] leading-none font-medium whitespace-nowrap text-ink-3"
                style={{ x: s.x, opacity: s.o }}
              >
                {s.text}
              </motion.span>
            )),
          )}
        </div>

        {nowT !== null ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px bg-[color-mix(in_oklab,var(--zoom-timeline-accent)_70%,transparent)]"
            style={{ x: nowX }}
          >
            <span className="absolute top-1 left-1 font-mono text-[9px] tracking-[0.08em] text-[var(--zoom-timeline-accent)] uppercase">
              Now
            </span>
          </motion.div>
        ) : null}

        <ul
          role="list"
          aria-label="Events"
          className="absolute inset-x-0 top-0"
          style={{ height: laneH }}
        >
          {placed.map((p) => {
            const c = clusterOf.get(p.id) ?? null;
            const key = `e:${p.id}`;
            return (
              <EventMarker
                key={p.id}
                item={p}
                anchor={c ? c.mean : null}
                clusterId={c ? c.id : null}
                selected={p.id === selected}
                center={center}
                zoom={zoom}
                laneH={laneH}
                rowY={rows[p.row] ?? 24}
                motionSafe={motionSafe}
                disabled={disabled}
                tabbable={focusKey === key}
                bind={(node) => {
                  if (!node) return;
                  const map = markerNodes.current;
                  map.set(key, node);
                  return () => {
                    if (map.get(key) === node) map.delete(key);
                  };
                }}
                onPress={(el) => {
                  setFocusId(p.id);
                  choose(p.id === selected ? null : p.id, el);
                }}
                onKeyDown={(event) => onMarkerKeyDown(event, key)}
                onFocus={() => setFocusId(p.id)}
                name={nameOf(p)}
              />
            );
          })}
          <AnimatePresence initial={false}>
            {clusters.map((c) => {
              const key = `c:${c.id}`;
              return (
                <ClusterMarker
                  key={c.id}
                  cluster={c}
                  center={center}
                  zoom={zoom}
                  laneH={laneH}
                  rowY={rows[c.row] ?? 24}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  tabbable={focusKey === key}
                  holdsSelection={
                    selected !== null && c.members.includes(selected)
                  }
                  bind={(node) => {
                    if (!node) return;
                    const map = markerNodes.current;
                    map.set(key, node);
                    return () => {
                      if (map.get(key) === node) map.delete(key);
                    };
                  }}
                  onPress={(el) => openCluster(c, el)}
                  onKeyDown={(event) => onMarkerKeyDown(event, key)}
                  onFocus={() => setFocusId(c.members[0] ?? null)}
                  name={clusterName(c)}
                />
              );
            })}
          </AnimatePresence>
        </ul>
      </div>

      <p id={hintId} className="sr-only">
        Arrow keys move between events, plus and minus zoom, Enter opens a
        bubble or selects an event, Page Up and Page Down pan.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
