"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpDown,
  BarChart3,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Filter,
  MapPin,
  Play,
  Plus,
  RotateCcw,
  Search,
  TriangleAlert,
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
import { cn } from "@/registry/lib/utils";

/** A place on the mock screen a stop can point at. */
export type TourTarget =
  "nav" | "search" | "filter" | "new" | "row" | "detail" | "assign";

export type TourStop = {
  id: string;
  /** Which part of the screen the stop lights up. */
  target: TourTarget;
  /** The card's heading, e.g. "Narrow the list". */
  title: string;
  /** One or two sentences under it. */
  body: string;
};

export type TourScreen = "jobs" | "crews" | "sites";
export type TourSpotlight = "rounded" | "pill" | "none";
export type TourPlacement = "auto" | "below" | "beside";
export type TourDensity = "compact" | "cozy" | "roomy";
export type TourStatus = "ready" | "loading" | "error";
export type TourReason =
  "start" | "next" | "back" | "pick" | "skip" | "complete";

export type WayfindingDotsProps = {
  /** The tour's stops, in order; each points at a target on the screen. @default defaultTourStops */
  stops?: TourStop[];
  /** Controlled: the index of the stop being shown, or null when the tour is not running. */
  value?: number | null;
  /** Initial stop when uncontrolled; null starts with the tour closed. @default null */
  defaultValue?: number | null;
  /** Fires from the press or key that moved the tour: the new index (null when it closed) and why. */
  onChange?: (index: number | null, reason: TourReason) => void;
  /** The last stop's Done was pressed. The tour is marked completed. */
  onComplete?: () => void;
  /** Controlled: whether this screen's tour has been completed before. */
  completed?: boolean;
  /** Initial completion when uncontrolled. @default false */
  defaultCompleted?: boolean;
  /** Which mock screen sits under the tour: the jobs list, the crews, or the sites. @default "jobs" */
  screen?: TourScreen;
  /** The cutout's shape: rounded corners, a full pill, or no dimming at all (the ring alone). @default "rounded" */
  spotlight?: TourSpotlight;
  /** Where the card sits: beside the stop when the container is wide enough and there is room, else below. @default "auto" */
  placement?: TourPlacement;
  /** Row heights, bar heights and the card's padding. @default "cozy" */
  density?: TourDensity;
  /** Whether the screen has arrived. @default "ready" */
  status?: TourStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Product tour" */
  title?: string;
  /** The mock product's name, in the screen's top bar. @default "Fieldline" */
  product?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the screen takes what the header and the foot leave. @default 540 */
  height?: number;
  /** Read only: the tour cannot start, move or close. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Five stops across Fieldline's jobs screen. */
export const defaultTourStops: TourStop[] = [
  {
    id: "nav",
    target: "nav",
    title: "Your jobs live here",
    body: "Every work order Fieldline knows about, newest first. The other sections are one press away.",
  },
  {
    id: "search",
    target: "search",
    title: "Find anything",
    body: "Search by reference, site or crew. Press / from anywhere to jump here.",
  },
  {
    id: "filter",
    target: "filter",
    title: "Narrow the list",
    body: "Filters stack: a crew, a material, a priority. The count updates as you go.",
  },
  {
    id: "row",
    target: "row",
    title: "Open a job",
    body: "Pick a row and its detail opens beside it, with the crew, the site and what is left to do.",
  },
  {
    id: "assign",
    target: "assign",
    title: "Hand it to a crew",
    body: "Assign sends the job to a crew's day sheet. That is the whole tour.",
  },
];

type MockRow = {
  ref: string;
  title: string;
  meta: string;
  tone?: "warn" | "success";
};

type ScreenSpec = {
  nav: string;
  listTitle: string;
  count: number;
  filter: string;
  newLabel: string;
  rows: MockRow[];
  detail: {
    title: string;
    sub: string;
    fields: [string, string][];
    action: string;
    secondary: string;
  };
};

const SCREENS: Record<TourScreen, ScreenSpec> = {
  jobs: {
    nav: "Jobs",
    listTitle: "Work orders",
    count: 48,
    filter: "Crew: Coldbrook",
    newLabel: "New job",
    rows: [
      {
        ref: "WO-1183",
        title: "Replace meter bank",
        meta: "Coldbrook · Today",
        tone: "warn",
      },
      {
        ref: "WO-1186",
        title: "Valve chamber survey",
        meta: "Basinworks · Tomorrow",
      },
      { ref: "WO-1189", title: "Cable joint repair", meta: "Fernmoor · Thu" },
      { ref: "WO-1192", title: "Riser swap", meta: "Coldbrook · Fri" },
      { ref: "WO-1195", title: "Pump house wiring", meta: "Night shift · Mon" },
      { ref: "WO-1198", title: "Trench backfill", meta: "Basinworks · Tue" },
      { ref: "WO-1201", title: "Hydrant service", meta: "Fernmoor · Wed" },
      { ref: "WO-1204", title: "Duct clearance", meta: "Coldbrook · Wed" },
    ],
    detail: {
      title: "WO-1183 · Replace meter bank",
      sub: "Harlow Street site · Coldbrook",
      fields: [
        ["Priority", "Urgent"],
        ["Material", "Copper"],
        ["Due", "Today, 16:00"],
        ["Crew", "Unassigned"],
      ],
      action: "Assign crew",
      secondary: "Reschedule",
    },
  },
  crews: {
    nav: "Crews",
    listTitle: "Crews",
    count: 6,
    filter: "Shift: Day",
    newLabel: "New crew",
    rows: [
      {
        ref: "CR-01",
        title: "Coldbrook",
        meta: "5 people · 3 jobs",
        tone: "success",
      },
      { ref: "CR-02", title: "Basinworks", meta: "4 people · 2 jobs" },
      { ref: "CR-03", title: "Fernmoor", meta: "6 people · 4 jobs" },
      { ref: "CR-04", title: "Night shift", meta: "3 people · 1 job" },
      { ref: "CR-05", title: "Reserve", meta: "2 people · idle" },
      { ref: "CR-06", title: "Survey", meta: "2 people · 2 jobs" },
    ],
    detail: {
      title: "Coldbrook",
      sub: "Day shift · lead Ines Varga",
      fields: [
        ["People", "5"],
        ["Jobs today", "3"],
        ["Van", "FL-07"],
        ["Next free", "14:30"],
      ],
      action: "Assign job",
      secondary: "Message",
    },
  },
  sites: {
    nav: "Sites",
    listTitle: "Sites",
    count: 23,
    filter: "Area: North",
    newLabel: "New site",
    rows: [
      {
        ref: "ST-114",
        title: "Harlow Street",
        meta: "North · 4 jobs",
        tone: "warn",
      },
      { ref: "ST-118", title: "Mill Lane depot", meta: "North · 2 jobs" },
      {
        ref: "ST-121",
        title: "Fenwick pumping station",
        meta: "North · 1 job",
      },
      { ref: "ST-127", title: "Kiln Yard", meta: "East · 3 jobs" },
      { ref: "ST-130", title: "Bridge Road kiosk", meta: "East · idle" },
      { ref: "ST-133", title: "Ashby reservoir", meta: "North · 2 jobs" },
    ],
    detail: {
      title: "Harlow Street",
      sub: "North area · 4 open jobs",
      fields: [
        ["Access", "Key safe 4471"],
        ["Contact", "M. Okafor"],
        ["Last visit", "Mon 6 Oct"],
        ["Hazards", "Live cable"],
      ],
      action: "Assign crew",
      secondary: "Directions",
    },
  },
};

const NAV: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { label: "Jobs", Icon: Wrench },
  { label: "Crews", Icon: Users },
  { label: "Sites", Icon: MapPin },
  { label: "Reports", Icon: BarChart3 },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

type Rect = { x: number; y: number; w: number; h: number };
type Size = { w: number; h: number };

type Layout = {
  box: Size;
  anchors: Partial<Record<TourTarget, Rect>>;
};

type Side = "below" | "above" | "right" | "left";

type CardPlace = { x: number; y: number; side: Side; caret: number };

const DENSITY: Record<
  TourDensity,
  { row: number; bar: number; card: string; text: string; gap: string }
> = {
  compact: {
    row: 28,
    bar: 32,
    card: "p-3",
    text: "text-[11px]",
    gap: "gap-1.5",
  },
  cozy: { row: 34, bar: 36, card: "p-3.5", text: "text-[12px]", gap: "gap-2" },
  roomy: {
    row: 40,
    bar: 40,
    card: "p-4",
    text: "text-[13px]",
    gap: "gap-2.5",
  },
};

/** Breathing room between a target's edge and the cutout. */
const PAD = 6;
/** Space between the cutout and the card. */
const GAP = 12;
/** The card never touches the screen's edge. */
const EDGE = 8;
const CARD_W = 288;
/** The card's height before it has been measured. */
const CARD_H = 150;
/** The container width from which "auto" tries beside first, in px. */
const WIDE = 640;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 2) / 2;

const noopSubscribe = () => () => {};

const sameRect = (a: Rect | undefined, b: Rect | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const sameLayout = (a: Layout | null, b: Layout) => {
  if (!a || a.box.w !== b.box.w || a.box.h !== b.box.h) return false;
  const keys = Object.keys(b.anchors) as TourTarget[];
  if (keys.length !== Object.keys(a.anchors).length) return false;
  return keys.every((k) => sameRect(a.anchors[k], b.anchors[k]));
};

/** The cutout: the target padded out and kept inside the screen. */
const spotOf = (anchor: Rect, box: Size): Rect => {
  const x = Math.max(2, anchor.x - PAD);
  const y = Math.max(2, anchor.y - PAD);
  return {
    x,
    y,
    w: Math.max(8, Math.min(anchor.x + anchor.w + PAD, box.w - 2) - x),
    h: Math.max(8, Math.min(anchor.y + anchor.h + PAD, box.h - 2) - y),
  };
};

/**
 * Where the card goes. Beside means to the right, or the left when the right
 * has no room; below means under, or above when under runs off the screen.
 */
const placeCard = (
  spot: Rect,
  box: Size,
  card: Size,
  placement: TourPlacement,
): CardPlace => {
  const maxY = Math.max(EDGE, box.h - card.h - EDGE);
  const maxX = Math.max(EDGE, box.w - card.w - EDGE);
  const cx = spot.x + spot.w / 2;
  const cy = spot.y + spot.h / 2;

  const beside = (): CardPlace | null => {
    const y = clamp(spot.y, EDGE, maxY);
    const caret = clamp(cy - y, 14, card.h - 14);
    const right = spot.x + spot.w + GAP;
    if (right + card.w <= box.w - EDGE) {
      return { x: right, y, side: "right", caret };
    }
    const left = spot.x - GAP - card.w;
    if (left >= EDGE) return { x: left, y, side: "left", caret };
    return null;
  };

  const below = (): CardPlace => {
    const x = clamp(spot.x, EDGE, maxX);
    const caret = clamp(cx - x, 14, card.w - 14);
    const under = spot.y + spot.h + GAP;
    if (under + card.h <= box.h - EDGE) {
      return { x, y: under, side: "below", caret };
    }
    const above = spot.y - GAP - card.h;
    if (above >= EDGE) return { x, y: above, side: "above", caret };
    // Nowhere clean: beside if it can, else the nearest place that fits.
    return beside() ?? { x, y: clamp(under, EDGE, maxY), side: "below", caret };
  };

  if (placement === "beside") return beside() ?? below();
  if (placement === "below") return below();
  if (box.w >= WIDE) return beside() ?? below();
  return below();
};

/* ----------------------------------------------------------------------- */
/*                                Mock screen                               */
/* ----------------------------------------------------------------------- */

type Bind = (target: TourTarget) => (node: HTMLElement | null) => void;

function MockScreen({
  spec,
  product,
  density,
  bind,
}: {
  spec: ScreenSpec;
  product: string;
  density: TourDensity;
  bind: Bind;
}) {
  const d = DENSITY[density] ?? DENSITY.cozy;
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex flex-col bg-surface-0 select-none"
    >
      {/* Top bar */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-hairline bg-card px-2.5"
        style={{ height: d.bar }}
      >
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="block size-4 rounded-1 bg-primary" />
          <span className="hidden text-[12px] font-semibold @min-[30rem]:inline">
            {product}
          </span>
        </span>
        <div
          ref={bind("search")}
          className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-2 border border-hairline bg-surface-1 px-2 text-[11px] text-ink-3 @min-[30rem]:max-w-[260px]"
        >
          <Search className="size-3 shrink-0" />
          <span className="truncate">
            Search {spec.listTitle.toLowerCase()}, sites, crews
          </span>
          <span className="ml-auto hidden rounded-1 border border-hairline px-1 font-mono text-[9px] @min-[30rem]:inline">
            /
          </span>
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Bell className="size-3.5 text-ink-3" />
          <span className="block size-5 rounded-full bg-[color-mix(in_oklab,var(--accent)_45%,var(--bg-2))]" />
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar: an icon rail that grows labels from 40rem. */}
        <nav className="flex w-10 shrink-0 flex-col gap-0.5 border-r border-hairline bg-card py-2 @min-[40rem]:w-32">
          {NAV.map(({ label, Icon }) => {
            const active = label === spec.nav;
            const inner = (
              <>
                <Icon className="size-3.5 shrink-0" />
                <span className="hidden truncate @min-[40rem]:inline">
                  {label}
                </span>
              </>
            );
            const cls = cn(
              "mx-1.5 flex h-7 items-center justify-center gap-2 rounded-2 px-0 text-[12px] @min-[40rem]:justify-start @min-[40rem]:px-2",
              active ? "bg-cobalt-wash text-cobalt-bright" : "text-ink-2",
            );
            return active ? (
              <div key={label} ref={bind("nav")} className={cls}>
                {inner}
              </div>
            ) : (
              <div key={label} className={cls}>
                {inner}
              </div>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar */}
          <div
            className="flex shrink-0 items-center gap-1.5 border-b border-hairline bg-card px-2.5"
            style={{ height: d.bar }}
          >
            <span className="shrink-0 text-[12px] font-semibold">
              {spec.listTitle}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
              {spec.count}
            </span>
            <div
              ref={bind("filter")}
              className="ml-1 flex h-6 min-w-0 items-center gap-1 rounded-full border border-hairline-strong bg-surface-1 px-2 text-[11px] text-ink-2"
            >
              <Filter className="size-3 shrink-0" />
              <span className="truncate">{spec.filter}</span>
            </div>
            <span className="hidden h-6 shrink-0 items-center gap-1 rounded-full border border-hairline px-2 text-[11px] text-ink-3 @min-[30rem]:flex">
              <ArrowUpDown className="size-3" />
              Due
            </span>
            <div
              ref={bind("new")}
              className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded-2 bg-primary px-2 text-[11px] font-medium text-primary-foreground"
            >
              <Plus className="size-3" />
              <span className="hidden @min-[30rem]:inline">
                {spec.newLabel}
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row">
            {/* List */}
            <ul className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden py-1">
              {spec.rows.map((row, i) => {
                const cls = cn(
                  "mx-1.5 grid shrink-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2 px-2",
                  i === 0 ? "bg-surface-2 text-foreground" : "text-ink-2",
                );
                const inner = (
                  <>
                    <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                      {row.ref}
                    </span>
                    <span className="truncate text-[12px]">{row.title}</span>
                    <span className="flex items-center gap-1.5 text-[10px] text-ink-3">
                      {row.tone ? (
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            row.tone === "warn" ? "bg-warn" : "bg-success",
                          )}
                        />
                      ) : null}
                      <span className="hidden @min-[30rem]:inline">
                        {row.meta}
                      </span>
                    </span>
                  </>
                );
                return i === 0 ? (
                  <li
                    key={row.ref}
                    ref={bind("row")}
                    className={cls}
                    style={{ height: d.row }}
                  >
                    {inner}
                  </li>
                ) : (
                  <li key={row.ref} className={cls} style={{ height: d.row }}>
                    {inner}
                  </li>
                );
              })}
            </ul>

            {/* Detail pane: beside the list from 40rem, under it below. */}
            <div className="flex min-h-0 shrink-0 flex-col gap-2 overflow-hidden border-t border-hairline bg-card p-3 @min-[40rem]:w-[42%] @min-[40rem]:border-t-0 @min-[40rem]:border-l">
              <div ref={bind("detail")} className="flex flex-col gap-0.5">
                <span className="truncate text-[12px] font-semibold">
                  {spec.detail.title}
                </span>
                <span className="truncate text-[10px] text-ink-3">
                  {spec.detail.sub}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {spec.detail.fields.map(([k, v]) => (
                  <div key={k} className="flex min-w-0 flex-col">
                    <dt className="font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                      {k}
                    </dt>
                    <dd className="truncate text-[11px] text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto flex items-center gap-1.5 pt-1">
                <div
                  ref={bind("assign")}
                  className="flex h-6 shrink-0 items-center rounded-2 bg-primary px-2.5 text-[11px] font-medium text-primary-foreground"
                >
                  {spec.detail.action}
                </div>
                <span className="flex h-6 items-center rounded-2 border border-hairline px-2 text-[11px] text-ink-2">
                  {spec.detail.secondary}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenSkeleton({ density }: { density: TourDensity }) {
  const d = DENSITY[density] ?? DENSITY.cozy;
  return (
    <div aria-hidden className="absolute inset-0 flex flex-col bg-surface-0">
      <div
        className="flex shrink-0 items-center gap-2 border-b border-hairline bg-card px-2.5"
        style={{ height: d.bar }}
      >
        <span className="size-4 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
        <span className="h-5 w-40 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
        <span className="ml-auto size-5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-10 shrink-0 flex-col gap-1.5 border-r border-hairline bg-card p-2 @min-[40rem]:w-32">
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className="h-6 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5">
          <span className="h-6 w-1/2 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className="rounded-2 bg-surface-1 motion-safe:animate-pulse"
              style={{ height: d.row, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Beacon                                 */
/* ----------------------------------------------------------------------- */

function Beacon({
  x,
  y,
  delay,
  pulse,
  active,
  motionSafe,
  onPick,
}: {
  x: number;
  y: number;
  /** Stagger for the bloom on mount, in s. */
  delay: number;
  /** Changes when the stop is chosen, so the ring blooms again. */
  pulse: number;
  active: boolean;
  motionSafe: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onPick}
      className="pointer-events-auto absolute flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full"
      style={{ left: x, top: y }}
    >
      {motionSafe ? (
        <motion.span
          key={pulse}
          className="absolute size-3.5 rounded-full border border-cobalt-bright"
          initial={{ scale: 0.8, opacity: 0.9 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{
            scale: { ...springs.snap, delay },
            opacity: {
              duration: durations.slow,
              ease: easings.exit,
              delay: delay + 0.08,
            },
          }}
        />
      ) : null}
      <span
        className={cn(
          "relative block size-3.5 rounded-full border-2 border-card transition-colors duration-200",
          active ? "bg-cobalt-bright" : "bg-cobalt",
        )}
      />
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A product tour over a mock screen. Dots sit at the tour's stops and each
 * blooms once as the screen arrives — a ring on `springs.snap` that fades and
 * stops, never a perpetual pulse. Starting the tour cuts a spotlight out of a
 * dim overlay (an SVG mask) around the first stop, closing in from the whole
 * screen on `springs.glide`, with a card beside or below it. Next glides the
 * cutout across the screen to the next stop on the same spring and the card
 * follows, re-placing itself to the side with room; Back glides it home. The
 * last stop's Done settles: the overlay lifts, a check lands in the foot on
 * `springs.recoil`, and the tour is remembered as completed. A row of dots at
 * the foot shows progress and any of them can be chosen directly.
 *
 * The card is a dialog: Right or Down is Next, Left or Up is Back, Home and
 * End jump to the ends, Escape skips, and focus moves to it when the tour
 * starts and back to the start button when it ends. The foot's dots are a
 * tablist with a roving tab stop. Under reduced motion nothing travels: the
 * spotlight and the card cross-fade from stop to stop, the rings do not
 * bloom, and every stop is still reached and announced.
 */
export function WayfindingDots({
  stops = defaultTourStops,
  value,
  defaultValue = null,
  onChange,
  onComplete,
  completed,
  defaultCompleted = false,
  screen = "jobs",
  spotlight = "rounded",
  placement = "auto",
  density = "cozy",
  status = "ready",
  onRetry,
  title = "Product tour",
  product = "Fieldline",
  label,
  height = 540,
  disabled = false,
  className,
}: WayfindingDotsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const cardId = `${uid}-card`;
  const cardTitleId = `${uid}-card-title`;
  const cardBodyId = `${uid}-card-body`;
  const maskId = `${idBase}-mask`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const spec = SCREENS[screen] ?? SCREENS.jobs;

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const [ownDone, setOwnDone] = React.useState(defaultCompleted);
  const rawActive = value !== undefined ? value : own;
  const done = completed !== undefined ? completed : ownDone;
  const total = stops.length;
  const active =
    rawActive !== null && rawActive >= 0 && rawActive < total
      ? rawActive
      : null;
  const stop = active === null ? null : (stops[active] ?? null);
  const ready = status === "ready";
  const inert = disabled || !ready;
  const running = ready && stop !== null;

  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [layout, setLayout] = React.useState<Layout | null>(null);
  const [cardSize, setCardSize] = React.useState<Size>({
    w: CARD_W,
    h: CARD_H,
  });
  // Each stop's bloom count: a dot blooms again when it is chosen, and keeps
  // its count when the spotlight moves on, so it does not bloom on the way out.
  const [pulses, setPulses] = React.useState<Record<string, number>>({});
  const [tabNav, setTabNav] = React.useState<number | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    where: "card" | "start";
    seq: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const [screenEl, setScreenEl] = React.useState<HTMLDivElement | null>(null);
  const [cardEl, setCardEl] = React.useState<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const startRef = React.useRef<HTMLButtonElement | null>(null);
  const tabNodes = React.useRef(new Map<number, HTMLButtonElement>());
  const anchors = React.useRef(new Map<TourTarget, HTMLElement>());
  const observer = React.useRef<ResizeObserver | null>(null);
  const binders = React.useRef(
    new Map<TourTarget, (node: HTMLElement | null) => void>(),
  );

  /* ----------------------------- measuring ----------------------------- */

  // Every target's box, relative to the screen, read whenever the screen or
  // a target changes size: that covers resizes, density and the screen
  // variant, and the observer's first callback covers the mount.
  React.useEffect(() => {
    if (!screenEl || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const sr = screenEl.getBoundingClientRect();
      const next: Layout = {
        box: { w: r1(sr.width), h: r1(sr.height) },
        anchors: {},
      };
      for (const [target, node] of anchors.current) {
        const r = node.getBoundingClientRect();
        next.anchors[target] = {
          x: r1(r.left - sr.left),
          y: r1(r.top - sr.top),
          w: r1(r.width),
          h: r1(r.height),
        };
      }
      setLayout((prev) => (sameLayout(prev, next) ? prev : next));
    };
    const ro = new ResizeObserver(measure);
    observer.current = ro;
    ro.observe(screenEl);
    for (const node of anchors.current.values()) ro.observe(node);
    return () => {
      ro.disconnect();
      observer.current = null;
    };
  }, [screenEl]);

  const bind = React.useCallback<Bind>((target) => {
    let fn = binders.current.get(target);
    if (!fn) {
      fn = (node) => {
        const prev = anchors.current.get(target);
        if (prev && prev !== node) observer.current?.unobserve(prev);
        if (node) {
          anchors.current.set(target, node);
          observer.current?.observe(node);
        } else {
          anchors.current.delete(target);
        }
      };
      binders.current.set(target, fn);
    }
    return fn;
  }, []);

  const bindCard = React.useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node;
    setCardEl(node);
  }, []);

  React.useEffect(() => {
    if (!cardEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const next = { w: r1(cardEl.offsetWidth), h: r1(cardEl.offsetHeight) };
      setCardSize((prev) =>
        prev.w === next.w && prev.h === next.h ? prev : next,
      );
    });
    ro.observe(cardEl);
    return () => ro.disconnect();
  }, [cardEl]);

  /* ------------------------------- focus ------------------------------- */

  React.useEffect(() => {
    if (!focusReq) return;
    const node = focusReq.where === "card" ? cardRef.current : startRef.current;
    node?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------- moves ------------------------------- */

  const say = (text: string) => setAnnouncement(text);

  const go = (index: number | null, reason: TourReason) => {
    if (inert) return;
    if (index === active && reason !== "start") return;
    if (value === undefined) setOwn(index);
    onChange?.(index, reason);
    if (index !== null) {
      const s = stops[index];
      if (s) setPulses((p) => ({ ...p, [s.id]: (p[s.id] ?? 0) + 1 }));
      setTabNav(index);
      if (reason === "start" || active === null) {
        say(`Tour started. Stop ${index + 1} of ${total}, ${s?.title ?? ""}.`);
        setFocusReq((f) => ({ where: "card", seq: (f?.seq ?? 0) + 1 }));
      } else {
        say(`Stop ${index + 1} of ${total}, ${s?.title ?? ""}.`);
      }
    }
  };

  const start = () => {
    if (total === 0) return;
    go(0, "start");
  };

  const next = () => {
    if (active === null) return;
    if (active < total - 1) go(active + 1, "next");
  };

  const back = () => {
    if (active === null) return;
    if (active > 0) go(active - 1, "back");
  };

  const skip = () => {
    if (inert || active === null) return;
    const at = active;
    if (value === undefined) setOwn(null);
    onChange?.(null, "skip");
    say(`Tour skipped at stop ${at + 1} of ${total}.`);
    setFocusReq((f) => ({ where: "start", seq: (f?.seq ?? 0) + 1 }));
  };

  const finish = () => {
    if (inert || active === null) return;
    if (value === undefined) setOwn(null);
    if (completed === undefined) setOwnDone(true);
    onChange?.(null, "complete");
    onComplete?.();
    say(`Tour complete. ${total} ${total === 1 ? "stop" : "stops"} seen.`);
    setFocusReq((f) => ({ where: "start", seq: (f?.seq ?? 0) + 1 }));
  };

  const onCardKey = (event: React.KeyboardEvent) => {
    if (active === null) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        next();
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        back();
        return;
      case "Home":
        event.preventDefault();
        go(0, "pick");
        return;
      case "End":
        event.preventDefault();
        go(total - 1, "pick");
        return;
      case "Escape":
        event.preventDefault();
        skip();
        return;
      default:
    }
  };

  const onTabKey = (event: React.KeyboardEvent, i: number) => {
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = total - 1;
    else return;
    event.preventDefault();
    const target = clamp(to, 0, total - 1);
    tabNodes.current.get(target)?.focus();
  };

  /* ------------------------------- derive ------------------------------ */

  const box = layout?.box ?? null;
  const anchor = stop && layout ? layout.anchors[stop.target] : undefined;
  const spot = anchor && box ? spotOf(anchor, box) : null;
  const cardW = box
    ? Math.min(CARD_W, Math.max(160, box.w - EDGE * 2))
    : CARD_W;
  const place =
    spot && box
      ? placeCard(spot, box, { w: cardW, h: cardSize.h }, placement)
      : null;
  const rx =
    spotlight === "pill"
      ? spot
        ? spot.h / 2
        : 999
      : spotlight === "none"
        ? 8
        : 10;
  const step = cascade(Math.max(total, 1));
  const tabStop = clamp(tabNav ?? active ?? 0, 0, Math.max(total - 1, 0));
  const empty = ready && total === 0;
  const isLast = active !== null && active === total - 1;

  const spotTransition = motionSafe ? springs.glide : { duration: 0 };
  const spotKey = motionSafe ? "spot" : (stop?.id ?? "spot");

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
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        <p className="flex shrink-0 items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <span className="hidden @min-[30rem]:inline">
            {product} · {spec.nav}
          </span>
          {ready ? (
            <span className="text-ink-2">
              {total} {total === 1 ? "stop" : "stops"}
            </span>
          ) : null}
        </p>
      </header>

      {/* The screen: the mock app, the beacons, the spotlight and the card. */}
      <div
        ref={setScreenEl}
        className="relative min-h-0 flex-1 overflow-hidden"
      >
        {status === "loading" ? (
          <ScreenSkeleton density={density} />
        ) : status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-0 px-6 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The screen didn&apos;t load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <MockScreen
              spec={spec}
              product={product}
              density={density}
              bind={bind}
            />

            {/* Beacons: one per stop, pinned to its target's corner. They
                mount once the screen is live, so each blooms as it lands. */}
            {live && layout && !done && !empty ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden"
              >
                {stops.map((s, i) => {
                  const a = layout.anchors[s.target];
                  if (!a) return null;
                  const isActive = i === active;
                  return (
                    <Beacon
                      key={s.id}
                      x={a.x + a.w - 4}
                      y={a.y + 4}
                      delay={i * step}
                      pulse={pulses[s.id] ?? 0}
                      active={isActive}
                      motionSafe={motionSafe}
                      onPick={() => go(i, "pick")}
                    />
                  );
                })}
              </div>
            ) : null}

            {/* Spotlight: a dim sheet with the stop cut out of it. */}
            <AnimatePresence mode={motionSafe ? "sync" : "wait"}>
              {running && spot && box ? (
                <motion.svg
                  key={spotKey}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 size-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <defs>
                    <mask id={maskId}>
                      <rect width="100%" height="100%" fill="white" />
                      {spotlight !== "none" ? (
                        <motion.rect
                          fill="black"
                          initial={
                            motionSafe
                              ? {
                                  attrX: 0,
                                  attrY: 0,
                                  width: box.w,
                                  height: box.h,
                                  rx: 16,
                                }
                              : false
                          }
                          animate={{
                            attrX: spot.x,
                            attrY: spot.y,
                            width: spot.w,
                            height: spot.h,
                            rx,
                          }}
                          transition={spotTransition}
                        />
                      ) : null}
                    </mask>
                  </defs>
                  {spotlight !== "none" ? (
                    <rect
                      width="100%"
                      height="100%"
                      mask={`url(#${maskId})`}
                      fill="color-mix(in oklab, var(--ink) 52%, transparent)"
                    />
                  ) : null}
                  <motion.rect
                    fill="none"
                    stroke="var(--accent-bright)"
                    strokeWidth={1.5}
                    initial={
                      motionSafe
                        ? {
                            attrX: 1,
                            attrY: 1,
                            width: box.w - 2,
                            height: box.h - 2,
                            rx: 16,
                          }
                        : false
                    }
                    animate={{
                      attrX: spot.x,
                      attrY: spot.y,
                      width: spot.w,
                      height: spot.h,
                      rx,
                    }}
                    transition={spotTransition}
                  />
                </motion.svg>
              ) : null}
            </AnimatePresence>

            {/* The card. One element glides from stop to stop; under reduced
                motion each stop's card is its own and they cross-fade. */}
            <AnimatePresence mode={motionSafe ? "sync" : "wait"}>
              {running && stop && place && active !== null ? (
                <motion.div
                  key={motionSafe ? "card" : stop.id}
                  ref={bindCard}
                  id={cardId}
                  role="dialog"
                  aria-labelledby={cardTitleId}
                  aria-describedby={cardBodyId}
                  tabIndex={-1}
                  onKeyDown={onCardKey}
                  initial={{
                    opacity: 0,
                    x: place.x,
                    y: place.y + (motionSafe ? distances.step : 0),
                  }}
                  animate={{ opacity: 1, x: place.x, y: place.y }}
                  exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  transition={{
                    x: motionSafe ? springs.glide : { duration: 0 },
                    y: motionSafe ? springs.glide : { duration: 0 },
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                  style={{ width: cardW }}
                  className={cn(
                    "absolute top-0 left-0 z-10 flex flex-col rounded-3 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_40px_-16px_color-mix(in_oklab,black_50%,transparent)]",
                    d.card,
                    d.gap,
                    FOCUS_RING,
                  )}
                >
                  {/* A caret toward the stop. It slides along the card's
                      edge on the same spring as the card; when the card
                      changes edge it is simply a new caret. */}
                  <motion.span
                    key={place.side}
                    aria-hidden
                    className={cn(
                      "absolute size-2.5 rotate-45 border-hairline-strong bg-popover",
                      place.side === "below" && "-top-[6px] border-t border-l",
                      place.side === "above" &&
                        "-bottom-[6px] border-r border-b",
                      place.side === "right" && "-left-[6px] border-b border-l",
                      place.side === "left" && "-right-[6px] border-t border-r",
                    )}
                    initial={false}
                    animate={
                      place.side === "below" || place.side === "above"
                        ? { left: place.caret - 5 }
                        : { top: place.caret - 5 }
                    }
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      Stop {active + 1} of {total}
                    </span>
                    <button
                      type="button"
                      onClick={skip}
                      aria-disabled={inert || undefined}
                      className={cn(
                        "-mr-1 inline-flex h-6 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      Skip tour
                      <X aria-hidden className="size-3" />
                    </button>
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={stop.id}
                      className="flex flex-col gap-1"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        duration: durations.fast,
                        ease: easings.enter,
                      }}
                    >
                      <p
                        id={cardTitleId}
                        className="text-[13px] leading-snug font-semibold"
                      >
                        {stop.title}
                      </p>
                      <p
                        id={cardBodyId}
                        className={cn("leading-relaxed text-ink-2", d.text)}
                      >
                        {stop.body}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={back}
                      aria-disabled={inert || active === 0 || undefined}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2 text-xs transition-colors",
                        active === 0
                          ? "cursor-default text-ink-3"
                          : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <ChevronLeft aria-hidden className="size-3.5" />
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={isLast ? finish : next}
                      aria-disabled={inert || undefined}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                        FOCUS_RING,
                      )}
                    >
                      {isLast ? (
                        <>
                          Done
                          <Check aria-hidden className="size-3.5" />
                        </>
                      ) : (
                        <>
                          Next
                          <ChevronRight aria-hidden className="size-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Empty: a screen with no tour written for it. */}
            {empty ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_oklab,var(--bg-0)_55%,transparent)] px-6">
                <div className="flex max-w-[260px] flex-col items-center gap-2 rounded-3 border border-hairline bg-popover px-5 py-4 text-center shadow-[0_18px_40px_-16px_color-mix(in_oklab,black_50%,transparent)]">
                  <Compass aria-hidden className="size-5 text-ink-3" />
                  <p className="text-sm font-medium">No tour for this screen</p>
                  <p className="text-[12px] text-ink-2">
                    Stops will appear here once someone has written them for{" "}
                    {spec.nav.toLowerCase()}.
                  </p>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Foot: the start control, the progress dots and the completion mark. */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline px-3 py-1.5">
        {status === "loading" ? (
          <>
            <span
              aria-hidden
              className="h-7 w-24 rounded-2 bg-surface-2 motion-safe:animate-pulse"
            />
            <span aria-hidden className="ml-auto flex items-center gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className="size-2 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 70}ms` }}
                />
              ))}
            </span>
          </>
        ) : status === "error" ? (
          <span className="text-[11px] text-ink-3">
            No tour until the screen loads.
          </span>
        ) : empty ? (
          <span className="text-[11px] text-ink-3">
            No tour for this screen.
          </span>
        ) : (
          <>
            {running && active !== null ? (
              <p className="flex min-w-0 flex-1 items-baseline gap-2 text-[12px]">
                <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Stop {active + 1} of {total}
                </span>
                <span className="min-w-0 truncate text-ink-2">
                  {stop?.title}
                </span>
              </p>
            ) : (
              <button
                ref={startRef}
                type="button"
                onClick={start}
                aria-disabled={inert || undefined}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border px-2.5 text-xs transition-colors",
                  done
                    ? "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground"
                    : "border-transparent bg-primary text-primary-foreground hover:opacity-90",
                  inert && "cursor-not-allowed",
                  FOCUS_RING,
                )}
              >
                {done ? (
                  <RotateCcw aria-hidden className="size-3.5" />
                ) : (
                  <Play aria-hidden className="size-3.5" />
                )}
                {done ? "Replay tour" : "Start tour"}
              </button>
            )}

            <div
              role="tablist"
              aria-label="Tour stops"
              className="ml-auto flex items-center gap-1.5 py-1"
            >
              {stops.map((s, i) => {
                const isActive = i === active;
                const seen = done || (active !== null && i < active);
                return (
                  <button
                    key={s.id}
                    ref={(node) => {
                      if (node) tabNodes.current.set(i, node);
                      else tabNodes.current.delete(i);
                    }}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={isActive ? cardId : undefined}
                    aria-label={`Stop ${i + 1} of ${total}: ${s.title}`}
                    tabIndex={i === tabStop ? 0 : -1}
                    onFocus={() => setTabNav(i)}
                    onClick={() => go(i, "pick")}
                    onKeyDown={(event) => onTabKey(event, i)}
                    className={cn(
                      "flex h-6 items-center justify-center rounded-full px-0.5",
                      inert ? "cursor-not-allowed" : "cursor-pointer",
                      FOCUS_RING,
                    )}
                  >
                    <motion.span
                      aria-hidden
                      className={cn(
                        "block h-2 rounded-full border transition-colors duration-200",
                        isActive
                          ? "border-cobalt-bright bg-cobalt-bright"
                          : seen
                            ? "border-cobalt bg-cobalt"
                            : "border-hairline-strong bg-transparent",
                      )}
                      initial={false}
                      animate={{ width: isActive ? 20 : 8 }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  </button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {done && !running ? (
                <motion.span
                  key="done"
                  className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-[color-mix(in_oklab,var(--success)_12%,transparent)] pr-2 pl-1.5 text-[11px] text-success"
                  initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          scale: springs.recoil,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <Check aria-hidden className="size-3" />
                  Toured
                </motion.span>
              ) : null}
            </AnimatePresence>
          </>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
