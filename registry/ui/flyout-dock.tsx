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
  CalendarDays,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Croissant,
  CupSoda,
  FileText,
  GraduationCap,
  Leaf,
  MapPin,
  Pin,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Store,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type FlyoutDockAccent = "cobalt" | "plum" | "mint" | "ink";
export type FlyoutSectionStatus = "ready" | "loading" | "error";

export type FlyoutIcon =
  | "menu"
  | "drinks"
  | "food"
  | "seasonal"
  | "modifiers"
  | "allergens"
  | "stores"
  | "store"
  | "hours"
  | "staff"
  | "rota"
  | "people"
  | "training"
  | "payroll"
  | "suppliers"
  | "reports"
  | "page";

export type FlyoutRow = {
  id: string;
  label: string;
  /** Right-hand detail: a price, a time, a status. */
  meta?: string;
};

export type FlyoutPage = {
  id: string;
  label: string;
  icon?: FlyoutIcon;
  /** A count (drawn as a number) or a short word ("New"). */
  badge?: number | string;
  /** One line under the page title. */
  summary?: string;
  /** What the page lists. */
  rows?: FlyoutRow[];
};

export type FlyoutSection = {
  id: string;
  label: string;
  /** A shorter label for the rail when the full one is long. @default label */
  railLabel?: string;
  icon: FlyoutIcon;
  pages: FlyoutPage[];
  /** Whether the section's pages have arrived. @default "ready" */
  status?: FlyoutSectionStatus;
  /** The rail's badge. @default the sum of the pages' number badges */
  badge?: number;
  /** Shown when a ready section has no pages. @default "Nothing here yet" */
  emptyTitle?: string;
  emptyHint?: string;
};

export type FlyoutDockProps = {
  /** The rail's sections, top to bottom. @default defaultFlyoutSections */
  sections?: FlyoutSection[];
  /** Controlled current page id. */
  page?: string;
  /** Initial page when uncontrolled. @default the first page */
  defaultPage?: string;
  /** A page was chosen, from the flyout, the pinned column or a drill-in screen. */
  onNavigate?: (pageId: string, sectionId: string) => void;
  /** Controlled open section (whose pages are out), or null. */
  open?: string | null;
  /** Initial open section when uncontrolled. @default null */
  defaultOpen?: string | null;
  /** Fires from the hover, focus, key or press that opened or closed a section. */
  onOpenChange?: (sectionId: string | null) => void;
  /** Controlled pinned state: the panel docked as a second column. */
  pinned?: boolean;
  /** Initial pinned state when uncontrolled. @default false */
  defaultPinned?: boolean;
  /** The panel was pinned while showing this section. */
  onPin?: (sectionId: string) => void;
  /** The panel was unpinned. */
  onUnpin?: (sectionId: string) => void;
  /** Retry was pressed on a section whose pages failed to load. */
  onRetry?: (sectionId: string) => void;
  /** The panel's width in px, floating and pinned. @default 208 */
  flyoutWidth?: number;
  /** How long the pointer must rest on a section before it switches, in ms; a move toward the panel restarts the wait. @default 140 */
  intentDelay?: number;
  /** How long an unpinned flyout stays after the pointer leaves, in ms. @default 320 */
  closeDelay?: number;
  /** Indicator, current page, badges and pin. A name or any CSS colour. @default "cobalt" */
  accent?: FlyoutDockAccent | (string & {});
  /** The product at the top of the rail. @default { name: "Coldbrook", initials: "Cb" } */
  brand?: { name: string; initials: string };
  /** Labels under the rail's icons. @default true */
  railLabels?: boolean;
  /** The frame's height in px. @default 520 */
  frameHeight?: number;
  /** The navigation's accessible name. @default "Coldbrook admin" */
  title?: string;
  /** Read only: nothing opens, pins or navigates. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const rows = (...list: [string, string?][]): FlyoutRow[] =>
  list.map(([label, meta], i) => ({
    id: `r${i}`,
    label,
    ...(meta ? { meta } : {}),
  }));

/** Coldbrook's café admin: three stores, a menu, a rota. */
export const defaultFlyoutSections: FlyoutSection[] = [
  {
    id: "menu",
    label: "Menu",
    icon: "menu",
    pages: [
      {
        id: "drinks",
        label: "Drinks",
        icon: "drinks",
        summary: "24 items · 2 hidden from the app",
        rows: rows(
          ["Cold brew", "4.50"],
          ["Oat flat white", "4.20"],
          ["Batch filter", "3.10"],
          ["Iced chai", "4.40"],
          ["Hot chocolate", "Hidden"],
        ),
      },
      {
        id: "food",
        label: "Food",
        icon: "food",
        summary: "18 items · baked at Mill Lane",
        rows: rows(
          ["Almond croissant", "3.20"],
          ["Cardamom bun", "3.40"],
          ["Ham & gruyère toastie", "6.50"],
          ["Granola pot", "4.10"],
        ),
      },
      {
        id: "seasonal",
        label: "Seasonal",
        icon: "seasonal",
        badge: "New",
        summary: "Autumn menu goes live Mon 20 Oct",
        rows: rows(
          ["Spiced pear latte", "Draft"],
          ["Maple pecan cold brew", "Draft"],
          ["Pumpkin loaf", "Ready"],
        ),
      },
      {
        id: "modifiers",
        label: "Modifiers",
        icon: "modifiers",
        summary: "Milks, syrups and extra shots",
        rows: rows(
          ["Oat milk", "+0.40"],
          ["Extra shot", "+0.60"],
          ["Vanilla syrup", "+0.50"],
        ),
      },
      {
        id: "allergens",
        label: "Allergens",
        icon: "allergens",
        summary: "14 allergens tracked across 42 items",
        rows: rows(
          ["Gluten", "19 items"],
          ["Milk", "27 items"],
          ["Tree nuts", "6 items"],
        ),
      },
    ],
  },
  {
    id: "stores",
    label: "Stores",
    icon: "stores",
    pages: [
      {
        id: "harbour",
        label: "Harbour Street",
        icon: "store",
        badge: 2,
        summary: "Open · 2 issues need a look",
        rows: rows(
          ["Grinder 2 calibration", "Due today"],
          ["Fridge temperature log", "Missed 07:00"],
          ["Till float", "Balanced"],
        ),
      },
      {
        id: "mill",
        label: "Mill Lane",
        icon: "store",
        summary: "Open · bakery on site",
        rows: rows(
          ["Bake schedule", "05:30"],
          ["Deliveries", "3 today"],
          ["Till float", "Balanced"],
        ),
      },
      {
        id: "station",
        label: "Station kiosk",
        icon: "store",
        summary: "Open until 19:00",
        rows: rows(
          ["Footfall", "312 today"],
          ["Cups left", "About 140"],
          ["Till float", "Balanced"],
        ),
      },
      {
        id: "hours",
        label: "Opening hours",
        icon: "hours",
        summary: "Bank holiday hours are set",
        rows: rows(
          ["Harbour Street", "07:00–18:00"],
          ["Mill Lane", "07:30–16:00"],
          ["Station kiosk", "06:00–19:00"],
        ),
      },
    ],
  },
  {
    id: "staff",
    label: "Staff",
    icon: "staff",
    pages: [
      {
        id: "rota",
        label: "Rota",
        icon: "rota",
        badge: 3,
        summary: "Week 42 · 3 shifts to cover",
        rows: rows(
          ["Sat 18 Oct · Harbour", "Uncovered"],
          ["Sun 19 Oct · Mill Lane", "Uncovered"],
          ["Sun 19 Oct · Station", "Uncovered"],
          ["Mon 20 Oct · Harbour", "Ines, Tomas"],
        ),
      },
      {
        id: "people",
        label: "People",
        icon: "people",
        summary: "23 people across 3 stores",
        rows: rows(
          ["Ines Carvalho", "Store lead"],
          ["Tomas Reyes", "Barista"],
          ["Mei Lin", "Baker"],
          ["Arjun Rao", "Barista"],
        ),
      },
      {
        id: "training",
        label: "Training",
        icon: "training",
        summary: "2 modules due this month",
        rows: rows(
          ["Milk steaming", "4 of 9 done"],
          ["Allergen basics", "9 of 9 done"],
          ["Opening checks", "6 of 9 done"],
        ),
      },
      {
        id: "payroll",
        label: "Payroll",
        icon: "payroll",
        summary: "Next run Fri 24 Oct",
        rows: rows(
          ["Hours approved", "412 h"],
          ["Holiday pay", "3 people"],
          ["Run status", "Draft"],
        ),
      },
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    railLabel: "Supply",
    icon: "suppliers",
    pages: [],
    emptyTitle: "No suppliers yet",
    emptyHint: "Add one from an invoice and it shows up here.",
  },
  {
    id: "reports",
    label: "Reports",
    icon: "reports",
    status: "loading",
    pages: [],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ICONS: Record<FlyoutIcon, typeof Coffee> = {
  menu: Coffee,
  drinks: CupSoda,
  food: Croissant,
  seasonal: Leaf,
  modifiers: SlidersHorizontal,
  allergens: ShieldAlert,
  stores: Store,
  store: MapPin,
  hours: Clock,
  staff: Users,
  rota: CalendarDays,
  people: Users,
  training: GraduationCap,
  payroll: Wallet,
  suppliers: Truck,
  reports: ChartColumn,
  page: FileText,
};

const ACCENTS: Record<FlyoutDockAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** The rail's width; the page always keeps at least MIN_PAGE beside a pinned column. */
const RAIL = 60;
const MIN_PAGE = 112;
const BAR_H = 20;
/** How far the indicator leans toward a section the pointer is resting on. */
const LEAN = 0.35;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

type Pt = { x: number; y: number };

/** Signed area test: is `p` inside the triangle a-b-c (edges included)? */
const inTriangle = (p: Pt, a: Pt, b: Pt, c: Pt) => {
  const s = (p1: Pt, p2: Pt, p3: Pt) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = s(p, a, b);
  const d2 = s(p, b, c);
  const d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

const sectionBadge = (s: FlyoutSection) => {
  if (s.badge !== undefined) return s.badge;
  let n = 0;
  for (const p of s.pages) if (typeof p.badge === "number") n += p.badge;
  return n;
};
const hasWordBadge = (s: FlyoutSection) =>
  s.pages.some((p) => typeof p.badge === "string" && p.badge.length > 0);

const sectionName = (s: FlyoutSection) => {
  const n = sectionBadge(s);
  if (s.status === "loading") return `${s.label}, loading`;
  if (s.status === "error") return `${s.label}, couldn’t load`;
  return n > 0 ? `${s.label}, ${n} need attention` : s.label;
};

const pageName = (p: FlyoutPage) =>
  p.badge === undefined || p.badge === ""
    ? p.label
    : typeof p.badge === "number"
      ? `${p.label}, ${p.badge}`
      : `${p.label}, ${p.badge}`;

/* ----------------------------------------------------------------------- */
/*                                 Pieces                                   */
/* ----------------------------------------------------------------------- */

function Badge({ value }: { value: number | string | undefined }) {
  if (value === undefined || value === "" || value === 0) return null;
  if (typeof value === "string") {
    // A word needs room; in a narrow column it becomes a dot.
    return (
      <>
        <span
          aria-hidden
          className="hidden h-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--fd-wash)] px-1.5 text-[10px] leading-none font-medium text-[var(--fd-ink)] @[180px]:inline-flex"
        >
          {value}
        </span>
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-[var(--fd-ink)] @[180px]:hidden"
        />
      </>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] leading-none font-medium",
        typeof value === "number"
          ? "min-w-[18px] bg-[var(--fd-ink)] font-mono text-background tabular-nums"
          : "bg-[var(--fd-wash)] text-[var(--fd-ink)]",
      )}
    >
      {typeof value === "number" && value > 99 ? "99+" : value}
    </span>
  );
}

function SectionBody({
  section,
  page,
  motionSafe,
  dense,
  onPage,
  onRetry,
  onKey,
  listRef,
  tabbable,
}: {
  section: FlyoutSection;
  page: string;
  motionSafe: boolean;
  dense: boolean;
  onPage: (p: FlyoutPage, viaKey: boolean) => void;
  onRetry?: (id: string) => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  listRef?: React.Ref<HTMLUListElement>;
  tabbable: string | null;
}) {
  const status = section.status ?? "ready";
  if (status === "loading") {
    return (
      <div aria-busy="true" className="flex flex-col gap-1 px-2 py-1.5">
        <span className="sr-only">{`Loading ${section.label}`}</span>
        {[72, 54, 64, 46].map((w, i) => (
          <span
            key={i}
            aria-hidden
            className="flex h-8 items-center gap-2.5 px-2"
          >
            <span className="size-4 shrink-0 rounded-1 bg-surface-2" />
            <span
              className="h-2.5 rounded-full bg-surface-2"
              style={{ width: `${w}%` }}
            />
          </span>
        ))}
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex flex-col items-start gap-2 px-4 py-4">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          Couldn’t load pages
        </span>
        <p className="text-[12px] leading-snug text-ink-3">
          {`${section.label} didn’t answer. Your other sections still work.`}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry(section.id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  if (section.pages.length === 0) {
    const Icon = ICONS[section.icon] ?? FileText;
    return (
      <div className="flex flex-col items-start gap-2 px-4 py-4">
        <span
          aria-hidden
          className="inline-flex size-9 items-center justify-center rounded-full border border-dashed border-hairline-strong text-ink-3"
        >
          <Icon className="size-4" />
        </span>
        <p className="text-[13px] font-medium text-foreground">
          {section.emptyTitle ?? "Nothing here yet"}
        </p>
        {section.emptyHint ? (
          <p className="text-[12px] leading-snug text-ink-3">
            {section.emptyHint}
          </p>
        ) : null}
      </div>
    );
  }
  const step = cascade(section.pages.length);
  return (
    <ul
      ref={listRef}
      aria-label={`${section.label} pages`}
      className="flex flex-col gap-0.5 px-1.5 py-1.5"
    >
      {section.pages.map((p, i) => {
        const Icon = ICONS[p.icon ?? "page"] ?? FileText;
        const current = p.id === page;
        return (
          <motion.li
            key={p.id}
            initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: { ...springs.glide, delay: i * step },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay: i * step,
              },
            }}
          >
            <button
              type="button"
              data-fd-page={p.id}
              aria-current={current ? "page" : undefined}
              aria-label={pageName(p)}
              tabIndex={tabbable === p.id ? 0 : -1}
              onClick={(event) => onPage(p, event.detail === 0)}
              onKeyDown={onKey}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-2 px-2 text-left text-[13px] transition-colors",
                dense ? "h-8" : "h-9",
                current
                  ? "bg-[var(--fd-wash)] font-medium text-foreground"
                  : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                FOCUS_IN,
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  current ? "text-[var(--fd-ink)]" : "text-ink-3",
                )}
              />
              <span className="min-w-0 flex-1 truncate" title={p.label}>
                {p.label}
              </span>
              <Badge value={p.badge} />
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}

function PageView({
  section,
  page,
  motionSafe,
}: {
  section: FlyoutSection | null;
  page: FlyoutPage | null;
  motionSafe: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={page?.id ?? "none"}
        className="absolute inset-0 flex flex-col"
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: {
            opacity: { duration: durations.base, ease: easings.enter },
            y: motionSafe ? springs.glide : { duration: 0 },
          },
        }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      >
        {page ? (
          <>
            <div className="flex flex-col gap-0.5 border-b border-hairline px-4 pt-3.5 pb-3">
              <p className="truncate text-[11px] text-ink-3">
                {`${section?.label ?? ""} / ${page.label}`}
              </p>
              <h3
                className="truncate text-[15px] leading-tight font-semibold text-foreground"
                title={page.label}
              >
                {page.label}
              </h3>
              {page.summary ? (
                <p className="truncate text-[12px] text-ink-3">
                  {page.summary}
                </p>
              ) : null}
            </div>
            {page.rows && page.rows.length > 0 ? (
              <ul className="flex flex-col overflow-hidden">
                {page.rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 text-[13px]"
                  >
                    <span className="min-w-0 truncate text-foreground">
                      {row.label}
                    </span>
                    {row.meta ? (
                      <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 tabular-nums @[200px]:inline">
                        {row.meta}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-[13px] text-ink-3">
                Nothing on this page yet.
              </p>
            )}
          </>
        ) : (
          <p className="px-4 py-4 text-[13px] text-ink-3">
            Choose a page from the rail.
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An admin rail whose sections fly their pages out beside it. Resting on a
 * section opens it after `intentDelay`, and every move that heads into the
 * open panel restarts that wait, so a diagonal sweep toward the panel never
 * switches section; the indicator leans toward the section under the
 * pointer while it waits and snaps across on `snap` when the switch commits.
 *
 * Pinning docks the panel as a second column: one `glide` spring drives a
 * single `--fd-dock` value that the panel's inset, radius and shadow and the
 * page's left edge all read, so the floating card settles into a flush
 * column as the page makes room, in one motion.
 *
 * Narrow containers (under 300px) trade the rail for drill-in screens:
 * sections, then pages, then the page, sliding in on `glide`. Under reduced
 * motion everything changes in place with short fades; badges, the current
 * page and the pinned column still show.
 */
export function FlyoutDock({
  sections = defaultFlyoutSections,
  page: pageProp,
  defaultPage,
  onNavigate,
  open: openProp,
  defaultOpen = null,
  onOpenChange,
  pinned: pinnedProp,
  defaultPinned = false,
  onPin,
  onUnpin,
  onRetry,
  flyoutWidth = 208,
  intentDelay = 140,
  closeDelay = 320,
  accent = "cobalt",
  brand = { name: "Coldbrook", initials: "Cb" },
  railLabels = true,
  frameHeight = 520,
  title = "Coldbrook admin",
  disabled = false,
  className,
}: FlyoutDockProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const panelId = `${uid}-panel`;
  const hintId = `${uid}-hint`;

  const firstPage = React.useMemo(() => {
    for (const s of sections) if (s.pages[0]) return s.pages[0].id;
    return "";
  }, [sections]);

  const [ownPage, setOwnPage] = React.useState(defaultPage ?? firstPage);
  const page = pageProp ?? ownPage;
  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpen);
  const openRaw = openProp !== undefined ? openProp : ownOpen;
  const open = sections.some((s) => s.id === openRaw) ? openRaw : null;
  const [ownPinned, setOwnPinned] = React.useState(defaultPinned);
  const pinned = pinnedProp ?? ownPinned;

  const sectionOfPage =
    sections.find((s) => s.pages.some((p) => p.id === page)) ?? null;
  const currentPage = sectionOfPage?.pages.find((p) => p.id === page) ?? null;
  const openSection = sections.find((s) => s.id === open) ?? null;
  const activeId = open ?? sectionOfPage?.id ?? null;
  const activeIndex = sections.findIndex((s) => s.id === activeId);
  const slot = railLabels ? 52 : 44;

  const [announcement, setAnnouncement] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);

  /* ------------------------------ open / pin ----------------------------- */

  const listNode = React.useRef<HTMLUListElement | null>(null);
  const wantFocus = React.useRef<string | null>(null);

  const changeOpen = (next: string | null) => {
    if (next === open) return;
    if (next === null) wantFocus.current = null;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
    const s = sections.find((x) => x.id === next);
    if (s) {
      const status = s.status ?? "ready";
      setAnnouncement(
        status === "loading"
          ? `${s.label}, loading.`
          : status === "error"
            ? `${s.label}, couldn’t load pages.`
            : s.pages.length === 0
              ? `${s.label}, ${(s.emptyTitle ?? "nothing here yet").toLowerCase()}.`
              : `${s.label}, ${plural(s.pages.length, "page", "pages")}.`,
      );
    }
  };

  const setPinnedTo = (next: boolean, sectionId: string | null) => {
    if (disabled || next === pinned || !sectionId) return;
    if (pinnedProp === undefined) setOwnPinned(next);
    const s = sections.find((x) => x.id === sectionId);
    if (next) {
      if (open !== sectionId) changeOpen(sectionId);
      onPin?.(sectionId);
      setAnnouncement(`${s?.label ?? "Panel"} pinned.`);
    } else {
      onUnpin?.(sectionId);
      setAnnouncement(`${s?.label ?? "Panel"} unpinned.`);
    }
  };

  const navigate = (p: FlyoutPage, sectionId: string) => {
    if (disabled) return;
    if (pageProp === undefined) setOwnPage(p.id);
    onNavigate?.(p.id, sectionId);
    setAnnouncement(`${p.label}.`);
  };

  /* --------------------------------- dock -------------------------------- */

  // One value, read by the panel's inset, radius, shadow and width and by
  // the page's left edge through CSS, so nothing can drift apart mid-move.
  const docked = pinned && openSection !== null;
  const dock = useMotionValue(docked ? 1 : 0);
  React.useEffect(() => {
    const to = docked ? 1 : 0;
    if (!motionSafe) {
      dock.jump(to);
      return;
    }
    const from = dock.get();
    if (from === to) return;
    const ctrl = animate(from, to, {
      ...springs.glide,
      velocity: dock.getVelocity(),
      onUpdate: (v) => dock.set(r3(v)),
    });
    return () => ctrl.stop();
  }, [docked, motionSafe, dock]);

  /* ------------------------------ indicator ------------------------------ */

  const barTop = useMotionValue(
    Math.max(0, activeIndex) * slot + (slot - 4 - BAR_H) / 2,
  );
  const barH = useMotionValue(BAR_H);
  const barAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const geom = React.useCallback(
    (i: number) => ({ top: r2(i * slot + (slot - 4 - BAR_H) / 2), h: BAR_H }),
    [slot],
  );
  const moveBar = React.useCallback(
    (to: { top: number; h: number }, how: "snap" | "flick" | "lean") => {
      barAnim.current?.stop();
      barAnim.current = null;
      if (!motionSafe) {
        if (how === "lean") return null;
        barTop.jump(to.top);
        barH.jump(to.h);
        return null;
      }
      const fromTop = barTop.get();
      const fromH = barH.get();
      barAnim.current = animate(0, 1, {
        ...(how === "snap"
          ? springs.snap
          : how === "flick"
            ? springs.flick
            : {
                duration: Math.max(0.05, intentDelay / 1000),
                ease: easings.linear,
              }),
        onUpdate: (t) => {
          barTop.set(r2(lerp(fromTop, to.top, t)));
          barH.set(r2(Math.max(4, lerp(fromH, to.h, t))));
        },
      });
      return barAnim.current;
    },
    [barH, barTop, intentDelay, motionSafe],
  );
  React.useEffect(() => {
    if (activeIndex < 0) return;
    const ctrl = moveBar(geom(activeIndex), "snap");
    return () => ctrl?.stop();
  }, [activeIndex, geom, moveBar]);

  /* ----------------------------- hover intent ---------------------------- */

  const intent = React.useRef<{
    timer: number;
    close: number;
    over: string | null;
    prev: Pt | null;
    last: Pt | null;
    pending: string | null;
  }>({ timer: 0, close: 0, over: null, prev: null, last: null, pending: null });
  const panelEl = React.useRef<HTMLDivElement | null>(null);
  const navEl = React.useRef<HTMLElement | null>(null);
  const railButtons = React.useRef(new Map<string, HTMLButtonElement>());

  // Timers call the newest handlers, never ones from an older render.
  const changeOpenRef = React.useRef(changeOpen);
  React.useEffect(() => {
    changeOpenRef.current = changeOpen;
  });

  React.useEffect(() => {
    const it = intent.current;
    return () => {
      window.clearTimeout(it.timer);
      window.clearTimeout(it.close);
    };
  }, []);

  const dropPending = (retract: boolean) => {
    const it = intent.current;
    window.clearTimeout(it.timer);
    it.timer = 0;
    if (it.pending) {
      it.pending = null;
      setPending(null);
      if (retract && activeIndex >= 0) moveBar(geom(activeIndex), "flick");
    }
  };

  /** Is the pointer's last step heading into the open panel? */
  const aimsAtPanel = (prev: Pt | null, cur: Pt | null) => {
    const rect = panelEl.current?.getBoundingClientRect();
    if (!rect || !prev || !cur || cur.x <= prev.x) return false;
    return inTriangle(
      cur,
      prev,
      { x: rect.left, y: rect.top - 8 },
      { x: rect.left, y: rect.bottom + 8 },
    );
  };

  const onSectionPointerMove = (
    s: FlyoutSection,
    event: React.PointerEvent,
  ) => {
    if (disabled || event.pointerType === "touch") return;
    const it = intent.current;
    it.prev = it.last;
    it.last = { x: event.clientX, y: event.clientY };
    it.over = s.id;
    // A pinned column never flickers under a passing pointer: only a press
    // or the keyboard switches it.
    if (pinned) return;
    if (open === s.id) {
      if (it.pending) dropPending(true);
      return;
    }
    const aiming = open !== null && aimsAtPanel(it.prev, it.last);
    if (it.pending === s.id && !aiming) return;
    window.clearTimeout(it.timer);
    if (it.pending !== s.id) {
      it.pending = s.id;
      setPending(s.id);
      const to = sections.findIndex((x) => x.id === s.id);
      if (activeIndex >= 0 && to >= 0) {
        const g = geom(activeIndex);
        const reach = Math.abs(to - activeIndex) * slot * LEAN;
        moveBar(
          to > activeIndex
            ? { top: g.top, h: g.h + reach }
            : { top: g.top - reach, h: g.h + reach },
          "lean",
        );
      }
    }
    it.timer = window.setTimeout(
      () => {
        it.timer = 0;
        const ok = it.over === s.id;
        it.pending = null;
        setPending(null);
        if (ok) changeOpenRef.current(s.id);
      },
      Math.max(0, intentDelay),
    );
  };

  const onSectionPointerLeave = (s: FlyoutSection) => {
    const it = intent.current;
    if (it.over === s.id) it.over = null;
  };

  const onNavPointerEnter = () => {
    window.clearTimeout(intent.current.close);
  };
  const onNavPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === "touch") return;
    const it = intent.current;
    it.over = null;
    dropPending(true);
    if (pinned || open === null) return;
    window.clearTimeout(it.close);
    it.close = window.setTimeout(() => {
      // A keyboard user's flyout stays while their focus is in it.
      const active = document.activeElement;
      if (
        active &&
        active.matches(":focus-visible") &&
        (panelEl.current?.contains(active) ||
          (open !== null && railButtons.current.get(open) === active))
      )
        return;
      changeOpenRef.current(null);
    }, closeDelay);
  };

  /* ------------------------------- keyboard ------------------------------ */

  const [listEl, setListEl] = React.useState<HTMLUListElement | null>(null);
  const bindList = React.useCallback((node: HTMLUListElement | null) => {
    if (!node) return;
    listNode.current = node;
    setListEl(node);
    return () => {
      if (listNode.current === node) listNode.current = null;
      setListEl((prev) => (prev === node ? null : prev));
    };
  }, []);

  const focusPage = (list: HTMLUListElement, which: string) => {
    const buttons = [
      ...list.querySelectorAll<HTMLButtonElement>("[data-fd-page]"),
    ];
    const target =
      buttons.find((b) => b.dataset.fdPage === which) ??
      buttons.find((b) => b.getAttribute("aria-current") === "page") ??
      buttons[0];
    target?.focus({ preventScroll: true });
  };

  // Focus asked for before the panel's list existed lands when it arrives.
  React.useEffect(() => {
    if (!listEl || !wantFocus.current) return;
    const which = wantFocus.current;
    wantFocus.current = null;
    focusPage(listEl, which);
  }, [listEl]);

  const enterPanel = (s: FlyoutSection) => {
    if (open !== s.id) changeOpen(s.id);
    // A loading, failed or empty section has no pages to step into.
    if ((s.status ?? "ready") !== "ready" || s.pages.length === 0) return;
    const list = listNode.current;
    if (list && open === s.id && list.isConnected) {
      focusPage(list, page);
    } else {
      wantFocus.current = page;
    }
  };

  const focusRail = (id: string | null) => {
    if (!id) return;
    const el = railButtons.current.get(id);
    if (el?.isConnected) el.focus({ preventScroll: true });
  };

  const onRailKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    s: FlyoutSection,
    i: number,
  ) => {
    if (disabled) return;
    const n = sections.length;
    let to = -1;
    if (event.key === "ArrowDown") to = (i + 1) % n;
    else if (event.key === "ArrowUp") to = (i - 1 + n) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to >= 0) {
      event.preventDefault();
      const target = sections[to];
      if (target) focusRail(target.id);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      enterPanel(s);
      return;
    }
    if (event.key === "Escape" && open !== null && !pinned) {
      event.preventDefault();
      event.stopPropagation();
      changeOpen(null);
      return;
    }
    if (
      (event.key === "p" || event.key === "P") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      setPinnedTo(!pinned, open ?? s.id);
    }
  };

  const onPanelKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !openSection) return;
    const list = listNode.current;
    const buttons = list
      ? [...list.querySelectorAll<HTMLButtonElement>("[data-fd-page]")]
      : [];
    const at = buttons.indexOf(event.currentTarget);
    const n = buttons.length;
    let to = -1;
    if (event.key === "ArrowDown" && n) to = (at + 1) % n;
    else if (event.key === "ArrowUp" && n) to = (at - 1 + n) % n;
    else if (event.key === "Home" && n) to = 0;
    else if (event.key === "End" && n) to = n - 1;
    if (to >= 0 && at >= 0) {
      event.preventDefault();
      buttons[to]?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusRail(openSection.id);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      focusRail(openSection.id);
      if (!pinned) changeOpen(null);
      return;
    }
    if (
      (event.key === "p" || event.key === "P") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      setPinnedTo(!pinned, openSection.id);
    }
  };

  const onNavBlur = (event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    // Focus left the navigation: an unpinned flyout goes with it, unless
    // the pointer is still resting on it.
    if (!pinned && open !== null && intent.current.over === null) {
      const nav = navEl.current;
      if (nav && nav.matches(":hover")) return;
      changeOpen(null);
    }
  };

  /* ------------------------------- drill-in ------------------------------ */

  const [pageView, setPageView] = React.useState(false);
  const level = open === null ? 0 : pageView ? 2 : 1;
  const [shownLevel, setShownLevel] = React.useState(level);
  const [drillDir, setDrillDir] = React.useState(1);
  if (shownLevel !== level) {
    setDrillDir(level > shownLevel ? 1 : -1);
    setShownLevel(level);
  }
  // What to focus when the next screen is in: the row you came back to,
  // else the current page, else the first row or Back. Looked up after the
  // commit by the screen's key, because a quick Back re-enters the screen
  // that was still leaving instead of mounting a new one.
  const arriveFocus = React.useRef<string | null>(null);
  const narrowEl = React.useRef<HTMLDivElement | null>(null);
  const screenKey = `${level}:${level === 0 ? "" : (open ?? "")}`;
  React.useEffect(() => {
    const want = arriveFocus.current;
    const root = narrowEl.current;
    if (want === null || !root) return;
    arriveFocus.current = null;
    const node = [
      ...root.querySelectorAll<HTMLElement>("[data-fd-screen]"),
    ].find((n) => n.dataset.fdScreen === screenKey);
    if (!node) return;
    const el =
      [...node.querySelectorAll<HTMLButtonElement>("[data-fd-id]")].find(
        (b) => want !== "" && b.dataset.fdId === want,
      ) ??
      node.querySelector<HTMLButtonElement>(
        '[data-fd-row][aria-current="page"]',
      ) ??
      node.querySelector<HTMLButtonElement>("[data-fd-row]") ??
      node.querySelector<HTMLButtonElement>("[data-fd-back]");
    el?.focus({ preventScroll: true });
  }, [screenKey]);

  const drillTo = (
    next: { open: string | null; page: boolean },
    focusId = "",
  ) => {
    arriveFocus.current = focusId;
    if (next.open !== open) changeOpen(next.open);
    setPageView(next.page);
  };

  const onDrillKey = (
    event: React.KeyboardEvent<HTMLElement>,
    forward: (() => void) | null,
    back: (() => void) | null,
  ) => {
    if (disabled) return;
    const container = event.currentTarget.closest("[data-fd-screen]");
    const buttons = container
      ? [...container.querySelectorAll<HTMLButtonElement>("[data-fd-row]")]
      : [];
    const at = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    const n = buttons.length;
    let to = -1;
    if (event.key === "ArrowDown" && n) to = at < 0 ? 0 : (at + 1) % n;
    else if (event.key === "ArrowUp" && n)
      to = at < 0 ? n - 1 : (at - 1 + n) % n;
    else if (event.key === "Home" && n) to = 0;
    else if (event.key === "End" && n) to = n - 1;
    if (to >= 0) {
      event.preventDefault();
      buttons[to]?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "ArrowRight" && forward) {
      event.preventDefault();
      forward();
      return;
    }
    if (
      (event.key === "ArrowLeft" ||
        event.key === "Escape" ||
        event.key === "Backspace") &&
      back
    ) {
      event.preventDefault();
      event.stopPropagation();
      back();
    }
  };

  /* -------------------------------- render ------------------------------- */

  const accentInk = Object.hasOwn(ACCENTS, accent)
    ? ACCENTS[accent as FlyoutDockAccent]
    : accent;
  const width = clamp(Math.round(flyoutWidth), 140, 320);
  const wFloat = `min(var(--fd-w), 100% - ${RAIL + 16}px)`;
  const wDock = `min(var(--fd-w), 100% - ${RAIL + MIN_PAGE}px)`;
  const [lastPanel, setLastPanel] = React.useState(open);
  const [switchDir, setSwitchDir] = React.useState(1);
  if (lastPanel !== open) {
    const from = sections.findIndex((s) => s.id === lastPanel);
    const to = sections.findIndex((s) => s.id === open);
    setSwitchDir(from >= 0 && to >= 0 && to < from ? -1 : 1);
    setLastPanel(open);
  }

  const rovingRail =
    activeId && sections.some((s) => s.id === activeId)
      ? activeId
      : (sections[0]?.id ?? null);
  const tabbablePage =
    openSection && openSection.pages.some((p) => p.id === page)
      ? page
      : (openSection?.pages[0]?.id ?? null);

  const screen = (() => {
    if (level === 0) {
      return (
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-4">
            <span
              aria-hidden
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-2 bg-foreground text-[11px] font-semibold text-background"
            >
              {brand.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] leading-tight font-semibold text-foreground">
                {brand.name}
              </p>
              <p className="text-[11px] text-ink-3">Admin</p>
            </div>
          </div>
          <ul
            aria-label="Sections"
            className="flex flex-col gap-0.5 overflow-y-auto p-1.5"
          >
            {sections.map((s) => {
              const Icon = ICONS[s.icon] ?? FileText;
              const n = sectionBadge(s);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    data-fd-row=""
                    data-fd-id={s.id}
                    disabled={disabled}
                    aria-label={sectionName(s)}
                    onClick={() => drillTo({ open: s.id, page: false })}
                    onKeyDown={(event) =>
                      onDrillKey(
                        event,
                        () => drillTo({ open: s.id, page: false }),
                        null,
                      )
                    }
                    className={cn(
                      "flex h-11 w-full items-center gap-3 rounded-2 px-2.5 text-left text-[14px] text-foreground hover:bg-surface-2",
                      FOCUS_IN,
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2",
                        s.id === sectionOfPage?.id
                          ? "text-[var(--fd-ink)]"
                          : "text-ink-2",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {n > 0 ? (
                      <Badge value={n} />
                    ) : hasWordBadge(s) ? (
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full bg-[var(--fd-ink)]"
                      />
                    ) : null}
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 text-ink-3"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
    if (level === 1 && openSection) {
      const back = () => drillTo({ open: null, page: false }, openSection.id);
      return (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 flex-col gap-1 border-b border-hairline px-2 pt-2 pb-2.5">
            <button
              type="button"
              data-fd-back=""
              onClick={back}
              onKeyDown={(event) => onDrillKey(event, null, back)}
              className={cn(
                "inline-flex h-8 w-fit items-center gap-1 rounded-2 pr-2.5 pl-1 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <ChevronLeft aria-hidden className="size-4" />
              {brand.name}
            </button>
            <p className="px-2 text-[15px] leading-tight font-semibold text-foreground">
              {openSection.label}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(openSection.status ?? "ready") === "ready" &&
            openSection.pages.length > 0 ? (
              <ul
                aria-label={`${openSection.label} pages`}
                className="flex flex-col gap-0.5 p-1.5"
              >
                {openSection.pages.map((p) => {
                  const Icon = ICONS[p.icon ?? "page"] ?? FileText;
                  const current = p.id === page;
                  const go = () => {
                    navigate(p, openSection.id);
                    drillTo({ open: openSection.id, page: true });
                  };
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        data-fd-row=""
                        data-fd-id={p.id}
                        disabled={disabled}
                        aria-current={current ? "page" : undefined}
                        aria-label={pageName(p)}
                        onClick={go}
                        onKeyDown={(event) => onDrillKey(event, go, back)}
                        className={cn(
                          "flex h-10 w-full items-center gap-3 rounded-2 px-2.5 text-left text-[14px]",
                          current
                            ? "bg-[var(--fd-wash)] font-medium text-foreground"
                            : "text-foreground hover:bg-surface-2",
                          FOCUS_IN,
                        )}
                      >
                        <Icon
                          aria-hidden
                          className={cn(
                            "size-4 shrink-0",
                            current ? "text-[var(--fd-ink)]" : "text-ink-3",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {p.label}
                        </span>
                        <Badge value={p.badge} />
                        <ChevronRight
                          aria-hidden
                          className="size-4 shrink-0 text-ink-3"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <SectionBody
                section={openSection}
                page={page}
                motionSafe={motionSafe}
                dense={false}
                onPage={() => {}}
                onRetry={onRetry}
                onKey={() => {}}
                tabbable={null}
              />
            )}
          </div>
        </div>
      );
    }
    const back = () => drillTo({ open, page: false }, page);
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-hairline px-2 pt-2">
          <button
            type="button"
            data-fd-back=""
            onClick={back}
            onKeyDown={(event) => onDrillKey(event, null, back)}
            className={cn(
              "inline-flex h-8 w-fit items-center gap-1 rounded-2 pr-2.5 pl-1 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <ChevronLeft aria-hidden className="size-4" />
            {openSection?.label ?? brand.name}
          </button>
        </div>
        <div className="@container relative flex-1 overflow-hidden">
          <PageView
            section={sectionOfPage}
            page={currentPage}
            motionSafe={motionSafe}
          />
        </div>
      </div>
    );
  })();

  const screenVariants = {
    enter: (d: number | undefined) =>
      motionSafe
        ? { x: (d ?? 1) > 0 ? "100%" : "-25%", opacity: (d ?? 1) > 0 ? 1 : 0.5 }
        : { x: "0%", opacity: 0 },
    center: { x: "0%", opacity: 1 },
    leave: (d: number | undefined) =>
      motionSafe
        ? { x: (d ?? 1) > 0 ? "-25%" : "100%", opacity: (d ?? 1) > 0 ? 0.5 : 1 }
        : { x: "0%", opacity: 0 },
  };

  return (
    <motion.div
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={
        {
          height: frameHeight,
          "--fd-dock": dock,
          "--fd-w": `${width}px`,
          "--fd-ink": accentInk,
          "--fd-wash": "color-mix(in oklab, var(--fd-ink) 13%, transparent)",
          "--fd-soft": "color-mix(in oklab, var(--fd-ink) 45%, transparent)",
        } as React.ComponentProps<typeof motion.div>["style"]
      }
    >
      <p id={hintId} className="sr-only">
        Up and Down move along the sections and open each one. Right moves into
        its pages, Left comes back, P pins the panel as a column, Escape closes
        it.
      </p>

      {/* Wide: the rail, its flyout and the page. */}
      <div className="absolute inset-0 hidden @[300px]:block">
        <nav
          ref={navEl}
          aria-label={title}
          onPointerEnter={onNavPointerEnter}
          onPointerLeave={onNavPointerLeave}
          onBlur={onNavBlur}
        >
          <div
            className="absolute inset-y-0 left-0 z-[3] flex flex-col items-center border-r border-hairline bg-surface-1 py-2"
            style={{ width: RAIL }}
          >
            <span
              aria-hidden
              title={brand.name}
              className="mb-3 inline-flex size-8 shrink-0 items-center justify-center rounded-2 bg-foreground text-[11px] font-semibold text-background"
            >
              {brand.initials}
            </span>
            <div className="relative flex flex-col items-center gap-1">
              {activeIndex >= 0 ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute -left-1.5 w-[3px] rounded-r-full bg-[var(--fd-ink)]"
                  style={{ top: barTop, height: barH }}
                />
              ) : null}
              {sections.map((s, i) => {
                const Icon = ICONS[s.icon] ?? FileText;
                const isOpen = s.id === open;
                const isActive = s.id === activeId;
                const armed = pending === s.id;
                const n = sectionBadge(s);
                return (
                  <button
                    key={s.id}
                    ref={(el) => {
                      if (el) railButtons.current.set(s.id, el);
                      else railButtons.current.delete(s.id);
                    }}
                    type="button"
                    disabled={disabled}
                    aria-label={sectionName(s)}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? panelId : undefined}
                    aria-keyshortcuts="P"
                    aria-describedby={hintId}
                    tabIndex={s.id === rovingRail ? 0 : -1}
                    title={s.label}
                    onPointerMove={(event) => onSectionPointerMove(s, event)}
                    onPointerLeave={() => onSectionPointerLeave(s)}
                    onFocus={(event) => {
                      // The keyboard has no diagonal to forgive: focus opens.
                      if (
                        !disabled &&
                        event.currentTarget.matches(":focus-visible") &&
                        open !== s.id
                      ) {
                        dropPending(false);
                        changeOpen(s.id);
                      }
                    }}
                    onClick={(event) => {
                      dropPending(false);
                      if (event.detail === 0) {
                        enterPanel(s);
                        return;
                      }
                      if (open === s.id && !pinned) changeOpen(null);
                      else changeOpen(s.id);
                    }}
                    onKeyDown={(event) => onRailKey(event, s, i)}
                    className={cn(
                      "relative flex w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-3 transition-[background-color,color,box-shadow] duration-150",
                      isActive
                        ? "bg-[var(--fd-wash)] text-foreground"
                        : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      FOCUS,
                    )}
                    style={{
                      height: slot - 4,
                      boxShadow: armed
                        ? "inset 0 0 0 1px var(--fd-soft)"
                        : "inset 0 0 0 1px transparent",
                    }}
                  >
                    <Icon
                      aria-hidden
                      className={cn(
                        "size-[18px] shrink-0",
                        isActive && "text-[var(--fd-ink)]",
                      )}
                    />
                    {railLabels ? (
                      <span className="max-w-full truncate px-0.5 text-[10px] leading-none font-medium">
                        {s.railLabel ?? s.label}
                      </span>
                    ) : null}
                    {n > 0 ? (
                      <span
                        aria-hidden
                        className="absolute top-0.5 right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-surface-1 bg-[var(--fd-ink)] px-1 font-mono text-[9px] leading-none text-background tabular-nums"
                      >
                        {n > 9 ? "9+" : n}
                      </span>
                    ) : hasWordBadge(s) ? (
                      <span
                        aria-hidden
                        className="absolute top-1.5 right-2 size-1.5 rounded-full bg-[var(--fd-ink)]"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {openSection ? (
              <motion.div
                key="panel"
                ref={panelEl}
                id={panelId}
                role="region"
                aria-label={`${openSection.label} pages`}
                onPointerEnter={() => dropPending(true)}
                className="absolute z-[2]"
                style={{
                  top: "calc((1 - var(--fd-dock)) * 7px - 1px)",
                  bottom: "calc((1 - var(--fd-dock)) * 7px - 1px)",
                  left: `calc(${RAIL - 1}px + (1 - var(--fd-dock)) * 7px)`,
                  width: `calc(${wFloat} * (1 - var(--fd-dock)) + ${wDock} * var(--fd-dock))`,
                  borderRadius: "calc((1 - var(--fd-dock)) * 12px)",
                }}
                initial={{ opacity: 0, x: motionSafe ? -distances.shift : 0 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: {
                    x: motionSafe ? springs.glide : { duration: 0 },
                    opacity: {
                      duration: motionSafe ? durations.base : durations.fast,
                      ease: easings.enter,
                    },
                  },
                }}
                exit={{
                  opacity: 0,
                  x: motionSafe ? -distances.step : 0,
                  transition: exitFor(durations.base),
                }}
              >
                {/* The floating shadow fades as the panel docks. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[0_14px_32px_-6px_color-mix(in_oklab,var(--foreground)_22%,transparent),0_2px_6px_color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                  style={{ opacity: "calc(1 - var(--fd-dock))" }}
                />
                <div className="@container relative flex h-full flex-col overflow-hidden rounded-[inherit] border border-hairline-strong bg-popover">
                  <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline pr-2 pl-3.5">
                    <div className="grid min-w-0 flex-1">
                      <AnimatePresence initial={false} custom={switchDir}>
                        <motion.div
                          key={openSection.id}
                          custom={switchDir}
                          className="min-w-0 [grid-area:1/1]"
                          initial={{
                            opacity: 0,
                            y: motionSafe ? switchDir * distances.step : 0,
                          }}
                          animate={{
                            opacity: 1,
                            y: 0,
                            transition: {
                              y: motionSafe ? springs.glide : { duration: 0 },
                              opacity: {
                                duration: durations.base,
                                ease: easings.enter,
                              },
                            },
                          }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.blink),
                          }}
                        >
                          <p className="truncate text-[13px] leading-tight font-semibold text-foreground">
                            {openSection.label}
                          </p>
                          <p className="truncate font-mono text-[10px] tracking-[0.04em] text-ink-3 uppercase">
                            {pinned
                              ? "Pinned"
                              : (openSection.status ?? "ready") === "loading"
                                ? "Loading"
                                : (openSection.status ?? "ready") === "error"
                                  ? "Offline"
                                  : plural(
                                      openSection.pages.length,
                                      "page",
                                      "pages",
                                    )}
                          </p>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={pinned}
                      aria-label={
                        pinned
                          ? `Unpin ${openSection.label}`
                          : `Pin ${openSection.label} as a column`
                      }
                      aria-keyshortcuts="P"
                      title={pinned ? "Unpin (P)" : "Pin (P)"}
                      onClick={() => setPinnedTo(!pinned, openSection.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          focusRail(openSection.id);
                          if (!pinned) changeOpen(null);
                        } else if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          focusRail(openSection.id);
                        }
                      }}
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-2 transition-colors",
                        pinned
                          ? "bg-[var(--fd-wash)] text-[var(--fd-ink)]"
                          : "text-ink-3 hover:bg-surface-2 hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      <motion.span
                        aria-hidden
                        className="inline-flex"
                        initial={false}
                        animate={{ rotate: pinned ? 0 : 45 }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      >
                        <Pin className="size-3.5" />
                      </motion.span>
                    </button>
                  </div>
                  <div className="relative grid flex-1 overflow-y-auto">
                    <AnimatePresence initial={false} custom={switchDir}>
                      <motion.div
                        key={openSection.id}
                        custom={switchDir}
                        className="min-w-0 [grid-area:1/1]"
                        initial={{
                          opacity: 0,
                          y: motionSafe ? switchDir * distances.step : 0,
                        }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          transition: {
                            y: motionSafe ? springs.glide : { duration: 0 },
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          },
                        }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.blink),
                        }}
                      >
                        <SectionBody
                          section={openSection}
                          page={page}
                          motionSafe={motionSafe}
                          dense
                          tabbable={tabbablePage}
                          listRef={bindList}
                          onRetry={onRetry}
                          onKey={onPanelKey}
                          onPage={(p, viaKey) => {
                            navigate(p, openSection.id);
                            if (!pinned) {
                              if (viaKey) focusRail(openSection.id);
                              changeOpen(null);
                            }
                          }}
                        />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </nav>

        <div
          role="region"
          aria-label={currentPage ? `${currentPage.label} page` : "Page"}
          className="@container absolute inset-y-0 right-0 z-[1] overflow-hidden bg-card"
          style={{
            left: `calc(${RAIL}px + var(--fd-dock) * ${wDock})`,
          }}
        >
          <PageView
            section={sectionOfPage}
            page={currentPage}
            motionSafe={motionSafe}
          />
          {/* A floating panel sits over the page; the veil says so. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[1] bg-card"
            initial={false}
            animate={{ opacity: openSection && !pinned ? 0.5 : 0 }}
            transition={{ duration: durations.base, ease: easings.move }}
          />
        </div>
      </div>

      {/* Narrow: drill-in screens. */}
      <div
        ref={narrowEl}
        className="absolute inset-0 overflow-hidden @[300px]:hidden"
      >
        <AnimatePresence initial={false} custom={drillDir}>
          <motion.div
            key={screenKey}
            data-fd-screen={screenKey}
            custom={drillDir}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="leave"
            transition={{
              x: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.move },
            }}
            className="absolute inset-0 bg-card"
            style={{ zIndex: level + 1 }}
          >
            {screen}
          </motion.div>
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </motion.div>
  );
}
