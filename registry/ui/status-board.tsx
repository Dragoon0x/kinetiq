"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { semitones, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StatusLevel = "operational" | "degraded" | "outage" | "maintenance";
export type StatusImpact = "minor" | "major" | "maintenance";
export type StatusStage =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "scheduled"
  | "in-progress"
  | "completed";
export type StatusBoardStatus = "ready" | "loading" | "error";

export type StatusService = {
  id: string;
  /** Shown on its row and in the detail card. */
  name: string;
  /** How it is doing right now. */
  status: StatusLevel;
  /** Minutes of downtime per day, oldest first; the last entry is today. */
  downtime: number[];
};

export type StatusUpdate = {
  /** When it was posted, ms since the epoch. */
  at: number;
  stage: StatusStage;
  text: string;
};

export type StatusIncident = {
  id: string;
  title: string;
  /** Minor degrades, major takes a service down, maintenance is planned. */
  impact: StatusImpact;
  /** Ids of the services it touched. */
  services: string[];
  /** When it began, ms since the epoch. */
  start: number;
  /** When it was resolved, ms. Omit it while the incident is still open. */
  end?: number;
  /** Oldest first. */
  updates: StatusUpdate[];
};

export type StatusRegion = {
  id: string;
  name: string;
  /** Two letters for tight spaces: "CW". */
  code: string;
  status: StatusLevel;
  /** Its p95 latency right now, ms — the level its sparkline wanders around. */
  latency: number;
  /** Where it sits on the map, 0 to 1 across. */
  x: number;
  /** Where it sits on the map, 0 to 1 down. */
  y: number;
};

export type StatusSample = {
  /** When it was measured, ms since the epoch. */
  t: number;
  /** p95 latency, ms. */
  ms: number;
};

export type StatusBoardProps = {
  /** Days of history each service shows, 7 to 90. @default 90 */
  days?: number;
  /** The latency sparkline takes a new sample every `interval` on its own. Off: a snapshot at `now`. @default true */
  live?: boolean;
  /** The regions panel: true for `defaultStatusRegions`, your own list, or false to leave it out. @default true */
  regions?: boolean | StatusRegion[];
  /** The services, one row each. @default defaultStatusServices */
  services?: StatusService[];
  /** Everything that went wrong or was planned. @default defaultStatusIncidents */
  incidents?: StatusIncident[];
  /** The board's moment (Date or ms): today's bar, the update time and open incidents run to it. @default defaultStatusNow */
  now?: number | Date;
  /** Your latency series, oldest first. Omit it for a seeded one that advances from `now`; pass it and you advance it. */
  latency?: StatusSample[];
  /** Samples across the sparkline. @default 40 */
  latencyWindow?: number;
  /** The p95 target, ms: a dashed line, and the reading turns warn above it. @default 300 */
  latencyTarget?: number;
  /** Milliseconds between seeded samples while `live`. @default 2000 */
  interval?: number;
  /** Controlled selected incident id, or null for none. */
  incident?: string | null;
  /** Initial selected incident when uncontrolled. @default null */
  defaultIncident?: string | null;
  /** Fires from the click, key or bar that selected or cleared an incident. */
  onIncidentChange?: (id: string | null) => void;
  /** Controlled region whose latency the sparkline shows, or null for all regions. */
  region?: string | null;
  /** Initial region when uncontrolled. @default null */
  defaultRegion?: string | null;
  /** Fires from the radio, key or map marker that chose a region. */
  onRegionChange?: (id: string | null) => void;
  /** Enter on a day, or a click on its bar, with the service id and the day as YYYY-MM-DD. */
  onDaySelect?: (serviceId: string, date: string) => void;
  /** Incidents listed before "Show more"; a desktop-wide board, with the room, lists three more. @default 3 */
  incidentLimit?: number;
  /** Day labels from ms. @default "Sep 24", in UTC */
  formatDate?: (ms: number) => string;
  /** Clock labels from ms. @default "14:32", in UTC */
  formatTime?: (ms: number) => string;
  /** Whether the status has arrived. @default "ready" */
  status?: StatusBoardStatus;
  /** "Try again" was pressed after the status failed to load. */
  onRetry?: () => void;
  /** The board's heading. @default "System status" */
  title?: string;
  /** The board's accessible name. @default the title */
  label?: string;
  /** Ticks for days and regions you step through, a low buzz for a major outage you select. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: days and samples still read out, nothing can be selected and the feed holds still. @default false */
  disabled?: boolean;
  /** Classes for the root. It is at most 560px tall and scrolls inside itself; pass a max-height class to change that. */
  className?: string;
};

type BarLevel = "ok" | "minor" | "major" | "maintenance" | "none";

type Bar = {
  /** Days since the epoch. */
  day: number;
  level: BarLevel;
  /** Minutes down, or null where there is no record. */
  down: number | null;
  incidents: StatusIncident[];
};

type Row = { service: StatusService; bars: Bar[]; uptime: number | null };

type Via = "pointer" | "key" | "scrub";
type Cursor = { service: string; day: number; via: Via };

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const shortDate = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const clockTime = (ms: number) => {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};
const secondsOf = (ms: number) =>
  `:${String(new Date(ms).getUTCSeconds()).padStart(2, "0")}`;
const isoOfDay = (day: number) =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

/** "38 min", "2 h 10 min", "1 d 3 h". */
function formatSpan(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

/** Floors to two places, so a sliver of downtime never rounds up to 100%. */
function formatUptime(u: number): string {
  if (u >= 1) return "100%";
  return `${(Math.floor(u * 10000) / 100).toFixed(2)}%`;
}

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

function hash32(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One p95 reading for sample `n` of a series: a slow wander, a little
 * jitter, and now and then a spike. Seeded by the sample's own number, so
 * the server, the browser and a later visit all see the same line, and a
 * live feed only ever adds to it.
 */
function latencyAt(n: number, seed: number, base: number): number {
  const jitter = hash32(n ^ seed) / 4294967296;
  const drift = hash32(Math.floor(n / 6) * 7919 + seed) / 4294967296;
  const wave = Number(Math.sin(n / 9 + (seed % 7)).toFixed(4)) * 0.07;
  const spike = jitter > 0.95 ? (jitter - 0.95) * 9 : 0;
  return Math.round(
    base * (1 + wave + (drift - 0.5) * 0.12 + (jitter - 0.5) * 0.08 + spike),
  );
}

/* ------------------------------ default data ------------------------------ */

/** 30 September 2026, 14:32 UTC: the moment the default board describes. */
export const defaultStatusNow = Date.UTC(2026, 8, 30, 14, 32);

const ago = (days: number, h: number, m: number) =>
  Date.UTC(2026, 8, 30 - days, h, m);

export const defaultStatusIncidents: StatusIncident[] = [
  {
    id: "webhook-delays",
    title: "Delayed webhook deliveries",
    impact: "minor",
    services: ["webhooks"],
    start: defaultStatusNow - 47 * MIN_MS,
    updates: [
      {
        at: defaultStatusNow - 47 * MIN_MS,
        stage: "investigating",
        text: "Some deliveries are arriving up to four minutes late. We are looking into it.",
      },
      {
        at: defaultStatusNow - 31 * MIN_MS,
        stage: "identified",
        text: "A worker pool in Coldbrook West fell behind after a deploy. More workers are starting.",
      },
      {
        at: defaultStatusNow - 8 * MIN_MS,
        stage: "monitoring",
        text: "The queue is draining. Delays are under a minute and falling.",
      },
    ],
  },
  {
    id: "api-errors",
    title: "Elevated API error rates",
    impact: "major",
    services: ["api", "dashboard"],
    start: ago(6, 9, 12),
    end: ago(6, 9, 50),
    updates: [
      {
        at: ago(6, 9, 15),
        stage: "investigating",
        text: "About one request in five is failing. The dashboard is affected too.",
      },
      {
        at: ago(6, 9, 31),
        stage: "identified",
        text: "An edge router change dropped connections to two API pools. Rolling it back.",
      },
      {
        at: ago(6, 9, 50),
        stage: "resolved",
        text: "The rollback is complete and error rates are back to normal.",
      },
    ],
  },
  {
    id: "sync-backlog",
    title: "Sync engine backlog",
    impact: "minor",
    services: ["sync"],
    start: ago(13, 3, 40),
    end: ago(13, 5, 50),
    updates: [
      {
        at: ago(13, 3, 44),
        stage: "investigating",
        text: "Changes are taking up to ten minutes to reach other devices.",
      },
      {
        at: ago(13, 4, 20),
        stage: "monitoring",
        text: "A stuck partition was restarted. The backlog is clearing.",
      },
      {
        at: ago(13, 5, 50),
        stage: "resolved",
        text: "Sync is current again. No changes were lost.",
      },
    ],
  },
  {
    id: "db-maintenance",
    title: "Scheduled database maintenance",
    impact: "maintenance",
    services: ["api", "sync", "storage"],
    start: ago(21, 2, 0),
    end: ago(21, 2, 45),
    updates: [
      {
        at: ago(24, 10, 0),
        stage: "scheduled",
        text: "Primary databases move to new hardware. Writes may pause for up to a minute.",
      },
      {
        at: ago(21, 2, 0),
        stage: "in-progress",
        text: "Maintenance has started.",
      },
      {
        at: ago(21, 2, 45),
        stage: "completed",
        text: "Maintenance is complete. Writes paused for 38 seconds in all.",
      },
    ],
  },
  {
    id: "upload-failures",
    title: "File uploads failing in Coldbrook West",
    impact: "major",
    services: ["storage"],
    start: ago(34, 16, 5),
    end: ago(34, 17, 17),
    updates: [
      {
        at: ago(34, 16, 9),
        stage: "investigating",
        text: "Uploads from Coldbrook West are failing. Downloads are unaffected.",
      },
      {
        at: ago(34, 16, 40),
        stage: "identified",
        text: "A full disk on one storage node is rejecting new writes.",
      },
      {
        at: ago(34, 17, 17),
        stage: "resolved",
        text: "Space was freed and uploads succeed again. Failed uploads can be retried.",
      },
    ],
  },
  {
    id: "email-delays",
    title: "Notification emails delayed",
    impact: "minor",
    services: ["notify"],
    start: ago(52, 11, 20),
    end: ago(52, 14, 25),
    updates: [
      {
        at: ago(52, 11, 26),
        stage: "investigating",
        text: "Emails are going out up to an hour late. In-app notices are on time.",
      },
      {
        at: ago(52, 14, 25),
        stage: "resolved",
        text: "The mail relay was replaced and the queue has cleared.",
      },
    ],
  },
  {
    id: "sign-in-loop",
    title: "Dashboard sign-in loop",
    impact: "minor",
    services: ["dashboard"],
    start: ago(71, 18, 2),
    end: ago(71, 18, 28),
    updates: [
      {
        at: ago(71, 18, 6),
        stage: "identified",
        text: "Some people are sent back to the sign-in page after signing in. A cookie change is to blame.",
      },
      {
        at: ago(71, 18, 28),
        stage: "resolved",
        text: "The change was reverted. Signing in works again.",
      },
    ],
  },
  {
    id: "partial-api",
    title: "Partial API outage",
    impact: "major",
    services: ["api", "webhooks"],
    start: ago(83, 7, 48),
    end: ago(83, 8, 42),
    updates: [
      {
        at: ago(83, 7, 52),
        stage: "investigating",
        text: "Requests to the API are timing out for a share of accounts.",
      },
      {
        at: ago(83, 8, 15),
        stage: "identified",
        text: "A database failover did not complete. Finishing it by hand.",
      },
      {
        at: ago(83, 8, 42),
        stage: "resolved",
        text: "The failover is complete and requests are succeeding.",
      },
    ],
  },
];

const SERVICE_SEEDS: Omit<StatusService, "downtime">[] = [
  { id: "api", name: "API", status: "operational" },
  { id: "dashboard", name: "Dashboard", status: "operational" },
  { id: "webhooks", name: "Webhooks", status: "degraded" },
  { id: "sync", name: "Sync engine", status: "operational" },
  { id: "storage", name: "File storage", status: "operational" },
  { id: "notify", name: "Notifications", status: "operational" },
];

/**
 * Ninety days of downtime per service, read off the default incidents: a
 * major incident counts every minute, a minor one a quarter of them (things
 * were slow, not gone), maintenance none. Two seeded blips per service add
 * the minute or two nobody filed an incident for.
 */
function seededDowntime(id: string, k: number): number[] {
  const today = Math.floor(defaultStatusNow / DAY_MS);
  const out = Array.from({ length: 90 }, () => 0);
  for (const inc of defaultStatusIncidents) {
    if (inc.impact === "maintenance" || !inc.services.includes(id)) continue;
    const weight = inc.impact === "major" ? 1 : 0.25;
    const end = inc.end ?? defaultStatusNow;
    let t = inc.start;
    while (t < end) {
      const day = Math.floor(t / DAY_MS);
      const next = Math.min(end, (day + 1) * DAY_MS);
      const idx = 89 - (today - day);
      if (idx >= 0 && idx < 90) {
        out[idx] = (out[idx] ?? 0) + Math.round(((next - t) / MIN_MS) * weight);
      }
      t = next;
    }
  }
  const rand = mulberry32(1314 + k * 97);
  for (let b = 0; b < 2; b += 1) {
    const idx = Math.floor(rand() * 88);
    if (out[idx] === 0) out[idx] = 1 + Math.floor(rand() * 3);
  }
  return out;
}

export const defaultStatusServices: StatusService[] = SERVICE_SEEDS.map(
  (s, k) => ({ ...s, downtime: seededDowntime(s.id, k) }),
);

export const defaultStatusRegions: StatusRegion[] = [
  {
    id: "north-basin",
    name: "North Basin",
    code: "NB",
    status: "operational",
    latency: 118,
    x: 0.2,
    y: 0.3,
  },
  {
    id: "coldbrook-west",
    name: "Coldbrook West",
    code: "CW",
    status: "degraded",
    latency: 236,
    x: 0.09,
    y: 0.6,
  },
  {
    id: "fieldline-east",
    name: "Fieldline East",
    code: "FE",
    status: "operational",
    latency: 142,
    x: 0.42,
    y: 0.42,
  },
  {
    id: "waylight-south",
    name: "Waylight South",
    code: "WS",
    status: "operational",
    latency: 167,
    x: 0.36,
    y: 0.78,
  },
  {
    id: "gauge-central",
    name: "Gauge Central",
    code: "GC",
    status: "operational",
    latency: 131,
    x: 0.68,
    y: 0.36,
  },
  {
    id: "fern-isles",
    name: "Fern Isles",
    code: "FI",
    status: "operational",
    latency: 189,
    x: 0.86,
    y: 0.66,
  },
];

/* --------------------------------- the map -------------------------------- */

const MAP_W = 240;
const MAP_H = 96;
const PITCH = 6;

/** Two landmasses and a scatter of isles, as a metaball field. */
const BLOBS: readonly (readonly [number, number, number])[] = [
  [44, 34, 22],
  [24, 58, 15],
  [72, 46, 18],
  [100, 40, 15],
  [86, 72, 14],
  [62, 22, 12],
  [160, 36, 20],
  [184, 28, 13],
  [142, 54, 11],
  [176, 52, 9],
  [206, 64, 9],
  [222, 50, 5.5],
  [196, 80, 5.5],
];

/**
 * The land as one path of dots: every grid point the field covers, with a
 * seeded wobble at the coast so the shoreline is not a row of perfect arcs.
 * Built once; only additions, products and quotients, so it is the same
 * string in every engine.
 */
const LAND = (() => {
  const parts: string[] = [];
  for (let row = 0; row < MAP_H / PITCH; row += 1) {
    for (let col = 0; col < MAP_W / PITCH; col += 1) {
      const x = PITCH / 2 + col * PITCH;
      const y = PITCH / 2 + row * PITCH;
      let field = 0;
      for (const [bx, by, br] of BLOBS) {
        field += (br * br) / ((x - bx) * (x - bx) + (y - by) * (y - by) + 1);
      }
      const wobble =
        ((hash32(col * 131 + row * 977) % 1000) / 1000 - 0.5) * 0.3;
      if (field > 1 + wobble) {
        parts.push(
          `M${r2(x - 1.2)} ${y}a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0`,
        );
      }
    }
  }
  return parts.join("");
})();

/* --------------------------------- tokens --------------------------------- */

/**
 * Bars and markers are pigment: each status takes its token's hue and chroma
 * at a fixed lightness, so a bad day is the same red on a light page as on a
 * dark one. Status words stay on the plain text tokens.
 */
const PIGMENT: Record<BarLevel, string> = {
  ok: "oklch(from var(--success) 0.72 0.13 h)",
  minor: "oklch(from var(--warn) 0.8 0.14 h)",
  major: "oklch(from var(--danger) 0.62 0.2 h)",
  maintenance: "oklch(from var(--accent-bright) 0.64 0.16 h)",
  none: "var(--hairline-strong)",
};

/** The lens is a bar too; it takes the day's colour through the same variables. */
const BAR_CLASS: Record<BarLevel, string> = {
  ok: "bg-(--sb-ok)",
  minor: "bg-(--sb-minor)",
  major: "bg-(--sb-major)",
  maintenance: "bg-(--sb-maint)",
  none: "bg-hairline-strong",
};

const PIGMENT_VARS = {
  "--sb-ok": PIGMENT.ok,
  "--sb-minor": PIGMENT.minor,
  "--sb-major": PIGMENT.major,
  "--sb-maint": PIGMENT.maintenance,
} as React.CSSProperties;

const LEVEL_OF: Record<StatusLevel, BarLevel> = {
  operational: "ok",
  degraded: "minor",
  outage: "major",
  maintenance: "maintenance",
};
const STATUS_WORD: Record<StatusLevel, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  maintenance: "Maintenance",
};
const STATUS_TEXT: Record<StatusLevel, string> = {
  operational: "text-success",
  degraded: "text-warn",
  outage: "text-danger",
  maintenance: "text-cobalt-bright",
};
const STATUS_RANK: Record<StatusLevel, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  outage: 3,
};
const OVERALL: Record<StatusLevel, string> = {
  operational: "All systems operational",
  maintenance: "Maintenance in progress",
  degraded: "Degraded performance",
  outage: "Partial outage",
};
const IMPACT_RANK: Record<StatusImpact, number> = {
  maintenance: 1,
  minor: 2,
  major: 3,
};
const IMPACT_LEVEL: Record<StatusImpact, BarLevel> = {
  maintenance: "maintenance",
  minor: "minor",
  major: "major",
};
const IMPACT_WORD: Record<StatusImpact, string> = {
  maintenance: "Maintenance",
  minor: "Minor",
  major: "Major",
};
const STAGE_WORD: Record<StatusStage, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  scheduled: "Scheduled",
  "in-progress": "In progress",
  completed: "Completed",
};
const STAGE_TEXT: Record<StatusStage, string> = {
  investigating: "text-warn",
  identified: "text-warn",
  monitoring: "text-cobalt-bright",
  resolved: "text-success",
  scheduled: "text-ink-3",
  "in-progress": "text-cobalt-bright",
  completed: "text-ink-3",
};

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** A strip's height, px, and the share of its width the grow front ramps over. */
const STRIP_H = 20;
const RAMP = 0.3;
const LEVELS: BarLevel[] = ["none", "ok", "maintenance", "minor", "major"];
const FILL_CLASS: Record<BarLevel, string> = {
  ok: "fill-(--sb-ok)",
  minor: "fill-(--sb-minor)",
  major: "fill-(--sb-major)",
  maintenance: "fill-(--sb-maint)",
  none: "fill-hairline-strong",
};

const worstOf = (list: StatusIncident[]): StatusIncident | null => {
  let worst: StatusIncident | null = null;
  for (const inc of list) {
    if (!worst || IMPACT_RANK[inc.impact] > IMPACT_RANK[worst.impact]) {
      worst = inc;
    }
  }
  return worst;
};

const stageOf = (inc: StatusIncident): StatusStage =>
  inc.updates[inc.updates.length - 1]?.stage ??
  (inc.end === undefined ? "investigating" : "resolved");

/** Reads `document.hidden` as state, so a hidden tab stops the feed. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageVisible = () => !document.hidden;
const pageVisibleOnServer = () => true;

/* ------------------------------- service row ------------------------------ */

type ServiceRowProps = {
  row: Row;
  index: number;
  nameId: string;
  hintId: string;
  pitch: number;
  barWidth: number;
  gap: number;
  /** The strips' measured width, px: the bars are drawn 1:1 in it. */
  width: number;
  /** The grow wave, 0 to 1, and how far its front runs past the last row. */
  reveal: MotionValue<number>;
  reach: number;
  cursorDay: number | null;
  lensX: MotionValue<number>;
  tabbable: boolean;
  dim: boolean;
  ring: { key: string; from: number; to: number } | null;
  motionSafe: boolean;
  valueText: (day: number) => string;
  bind: (node: HTMLDivElement | null) => void;
  onCursor: (day: number, via: Via) => void;
  onLeave: () => void;
  onSelect: (day: number) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
};

function ServiceRow({
  row,
  index,
  nameId,
  hintId,
  pitch,
  barWidth,
  gap,
  width,
  reveal,
  reach,
  cursorDay,
  lensX,
  tabbable,
  dim,
  ring,
  motionSafe,
  valueText,
  bind,
  onCursor,
  onLeave,
  onSelect,
  onKeyDown,
  onFocus,
  onBlur,
}: ServiceRowProps) {
  const { service, bars, uptime } = row;
  const n = bars.length;
  const strip = React.useRef<HTMLDivElement | null>(null);
  const clipId = `${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}-sb-grow`;

  // One path per colour: ninety rects in five elements, drawn crisp at the
  // strip's own pixel width so thin bars never smear into grey.
  const paths = React.useMemo(() => {
    const out: Partial<Record<BarLevel, string>> = {};
    const w = r2(barWidth);
    bars.forEach((bar, i) => {
      out[bar.level] =
        `${out[bar.level] ?? ""}M${r2(i * pitch)} 0h${w}v${STRIP_H}h-${w}z`;
    });
    return out;
  }, [bars, pitch, barWidth]);

  // The grow wave as this strip's clip: a front that runs left to right
  // with a 30% ramp behind it, so bars rise out of the baseline in turn.
  // Each row starts 5% later, which turns the sweep into a diagonal.
  const grow = useTransform(reveal, (r) => {
    const front = r * reach - index * 0.05;
    const xs = [0, (front - RAMP) * width, front * width, width]
      .map((x) => clamp(x, 0, width))
      .sort((a, b) => a - b);
    const top = xs
      .map((x) => {
        const p = clamp((front - x / width) / RAMP, 0, 1);
        return `L${r2(x)} ${r2(STRIP_H * (1 - p))}`;
      })
      .join("");
    return `M0 ${STRIP_H}${top}L${r2(width)} ${STRIP_H}Z`;
  });

  const dayAt = (clientX: number) => {
    const rect = strip.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return n - 1;
    return clamp(
      Math.floor(((clientX - rect.left) / rect.width) * n),
      0,
      n - 1,
    );
  };

  // A press-drag scrubs the days (the way a finger reads the strip); a
  // press that never travels is a click on the day under it.
  const drag = useDrag({
    axis: "x",
    threshold: 4,
    onStart: ({ point }) => onCursor(dayAt(point.x), "scrub"),
    onMove: ({ point }) => onCursor(dayAt(point.x), "scrub"),
    onTap: (event) => onSelect(dayAt(event.clientX)),
  });

  const lensBar = cursorDay !== null ? bars[cursorDay] : undefined;
  const shownDay = cursorDay ?? n - 1;

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 transition-opacity duration-200",
        "@min-[40rem]:grid-cols-[8.5rem_minmax(0,1fr)_3.75rem] @min-[40rem]:gap-y-0",
        dim ? "opacity-40" : "opacity-100",
      )}
    >
      <p className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: PIGMENT[LEVEL_OF[service.status]] }}
        />
        <span
          id={nameId}
          title={service.name}
          className="truncate text-[13px] text-foreground"
        >
          {service.name}
          <span className="sr-only">, {STATUS_WORD[service.status]}</span>
        </span>
        {service.status !== "operational" ? (
          <span
            aria-hidden
            className={cn(
              "shrink-0 text-[11px] @min-[40rem]:hidden",
              STATUS_TEXT[service.status],
            )}
          >
            {STATUS_WORD[service.status]}
          </span>
        ) : null}
      </p>
      <p className="text-right font-mono text-[12px] text-ink-2 tabular-nums @min-[40rem]:col-start-3 @min-[40rem]:row-start-1">
        {uptime === null ? "—" : formatUptime(uptime)}
      </p>
      <div
        ref={(node) => {
          strip.current = node;
          bind(node);
        }}
        data-sb-strip={service.id}
        role="slider"
        tabIndex={tabbable ? 0 : -1}
        aria-labelledby={nameId}
        aria-describedby={hintId}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={shownDay + 1}
        aria-valuetext={valueText(shownDay)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        {...drag}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (event.pointerType === "mouse") {
            onCursor(dayAt(event.clientX), "pointer");
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") onLeave();
        }}
        className={cn(
          "relative col-span-2 h-5 cursor-pointer touch-pan-y rounded-1 select-none",
          "@min-[40rem]:col-span-1 @min-[40rem]:col-start-2 @min-[40rem]:row-start-1",
          RING,
        )}
      >
        <svg
          aria-hidden
          width="100%"
          height="100%"
          viewBox={`0 0 ${r2(width)} ${STRIP_H}`}
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
          className="block"
        >
          <defs>
            <clipPath id={clipId}>
              <motion.path d={grow} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {LEVELS.map((level) =>
              paths[level] ? (
                <path
                  key={level}
                  d={paths[level]}
                  className={FILL_CLASS[level]}
                />
              ) : null,
            )}
          </g>
        </svg>
        {lensBar ? (
          <motion.span
            aria-hidden
            className={cn(
              "pointer-events-none absolute -inset-y-1 left-0 rounded-[2px] ring-2 ring-card",
              BAR_CLASS[lensBar.level],
            )}
            style={{ x: lensX, width: r2(Math.max(2, barWidth)) }}
          />
        ) : null}
        <AnimatePresence initial={false}>
          {ring ? (
            <motion.span
              key={ring.key}
              aria-hidden
              className="pointer-events-none absolute -inset-y-1.5 left-0 rounded-[3px] border-[1.5px] border-foreground"
              style={{
                x: r2(ring.from * pitch - 3),
                width: r2((ring.to - ring.from + 1) * pitch - gap + 6),
              }}
              initial={motionSafe ? { opacity: 0, scale: 1.3 } : { opacity: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            />
          ) : null}
        </AnimatePresence>
      </div>
    </li>
  );
}

/* ------------------------------ latency card ------------------------------ */

type LatencyCardProps = {
  samples: StatusSample[];
  seriesKey: string;
  count: number;
  target: number;
  regionName: string;
  mode: "live" | "paused" | "snapshot";
  motionSafe: boolean;
  formatTime: (ms: number) => string;
  onInspect: (inspecting: boolean) => void;
  onStep: () => void;
  className?: string;
};

const PLOT_H = 64;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 4;

function LatencyCard({
  samples,
  seriesKey,
  count,
  target,
  regionName,
  mode,
  motionSafe,
  formatTime,
  onInspect,
  onStep,
  className,
}: LatencyCardProps) {
  const uid = React.useId();
  const clipId = `${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-sb-clip`;
  const headingId = `${uid}-latency`;
  const [box, setBox] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(232);
  const [cursor, setCursorState] = React.useState<number | null>(null);
  const shift = useMotionValue(0);
  const ping = useMotionValue(1);

  React.useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(r2(w));
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  const last = samples.length - 1;
  const visible = Math.max(2, count);
  const pitch = width / (visible - 1);
  const first = Math.max(0, last - (visible - 1));
  let peak = target;
  for (const s of samples) peak = Math.max(peak, s.ms);
  // A domain in 50ms steps barely moves, so the line glides rather than
  // the axis jumping under it.
  const domain = Math.max(100, Math.ceil((peak * 1.15) / 50) * 50);
  const yOf = (ms: number) =>
    r2(
      PLOT_TOP +
        (1 - Math.min(ms, domain) / domain) * (PLOT_H - PLOT_TOP - PLOT_BOTTOM),
    );
  const xOf = (j: number) => r2(width - (last - j) * pitch);
  const line = samples.length
    ? `M ${samples.map((s, j) => `${xOf(j)} ${yOf(s.ms)}`).join(" L ")}`
    : "";
  const area = samples.length
    ? `${line} L ${xOf(last)} ${PLOT_H} L ${xOf(0)} ${PLOT_H} Z`
    : "";

  const setCursor = (j: number | null) => {
    if ((j === null) !== (cursor === null)) onInspect(j !== null);
    setCursorState(j);
  };
  const jAt = (clientX: number) => {
    const rect = box?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return last;
    const fromRight = (rect.right - clientX) / (rect.width / (visible - 1));
    return clamp(Math.round(last - fromRight), first, last);
  };

  // A new sample: the line is put back where it was (one step right) and
  // glides left as the new point comes in. Every re-run carries on any
  // glide a previous run left part-way, so nothing freezes mid-step.
  const lastT = samples[last]?.t ?? 0;
  const seenT = React.useRef(lastT);
  React.useEffect(() => {
    const before = seenT.current;
    seenT.current = lastT;
    let steps = 0;
    if (lastT > before) {
      for (const s of samples) if (s.t > before) steps += 1;
      steps = Math.min(3, steps);
    }
    if (!motionSafe) {
      shift.jump(0);
      ping.jump(1);
      return;
    }
    // The step back is a jump, not a set: it must not read as velocity. The
    // glide keeps whatever speed it already had.
    const speed = shift.getVelocity();
    if (steps > 0) {
      shift.jump(r2(shift.get() + steps * pitch));
      ping.jump(0);
    }
    const glide =
      Math.abs(shift.get()) > 0.01
        ? animate(shift, 0, { ...springs.glide, velocity: speed })
        : null;
    const rings =
      ping.get() < 1
        ? animate(ping, 1, { duration: durations.page, ease: easings.enter })
        : null;
    return () => {
      glide?.stop();
      rings?.stop();
    };
  }, [lastT, samples, motionSafe, pitch, shift, ping]);

  const pingR = useTransform(ping, (p) => r2(3 + 8 * p));
  const pingOpacity = useTransform(ping, (p) =>
    p >= 1 ? 0 : r2(0.55 * (1 - p)),
  );

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    onStart: ({ point }) => setCursor(jAt(point.x)),
    onMove: ({ point }) => setCursor(jAt(point.x)),
    onEnd: () => setCursor(null),
    onCancel: () => setCursor(null),
  });

  const head = samples[last];
  const read = cursor !== null ? samples[cursor] : head;
  const over = (read?.ms ?? 0) > target;
  const firstShown = samples[first];

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = cursor ?? last;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = at - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = at + 1;
    else if (event.key === "Home") next = first;
    else if (event.key === "End") next = last;
    else if (event.key === "Escape" && cursor !== null) {
      event.preventDefault();
      setCursor(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    const to = clamp(next, first, last);
    if (to !== cursor) onStep();
    setCursor(to);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id={headingId}
          className="truncate text-[12px] font-medium text-ink-2"
        >
          p95 latency
          <span className="text-ink-3"> · {regionName}</span>
        </h3>
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2 font-mono text-[10px] tracking-[0.06em] uppercase",
            mode === "live" ? "text-signal" : "text-ink-3",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              mode === "live" ? "bg-signal" : "bg-ink-3",
            )}
          />
          {mode === "live" ? "Live" : mode === "paused" ? "Paused" : "Snapshot"}
        </span>
      </div>
      <p className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-[22px] leading-none tabular-nums",
            over ? "text-warn" : "text-foreground",
          )}
        >
          {read?.ms ?? "—"}
        </span>
        <span className="text-[12px] text-ink-3">ms</span>
        <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">
          {cursor !== null && read
            ? `${formatTime(read.t)}`
            : `target ${target}`}
        </span>
      </p>
      <div
        ref={setBox}
        role="slider"
        tabIndex={0}
        aria-label={`p95 latency, ${regionName}`}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={last - first + 1}
        aria-valuenow={(cursor ?? last) - first + 1}
        aria-valuetext={
          read
            ? `${formatTime(read.t)}, ${read.ms} ms${read.ms > target ? ", over target" : ""}`
            : "No samples"
        }
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (cursor === null) setCursor(last);
        }}
        onBlur={() => setCursor(null)}
        {...drag}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (event.pointerType === "mouse") setCursor(jAt(event.clientX));
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setCursor(null);
        }}
        className={cn(
          "relative cursor-crosshair touch-pan-y rounded-1 select-none",
          RING,
        )}
      >
        <svg
          aria-hidden
          width={width}
          height={PLOT_H}
          viewBox={`0 0 ${width} ${PLOT_H}`}
          className="block w-full overflow-visible"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={width} height={PLOT_H} />
            </clipPath>
          </defs>
          <line
            x1={0}
            x2={width}
            y1={yOf(target)}
            y2={yOf(target)}
            strokeDasharray="3 3"
            strokeWidth={1}
            className="stroke-ink-3/60"
          />
          <line
            x1={0}
            x2={width}
            y1={PLOT_H - 0.5}
            y2={PLOT_H - 0.5}
            strokeWidth={1}
            className="stroke-hairline-strong"
          />
          <g clipPath={`url(#${clipId})`}>
            <motion.g style={{ x: shift }}>
              <AnimatePresence initial={false}>
                <motion.g
                  key={seriesKey}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <path
                    d={area}
                    style={{
                      fill: "color-mix(in oklab, var(--accent-bright) 14%, transparent)",
                    }}
                  />
                  <path
                    d={line}
                    fill="none"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    style={{ stroke: "var(--accent-bright)" }}
                  />
                </motion.g>
              </AnimatePresence>
            </motion.g>
          </g>
          {head ? (
            <motion.g style={{ x: shift }}>
              <motion.circle
                cx={xOf(last)}
                cy={yOf(head.ms)}
                r={pingR}
                fill="none"
                strokeWidth={1.2}
                style={{
                  stroke: "var(--accent-bright)",
                  opacity: pingOpacity,
                }}
              />
              <circle
                cx={xOf(last)}
                cy={yOf(head.ms)}
                r={3}
                strokeWidth={1.5}
                className="stroke-surface-1"
                style={{
                  fill:
                    head.ms > target ? PIGMENT.minor : "var(--accent-bright)",
                }}
              />
            </motion.g>
          ) : null}
          {cursor !== null && read ? (
            <g>
              <line
                x1={xOf(cursor)}
                x2={xOf(cursor)}
                y1={0}
                y2={PLOT_H}
                strokeWidth={1}
                className="stroke-foreground/35"
              />
              <circle
                cx={xOf(cursor)}
                cy={yOf(read.ms)}
                r={3.5}
                strokeWidth={1.5}
                className="fill-foreground stroke-surface-1"
              />
            </g>
          ) : null}
        </svg>
      </div>
      <p className="flex justify-between font-mono text-[10px] text-ink-3 tabular-nums">
        <span>{firstShown ? `${formatTime(firstShown.t)}` : ""}</span>
        <span>
          {mode === "snapshot" && head ? `${formatTime(head.t)}` : "now"}
        </span>
      </p>
    </section>
  );
}

/* ------------------------------ regions card ------------------------------ */

type RegionsCardProps = {
  regions: StatusRegion[];
  selected: string | null;
  allLatency: number;
  awake: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onChoose: (id: string | null) => void;
  className?: string;
};

function RegionsCard({
  regions,
  selected,
  allLatency,
  awake,
  motionSafe,
  disabled,
  onChoose,
  className,
}: RegionsCardProps) {
  const uid = React.useId();
  const headingId = `${uid}-regions`;
  const [hover, setHover] = React.useState<string | null>(null);
  const options: { id: string | null; name: string; code: string }[] = [
    { id: null, name: "All regions", code: "All" },
    ...regions.map((r) => ({ id: r.id, name: r.name, code: r.code })),
  ];
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const keyOf = (id: string | null) => id ?? "__all";
  // The caption names what the pointer or focus is on, else the choice.
  const named =
    hover === null
      ? regions.find((r) => r.id === selected)
      : regions.find((r) => r.id === hover);
  const troubled = regions.filter((r) => r.status !== "operational").length;

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const at = options.findIndex((o) => o.id === selected);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = at + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = at - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = options.length - 1;
    else return;
    event.preventDefault();
    const next = options[(to + options.length) % options.length];
    if (!next) return;
    nodes.current.get(keyOf(next.id))?.focus();
    onChoose(next.id);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="text-[12px] font-medium text-ink-2">
          Regions
        </h3>
        <span className="text-[11px] text-ink-3">
          {troubled
            ? plural(troubled, "needs attention", "need attention")
            : "All healthy"}
        </span>
      </div>
      <svg
        aria-hidden
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="block h-auto w-full overflow-visible"
      >
        <path d={LAND} className="fill-ink-3/30" />
        {regions.map((r) => {
          const cx = r2(r.x * MAP_W);
          const cy = r2(r.y * MAP_H);
          const fill = PIGMENT[LEVEL_OF[r.status]];
          const troubled = r.status === "degraded" || r.status === "outage";
          const on = selected === r.id;
          return (
            <g
              key={r.id}
              className={disabled ? undefined : "cursor-pointer"}
              onPointerEnter={() => setHover(r.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => {
                if (!disabled) onChoose(on ? null : r.id);
              }}
            >
              <circle cx={cx} cy={cy} r={9} fill="transparent" />
              {troubled && awake && motionSafe ? (
                <motion.circle
                  cx={cx}
                  cy={cy}
                  r={3.6}
                  fill="none"
                  strokeWidth={1.2}
                  style={{ stroke: fill, originX: 0.5, originY: 0.5 }}
                  initial={{ scale: 1, opacity: 0.75 }}
                  animate={{ scale: 2.8, opacity: 0 }}
                  transition={{
                    duration: 1.6,
                    ease: easings.enter,
                    repeat: Infinity,
                  }}
                />
              ) : null}
              {troubled && !motionSafe ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={6.5}
                  fill="none"
                  strokeWidth={1.2}
                  opacity={0.5}
                  style={{ stroke: fill }}
                />
              ) : null}
              {hover === r.id && !on ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={6.5}
                  fill="none"
                  strokeWidth={1.2}
                  className="stroke-ink-3"
                />
              ) : null}
              {on ? (
                <motion.circle
                  cx={cx}
                  cy={cy}
                  r={6.8}
                  fill="none"
                  strokeWidth={1.5}
                  className="stroke-foreground"
                  style={{ originX: 0.5, originY: 0.5 }}
                  initial={motionSafe ? { scale: 1.5, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <circle
                cx={cx}
                cy={cy}
                r={3.6}
                strokeWidth={1.5}
                className="stroke-surface-1"
                style={{ fill }}
              />
            </g>
          );
        })}
      </svg>
      <p
        aria-hidden
        className="flex h-4 items-center gap-1.5 text-[12px] text-ink-2"
      >
        <span className="truncate text-foreground">
          {named?.name ?? "All regions"}
        </span>
        {named ? (
          <span className={cn("shrink-0", STATUS_TEXT[named.status])}>
            {STATUS_WORD[named.status]}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {named?.latency ?? allLatency} ms
        </span>
      </p>
      <div
        role="radiogroup"
        aria-label="Latency for"
        className="flex flex-wrap gap-1.5"
      >
        {options.map((o) => {
          const region = regions.find((r) => r.id === o.id);
          const on = selected === o.id;
          const ms = region ? region.latency : allLatency;
          const status = region?.status ?? "operational";
          return (
            <button
              key={keyOf(o.id)}
              ref={(node) => {
                if (node) nodes.current.set(keyOf(o.id), node);
                else nodes.current.delete(keyOf(o.id));
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={
                region
                  ? `${region.name}, ${STATUS_WORD[region.status].toLowerCase()}, ${ms} ms`
                  : `All regions, ${ms} ms`
              }
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => onChoose(o.id)}
              onKeyDown={onKeyDown}
              title={o.name}
              onPointerEnter={() => setHover(keyOf(o.id))}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(keyOf(o.id))}
              onBlur={() => setHover(null)}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] transition-colors",
                on
                  ? "border-hairline-strong bg-cobalt-wash text-foreground"
                  : "border-hairline text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                "disabled:cursor-not-allowed",
                RING_IN,
              )}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{
                  background: region
                    ? PIGMENT[LEVEL_OF[status]]
                    : "var(--ink-3)",
                }}
              />
              <span>{o.code}</span>
              <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                {ms}
              </span>
            </button>
          );
        })}
      </div>
      {/* The key to every colour on the board, where a desktop has room. */}
      <ul
        role="list"
        aria-label="Key"
        className="mt-auto hidden flex-wrap gap-x-3 gap-y-1 border-t border-hairline pt-2 text-[11px] text-ink-3 @min-[68rem]:flex"
      >
        {(Object.keys(LEVEL_OF) as StatusLevel[]).map((level) => (
          <li key={level} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: PIGMENT[LEVEL_OF[level]] }}
            />
            {STATUS_WORD[level]}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------- board ---------------------------------- */

/**
 * A service status board. Every service gets a strip of days whose bars grow
 * up out of the baseline in one wave on `glide`, sweeping across and down
 * the board a `cascade` apart, coloured by the worst thing that happened
 * that day. Point at a strip — or step it with the arrow keys — and a lens
 * rides to the day on `snap` with a card of what happened; press-drag to
 * scrub on a touch screen. Select an incident (from its day or from the
 * timeline) and every strip it touched stamps a ring over its days on
 * `snap`, the rest dim, and its updates open on `glide`.
 *
 * Beside it, the p95 latency of the platform (or of one region) runs live:
 * seeded from `now`, a sample lands every `interval`, the line glides left
 * a step on `glide` and the new point pings in. Reading it pauses it. A
 * dot-matrix map marks the regions; troubled ones pulse, but only while the
 * board is on screen and the page is visible. Under reduced motion the bars
 * stand at full height, the lens, card and line step without travel, and
 * troubled regions wear a still halo — every value still changes.
 */
export function StatusBoard({
  days = 90,
  live = true,
  regions = true,
  services = defaultStatusServices,
  incidents = defaultStatusIncidents,
  now = defaultStatusNow,
  latency,
  latencyWindow = 40,
  latencyTarget = 300,
  interval = 2000,
  incident,
  defaultIncident = null,
  onIncidentChange,
  region,
  defaultRegion = null,
  onRegionChange,
  onDaySelect,
  incidentLimit = 3,
  formatDate = shortDate,
  formatTime = clockTime,
  status = "ready",
  onRetry,
  title = "System status",
  label,
  sound = false,
  disabled = false,
  className,
}: StatusBoardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const timelineId = `${uid}-timeline`;

  const nowMs = typeof now === "number" ? now : now.getTime();
  const today = Math.floor(nowMs / DAY_MS);
  const n = clamp(Math.round(days), 7, 90);
  const win = clamp(Math.round(latencyWindow), 8, 120);
  const regionList = Array.isArray(regions)
    ? regions
    : regions
      ? defaultStatusRegions
      : [];
  const showRegions = regionList.length > 0;

  const [ownIncident, setOwnIncident] = React.useState(defaultIncident);
  const selected = incident !== undefined ? incident : ownIncident;
  const [ownRegion, setOwnRegion] = React.useState(defaultRegion);
  const regionId = region !== undefined ? region : ownRegion;
  const activeRegion = regionList.find((r) => r.id === regionId) ?? null;

  const [cursor, setCursor] = React.useState<Cursor | null>(null);
  const [focusRow, setFocusRow] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  // Whether "Show more" found the desktop-only incidents hidden (a narrow
  // board): they are then remounted, so they grow in like the rest instead
  // of appearing at once.
  const [bandOpen, setBandOpen] = React.useState(false);
  const [inspecting, setInspecting] = React.useState(false);
  const [ticks, setTicks] = React.useState(0);
  const [stripWidth, setStripWidth] = React.useState(480);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [panel, setPanel] = React.useState<HTMLElement | null>(null);
  const [onScreen, setOnScreen] = React.useState(false);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    pageVisible,
    pageVisibleOnServer,
  );
  const awake = onScreen && visible;

  const strips = React.useRef(new Map<string, HTMLDivElement>());
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const shownCard = React.useRef(false);
  const reveal = useMotionValue(0);
  const lensX = useMotionValue(0);
  const cardX = useMotionValue(0);
  const cardY = useMotionValue(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  /* -------------------------------- derived ------------------------------- */

  const rows: Row[] = React.useMemo(() => {
    const touched = new Map<string, StatusIncident[]>();
    for (const inc of incidents) {
      const end = inc.end ?? nowMs;
      const d0 = Math.floor(inc.start / DAY_MS);
      const d1 = Math.min(
        d0 + 366,
        Math.floor(Math.max(inc.start, end - 1) / DAY_MS),
      );
      for (let d = d0; d <= d1; d += 1) {
        for (const s of inc.services) {
          const key = `${s}:${d}`;
          const list = touched.get(key);
          if (list) list.push(inc);
          else touched.set(key, [inc]);
        }
      }
    }
    return services.map((service) => {
      const len = service.downtime.length;
      let total = 0;
      let counted = 0;
      const bars: Bar[] = Array.from({ length: n }, (_, i) => {
        const day = today - (n - 1 - i);
        const k = len - 1 - (today - day);
        const raw = k >= 0 ? service.downtime[k] : undefined;
        const down = raw === undefined ? null : Math.max(0, raw);
        const list = touched.get(`${service.id}:${day}`) ?? [];
        const worst = worstOf(list);
        const level: BarLevel = worst
          ? IMPACT_LEVEL[worst.impact]
          : down === null
            ? "none"
            : down > 0
              ? "minor"
              : "ok";
        if (down !== null) {
          total += Math.min(1440, down);
          counted += 1;
        }
        return { day, level, down, incidents: list };
      });
      return {
        service,
        bars,
        uptime: counted ? 1 - total / (counted * 1440) : null,
      };
    });
  }, [services, incidents, n, today, nowMs]);

  const windowStart = (today - (n - 1)) * DAY_MS;
  const listed = React.useMemo(
    () =>
      incidents
        .filter((inc) => (inc.end ?? nowMs) >= windowStart)
        .sort((a, b) => {
          const openA = a.end === undefined ? 1 : 0;
          const openB = b.end === undefined ? 1 : 0;
          return openB - openA || b.start - a.start;
        }),
    [incidents, nowMs, windowStart],
  );
  const selectedIncident = incidents.find((inc) => inc.id === selected) ?? null;

  const allLatency = regionList.length
    ? Math.round(
        regionList.reduce((sum, r) => sum + r.latency, 0) / regionList.length,
      )
    : 180;
  const provided = latency !== undefined;
  const stepMs = Math.max(250, Math.round(interval));
  const headN = Math.floor(nowMs / stepMs) + ticks;
  const seed = activeRegion ? hashText(activeRegion.id) : 1314;
  const base = activeRegion ? activeRegion.latency : allLatency;
  const samples: StatusSample[] = React.useMemo(() => {
    if (latency) return latency.slice(-(win + 1));
    return Array.from({ length: win + 1 }, (_, i) => {
      const k = headN - win + i;
      return { t: k * stepMs, ms: latencyAt(k, seed, base) };
    });
  }, [latency, win, headN, stepMs, seed, base]);

  // Bars keep a pixel of gap while a day has room for one; narrower than
  // that, a one-pixel bar beside a one-pixel gap reads as grey, so the days
  // touch and the colour changes carry the story.
  const gap = stripWidth / n >= 5 ? 2 : stripWidth / n >= 2.5 ? 1 : 0;
  const barWidth = Math.max(0.5, (stripWidth - gap * (n - 1)) / n);
  const pitch = barWidth + gap;
  const cursorDay = cursor ? Math.min(cursor.day, n - 1) : null;
  const rowsById = new Map(rows.map((r) => [r.service.id, r]));
  const tabRow =
    focusRow && rowsById.has(focusRow) ? focusRow : rows[0]?.service.id;

  const worstNow = services.reduce<StatusLevel>(
    (w, s) => (STATUS_RANK[s.status] > STATUS_RANK[w] ? s.status : w),
    "operational",
  );
  const affected = services.filter((s) => s.status !== "operational");

  /* -------------------------------- effects ------------------------------- */

  React.useEffect(() => {
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setOnScreen(entry.isIntersecting);
    });
    io.observe(root);
    return () => io.disconnect();
  }, [root]);

  // The live feed: one seeded sample per interval, and only while someone
  // could see it — on screen, page visible, not being read.
  const feeding =
    live &&
    !provided &&
    awake &&
    !inspecting &&
    !disabled &&
    status === "ready";
  React.useEffect(() => {
    if (!feeding) return;
    const id = window.setInterval(() => setTicks((t) => t + 1), stepMs);
    return () => window.clearInterval(id);
  }, [feeding, stepMs]);

  // The strips' width, measured off the panel; every strip shares it.
  React.useEffect(() => {
    if (!panel) return;
    const measure = () => {
      const first = panel.querySelector<HTMLElement>("[data-sb-strip]");
      const w = first?.getBoundingClientRect().width;
      if (w && w > 0) setStripWidth(r2(w));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(panel);
    return () => ro.disconnect();
  }, [panel]);

  const rowCount = rows.length;
  React.useEffect(() => {
    if (status !== "ready") return;
    if (!motionSafe) {
      reveal.jump(1);
      return;
    }
    // Replayed for a new window or new services; a StrictMode re-run starts
    // it again rather than leaving the bars half grown.
    reveal.jump(0);
    const grow = animate(reveal, 1, { ...springs.glide, velocity: 0 });
    return () => grow.stop();
  }, [n, rowCount, status, motionSafe, reveal]);

  // The lens and the card ride to the day; first sight of them is a jump.
  const cursorKey = cursor ? `${cursor.service}:${cursorDay}` : "";
  React.useLayoutEffect(() => {
    if (!cursor || cursorDay === null || !panel) {
      shownCard.current = false;
      return;
    }
    const strip = strips.current.get(cursor.service);
    if (!strip) return;
    const jump = !shownCard.current || !motionSafe;
    const lx = r2(cursorDay * pitch);
    if (jump) {
      anims.current.get("lens")?.stop();
      lensX.jump(lx);
    } else {
      run("lens", animate(lensX, lx, springs.snap));
    }
    const card = cardRef.current;
    if (card) {
      const p = panel.getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      const centre = s.left - p.left + lx + barWidth / 2;
      const x = r2(clamp(centre - cw / 2, 4, Math.max(4, p.width - cw - 4)));
      const above = s.top - p.top - ch - 10;
      const y = r2(above >= 2 ? above : s.bottom - p.top + 10);
      if (jump) {
        anims.current.get("cardX")?.stop();
        anims.current.get("cardY")?.stop();
        cardX.jump(x);
        cardY.jump(y);
      } else {
        run("cardX", animate(cardX, x, springs.snap));
        run("cardY", animate(cardY, y, springs.snap));
      }
    }
    shownCard.current = true;
    // Placed once per day under the cursor and whenever the strips resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorKey, panel, pitch, barWidth, motionSafe]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ------------------------------- handlers ------------------------------- */

  const dayText = (row: Row, i: number) => {
    const bar = row.bars[i];
    if (!bar) return "";
    const ms = bar.day * DAY_MS;
    const date = `${WEEKDAYS[new Date(ms).getUTCDay()] ?? ""}, ${formatDate(ms)}`;
    if (bar.down === null) return `${date}: no data.`;
    const up = formatUptime(1 - Math.min(1440, bar.down) / 1440);
    const down = bar.down
      ? `, ${plural(bar.down, "minute", "minutes")} down`
      : "";
    const what = bar.incidents.length
      ? ` ${bar.incidents.map((inc) => inc.title).join("; ")}.`
      : "";
    return `${date}: ${up} uptime${down}.${what}`;
  };

  // Samples land seconds apart, so their default label carries seconds;
  // a host's own clock format is used as given.
  const formatSample = (ms: number) =>
    formatTime === clockTime
      ? `${clockTime(ms)}${secondsOf(ms)}`
      : formatTime(ms);

  const tick = (row: Row | undefined, day: number) => {
    const bar = row?.bars[day];
    const bad = bar?.level === "major" ? 5 : bar?.level === "minor" ? 2 : 0;
    audio.play("tick", {
      pitch: r2(semitones(-3 + (6 * day) / Math.max(1, n - 1) - bad)),
      gain: 0.35,
    });
  };

  const moveCursor = (serviceId: string, day: number, via: Via) => {
    const d = clamp(day, 0, n - 1);
    const changed = !cursor || cursor.service !== serviceId || cursorDay !== d;
    if (changed && via !== "pointer") tick(rowsById.get(serviceId), d);
    if (changed || cursor?.via !== via) {
      setCursor({ service: serviceId, day: d, via });
    }
  };

  const incidentSentence = (inc: StatusIncident) => {
    const names = inc.services
      .map((id) => services.find((s) => s.id === id)?.name ?? id)
      .join(", ");
    const span = formatSpan(((inc.end ?? nowMs) - inc.start) / MIN_MS);
    const stage = STAGE_WORD[stageOf(inc)].toLowerCase();
    return `${inc.title}, ${stage}, ${span}. Affects ${names}.`;
  };

  const toggleAll = (open: boolean) => {
    if (open) {
      const band = root?.querySelector("[data-sb-band]");
      setBandOpen(!!band && getComputedStyle(band).display === "none");
    } else {
      setBandOpen(false);
    }
    setShowAll(open);
  };

  const chooseIncident = (id: string | null) => {
    if (disabled || id === selected) return;
    if (incident === undefined) setOwnIncident(id);
    onIncidentChange?.(id);
    const inc = incidents.find((i) => i.id === id);
    if (!inc) {
      say("Incident cleared.");
      return;
    }
    if (listed.indexOf(inc) >= incidentLimit && !showAll) toggleAll(true);
    if (inc.impact === "major") audio.play("buzz", { pitch: 0.8, gain: 0.3 });
    say(incidentSentence(inc));
  };

  const selectDay = (serviceId: string, day: number) => {
    const row = rowsById.get(serviceId);
    const bar = row?.bars[day];
    if (!row || !bar) return;
    setCursor({ service: serviceId, day, via: cursor?.via ?? "key" });
    if (disabled) return;
    onDaySelect?.(serviceId, isoOfDay(bar.day));
    const worst = worstOf(bar.incidents);
    if (worst) chooseIncident(worst.id === selected ? null : worst.id);
    else say(`${dayText(row, day)} No incidents.`);
  };

  const chooseRegion = (id: string | null) => {
    if (disabled || id === regionId) return;
    if (region === undefined) setOwnRegion(id);
    onRegionChange?.(id);
    const index = regionList.findIndex((r) => r.id === id);
    audio.play("tick", { pitch: r2(semitones(index + 1)), gain: 0.4 });
    const r = regionList[index];
    say(
      r
        ? `Latency for ${r.name}, ${STATUS_WORD[r.status].toLowerCase()}.`
        : "Latency for all regions.",
    );
  };

  const onStripKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    serviceId: string,
  ) => {
    const at =
      cursor?.service === serviceId && cursorDay !== null ? cursorDay : n - 1;
    const rowIndex = rows.findIndex((r) => r.service.id === serviceId);
    const toDay = (d: number) => {
      event.preventDefault();
      moveCursor(serviceId, d, "key");
    };
    switch (event.key) {
      case "ArrowLeft":
        toDay(at - 1);
        return;
      case "ArrowRight":
        toDay(at + 1);
        return;
      case "PageUp":
        toDay(at - 7);
        return;
      case "PageDown":
        toDay(at + 7);
        return;
      case "Home":
        toDay(0);
        return;
      case "End":
        toDay(n - 1);
        return;
      case "ArrowUp":
      case "ArrowDown": {
        event.preventDefault();
        const next = rows[rowIndex + (event.key === "ArrowUp" ? -1 : 1)];
        if (!next) return;
        // Focus first: the new strip's focus handler must not have the
        // last word on which day is shown.
        strips.current.get(next.service.id)?.focus();
        setFocusRow(next.service.id);
        moveCursor(next.service.id, at, "key");
        return;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        selectDay(serviceId, at);
        return;
      case "Escape":
        if (selected) {
          event.preventDefault();
          chooseIncident(null);
        } else if (cursor) {
          event.preventDefault();
          setCursor(null);
        }
        return;
    }
  };

  /* -------------------------------- render -------------------------------- */

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-2.5">
      <div className="min-w-0">
        <h2 id={titleId} className="truncate text-sm font-semibold">
          {title}
        </h2>
        <p className="truncate text-[11px] text-ink-3">
          Updated {formatTime(nowMs)} UTC · last {n} days
        </p>
      </div>
      {status === "ready" ? (
        <p
          className="inline-flex h-7 max-w-full min-w-0 items-center gap-2 rounded-full border border-hairline bg-surface-1 px-2.5 text-[12px]"
          title={
            affected.length
              ? affected
                  .map((s) => `${s.name}: ${STATUS_WORD[s.status]}`)
                  .join(", ")
              : undefined
          }
        >
          <span className="relative flex size-2 shrink-0">
            {worstNow !== "operational" && awake && motionSafe ? (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ background: PIGMENT[LEVEL_OF[worstNow]] }}
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 2.6, opacity: 0 }}
                transition={{
                  duration: 1.6,
                  ease: easings.enter,
                  repeat: Infinity,
                }}
              />
            ) : null}
            <span
              aria-hidden
              className="relative size-2 rounded-full"
              style={{ background: PIGMENT[LEVEL_OF[worstNow]] }}
            />
          </span>
          <span className="truncate text-foreground">{OVERALL[worstNow]}</span>
          {affected.length ? (
            <span className="truncate text-ink-3">
              {affected.length === 1
                ? affected[0]?.name
                : `${affected.length} services`}
            </span>
          ) : null}
        </p>
      ) : null}
    </header>
  );

  const body = () => {
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className="grid gap-3 p-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]:p-4"
        >
          <p className="sr-only">Loading status.</p>
          <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <span
                  className="h-3 rounded-1 bg-surface-2"
                  style={{ width: `${30 + ((i * 23) % 40)}%` }}
                />
                <span className="h-5 rounded-1 bg-surface-2" />
              </div>
            ))}
          </div>
          <div className="h-40 rounded-3 border border-hairline bg-surface-1" />
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Status did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }

    // A desktop column has room for three more than a phone does; they are
    // in the document either way and only shown where they fit.
    const wideLimit = incidentLimit + 3;
    const shownIncidents = showAll ? listed : listed.slice(0, wideLimit);
    const moreNarrow = listed.length - incidentLimit;
    const moreWide = listed.length - wideLimit;
    const cursorRow = cursor ? rowsById.get(cursor.service) : undefined;
    const cursorBar =
      cursorRow && cursorDay !== null ? cursorRow.bars[cursorDay] : undefined;
    const ringFor = (serviceId: string) => {
      if (!selectedIncident || !selectedIncident.services.includes(serviceId))
        return null;
      const end = selectedIncident.end ?? nowMs;
      const d0 = Math.floor(selectedIncident.start / DAY_MS);
      const d1 = Math.floor(Math.max(selectedIncident.start, end - 1) / DAY_MS);
      const from = Math.max(0, d0 - (today - (n - 1)));
      const to = Math.min(n - 1, d1 - (today - (n - 1)));
      if (to < 0 || from > n - 1 || from > to) return null;
      return { key: selectedIncident.id, from, to };
    };

    return (
      <div
        className={cn(
          "grid gap-3 p-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]:grid-rows-[auto_1fr]",
          showRegions
            ? "@min-[68rem]:grid-cols-[minmax(0,1fr)_19rem_16rem]"
            : "@min-[68rem]:grid-cols-[minmax(0,1fr)_22rem]",
        )}
      >
        {/* Services */}
        <section
          ref={setPanel}
          aria-label="Services"
          className="relative rounded-3 border border-hairline bg-surface-1 p-3 @min-[40rem]:col-start-1 @min-[40rem]:row-start-1"
          style={PIGMENT_VARS}
        >
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h3 className="text-[12px] font-medium text-ink-2">Services</h3>
            <p className="text-[11px] text-ink-3">Uptime · last {n} days</p>
          </div>
          <p id={hintId} className="sr-only">
            Left and Right step a day, Page Up and Page Down a week, Up and Down
            change service, Enter selects the day.
          </p>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-3">
              No services to show.
            </p>
          ) : (
            <ul
              role="list"
              className="flex flex-col gap-3 @min-[40rem]:gap-1.5"
            >
              {rows.map((row, index) => {
                const id = row.service.id;
                const active = cursor?.service === id;
                return (
                  <ServiceRow
                    key={id}
                    row={row}
                    index={index}
                    nameId={`${uid}-svc-${index}`}
                    hintId={hintId}
                    pitch={pitch}
                    barWidth={barWidth}
                    gap={gap}
                    width={stripWidth}
                    reveal={reveal}
                    reach={1 + RAMP + Math.max(0, rows.length - 1) * 0.05}
                    cursorDay={active ? cursorDay : null}
                    lensX={lensX}
                    tabbable={tabRow === id}
                    dim={
                      !!selectedIncident &&
                      !selectedIncident.services.includes(id)
                    }
                    ring={ringFor(id)}
                    motionSafe={motionSafe}
                    valueText={(i) => dayText(row, i)}
                    bind={(node) => {
                      if (node) strips.current.set(id, node);
                      else strips.current.delete(id);
                    }}
                    onCursor={(day, via) => moveCursor(id, day, via)}
                    onLeave={() => {
                      if (cursor?.via === "pointer") setCursor(null);
                    }}
                    onSelect={(day) => selectDay(id, day)}
                    onKeyDown={(event) => onStripKey(event, id)}
                    onFocus={() => {
                      setFocusRow(id);
                      if (cursor?.service !== id) {
                        setCursor({ service: id, day: n - 1, via: "key" });
                      }
                    }}
                    onBlur={(event) => {
                      const to = event.relatedTarget;
                      if (
                        to instanceof Element &&
                        to.hasAttribute("data-sb-strip")
                      )
                        return;
                      if (cursor?.via !== "pointer") setCursor(null);
                    }}
                  />
                );
              })}
            </ul>
          )}
          <div className="mt-1.5 grid grid-cols-1 font-mono text-[10px] text-ink-3 @min-[40rem]:grid-cols-[8.5rem_minmax(0,1fr)_3.75rem] @min-[40rem]:gap-x-3">
            <p className="flex justify-between @min-[40rem]:col-start-2">
              <span>{n} days ago</span>
              <span>Today</span>
            </p>
          </div>

          <AnimatePresence>
            {cursorRow && cursorBar ? (
              <motion.div
                key="card"
                ref={cardRef}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 z-10 w-60 max-w-[calc(100%-8px)] rounded-3 border border-hairline-strong bg-popover p-3 shadow-[0_8px_24px_color-mix(in_oklab,black_16%,transparent)]"
                style={{ x: cardX, y: cardY }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                <DayCard
                  row={cursorRow}
                  bar={cursorBar}
                  formatDate={formatDate}
                  nowMs={nowMs}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {/* Incidents */}
        <section
          aria-labelledby={timelineId}
          className="rounded-3 border border-hairline bg-surface-1 p-3 @min-[40rem]:col-start-1 @min-[40rem]:row-start-2 @min-[68rem]:col-start-2 @min-[68rem]:row-span-2 @min-[68rem]:row-start-1"
        >
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 id={timelineId} className="text-[12px] font-medium text-ink-2">
              Incidents
            </h3>
            <p className="text-[11px] text-ink-3">
              {plural(listed.length, "incident", "incidents")} in {n} days
            </p>
          </div>
          {listed.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-3">
              Nothing to report.
            </p>
          ) : (
            <ol
              id={`${uid}-incidents`}
              role="list"
              className="relative flex flex-col"
            >
              <span
                aria-hidden
                className="absolute top-3 bottom-3 left-[9px] w-px bg-hairline-strong"
              />
              <AnimatePresence initial={false}>
                {shownIncidents.map((inc, i) => {
                  const band = i >= incidentLimit && i < wideLimit;
                  return (
                    <IncidentItem
                      key={band && bandOpen ? `${inc.id}~open` : inc.id}
                      band={band && !showAll}
                      inc={inc}
                      index={i}
                      open={inc.id === selected}
                      uid={uid}
                      services={services}
                      nowMs={nowMs}
                      motionSafe={motionSafe}
                      disabled={disabled}
                      formatDate={formatDate}
                      formatTime={formatTime}
                      onToggle={() =>
                        chooseIncident(inc.id === selected ? null : inc.id)
                      }
                      onEscape={() => chooseIncident(null)}
                      className={
                        !showAll && i >= incidentLimit
                          ? "hidden @min-[68rem]:block"
                          : undefined
                      }
                    />
                  );
                })}
              </AnimatePresence>
            </ol>
          )}
          {listed.length > incidentLimit ? (
            <button
              type="button"
              onClick={() => toggleAll(!showAll)}
              aria-controls={`${uid}-incidents`}
              aria-expanded={showAll}
              className={cn(
                "mt-0.5 ml-5 inline-flex h-7 items-center rounded-2 px-2 text-[12px] text-cobalt-bright transition-colors hover:bg-surface-2",
                !showAll && moreWide <= 0 && "@min-[68rem]:hidden",
                RING,
              )}
            >
              {showAll ? (
                "Show fewer"
              ) : (
                <>
                  <span className="@min-[68rem]:hidden">
                    Show {moreNarrow} more
                  </span>
                  <span className="hidden @min-[68rem]:inline">
                    Show {Math.max(0, moreWide)} more
                  </span>
                </>
              )}
            </button>
          ) : null}
        </section>

        {/* Latency and regions */}
        {/* One column beside the services on a tablet; on a desktop the
            latency sits under the services and the map takes a column. */}
        <div className="flex flex-col gap-3 @min-[40rem]:col-start-2 @min-[40rem]:row-span-2 @min-[40rem]:row-start-1 @min-[68rem]:contents">
          <LatencyCard
            samples={samples}
            seriesKey={activeRegion?.id ?? "all"}
            count={win}
            target={latencyTarget}
            regionName={activeRegion?.name ?? "All regions"}
            mode={
              !live || provided
                ? provided && live
                  ? "live"
                  : "snapshot"
                : inspecting || !awake
                  ? "paused"
                  : "live"
            }
            motionSafe={motionSafe}
            formatTime={formatSample}
            onInspect={setInspecting}
            onStep={() => audio.play("tick", { pitch: 1.2, gain: 0.3 })}
            className="@min-[68rem]:col-start-1 @min-[68rem]:row-start-2"
          />
          {showRegions ? (
            <RegionsCard
              regions={regionList}
              selected={activeRegion?.id ?? null}
              allLatency={allLatency}
              awake={awake}
              motionSafe={motionSafe}
              disabled={disabled}
              onChoose={chooseRegion}
              className="@min-[68rem]:col-start-3 @min-[68rem]:row-span-2 @min-[68rem]:row-start-1"
            />
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={setRoot}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container max-h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      {header}
      {body()}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/* ------------------------------- day card -------------------------------- */

function DayCard({
  row,
  bar,
  formatDate,
  nowMs,
}: {
  row: Row;
  bar: Bar;
  formatDate: (ms: number) => string;
  nowMs: number;
}) {
  const ms = bar.day * DAY_MS;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-foreground">
          {row.service.name}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3">
          {WEEKDAYS[new Date(ms).getUTCDay()]}, {formatDate(ms)}
        </span>
      </p>
      {bar.down === null ? (
        <p className="text-[12px] text-ink-3">No data for this day.</p>
      ) : (
        <p className="text-[12px] text-ink-2">
          <span className="font-mono tabular-nums">
            {formatUptime(1 - Math.min(1440, bar.down) / 1440)}
          </span>{" "}
          uptime
          {bar.down > 0 ? (
            <span className="text-ink-3"> · {formatSpan(bar.down)} down</span>
          ) : null}
        </p>
      )}
      {bar.incidents.length ? (
        <ul
          role="list"
          className="flex flex-col gap-1 border-t border-hairline pt-1.5"
        >
          {bar.incidents.map((inc) => (
            <li key={inc.id} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ background: PIGMENT[IMPACT_LEVEL[inc.impact]] }}
              />
              <span className="min-w-0 text-[12px] leading-snug text-foreground">
                {inc.title}
                <span className="block text-[11px] text-ink-3">
                  {IMPACT_WORD[inc.impact]} ·{" "}
                  {formatSpan(((inc.end ?? nowMs) - inc.start) / MIN_MS)}
                  {inc.end === undefined ? " so far" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : bar.down === 0 ? (
        <p className="text-[11px] text-ink-3">No downtime recorded.</p>
      ) : bar.down !== null ? (
        <p className="text-[11px] text-ink-3">
          Brief degradation, no incident filed.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------ incident item ----------------------------- */

function IncidentItem({
  inc,
  index,
  open,
  uid,
  services,
  nowMs,
  motionSafe,
  disabled,
  formatDate,
  formatTime,
  onToggle,
  onEscape,
  band = false,
  className,
}: {
  inc: StatusIncident;
  index: number;
  open: boolean;
  uid: string;
  services: StatusService[];
  nowMs: number;
  motionSafe: boolean;
  disabled: boolean;
  formatDate: (ms: number) => string;
  formatTime: (ms: number) => string;
  onToggle: () => void;
  onEscape: () => void;
  /** Shown only where a desktop has room for it. */
  band?: boolean;
  className?: string;
}) {
  const panelId = `${uid}-inc-${inc.id}`;
  const stage = stageOf(inc);
  const ongoing = inc.end === undefined;
  const names = inc.services
    .map((id) => services.find((s) => s.id === id)?.name ?? id)
    .join(", ");
  const span = formatSpan(((inc.end ?? nowMs) - inc.start) / MIN_MS);
  const updates = [...inc.updates].reverse();

  return (
    <motion.li
      data-sb-band={band || undefined}
      className={cn("relative overflow-clip pl-5", className)}
      initial={motionSafe ? { opacity: 0, height: 0 } : { opacity: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{
        opacity: 0,
        height: motionSafe ? 0 : "auto",
        transition: exitFor(durations.base),
      }}
      transition={{
        height: motionSafe
          ? { ...springs.glide, delay: index * cascade(4) * 0.5 }
          : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
    >
      <motion.span
        aria-hidden
        className="absolute top-[9px] left-1 size-2.5 rounded-full ring-[3px] ring-surface-1"
        style={{ background: PIGMENT[IMPACT_LEVEL[inc.impact]] }}
        animate={{ scale: open ? 1.35 : 1 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            onEscape();
          }
        }}
        className={cn(
          "flex w-full flex-col items-start gap-0.5 rounded-2 px-2 py-1 text-left transition-colors",
          open ? "bg-surface-2" : "enabled:hover:bg-surface-2",
          "disabled:cursor-not-allowed",
          RING_IN,
        )}
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
            title={inc.title}
          >
            {inc.title}
          </span>
          <span className={cn("shrink-0 text-[11px]", STAGE_TEXT[stage])}>
            {STAGE_WORD[stage]}
          </span>
        </span>
        <span className="w-full truncate text-[11px] text-ink-3">
          {ongoing ? <span className="text-warn">Ongoing · </span> : null}
          {formatDate(inc.start)} · {span}
          {ongoing ? " so far" : ""} · {names}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="updates"
            className="overflow-clip"
            initial={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: motionSafe ? 0 : "auto",
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={{
              height: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
          >
            <ol role="list" className="flex flex-col gap-1.5 px-2 pt-1 pb-2">
              {updates.map((u, i) => (
                <motion.li
                  key={`${u.at}-${i}`}
                  className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2"
                  initial={
                    motionSafe ? { opacity: 0, y: -distances.nudge } : false
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? { ...springs.snap, delay: i * cascade(updates.length) }
                      : { duration: 0 }
                  }
                >
                  <span className="pt-px font-mono text-[11px] text-ink-3 tabular-nums">
                    {formatTime(u.at)}
                  </span>
                  <p className="text-[12px] leading-snug text-ink-2">
                    <span className={cn("font-medium", STAGE_TEXT[u.stage])}>
                      {STAGE_WORD[u.stage]}
                    </span>{" "}
                    {u.text}
                  </p>
                </motion.li>
              ))}
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}
