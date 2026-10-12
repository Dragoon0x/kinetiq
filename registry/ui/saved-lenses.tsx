"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  Check,
  Inbox,
  Plus,
  RotateCcw,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

/** One chip: a field and the value it must hold. */
export type LensFilter = { field: string; value: string };

export type LensView = {
  id: string;
  name: string;
  filters: LensFilter[];
};

export type LensField = {
  id: string;
  label: string;
  /** "due" reads the row's due date against `now`; its values are "overdue", "today" and "week". @default "enum" */
  kind?: "enum" | "due";
  options: { value: string; label: string }[];
};

export type LensRow = {
  id: string;
  code: string;
  title: string;
  /** Due date, ms. */
  due: number;
  [field: string]: string | number;
};

export type LensStatus = "ready" | "loading" | "error";
export type LensTabStyle = "underline" | "pill" | "boxed";
export type LensChipStyle = "soft" | "outline" | "solid";

export type SavedLensesProps = {
  /** Seeds the saved views; the surface owns saves after that and reports them. @default defaultLensViews */
  views?: LensView[];
  /** The records each view filters. @default defaultLensRows (36 tickets) */
  rows?: LensRow[];
  /** The filterable fields and their values, offered by "Filter". @default defaultLensFields */
  fields?: LensField[];
  /** Controlled active view id. */
  value?: string;
  /** Initial view when uncontrolled. @default the first view */
  defaultValue?: string;
  /** Fires with the new view id from the tab, arrow or digit that chose it. */
  onValueChange?: (id: string) => void;
  /** Fires with the view switched to (with any unsaved edits) and the one left. */
  onViewChange?: (view: LensView, previous: LensView | null) => void;
  /** Fires from Save (`asNew` false) or Save as new (`asNew` true) with the saved view. */
  onSaveView?: (view: LensView, options: { asNew: boolean }) => void;
  /** Fires from Revert with the view whose edits were dropped. */
  onRevert?: (viewId: string) => void;
  /** Whether the active view's results have arrived. @default "ready" */
  status?: LensStatus;
  /** "Try again" was pressed on a failed view. */
  onRetry?: () => void;
  /** How the active tab is marked: an underline, a pill, or a raised box. @default "underline" */
  tabStyle?: LensTabStyle;
  /** Chip look: a soft wash, a hairline outline, or a solid fill. @default "soft" */
  chipStyle?: LensChipStyle;
  /** Corner radius of chips, tabs, menus and buttons, px. @default 8 */
  cornerRadius?: number;
  /** The tab mark, chips and Save, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Today, ms, for due dates. @default defaultLensNow */
  now?: number;
  /** Whose queue this is: an assignee chip with this value reads "Me". @default "Ines Park" */
  me?: string;
  /** The heading over the views. @default "Support queue" */
  title?: string;
  /** Height of the surface, px; the results scroll inside it. @default 520 */
  height?: number;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Today on the seeded desk: 12 October 2026, 09:00. */
export const defaultLensNow = Date.UTC(2026, 9, 12, 9);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE = ["Ines Park", "Tomas Reyes", "Ada Moreau", "Kofi Mensah"];
const ACCOUNTS = ["Fernworks", "Coldbrook", "Basinworks", "Fieldline"];

export const defaultLensFields: LensField[] = [
  {
    id: "status",
    label: "Status",
    options: [
      { value: "open", label: "Open" },
      { value: "vendor", label: "Waiting on vendor" },
      { value: "customer", label: "Waiting on customer" },
      { value: "resolved", label: "Resolved" },
    ],
  },
  {
    id: "assignee",
    label: "Assignee",
    options: PEOPLE.map((p) => ({ value: p, label: p })),
  },
  {
    id: "account",
    label: "Account",
    options: ACCOUNTS.map((a) => ({ value: a, label: a })),
  },
  {
    id: "priority",
    label: "Priority",
    options: [
      { value: "urgent", label: "Urgent" },
      { value: "high", label: "High" },
      { value: "normal", label: "Normal" },
      { value: "low", label: "Low" },
    ],
  },
  {
    id: "due",
    label: "Due",
    kind: "due",
    options: [
      { value: "overdue", label: "Overdue" },
      { value: "today", label: "Today" },
      { value: "week", label: "This week" },
    ],
  },
];

export const defaultLensViews: LensView[] = [
  {
    id: "mine",
    name: "My open",
    filters: [
      { field: "status", value: "open" },
      { field: "assignee", value: "Ines Park" },
    ],
  },
  {
    id: "fernworks",
    name: "Overdue at Fernworks",
    filters: [
      { field: "status", value: "open" },
      { field: "account", value: "Fernworks" },
      { field: "due", value: "overdue" },
    ],
  },
  {
    id: "vendor",
    name: "Waiting on vendor",
    filters: [
      { field: "status", value: "vendor" },
      { field: "assignee", value: "Ines Park" },
    ],
  },
  {
    id: "urgent",
    name: "Urgent this week",
    filters: [
      { field: "status", value: "open" },
      { field: "priority", value: "urgent" },
      { field: "due", value: "week" },
    ],
  },
];

const SUBJECTS = [
  "Export stalls at 90%",
  "Invoice totals off by a cent",
  "Gauge sync drops overnight",
  "SSO login loops",
  "Webhook retries flood the log",
  "CSV import skips headers",
  "Dashboard shows last week",
  "Alert emails arrive twice",
  "Roles reset after update",
  "Map tiles fail to load",
  "Report PDF cuts the footer",
  "API key rotation fails",
  "Audit log missing exports",
  "Timezone shifts due dates",
  "Bulk edit times out",
  "Search ignores accents",
  "Mobile app logs out hourly",
  "Billing contact not saved",
];

function makeRows(): LensRow[] {
  const rand = mulberry32(1636);
  const rows: LensRow[] = [];
  for (let i = 0; i < 36; i += 1) {
    const st = rand();
    const status =
      st < 0.5
        ? "open"
        : st < 0.68
          ? "vendor"
          : st < 0.82
            ? "customer"
            : "resolved";
    const pr = rand();
    rows.push({
      id: `t-${i}`,
      code: `SUP-${400 + i * 3 + (i % 3)}`,
      title: SUBJECTS[(i * 7) % SUBJECTS.length] ?? "",
      account: ACCOUNTS[Math.floor(rand() * ACCOUNTS.length)] ?? "Fernworks",
      assignee: PEOPLE[Math.floor(rand() * 2.6)] ?? "Ines Park",
      status,
      priority:
        pr < 0.18
          ? "urgent"
          : pr < 0.45
            ? "high"
            : pr < 0.85
              ? "normal"
              : "low",
      due:
        Math.floor(defaultLensNow / DAY_MS) * DAY_MS +
        (Math.round(rand() * 16) - 6) * DAY_MS,
    });
  }
  return rows.sort((a, b) => a.due - b.due);
}

/** Thirty-six support tickets across four accounts, soonest due first. */
export const defaultLensRows: LensRow[] = makeRows();

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
/** Inset, for tabs inside the scrolling strip that would clip an outer ring. */
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const exitTransition = { duration: durations.fast, ease: easings.exit };

const keyOf = (f: LensFilter) => `${f.field}=${f.value}`;

function holds(
  row: LensRow,
  f: LensFilter,
  fields: LensField[],
  now: number,
): boolean {
  const field = fields.find((x) => x.id === f.field);
  if (field?.kind === "due") {
    if (row.status === "resolved") return false;
    const today = Math.floor(now / DAY_MS) * DAY_MS;
    const due = Number(row.due);
    if (f.value === "overdue") return due < today;
    if (f.value === "today") return due >= today && due < today + DAY_MS;
    if (f.value === "week") return due >= today && due < today + 7 * DAY_MS;
    return true;
  }
  return String(row[f.field] ?? "") === f.value;
}

function dueWords(now: number, due: number): { text: string; late: boolean } {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const days = Math.round((due - today) / DAY_MS);
  if (days === 0) return { text: "due today", late: false };
  if (days < 0) return { text: `${-days}d overdue`, late: true };
  return { text: `due in ${days}d`, late: false };
}

/**
 * The chip order for a view switch that keeps every chip the two views share
 * in its slot: arriving chips take the slots departing ones leave, in the new
 * view's order, and any left over go on the end.
 */
function arrange(previous: string[], next: string[]): string[] {
  const wanted = new Set(next);
  const arriving = next.filter((k) => !previous.includes(k));
  const out: string[] = [];
  for (const k of previous) {
    if (wanted.has(k)) out.push(k);
    else {
      const a = arriving.shift();
      if (a) out.push(a);
    }
  }
  return [...out, ...arriving];
}

const STATUS_DOT: Record<string, string> = {
  open: "bg-(--sl-accent)",
  vendor: "bg-warn",
  customer: "bg-ink-3",
  resolved: "bg-success",
};
const PRIORITY_TEXT: Record<string, string> = {
  urgent: "text-danger",
  high: "text-warn",
  normal: "text-ink-3",
  low: "text-ink-3",
};

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/**
 * Saved views over a chip bar and a results list. Switching views is a shared
 * element move: chips the two views have in common are the same elements and
 * keep their slots, the ones that differ slide out (exit ease) and in (`snap`,
 * a `cascade()` apart), arriving chips take the slots departing ones leave,
 * and only when a replaced chip is a different width do later chips glide by
 * the difference on `glide`. The tab mark slides on `snap`.
 *
 * Removing a chip or adding one from Filter makes a draft: its tab earns a
 * modified dot (in on `snap`) and Save, Save as new and Revert slide in on
 * `glide`. Views are a tablist — arrows and Home/End move and select, digits
 * 1–9 pick a view from anywhere in the surface — and narrow surfaces turn the
 * tabs into a scrolling strip with a fade on whichever edge has more.
 */
export function SavedLenses({
  views: viewsProp = defaultLensViews,
  rows = defaultLensRows,
  fields = defaultLensFields,
  value,
  defaultValue,
  onValueChange,
  onViewChange,
  onSaveView,
  onRevert,
  status = "ready",
  onRetry,
  tabStyle = "underline",
  chipStyle = "soft",
  cornerRadius = 8,
  accent = "var(--accent-bright)",
  now = defaultLensNow,
  me = "Ines Park",
  title = "Support queue",
  height = 520,
  disabled = false,
  className,
}: SavedLensesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const panelId = `${uid}-panel`;

  const [views, setViews] = React.useState<LensView[]>(viewsProp);
  const [own, setOwn] = React.useState(defaultValue ?? viewsProp[0]?.id ?? "");
  const activeId =
    value !== undefined && views.some((v) => v.id === value)
      ? value
      : views.some((v) => v.id === own)
        ? own
        : (views[0]?.id ?? "");
  const [drafts, setDrafts] = React.useState<Record<string, LensFilter[]>>({});
  const [order, setOrder] = React.useState<string[]>(
    () =>
      (
        viewsProp.find((v) => v.id === (defaultValue ?? value)) ?? viewsProp[0]
      )?.filters.map(keyOf) ?? [],
  );
  const [arrivals, setArrivals] = React.useState<string[]>([]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [naming, setNaming] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  const active = views.find((v) => v.id === activeId) ?? views[0];
  const filtersOf = React.useCallback(
    (id: string) => drafts[id] ?? views.find((v) => v.id === id)?.filters ?? [],
    [drafts, views],
  );
  const current = React.useMemo(
    () => (active ? filtersOf(active.id) : []),
    [active, filtersOf],
  );
  const edited = active ? drafts[active.id] !== undefined : false;

  // The chips on show, in the slot order the last switch arranged; a chip the
  // order does not know yet (a fresh edit) goes on the end.
  const shownKeys = [
    ...order.filter((k) => current.some((f) => keyOf(f) === k)),
    ...current.map(keyOf).filter((k) => !order.includes(k)),
  ];
  const byKey = new Map(current.map((f) => [keyOf(f), f]));

  const results = React.useMemo(
    () =>
      rows.filter((row) => current.every((f) => holds(row, f, fields, now))),
    [current, fields, now, rows],
  );

  const fieldOf = (id: string) => fields.find((f) => f.id === id);
  const labelOf = (f: LensFilter) => {
    if (f.field === "assignee" && f.value === me) return "Me";
    return (
      fieldOf(f.field)?.options.find((o) => o.value === f.value)?.label ??
      f.value
    );
  };
  const chipName = (f: LensFilter) =>
    `${fieldOf(f.field)?.label ?? f.field} is ${labelOf(f)}`;
  const countFor = (filters: LensFilter[]) =>
    rows.filter((row) => filters.every((f) => holds(row, f, fields, now)))
      .length;

  /* ------------------------------ views --------------------------------- */

  const select = (id: string) => {
    if (disabled || !active || id === active.id) return;
    const next = views.find((v) => v.id === id);
    if (!next) return;
    const nextFilters = filtersOf(id);
    const nextKeys = nextFilters.map(keyOf);
    const arranged = arrange(shownKeys, nextKeys);
    const kept = nextKeys.filter((k) => shownKeys.includes(k));
    setOrder(arranged);
    setArrivals(nextKeys.filter((k) => !shownKeys.includes(k)));
    if (value === undefined) setOwn(id);
    setMenuOpen(false);
    setNaming(null);
    onValueChange?.(id);
    onViewChange?.(
      { ...next, filters: nextFilters },
      {
        ...active,
        filters: current,
      },
    );
    const n = countFor(nextFilters);
    setAnnouncement(
      `${next.name}. ${n} ${n === 1 ? "ticket" : "tickets"}. ${kept.length} ${
        kept.length === 1 ? "filter" : "filters"
      } kept.`,
    );
  };

  const focusTab = (id: string) => {
    const node = tabRefs.current.get(id);
    node?.focus();
    // Keep the chosen tab in view in a scrolling strip, without moving the page.
    const strip = stripRef.current;
    if (node && strip) {
      const left = node.offsetLeft - 24;
      const right = node.offsetLeft + node.offsetWidth + 24 - strip.clientWidth;
      if (strip.scrollLeft > left) strip.scrollTo({ left, behavior: "smooth" });
      else if (strip.scrollLeft < right) {
        strip.scrollTo({ left: right, behavior: "smooth" });
      }
    }
  };

  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const n = views.length;
    let to = -1;
    if (event.key === "ArrowRight") to = (index + 1) % n;
    else if (event.key === "ArrowLeft") to = (index - 1 + n) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    const target = views[to];
    if (!target) return;
    event.preventDefault();
    select(target.id);
    focusTab(target.id);
  };

  // Digits pick a view from anywhere in the surface, except while typing.
  const onRootKeyDown = (event: React.KeyboardEvent) => {
    const t = event.target as HTMLElement;
    if (
      t.tagName === "INPUT" ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    if (!/^[1-9]$/.test(event.key)) return;
    const target = views[Number(event.key) - 1];
    if (!target) return;
    event.preventDefault();
    select(target.id);
    focusTab(target.id);
  };

  /* ------------------------------ edits --------------------------------- */

  const setDraft = (filters: LensFilter[]) => {
    if (!active) return;
    const saved = active.filters.map(keyOf).join("|");
    const same = filters.map(keyOf).join("|") === saved;
    setDrafts((d) => {
      const next = { ...d };
      if (same) delete next[active.id];
      else next[active.id] = filters;
      return next;
    });
    setArrivals([]);
  };

  const removeChip = (key: string) => {
    if (disabled) return;
    const f = byKey.get(key);
    setDraft(current.filter((x) => keyOf(x) !== key));
    if (f) setAnnouncement(`Removed ${chipName(f)}. View edited.`);
  };

  const addChip = (f: LensFilter) => {
    if (disabled) return;
    // One value per field: a new value for a field replaces the old chip in
    // its slot.
    const old = current.find((x) => x.field === f.field);
    if (old) {
      setOrder((o) => o.map((k) => (k === keyOf(old) ? keyOf(f) : k)));
    }
    setDraft([...current.filter((x) => x.field !== f.field), f]);
    setArrivals([keyOf(f)]);
    setMenuOpen(false);
    menuButtonRef.current?.focus();
    setAnnouncement(`Added ${chipName(f)}. View edited.`);
  };

  const save = () => {
    if (!active || !edited) return;
    const saved = { ...active, filters: current };
    setViews((vs) => vs.map((v) => (v.id === active.id ? saved : v)));
    setDrafts((d) => {
      const next = { ...d };
      delete next[active.id];
      return next;
    });
    onSaveView?.(saved, { asNew: false });
    setAnnouncement(`Saved ${active.name}.`);
  };

  const saveAsNew = (name: string) => {
    if (!active) return;
    const clean = name.trim() || `${active.name} copy`;
    let id = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    while (views.some((v) => v.id === id)) id = `${id}-2`;
    const view: LensView = { id, name: clean, filters: current };
    setViews((vs) => [...vs, view]);
    setDrafts((d) => {
      const next = { ...d };
      delete next[active.id];
      return next;
    });
    if (value === undefined) setOwn(id);
    setNaming(null);
    onSaveView?.(view, { asNew: true });
    onValueChange?.(id);
    onViewChange?.(view, { ...active, filters: active.filters });
    setAnnouncement(`Saved as ${clean}.`);
    requestAnimationFrame(() => focusTab(id));
  };

  const revert = () => {
    if (!active || !edited) return;
    const keys = active.filters.map(keyOf);
    setOrder(arrange(shownKeys, keys));
    setArrivals(keys.filter((k) => !shownKeys.includes(k)));
    setDrafts((d) => {
      const next = { ...d };
      delete next[active.id];
      return next;
    });
    onRevert?.(active.id);
    setAnnouncement(`Reverted ${active.name}.`);
  };

  /* ------------------------------ menu ---------------------------------- */

  const menuItems = fields.flatMap((field) =>
    field.options
      .filter(
        (o) =>
          !current.some((f) => f.field === field.id && f.value === o.value),
      )
      .map((o) => ({ field, option: o })),
  );

  const focusMenuItem = (by: number | "first" | "last") => {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ) ?? []),
    ];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const to =
      by === "first"
        ? 0
        : by === "last"
          ? items.length - 1
          : (at + by + items.length) % items.length;
    items[to]?.focus();
  };

  const bindMenu = React.useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
  }, []);

  // The menu takes focus whenever it opens — also when it reopens while its
  // last exit is still fading and the same node comes back.
  React.useEffect(() => {
    if (!menuOpen) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    const b = menuButtonRef.current;
    if (b?.isConnected) b.focus();
  };

  const bindName = React.useCallback((node: HTMLInputElement | null) => {
    nameRef.current = node;
    node?.focus();
  }, []);

  /* ------------------------------ strip fades --------------------------- */

  const fadeL = useMotionValue(0);
  const fadeR = useMotionValue(0);
  const maskL = useTransform(fadeL, (v) => `${Math.round(v)}px`);
  const maskR = useTransform(fadeR, (v) => `${Math.round(v)}px`);
  const measureStrip = React.useCallback(() => {
    const s = stripRef.current;
    if (!s) return;
    fadeL.set(Math.min(28, s.scrollLeft));
    fadeR.set(Math.min(28, s.scrollWidth - s.clientWidth - s.scrollLeft));
  }, [fadeL, fadeR]);
  React.useEffect(() => {
    const s = stripRef.current;
    if (!s) return;
    measureStrip();
    const ro = new ResizeObserver(measureStrip);
    ro.observe(s);
    return () => ro.disconnect();
  }, [measureStrip, views.length]);

  /* ------------------------------ render -------------------------------- */

  const radius = `${Math.max(0, Math.min(16, cornerRadius))}px`;
  const step = cascade(Math.max(2, arrivals.length));
  const listStep = cascade(Math.min(results.length, 10));

  const chipClass: Record<LensChipStyle, string> = {
    soft: "bg-[color-mix(in_oklab,var(--sl-accent)_12%,transparent)] text-foreground enabled:hover:bg-[color-mix(in_oklab,var(--sl-accent)_20%,transparent)]",
    outline:
      "border border-hairline-strong bg-card text-foreground enabled:hover:border-[color-mix(in_oklab,var(--sl-accent)_60%,transparent)]",
    solid:
      "bg-(--sl-accent) text-background enabled:hover:bg-[color-mix(in_oklab,var(--sl-accent)_86%,var(--foreground))]",
  };

  const actionButton = cn(
    "inline-flex h-7 shrink-0 items-center gap-1 rounded-(--sl-r) border border-hairline px-2 text-[12px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
    FOCUS_RING,
  );

  const panel = () => {
    if (status === "loading") {
      return (
        <ul aria-busy="true" aria-label="Loading tickets">
          {Array.from({ length: 6 }, (_, i) => (
            <li
              key={i}
              aria-hidden
              className="flex items-center gap-3 border-b border-hairline px-4 py-3"
            >
              <span className="size-2 rounded-full bg-surface-2" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span
                  className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ width: `${46 + ((i * 23) % 36)}%` }}
                />
                <span
                  className="h-2 rounded-full bg-surface-2"
                  style={{ width: `${26 + ((i * 13) % 24)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <TriangleAlert aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">This view did not load.</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className={actionButton}>
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (results.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">No tickets in this view.</p>
          {current.length > 0 ? (
            <p className="text-xs text-ink-3">
              Remove a chip above to widen it.
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <ul
        role="list"
        aria-label={`${active?.name ?? ""} tickets`}
        className="relative"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {results.map((row, index) => {
            const due = dueWords(now, Number(row.due));
            const st = String(row.status);
            return (
              <motion.li
                key={row.id}
                layout={motionSafe ? "position" : false}
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitTransition }}
                transition={{
                  layout: motionSafe ? springs.glide : { duration: 0 },
                  y: motionSafe
                    ? {
                        ...springs.glide,
                        delay: Math.min(index, 10) * listStep,
                      }
                    : { duration: 0 },
                  opacity: {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: motionSafe ? Math.min(index, 10) * listStep : 0,
                  },
                }}
                className="flex items-center gap-3 border-b border-hairline bg-card px-4 py-2.5"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    STATUS_DOT[st] ?? "bg-ink-3",
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="hidden shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums @min-[30rem]:inline">
                      {row.code}
                    </span>
                    <span
                      className="truncate text-[13px] text-foreground"
                      title={row.title}
                    >
                      {row.title}
                    </span>
                  </span>
                  <span className="truncate text-[11px] text-ink-3">
                    {String(row.account)}
                    <span className="@min-[56rem]:hidden">
                      {" · "}
                      {row.assignee === me ? "me" : String(row.assignee)}
                    </span>
                    {" · "}
                    <span className={cn(PRIORITY_TEXT[String(row.priority)])}>
                      {String(row.priority)}
                    </span>
                  </span>
                </span>
                <span className="hidden w-28 shrink-0 truncate text-[12px] text-ink-2 @min-[56rem]:block">
                  {String(row.assignee)}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px] tabular-nums",
                    due.late ? "text-danger" : "text-ink-3",
                  )}
                >
                  {due.text}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    );
  };

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      onKeyDown={onRootKeyDown}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--sl-accent" as string]: accent,
        ["--sl-r" as string]: radius,
      }}
    >
      <header className="flex items-baseline gap-3 px-4 pt-3">
        <p
          id={titleId}
          className="min-w-0 flex-1 truncate text-sm font-semibold"
        >
          {title}
        </p>
        <p className="shrink-0 text-[11px] text-ink-3">
          {status === "ready" ? (
            <>
              <span className="font-mono text-[13px] text-foreground tabular-nums">
                {results.length}
              </span>{" "}
              {results.length === 1 ? "ticket" : "tickets"}
            </>
          ) : status === "loading" ? (
            "Loading"
          ) : (
            "Not loaded"
          )}
        </p>
      </header>

      <motion.div
        ref={stripRef}
        onScroll={measureStrip}
        className="[scrollbar-width:none] overflow-x-auto border-b border-hairline [mask-image:linear-gradient(to_right,transparent,black_var(--fade-l),black_calc(100%_-_var(--fade-r)),transparent)] px-2 pt-2"
        style={{ ["--fade-l" as string]: maskL, ["--fade-r" as string]: maskR }}
      >
        <div
          role="tablist"
          aria-label="Saved views"
          className={cn(
            "flex w-max items-end gap-1 pb-2",
            tabStyle === "underline" && "pb-0",
          )}
        >
          {views.map((v, index) => {
            const selected = v.id === active?.id;
            const dirty = drafts[v.id] !== undefined;
            return (
              <motion.button
                key={v.id}
                ref={(node: HTMLButtonElement | null) => {
                  if (node) tabRefs.current.set(v.id, node);
                  else tabRefs.current.delete(v.id);
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                id={`${uid}-tab-${v.id}`}
                aria-label={`${v.name}${dirty ? ", edited" : ""}`}
                tabIndex={selected ? 0 : -1}
                disabled={disabled}
                onClick={() => select(v.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                layout={motionSafe ? "position" : false}
                initial={false}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                className={cn(
                  "relative flex h-8 shrink-0 items-center gap-1.5 px-3 text-[13px] whitespace-nowrap transition-colors",
                  tabStyle === "underline"
                    ? "h-9 rounded-t-(--sl-r)"
                    : "rounded-(--sl-r)",
                  selected ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                  FOCUS_IN,
                )}
              >
                {selected ? (
                  <motion.span
                    layoutId={`${uid}-mark`}
                    aria-hidden
                    className={cn(
                      "absolute",
                      tabStyle === "underline" &&
                        "inset-x-2 bottom-0 h-0.5 rounded-full bg-(--sl-accent)",
                      tabStyle === "pill" &&
                        "inset-0 rounded-(--sl-r) bg-[color-mix(in_oklab,var(--sl-accent)_13%,transparent)]",
                      tabStyle === "boxed" &&
                        "inset-0 rounded-(--sl-r) border border-hairline-strong bg-surface-1 shadow-[0_1px_2px_color-mix(in_oklab,black_8%,transparent)]",
                    )}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative hidden font-mono text-[10px] text-ink-3 tabular-nums @min-[36rem]:inline">
                  {index < 9 ? index + 1 : ""}
                </span>
                <span className={cn("relative", selected && "font-medium")}>
                  {v.name}
                </span>
                <AnimatePresence initial={false}>
                  {dirty ? (
                    <motion.span
                      key="dot"
                      aria-hidden
                      className="relative size-1.5 rounded-full bg-warn"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0, transition: exitTransition }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={active ? `${uid}-tab-${active.id}` : undefined}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="relative flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-hairline px-4 py-2.5">
          <ul
            role="list"
            aria-label="Filters in this view"
            className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {shownKeys.map((key) => {
                const f = byKey.get(key);
                if (!f) return null;
                const arriving = arrivals.indexOf(key);
                return (
                  <motion.li
                    key={key}
                    layout={motionSafe ? "position" : false}
                    initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      motionSafe
                        ? {
                            opacity: 0,
                            y: distances.step,
                            transition: exitTransition,
                          }
                        : { opacity: 0, transition: exitTransition }
                    }
                    transition={{
                      layout: motionSafe ? springs.glide : { duration: 0 },
                      y: motionSafe
                        ? {
                            ...springs.snap,
                            delay: Math.max(0, arriving) * step,
                          }
                        : { duration: 0 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: motionSafe ? Math.max(0, arriving) * step : 0,
                      },
                    }}
                    className="flex max-w-full"
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeChip(key)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Backspace" ||
                          event.key === "Delete"
                        ) {
                          event.preventDefault();
                          removeChip(key);
                        }
                      }}
                      aria-label={`Remove ${chipName(f)}`}
                      className={cn(
                        "inline-flex h-7 max-w-full items-center gap-1 rounded-(--sl-r) pr-1.5 pl-2.5 text-[12px] transition-colors",
                        chipClass[chipStyle],
                        FOCUS_RING,
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0",
                          chipStyle === "solid" ? "opacity-75" : "text-ink-3",
                        )}
                      >
                        {fieldOf(f.field)?.label ?? f.field}
                      </span>
                      <span className="truncate font-medium">{labelOf(f)}</span>
                      <X
                        aria-hidden
                        className={cn(
                          "size-3 shrink-0",
                          chipStyle === "solid" ? "opacity-75" : "text-ink-3",
                        )}
                      />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            <motion.li
              layout={motionSafe ? "position" : false}
              transition={springs.glide}
              className="relative flex"
            >
              <button
                ref={menuButtonRef}
                type="button"
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setMenuOpen(true);
                  }
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-(--sl-r) border border-dashed border-hairline-strong px-2 text-[12px] text-ink-3 transition-colors enabled:hover:border-ink-3 enabled:hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Plus aria-hidden className="size-3.5" />
                Filter
              </button>
            </motion.li>
          </ul>

          <AnimatePresence initial={false}>
            {edited && naming === null ? (
              <motion.div
                key="actions"
                className="flex shrink-0 items-center gap-1.5"
                initial={{ opacity: 0, x: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitTransition }}
                transition={{
                  x: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.base },
                }}
              >
                <button
                  type="button"
                  onClick={save}
                  disabled={disabled}
                  className={cn(
                    actionButton,
                    "border-transparent bg-(--sl-accent) text-background enabled:hover:bg-(--sl-accent) enabled:hover:text-background enabled:hover:opacity-90",
                  )}
                >
                  <Check aria-hidden className="size-3.5" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setNaming(`${active?.name ?? "View"} copy`)}
                  disabled={disabled}
                  className={actionButton}
                >
                  Save as new
                </button>
                <button
                  type="button"
                  onClick={revert}
                  disabled={disabled}
                  className={actionButton}
                  aria-label="Revert edits"
                >
                  <Undo2 aria-hidden className="size-3.5" />
                  <span className="hidden @min-[30rem]:inline">Revert</span>
                </button>
              </motion.div>
            ) : null}
            {naming !== null ? (
              <motion.form
                key="naming"
                className="flex shrink-0 items-center gap-1.5"
                initial={{ opacity: 0, x: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitTransition }}
                transition={{
                  x: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.base },
                }}
                onSubmit={(event) => {
                  event.preventDefault();
                  saveAsNew(naming);
                }}
              >
                <input
                  ref={bindName}
                  value={naming}
                  aria-label="Name the new view"
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setNaming(next);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setNaming(null);
                    }
                  }}
                  className="h-7 w-40 rounded-(--sl-r) border border-hairline-strong bg-surface-1 px-2 text-[12px] text-foreground outline-none focus:border-[color-mix(in_oklab,var(--sl-accent)_60%,transparent)]"
                />
                <button
                  type="submit"
                  className={cn(
                    actionButton,
                    "border-transparent bg-(--sl-accent) text-background enabled:hover:bg-(--sl-accent) enabled:hover:text-background",
                  )}
                >
                  Save
                </button>
              </motion.form>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                key="menu"
                ref={bindMenu}
                role="menu"
                aria-label="Add a filter"
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusMenuItem(1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusMenuItem(-1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    focusMenuItem("first");
                  } else if (event.key === "End") {
                    event.preventDefault();
                    focusMenuItem("last");
                  } else if (event.key === "Escape" || event.key === "Tab") {
                    if (event.key === "Escape") event.preventDefault();
                    closeMenu();
                  }
                }}
                className="absolute top-full left-4 z-20 mt-1 flex max-h-64 w-56 max-w-[calc(100%-2rem)] flex-col overflow-y-auto overscroll-contain rounded-(--sl-r) border border-hairline-strong bg-popover p-1 shadow-[0_12px_28px_color-mix(in_oklab,black_18%,transparent)]"
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitTransition }}
                transition={{
                  y: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                {fields.map((field) => {
                  const items = menuItems.filter(
                    (m) => m.field.id === field.id,
                  );
                  if (!items.length) return null;
                  return (
                    <div key={field.id} role="group" aria-label={field.label}>
                      <p
                        aria-hidden
                        className="px-2 pt-1.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                      >
                        {field.label}
                      </p>
                      {items.map(({ option }) => (
                        <button
                          key={option.value}
                          type="button"
                          role="menuitem"
                          tabIndex={-1}
                          onClick={() =>
                            addChip({ field: field.id, value: option.value })
                          }
                          className="flex h-7 w-full items-center rounded-[calc(var(--sl-r)*0.75)] px-2 text-left text-[12.5px] text-ink-2 outline-none hover:bg-surface-2 hover:text-foreground focus-visible:bg-surface-2 focus-visible:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                        >
                          {field.id === "assignee" && option.value === me
                            ? `${option.label} (me)`
                            : option.label}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          {panel()}
        </div>
      </div>

      {menuOpen ? (
        <div
          aria-hidden
          className="absolute inset-0 z-10"
          onPointerDown={() => setMenuOpen(false)}
        />
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
