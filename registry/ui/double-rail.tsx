"use client";

import * as React from "react";

import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  RotateCcw,
  Settings,
  Truck,
  Users,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type RailTone = "ok" | "warn" | "danger" | "neutral";

export type RailItem = {
  /** Unique across every section: it is the page id. */
  id: string;
  label: string;
  /** Shown at the row's end. */
  count?: number;
  /** A short flag under the label: "4 due". */
  meta?: string;
  metaTone?: RailTone;
  /** One line under the page's title. */
  description?: string;
  /** Up to three figures across the top of the page. */
  stats?: { label: string; value: string; tone?: RailTone }[];
};

export type RailGroup = { label: string; items: RailItem[] };

export type RailSection = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** The number beside the panel's title. */
  count?: number;
  /** What the count counts, for its accessible name: "vehicles". */
  countLabel?: string;
  /** A dot on the rail: something in here wants attention. */
  alert?: boolean;
  /** The secondary list. Empty (or no groups) shows the empty state. */
  groups?: RailGroup[];
  /** The list is still arriving: skeleton rows. */
  loading?: boolean;
  /** What the empty state says. */
  emptyText?: string;
  /** The empty state's button; omit for none. */
  emptyAction?: string;
};

export type RailSlideDirection = "sideways" | "vertical" | "fade";
export type RailStatus = "ready" | "loading" | "error";

export type DoubleRailProps = {
  /** Sections for the rail, each with its secondary list. @default defaultRailSections */
  sections?: RailSection[];
  /** Controlled current section id. */
  section?: string;
  /** Initial section when uncontrolled. @default the first section */
  defaultSection?: string;
  /** Fires from the rail (click, arrows) with the section chosen. */
  onSection?: (id: string) => void;
  /** Controlled current page: an item id. */
  page?: string;
  /** Initial page when uncontrolled. @default the first item of the first section */
  defaultPage?: string;
  /** Fires with the section and item whenever the current page changes. */
  onNavigate?: (sectionId: string, itemId: string) => void;
  /** Controlled panel collapse. */
  collapsed?: boolean;
  /** Initial collapse when uncontrolled. @default false */
  defaultCollapsed?: boolean;
  /** Fires from the toggle, or when choosing a section reopens the panel. */
  onCollapse?: (collapsed: boolean) => void;
  /** The empty state's button was pressed, with the section id. */
  onEmptyAction?: (sectionId: string) => void;
  /** Width of the secondary panel, px. @default 220 */
  panelWidth?: number;
  /** How the panel's list moves when the section changes: sideways in the direction of travel, vertically with the rail, or a cross-fade. @default "sideways" */
  slideDirection?: RailSlideDirection;
  /** The rail pill, the current page and counts in the current section — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Draws the page in place of the built-in one. */
  renderPage?: (section: RailSection, item: RailItem | null) => React.ReactNode;
  /** The product's name, on the rail's mark and in the phone header. @default "Gaugeworks" */
  product?: string;
  /** Who is signed in, for the rail's avatar. @default "Mara Lindqvist" */
  user?: string;
  /** Whether the navigation has arrived. @default "ready" */
  status?: RailStatus;
  /** "Try again" was pressed after the navigation failed to load. */
  onRetry?: () => void;
  /** The frame's height, px. @default 520 */
  height?: number;
  /** Classes for the outer frame. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultRailSections: RailSection[] = [
  {
    id: "fleet",
    label: "Fleet",
    icon: Truck,
    count: 39,
    countLabel: "vehicles",
    groups: [
      {
        label: "Vehicles",
        items: [
          {
            id: "vans",
            label: "Vans",
            count: 24,
            description: "Light vans across the four Yorkshire depots.",
            stats: [
              { label: "Total", value: "24" },
              { label: "On route", value: "14", tone: "ok" },
              { label: "Service due", value: "2", tone: "warn" },
            ],
          },
          {
            id: "trucks",
            label: "Trucks",
            count: 9,
            description: "Rigid trucks on the trunk routes.",
            stats: [
              { label: "Total", value: "9" },
              { label: "On route", value: "6", tone: "ok" },
              { label: "In depot", value: "3" },
            ],
          },
          {
            id: "trailers",
            label: "Trailers",
            count: 6,
            description: "Curtain-siders and box trailers.",
            stats: [
              { label: "Total", value: "6" },
              { label: "Loaded", value: "4", tone: "ok" },
              { label: "Empty", value: "2" },
            ],
          },
        ],
      },
      {
        label: "Upkeep",
        items: [
          {
            id: "service",
            label: "Service due",
            count: 4,
            meta: "4 this week",
            metaTone: "warn",
            description:
              "Vehicles past their service interval or due within seven days.",
            stats: [
              { label: "Due", value: "4", tone: "warn" },
              { label: "Booked", value: "3" },
              { label: "Overdue", value: "1", tone: "danger" },
            ],
          },
          {
            id: "inspections",
            label: "Inspections",
            count: 12,
            description: "Walk-round checks logged by drivers.",
            stats: [
              { label: "This week", value: "12" },
              { label: "Passed", value: "11", tone: "ok" },
              { label: "Defects", value: "1", tone: "warn" },
            ],
          },
          {
            id: "fuel",
            label: "Fuel cards",
            count: 18,
            description: "Cards issued to drivers and their limits.",
            stats: [
              { label: "Cards", value: "18" },
              { label: "Spend", value: "£3,940" },
              { label: "Over limit", value: "0", tone: "ok" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    icon: Receipt,
    count: 163,
    countLabel: "invoices",
    alert: true,
    groups: [
      {
        label: "Invoices",
        items: [
          {
            id: "open",
            label: "Open",
            count: 12,
            description: "Sent and not yet due.",
            stats: [
              { label: "Invoices", value: "12" },
              { label: "Value", value: "£18,420" },
              { label: "Due this week", value: "4", tone: "warn" },
            ],
          },
          {
            id: "overdue",
            label: "Overdue",
            count: 3,
            meta: "£4,212 owed",
            metaTone: "danger",
            description: "Past their terms; reminders go out on Mondays.",
            stats: [
              { label: "Invoices", value: "3", tone: "danger" },
              { label: "Owed", value: "£4,212", tone: "danger" },
              { label: "Oldest", value: "41 days" },
            ],
          },
          {
            id: "paid",
            label: "Paid",
            count: 148,
            description: "Settled in the last twelve months.",
            stats: [
              { label: "Invoices", value: "148" },
              { label: "Collected", value: "£212,880", tone: "ok" },
              { label: "Average", value: "26 days" },
            ],
          },
        ],
      },
      {
        label: "Account",
        items: [
          {
            id: "plans",
            label: "Plans",
            count: 4,
            description: "What each depot is on, and when it renews.",
            stats: [
              { label: "Depots", value: "4" },
              { label: "Monthly", value: "£1,740" },
              { label: "Renewing", value: "1", tone: "warn" },
            ],
          },
          {
            id: "methods",
            label: "Payment methods",
            count: 2,
            description: "Cards and accounts on file.",
            stats: [
              { label: "On file", value: "2" },
              { label: "Default", value: "Card" },
              { label: "Expiring", value: "0", tone: "ok" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "people",
    label: "People",
    icon: Users,
    count: 53,
    countLabel: "people",
    groups: [
      {
        label: "Team",
        items: [
          {
            id: "drivers",
            label: "Drivers",
            count: 42,
            description: "Everyone who drives for a depot.",
            stats: [
              { label: "People", value: "42" },
              { label: "On shift", value: "27", tone: "ok" },
              { label: "Off today", value: "15" },
            ],
          },
          {
            id: "dispatch",
            label: "Dispatch",
            count: 6,
            description: "Planners and shift leads.",
            stats: [
              { label: "People", value: "6" },
              { label: "On shift", value: "4", tone: "ok" },
              { label: "Off today", value: "2" },
            ],
          },
          {
            id: "mechanics",
            label: "Mechanics",
            count: 5,
            description: "Workshop staff at Leeds and York.",
            stats: [
              { label: "People", value: "5" },
              { label: "On shift", value: "3", tone: "ok" },
              { label: "Off today", value: "2" },
            ],
          },
        ],
      },
      {
        label: "Access",
        items: [
          {
            id: "roles",
            label: "Roles",
            count: 4,
            description: "What each role can see and change.",
            stats: [
              { label: "Roles", value: "4" },
              { label: "Custom", value: "1" },
              { label: "Admins", value: "3" },
            ],
          },
          {
            id: "invites",
            label: "Invites",
            count: 2,
            meta: "2 pending",
            metaTone: "neutral",
            description: "Invitations not yet accepted.",
            stats: [
              { label: "Pending", value: "2", tone: "warn" },
              { label: "This week", value: "2" },
              { label: "Expired", value: "0" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: ChartColumn,
    count: 0,
    countLabel: "reports",
    groups: [],
    emptyText:
      "Saved reports appear here. Build one from any list, or start from a template.",
    emptyAction: "New report",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    groups: [
      {
        label: "Workspace",
        items: [
          {
            id: "general",
            label: "General",
            description: "Name, time zone and units.",
            stats: [
              { label: "Time zone", value: "London" },
              { label: "Units", value: "Metric" },
              { label: "Week starts", value: "Monday" },
            ],
          },
          {
            id: "depots",
            label: "Depots",
            count: 4,
            description: "Addresses, hours and dock doors.",
            stats: [
              { label: "Depots", value: "4" },
              { label: "Dock doors", value: "22" },
              { label: "Open 24h", value: "1" },
            ],
          },
          {
            id: "integrations",
            label: "Integrations",
            count: 3,
            description: "Connected telematics and accounting.",
            stats: [
              { label: "Connected", value: "3", tone: "ok" },
              { label: "Failing", value: "0" },
              { label: "Last sync", value: "4 min" },
            ],
          },
        ],
      },
      {
        label: "Security",
        items: [
          {
            id: "signin",
            label: "Sign-in",
            description: "Single sign-on and two-step checks.",
            stats: [
              { label: "Method", value: "SSO" },
              { label: "Two-step", value: "On", tone: "ok" },
              { label: "Sessions", value: "61" },
            ],
          },
          {
            id: "audit",
            label: "Audit log",
            description: "Who changed what, and when.",
            stats: [
              { label: "Events", value: "1,204" },
              { label: "This week", value: "312" },
              { label: "Exports", value: "2" },
            ],
          },
        ],
      },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_INSET =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const TONE: Record<RailTone, string> = {
  ok: "text-success",
  warn: "text-warn",
  danger: "text-danger",
  neutral: "text-ink-3",
};

const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const itemsOf = (section: RailSection | undefined) =>
  (section?.groups ?? []).flatMap((g) => g.items);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** A small deterministic stream from an id: unsigned shifts throughout. */
function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

type Row = {
  id: string;
  title: string;
  meta: string;
  status: string;
  tone: RailTone;
};

const DEPOTS = ["Leeds", "Hull", "York", "Wakefield"];
const PEOPLE = [
  "Ines Duarte",
  "Tomas Berg",
  "Ada Mensah",
  "Rui Okafor",
  "Lena Haas",
  "Owen Pryce",
  "Mira Sato",
  "Jon Ellery",
];
const CUSTOMERS = [
  "Coldbrook Café",
  "Fernworks Supply",
  "Basinworks Logistics",
  "Waylight Studio",
  "Fieldline Ltd",
];

/** The rows a page lists, made from the item so every render agrees. */
function rowsFor(section: RailSection, item: RailItem): Row[] {
  const next = seeded(`${section.id}:${item.id}`);
  // Offset by the row so neighbouring rows rarely repeat a pick.
  let row = 0;
  const pick = <T,>(list: T[]) =>
    list[(row + Math.floor(next() * list.length)) % list.length] as T;
  const n = Math.min(5, Math.max(1, item.count ?? 4));
  return Array.from({ length: n }, (_, i): Row => {
    row = i;
    if (section.id === "fleet") {
      const s = item.id === "service" ? 2 : Math.floor(next() * 3);
      return {
        id: `${item.id}-${i}`,
        title: `GW-${1000 + Math.floor(next() * 900)}`,
        meta: `${item.id === "trucks" ? "Rigid 18 t" : item.id === "trailers" ? "Curtain-sider" : "Panel van"} · ${pick(DEPOTS)}`,
        status: ["On route", "In depot", "Service due"][s] ?? "In depot",
        tone: (["ok", "neutral", "warn"] as const)[s] ?? "neutral",
      };
    }
    if (section.id === "billing") {
      const pounds = 120 + Math.floor(next() * 2400);
      const pence = Math.floor(next() * 100);
      const status =
        item.id === "overdue"
          ? 1
          : item.id === "paid"
            ? 2
            : item.id === "open"
              ? 0
              : Math.floor(next() * 3);
      return {
        id: `${item.id}-${i}`,
        title: `INV-${2000 + Math.floor(next() * 400)}`,
        meta: `${pick(CUSTOMERS)} · £${grouped(pounds)}.${String(pence).padStart(2, "0")}`,
        status: ["Open", "Overdue", "Paid"][status] ?? "Open",
        tone: (["neutral", "danger", "ok"] as const)[status] ?? "neutral",
      };
    }
    if (section.id === "people") {
      const on = next() > 0.35;
      const role =
        item.id === "drivers"
          ? "Driver"
          : item.id === "dispatch"
            ? "Dispatcher"
            : item.id === "mechanics"
              ? "Mechanic"
              : "Member";
      return {
        id: `${item.id}-${i}`,
        title:
          PEOPLE[(Math.floor(next() * PEOPLE.length) + i) % PEOPLE.length] ??
          "Member",
        meta: `${role} · ${pick(DEPOTS)}`,
        status:
          item.id === "invites" ? "Pending" : on ? "On shift" : "Off today",
        tone: item.id === "invites" ? "warn" : on ? "ok" : "neutral",
      };
    }
    return {
      id: `${item.id}-${i}`,
      title: `${item.label} ${i + 1}`,
      meta: `Updated ${1 + Math.floor(next() * 20)} days ago`,
      status: "Active",
      tone: "ok",
    };
  });
}

/** A number that rolls to its new value: up when it grows, down when it shrinks. */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [shown, setShown] = React.useState({ value, dir: 1 });
  if (shown.value !== value)
    setShown({ value, dir: value > shown.value ? 1 : -1 });
  const d = shown.dir;
  return (
    <span
      className="relative inline-flex overflow-hidden tabular-nums"
      style={{ height: 16, lineHeight: "16px" }}
    >
      <AnimatePresence initial={false} mode="popLayout" custom={d}>
        <motion.span
          key={value}
          custom={d}
          className="block"
          initial={{ y: motionSafe ? d * 14 : 0, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{
            y: motionSafe ? -d * 14 : 0,
            opacity: 0,
            transition: { duration: durations.fast, ease: easings.exit },
          }}
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
        >
          {grouped(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  A page                                  */
/* ----------------------------------------------------------------------- */

function Page({
  section,
  item,
}: {
  section: RailSection;
  item: RailItem | null;
}) {
  if (section.loading) {
    return (
      <div aria-hidden className="flex flex-col gap-3 p-5">
        <span className="h-3 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
        <span className="h-5 w-40 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-14 rounded-2 bg-surface-2 motion-safe:animate-pulse"
            />
          ))}
        </div>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-9 rounded-2 bg-surface-2 motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  }
  if (!item) {
    return (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-2 p-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-3 border border-dashed border-hairline-strong text-ink-3">
          <Inbox aria-hidden className="size-4.5" />
        </span>
        <p className="text-[13.5px] font-medium text-foreground">{`Nothing in ${section.label} yet`}</p>
        <p className="max-w-64 text-[12px] leading-[1.5] text-ink-3">
          Pick something from the panel when there is something to pick.
        </p>
      </div>
    );
  }
  const rows = rowsFor(section, item);
  const stats = (
    item.stats ?? [
      { label: "Total", value: grouped(item.count ?? rows.length) },
      { label: "Shown", value: String(rows.length) },
      { label: "Updated", value: "Today" },
    ]
  ).slice(0, 3);
  return (
    <div className="flex flex-col gap-4 p-5">
      <div>
        <p className="font-mono text-[10.5px] text-ink-3">{`${section.label} / ${item.label}`}</p>
        <h3 className="mt-1 text-[17px] leading-6 font-semibold text-foreground">
          {item.label}
        </h3>
        {item.description ? (
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-2">
            {item.description}
          </p>
        ) : null}
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex min-w-0 flex-col rounded-2 border border-hairline bg-surface-1 px-2.5 py-2"
          >
            <dt className="truncate text-[10.5px] text-ink-3">{s.label}</dt>
            <dd
              title={s.value}
              className={cn(
                "truncate text-[16px] leading-6 font-semibold tabular-nums",
                !s.tone || s.tone === "neutral"
                  ? "text-foreground"
                  : TONE[s.tone],
              )}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      <ul role="list" className="flex flex-col">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 border-t border-hairline py-2 first:border-t-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] leading-5 text-foreground">
                {r.title}
              </span>
              <span className="truncate text-[11px] leading-4 text-ink-3">
                {r.meta}
              </span>
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 text-[11.5px]",
                TONE[r.tone],
              )}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {r.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The frame                                 */
/* ----------------------------------------------------------------------- */

type Travel = { dir: number; kind: RailSlideDirection; motionSafe: boolean };

const listVariants: Variants = {
  enter: (t?: Travel) =>
    !t || !t.motionSafe || t.kind === "fade"
      ? { opacity: 0, x: 0, y: 0 }
      : t.kind === "vertical"
        ? { opacity: 0, x: 0, y: t.dir * distances.shift }
        : { opacity: 0, x: t.dir * distances.shift * 1.5, y: 0 },
  center: { opacity: 1, x: 0, y: 0 },
  exit: (t?: Travel) => {
    const base = { transition: exitFor(durations.base) };
    if (!t || !t.motionSafe || t.kind === "fade")
      return { opacity: 0, ...base };
    return t.kind === "vertical"
      ? { opacity: 0, y: -t.dir * distances.shift, ...base }
      : { opacity: 0, x: -t.dir * distances.shift * 1.5, ...base };
  },
};

/**
 * Two tiers of navigation. The rail holds the sections; a pill behind the
 * current one slides to a new section on `springs.snap`. The panel lists what
 * is inside it, and changing section slides that list sideways on
 * `springs.glide` in the direction of travel — down the rail, the new list
 * comes in from the right — the two lists crossing in one cell. The panel's
 * title and count stay put and carry over as shared elements: the title
 * cross-fades in place while the count glides to sit after it and rolls to
 * its new number on snap. On a phone the panel becomes a drill-in, and the
 * section row's title and count fly up into the header as it opens.
 *
 * The rail is a vertical tablist with automatic activation: Up and Down move
 * and choose, Right crosses into the panel; in the panel Up and Down move,
 * Enter opens the page and Left goes back to the rail. Under reduced motion
 * the lists cross-fade without travel and counts change without rolling.
 */
export function DoubleRail({
  sections = defaultRailSections,
  section: sectionProp,
  defaultSection,
  onSection,
  page: pageProp,
  defaultPage,
  onNavigate,
  collapsed: collapsedProp,
  defaultCollapsed = false,
  onCollapse,
  onEmptyAction,
  panelWidth = 220,
  slideDirection = "sideways",
  accent = "var(--accent-bright)",
  renderPage,
  product = "Gaugeworks",
  user = "Mara Lindqvist",
  status = "ready",
  onRetry,
  height = 520,
  className,
}: DoubleRailProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const [frame, setFrame] = React.useState<HTMLElement | null>(null);
  const [narrow, setNarrow] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!frame) return;
    const read = () => setNarrow(frame.getBoundingClientRect().width < 480);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [frame]);

  /* ------------------------------ section ------------------------------- */

  const [ownSection, setOwnSection] = React.useState(
    defaultSection ?? sections[0]?.id ?? "",
  );
  const sectionId = sectionProp ?? ownSection;
  const current = sections.find((s) => s.id === sectionId) ?? sections[0];
  const index = Math.max(
    0,
    sections.findIndex((s) => s.id === current?.id),
  );

  // Direction of travel along the rail, frozen in the render that changes it.
  const [travel, setTravel] = React.useState({ id: current?.id ?? "", dir: 1 });
  if (current && travel.id !== current.id) {
    const from = sections.findIndex((s) => s.id === travel.id);
    setTravel({ id: current.id, dir: from < 0 || index >= from ? 1 : -1 });
  }

  /* -------------------------------- pages ------------------------------- */

  const [ownPage, setOwnPage] = React.useState(
    () => defaultPage ?? itemsOf(sections[0])[0]?.id ?? "",
  );
  const [memory, setMemory] = React.useState<Record<string, string>>({});
  const pageRaw = pageProp ?? ownPage;
  const items = itemsOf(current);
  const item =
    items.find((i) => i.id === pageRaw) ??
    items.find((i) => i.id === (current ? memory[current.id] : "")) ??
    items[0] ??
    null;

  const [announcement, setAnnouncement] = React.useState("");

  const navigate = (sec: RailSection, it: RailItem) => {
    if (pageProp === undefined) setOwnPage(it.id);
    setMemory((m) => ({ ...m, [sec.id]: it.id }));
    onNavigate?.(sec.id, it.id);
  };

  /* ------------------------------ collapse ------------------------------ */

  const [ownCollapsed, setOwnCollapsed] = React.useState(defaultCollapsed);
  const collapsed = collapsedProp ?? ownCollapsed;
  const setCollapsed = (next: boolean) => {
    if (next === collapsed) return;
    if (collapsedProp === undefined) setOwnCollapsed(next);
    onCollapse?.(next);
    setAnnouncement(next ? "Panel collapsed." : "Panel open.");
  };

  const choose = (sec: RailSection) => {
    if (collapsed) setCollapsed(false);
    if (sec.id === current?.id) return;
    if (sectionProp === undefined) setOwnSection(sec.id);
    onSection?.(sec.id);
    const list = itemsOf(sec);
    const remembered = list.find((i) => i.id === memory[sec.id]) ?? list[0];
    if (remembered) {
      if (pageProp === undefined) setOwnPage(remembered.id);
      onNavigate?.(sec.id, remembered.id);
    }
    setAnnouncement(
      sec.loading
        ? `${sec.label}, loading.`
        : list.length
          ? `${sec.label}, ${list.length} ${list.length === 1 ? "list" : "lists"}.`
          : `${sec.label} is empty.`,
    );
  };

  /* ------------------------------ focusing ------------------------------ */

  // Focus that must land on a node a render is about to bring (a drilled
  // level, a reopened panel) waits for that render; the counter makes asking
  // for the same target twice still count.
  const [pendingFocus, setPendingFocus] = React.useState<{
    sel: string;
    n: number;
  } | null>(null);
  React.useEffect(() => {
    if (!pendingFocus || !frame) return;
    frame.querySelector<HTMLElement>(pendingFocus.sel)?.focus();
  }, [pendingFocus, frame]);
  const focusSoon = (selector: string) => {
    frame?.querySelector<HTMLElement>(selector)?.focus();
    setPendingFocus((p) => ({ sel: selector, n: (p?.n ?? 0) + 1 }));
  };

  const onRailKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const n = sections.length;
    let to = -1;
    if (event.key === "ArrowDown") to = (i + 1) % n;
    else if (event.key === "ArrowUp") to = (i - 1 + n) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    else if (event.key === "ArrowRight") {
      event.preventDefault();
      const target = item?.id ?? items[0]?.id;
      if (collapsed) setCollapsed(false);
      if (target) focusSoon(`[data-dr-item="${target}"]`);
      else focusSoon("[data-dr-empty-action]");
      return;
    }
    if (to < 0) return;
    event.preventDefault();
    const sec = sections[to];
    if (!sec) return;
    choose(sec);
    focusSoon(`[data-dr-tab="${sec.id}"]`);
  };

  const onItemKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const at = items.findIndex((i) => i.id === id);
    const n = items.length;
    let to = -1;
    if (event.key === "ArrowDown") to = Math.min(n - 1, at + 1);
    else if (event.key === "ArrowUp") to = Math.max(0, at - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (narrow) {
        setLevel(0);
        if (current) focusSoon(`[data-dr-row="${current.id}"]`);
      } else if (current) focusSoon(`[data-dr-tab="${current.id}"]`);
      return;
    } else if (event.key === "ArrowRight" && narrow) {
      event.preventDefault();
      const it = items.find((i) => i.id === id);
      if (it && current) {
        navigate(current, it);
        setLevel(2);
        focusSoon("[data-dr-back]");
      }
      return;
    } else if (event.key === "Escape" && narrow) {
      event.preventDefault();
      setLevel(0);
      if (current) focusSoon(`[data-dr-row="${current.id}"]`);
      return;
    }
    if (to < 0) return;
    event.preventDefault();
    setItemFocus(items[to]?.id ?? null);
    const next = items[to];
    if (next) focusSoon(`[data-dr-item="${next.id}"]`);
  };

  const [itemFocus, setItemFocus] = React.useState<string | null>(null);
  const tabbableItem =
    items.find((i) => i.id === itemFocus)?.id ?? item?.id ?? items[0]?.id;

  /* --------------------------- phone drill-in --------------------------- */

  const [level, setLevel] = React.useState<0 | 1 | 2>(1);
  const [levelDir, setLevelDir] = React.useState({ level: 1, dir: 1 });
  if (levelDir.level !== level)
    setLevelDir({ level, dir: level > levelDir.level ? 1 : -1 });

  /* -------------------------------- render ------------------------------ */

  const vars = {
    "--dr-accent": accent,
    "--dr-wash": `color-mix(in oklab, ${accent} 11%, transparent)`,
    "--dr-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--dr-solid": `oklch(from ${accent} 0.55 c h)`,
    "--dr-on": "oklch(0.99 0.004 262)",
    height,
  } as React.CSSProperties;

  const t: Travel = { dir: travel.dir, kind: slideDirection, motionSafe };
  const pw = Math.max(160, Math.round(panelWidth));
  const countOf = (s: RailSection | undefined) =>
    s?.count ?? itemsOf(s).reduce((sum, i) => sum + (i.count ?? 0), 0);

  if (status !== "ready") {
    return (
      <section
        ref={setFrame}
        aria-label={product}
        aria-busy={status === "loading" || undefined}
        className={cn(
          "@container/double-rail relative flex w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
          className,
        )}
        style={vars}
      >
        {status === "loading" ? (
          <div aria-hidden className="flex w-full">
            <div className="flex w-14 flex-col items-center gap-3 border-r border-hairline bg-surface-1 py-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="size-8 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                />
              ))}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="h-8 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center-safe justify-center-safe gap-2 p-6 text-center">
            <p className="text-[13.5px] font-medium">
              The navigation could not be loaded.
            </p>
            <p className="text-[12px] text-ink-3">
              Your pages are safe. Try again in a moment.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] hover:bg-surface-2",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        )}
      </section>
    );
  }

  const emptyState = (sec: RailSection) => (
    <div className="flex flex-col items-start gap-2 px-3 py-4">
      <span className="flex size-8 items-center justify-center rounded-2 border border-dashed border-hairline-strong text-ink-3">
        <Inbox aria-hidden className="size-4" />
      </span>
      <p className="text-[12.5px] leading-[1.5] text-ink-2">
        {sec.emptyText ?? `Nothing in ${sec.label} yet.`}
      </p>
      {sec.emptyAction ? (
        <button
          type="button"
          data-dr-empty-action
          onClick={() => onEmptyAction?.(sec.id)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 bg-(--dr-solid) px-3 text-[12px] font-medium text-(--dr-on) transition-colors hover:bg-[color-mix(in_oklab,var(--dr-solid)_88%,black)]",
            FOCUS,
          )}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" && !narrow) {
              event.preventDefault();
              focusSoon(`[data-dr-tab="${sec.id}"]`);
            }
          }}
        >
          <Plus aria-hidden className="size-3.5" />
          {sec.emptyAction}
        </button>
      ) : null}
    </div>
  );

  const list = (sec: RailSection) =>
    sec.loading ? (
      <div aria-hidden className="flex flex-col gap-1.5 px-2 py-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="h-8 rounded-2 bg-surface-2 motion-safe:animate-pulse"
          />
        ))}
      </div>
    ) : itemsOf(sec).length === 0 ? (
      emptyState(sec)
    ) : (
      <div className="flex flex-col gap-3 px-2 py-2">
        {(sec.groups ?? []).map((group) =>
          group.items.length ? (
            <div key={group.label} className="flex flex-col">
              <p className="px-2 pb-1 font-mono text-[9.5px] tracking-[0.08em] text-ink-3 uppercase">
                {group.label}
              </p>
              <ul role="list" className="flex flex-col gap-px">
                {group.items.map((it) => {
                  const isCurrent =
                    sec.id === current?.id && it.id === item?.id;
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        data-dr-item={it.id}
                        aria-current={isCurrent ? "page" : undefined}
                        tabIndex={it.id === tabbableItem ? 0 : -1}
                        onFocus={() => setItemFocus(it.id)}
                        onKeyDown={(event) => onItemKey(event, it.id)}
                        onClick={() => {
                          navigate(sec, it);
                          if (narrow) {
                            setLevel(2);
                            focusSoon("[data-dr-back]");
                          }
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-2 px-2 py-1.5 text-left transition-colors",
                          isCurrent ? "bg-(--dr-wash)" : "hover:bg-surface-2",
                          FOCUS_INSET,
                        )}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className={cn(
                              "truncate text-[13px] leading-5",
                              isCurrent
                                ? "font-medium text-(--dr-accent)"
                                : "text-foreground",
                            )}
                          >
                            {it.label}
                          </span>
                          {it.meta ? (
                            <span
                              className={cn(
                                "truncate text-[11px] leading-4",
                                TONE[it.metaTone ?? "neutral"],
                              )}
                            >
                              {it.meta}
                            </span>
                          ) : null}
                        </span>
                        {it.count !== undefined ? (
                          <span
                            className={cn(
                              "shrink-0 font-mono text-[11px] tabular-nums",
                              isCurrent ? "text-(--dr-accent)" : "text-ink-3",
                            )}
                          >
                            {grouped(it.count)}
                          </span>
                        ) : null}
                        {narrow ? (
                          <ChevronRight
                            aria-hidden
                            className="size-3.5 shrink-0 text-ink-3"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    );

  const countBadge = (sec: RailSection | undefined, layoutId?: string) =>
    sec &&
    (sec.count !== undefined ||
      itemsOf(sec).some((i) => i.count !== undefined)) ? (
      <motion.span
        layout={layoutId ? undefined : "position"}
        layoutId={layoutId}
        transition={{ layout: motionSafe ? springs.glide : { duration: 0 } }}
        aria-label={`${grouped(countOf(sec))} ${sec.countLabel ?? "items"}`}
        className="inline-flex h-5 shrink-0 items-center rounded-full border border-(--dr-line) bg-(--dr-wash) px-1.5 font-mono text-[11px] text-(--dr-accent)"
      >
        <span aria-hidden>
          <RollingCount value={countOf(sec)} motionSafe={motionSafe} />
        </span>
      </motion.span>
    ) : null;

  /* ------------------------------- phone -------------------------------- */

  if (narrow && current) {
    const ld = levelDir.dir;
    const enter = { opacity: 0, x: motionSafe ? ld * 24 : 0 };
    const leave = {
      opacity: 0,
      x: motionSafe ? -ld * 24 : 0,
      transition: exitFor(durations.base),
    };
    return (
      <section
        ref={setFrame}
        aria-label={product}
        className={cn(
          "@container/double-rail relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
          className,
        )}
        style={vars}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-2">
          {level > 0 ? (
            <button
              type="button"
              data-dr-back
              onClick={() => {
                const to = (level - 1) as 0 | 1;
                setLevel(to);
                focusSoon(
                  to === 0
                    ? `[data-dr-row="${current.id}"]`
                    : `[data-dr-item="${item?.id ?? ""}"]`,
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  event.currentTarget.click();
                }
              }}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-0.5 rounded-2 pr-2 pl-1 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <ChevronLeft aria-hidden className="size-4" />
              {level === 1 ? "Sections" : current.label}
            </button>
          ) : (
            <span className="flex items-center gap-2 px-2 text-[14px] font-semibold">
              <span
                aria-hidden
                className="flex size-6 items-center justify-center rounded-2 bg-(--dr-solid) text-(--dr-on)"
              >
                <Gauge className="size-3.5" />
              </span>
              {product}
            </span>
          )}
          {level === 1 ? (
            <span className="ml-auto flex min-w-0 items-center gap-2 pr-2">
              <motion.span
                layoutId={`${uid}-t-${current.id}`}
                transition={{
                  layout: motionSafe ? springs.glide : { duration: 0 },
                }}
                className="truncate text-[14px] font-semibold"
              >
                {current.label}
              </motion.span>
              {countBadge(current, `${uid}-c-${current.id}`)}
            </span>
          ) : level === 2 && item ? (
            <span className="ml-auto truncate pr-2 text-[13px] font-medium">
              {item.label}
            </span>
          ) : null}
        </header>
        <div className="relative grid flex-1 overflow-hidden">
          <AnimatePresence initial={false}>
            <motion.div
              key={`${level}-${level === 0 ? "root" : current.id}-${level === 2 ? (item?.id ?? "") : ""}`}
              className="[scrollbar-width:thin] overflow-y-auto overscroll-contain [grid-area:1/1]"
              initial={enter}
              animate={{ opacity: 1, x: 0 }}
              exit={leave}
              transition={
                motionSafe
                  ? {
                      x: springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              {level === 0 ? (
                <ul
                  role="list"
                  aria-label="Sections"
                  className="flex flex-col gap-px p-2"
                >
                  {sections.map((sec, i) => {
                    const Icon = sec.icon ?? Gauge;
                    const isCur = sec.id === current.id;
                    return (
                      <li key={sec.id}>
                        <button
                          type="button"
                          data-dr-row={sec.id}
                          aria-current={isCur ? "true" : undefined}
                          tabIndex={isCur ? 0 : -1}
                          onClick={() => {
                            choose(sec);
                            setLevel(1);
                            const first = itemsOf(sec)[0]?.id;
                            focusSoon(
                              first
                                ? `[data-dr-item="${first}"]`
                                : "[data-dr-back]",
                            );
                          }}
                          onKeyDown={(event) => {
                            const n = sections.length;
                            let to = -1;
                            if (event.key === "ArrowDown")
                              to = Math.min(n - 1, i + 1);
                            else if (event.key === "ArrowUp")
                              to = Math.max(0, i - 1);
                            else if (event.key === "Home") to = 0;
                            else if (event.key === "End") to = n - 1;
                            else if (event.key === "ArrowRight") {
                              event.preventDefault();
                              event.currentTarget.click();
                              return;
                            }
                            if (to < 0) return;
                            event.preventDefault();
                            const s = sections[to];
                            if (s) focusSoon(`[data-dr-row="${s.id}"]`);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2 px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2",
                            FOCUS_INSET,
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-2",
                              isCur
                                ? "bg-(--dr-wash) text-(--dr-accent)"
                                : "bg-surface-2 text-ink-2",
                            )}
                          >
                            <Icon aria-hidden className="size-4" />
                          </span>
                          <motion.span
                            layoutId={`${uid}-t-${sec.id}`}
                            transition={{
                              layout: motionSafe
                                ? springs.glide
                                : { duration: 0 },
                            }}
                            className="min-w-0 flex-1 truncate text-[13.5px] font-medium"
                          >
                            {sec.label}
                          </motion.span>
                          {countBadge(sec, `${uid}-c-${sec.id}`)}
                          <ChevronRight
                            aria-hidden
                            className="size-4 shrink-0 text-ink-3"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : level === 1 ? (
                list(current)
              ) : renderPage ? (
                renderPage(current, item)
              ) : (
                <Page section={current} item={item} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </section>
    );
  }

  /* ------------------------------- wide --------------------------------- */

  return (
    <section
      ref={setFrame}
      aria-label={product}
      className={cn(
        "@container/double-rail relative flex w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={vars}
    >
      {/* The rail. */}
      <div className="flex w-14 shrink-0 flex-col items-center border-r border-hairline bg-surface-1 py-3">
        <span
          aria-hidden
          title={product}
          className="mb-3 flex size-8 items-center justify-center rounded-2 bg-(--dr-solid) text-(--dr-on)"
        >
          <Gauge className="size-4" />
        </span>
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Sections"
          className="flex w-full flex-1 [scrollbar-width:none] flex-col items-center gap-1 overflow-y-auto"
        >
          {sections.map((sec, i) => {
            const Icon = sec.icon ?? Gauge;
            const selected = sec.id === current?.id;
            return (
              <button
                key={sec.id}
                type="button"
                role="tab"
                id={`${uid}-tab-${sec.id}`}
                data-dr-tab={sec.id}
                aria-selected={selected}
                aria-controls={`${uid}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(sec)}
                onKeyDown={(event) => onRailKey(event, i)}
                className={cn(
                  "relative flex w-12 flex-col items-center gap-0.5 rounded-2 py-1.5 transition-colors",
                  selected
                    ? "text-(--dr-accent)"
                    : "text-ink-3 hover:text-foreground",
                  FOCUS_INSET,
                )}
              >
                {selected ? (
                  <motion.span
                    layoutId={`${uid}-rail-pill`}
                    aria-hidden
                    className="absolute inset-0 rounded-2 bg-(--dr-wash)"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative">
                  <Icon aria-hidden className="size-4.5" />
                  {sec.alert ? (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-danger"
                    />
                  ) : null}
                </span>
                <span className="relative max-w-full truncate px-0.5 text-[9.5px] leading-3 font-medium">
                  {sec.label}
                </span>
                {sec.alert ? (
                  <span className="sr-only">, needs attention</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={`${uid}-panel`}
          aria-label={collapsed ? "Open panel" : "Collapse panel"}
          title={collapsed ? "Open panel" : "Collapse panel"}
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "mt-2 inline-flex size-8 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden className="size-4" />
          )}
        </button>
        <span
          title={user}
          aria-label={`Signed in as ${user}`}
          role="img"
          className="mt-2 flex size-7 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] font-semibold text-ink-2"
        >
          {initials(user)}
        </span>
      </div>

      {/* The panel: folds to nothing on glide when collapsed. */}
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 0 : pw }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        inert={collapsed || undefined}
        className="shrink-0 overflow-hidden bg-card"
      >
        <div
          role="tabpanel"
          id={`${uid}-panel`}
          aria-labelledby={current ? `${uid}-tab-${current.id}` : undefined}
          className="flex h-full flex-col border-r border-hairline"
          style={{ width: pw }}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-4">
            <span className="relative grid min-w-0">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={current?.id ?? "none"}
                  className="truncate text-[14px] font-semibold [grid-area:1/1]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  {current?.label}
                </motion.span>
              </AnimatePresence>
            </span>
            {countBadge(current)}
          </div>
          <div className="relative grid flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={t}>
              <motion.div
                key={current?.id ?? "none"}
                custom={t}
                variants={listVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={
                  motionSafe && slideDirection !== "fade"
                    ? {
                        x: springs.glide,
                        y: springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
                className="[scrollbar-width:thin] overflow-y-auto overscroll-contain [grid-area:1/1]"
              >
                {current ? list(current) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* The page. */}
      <div className="relative grid flex-1 overflow-hidden bg-surface-0">
        <AnimatePresence initial={false}>
          <motion.div
            key={`${current?.id ?? ""}:${item?.id ?? ""}`}
            className="[scrollbar-width:thin] overflow-y-auto overscroll-contain [grid-area:1/1]"
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
          >
            {current ? (
              renderPage ? (
                renderPage(current, item)
              ) : (
                <Page section={current} item={item} />
              )
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
