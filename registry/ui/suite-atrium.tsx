"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ChevronRight,
  ClipboardList,
  HardHat,
  House,
  Lock,
  Map as MapIcon,
  Pin,
  Receipt,
  RotateCcw,
  Ticket,
  TriangleAlert,
  Vault,
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

export type SuiteAtriumAccent = "cobalt" | "plum" | "mint" | "ink";
export type SuiteAtriumGrow = "tile" | "zoom" | "sheet";
export type SuiteAtriumStatus = "ready" | "loading" | "error";
export type SuiteIcon =
  "survey" | "crew" | "ledger" | "atlas" | "docket" | "vault";
export type SuiteAppStatus = "ready" | "loading" | "locked";
export type SuiteTone = "neutral" | "accent" | "success" | "warn" | "danger";

export type SuiteSection = { id: string; label: string; count?: number };

export type SuiteItem = {
  id: string;
  /** The section it is listed under. */
  section: string;
  title: string;
  meta?: string;
  /** A short state word shown as a chip, e.g. "Due Fri". */
  tag?: string;
  tone?: SuiteTone;
};

export type SuiteApp = {
  id: string;
  name: string;
  icon: SuiteIcon;
  /** The icon square's colour, any CSS colour. Defaults to a pigment by position. */
  hue?: string;
  /** The live line on the tile, e.g. "3 site visits due this week". */
  summary: string;
  /** A number that rolls when it changes, with a word after it. */
  stat?: { value: number; label?: string };
  /** The last fortnight, any scale, drawn as the tile's sparkline. */
  series?: number[];
  /** Locked apps request access instead of opening; loading ones show skeletons. @default "ready" */
  status?: SuiteAppStatus;
  /** Why a locked app is locked, e.g. "Ask Priya Raman for access". */
  lockedReason?: string;
  sections: SuiteSection[];
  items: SuiteItem[];
};

export type SuiteRecent = {
  id: string;
  appId: string;
  /** An item inside the app to show when it opens. */
  itemId?: string;
  title: string;
};

export type SuiteUser = { name: string; initials?: string };

export type SuiteAtriumProps = {
  /** The narrowest a tile column may be, in px: smaller fits more tiles to a row. @default 180 */
  tileSize?: number;
  /** How a chosen tile becomes the app: grows from the tile, zooms from its centre, or rises as a sheet. @default "tile" */
  grow?: SuiteAtriumGrow;
  /** Interface accent: section pill, pinned glyph and focus wash. A name or any CSS colour. @default "cobalt" */
  accent?: SuiteAtriumAccent | (string & {});
  /** The suite's apps, in home order (pinned ones sort first). @default defaultSuiteApps */
  apps?: SuiteApp[];
  /** Recent items across the suite, newest first. @default defaultSuiteRecent */
  recent?: SuiteRecent[];
  /** Controlled open app id, or null for home. */
  openApp?: string | null;
  /** Initial open app when uncontrolled. @default null */
  defaultOpenApp?: string | null;
  /** Fires from the tile, chip or key that opened an app. */
  onOpenApp?: (appId: string) => void;
  /** Fires from the button or key that went home, with the app that was open. */
  onReturnHome?: (fromAppId: string) => void;
  /** Controlled pinned app ids. */
  pinned?: string[];
  /** Initial pinned app ids when uncontrolled. @default ["survey"] */
  defaultPinned?: string[];
  /** Fires when an app is pinned or unpinned, with the whole new list. */
  onPinApp?: (appId: string, pinned: boolean, all: string[]) => void;
  /** An item inside an app, or a recent item, was chosen. */
  onOpenItem?: (appId: string, itemId: string) => void;
  /** A locked app was pressed. */
  onRequestAccess?: (appId: string) => void;
  /** The suite's name in the header. @default "Fieldline" */
  suite?: string;
  /** Who is signed in. @default { name: "Ines Duarte" } */
  user?: SuiteUser;
  /** The home greeting. @default "Good morning/afternoon/evening, <first name>" from `now` (UTC hour) */
  greeting?: string;
  /** The moment the greeting reads, in ms. @default defaultSuiteNow */
  now?: number;
  /** Whether the suite's data has arrived. @default "ready" */
  status?: SuiteAtriumStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The atrium's accessible name. @default "<suite> home" */
  label?: string;
  className?: string;
};

/** A fixed afternoon, so the greeting renders the same on every machine. */
export const defaultSuiteNow = Date.UTC(2026, 9, 15, 14, 5);

/** Filled squares are pigment: a token's hue at a fixed lightness, the same in both themes. */
const HUES = [
  "oklch(from var(--accent-bright) 0.66 0.15 h)",
  "oklch(from var(--warn) 0.78 0.14 h)",
  "oklch(from var(--success) 0.7 0.13 h)",
  "oklch(from var(--accent-bright) 0.64 0.14 320)",
  "oklch(from var(--danger) 0.68 0.15 h)",
];

export const defaultSuiteApps: SuiteApp[] = [
  {
    id: "survey",
    name: "Survey",
    icon: "survey",
    hue: HUES[0],
    summary: "3 site visits due this week",
    stat: { value: 3, label: "due" },
    series: [4, 6, 5, 7, 6, 8, 7, 9, 8, 6, 7, 5, 4, 3],
    sections: [
      { id: "sites", label: "Sites", count: 12 },
      { id: "visits", label: "Visits", count: 3 },
      { id: "reports", label: "Reports", count: 28 },
    ],
    items: [
      {
        id: "harbour",
        section: "sites",
        title: "Harbour Road depot",
        meta: "Coldbrook · last visit 6 Oct",
        tag: "Due Fri",
        tone: "warn",
      },
      {
        id: "mill",
        section: "sites",
        title: "Mill Lane substation",
        meta: "Basin district · 2 photos missing",
        tag: "Draft",
        tone: "neutral",
      },
      {
        id: "quay",
        section: "sites",
        title: "North quay gantry",
        meta: "Waylight yard · signed off",
        tag: "Done",
        tone: "success",
      },
      {
        id: "reservoir",
        section: "sites",
        title: "Reservoir outflow",
        meta: "Fernworks basin · access by boat",
        tag: "Next week",
        tone: "neutral",
      },
      {
        id: "v-harbour",
        section: "visits",
        title: "Harbour Road depot",
        meta: "Fri 17 Oct · 09:30 · Ines",
        tag: "Booked",
        tone: "accent",
      },
      {
        id: "v-mill",
        section: "visits",
        title: "Mill Lane substation",
        meta: "Mon 20 Oct · 11:00 · Amara",
        tag: "Booked",
        tone: "accent",
      },
      {
        id: "v-reservoir",
        section: "visits",
        title: "Reservoir outflow",
        meta: "Wed 22 Oct · needs a boat",
        tag: "Unconfirmed",
        tone: "warn",
      },
      {
        id: "q3",
        section: "reports",
        title: "Q3 structural summary",
        meta: "28 sites · shared with Coldbrook",
        tag: "Shared",
        tone: "success",
      },
      {
        id: "corrosion",
        section: "reports",
        title: "Corrosion watch list",
        meta: "6 sites · updated weekly",
        tag: "Live",
        tone: "accent",
      },
    ],
  },
  {
    id: "crew",
    name: "Crew",
    icon: "crew",
    hue: HUES[1],
    summary: "14 on shift · 2 open slots",
    stat: { value: 14, label: "on shift" },
    series: [9, 11, 12, 10, 13, 14, 12, 11, 13, 15, 14, 12, 13, 14],
    sections: [
      { id: "roster", label: "Roster", count: 3 },
      { id: "people", label: "People", count: 36 },
      { id: "leave", label: "Leave", count: 4 },
    ],
    items: [
      {
        id: "early",
        section: "roster",
        title: "Early shift · Harbour Road",
        meta: "6 of 7 filled · 06:00–14:00",
        tag: "1 open",
        tone: "warn",
      },
      {
        id: "late",
        section: "roster",
        title: "Late shift · Mill Lane",
        meta: "5 of 6 filled · 14:00–22:00",
        tag: "1 open",
        tone: "warn",
      },
      {
        id: "night",
        section: "roster",
        title: "Night watch · North quay",
        meta: "3 of 3 filled · 22:00–06:00",
        tag: "Full",
        tone: "success",
      },
      {
        id: "amara",
        section: "people",
        title: "Amara Okafor",
        meta: "Lead surveyor · on shift",
        tag: "On site",
        tone: "accent",
      },
      {
        id: "tomas",
        section: "people",
        title: "Tomas Brandt",
        meta: "Rigger · off until Mon",
        tag: "Leave",
        tone: "neutral",
      },
      {
        id: "priya",
        section: "people",
        title: "Priya Raman",
        meta: "Operations · admin",
        tag: "Admin",
        tone: "neutral",
      },
      {
        id: "l-tomas",
        section: "leave",
        title: "Tomas Brandt",
        meta: "20–24 Oct · annual",
        tag: "Approved",
        tone: "success",
      },
      {
        id: "l-amara",
        section: "leave",
        title: "Amara Okafor",
        meta: "3 Nov · half day",
        tag: "Pending",
        tone: "warn",
      },
    ],
  },
  {
    id: "ledger",
    name: "Ledger",
    icon: "ledger",
    hue: HUES[2],
    summary: "12 invoices waiting to reconcile",
    stat: { value: 12, label: "to reconcile" },
    series: [18, 16, 17, 15, 14, 15, 13, 14, 12, 13, 11, 12, 12, 12],
    sections: [
      { id: "invoices", label: "Invoices", count: 12 },
      { id: "payments", label: "Payments", count: 40 },
      { id: "exports", label: "Exports", count: 3 },
    ],
    items: [
      {
        id: "inv-2291",
        section: "invoices",
        title: "INV-2291 · Coldbrook Bank",
        meta: "Due 21 Oct · 4,820.00",
        tag: "Unmatched",
        tone: "warn",
      },
      {
        id: "inv-2288",
        section: "invoices",
        title: "INV-2288 · Basinworks",
        meta: "Due 24 Oct · 1,140.50",
        tag: "Matched",
        tone: "success",
      },
      {
        id: "inv-2284",
        section: "invoices",
        title: "INV-2284 · Waylight",
        meta: "Overdue 3 days · 960.00",
        tag: "Overdue",
        tone: "danger",
      },
      {
        id: "p-118",
        section: "payments",
        title: "Transfer from Coldbrook Bank",
        meta: "14 Oct · 3 invoices",
        tag: "Split",
        tone: "accent",
      },
      {
        id: "x-q3",
        section: "exports",
        title: "Q3 ledger export",
        meta: "CSV · 1,204 rows",
        tag: "Ready",
        tone: "success",
      },
    ],
  },
  {
    id: "atlas",
    name: "Atlas",
    icon: "atlas",
    hue: HUES[3],
    summary: "Maps of every site and route",
    status: "locked",
    lockedReason: "Ask Priya Raman for access",
    sections: [],
    items: [],
  },
  {
    id: "docket",
    name: "Docket",
    icon: "docket",
    hue: HUES[4],
    summary: "Support tickets from the field",
    status: "loading",
    sections: [
      { id: "tickets", label: "Tickets" },
      { id: "queues", label: "Queues" },
    ],
    items: [],
  },
];

export const defaultSuiteRecent: SuiteRecent[] = [
  { id: "r1", appId: "survey", itemId: "harbour", title: "Harbour Road depot" },
  { id: "r2", appId: "crew", itemId: "early", title: "Early shift roster" },
  { id: "r3", appId: "ledger", itemId: "inv-2291", title: "INV-2291" },
  { id: "r4", appId: "survey", itemId: "q3", title: "Q3 structural summary" },
];

const DEFAULT_PINNED: string[] = ["survey"];
const DEFAULT_USER: SuiteUser = { name: "Ines Duarte" };

const ICONS: Record<SuiteIcon, typeof ClipboardList> = {
  survey: ClipboardList,
  crew: HardHat,
  ledger: Receipt,
  atlas: MapIcon,
  docket: Ticket,
  vault: Vault,
};

const ACCENTS: Record<SuiteAtriumAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const TONE: Record<SuiteTone, string> = {
  neutral: "text-ink-2",
  accent: "text-[var(--sa-ink)]",
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Server and browser both: a layout effect where there is a layout. */
const useIsoLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

const noopSubscribe = () => () => {};
/** The shortcut hint names the keys of the platform it is read on. */
const readMac = () => {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform);
};

/** Thousands by hand: a locale lookup in render is a hydration risk. */
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const hueOf = (app: SuiteApp, index: number) =>
  app.hue ?? HUES[index % HUES.length] ?? HUES[0] ?? "var(--accent-bright)";
const inkOn = (hue: string) => `oklch(from ${hue} 0.24 0.05 h)`;

function greet(now: number, name: string): string {
  const h = new Date(now).getUTCHours();
  const part =
    h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first ? `${part}, ${first}` : part;
}

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/** The sparkline as one path in a 100×24 box, every coordinate rounded. */
function sparkPath(series: number[]): { line: string; area: string } {
  if (series.length < 2) return { line: "", area: "" };
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;
  const pts = series.map((v, i) => [
    r2((i / (series.length - 1)) * 100),
    r2(21 - ((v - lo) / span) * 18),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return { line, area: `${line} L100 24 L0 24 Z` };
}

/* ------------------------------- small parts ------------------------------ */

function AppGlyph({
  app,
  hue,
  size = "md",
}: {
  app: SuiteApp;
  hue: string;
  size?: "sm" | "md";
}) {
  const Icon = ICONS[app.icon] ?? ClipboardList;
  const locked = app.status === "locked";
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        size === "sm" ? "size-4 rounded-1" : "size-8 rounded-2",
      )}
      style={{
        backgroundColor: locked
          ? `color-mix(in oklab, ${hue} 40%, var(--bg-2))`
          : hue,
        color: inkOn(hue),
      }}
    >
      <Icon className={size === "sm" ? "size-2.5" : "size-4"} />
      {locked && size === "md" ? (
        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border border-hairline bg-card text-ink-2">
          <Lock className="size-2.5" />
        </span>
      ) : null}
    </span>
  );
}

/** A number whose digits roll toward the way it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = grouped(value);
  const [prev, setPrev] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (prev !== value) {
    setPrev(value);
    setDir(value > prev ? 1 : -1);
  }
  return (
    <span
      className="relative inline-flex h-5 overflow-clip tabular-nums"
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block leading-5"
          variants={{
            enter: (d: number | undefined) => ({
              opacity: 0,
              y: motionSafe ? (d ?? 1) * 10 : 0,
            }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number | undefined) => ({
              opacity: 0,
              y: motionSafe ? -(d ?? 1) * 10 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Sparkline({ series, hue }: { series: number[]; hue: string }) {
  const { line, area } = sparkPath(series);
  if (!line) return null;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-[calc(var(--sa-tile)/7.5)] min-w-0 flex-1 overflow-visible"
    >
      <path
        d={area}
        style={{ fill: `color-mix(in oklab, ${hue} 16%, transparent)` }}
      />
      <path
        d={line}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ stroke: hue }}
      />
    </svg>
  );
}

/* --------------------------------- atrium -------------------------------- */

type Geometry = {
  t: number;
  r: number;
  b: number;
  l: number;
  s0: number;
  ox: string;
  oy: string;
};

const FULL: Geometry = { t: 0, r: 0, b: 0, l: 0, s0: 1, ox: "50%", oy: "50%" };

/**
 * The home of a product suite: its apps as tiles with live summaries, a row
 * of recent items, and a greeting. Choosing a tile grows it into the app on
 * `glide`: one progress value opens a clip from the tile's box to the whole
 * atrium while the app's interior rides the clip's corner, so the app's
 * icon stays where the tile's was and the window opens around it, and the
 * sidebar then unfolds from the tile's edge a beat behind, its rows arriving
 * in `cascade()` order. Going home runs the same value back into the tile,
 * wherever pinning has moved it, and hands focus back to it. `grow` can
 * instead zoom the app from the tile's centre or raise it as a sheet.
 *
 * Tiles are one roving group — arrows move by tile and by row, Enter opens,
 * P pins (pinned apps glide to the front) — and Cmd or Ctrl+Shift+H, or
 * Escape, goes home. A locked app requests access instead of opening; a
 * loading one shows skeletons. Below a 26rem container the tiles become a
 * list and the app's sidebar a row of chips. Under reduced motion the app
 * cross-fades in place and tiles reorder without travel.
 */
export function SuiteAtrium({
  tileSize = 180,
  grow = "tile",
  accent = "cobalt",
  apps = defaultSuiteApps,
  recent = defaultSuiteRecent,
  openApp,
  defaultOpenApp = null,
  onOpenApp,
  onReturnHome,
  pinned,
  defaultPinned = DEFAULT_PINNED,
  onPinApp,
  onOpenItem,
  onRequestAccess,
  suite = "Fieldline",
  user = DEFAULT_USER,
  greeting,
  now = defaultSuiteNow,
  status = "ready",
  onRetry,
  label,
  className,
}: SuiteAtriumProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const frameTitleId = `${uid}-app`;

  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpenApp);
  const openId = openApp !== undefined ? openApp : ownOpen;
  const [ownPinned, setOwnPinned] = React.useState<string[]>(defaultPinned);
  const pinnedIds = pinned ?? ownPinned;
  const [requested, setRequested] = React.useState<string[]>([]);

  const indexOf = React.useMemo(
    () => new Map(apps.map((a, i) => [a.id, i])),
    [apps],
  );
  const hue = (app: SuiteApp) => hueOf(app, indexOf.get(app.id) ?? 0);
  const ordered = React.useMemo(() => {
    const isPinned = new Set(pinnedIds);
    return [
      ...apps.filter((a) => isPinned.has(a.id)),
      ...apps.filter((a) => !isPinned.has(a.id)),
    ];
  }, [apps, pinnedIds]);

  const [focusId, setFocusId] = React.useState<string | null>(
    () => ordered[0]?.id ?? null,
  );
  const rovingId =
    focusId && ordered.some((a) => a.id === focusId)
      ? focusId
      : (ordered[0]?.id ?? null);

  /* -------------------------------- motion -------------------------------- */

  const sectionRef = React.useRef<HTMLElement | null>(null);
  const tileRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const sideAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const progress = React.useRef(defaultOpenApp ? 1 : 0);
  const geometry = React.useRef<Geometry>(FULL);
  const pendingFocus = React.useRef<string | null>(null);

  const clip = useMotionValue("inset(0px round 16px)");
  const innerX = useMotionValue(0);
  const innerY = useMotionValue(0);
  const frameScale = useMotionValue(1);
  const frameOpacity = useMotionValue(defaultOpenApp ? 1 : 0);
  const originX = useMotionValue("50%");
  const originY = useMotionValue("50%");
  const sideClip = useMotionValue(
    defaultOpenApp ? "inset(0px 0% 0px 0px)" : "inset(0px 100% 0px 0px)",
  );
  const homeOpacity = useMotionValue(defaultOpenApp ? 0.5 : 1);
  const homeScale = useMotionValue(defaultOpenApp ? 0.98 : 1);

  const [frameId, setFrameId] = React.useState<string | null>(openId);
  const [phase, setPhase] = React.useState<
    "closed" | "opening" | "open" | "closing"
  >(openId ? "open" : "closed");
  const [section, setSection] = React.useState<string | null>(null);
  const [frameNode, setFrameNode] = React.useState<HTMLDivElement | null>(null);

  /**
   * One frame of the growth. Every mode is a function of p alone, so an
   * interrupted open can turn round from wherever it is.
   */
  const apply = React.useCallback(
    (p: number, mode: SuiteAtriumGrow, reduced: boolean) => {
      progress.current = p;
      const g = geometry.current;
      const q = 1 - p;
      homeOpacity.set(r3(1 - 0.5 * p));
      if (reduced) {
        clip.set("inset(0px round 16px)");
        innerX.set(0);
        innerY.set(0);
        frameScale.set(1);
        frameOpacity.set(r3(p));
        homeScale.set(1);
        return;
      }
      homeScale.set(r3(1 - 0.02 * p));
      if (mode === "zoom") {
        clip.set("inset(0px round 16px)");
        innerX.set(0);
        innerY.set(0);
        frameScale.set(r3(g.s0 + (1 - g.s0) * p));
        frameOpacity.set(r3(Math.min(1, p * 2.5)));
        return;
      }
      frameScale.set(1);
      frameOpacity.set(1);
      if (mode === "sheet") {
        clip.set(`inset(${r2(g.t * q)}px 0px 0px 0px round 16px 16px 0px 0px)`);
        innerX.set(0);
        innerY.set(r2(g.t * q));
        return;
      }
      clip.set(
        `inset(${r2(g.t * q)}px ${r2(g.r * q)}px ${r2(g.b * q)}px ${r2(g.l * q)}px round ${r2(10 + 6 * p)}px)`,
      );
      innerX.set(r2(g.l * q));
      innerY.set(r2(g.t * q));
    },
    [clip, frameOpacity, frameScale, homeOpacity, homeScale, innerX, innerY],
  );

  const measure = React.useCallback((id: string): Geometry => {
    const root = sectionRef.current;
    const tile = tileRefs.current.get(id);
    if (!root || !tile) return FULL;
    const s = root.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    if (s.width <= 0 || s.height <= 0) return FULL;
    const top = clamp(t.top - s.top, 0, s.height);
    const left = clamp(t.left - s.left, 0, s.width);
    const right = clamp(s.right - t.right, 0, s.width);
    const bottom = clamp(s.bottom - t.bottom, 0, s.height);
    return {
      t: r2(top),
      l: r2(left),
      r: r2(right),
      b: r2(bottom),
      s0: r3(clamp(Math.max(t.width / s.width, t.height / s.height), 0.2, 1)),
      ox: `${r2(((t.left + t.width / 2 - s.left) / s.width) * 100)}%`,
      oy: `${r2(((t.top + t.height / 2 - s.top) / s.height) * 100)}%`,
    };
  }, []);

  const animFor = React.useRef<string | null>(openId);

  const startOpen = React.useCallback(
    (id: string) => {
      anim.current?.stop();
      sideAnim.current?.stop();
      geometry.current = measure(id);
      originX.set(geometry.current.ox);
      originY.set(geometry.current.oy);
      const reduced = !motionSafe;
      // A reopen of the same app turns round from wherever it is.
      const from = animFor.current === id ? progress.current : 0;
      animFor.current = id;
      apply(from, grow, reduced);
      sideClip.set(
        reduced || grow !== "tile"
          ? "inset(0px 0% 0px 0px)"
          : `inset(0px ${r2((1 - from) * 100)}% 0px 0px)`,
      );
      anim.current = animate(from, 1, {
        ...(reduced
          ? { duration: durations.base, ease: easings.enter }
          : springs.glide),
        onUpdate: (p) => apply(p, grow, reduced),
        onComplete: () => setPhase("open"),
      });
      if (!reduced && grow === "tile") {
        sideAnim.current = animate(from, 1, {
          ...springs.glide,
          delay: 0.06,
          onUpdate: (v) =>
            sideClip.set(`inset(0px ${r2((1 - v) * 100)}% 0px 0px)`),
        });
      }
    },
    [apply, grow, measure, motionSafe, originX, originY, sideClip],
  );

  const startClose = React.useCallback(
    (id: string) => {
      anim.current?.stop();
      sideAnim.current?.stop();
      // Measured again: pinning may have moved the tile while the app was open.
      geometry.current = measure(id);
      originX.set(geometry.current.ox);
      originY.set(geometry.current.oy);
      const reduced = !motionSafe;
      pendingFocus.current = id;
      const from = progress.current;
      if (!reduced && grow === "tile") {
        sideAnim.current = animate(from, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onUpdate: (v) =>
            sideClip.set(`inset(0px ${r2((1 - v) * 100)}% 0px 0px)`),
        });
      }
      anim.current = animate(from, 0, {
        ...(reduced
          ? { duration: durations.fast, ease: easings.exit }
          : springs.glide),
        onUpdate: (p) => apply(p, grow, reduced),
        onComplete: () => {
          // Hidden until the next open has placed it, so a different tile
          // never flashes the last one's box for a frame.
          frameOpacity.set(0);
          setFrameId(null);
          setPhase("closed");
        },
      });
    },
    [
      apply,
      frameOpacity,
      grow,
      measure,
      motionSafe,
      originX,
      originY,
      sideClip,
    ],
  );

  // A changed open app — chosen here or set by the host — is read in the
  // render that sees it; the growth itself starts before that render paints.
  const [seenOpen, setSeenOpen] = React.useState(openId);
  if (seenOpen !== openId) {
    setSeenOpen(openId);
    if (openId) {
      setFrameId(openId);
      setPhase("opening");
      setSection(null);
    } else if (frameId) {
      setPhase("closing");
    }
  }

  useIsoLayoutEffect(() => {
    if (!frameId) return;
    if (phase === "opening") startOpen(frameId);
    else if (phase === "closing") startClose(frameId);
  }, [frameId, phase, startClose, startOpen]);

  React.useEffect(
    () => () => {
      anim.current?.stop();
      sideAnim.current?.stop();
    },
    [],
  );

  // Focus goes into the app when its frame arrives, and back to the tile
  // once the frame has gone and home is no longer inert.
  React.useEffect(() => {
    if (!frameNode || phase !== "opening") return;
    // The sidebar and the narrow chip row both hold the sections; only one
    // is displayed, so focus the start that actually has a box.
    const starts = [
      ...frameNode.querySelectorAll<HTMLElement>("[data-sa-start]"),
    ].filter((n) => n.getClientRects().length > 0);
    const target =
      starts[0] ?? frameNode.querySelector<HTMLElement>("[data-sa-home]");
    target?.focus({ preventScroll: true });
  }, [frameNode, phase]);
  React.useEffect(() => {
    if (phase !== "closed") return;
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    const tile = tileRefs.current.get(id);
    if (tile?.isConnected) tile.focus({ preventScroll: true });
  }, [phase]);

  /* -------------------------------- actions ------------------------------- */

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const appById = (id: string | null) =>
    id ? apps.find((a) => a.id === id) : undefined;

  const [lastOpen, setLastOpen] = React.useState(openId);
  if (lastOpen !== openId) {
    setLastOpen(openId);
    const now = appById(openId);
    const was = appById(lastOpen);
    setSaid((s) => ({
      n: s.n + 1,
      text: now
        ? `${now.name} open.`
        : `Home${was ? `, back from ${was.name}` : ""}.`,
    }));
  }

  const [wantItem, setWantItem] = React.useState<string | null>(null);

  const launch = (id: string, itemId?: string) => {
    const app = appById(id);
    if (!app || status !== "ready") return;
    if (app.status === "locked") {
      if (!requested.includes(id)) {
        setRequested((r) => [...r, id]);
        say(`Access to ${app.name} requested.`);
        onRequestAccess?.(id);
      } else {
        say(`Access to ${app.name} already requested.`);
      }
      return;
    }
    setFocusId(id);
    setWantItem(itemId ?? null);
    if (itemId) onOpenItem?.(id, itemId);
    if (openId === id) return;
    if (openApp === undefined) setOwnOpen(id);
    onOpenApp?.(id);
  };

  const goHome = () => {
    if (!openId) return;
    if (openApp === undefined) setOwnOpen(null);
    onReturnHome?.(openId);
  };

  const togglePin = (id: string) => {
    const app = appById(id);
    if (!app) return;
    const was = pinnedIds.includes(id);
    const next = was ? pinnedIds.filter((p) => p !== id) : [...pinnedIds, id];
    if (pinned === undefined) setOwnPinned(next);
    say(`${app.name} ${was ? "unpinned" : "pinned"}.`);
    onPinApp?.(id, !was, next);
  };

  /* -------------------------------- keyboard ------------------------------ */

  const moveFocus = (fromId: string, key: string) => {
    const i = ordered.findIndex((a) => a.id === fromId);
    if (i < 0) return;
    let target = i;
    if (key === "ArrowRight") target = Math.min(ordered.length - 1, i + 1);
    else if (key === "ArrowLeft") target = Math.max(0, i - 1);
    else if (key === "Home") target = 0;
    else if (key === "End") target = ordered.length - 1;
    else {
      // Up and Down go to the nearest tile in the row above or below,
      // read from where the tiles actually are, so it works for the grid
      // at any column count and for the list alike.
      const here = tileRefs.current.get(fromId)?.getBoundingClientRect();
      if (!here) return;
      const down = key === "ArrowDown";
      let best = -1;
      let bestDy = Infinity;
      let bestDx = Infinity;
      for (let j = 0; j < ordered.length; j += 1) {
        const other = ordered[j];
        const r = other
          ? tileRefs.current.get(other.id)?.getBoundingClientRect()
          : undefined;
        if (!r || j === i) continue;
        const dy = down ? r.top - here.top : here.top - r.top;
        if (dy <= 4) continue;
        const dx = Math.abs(
          r.left + r.width / 2 - (here.left + here.width / 2),
        );
        if (dy < bestDy - 4 || (Math.abs(dy - bestDy) <= 4 && dx < bestDx)) {
          best = j;
          bestDy = dy;
          bestDx = dx;
        }
      }
      if (best < 0) return;
      target = best;
    }
    const id = ordered[target]?.id;
    if (!id) return;
    setFocusId(id);
    tileRefs.current.get(id)?.focus();
  };

  const onTileKey = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    app: SuiteApp,
  ) => {
    if (
      [
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(e.key)
    ) {
      e.preventDefault();
      moveFocus(app.id, e.key);
      return;
    }
    if (
      (e.key === "p" || e.key === "P") &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      togglePin(app.id);
    }
  };

  const onRootKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const home =
      (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === "KeyH";
    if (home) {
      e.preventDefault();
      goHome();
      return;
    }
    if (e.key === "Escape" && openId) {
      e.preventDefault();
      goHome();
    }
  };

  const mac = React.useSyncExternalStore(noopSubscribe, readMac, () => true);

  /* --------------------------------- render -------------------------------- */

  const frameApp = appById(frameId);
  const frameSections = frameApp?.sections ?? [];
  const wantSection = wantItem
    ? frameApp?.items.find((it) => it.id === wantItem)?.section
    : undefined;
  const activeSection = section ?? wantSection ?? frameSections[0]?.id ?? null;
  const shownItems = frameApp
    ? frameApp.items.filter((it) => it.section === activeSection)
    : [];
  const frameRecent = frameApp
    ? recent.filter((r) => r.appId === frameApp.id)
    : [];
  const name = label ?? `${suite} home`;
  const step = cascade(Math.max(2, frameSections.length + frameRecent.length));

  // One list, drawn as a column or as a row of chips: both arrow axes walk it.
  const sectionKey = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let to = -1;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft")
      to = Math.max(0, index - 1);
    else if (e.key === "ArrowDown" || e.key === "ArrowRight")
      to = Math.min(frameSections.length - 1, index + 1);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = frameSections.length - 1;
    if (to < 0) return;
    e.preventDefault();
    const id = frameSections[to]?.id;
    if (!id) return;
    setSection(id);
    const group = e.currentTarget.closest("[data-sa-sections]");
    group
      ?.querySelector<HTMLElement>(`[data-sa-section="${CSS.escape(id)}"]`)
      ?.focus();
  };

  const sectionButtons = (vertical: boolean) =>
    frameSections.map((s, i) => {
      const current = s.id === activeSection;
      return (
        <motion.button
          key={s.id}
          type="button"
          data-sa-section={s.id}
          data-sa-start={current ? "" : undefined}
          aria-current={current ? "page" : undefined}
          tabIndex={current ? 0 : -1}
          onClick={() => setSection(s.id)}
          onKeyDown={(e) => sectionKey(e, i)}
          initial={
            phase === "open"
              ? false
              : { opacity: 0, x: motionSafe ? -distances.step : 0 }
          }
          animate={{ opacity: 1, x: 0 }}
          transition={
            motionSafe
              ? {
                  x: { ...springs.glide, delay: r3(0.08 + i * step) },
                  opacity: {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: r3(0.08 + i * step),
                  },
                }
              : { duration: durations.fast }
          }
          className={cn(
            "relative flex shrink-0 items-center gap-2 rounded-2 text-left text-[13px] transition-colors",
            vertical ? "h-8 w-full px-2.5" : "h-7 px-2.5",
            current
              ? "font-medium text-foreground"
              : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS_IN,
          )}
        >
          {current ? (
            <motion.span
              layoutId={`${uid}-pill-${vertical ? "v" : "h"}`}
              aria-hidden
              className="absolute inset-0 rounded-2 bg-[var(--sa-wash)]"
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          ) : null}
          <span className="relative min-w-0 flex-1 truncate">{s.label}</span>
          {typeof s.count === "number" ? (
            <span className="relative font-mono text-[11px] text-ink-3 tabular-nums">
              {s.count}
            </span>
          ) : null}
        </motion.button>
      );
    });

  const frame = frameApp ? (
    <motion.div
      ref={setFrameNode}
      role="region"
      aria-labelledby={frameTitleId}
      inert={phase === "closing"}
      className="absolute inset-0 z-10"
      style={{
        clipPath: clip,
        scale: frameScale,
        opacity: frameOpacity,
        originX,
        originY,
      }}
    >
      <motion.div
        className="flex h-full w-full flex-col overflow-hidden bg-card"
        style={{ x: innerX, y: innerY }}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-3.5 pt-3.5 pb-3">
          <AppGlyph app={frameApp} hue={hue(frameApp)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-[11px] leading-4 text-ink-3">{suite}</p>
            <h2
              id={frameTitleId}
              className="truncate text-sm leading-5 font-semibold text-foreground"
            >
              {frameApp.name}
            </h2>
          </div>
          <button
            type="button"
            data-sa-home=""
            onClick={goHome}
            aria-keyshortcuts="Meta+Shift+H Control+Shift+H Escape"
            title={`Home (${mac ? "⇧⌘H" : "Ctrl+Shift+H"})`}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[13px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <House aria-hidden className="size-3.5" />
            Home
            <kbd
              aria-hidden
              className="hidden font-mono text-[10px] text-ink-3 @min-[34rem]:inline"
            >
              {mac ? "⇧⌘H" : "Ctrl⇧H"}
            </kbd>
          </button>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <motion.nav
            aria-label={`${frameApp.name} sections`}
            className="hidden w-44 shrink-0 flex-col gap-4 overflow-y-auto border-r border-hairline p-2.5 @min-[26rem]:flex"
            style={{ clipPath: sideClip }}
          >
            <div data-sa-sections="" className="flex flex-col gap-0.5">
              {sectionButtons(true)}
            </div>
            {frameRecent.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                <p className="px-2.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Recent
                </p>
                {frameRecent.map((r, i) => (
                  <motion.button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      const item = frameApp.items.find(
                        (it) => it.id === r.itemId,
                      );
                      if (item) setSection(item.section);
                      if (r.itemId) onOpenItem?.(frameApp.id, r.itemId);
                    }}
                    initial={
                      phase === "open"
                        ? false
                        : { opacity: 0, x: motionSafe ? -distances.step : 0 }
                    }
                    animate={{ opacity: 1, x: 0 }}
                    transition={
                      motionSafe
                        ? {
                            x: {
                              ...springs.glide,
                              delay: r3(
                                0.08 + (frameSections.length + i) * step,
                              ),
                            },
                            opacity: {
                              duration: durations.base,
                              delay: r3(
                                0.08 + (frameSections.length + i) * step,
                              ),
                            },
                          }
                        : { duration: durations.fast }
                    }
                    className={cn(
                      "flex h-8 items-center rounded-2 px-2.5 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS_IN,
                    )}
                  >
                    <span className="truncate" title={r.title}>
                      {r.title}
                    </span>
                  </motion.button>
                ))}
              </div>
            ) : null}
          </motion.nav>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {frameSections.length > 0 ? (
              <motion.div
                data-sa-sections=""
                role="group"
                aria-label={`${frameApp.name} sections`}
                className="flex shrink-0 [scrollbar-width:none] gap-1 overflow-x-auto border-b border-hairline [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] px-3 py-2 @min-[26rem]:hidden"
                style={{ clipPath: sideClip }}
              >
                {sectionButtons(false)}
              </motion.div>
            ) : null}
            <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain p-4">
              {frameApp.status === "loading" ? (
                <div aria-busy="true" className="flex flex-col gap-2.5">
                  <p className="sr-only">{`Loading ${frameApp.name}.`}</p>
                  <div className="h-4 w-1/3 rounded-2 bg-surface-2" />
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded-3 bg-surface-2" />
                  ))}
                </div>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div
                    key={activeSection ?? "none"}
                    initial={{
                      opacity: 0,
                      y: motionSafe ? distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            y: springs.glide,
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          }
                        : { duration: durations.fast }
                    }
                    className="flex flex-col gap-3"
                  >
                    <p className="flex items-baseline gap-2 text-[13px] font-semibold text-foreground">
                      {frameSections.find((s) => s.id === activeSection)
                        ?.label ?? frameApp.name}
                      <span className="font-mono text-[11px] font-normal text-ink-3">
                        {(() => {
                          const total = frameSections.find(
                            (s) => s.id === activeSection,
                          )?.count;
                          return typeof total === "number" &&
                            total > shownItems.length
                            ? `${shownItems.length} of ${total}`
                            : String(shownItems.length);
                        })()}
                      </span>
                    </p>
                    {shownItems.length === 0 ? (
                      <p className="text-[13px] text-ink-3">
                        Nothing here yet.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {shownItems.map((it) => (
                          <li key={it.id}>
                            <button
                              type="button"
                              onClick={() => onOpenItem?.(frameApp.id, it.id)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-3 border px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                                it.id === wantItem
                                  ? "border-[var(--sa-soft)] bg-[var(--sa-wash)]"
                                  : "border-hairline bg-surface-1",
                                FOCUS,
                              )}
                            >
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-[13px] font-medium text-foreground">
                                  {it.title}
                                </span>
                                {it.meta ? (
                                  <span className="truncate text-[11.5px] text-ink-3">
                                    {it.meta}
                                  </span>
                                ) : null}
                              </span>
                              {it.tag ? (
                                <span
                                  className={cn(
                                    "inline-flex h-6 shrink-0 items-center rounded-full border border-hairline bg-card px-2 text-[11px]",
                                    TONE[it.tone ?? "neutral"],
                                  )}
                                >
                                  {it.tag}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  ) : null;

  const tiles = (
    <ul
      role="list"
      aria-label="Apps"
      aria-describedby={hintId}
      className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,var(--sa-tile)),1fr))] gap-3 @max-[26rem]:flex @max-[26rem]:flex-col @max-[26rem]:gap-1.5"
    >
      {ordered.map((app) => {
        const h = hue(app);
        const locked = app.status === "locked";
        const loading = app.status === "loading";
        const isPinned = pinnedIds.includes(app.id);
        const asked = requested.includes(app.id);
        const lockedLine = asked
          ? "Access requested"
          : (app.lockedReason ?? "Locked");
        const nameText = [
          app.name,
          isPinned ? "pinned" : null,
          locked ? `locked. ${lockedLine}` : loading ? "loading" : app.summary,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <motion.li
            key={app.id}
            layout={motionSafe ? "position" : false}
            transition={springs.glide}
            className="group/sa-tile relative"
          >
            <motion.button
              ref={(node: HTMLButtonElement | null) => {
                if (node) tileRefs.current.set(app.id, node);
                else tileRefs.current.delete(app.id);
              }}
              type="button"
              tabIndex={app.id === rovingId ? 0 : -1}
              aria-label={nameText}
              onFocus={() => setFocusId(app.id)}
              onClick={() => launch(app.id)}
              onKeyDown={(e) => onTileKey(e, app)}
              whileHover={motionSafe && !locked ? { y: -2 } : undefined}
              whileTap={motionSafe ? { scale: 0.985 } : undefined}
              transition={springs.flick}
              className={cn(
                "flex h-full w-full flex-col gap-2 rounded-3 border p-3.5 text-left transition-colors",
                "@max-[26rem]:flex-row @max-[26rem]:items-center @max-[26rem]:gap-3 @max-[26rem]:px-2.5 @max-[26rem]:py-[calc(var(--sa-tile)/18)]",
                locked
                  ? "border-dashed border-hairline-strong bg-surface-0"
                  : "border-hairline bg-surface-1 hover:border-hairline-strong",
                FOCUS,
              )}
            >
              <AppGlyph app={app} hue={h} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 @max-[26rem]:pr-7 @min-[26rem]:pt-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span className="truncate">{app.name}</span>
                </span>
                {loading ? (
                  <span aria-hidden className="flex flex-col gap-1.5 pt-1">
                    <span className="h-2 w-4/5 rounded-full bg-surface-2" />
                    <span className="h-2 w-1/2 rounded-full bg-surface-2 @max-[26rem]:hidden" />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "line-clamp-2 text-[12.5px] leading-[1.35] @max-[26rem]:[display:block] @max-[26rem]:truncate",
                      locked ? "text-ink-3" : "text-ink-2",
                    )}
                  >
                    {locked ? lockedLine : app.summary}
                  </span>
                )}
              </span>
              {!locked && !loading && (app.stat || app.series) ? (
                <span className="flex items-end gap-3 pt-1 @max-[26rem]:hidden">
                  {app.stat ? (
                    <span className="flex shrink-0 items-baseline gap-1 font-mono text-[15px] font-medium text-foreground">
                      <Rolling value={app.stat.value} motionSafe={motionSafe} />
                      {app.stat.label ? (
                        <span className="font-sans text-[11px] font-normal text-ink-3">
                          {app.stat.label}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {app.series ? (
                    <Sparkline series={app.series} hue={h} />
                  ) : null}
                </span>
              ) : null}
              <ChevronRight
                aria-hidden
                className="hidden size-4 shrink-0 text-ink-3 @max-[26rem]:block"
              />
            </motion.button>
            {!locked ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={isPinned ? `Unpin ${app.name}` : `Pin ${app.name}`}
                aria-pressed={isPinned}
                title={isPinned ? "Unpin (P)" : "Pin (P)"}
                onClick={() => togglePin(app.id)}
                className={cn(
                  "absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-2 transition-[opacity,color,background-color] hover:bg-surface-2",
                  "@max-[26rem]:top-1/2 @max-[26rem]:right-9 @max-[26rem]:-translate-y-1/2",
                  isPinned
                    ? "text-[var(--sa-ink)] opacity-100"
                    : "text-ink-3 opacity-0 group-focus-within/sa-tile:opacity-100 group-hover/sa-tile:opacity-100 pointer-coarse:opacity-100",
                  FOCUS_IN,
                )}
              >
                <motion.span
                  className="inline-flex"
                  initial={false}
                  animate={{
                    scale: isPinned ? 1 : 0.86,
                    rotate: isPinned ? 0 : 30,
                  }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                >
                  <Pin
                    className="size-3.5"
                    style={{ fill: isPinned ? "currentColor" : "none" }}
                  />
                </motion.span>
              </button>
            ) : null}
          </motion.li>
        );
      })}
    </ul>
  );

  let homeBody: React.ReactNode;
  if (status === "loading") {
    homeBody = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <p className="sr-only">{`Loading ${suite}.`}</p>
        <div className="h-6 w-1/2 rounded-2 bg-surface-2" />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-28 rounded-full bg-surface-2" />
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,var(--sa-tile)),1fr))] gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 rounded-3 bg-surface-2 @max-[26rem]:h-12"
            />
          ))}
        </div>
      </div>
    );
  } else if (status === "error") {
    homeBody = (
      <div className="flex flex-col items-center-safe justify-center-safe gap-3 py-16 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">{`${suite} didn’t load.`}</p>
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
    );
  } else {
    homeBody = (
      <div className="flex flex-col gap-5 @max-[26rem]:gap-4">
        <h2 className="text-lg leading-7 font-semibold tracking-[-0.01em] text-foreground">
          {greeting ?? greet(now, user.name)}
        </h2>
        {recent.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Jump back in
            </p>
            <ul
              role="list"
              className="-mx-1 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] px-1 py-1"
            >
              {recent.map((r) => {
                const app = appById(r.appId);
                if (!app) return null;
                return (
                  <li key={r.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => launch(r.appId, r.itemId)}
                      className={cn(
                        "inline-flex h-8 max-w-[14rem] items-center gap-2 rounded-full border border-hairline bg-surface-1 pr-3 pl-2 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      <AppGlyph app={app} hue={hue(app)} size="sm" />
                      <span
                        className="truncate"
                        title={`${r.title}, in ${app.name}`}
                      >
                        {r.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {`Apps · ${apps.length}`}
          </p>
          {tiles}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("@container w-full", className)}
      style={
        {
          "--sa-ink": ACCENTS[accent as SuiteAtriumAccent] ?? accent,
          "--sa-wash": "color-mix(in oklab, var(--sa-ink) 13%, transparent)",
          "--sa-soft": "color-mix(in oklab, var(--sa-ink) 34%, transparent)",
          "--sa-tile": `${clamp(Math.round(tileSize), 96, 360)}px`,
        } as React.CSSProperties
      }
    >
      <section
        ref={sectionRef}
        aria-labelledby={label ? undefined : titleId}
        aria-label={label ? name : undefined}
        onKeyDown={onRootKey}
        className="relative flex h-[34rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground"
      >
        <motion.div
          inert={phase !== "closed"}
          className="flex h-full flex-col overflow-hidden"
          style={{ opacity: homeOpacity, scale: homeScale }}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--sa-wash)] text-sm font-semibold text-[var(--sa-ink)]"
            >
              {suite.charAt(0)}
            </span>
            <p
              id={titleId}
              className="min-w-0 flex-1 truncate text-sm font-semibold"
            >
              {suite}
              <span className="font-normal text-ink-3"> · Home</span>
            </p>
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 text-[11px] font-semibold text-ink-2"
              title={user.name}
            >
              <span aria-hidden>{user.initials ?? initialsOf(user.name)}</span>
              <span className="sr-only">{`Signed in as ${user.name}`}</span>
            </span>
          </header>
          <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain p-4 @max-[26rem]:p-3">
            {homeBody}
          </div>
          <p id={hintId} className="sr-only">
            Arrow keys move between apps, Enter opens one, P pins it.
          </p>
        </motion.div>
        {frame}
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </section>
    </div>
  );
}
