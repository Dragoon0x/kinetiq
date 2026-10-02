"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  BrainCircuit,
  ChartColumn,
  Database,
  Ellipsis,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  Map as MapIcon,
  Search,
  Settings,
  Sprout,
  User,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SearchExpandItem = {
  /** Unique: the value that names this page. */
  id: string;
  /** The item's text. It stays the accessible name when the item is squeezed to its icon. */
  label: string;
  /** 16px, drawn in currentColor; all that shows when the item is squeezed. Defaults to the label's first letter. */
  icon?: React.ReactNode;
};

export type SearchExpandEntry = {
  id: string;
  /** The result's text; the matched letters are drawn in the accent. */
  title: string;
  /** The heading it is listed under. Groups keep the order they first appear in `index`. */
  group: string;
  /** A quiet note at the row's end: a kind, a count, an owner. */
  meta?: string;
  /** 16px, drawn in currentColor. */
  icon?: React.ReactNode;
  /** Extra words that find it without being in its title. */
  keywords?: string[];
};

export type SearchExpandSize = "sm" | "md" | "lg";

export type SearchExpandProps = {
  /** The bar's navigation, in order. The items nearest the search give way first. @default defaultSearchNav */
  nav?: SearchExpandItem[];
  /** Controlled: the id of the current page. */
  value?: string;
  /** The current page when uncontrolled. @default the first item's id */
  defaultValue?: string;
  /** Fires from the press or the More menu choice that asked for a page. */
  onValueChange?: (id: string) => void;
  /** What the search searches. @default defaultSearchIndex */
  index?: SearchExpandEntry[];
  /** Searches offered while the field is empty; choosing one fills the field. @default defaultSearchRecent */
  recent?: string[];
  /** A result was chosen, by a press or Enter. The search closes after it. */
  onSelect?: (entry: SearchExpandEntry) => void;
  /** Every edit of the field, with its text. */
  onQueryChange?: (query: string) => void;
  /** Controlled: whether the search is open. */
  open?: boolean;
  /** Whether the search starts open when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, key or blur that asked to open or close it. */
  onOpenChange?: (open: boolean) => void;
  /** The ids tucked into More once the bar settles, whenever that set changes. */
  onTuckChange?: (ids: string[]) => void;
  /** How wide the open field grows, in px. A wider field squeezes and tucks more of the nav; it never takes more than the bar can spare. @default 320 */
  width?: number;
  /** How many results the panel lists at most. @default 5 */
  results?: number;
  /** How much of the nav squeezes to its icons before anything tucks into More, 0 to 1: 0 tucks items whole, 1 squeezes every one first. @default 0.5 */
  tuck?: number;
  /** The brand mark, about 24px, always shown. @default a Fernworks mark */
  brand?: React.ReactNode;
  /** The product name beside the mark; it steps aside just before the last nav item tucks. @default "Fernworks" */
  brandName?: string;
  /** The account slot at the bar's far end: an avatar, a button. */
  actions?: React.ReactNode;
  /** The page under the bar. The results panel floats over it and never reaches past its bottom. */
  children?: React.ReactNode;
  /** The field's placeholder, and the search button's name. @default "Search" */
  placeholder?: string;
  /** The navigation's accessible name. @default "Primary" */
  label?: string;
  /** The More button's name. @default "More" */
  moreLabel?: string;
  /** The row shown when nothing matches. @default (query) => `No matches for “query”` */
  emptyLabel?: (query: string) => string;
  /** The key that opens the search from anywhere on the page that is not typing; `null` for none. @default "/" */
  shortcut?: string | null;
  /** The panel's tallest, in px, when nothing sits under the bar to bound it. @default 320 */
  maxPanelHeight?: number;
  /** Bar height 40, 48 or 56 px. @default "md" */
  size?: SearchExpandSize;
  /** The current-page pill, the result highlight, the matched letters and More's dot; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the field opening and closing and the choices. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- defaults -------------------------------- */

const ICON = "size-4";

export const defaultSearchNav: SearchExpandItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard className={ICON} />,
  },
  {
    id: "projects",
    label: "Projects",
    icon: <FolderKanban className={ICON} />,
  },
  { id: "datasets", label: "Datasets", icon: <Database className={ICON} /> },
  { id: "models", label: "Models", icon: <BrainCircuit className={ICON} /> },
  { id: "reports", label: "Reports", icon: <ChartColumn className={ICON} /> },
  { id: "settings", label: "Settings", icon: <Settings className={ICON} /> },
];

const page = (
  id: string,
  title: string,
  meta: string,
  keywords: string[] = [],
) => ({
  id,
  title,
  group: "Pages",
  meta,
  icon: <FileText className={ICON} />,
  keywords,
});
const project = (
  id: string,
  title: string,
  meta: string,
  keywords: string[] = [],
) => ({
  id,
  title,
  group: "Projects",
  meta,
  icon: <MapIcon className={ICON} />,
  keywords,
});
const dataset = (
  id: string,
  title: string,
  meta: string,
  keywords: string[] = [],
) => ({
  id,
  title,
  group: "Datasets",
  meta,
  icon: <Database className={ICON} />,
  keywords,
});
const person = (id: string, title: string, meta: string) => ({
  id,
  title,
  group: "People",
  meta,
  icon: <User className={ICON} />,
});

export const defaultSearchIndex: SearchExpandEntry[] = [
  page("p-billing", "Billing", "Settings", ["invoice", "plan", "payment"]),
  page("p-keys", "API keys", "Settings", ["token", "secret"]),
  page("p-members", "Members", "Settings", ["team", "invite"]),
  page("p-usage", "Usage this month", "Reports", ["quota", "compute"]),
  project("pr-basin", "Basin Road survey", "14 plots", ["soil", "field"]),
  project("pr-coldbrook", "Coldbrook wetland", "9 transects", [
    "water",
    "birds",
  ]),
  project("pr-waylight", "Waylight orchard trial", "220 trees", [
    "yield",
    "fruit",
  ]),
  project("pr-gauge", "Gauge river flow", "6 stations", ["flood", "water"]),
  project("pr-atlas", "Fieldline soil atlas", "3 regions", ["map", "soil"]),
  dataset("d-moisture", "Soil moisture 2026", "41k rows", ["sensor", "basin"]),
  dataset("d-rain", "Basin rainfall daily", "2.3k rows", ["weather", "rain"]),
  dataset("d-gauge", "River gauge readings", "180k rows", ["flow", "level"]),
  dataset("d-yield", "Orchard yield by row", "6.6k rows", ["harvest"]),
  dataset("d-plots", "Plot boundaries", "14 shapes", ["map", "basin"]),
  {
    id: "m-moisture",
    title: "Moisture forecast v3",
    group: "Models",
    meta: "Trained 2 days ago",
    icon: <BrainCircuit className={ICON} />,
    keywords: ["soil", "predict"],
  },
  {
    id: "m-yield",
    title: "Yield estimator",
    group: "Models",
    meta: "Draft",
    icon: <BrainCircuit className={ICON} />,
    keywords: ["orchard", "harvest"],
  },
  {
    id: "m-flood",
    title: "Flood risk",
    group: "Models",
    meta: "Live",
    icon: <BrainCircuit className={ICON} />,
    keywords: ["river", "gauge"],
  },
  {
    id: "r-season",
    title: "Season report, spring",
    group: "Reports",
    meta: "PDF",
    icon: <ChartColumn className={ICON} />,
    keywords: ["basin", "summary"],
  },
  {
    id: "r-sampling",
    title: "Sampling plan",
    group: "Reports",
    meta: "Doc",
    icon: <Sprout className={ICON} />,
    keywords: ["soil", "basin", "plots"],
  },
  person("u-ines", "Ines Calder", "Field lead"),
  person("u-tomas", "Tomas Reyes", "Data"),
  person("u-priya", "Priya Anand", "Models"),
  person("u-odile", "Odile Marsh", "Owner"),
  person("u-bram", "Bram Okafor", "Soil lab"),
];

export const defaultSearchRecent: string[] = [
  "soil moisture",
  "Basin Road",
  "flood risk",
];

/* -------------------------------- geometry ------------------------------- */

const SIZES: Record<
  SearchExpandSize,
  { bar: number; field: number; item: number; text: string }
> = {
  sm: { bar: 40, field: 30, item: 28, text: "text-[13px]" },
  md: { bar: 48, field: 36, item: 32, text: "text-[13px]" },
  lg: { bar: 56, field: 40, item: 36, text: "text-sm" },
};
/** The bar's side padding and the space between its groups, px. */
const PAD = 8;
const GAP = 8;
/** The space after each nav item; it tucks with the item. */
const ITEM_GAP = 2;
/** More is a little narrower than an icon chip, so the first tuck still frees room. */
const MORE_INSET = 4;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

type Measure = {
  /** Each item's natural width, label and padding included. */
  naturals: number[];
  /** The brand name's natural width, with its leading space. */
  name: number;
  chip: number;
  more: number;
};

type ItemFrame = {
  /** The item's visible width. */
  w: number;
  /** Its slot: the width plus the space after it. */
  wrap: number;
  /** 1 while the label reads, 0 once squeezed to the icon. */
  label: number;
  /** 0 in the bar, 1 in More. */
  tuck: number;
};

type Frame = {
  items: ItemFrame[];
  /** More's presence, 0 to 1. */
  more: number;
  /** The brand name's presence, 0 to 1. */
  name: number;
  /** Each item's left edge in the nav. */
  lefts: number[];
  /** Items more than half way into More. */
  count: number;
};

const EMPTY_FRAME: Frame = { items: [], more: 0, name: 1, lefts: [], count: 0 };

type Stage = {
  kind: "squeeze" | "tuck" | "name";
  /** The item it acts on (-1 for the name). */
  j: number;
  /** The room it frees when complete, px. */
  cap: number;
  /** The first tuck brings More in with it. */
  first: boolean;
};

/**
 * The order the bar gives way in: the items nearest the search squeeze to
 * their icons (only the first `squeeze` of them), then items tuck into More
 * nearest first (More growing in during the first), and the brand name
 * steps aside just before the last item tucks.
 */
function stagesFor(m: Measure, squeeze: number): Stage[] {
  const n = m.naturals.length;
  const out: Stage[] = [];
  const squeezed = new Set<number>();
  for (let k = 0; k < Math.min(squeeze, n); k += 1) {
    const j = n - 1 - k;
    out.push({
      kind: "squeeze",
      j,
      cap: Math.max(0, (m.naturals[j] ?? 0) - m.chip),
      first: false,
    });
    squeezed.add(j);
  }
  for (let k = 0; k < n; k += 1) {
    const j = n - 1 - k;
    // The name steps aside before the last item goes, so the bar keeps one
    // way to navigate for as long as it can.
    if (k === n - 1 && m.name > 0) {
      out.push({ kind: "name", j: -1, cap: m.name, first: false });
    }
    const base = squeezed.has(j) ? m.chip : (m.naturals[j] ?? 0);
    const cost = k === 0 ? m.more + ITEM_GAP : 0;
    out.push({ kind: "tuck", j, cap: base + ITEM_GAP - cost, first: k === 0 });
  }
  if (n === 0 && m.name > 0) {
    out.push({ kind: "name", j: -1, cap: m.name, first: false });
  }
  return out;
}

/** How much the bar must give at a given room, before rounding to a stage. */
const needAt = (room: number, m: Measure) =>
  m.name + m.naturals.reduce((s, w) => s + w + ITEM_GAP, 0) - room;

/**
 * The smallest stage boundary that frees at least `need`: a bar at rest is
 * always made of whole items, whole icons and whole tucks, never one cut in
 * half. The spare room is left empty at the nav's end.
 */
function settleNeed(need: number, stages: Stage[]): number {
  if (need <= 0.5) return 0;
  let at = 0;
  for (const st of stages) {
    at += Math.max(0, st.cap);
    if (at >= need - 0.5) return at;
  }
  return at;
}

/**
 * The whole bar at a pressure (px it must give). Stages are taken in order,
 * each one continuous, so every pressure between two rest states is a real
 * bar — a spring stopped half way shows something that makes sense.
 */
function frameAt(pressure: number, stages: Stage[], m: Measure): Frame {
  const items: ItemFrame[] = m.naturals.map((w) => ({
    w,
    wrap: w + ITEM_GAP,
    label: 1,
    tuck: 0,
  }));
  let left = pressure;
  let more = 0;
  let name = 1;
  for (const st of stages) {
    if (left <= 0.001) break;
    const p = st.cap > 0 ? Math.min(1, left / st.cap) : 1;
    left -= Math.max(0, st.cap) * p;
    if (st.kind === "name") {
      name = 1 - p;
      continue;
    }
    const it = items[st.j];
    if (!it) continue;
    if (st.kind === "squeeze") {
      it.w = (m.naturals[st.j] ?? 0) - st.cap * p;
      it.wrap = it.w + ITEM_GAP;
      it.label = 1 - p;
    } else {
      const base = it.w;
      it.tuck = p;
      it.w = base * (1 - p);
      it.wrap = (base + ITEM_GAP) * (1 - p);
      if (st.first) more = p;
    }
  }
  const lefts: number[] = [];
  let x = 0;
  let count = 0;
  for (const it of items) {
    lefts.push(r2(x));
    x += it.wrap;
    if (it.tuck >= 0.5) count += 1;
    it.w = r2(it.w);
    it.wrap = r2(it.wrap);
    it.label = Number(it.label.toFixed(4));
    it.tuck = Number(it.tuck.toFixed(4));
  }
  return {
    items,
    more: Number(more.toFixed(4)),
    name: Number(name.toFixed(4)),
    lefts,
    count,
  };
}

/* -------------------------------- matching ------------------------------- */

type Row =
  | {
      kind: "entry";
      key: string;
      group: string;
      entry: SearchExpandEntry;
      at: number;
      len: number;
    }
  | { kind: "recent"; key: string; group: string; text: string };

function rankOf(entry: SearchExpandEntry, q: string): number {
  const title = entry.title.toLowerCase();
  if (title.startsWith(q)) return 0;
  if (title.includes(` ${q}`) || title.includes(`-${q}`)) return 1;
  if (title.includes(q)) return 2;
  const extra = [entry.meta ?? "", entry.group, ...(entry.keywords ?? [])];
  if (extra.some((w) => w.toLowerCase().includes(q))) return 3;
  return -1;
}

function searchIndex(
  index: SearchExpandEntry[],
  raw: string,
  limit: number,
): Row[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const found = index
    .map((entry, i) => ({ entry, i, rank: rankOf(entry, q) }))
    .filter((f) => f.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, Math.max(1, limit));
  // Grouped in the order the groups first appear in the index, so a list
  // never reshuffles its headings as the query sharpens.
  const order = new Map<string, number>();
  index.forEach((e) => {
    if (!order.has(e.group)) order.set(e.group, order.size);
  });
  found.sort(
    (a, b) =>
      (order.get(a.entry.group) ?? 0) - (order.get(b.entry.group) ?? 0) ||
      a.rank - b.rank ||
      a.i - b.i,
  );
  return found.map(({ entry }) => {
    const at = entry.title.toLowerCase().indexOf(q);
    return {
      kind: "entry" as const,
      key: entry.id,
      group: entry.group,
      entry,
      at,
      len: at >= 0 ? q.length : 0,
    };
  });
}

/* -------------------------------- pieces --------------------------------- */

const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_OUT =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

function DefaultMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6 shrink-0">
      <rect width="24" height="24" rx="6" className="fill-cobalt-bright" />
      <path
        d="M12 18.5V8.2M12 11.4c-1.6-1.9-3.6-2.5-5.2-2.2.3 1.9 2.2 3.6 5.2 3.4M12 14.2c1.7-2 3.8-2.6 5.4-2.3-.3 2-2.3 3.7-5.4 3.5M12 9.2c-.9-1.4-.8-2.9.1-4 .9 1.1 1 2.6-.1 4"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-background"
      />
    </svg>
  );
}

type NavSlotProps = {
  item: SearchExpandItem;
  index: number;
  frame: MotionValue<Frame>;
  natural: number;
  measured: boolean;
  active: boolean;
  tucked: boolean;
  padL: number;
  height: number;
  text: string;
  disabled: boolean;
  onChoose: (id: string, el: Element) => void;
};

/** One nav item: its width, label and tuck are read off the bar's frame. */
function NavSlot({
  item,
  index,
  frame,
  natural,
  measured,
  active,
  tucked,
  padL,
  height,
  text,
  disabled,
  onChoose,
}: NavSlotProps) {
  const wrap = useTransform(frame, (f) => f.items[index]?.wrap ?? natural);
  const label = useTransform(frame, (f) => f.items[index]?.label ?? 1);
  const presence = useTransform(frame, (f) =>
    r2(1 - (f.items[index]?.tuck ?? 0)),
  );
  const mask = useTransform(frame, (f) => {
    const it = f.items[index];
    const cut = it ? Math.min(12, natural - it.w) : 0;
    return cut < 0.5
      ? "none"
      : `linear-gradient(to right, black calc(100% - ${Math.round(cut)}px), transparent)`;
  });

  return (
    <motion.li
      className="relative z-10 flex shrink-0 overflow-clip"
      style={
        measured
          ? { width: wrap, maskImage: mask, WebkitMaskImage: mask }
          : { paddingRight: ITEM_GAP }
      }
      inert={tucked}
      aria-hidden={tucked || undefined}
    >
      <motion.button
        type="button"
        aria-current={active ? "page" : undefined}
        disabled={disabled}
        onClick={(event) => onChoose(item.id, event.currentTarget)}
        style={{
          opacity: presence,
          paddingLeft: padL,
          paddingRight: padL + 4,
          height,
        }}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-2 whitespace-nowrap transition-colors",
          text,
          active
            ? "text-foreground"
            : "text-ink-2 enabled:hover:text-foreground",
          !measured &&
            active &&
            "bg-[color-mix(in_oklab,var(--search-expand-accent)_13%,transparent)]",
          "disabled:cursor-not-allowed",
          FOCUS_IN,
        )}
      >
        <span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center"
        >
          {item.icon ?? (
            <span className="text-[11px] leading-none font-semibold">
              {item.label.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <motion.span style={{ opacity: label }}>{item.label}</motion.span>
      </motion.button>
    </motion.li>
  );
}

/* ------------------------------- component ------------------------------- */

type Box = {
  barInner: number;
  mark: number;
  actions: number;
  rootH: number;
  naturals: number[];
  name: number;
};

type Latest = {
  isOpen: boolean;
  disabled: boolean;
  shortcut: string | null;
  openFromKey: () => void;
};

/**
 * An app header whose search makes its own room. Pressed (or with `/` typed
 * anywhere that is not a field), the search icon grows into a field on the
 * glide spring, and the bar gives way to it frame by frame: the nav items
 * nearest it squeeze to their icons, then tuck into a More button one after
 * another — More growing in with the first, squeezing as each lands, its
 * count rolling — and the brand name steps aside before the last one goes. The field's width is
 * one motion value and the rest of the bar is a pure function of it, so a
 * spring stopped half way, a resize or a reversal always shows a bar that
 * fits. A moment later the results panel grows down out of the field itself:
 * one shell, its radius easing from a pill to a card, the matches rising into
 * place.
 *
 * Escape, a choice, or focus leaving the field closes it in reverse order:
 * the panel retracts into the field, then the field narrows and the items
 * come back out of More. The field is a real combobox (arrows move through
 * the results, Enter chooses), the nav is a real navigation with
 * `aria-current`, and More is a menu button whose menu holds whatever is
 * tucked. Under reduced motion the field and panel fade in at their final
 * size and the bar jumps to its squeezed layout; counts and highlights still
 * change.
 */
export function SearchExpand({
  nav = defaultSearchNav,
  value,
  defaultValue,
  onValueChange,
  index = defaultSearchIndex,
  recent = defaultSearchRecent,
  onSelect,
  onQueryChange,
  open,
  defaultOpen = false,
  onOpenChange,
  onTuckChange,
  width = 320,
  results = 5,
  tuck = 0.5,
  brand,
  brandName = "Fernworks",
  actions,
  children,
  placeholder = "Search",
  label = "Primary",
  moreLabel = "More",
  emptyLabel = (q) => `No matches for “${q}”`,
  shortcut = "/",
  maxPanelHeight = 320,
  size = "md",
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: SearchExpandProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const menuId = `${uid}-menu`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const g = SIZES[size] ?? SIZES.md;
  const padL = (g.item - 16) / 2;
  const n = nav.length;
  const limit = Math.max(1, Math.round(results));

  /* ----------------------------- value state ----------------------------- */

  const [ownValue, setOwnValue] = React.useState(
    defaultValue ?? nav[0]?.id ?? "",
  );
  const current = value ?? ownValue;
  const activeIndex = nav.findIndex((it) => it.id === current);

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const controlledOpen = open !== undefined;
  const isOpen = (open ?? ownOpen) && !disabled;

  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(-1);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const [menuWanted, setMenuOpen] = React.useState(false);
  const [menuActive, setMenuActive] = React.useState(0);
  const [menuAlign, setMenuAlign] = React.useState<"left" | "right">("left");

  /* ------------------------------ measuring ------------------------------ */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [bar, setBar] = React.useState<HTMLDivElement | null>(null);
  const [mark, setMark] = React.useState<HTMLSpanElement | null>(null);
  const [acts, setActs] = React.useState<HTMLDivElement | null>(null);
  const [meter, setMeter] = React.useState<HTMLDivElement | null>(null);
  const [content, setContent] = React.useState<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<Box | null>(null);
  const navKey = `${nav.map((it) => `${it.id}:${it.label}`).join("|")}#${brandName}#${size}`;
  const [contentH, setContentH] = React.useState(0);

  React.useEffect(() => {
    if (!root || !bar || !mark || !meter) return;
    const read = () => {
      const cells = Array.from(
        meter.querySelectorAll<HTMLElement>("[data-measure-item]"),
      );
      const nameCell = meter.querySelector<HTMLElement>("[data-measure-name]");
      const next: Box = {
        barInner: Math.max(0, bar.clientWidth - 2 * PAD),
        mark: Math.ceil(mark.getBoundingClientRect().width),
        actions: acts ? Math.ceil(acts.getBoundingClientRect().width) : 0,
        rootH: Math.round(root.getBoundingClientRect().height),
        naturals: cells.map((c) => Math.ceil(c.getBoundingClientRect().width)),
        name: nameCell ? Math.ceil(nameCell.getBoundingClientRect().width) : 0,
      };
      setBox((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    read();
    const observer = new ResizeObserver(read);
    for (const node of [root, bar, mark, meter, acts]) {
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [root, bar, mark, acts, meter, navKey]);

  React.useEffect(() => {
    if (!content) return;
    const read = () =>
      setContentH(Math.round(content.getBoundingClientRect().height));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(content);
    return () => observer.disconnect();
  }, [content]);

  const measured = box !== null && box.naturals.length === n;
  const meas: Measure = {
    naturals: box?.naturals ?? [],
    name: brandName ? (box?.name ?? 0) : 0,
    chip: g.item,
    more: g.item - MORE_INSET,
  };
  const squeeze = Math.round(clamp01(tuck) * n);
  const gaps = GAP * (actions ? 3 : 2);
  const fixed = box ? box.barInner - box.mark - box.actions - gaps : 0;
  const closedW = g.field;
  const fieldMax = Math.max(
    closedW,
    fixed - (n > 0 ? meas.more + ITEM_GAP : 0),
  );
  const openW = Math.round(Math.min(fieldMax, Math.max(closedW, width)));

  // The room under the bar inside this box, when a page sits there: the
  // panel and the menu never reach past it.
  const shellTop = (g.bar - g.field) / 2;
  const below =
    box && box.rootH > g.bar + 48
      ? box.rootH - shellTop - g.field - 8
      : Infinity;
  const panelCap = Math.max(40, Math.min(maxPanelHeight, below));
  const menuCap = Math.max(
    80,
    Math.min(280, box && box.rootH > g.bar + 48 ? box.rootH - g.bar - 8 : 280),
  );

  /* ---------------------------- motion values ---------------------------- */

  const fieldW = useMotionValue(closedW);
  const reveal = useMotionValue(0);
  const panelH = useMotionValue(0);
  const fieldFade = useMotionValue(1);
  const pos = useMotionValue(Math.max(0, activeIndex));
  const squash = useMotionValue(1);
  const pillY = useMotionValue(0);
  const pillH = useMotionValue(0);
  const pillOpacity = useMotionValue(0);

  // Both rest states sit on a stage boundary; between them the pressure is
  // carried by the field's width, so the bar winds and unwinds continuously
  // and always comes to rest whole.
  const stages = stagesFor(meas, squeeze);
  const restClosed = settleNeed(needAt(fixed - closedW, meas), stages);
  const restOpen = Math.max(
    restClosed,
    settleNeed(needAt(fixed - openW, meas), stages),
  );
  const frame = useTransform(fieldW, (fw) => {
    if (!measured) return EMPTY_FRAME;
    const t = clamp01((fw - closedW) / Math.max(1, openW - closedW));
    return frameAt(lerp(restClosed, restOpen, t), stages, meas);
  });

  // Where the bar will settle: what assistive technology and the menu see,
  // so a tucked item is never reachable by Tab while it is invisible.
  const resting = measured
    ? frameAt(isOpen ? restOpen : restClosed, stages, meas)
    : EMPTY_FRAME;
  const tuckedIds = nav
    .filter((_, i) => (resting.items[i]?.tuck ?? 0) >= 0.5)
    .map((it) => it.id);
  const tuckedKey = tuckedIds.join(",");
  const moreShown = resting.more > 0.5;
  const activeTucked = activeIndex >= 0 && tuckedIds.includes(current);
  // A menu with nothing to offer is closed, whatever was asked.
  const menuOpen = menuWanted && moreShown && tuckedIds.length > 0;

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const slotRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const moreRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const optionNodes = React.useRef(new Map<string, HTMLDivElement>());
  const focusIntent = React.useRef<"input" | "trigger" | null>(null);
  const visitor = React.useRef(false);
  const sayTimer = React.useRef(0);
  const latest = React.useRef<Latest | null>(null);

  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /* ------------------------------- results ------------------------------- */

  const matches = React.useMemo(
    () => searchIndex(index, query, limit),
    [index, query, limit],
  );
  const trimmed = query.trim();
  const rows: Row[] = trimmed
    ? matches
    : recent.slice(0, limit).map((text, i) => ({
        kind: "recent" as const,
        key: `recent-${i}`,
        group: "Recent",
        text,
      }));
  const noMatch = trimmed.length > 0 && rows.length === 0;
  const panelWanted = isOpen && (rows.length > 0 || noMatch);
  const rowsKey = rows.map((r) => r.key).join("|");
  const groups: { name: string; rows: { row: Row; i: number }[] }[] = [];
  rows.forEach((row, i) => {
    const last = groups[groups.length - 1];
    if (last && last.name === row.group) last.rows.push({ row, i });
    else groups.push({ name: row.group, rows: [{ row, i }] });
  });

  /* ------------------------------- actions ------------------------------- */

  const setOpenState = (
    next: boolean,
    opts: { focus?: boolean; quiet?: boolean; el?: Element | null } = {},
  ) => {
    if (next && disabled) return;
    if (next === isOpen) return;
    if (!opts.quiet) {
      visitor.current = true;
      audio.play("swish", {
        pitch: next ? 1.1 : 0.82,
        gain: 0.42,
        pan: panOf(opts.el ?? slotRef.current),
      });
    }
    focusIntent.current = opts.focus ? (next ? "input" : "trigger") : null;
    if (!next) {
      setMenuOpen(false);
      setActive(-1);
      // A reduced-motion close has no retract to wait for.
      if (!motionSafe) setQuery("");
    } else {
      setActive(query.trim() ? 0 : -1);
    }
    if (!controlledOpen) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const editQuery = (text: string) => {
    setQuery(text);
    onQueryChange?.(text);
    const found = searchIndex(index, text, limit).length;
    setActive(text.trim() && found > 0 ? 0 : -1);
    window.clearTimeout(sayTimer.current);
    // Spoken once typing settles, from the query that was typed — never a
    // sentence per keystroke.
    sayTimer.current = window.setTimeout(() => {
      if (!text.trim()) return;
      say(
        found === 0
          ? "No matches."
          : `${found} ${found === 1 ? "result" : "results"}.`,
      );
    }, 250);
  };

  const chooseRow = (i: number) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === "recent") {
      audio.play("click", {
        pitch: 1.05,
        gain: 0.35,
        pan: panOf(slotRef.current),
      });
      editQuery(row.text);
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    audio.play("click", {
      pitch: 1.15,
      gain: 0.5,
      pan: panOf(optionNodes.current.get(row.key)),
    });
    onSelect?.(row.entry);
    say(`Opened ${row.entry.title}.`);
    setOpenState(false, { focus: true, quiet: true });
    visitor.current = true;
  };

  const choosePage = (id: string, el: Element | null) => {
    if (disabled) return;
    audio.play("click", { pitch: 1, gain: 0.45, pan: panOf(el) });
    if (id === current) return;
    if (value === undefined) setOwnValue(id);
    onValueChange?.(id);
  };

  const moveActive = (to: number) => {
    const len = rows.length;
    if (len === 0) return;
    const next = ((to % len) + len) % len;
    setActive(next);
    const row = rows[next];
    audio.play("click", {
      pitch: r2(1.3 - (0.4 * next) / Math.max(1, len - 1)),
      gain: 0.22,
      pan: panOf(row ? optionNodes.current.get(row.key) : null),
    });
  };

  const openMenu = () => {
    if (disabled || tuckedIds.length === 0) return;
    const r = root?.getBoundingClientRect();
    const m = moreRef.current?.getBoundingClientRect();
    if (r && m)
      setMenuAlign(m.left - r.left + 184 > r.width ? "right" : "left");
    const checked = tuckedIds.indexOf(current);
    setMenuActive(checked >= 0 ? checked : 0);
    setMenuOpen(true);
    audio.play("click", { pitch: 0.9, gain: 0.4, pan: panOf(moreRef.current) });
  };

  const closeMenu = (focusMore: boolean) => {
    setMenuOpen(false);
    if (focusMore) moreRef.current?.focus({ preventScroll: true });
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = tuckedIds.length;
    if (count === 0) return;
    const focusAt = (i: number) => {
      const next = ((i % count) + count) % count;
      setMenuActive(next);
      menuRef.current
        ?.querySelectorAll<HTMLElement>("[role='menuitemradio']")
        [next]?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(menuActive + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusAt(menuActive - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(count - 1);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const id = tuckedIds[menuActive];
        if (id) {
          choosePage(id, moreRef.current);
          if (isOpen) setOpenState(false, { quiet: true });
        }
        closeMenu(true);
        return;
      }
      case "Escape":
        // Handled here, where focus is; the stage must not also see it.
        event.preventDefault();
        closeMenu(true);
        return;
      case "Tab":
        closeMenu(false);
        return;
    }
  };

  const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(active + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveActive(active < 0 ? rows.length - 1 : active - 1);
        return;
      case "Enter":
        event.preventDefault();
        if (active >= 0) chooseRow(active);
        else if (trimmed && rows.length > 0) chooseRow(0);
        return;
    }
  };

  /* ------------------------------- effects ------------------------------- */

  React.useEffect(() => {
    latest.current = {
      isOpen,
      disabled,
      shortcut,
      openFromKey: () => setOpenState(true, { focus: true }),
    };
  });

  // The field and the panel follow the open state: opening grows the field
  // and then the panel out of it; closing retracts the panel and then the
  // field, so the bar unwinds in the reverse order it wound up.
  const fieldTarget = isOpen ? openW : closedW;
  const shownField = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!measured) return;
    const first = shownField.current === null;
    if (shownField.current === fieldTarget && !first) return;
    const opening =
      shownField.current !== null && fieldTarget > shownField.current;
    shownField.current = fieldTarget;
    if (first) {
      fieldW.jump(fieldTarget);
      return;
    }
    if (!motionSafe) {
      fieldW.jump(fieldTarget);
      fieldFade.jump(0.2);
      run(
        "fade",
        animate(fieldFade, 1, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
      visitor.current = false;
      return;
    }
    const panelShowing = reveal.get() > 0.05;
    run(
      "field",
      animate(fieldW, fieldTarget, {
        ...springs.glide,
        delay: !opening && panelShowing ? 0.09 : 0,
        onComplete: () => {
          visitor.current = false;
        },
      }),
    );
    // The fieldW animation, the reveal and the fade are all owned by `run`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldTarget, measured, motionSafe]);

  const shownPanel = React.useRef(false);
  React.useEffect(() => {
    if (shownPanel.current === panelWanted) return;
    shownPanel.current = panelWanted;
    if (!motionSafe) {
      reveal.jump(panelWanted ? 1 : 0);
      return;
    }
    if (panelWanted) {
      const growing = fieldW.get() < openW - 2;
      run(
        "reveal",
        animate(reveal, 1, { ...springs.glide, delay: growing ? 0.11 : 0 }),
      );
    } else {
      run(
        "reveal",
        animate(reveal, 0, {
          ...exitFor(durations.base),
          onComplete: () => {
            // The query is cleared once the panel has gone, so the panel
            // never swaps to its empty state on the way out.
            if (!latest.current?.isOpen) setQuery("");
          },
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelWanted, motionSafe]);

  const panelTarget = Math.min(contentH, panelCap);
  React.useEffect(() => {
    if (reveal.get() < 0.01 || !motionSafe) {
      panelH.jump(panelTarget);
      return;
    }
    run("panelH", animate(panelH, panelTarget, springs.glide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelTarget, motionSafe]);

  // The current-page pill moves on snap; tucked, it hands over to More's dot.
  const shownPos = React.useRef(activeIndex);
  React.useEffect(() => {
    if (activeIndex < 0 || shownPos.current === activeIndex) return;
    shownPos.current = activeIndex;
    if (!motionSafe) {
      pos.jump(activeIndex);
      return;
    }
    run("pos", animate(pos, activeIndex, springs.snap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, motionSafe]);

  // More squeezes as each item lands in it, while the visitor is opening or
  // closing the search — not when the page first lays out.
  const count = useTransform(frame, (f) => f.count);
  React.useEffect(
    () =>
      count.on("change", (c) => {
        if (!visitor.current || !motionSafe) return;
        audio.play("click", { pitch: r2(0.8 + 0.06 * c), gain: 0.16 });
        run(
          "squash",
          animate(squash, 0.84, {
            ...springs.flick,
            onComplete: () => run("squash", animate(squash, 1, springs.snap)),
          }),
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, motionSafe, audio],
  );

  // Focus follows a visitor's open or close once the state has committed and
  // the node it needs is live.
  React.useEffect(() => {
    const want = focusIntent.current;
    if (!want) return;
    if (want === "input" && isOpen) {
      inputRef.current?.focus({ preventScroll: true });
      focusIntent.current = null;
    } else if (want === "trigger" && !isOpen) {
      triggerRef.current?.focus({ preventScroll: true });
      focusIntent.current = null;
    }
  }, [isOpen]);

  // More can leave the bar while it has focus (the search closed and every
  // item came back): focus goes to the search button rather than the page.
  React.useEffect(() => {
    if (moreShown) return;
    const at = document.activeElement;
    if (at && (moreRef.current === at || menuRef.current?.contains(at))) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [moreShown]);

  React.useEffect(() => {
    onTuckChange?.(tuckedKey ? tuckedKey.split(",") : []);
    // Reported when the settled set changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuckedKey]);

  // Focus moves into the menu when it opens.
  React.useEffect(() => {
    if (!menuOpen) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      "[role='menuitemradio']",
    );
    items?.[menuActive]?.focus({ preventScroll: true });
    // Only on opening; arrows move focus themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  // A press anywhere outside the menu closes it.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target instanceof Node ? event.target : null;
      if (t && (menuRef.current?.contains(t) || moreRef.current?.contains(t)))
        return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  // "/" anywhere on the page, unless someone is typing or the key is taken.
  React.useEffect(() => {
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const now = latest.current;
      if (!now || !now.shortcut || now.disabled || now.isOpen) return;
      if (event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== now.shortcut) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
        )
      ) {
        return;
      }
      if (root.closest("[inert]") || root.getClientRects().length === 0) return;
      const dialog = target?.closest(
        "dialog, [role='dialog'], [role='alertdialog']",
      );
      if (dialog && !dialog.contains(root)) return;
      event.preventDefault();
      now.openFromKey();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [root]);

  // The highlight is a pill that moves between results on the snap spring,
  // and the list scrolls to keep it in view.
  React.useLayoutEffect(() => {
    const row = rows[active];
    const node = row ? optionNodes.current.get(row.key) : undefined;
    if (!node || !panelWanted) {
      run(
        "pill",
        animate(pillOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      return;
    }
    const y = node.offsetTop;
    const h = node.offsetHeight;
    if (!motionSafe || pillOpacity.get() < 0.05) {
      pillY.jump(y);
      pillH.jump(h);
    } else {
      run("pillY", animate(pillY, y, springs.snap));
      run("pillH", animate(pillH, h, springs.snap));
    }
    run(
      "pill",
      animate(pillOpacity, 1, {
        duration: durations.blink,
        ease: easings.enter,
      }),
    );
    const scroller = scrollRef.current;
    if (scroller) {
      if (y < scroller.scrollTop) scroller.scrollTop = Math.max(0, y - 4);
      else if (y + h > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTop = y + h - scroller.clientHeight + 4;
      }
    }
    // The pill follows the highlighted row only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rowsKey, panelWanted]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      window.clearTimeout(sayTimer.current);
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* --------------------------- derived drawing --------------------------- */

  const nameWidth = useTransform(frame, (f) => r2(meas.name * f.name));
  const nameOpacity = useTransform(frame, (f) => r2(smooth(0.2, 1, f.name)));
  const moreWrap = useTransform(frame, (f) =>
    r2((meas.more + ITEM_GAP) * f.more),
  );
  const morePresence = useTransform(frame, (f) => r2(f.more));
  const moreScale = useTransform([frame, squash] as MotionValue[], ([f, s]) =>
    r2((0.55 + 0.45 * (f as Frame).more) * (s as number)),
  );
  const countText = useTransform(frame, (f) => String(Math.max(1, f.count)));
  const dot = useTransform([frame, pos] as MotionValue[], ([f, p]) => {
    if (activeIndex < 0) return 0;
    const fr = f as Frame;
    const pv = p as number;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(pv)));
    const i1 = Math.min(n - 1, i0 + 1);
    const t = pv - i0;
    return r2(lerp(fr.items[i0]?.tuck ?? 0, fr.items[i1]?.tuck ?? 0, t));
  });
  const pillGeom = useTransform([frame, pos] as MotionValue[], ([f, p]) => {
    const fr = f as Frame;
    const pv = p as number;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(pv)));
    const i1 = Math.min(n - 1, i0 + 1);
    const t = pv - i0;
    return {
      x: r2(lerp(fr.lefts[i0] ?? 0, fr.lefts[i1] ?? 0, t)),
      w: r2(lerp(fr.items[i0]?.w ?? 0, fr.items[i1]?.w ?? 0, t)),
      o: r2(1 - lerp(fr.items[i0]?.tuck ?? 0, fr.items[i1]?.tuck ?? 0, t)),
    };
  });
  const navPillX = useTransform(pillGeom, (p) => p.x);
  const navPillW = useTransform(pillGeom, (p) => p.w);
  const navPillO = useTransform(pillGeom, (p) =>
    activeIndex >= 0 && measured ? p.o : 0,
  );

  const fieldProgress = useTransform(fieldW, (fw) =>
    clamp01((fw - closedW) / Math.max(1, openW - closedW)),
  );
  const inputOpacity = useTransform(fieldProgress, (p) =>
    isOpen || p > 0.01 ? r2(smooth(0.25, 0.8, p)) : 0,
  );
  const shellH = useTransform([reveal, panelH] as MotionValue[], ([r, h]) =>
    r2(g.field + (r as number) * ((h as number) + 1)),
  );
  const radius = useTransform(reveal, (r) =>
    r2(lerp(g.field / 2, 10, clamp01(r * 1.6))),
  );
  const shadow = useTransform(reveal, (r) =>
    r < 0.01
      ? "none"
      : `0 ${r2(10 * r)}px ${r2(28 * r)}px color-mix(in oklab, black ${Math.round(18 * r)}%, transparent)`,
  );
  const panelOpacity = useTransform(reveal, (r) => r2(smooth(0.1, 0.6, r)));

  const focusInsideField = (node: Element | null) =>
    !!node &&
    (slotRef.current?.contains(node) ||
      moreRef.current?.contains(node) ||
      menuRef.current?.contains(node));

  const activeRow = rows[active];

  /* -------------------------------- render ------------------------------- */

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        setRoot(node);
      }}
      className={cn(
        "@container relative isolate flex w-full flex-col",
        disabled && "opacity-60",
        className,
      )}
      style={{ "--search-expand-accent": accent } as React.CSSProperties}
    >
      <header className="relative z-20 shrink-0 border-b border-hairline bg-card">
        <div
          ref={setBar}
          className="flex items-center gap-2 px-2"
          style={{ height: g.bar }}
        >
          <span ref={setMark} className="flex shrink-0 items-center">
            {brand ?? <DefaultMark />}
          </span>
          {brandName ? (
            <motion.span
              aria-hidden={resting.name < 0.5 || undefined}
              className="-ml-2 flex shrink-0 overflow-clip pl-2 text-sm font-semibold whitespace-nowrap text-foreground"
              style={
                measured
                  ? { width: nameWidth, opacity: nameOpacity }
                  : undefined
              }
            >
              {brandName}
            </motion.span>
          ) : null}

          <nav
            aria-label={label}
            className={cn("min-w-0 flex-1", !measured && "overflow-clip")}
          >
            <ul role="list" className="relative flex items-center">
              <motion.span
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 z-0 h-full rounded-2 bg-[color-mix(in_oklab,var(--search-expand-accent)_13%,transparent)]"
                style={{ x: navPillX, width: navPillW, opacity: navPillO }}
              />
              {nav.map((item, i) => (
                <NavSlot
                  key={item.id}
                  item={item}
                  index={i}
                  frame={frame}
                  natural={meas.naturals[i] ?? 0}
                  measured={measured}
                  active={item.id === current}
                  tucked={tuckedIds.includes(item.id)}
                  padL={padL}
                  height={g.item}
                  text={g.text}
                  disabled={disabled}
                  onChoose={(id, el) => {
                    if (isOpen) setOpenState(false, { quiet: true });
                    choosePage(id, el);
                  }}
                />
              ))}
              {n > 0 ? (
                <motion.li
                  className="relative z-10 flex shrink-0"
                  style={{ width: measured ? moreWrap : 0 }}
                  inert={!moreShown}
                  aria-hidden={!moreShown || undefined}
                >
                  <motion.button
                    ref={moreRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-controls={menuOpen ? menuId : undefined}
                    aria-label={`${moreLabel}, ${tuckedIds.length} ${tuckedIds.length === 1 ? "item" : "items"}${activeTucked ? ", including the current page" : ""}`}
                    disabled={disabled}
                    onClick={() => (menuOpen ? closeMenu(false) : openMenu())}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown" && !menuOpen) {
                        event.preventDefault();
                        openMenu();
                      }
                    }}
                    style={{
                      width: meas.more,
                      height: g.item,
                      scale: moreScale,
                      opacity: morePresence,
                      originX: 0.5,
                    }}
                    className={cn(
                      "relative inline-flex shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
                      "enabled:hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] enabled:hover:text-foreground",
                      menuOpen &&
                        "bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] text-foreground",
                      FOCUS_IN,
                    )}
                  >
                    <Ellipsis aria-hidden className="size-4" />
                    <motion.span
                      aria-hidden
                      className="absolute -right-0.5 -bottom-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-card bg-surface-2 px-0.5 font-mono text-[9px] leading-none text-ink-2 tabular-nums"
                    >
                      {countText}
                    </motion.span>
                    <motion.span
                      aria-hidden
                      className="absolute top-1 right-1 size-1.5 rounded-full bg-[var(--search-expand-accent)]"
                      style={{ opacity: dot }}
                    />
                  </motion.button>

                  {menuOpen ? (
                    <motion.div
                      ref={menuRef}
                      id={menuId}
                      role="menu"
                      aria-label={moreLabel}
                      onKeyDown={onMenuKeyDown}
                      initial={
                        motionSafe
                          ? { opacity: 0, y: -distances.nudge }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? {
                              y: springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                      className={cn(
                        "absolute top-full z-40 mt-1.5 flex w-44 flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_16%,transparent)]",
                        menuAlign === "right" ? "right-0" : "left-0",
                      )}
                      style={{ maxHeight: menuCap }}
                    >
                      {tuckedIds.map((id, i) => {
                        const item = nav.find((it) => it.id === id);
                        if (!item) return null;
                        const on = id === current;
                        return (
                          <div
                            key={id}
                            role="menuitemradio"
                            aria-checked={on}
                            tabIndex={menuActive === i ? 0 : -1}
                            onPointerMove={() => setMenuActive(i)}
                            onClick={() => {
                              choosePage(id, moreRef.current);
                              if (isOpen) setOpenState(false, { quiet: true });
                              closeMenu(true);
                            }}
                            className={cn(
                              "flex h-8 shrink-0 cursor-pointer items-center gap-2.5 rounded-2 px-2.5 text-[13px]",
                              menuActive === i &&
                                "bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)]",
                              on ? "text-foreground" : "text-ink-2",
                              FOCUS_IN,
                            )}
                          >
                            <span
                              aria-hidden
                              className="flex size-4 shrink-0 items-center justify-center"
                            >
                              {item.icon}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {item.label}
                            </span>
                            {on ? (
                              <span
                                aria-hidden
                                className="size-1.5 shrink-0 rounded-full bg-[var(--search-expand-accent)]"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </motion.li>
              ) : null}
            </ul>
          </nav>

          <motion.div
            ref={slotRef}
            className="relative shrink-0"
            style={{ width: measured ? fieldW : closedW, height: g.field }}
            onBlur={(event) => {
              if (!isOpen || (event.target as Element) === triggerRef.current)
                return;
              // The window losing focus is not the visitor leaving the field.
              if (!document.hasFocus()) return;
              const to =
                event.relatedTarget instanceof Element
                  ? event.relatedTarget
                  : null;
              if (focusInsideField(to)) return;
              setOpenState(false, { quiet: to === null });
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !isOpen) return;
              // Handled where focus is; the stage must not also close.
              event.preventDefault();
              setOpenState(false, { focus: true });
            }}
          >
            <motion.div
              role="search"
              className={cn(
                "absolute inset-x-0 top-0 z-30 flex flex-col overflow-clip border transition-colors",
                // The field's own ring: the input inside it has no box of its own.
                "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-1 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
                isOpen
                  ? "border-hairline-strong bg-popover"
                  : "border-hairline bg-surface-2",
              )}
              style={{
                height: shellH,
                borderRadius: radius,
                boxShadow: shadow,
                opacity: fieldFade,
              }}
            >
              <div
                className="flex shrink-0 items-center"
                style={{ height: g.field - 2 }}
              >
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center text-ink-2"
                  style={{ width: g.field - 2 }}
                >
                  <Search className="size-4" />
                </span>
                <motion.input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  role="combobox"
                  aria-label={placeholder}
                  aria-expanded={panelWanted && rows.length > 0}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeRow && panelWanted ? optionId(active) : undefined
                  }
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={placeholder}
                  value={query}
                  disabled={disabled}
                  inert={!isOpen}
                  tabIndex={isOpen ? 0 : -1}
                  onChange={(event) => editQuery(event.currentTarget.value)}
                  onKeyDown={onFieldKeyDown}
                  style={{ opacity: inputOpacity }}
                  className={cn(
                    "h-full min-w-0 flex-1 bg-transparent pr-1 text-foreground outline-none placeholder:text-ink-3",
                    g.text,
                  )}
                />
                {query ? (
                  <motion.button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      editQuery("");
                      inputRef.current?.focus({ preventScroll: true });
                    }}
                    style={{ opacity: inputOpacity }}
                    className={cn(
                      "mr-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] hover:text-foreground",
                      FOCUS_IN,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                  </motion.button>
                ) : (
                  <motion.kbd
                    aria-hidden
                    style={{ opacity: inputOpacity }}
                    className="mr-2 hidden shrink-0 rounded-1 border border-hairline px-1 font-mono text-[10px] leading-4 text-ink-3 @min-[420px]:inline"
                  >
                    esc
                  </motion.kbd>
                )}
              </div>
              <motion.div
                aria-hidden
                className="mx-2 h-px shrink-0 bg-hairline"
                style={{ opacity: reveal }}
              />
              <motion.div
                ref={scrollRef}
                tabIndex={-1}
                inert={!panelWanted}
                className="relative shrink-0 overflow-y-auto overscroll-contain"
                style={{ height: panelH, opacity: panelOpacity }}
              >
                <div ref={setContent} className="relative p-1">
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 top-0 rounded-2 bg-[color-mix(in_oklab,var(--search-expand-accent)_13%,transparent)]"
                    style={{ y: pillY, height: pillH, opacity: pillOpacity }}
                  />
                  <div
                    id={listId}
                    role="listbox"
                    aria-label={
                      trimmed ? `Results for ${trimmed}` : "Recent searches"
                    }
                  >
                    {noMatch ? (
                      <p className="px-2.5 py-2 text-[13px] text-ink-3">
                        {emptyLabel(trimmed)}
                      </p>
                    ) : null}
                    {groups.map((group) => {
                      const headId = `${uid}-group-${group.name.replace(/\W+/g, "-")}`;
                      return (
                        <div
                          key={group.name}
                          role="group"
                          aria-labelledby={headId}
                        >
                          <div
                            id={headId}
                            className="px-2.5 pt-1.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                          >
                            {group.name}
                          </div>
                          {group.rows.map(({ row, i }) => (
                            <motion.div
                              key={row.key}
                              ref={(node: HTMLDivElement | null) => {
                                if (node)
                                  optionNodes.current.set(row.key, node);
                                else optionNodes.current.delete(row.key);
                              }}
                              id={optionId(i)}
                              role="option"
                              aria-selected={i === active}
                              initial={
                                motionSafe
                                  ? { opacity: 0, y: distances.nudge }
                                  : { opacity: 0 }
                              }
                              animate={{ opacity: 1, y: 0 }}
                              transition={
                                motionSafe
                                  ? {
                                      y: {
                                        ...springs.snap,
                                        delay: Math.min(i, 6) * 0.025,
                                      },
                                      opacity: {
                                        duration: durations.fast,
                                        delay: Math.min(i, 6) * 0.025,
                                      },
                                    }
                                  : { duration: durations.fast }
                              }
                              onPointerDown={(event) => event.preventDefault()}
                              onPointerMove={() => {
                                if (i !== active) setActive(i);
                              }}
                              onClick={() => chooseRow(i)}
                              className="relative flex h-8 cursor-pointer items-center gap-2.5 rounded-2 px-2.5 text-[13px]"
                            >
                              <span
                                aria-hidden
                                className="flex size-4 shrink-0 items-center justify-center text-ink-3"
                              >
                                {row.kind === "recent" ? (
                                  <History className="size-4" />
                                ) : (
                                  row.entry.icon
                                )}
                              </span>
                              {row.kind === "recent" ? (
                                <span className="min-w-0 flex-1 truncate text-ink-2">
                                  {row.text}
                                </span>
                              ) : (
                                <>
                                  <span
                                    className="min-w-0 flex-1 truncate text-foreground"
                                    title={row.entry.title}
                                  >
                                    {row.at >= 0 ? (
                                      <>
                                        {row.entry.title.slice(0, row.at)}
                                        <mark className="bg-transparent font-medium text-[var(--search-expand-accent)]">
                                          {row.entry.title.slice(
                                            row.at,
                                            row.at + row.len,
                                          )}
                                        </mark>
                                        {row.entry.title.slice(
                                          row.at + row.len,
                                        )}
                                      </>
                                    ) : (
                                      row.entry.title
                                    )}
                                  </span>
                                  {row.entry.meta ? (
                                    <span className="hidden shrink-0 text-[11px] text-ink-3 @min-[360px]:inline">
                                      {row.entry.meta}
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {!isOpen ? (
              <button
                ref={triggerRef}
                type="button"
                aria-label={placeholder}
                aria-expanded={false}
                aria-controls={inputId}
                aria-keyshortcuts={shortcut ?? undefined}
                disabled={disabled}
                onClick={(event) =>
                  setOpenState(true, { focus: true, el: event.currentTarget })
                }
                className={cn(
                  "absolute inset-y-0 left-0 z-40 rounded-full transition-colors disabled:cursor-not-allowed",
                  "enabled:hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)]",
                  FOCUS_OUT,
                )}
                style={{ width: closedW }}
              />
            ) : null}
          </motion.div>

          {actions ? (
            <div ref={setActs} className="flex shrink-0 items-center">
              {actions}
            </div>
          ) : null}
        </div>

        {/* Natural widths, measured off-screen in the bar's own type. */}
        <div
          ref={setMeter}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 flex size-0 overflow-clip whitespace-nowrap"
        >
          {brandName ? (
            <span data-measure-name="" className="pl-2 text-sm font-semibold">
              {brandName}
            </span>
          ) : null}
          {nav.map((item) => (
            <span
              key={item.id}
              data-measure-item=""
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5",
                g.text,
              )}
              style={{ paddingLeft: padL, paddingRight: padL + 4 }}
            >
              <span className="size-4 shrink-0" />
              {item.label}
            </span>
          ))}
        </div>
      </header>

      <div className="relative z-0 flex-1" style={{ minHeight: 0 }}>
        {children}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
