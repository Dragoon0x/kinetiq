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
import {
  ChevronRight,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Users,
  Wrench,
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
import {
  project,
  rubberband,
  rubberClamp,
  useDrag,
} from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type AppShellTransition = "slide" | "fade" | "zoom";
export type AppShellDensity = "compact" | "cozy" | "roomy";
export type AppShellStatus = "ready" | "loading" | "error";
/** Any 16px icon drawn in currentColor. */
export type AppShellIcon = React.ReactNode;

export type AppShellPage = {
  id: string;
  /** The destination's name: its row in the sidebar, its search result and its last crumb. */
  label: string;
  /** 16px, in currentColor. It stays on the rail when the labels tuck away. */
  icon: AppShellIcon;
  /** A count beside the label; on the rail it folds to a dot on the icon. */
  badge?: number;
  /** What the badge counts, for assistive technology ("2 late"). @default the number */
  badgeLabel?: string;
  /** The sidebar section it files under; consecutive pages in one section share a heading. */
  section?: string;
  /** The trail above the page, ending at this page. @default workspace, section, label */
  crumbs?: string[];
  /** The page's heading. @default label */
  title?: string;
  /** One line under the heading. */
  summary?: string;
  /** More words search should find this page by: record names, ids, people. */
  keywords?: string[];
  /** The page itself. */
  content?: React.ReactNode;
};

export type AppShellWorkspace = {
  name: string;
  /** A quieter line under the name: a team, a site. */
  detail?: string;
  /** A 28px mark. @default the name's first letter on a cobalt tile */
  mark?: React.ReactNode;
};

export type AppShellUser = {
  name: string;
  role?: string;
};

export type AppShellProps = {
  /** The destinations, in sidebar order. Each carries its own page. @default defaultShellPages */
  pages?: AppShellPage[];
  /** Controlled current page id. */
  page?: string;
  /** Initial page when uncontrolled. @default the first page */
  defaultPage?: string;
  /** Fires from the row, crumb, shortcut or search result that chose a page, with its id. */
  onPageChange?: (id: string) => void;
  /** Controlled: the sidebar folded to its rail (or hidden, without `rail`). */
  collapsed?: boolean;
  /** Initial fold when uncontrolled. @default by width: open from 1024px, folded below */
  defaultCollapsed?: boolean;
  /** Fires from the toggle, the edge drag or the shortcut, with the new fold. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Fold to a 56px icon rail whose labels become tooltips. Off: the sidebar folds away entirely. @default true */
  rail?: boolean;
  /** How the content changes page: rising in the direction of travel, a cross-fade, or settling from depth. @default "slide" */
  transition?: AppShellTransition;
  /** Row heights, the top bar and the content's spacing. @default "cozy" */
  density?: AppShellDensity;
  /** The product at the top of the sidebar. @default defaultShellWorkspace */
  workspace?: AppShellWorkspace;
  /** Who is signed in, at the foot of the sidebar. @default defaultShellUser */
  user?: AppShellUser;
  /** The sidebar navigation's accessible name. @default "Main" */
  navLabel?: string;
  /** The search field's placeholder. @default "Search " + the workspace name */
  searchPlaceholder?: string;
  /** Enter in search with no page matching, with the query. */
  onSearch?: (query: string) => void;
  /** Keyboard shortcuts while focus is in the shell (or it is hovered with nothing focused): [ or Cmd/Ctrl+B fold, 1–9 pages, / search. @default true */
  shortcuts?: boolean;
  /** The content area's state: a page still loading shows its skeleton; one that failed offers Retry. @default "ready" */
  status?: AppShellStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** The shell's accessible name. @default the workspace name */
  label?: string;
  /** Play the fold and the page clicks. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

export type ShellJobStatus =
  "scheduled" | "en route" | "on site" | "late" | "done";

export type ShellJob = {
  id: string;
  title: string;
  site: string;
  crew: string;
  /** The booked window, 24-hour: "09:00–11:00". */
  window: string;
  status: ShellJobStatus;
};

export type ShellCrewStatus = "on site" | "en route" | "available" | "off";

export type ShellCrewMember = {
  id: string;
  name: string;
  role: string;
  team: string;
  status: ShellCrewStatus;
  /** Jobs booked today. */
  jobs: number;
};

export type ShellDay = { day: string; done: number };

export type ShellActivity = { id: string; at: string; text: string };

export const defaultShellWorkspace: AppShellWorkspace = {
  name: "Fieldline",
  detail: "Ops · North depot",
};

export const defaultShellUser: AppShellUser = {
  name: "Juno Vale",
  role: "Dispatcher",
};

export const defaultShellJobs: ShellJob[] = [
  {
    id: "J-4102",
    title: "Boiler service",
    site: "14 Alder Row",
    crew: "Team North",
    window: "08:00–10:00",
    status: "done",
  },
  {
    id: "J-4103",
    title: "Heat pump install",
    site: "Larch Court, unit 6",
    crew: "Team East",
    window: "09:00–13:00",
    status: "on site",
  },
  {
    id: "J-4104",
    title: "Leak under the sink",
    site: "3 Quarry Lane",
    crew: "Team North",
    window: "10:30–11:30",
    status: "late",
  },
  {
    id: "J-4105",
    title: "Thermostat swap",
    site: "Basin Yard 2",
    crew: "Team West",
    window: "11:00–12:00",
    status: "en route",
  },
  {
    id: "J-4106",
    title: "Annual safety check",
    site: "88 Mill Street",
    crew: "Team East",
    window: "13:30–14:30",
    status: "scheduled",
  },
  {
    id: "J-4107",
    title: "Radiator bleed",
    site: "21 Fen Road",
    crew: "Team West",
    window: "14:00–15:00",
    status: "scheduled",
  },
  {
    id: "J-4108",
    title: "Water heater quote",
    site: "Coldbrook Terrace 5",
    crew: "Team North",
    window: "15:30–16:30",
    status: "scheduled",
  },
];

export const defaultShellCrew: ShellCrewMember[] = [
  {
    id: "c1",
    name: "Ines Park",
    role: "Lead engineer",
    team: "Team North",
    status: "on site",
    jobs: 3,
  },
  {
    id: "c2",
    name: "Tomas Reyes",
    role: "Engineer",
    team: "Team East",
    status: "on site",
    jobs: 2,
  },
  {
    id: "c3",
    name: "Mira Chen",
    role: "Engineer",
    team: "Team West",
    status: "en route",
    jobs: 2,
  },
  {
    id: "c4",
    name: "Oskar Lund",
    role: "Apprentice",
    team: "Team North",
    status: "available",
    jobs: 1,
  },
  {
    id: "c5",
    name: "Dana Holt",
    role: "Engineer",
    team: "Team East",
    status: "available",
    jobs: 1,
  },
  {
    id: "c6",
    name: "Sami Noor",
    role: "Engineer",
    team: "Team West",
    status: "off",
    jobs: 0,
  },
];

/** Completed jobs over the last seven days; today is still running. */
export const defaultShellWeek: ShellDay[] = [
  { day: "Wed", done: 14 },
  { day: "Thu", done: 17 },
  { day: "Fri", done: 12 },
  { day: "Sat", done: 6 },
  { day: "Sun", done: 3 },
  { day: "Mon", done: 15 },
  { day: "Tue", done: 9 },
];

export const defaultShellActivity: ShellActivity[] = [
  {
    id: "a1",
    at: "10:52",
    text: "Team North is 20 minutes late to 3 Quarry Lane",
  },
  {
    id: "a2",
    at: "10:41",
    text: "Mira Chen set off for Basin Yard 2",
  },
  { id: "a3", at: "10:05", text: "J-4102 closed with a signed sheet" },
  {
    id: "a4",
    at: "09:12",
    text: "Tomas Reyes arrived at Larch Court",
  },
  { id: "a5", at: "08:30", text: "Seven jobs dispatched for today" },
];

const JOB_TONE: Record<ShellJobStatus, { dot: string; text: string }> = {
  done: { dot: "bg-success", text: "text-success" },
  "on site": { dot: "bg-cobalt-bright", text: "text-cobalt-bright" },
  "en route": { dot: "bg-signal", text: "text-signal" },
  late: { dot: "bg-warn", text: "text-warn" },
  scheduled: { dot: "bg-ink-3", text: "text-ink-2" },
};

const SAY: Record<ShellJobStatus | ShellCrewStatus, string> = {
  scheduled: "Scheduled",
  "en route": "En route",
  "on site": "On site",
  late: "Late",
  done: "Done",
  available: "Available",
  off: "Off today",
};

const CREW_TONE: Record<ShellCrewStatus, string> = {
  "on site": "bg-cobalt-bright",
  "en route": "bg-signal",
  available: "bg-success",
  off: "bg-ink-3",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

function StatusChip({ status }: { status: ShellJobStatus }) {
  const tone = JOB_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px]",
        tone.text,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
      {SAY[status]}
    </span>
  );
}

/** A tile, a chart and a feed: the dispatcher's morning at a glance. */
function ShellOverview({
  jobs = defaultShellJobs,
  week = defaultShellWeek,
  activity = defaultShellActivity,
}: {
  jobs?: ShellJob[];
  week?: ShellDay[];
  activity?: ShellActivity[];
}) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const count = (s: ShellJobStatus) =>
    jobs.filter((j) => j.status === s).length;
  const late = count("late");
  const tiles = [
    {
      label: "Jobs today",
      value: String(jobs.length),
      note: `${count("done")} done`,
    },
    {
      label: "Out now",
      value: String(count("on site") + count("en route")),
      note: `${count("on site")} on site`,
    },
    {
      label: "Running late",
      value: String(late),
      note: late === 0 ? "All on time" : "Call ahead",
      warn: late > 0,
    },
    { label: "First-time fix", value: "92%", note: "Last 30 days" },
  ];
  const top = Math.max(1, ...week.map((d) => d.done));
  const step = cascade(week.length);
  return (
    <div className="flex flex-col gap-(--shell-gap)">
      <div className="grid grid-cols-2 gap-(--shell-gap) @min-[720px]:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="flex min-w-0 flex-col gap-1 rounded-3 border border-hairline bg-card p-(--shell-gap)"
          >
            <span className="truncate text-xs text-ink-3">{t.label}</span>
            <span
              className={cn(
                "font-mono text-2xl leading-none font-medium tabular-nums",
                t.warn ? "text-warn" : "text-foreground",
              )}
            >
              {t.value}
            </span>
            <span className="truncate text-xs text-ink-2">{t.note}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-(--shell-gap) @min-[760px]:grid-cols-[3fr_2fr]">
        <section
          aria-labelledby={`${uid}-week`}
          className="flex min-w-0 flex-col gap-3 rounded-3 border border-hairline bg-card p-(--shell-gap)"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 id={`${uid}-week`} className="text-[13px] font-medium">
              Completed this week
            </h3>
            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
              {week.reduce((s, d) => s + d.done, 0)} jobs
            </span>
          </div>
          <div
            role="img"
            aria-label={`Completed jobs by day: ${week
              .map((d) => `${d.day} ${d.done}`)
              .join(", ")}.`}
            className="flex flex-[1_1_7rem] items-end gap-2"
          >
            {week.map((d, i) => (
              <div
                key={d.day}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {d.done}
                </span>
                <motion.span
                  className={cn(
                    "w-full max-w-7 rounded-t-1",
                    i === week.length - 1
                      ? "bg-cobalt-bright"
                      : "bg-cobalt-wash",
                  )}
                  style={{
                    height: `${Math.round((d.done / top) * 72)}%`,
                    originY: 1,
                  }}
                  initial={motionSafe ? { scaleY: 0 } : false}
                  animate={{ scaleY: 1 }}
                  transition={
                    motionSafe
                      ? { ...springs.glide, delay: 0.08 + i * step }
                      : { duration: 0 }
                  }
                />
                <span className="text-[10px] text-ink-3">{d.day}</span>
              </div>
            ))}
          </div>
        </section>
        <section
          aria-labelledby={`${uid}-activity`}
          className="flex min-w-0 flex-col gap-2 rounded-3 border border-hairline bg-card p-(--shell-gap)"
        >
          <h3 id={`${uid}-activity`} className="text-[13px] font-medium">
            Recent activity
          </h3>
          <ol className="flex flex-col">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex items-baseline gap-3 border-t border-hairline py-1.5 first:border-t-0"
              >
                <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                  {a.at}
                </span>
                <span className="min-w-0 text-[13px] text-ink-2">{a.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

/** Today's jobs: a table where there is room for one, cards where there is not. */
function ShellJobs({ jobs = defaultShellJobs }: { jobs?: ShellJob[] }) {
  return (
    <div className="flex flex-col gap-(--shell-gap)">
      <table className="hidden w-full border-separate border-spacing-0 overflow-clip rounded-3 border border-hairline bg-card text-[13px] @min-[560px]:table">
        <thead>
          <tr className="text-left text-[11px] text-ink-3">
            <th
              scope="col"
              className="h-(--shell-row) border-b border-hairline px-3 font-medium"
            >
              Job
            </th>
            <th
              scope="col"
              className="border-b border-hairline px-3 font-medium"
            >
              Site
            </th>
            <th
              scope="col"
              className="hidden border-b border-hairline px-3 font-medium @min-[720px]:table-cell"
            >
              Crew
            </th>
            <th
              scope="col"
              className="border-b border-hairline px-3 font-medium"
            >
              Window
            </th>
            <th
              scope="col"
              className="border-b border-hairline px-3 font-medium"
            >
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j, i) => (
            <tr key={j.id}>
              <td
                className={cn("px-3 py-2", i > 0 && "border-t border-hairline")}
              >
                <span className="block font-medium text-foreground">
                  {j.title}
                </span>
                <span className="font-mono text-[11px] text-ink-3">{j.id}</span>
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-ink-2",
                  i > 0 && "border-t border-hairline",
                )}
              >
                {j.site}
              </td>
              <td
                className={cn(
                  "hidden px-3 py-2 text-ink-2 @min-[720px]:table-cell",
                  i > 0 && "border-t border-hairline",
                )}
              >
                {j.crew}
              </td>
              <td
                className={cn(
                  "px-3 py-2 font-mono text-[12px] whitespace-nowrap text-ink-2 tabular-nums",
                  i > 0 && "border-t border-hairline",
                )}
              >
                {j.window}
              </td>
              <td
                className={cn("px-3 py-2", i > 0 && "border-t border-hairline")}
              >
                <StatusChip status={j.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul role="list" className="flex flex-col gap-2 @min-[560px]:hidden">
        {jobs.map((j) => (
          <li
            key={j.id}
            className="flex flex-col gap-1.5 rounded-3 border border-hairline bg-card px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[13px] font-medium">{j.title}</span>
              <StatusChip status={j.status} />
            </div>
            <span className="text-xs text-ink-2">
              {j.site} · {j.crew}
            </span>
            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
              {j.id} · {j.window}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Who is out, who is free, and how full each day is. */
function ShellCrew({ crew = defaultShellCrew }: { crew?: ShellCrewMember[] }) {
  const most = Math.max(1, ...crew.map((c) => c.jobs));
  return (
    <ul
      role="list"
      className="grid gap-(--shell-gap) @min-[560px]:grid-cols-2 @min-[880px]:grid-cols-3"
    >
      {crew.map((c) => (
        <li
          key={c.id}
          className="flex min-w-0 items-center gap-3 rounded-3 border border-hairline bg-card p-(--shell-gap)"
        >
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-ink-2"
          >
            {initials(c.name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-medium">{c.name}</span>
            <span className="truncate text-xs text-ink-3">
              {c.role} · {c.team}
            </span>
            <span className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", CREW_TONE[c.status])}
                />
                {SAY[c.status]}
              </span>
              <span
                aria-hidden
                className="h-1 min-w-0 flex-1 overflow-clip rounded-full bg-surface-2"
              >
                <span
                  className="block h-full rounded-full bg-cobalt-bright/70"
                  style={{ width: `${Math.round((c.jobs / most) * 100)}%` }}
                />
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                {c.jobs === 1 ? "1 job" : `${c.jobs} jobs`}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export const defaultShellPages: AppShellPage[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard className="size-4" />,
    section: "Dispatch",
    title: "Overview",
    summary: "Tuesday · seven jobs across three teams",
    keywords: ["dashboard", "today", "week", "activity"],
    content: <ShellOverview />,
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: <Wrench className="size-4" />,
    badge: defaultShellJobs.length,
    badgeLabel: `${defaultShellJobs.length} today`,
    section: "Dispatch",
    title: "Jobs",
    summary: "Booked windows and where each crew has got to",
    keywords: defaultShellJobs.flatMap((j) => [j.id, j.title, j.site]),
    content: <ShellJobs />,
  },
  {
    id: "crew",
    label: "Crew",
    icon: <Users className="size-4" />,
    section: "Dispatch",
    title: "Crew",
    summary: "Six engineers, three teams",
    keywords: defaultShellCrew.flatMap((c) => [c.name, c.team, c.role]),
    content: <ShellCrew />,
  },
];

/* ------------------------------- the shell -------------------------------- */

type Mode = "phone" | "tablet" | "desktop";
type Drawer = "closed" | "open" | "closing";

type Density = {
  row: number;
  bar: number;
  pad: number;
  gap: number;
  title: string;
};

const DENSITY: Record<AppShellDensity, Density> = {
  compact: { row: 28, bar: 44, pad: 12, gap: 8, title: "text-base" },
  cozy: { row: 32, bar: 48, pad: 16, gap: 12, title: "text-lg" },
  roomy: { row: 36, bar: 56, pad: 24, gap: 16, title: "text-xl" },
};

/** The sidebar, open and folded to its rail, px. */
const FULL = 232;
const RAIL = 56;
/** Container widths where the shell changes its arrangement, px. */
const PHONE = 640;
const DESKTOP = 1024;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

type Hit = { page: AppShellPage; score: number; via?: string };

/** Pages whose name, heading, summary or keywords hold the query; names first. */
function searchPages(pages: AppShellPage[], raw: string): Hit[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const hits: Hit[] = [];
  pages.forEach((page, order) => {
    const name = page.label.toLowerCase();
    let score = -1;
    let via: string | undefined;
    if (name.startsWith(q)) score = 100;
    else if (name.includes(q)) score = 80;
    else if ((page.title ?? "").toLowerCase().includes(q)) score = 70;
    else {
      const word = (page.keywords ?? []).find((k) =>
        k.toLowerCase().includes(q),
      );
      if (word) {
        score = word.toLowerCase().startsWith(q) ? 60 : 50;
        via = word;
      } else if ((page.summary ?? "").toLowerCase().includes(q)) {
        score = 40;
      }
    }
    if (score >= 0) hits.push({ page, score: score - order * 0.01, via });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, 6);
}

type RowHandlers = {
  onRegister: (id: string, node: HTMLButtonElement | null) => void;
  onSelect: (id: string) => void;
  onRowKeyDown: (
    id: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => void;
  onTipShow?: (id: string, node: HTMLElement) => void;
  onTipHide?: () => void;
};

/**
 * One destination. Its label, badge and section-mates read their fade from
 * the sidebar's own width, each a little later than the row above, so the
 * labels tuck in from the bottom up as the panel narrows and come back out
 * from the top down; the icon never moves.
 */
function NavRow({
  page,
  index,
  active,
  tabbable,
  progress,
  measured,
  preLabel,
  preDot,
  onRegister,
  onSelect,
  onRowKeyDown,
  onTipShow,
  onTipHide,
}: {
  page: AppShellPage;
  index: number;
  active: boolean;
  tabbable: boolean;
  progress: MotionValue<number>;
  measured: boolean;
  preLabel: string;
  preDot: string;
} & RowHandlers) {
  const start = Math.min(0.5, 0.26 + index * 0.06);
  const fade = useTransform(progress, (p) => r3(clamp01((p - start) / 0.4)));
  const shift = useTransform(fade, (o) => r2((o - 1) * distances.step));
  const dot = useTransform(progress, (p) => r3(clamp01(1 - p / 0.25)));
  const name =
    page.badge !== undefined
      ? `${page.label}, ${page.badgeLabel ?? page.badge}`
      : page.label;
  return (
    <li>
      <button
        ref={(node) => onRegister(page.id, node)}
        type="button"
        tabIndex={tabbable ? 0 : -1}
        aria-current={active ? "page" : undefined}
        aria-label={name}
        data-shell-current={active ? "" : undefined}
        onClick={() => onSelect(page.id)}
        onKeyDown={(event) => onRowKeyDown(page.id, event)}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse")
            onTipShow?.(page.id, event.currentTarget);
        }}
        onPointerLeave={() => onTipHide?.()}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible"))
            onTipShow?.(page.id, event.currentTarget);
        }}
        onBlur={() => onTipHide?.()}
        className={cn(
          "relative z-10 flex h-(--shell-row) w-full items-center gap-3 rounded-2 pr-2 pl-3 text-left text-[13px] transition-colors",
          FOCUS_IN,
          active
            ? "font-medium text-foreground"
            : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
          active && !measured && "bg-cobalt-wash",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative flex size-4 shrink-0 items-center justify-center",
            active && "text-cobalt-bright",
          )}
        >
          {page.icon}
          {page.badge !== undefined ? (
            <motion.span
              className={cn(
                "absolute -top-0.5 -right-1 size-1.5 rounded-full bg-cobalt-bright ring-2 ring-surface-1",
                !measured && preDot,
              )}
              style={measured ? { opacity: dot, scale: dot } : undefined}
            />
          ) : null}
        </span>
        <motion.span
          aria-hidden
          className={cn("min-w-0 flex-1 truncate", !measured && preLabel)}
          style={measured ? { opacity: fade, x: shift } : undefined}
        >
          {page.label}
        </motion.span>
        {page.badge !== undefined ? (
          <motion.span
            aria-hidden
            className={cn(
              "shrink-0 rounded-full bg-surface-2 px-1.5 font-mono text-[10px] leading-4 text-ink-2 tabular-nums",
              !measured && preLabel,
            )}
            style={measured ? { opacity: fade } : undefined}
          >
            {page.badge}
          </motion.span>
        ) : null}
      </button>
    </li>
  );
}

function Faded({
  progress,
  index,
  measured,
  preLabel,
  className,
  children,
}: {
  progress: MotionValue<number>;
  index: number;
  measured: boolean;
  preLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const start = Math.min(0.5, 0.26 + index * 0.06);
  const fade = useTransform(progress, (p) => r3(clamp01((p - start) / 0.4)));
  const shift = useTransform(fade, (o) => r2((o - 1) * distances.step));
  return (
    <motion.span
      className={cn(className, !measured && preLabel)}
      style={measured ? { opacity: fade, x: shift } : undefined}
    >
      {children}
    </motion.span>
  );
}

function SectionMark({
  progress,
  measured,
  preLabel,
  preDot,
  id,
  text,
}: {
  progress: MotionValue<number>;
  measured: boolean;
  preLabel: string;
  preDot: string;
  id: string;
  text: string;
}) {
  const fade = useTransform(progress, (p) => r3(clamp01((p - 0.2) / 0.4)));
  const line = useTransform(fade, (o) => r3(1 - o));
  return (
    <div className="relative flex h-7 items-end px-3 pb-1.5">
      <motion.span
        id={id}
        className={cn(
          "truncate text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-ink-3 uppercase",
          !measured && preLabel,
        )}
        style={measured ? { opacity: fade } : undefined}
      >
        {text}
      </motion.span>
      <motion.span
        aria-hidden
        className={cn(
          "absolute bottom-2.5 left-3 h-px w-4 bg-hairline-strong",
          !measured && preDot,
        )}
        style={measured ? { opacity: line } : undefined}
      />
    </div>
  );
}

type BodyProps = {
  variant: "panel" | "drawer";
  pages: AppShellPage[];
  currentId: string;
  tabbableId: string;
  progress: MotionValue<number>;
  measured: boolean;
  preLabel: string;
  preDot: string;
  density: Density;
  densityKey: AppShellDensity;
  motionSafe: boolean;
  uid: string;
  navLabel: string;
  workspace: AppShellWorkspace;
  user: AppShellUser;
  onClose?: () => void;
} & RowHandlers;

/** The sidebar's furniture, shared by the in-flow panel and the phone drawer. */
function SidebarBody({
  variant,
  pages,
  currentId,
  tabbableId,
  progress,
  measured,
  preLabel,
  preDot,
  density,
  densityKey,
  motionSafe,
  uid,
  navLabel,
  workspace,
  user,
  onRegister,
  onSelect,
  onRowKeyDown,
  onTipShow,
  onTipHide,
  onClose,
}: BodyProps) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const rows = React.useRef(new Map<string, HTMLButtonElement>());
  const pillY = useMotionValue(0);
  const pillOpacity = useMotionValue(0);
  const pillAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const placed = React.useRef(false);

  const register = (id: string, node: HTMLButtonElement | null) => {
    if (node) rows.current.set(id, node);
    else rows.current.delete(id);
    onRegister(id, node);
  };

  // The pill sits under the current row: it travels there on snap, and jumps
  // when the rows themselves change height.
  const pageKey = pages.map((p) => p.id).join(",");
  React.useLayoutEffect(() => {
    const list = listRef.current;
    const row = rows.current.get(currentId);
    if (!list || !row || !measured) return;
    const y = r2(
      row.getBoundingClientRect().top -
        list.getBoundingClientRect().top +
        list.scrollTop,
    );
    pillAnim.current?.stop();
    if (!placed.current || !motionSafe) {
      placed.current = true;
      pillY.jump(y);
    } else if (Math.abs(pillY.get() - y) > 0.5) {
      pillAnim.current = animate(pillY, y, springs.snap);
    }
    pillOpacity.set(1);
  }, [
    currentId,
    densityKey,
    pageKey,
    measured,
    motionSafe,
    pillY,
    pillOpacity,
  ]);

  React.useEffect(() => () => pillAnim.current?.stop(), []);

  // Pages in runs of one section, each run under its heading.
  const runs: {
    section?: string;
    items: { page: AppShellPage; i: number }[];
  }[] = [];
  pages.forEach((page, i) => {
    const last = runs[runs.length - 1];
    if (last && last.section === page.section) last.items.push({ page, i });
    else runs.push({ section: page.section, items: [{ page, i }] });
  });

  const mark = workspace.mark ?? (
    <span className="flex size-7 items-center justify-center rounded-2 bg-cobalt text-[13px] font-semibold text-primary-foreground">
      {workspace.name.charAt(0).toUpperCase()}
    </span>
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        variant === "panel" ? "w-[232px]" : "w-full",
      )}
    >
      <div className="flex h-(--shell-bar) shrink-0 items-center gap-2.5 border-b border-hairline px-2">
        <span
          aria-hidden
          className="ml-1.5 flex size-7 shrink-0 items-center justify-center"
        >
          {mark}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <Faded
            progress={progress}
            index={0}
            measured={measured}
            preLabel={preLabel}
            className="truncate text-[13px] font-semibold"
          >
            {workspace.name}
          </Faded>
          {workspace.detail ? (
            <Faded
              progress={progress}
              index={0}
              measured={measured}
              preLabel={preLabel}
              className="truncate text-[11px] text-ink-3"
            >
              {workspace.detail}
            </Faded>
          ) : null}
        </span>
        {variant === "drawer" && onClose ? (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_IN,
            )}
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>

      <nav
        aria-label={navLabel}
        className="flex-1 overflow-x-clip overflow-y-auto overscroll-contain"
      >
        <div ref={listRef} className="relative px-2 pt-1 pb-3">
          {measured ? (
            <motion.span
              aria-hidden
              className="absolute inset-x-2 top-0 rounded-2 bg-cobalt-wash"
              style={{ y: pillY, height: density.row, opacity: pillOpacity }}
            />
          ) : null}
          {runs.map((run, r) => {
            const headingId = `${uid}-${variant}-section-${r}`;
            return (
              <div
                key={`${run.section ?? "none"}-${r}`}
                role={run.section ? "group" : undefined}
                aria-labelledby={run.section ? headingId : undefined}
              >
                {run.section ? (
                  <SectionMark
                    progress={progress}
                    measured={measured}
                    preLabel={preLabel}
                    preDot={preDot}
                    id={headingId}
                    text={run.section}
                  />
                ) : null}
                <ul role="list" className="flex flex-col gap-0.5">
                  {run.items.map(({ page, i }) => (
                    <NavRow
                      key={page.id}
                      page={page}
                      index={i + 1}
                      active={page.id === currentId}
                      tabbable={page.id === tabbableId}
                      progress={progress}
                      measured={measured}
                      preLabel={preLabel}
                      preDot={preDot}
                      onRegister={register}
                      onSelect={onSelect}
                      onRowKeyDown={onRowKeyDown}
                      onTipShow={onTipShow}
                      onTipHide={onTipHide}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="flex h-14 shrink-0 items-center gap-2.5 border-t border-hairline px-2">
        <span
          aria-hidden
          className="ml-1.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-medium text-ink-2"
        >
          {initials(user.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <Faded
            progress={progress}
            index={pages.length + 1}
            measured={measured}
            preLabel={preLabel}
            className="truncate text-[13px]"
          >
            {user.name}
          </Faded>
          {user.role ? (
            <Faded
              progress={progress}
              index={pages.length + 1}
              measured={measured}
              preLabel={preLabel}
              className="truncate text-[11px] text-ink-3"
            >
              {user.role}
            </Faded>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function Skeleton({ motionSafe }: { motionSafe: boolean }) {
  const bar = cn("rounded-2 bg-surface-2", motionSafe && "animate-pulse");
  return (
    <div aria-hidden className="flex flex-col gap-(--shell-gap)">
      <div className="grid grid-cols-2 gap-(--shell-gap) @min-[720px]:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn(bar, "h-20")} />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={cn(bar, "h-(--shell-row)")} />
      ))}
    </div>
  );
}

/**
 * The frame a product's screens live in: a sidebar of destinations, a top bar
 * with breadcrumbs and search, and a content area that changes page.
 *
 * The sidebar is a physical panel. Its width is one motion value on the glide
 * spring, and everything in it reads that width: the labels, the section
 * headings, the workspace and the user fade and slide 8px as it narrows, each
 * row a beat after the one above, so the labels tuck away and leave the icons
 * standing as a 56px rail (their names move into tooltips), and the badges
 * fold into dots on their icons. The edge can be dragged 1:1 between the two,
 * rubber-banding past either end and committing to the side the throw was
 * heading for with its velocity. Below 640px the sidebar is a drawer that
 * slides over a scrim, traps focus, closes on Escape and can be pushed back
 * out. A pill under the current row travels on snap; pages change by
 * `transition` — rising in the direction of travel through the nav, a
 * cross-fade, or settling from depth — and the last crumb cross-fades with
 * them.
 *
 * The sidebar is a navigation landmark on a roving tabindex (arrows, Home,
 * End); search is a combobox over the pages; `[` or Cmd/Ctrl+B folds the
 * sidebar, 1–9 go to a page and / goes to search. Under reduced motion widths
 * and pages swap at once with opacity carrying the change, and every change
 * is still announced.
 */
export function AppShell({
  pages = defaultShellPages,
  page,
  defaultPage,
  onPageChange,
  collapsed,
  defaultCollapsed,
  onCollapsedChange,
  rail = true,
  transition = "slide",
  density = "cozy",
  workspace = defaultShellWorkspace,
  user = defaultShellUser,
  navLabel = "Main",
  searchPlaceholder,
  onSearch,
  shortcuts = true,
  status = "ready",
  onRetry,
  label,
  sound = false,
  className,
}: AppShellProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const sideId = `${uid}-side`;
  const drawerId = `${uid}-drawer`;
  const resultsId = `${uid}-results`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  /* ------------------------------ measuring ------------------------------ */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRootNode(node);
  }, []);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.round(w));
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);
  const mode: Mode | null =
    width === null
      ? null
      : width < PHONE
        ? "phone"
        : width < DESKTOP
          ? "tablet"
          : "desktop";
  const measured = mode !== null;

  /* -------------------------------- pages -------------------------------- */

  const [ownPage, setOwnPage] = React.useState(
    () => defaultPage ?? pages[0]?.id ?? "",
  );
  const current =
    pages.find((p) => p.id === (page ?? ownPage)) ?? pages[0] ?? null;
  const currentId = current?.id ?? "";
  const indexOf = (id: string) => pages.findIndex((p) => p.id === id);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  // The page on screen, and which way the last change travelled through the
  // nav. Derived here, in the render that changes it, so the announcement is
  // the page the host actually shows.
  const [view, setView] = React.useState({ id: currentId, dir: 1 });
  if (view.id !== currentId) {
    const from = pages.findIndex((p) => p.id === view.id);
    const to = pages.findIndex((p) => p.id === currentId);
    setView({ id: currentId, dir: to >= from ? 1 : -1 });
    if (current)
      setSaid((s) => ({ n: s.n + 1, text: `${current.label} page.` }));
  }

  /* ------------------------------- sidebar ------------------------------- */

  const [ownCollapsed, setOwnCollapsed] = React.useState<boolean | null>(
    defaultCollapsed ?? null,
  );
  const chosen = collapsed ?? ownCollapsed;
  const isCollapsed = chosen ?? mode === "tablet";
  const folded = rail ? RAIL : 0;
  const target = isCollapsed ? folded : FULL;

  const [seenChosen, setSeenChosen] = React.useState(chosen);
  if (seenChosen !== chosen) {
    setSeenChosen(chosen);
    if (chosen !== null) {
      setSaid((s) => ({
        n: s.n + 1,
        text: chosen
          ? rail
            ? "Sidebar folded to icons."
            : "Sidebar hidden."
          : "Sidebar open.",
      }));
    }
  }

  const sideW = useMotionValue<number>(target);
  const sideAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const releaseV = React.useRef(0);
  const dragging = React.useRef(false);
  const dragFrom = React.useRef(0);
  const [pressing, setPressing] = React.useState(false);
  const placedMode = React.useRef<Mode | null>(null);

  const settleSide = React.useCallback(
    (to: number, velocity = 0) => {
      sideAnim.current?.stop();
      if (!motionSafe) {
        sideW.jump(to);
        return;
      }
      sideAnim.current = animate(sideW, to, { ...springs.glide, velocity });
    },
    [motionSafe, sideW],
  );

  // The panel goes wherever the fold says: placed on the first measurement
  // (and when it returns from a phone), carried there on glide afterwards.
  // Idempotent: a second run finds it already there.
  React.useEffect(() => {
    if (mode === null || mode === "phone") {
      placedMode.current = mode;
      return;
    }
    if (dragging.current) return;
    const fresh = placedMode.current === null || placedMode.current === "phone";
    placedMode.current = mode;
    if (fresh) {
      sideAnim.current?.stop();
      sideW.jump(target);
      return;
    }
    if (Math.abs(sideW.get() - target) < 0.5) return;
    const v = releaseV.current;
    releaseV.current = 0;
    settleSide(target, v);
  }, [mode, target, settleSide, sideW]);

  React.useEffect(() => () => sideAnim.current?.stop(), []);

  const progress = useTransform(sideW, (w) =>
    rail ? r3(clamp01((w - RAIL) / (FULL - RAIL))) : 1,
  );
  // Without a rail the panel slides out whole instead of losing its labels.
  const panelX = useTransform(sideW, (w) =>
    rail ? 0 : r2(Math.min(0, w - FULL)),
  );
  const edgeX = useTransform(sideW, (w) => r2(w));

  /* -------------------------------- drawer ------------------------------- */

  const [drawer, setDrawer] = React.useState<Drawer>("closed");
  if (mode !== null && mode !== "phone" && drawer !== "closed") {
    setDrawer("closed");
  }
  const drawerW =
    width === null ? 280 : Math.min(288, Math.round(width * 0.86));
  const drawerX = useMotionValue(-drawerW);
  const drawerFade = useMotionValue(0);
  const drawerAnim = React.useRef<AnimationPlaybackControls[]>([]);
  const menuRef = React.useRef<HTMLButtonElement | null>(null);
  const [drawerNode, setDrawerNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const drawerOpen = drawer === "open";

  const stopDrawer = () => {
    for (const c of drawerAnim.current) c.stop();
    drawerAnim.current = [];
  };

  // Arrives on glide once opened; a re-run carries it on rather than leaving
  // it part-way.
  React.useEffect(() => {
    if (drawer !== "open") return;
    for (const c of drawerAnim.current) c.stop();
    let mine: AnimationPlaybackControls;
    if (!motionSafe) {
      drawerX.jump(0);
      mine = animate(drawerFade, 1, {
        duration: durations.fast,
        ease: easings.enter,
      });
    } else {
      // From wherever it is: off-canvas when it was closed, part-way when it
      // was still leaving or a re-run interrupted it.
      drawerFade.jump(1);
      mine = animate(drawerX, 0, springs.glide);
    }
    drawerAnim.current = [mine];
    // Only its own arrival: the closing that replaces it must run on.
    return () => mine.stop();
    // Only an opening starts this; its width is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer]);

  // Focus goes to the current page's row once the panel has arrived.
  React.useEffect(() => {
    if (!drawerNode) return;
    const row = drawerNode.querySelector<HTMLElement>("[data-shell-current]");
    (row ?? drawerNode).focus({ preventScroll: true });
  }, [drawerNode]);

  /* ------------------------------- search -------------------------------- */

  const [query, setQuery] = React.useState("");
  const [listOpen, setListOpen] = React.useState(false);
  const [hit, setHit] = React.useState(0);
  const [phoneSearch, setPhoneSearch] = React.useState(false);
  if (mode !== null && mode !== "phone" && phoneSearch) setPhoneSearch(false);
  const fieldRef = React.useRef<HTMLInputElement | null>(null);
  // The phone's field arrives on a press: it takes focus as it lands, once.
  const focusOnArrival = React.useCallback((node: HTMLInputElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);
  const results = React.useMemo(
    () => searchPages(pages, query),
    [pages, query],
  );
  const showResults = listOpen && query.trim().length > 0;
  const activeHit = Math.min(hit, Math.max(0, results.length - 1));
  const placeholder = searchPlaceholder ?? `Search ${workspace.name}`;

  /* --------------------------- focus and pointer -------------------------- */

  const rowNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const tabbableId =
    focusId && pages.some((p) => p.id === focusId) ? focusId : currentId;
  const hovered = React.useRef(false);
  const pendingHeading = React.useRef<string | null>(null);
  const [heading, setHeading] = React.useState<HTMLElement | null>(null);
  const [tip, setTip] = React.useState<{ id: string; top: number } | null>(
    null,
  );

  React.useEffect(() => {
    if (!heading) return;
    heading.focus({ preventScroll: true });
    pendingHeading.current = null;
  }, [heading]);

  /* ------------------------------- actions ------------------------------- */

  const go = (id: string, via: "nav" | "key" | "search" | "crumb") => {
    const i = indexOf(id);
    if (!pages[i]) return;
    if (drawer === "open") closeDrawer(false);
    if (via === "search" || (via === "nav" && mode === "phone")) {
      pendingHeading.current = id;
    }
    if (id === currentId) {
      if (pendingHeading.current === id) {
        const node = rootRef.current?.querySelector<HTMLElement>(
          `[data-shell-heading="${id}"]`,
        );
        node?.focus({ preventScroll: true });
        pendingHeading.current = null;
      }
      return;
    }
    audio.play("click", { pitch: r2(1.2 - i * 0.07), gain: 0.5 });
    if (page === undefined) setOwnPage(id);
    onPageChange?.(id);
  };

  const commitCollapsed = (next: boolean, velocity = 0) => {
    const to = next ? folded : FULL;
    if (next === isCollapsed) {
      settleSide(to, velocity);
      return;
    }
    audio.play("swish", { pitch: next ? 0.82 : 1.12, gain: 0.45 });
    setTip(null);
    if (collapsed === undefined) {
      releaseV.current = velocity;
      setOwnCollapsed(next);
    } else {
      // Controlled: back to where the host says it is. If the host takes
      // the change, the effect above carries the panel across.
      settleSide(target, velocity);
    }
    onCollapsedChange?.(next);
  };

  const openDrawer = () => {
    if (drawer === "open") return;
    stopDrawer();
    audio.play("swish", { pitch: 1.12, gain: 0.45 });
    setDrawer("open");
  };

  const closeDrawer = (returnFocus: boolean, velocity = 0) => {
    if (drawer !== "open") return;
    stopDrawer();
    audio.play("swish", { pitch: 0.82, gain: 0.4 });
    setDrawer("closing");
    setDrawerNode(null);
    const done = () => {
      drawerX.jump(-drawerW);
      setDrawer((s) => (s === "closing" ? "closed" : s));
    };
    if (!motionSafe) {
      drawerAnim.current = [
        animate(drawerFade, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: done,
        }),
      ];
    } else if (velocity < 0) {
      drawerAnim.current = [
        animate(drawerX, -drawerW, {
          ...springs.glide,
          velocity,
          restDelta: 1,
          onComplete: done,
        }),
      ];
    } else {
      drawerAnim.current = [
        animate(drawerX, -drawerW, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: done,
        }),
      ];
    }
    if (returnFocus) menuRef.current?.focus({ preventScroll: true });
  };

  const toggle = () => {
    if (mode === "phone") {
      if (drawer === "open") closeDrawer(true);
      else openDrawer();
      return;
    }
    if (mode === null) return;
    commitCollapsed(!isCollapsed);
  };

  const focusSearch = () => {
    if (mode === "phone") {
      setPhoneSearch(true);
      return;
    }
    fieldRef.current?.focus();
  };

  const closeSearch = () => {
    setQuery("");
    setListOpen(false);
    setHit(0);
    if (phoneSearch) {
      setPhoneSearch(false);
      rootRef.current
        ?.querySelector<HTMLElement>("[data-shell-search-open]")
        ?.focus({ preventScroll: true });
    }
  };

  const showTip = (id: string, node: HTMLElement) => {
    if (mode === null || mode === "phone" || !isCollapsed || !rail) return;
    if (dragging.current || progress.get() > 0.05) return;
    const root = rootRef.current;
    if (!root) return;
    const a = root.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    setTip({ id, top: r2(b.top - a.top + b.height / 2) });
  };

  const rowKeyDown = (
    id: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
    scope: "panel" | "drawer",
  ) => {
    const i = indexOf(id);
    const n = pages.length;
    let next = -1;
    if (event.key === "ArrowDown") next = (i + 1) % n;
    else if (event.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    else if (event.key === "Escape" && tip) {
      event.preventDefault();
      setTip(null);
      return;
    }
    if (next === -1) return;
    event.preventDefault();
    const to = pages[next];
    if (!to) return;
    setFocusId(to.id);
    rowNodes.current.get(`${scope}:${to.id}`)?.focus();
  };

  const registerRow = (
    scope: "panel" | "drawer",
    id: string,
    node: HTMLButtonElement | null,
  ) => {
    if (node) rowNodes.current.set(`${scope}:${id}`, node);
    else rowNodes.current.delete(`${scope}:${id}`);
  };

  const selectRow = (id: string) => {
    setFocusId(id);
    go(id, "nav");
  };

  /* ------------------------------- gestures ------------------------------ */

  const edge = useDrag({
    axis: "x",
    threshold: 3,
    disabled: mode === null || mode === "phone",
    onStart: () => {
      dragging.current = true;
      sideAnim.current?.stop();
      dragFrom.current = sideW.get();
      setTip(null);
    },
    onMove: ({ offset }) => {
      sideW.set(r2(rubberClamp(dragFrom.current + offset.x, folded, FULL, 80)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      setPressing(false);
      const landing = project(sideW.get(), velocity.x, 0.99);
      commitCollapsed(landing < (folded + FULL) / 2, velocity.x);
    },
    onCancel: () => {
      dragging.current = false;
      setPressing(false);
      settleSide(target);
    },
    onTap: () => {
      setPressing(false);
      commitCollapsed(!isCollapsed);
    },
  });

  const drawerDrag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: drawer !== "open",
    onStart: () => stopDrawer(),
    onMove: ({ offset }) => {
      drawerX.set(r2(offset.x < 0 ? offset.x : rubberband(offset.x, drawerW)));
    },
    onEnd: ({ velocity }) => {
      const landing = project(drawerX.get(), velocity.x, 0.99);
      if (landing < -drawerW / 2) {
        closeDrawer(true, Math.min(-1, velocity.x));
      } else {
        drawerAnim.current = [
          animate(drawerX, 0, { ...springs.glide, velocity: velocity.x }),
        ];
      }
    },
    onCancel: () => {
      drawerAnim.current = [animate(drawerX, 0, springs.glide)];
    },
  });

  const scrimFollow = useTransform(drawerX, (x) =>
    r3(clamp01(1 + x / Math.max(1, drawerW))),
  );

  /* ------------------------------ shortcuts ------------------------------ */

  const latest = React.useRef<{ onKey: (event: KeyboardEvent) => void } | null>(
    null,
  );
  React.useEffect(() => {
    latest.current = {
      onKey: (event) => {
        if (event.defaultPrevented || event.altKey) return;
        const root = rootRef.current;
        if (!root) return;
        const active = document.activeElement;
        const inside = !!active && root.contains(active);
        const idle = !active || active === document.body;
        if (!inside && !(idle && hovered.current)) return;
        if (isEditable(event.target)) return;
        const mod = event.metaKey || event.ctrlKey;
        if (mod && !event.shiftKey && event.key.toLowerCase() === "b") {
          event.preventDefault();
          toggle();
          return;
        }
        if (mod) return;
        if (event.key === "[") {
          event.preventDefault();
          toggle();
        } else if (event.key === "/") {
          event.preventDefault();
          focusSearch();
        } else if (/^[1-9]$/.test(event.key)) {
          const to = pages[Number(event.key) - 1];
          if (!to) return;
          event.preventDefault();
          go(to.id, "key");
        }
      },
    };
  });

  React.useEffect(() => {
    if (!shortcuts) return;
    const onKey = (event: KeyboardEvent) => latest.current?.onKey(event);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcuts]);

  /* ------------------------------- derived ------------------------------- */

  const auto = chosen === null;
  // Until the first measurement the arrangement comes from container
  // queries, so the server's markup already matches the width it lands in.
  const preWidth = auto
    ? rail
      ? "@min-[640px]:w-14 @min-[1024px]:w-58"
      : "@min-[640px]:w-0 @min-[1024px]:w-58"
    : isCollapsed
      ? rail
        ? "w-14"
        : "w-0"
      : "w-58";
  const preLabel = !rail
    ? ""
    : auto
      ? "@max-[1023px]:opacity-0"
      : isCollapsed
        ? "opacity-0"
        : "";
  const preDot = !rail
    ? "opacity-0"
    : auto
      ? "opacity-0 @max-[1023px]:opacity-100"
      : isCollapsed
        ? ""
        : "opacity-0";

  const trail = current
    ? (current.crumbs ??
      [workspace.name, current.section, current.label].filter(
        (c): c is string => !!c,
      ))
    : [];
  const tipPage = tip ? pages.find((p) => p.id === tip.id) : undefined;
  const tipIndex = tip ? indexOf(tip.id) : -1;

  const pageVariants = {
    enter: (dir: number) =>
      !motionSafe || transition === "fade"
        ? { opacity: 0 }
        : transition === "zoom"
          ? { opacity: 0, scale: 0.98 }
          : { opacity: 0, y: distances.shift * dir },
    center: { opacity: 1, y: 0, scale: 1 },
    exit: (dir: number) =>
      !motionSafe || transition === "fade"
        ? { opacity: 0, transition: exitFor(durations.base) }
        : transition === "zoom"
          ? { opacity: 0, scale: 1.01, transition: exitFor(durations.base) }
          : {
              opacity: 0,
              y: -distances.step * dir,
              transition: exitFor(durations.base),
            },
  };

  const toggleLabel =
    mode === "phone"
      ? drawerOpen
        ? "Close menu"
        : "Open menu"
      : isCollapsed
        ? rail
          ? "Expand sidebar"
          : "Show sidebar"
        : rail
          ? "Collapse sidebar"
          : "Hide sidebar";

  const iconButton = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS,
  );

  const one = useMotionValue(1);

  const searchField = (phone: boolean) => (
    <div
      className={cn(
        "relative flex h-8 items-center",
        phone ? "min-w-0 flex-1" : "w-40 @min-[1024px]:w-56",
      )}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3"
      />
      <input
        ref={phone ? focusOnArrival : fieldRef}
        type="search"
        role="combobox"
        aria-label={placeholder}
        aria-expanded={showResults}
        aria-controls={resultsId}
        aria-autocomplete="list"
        aria-keyshortcuts="/"
        aria-activedescendant={
          showResults && results[activeHit]
            ? `${uid}-hit-${results[activeHit].page.id}`
            : undefined
        }
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setHit(0);
          setListOpen(true);
        }}
        onFocus={() => setListOpen(true)}
        onBlur={() => setListOpen(false)}
        onKeyDown={(event) => {
          const n = results.length;
          if (event.key === "ArrowDown" && n) {
            event.preventDefault();
            setListOpen(true);
            setHit((activeHit + 1) % n);
          } else if (event.key === "ArrowUp" && n) {
            event.preventDefault();
            setHit((activeHit - 1 + n) % n);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const chosenHit = showResults ? results[activeHit] : undefined;
            if (chosenHit) {
              closeSearch();
              go(chosenHit.page.id, "search");
            } else if (query.trim()) {
              onSearch?.(query.trim());
            }
          } else if (event.key === "Escape") {
            if (query || phone) {
              event.preventDefault();
              closeSearch();
            }
          }
        }}
        className={cn(
          "h-8 w-full min-w-0 rounded-2 border border-hairline bg-surface-1 pr-8 pl-8 text-[13px] text-foreground transition-colors placeholder:text-ink-3 hover:border-hairline-strong [&::-webkit-search-cancel-button]:hidden",
          FOCUS_IN,
        )}
      />
      {phone ? null : (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2 inline-flex h-5 items-center rounded-1 border border-hairline px-1.5 font-mono text-[10px] text-ink-3"
        >
          /
        </kbd>
      )}
    </div>
  );

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label ?? workspace.name}
      onPointerEnter={() => {
        hovered.current = true;
      }}
      onPointerLeave={() => {
        hovered.current = false;
      }}
      className={cn(
        "@container relative isolate flex h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={
        {
          "--shell-row": `${d.row}px`,
          "--shell-bar": `${d.bar}px`,
          "--shell-pad": `${d.pad}px`,
          "--shell-gap": `${d.gap}px`,
        } as React.CSSProperties
      }
    >
      {/* The in-flow sidebar: tablet and desktop. */}
      <motion.aside
        id={sideId}
        aria-label="Sidebar"
        className={cn(
          "relative h-full shrink-0 overflow-clip border-hairline bg-surface-1",
          measured
            ? mode === "phone"
              ? "hidden"
              : "flex"
            : cn("hidden @min-[640px]:flex", preWidth),
          "border-r",
        )}
        style={measured ? { width: sideW } : undefined}
        inert={
          measured && mode !== "phone" && !rail && isCollapsed
            ? true
            : undefined
        }
      >
        <motion.div
          className="h-full"
          style={measured && !rail ? { x: panelX } : undefined}
        >
          <SidebarBody
            variant="panel"
            pages={pages}
            currentId={currentId}
            tabbableId={tabbableId}
            progress={progress}
            measured={measured}
            preLabel={preLabel}
            preDot={preDot}
            density={d}
            densityKey={density}
            motionSafe={motionSafe}
            uid={uid}
            navLabel={navLabel}
            workspace={workspace}
            user={user}
            onRegister={(id, node) => registerRow("panel", id, node)}
            onSelect={selectRow}
            onRowKeyDown={(id, event) => rowKeyDown(id, event, "panel")}
            onTipShow={showTip}
            onTipHide={() => setTip(null)}
          />
        </motion.div>
      </motion.aside>

      {/* The edge: drag it, or focus it and use the arrows. */}
      {measured && mode !== "phone" ? (
        <motion.div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-controls={sideId}
          aria-label="Sidebar width"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isCollapsed ? 0 : 100}
          aria-valuetext={
            isCollapsed ? (rail ? "Folded to icons" : "Hidden") : "Open"
          }
          {...edge}
          onPointerDown={(event) => {
            edge.onPointerDown(event);
            if (event.pointerType !== "mouse" || event.button === 0) {
              setPressing(true);
            }
          }}
          onPointerUp={(event) => {
            setPressing(false);
            edge.onPointerUp(event);
          }}
          onPointerCancel={(event) => {
            setPressing(false);
            edge.onPointerCancel(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "Home") {
              event.preventDefault();
              if (!isCollapsed) commitCollapsed(true);
            } else if (event.key === "ArrowRight" || event.key === "End") {
              event.preventDefault();
              if (isCollapsed) commitCollapsed(false);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              commitCollapsed(!isCollapsed);
            }
          }}
          className={cn(
            "group/app-shell-edge absolute inset-y-0 left-0 -ml-1.5 w-3 cursor-col-resize touch-pan-y",
            pressing ? "z-30" : "z-20",
            FOCUS_IN,
          )}
          style={{ x: edgeX }}
        >
          {pressing ? (
            // A pressed edge catches the pointer across the whole shell, so
            // a quick first move that leaves the 12px handle still starts
            // the drag (capture waits for the threshold).
            <span
              aria-hidden
              className="absolute inset-y-0 -left-[1600px] w-[3200px] cursor-col-resize"
            />
          ) : null}
          <span
            aria-hidden
            className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-cobalt-bright opacity-0 transition-opacity group-hover/app-shell-edge:opacity-60 group-focus-visible/app-shell-edge:opacity-100"
          />
        </motion.div>
      ) : null}

      {/* The main column: top bar and content. */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="relative z-20 flex h-(--shell-bar) shrink-0 items-center gap-2 border-b border-hairline bg-background px-2.5 @min-[640px]:px-3">
          <button
            ref={menuRef}
            type="button"
            aria-label={toggleLabel}
            aria-expanded={mode === "phone" ? drawerOpen : !isCollapsed}
            aria-controls={mode === "phone" ? drawerId : sideId}
            aria-keyshortcuts="["
            onClick={toggle}
            className={iconButton}
          >
            {mode === null ? (
              <>
                <Menu aria-hidden className="size-4 @min-[640px]:hidden" />
                <PanelLeftClose
                  aria-hidden
                  className="hidden size-4 @min-[640px]:block"
                />
              </>
            ) : mode === "phone" ? (
              <Menu aria-hidden className="size-4" />
            ) : isCollapsed ? (
              <PanelLeftOpen aria-hidden className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden className="size-4" />
            )}
          </button>
          <span
            aria-hidden
            className="hidden h-4 w-px shrink-0 bg-hairline @min-[640px]:block"
          />

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1 text-[13px]">
              {trail.slice(0, -1).map((crumb, i) => {
                const first = pages[0];
                return (
                  <li
                    key={`${crumb}-${i}`}
                    className="hidden min-w-0 shrink items-center gap-1 @min-[640px]:flex"
                  >
                    {i === 0 && first && first.id !== currentId ? (
                      <button
                        type="button"
                        onClick={() => go(first.id, "crumb")}
                        className={cn(
                          "truncate rounded-1 text-ink-3 transition-colors hover:text-foreground",
                          FOCUS,
                        )}
                      >
                        {crumb}
                      </button>
                    ) : (
                      <span className="truncate text-ink-3">{crumb}</span>
                    )}
                    <ChevronRight
                      aria-hidden
                      className="size-3.5 shrink-0 text-ink-3"
                    />
                  </li>
                );
              })}
              <li className="grid min-w-0 flex-1">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={currentId}
                    aria-current="page"
                    className="truncate font-medium text-foreground [grid-area:1/1]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    {trail[trail.length - 1] ?? ""}
                  </motion.span>
                </AnimatePresence>
              </li>
            </ol>
          </nav>

          <div className="hidden @min-[640px]:block">{searchField(false)}</div>
          <button
            type="button"
            data-shell-search-open=""
            aria-label={placeholder}
            aria-keyshortcuts="/"
            onClick={() => setPhoneSearch(true)}
            className={cn(iconButton, "@min-[640px]:hidden")}
          >
            <Search aria-hidden className="size-4" />
          </button>

          <AnimatePresence>
            {phoneSearch ? (
              <motion.div
                key="phone-search"
                className="absolute inset-0 flex items-center gap-2 bg-background px-2.5"
                initial={
                  motionSafe
                    ? { opacity: 0, x: distances.shift }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  x: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.fast, ease: easings.enter },
                }}
              >
                {searchField(true)}
                <button
                  type="button"
                  onClick={closeSearch}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-2 px-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  Cancel
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {showResults ? (
              <motion.div
                key="results"
                className="absolute top-full right-2.5 z-30 mt-1.5 w-[min(320px,calc(100%-20px))] overflow-clip rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_8px_24px_color-mix(in_oklab,black_16%,transparent)]"
                initial={
                  motionSafe
                    ? { opacity: 0, y: -distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  y: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast, ease: easings.enter },
                }}
              >
                <ul id={resultsId} role="listbox" aria-label="Pages">
                  {results.length === 0 ? (
                    <li
                      role="presentation"
                      className="px-2.5 py-2 text-[13px] text-ink-3"
                    >
                      No pages match “{query.trim()}”
                    </li>
                  ) : (
                    results.map((r, i) => (
                      <li
                        key={r.page.id}
                        id={`${uid}-hit-${r.page.id}`}
                        role="option"
                        aria-selected={i === activeHit}
                        onPointerDown={(event) => event.preventDefault()}
                        onPointerMove={() => setHit(i)}
                        onClick={() => {
                          closeSearch();
                          go(r.page.id, "search");
                        }}
                        className={cn(
                          "flex h-10 cursor-pointer items-center gap-2.5 rounded-2 px-2.5",
                          i === activeHit
                            ? "bg-cobalt-wash text-foreground"
                            : "text-ink-2",
                        )}
                      >
                        <span
                          aria-hidden
                          className="flex size-4 shrink-0 items-center justify-center text-ink-3"
                        >
                          {r.page.icon}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[13px]">
                            {r.page.label}
                          </span>
                          <span className="truncate text-[11px] text-ink-3">
                            {r.via
                              ? `Matches ${r.via}`
                              : (r.page.summary ?? "")}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-ink-3">
                          {indexOf(r.page.id) < 9
                            ? `${indexOf(r.page.id) + 1}`
                            : ""}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </header>

        <div
          role="region"
          aria-labelledby={current ? `${uid}-heading-${currentId}` : undefined}
          className="relative grid flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-clip"
        >
          <AnimatePresence initial={false} custom={view.dir}>
            {current ? (
              <motion.div
                key={currentId}
                custom={view.dir}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  y: motionSafe ? springs.glide : { duration: 0 },
                  scale: motionSafe ? springs.glide : { duration: 0 },
                  opacity: {
                    duration: motionSafe ? durations.base : durations.fast,
                    ease: easings.enter,
                  },
                }}
                className="@container min-w-0 overflow-y-auto overscroll-contain [grid-area:1/1]"
              >
                <div className="flex flex-col gap-(--shell-pad) p-(--shell-pad)">
                  <div className="flex flex-col gap-0.5">
                    <h2
                      id={`${uid}-heading-${currentId}`}
                      data-shell-heading={currentId}
                      tabIndex={-1}
                      ref={(node) => {
                        if (node && pendingHeading.current === currentId) {
                          setHeading(node);
                        }
                      }}
                      className={cn(
                        "font-semibold tracking-tight outline-none",
                        d.title,
                      )}
                    >
                      {current.title ?? current.label}
                    </h2>
                    {current.summary ? (
                      <p className="text-[13px] text-ink-3">
                        {current.summary}
                      </p>
                    ) : null}
                  </div>
                  {status === "loading" ? (
                    <Skeleton motionSafe={motionSafe} />
                  ) : status === "error" ? (
                    <div className="flex flex-col items-start gap-3 rounded-3 border border-hairline bg-card p-(--shell-pad)">
                      <div className="flex flex-col gap-1">
                        <p className="text-[13px] font-medium">
                          This page did not load
                        </p>
                        <p className="text-xs text-ink-3">
                          The connection dropped before {current.label} came
                          back. Nothing was lost.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRetry?.()}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                          FOCUS,
                        )}
                      >
                        <RotateCcw aria-hidden className="size-3.5" />
                        Retry
                      </button>
                    </div>
                  ) : (
                    current.content
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Rail tooltips: the labels the rail tucked away. */}
      <AnimatePresence>
        {tip && tipPage ? (
          <motion.div
            key={tip.id}
            aria-hidden
            className="pointer-events-none absolute z-30 flex h-7 -translate-y-1/2 items-center gap-2 rounded-2 border border-hairline-strong bg-popover px-2 text-xs whitespace-nowrap text-foreground shadow-[0_4px_12px_color-mix(in_oklab,black_14%,transparent)]"
            style={{ left: RAIL + 6, top: tip.top }}
            initial={
              motionSafe ? { opacity: 0, x: -distances.nudge } : { opacity: 0 }
            }
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              x: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast, ease: easings.enter },
            }}
          >
            {tipPage.label}
            {tipPage.badge !== undefined ? (
              <span className="rounded-full bg-surface-2 px-1.5 font-mono text-[10px] text-ink-2 tabular-nums">
                {tipPage.badge}
              </span>
            ) : null}
            {tipIndex >= 0 && tipIndex < 9 ? (
              <kbd className="inline-flex h-4 items-center rounded-1 border border-hairline px-1 font-mono text-[10px] text-ink-3">
                {tipIndex + 1}
              </kbd>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* The phone drawer. */}
      {drawer !== "closed" ? (
        <>
          <motion.div
            aria-hidden
            onClick={() => closeDrawer(true)}
            className="absolute inset-0 z-40 bg-[color-mix(in_oklab,var(--background)_40%,transparent)] backdrop-blur-[2px]"
            style={{ opacity: motionSafe ? scrimFollow : drawerFade }}
          />
          <motion.div
            ref={(node) => {
              if (node && drawer === "open" && node !== drawerNode) {
                setDrawerNode(node);
              }
            }}
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            {...drawerDrag}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeDrawer(true);
                return;
              }
              if (event.key !== "Tab") return;
              const nodes = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "button, [tabindex]",
                ),
              ).filter((n) => n.tabIndex >= 0 && !n.hasAttribute("disabled"));
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
            }}
            className="absolute inset-y-0 left-0 z-50 touch-pan-y overflow-clip border-r border-hairline-strong bg-surface-1 shadow-[8px_0_24px_color-mix(in_oklab,black_18%,transparent)] outline-none"
            style={{
              width: drawerW,
              x: drawerX,
              opacity: motionSafe ? 1 : drawerFade,
            }}
          >
            <SidebarBody
              variant="drawer"
              pages={pages}
              currentId={currentId}
              tabbableId={tabbableId}
              progress={one}
              measured
              preLabel=""
              preDot=""
              density={d}
              densityKey={density}
              motionSafe={motionSafe}
              uid={uid}
              navLabel={navLabel}
              workspace={workspace}
              user={user}
              onRegister={(id, node) => registerRow("drawer", id, node)}
              onSelect={selectRow}
              onRowKeyDown={(id, event) => rowKeyDown(id, event, "drawer")}
              onClose={() => closeDrawer(true)}
            />
          </motion.div>
        </>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
