"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  FileImage,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  PanelRight,
  Plus,
  Presentation,
  RotateCcw,
  Search,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type PreviewPaletteKind = "page" | "person" | "file";
export type PreviewPaletteFileType = "image" | "sheet" | "doc" | "slides";
export type PreviewPalettePresence = "available" | "busy" | "away" | "offline";
export type PreviewPaletteDensity = "compact" | "cozy" | "roomy";
export type PreviewPaletteStatus = "ready" | "loading" | "error";
export type PreviewPaletteAccent = "cobalt" | "plum" | "mint" | "ink";

export type PreviewPaletteItem = {
  id: string;
  kind: PreviewPaletteKind;
  /** What the row and the preview are titled. Also what search matches first. */
  title: string;
  /** The group id it lists under. */
  group: string;
  /** More words that find it. */
  keywords?: string[];
  /** Pages: the path above the title, outermost first. */
  path?: string[];
  /** Pages: the first lines of the page, one paragraph each. */
  excerpt?: string[];
  /** Pages: its section headings. */
  outline?: string[];
  /** Pages and files: who changed it last. */
  author?: string;
  /** When it last changed, in ms since the epoch. */
  updated?: number;
  /** People: what they do. */
  role?: string;
  /** People: where they sit. */
  team?: string;
  /** People: their handle, without the @. */
  handle?: string;
  /** People: minutes from UTC, for their local time. */
  utcOffset?: number;
  /** People: whether they can be reached. */
  presence?: PreviewPalettePresence;
  /** People: a few words about the presence ("In the field until 16:00"). */
  presenceNote?: string;
  /** People: how many pages they own. */
  owns?: number;
  /** Files: what the thumbnail draws. */
  fileType?: PreviewPaletteFileType;
  /** Files: its size, written out ("2.4 MB"). */
  size?: string;
  /** Files: a detail under the name ("2400 × 1500", "4 sheets"). */
  detail?: string;
};

export type PreviewPaletteGroup = { id: string; label: string };

export type PreviewPaletteRenderContext = {
  /** The `now` the palette was given, for relative times. */
  now: number;
};

export type PreviewPaletteRenderers = Partial<
  Record<
    PreviewPaletteKind,
    (
      item: PreviewPaletteItem,
      context: PreviewPaletteRenderContext,
    ) => React.ReactNode
  >
>;

export type PreviewPaletteProps = {
  /** Share of the palette the preview pane takes, in percent, where the palette is 34rem or wider. @default 50 */
  previewWidth?: number;
  /** Row height: one tight line, a comfortable line, or two lines with the path or role. @default "cozy" */
  listDensity?: PreviewPaletteDensity;
  /** Highlight, flash, avatars, thumbnails and badges. A name or any CSS colour. @default "cobalt" */
  accent?: PreviewPaletteAccent | (string & {});
  /** Everything that can be found. @default defaultPreviewPaletteItems */
  items?: PreviewPaletteItem[];
  /** The groups results list under, in order. @default defaultPreviewPaletteGroups */
  groups?: PreviewPaletteGroup[];
  /** Ids shown under Recent while the field is empty, newest first. @default defaultPreviewPaletteRecent */
  recent?: string[];
  /** Replace the built-in preview for a kind of result. The card frame stays the palette's. */
  renderers?: PreviewPaletteRenderers;
  /** Controlled query. */
  query?: string;
  /** Initial query when uncontrolled. @default "" */
  defaultQuery?: string;
  /** Fires with every keystroke's new query. */
  onQueryChange?: (query: string) => void;
  /** Controlled: the id of the highlighted result. */
  highlighted?: string;
  /** Fires with the newly highlighted result (null for the create row), from the key, pointer or drag that moved it, and once on mount. */
  onHighlight?: (item: PreviewPaletteItem | null) => void;
  /** A result was opened: Enter, a click, or a tap on its preview. */
  onSelect?: (item: PreviewPaletteItem) => void;
  /** Cmd or Ctrl+Enter: open the highlighted result beside the current one. */
  onOpenBeside?: (item: PreviewPaletteItem) => void;
  /** The no-results row was chosen, with the query to create from. */
  onCreate?: (query: string) => void;
  /** The create row's verb. @default "Create page" */
  createLabel?: string;
  /** Results whose preview is still loading: their card shows a skeleton. @default [] */
  pendingIds?: string[];
  /** Whether the results have arrived: skeleton rows while loading, a message with Try again on error. @default "ready" */
  status?: PreviewPaletteStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The time relative dates and local times are read from, in ms. @default defaultPreviewPaletteNow */
  now?: number;
  /** Most results listed for a query. @default 12 */
  maxResults?: number;
  /** How long a press on a row must last to peek its preview where the pane is hidden, in ms. @default 380 */
  peekDelay?: number;
  /** The field's placeholder. @default "Search Fernworks…" */
  placeholder?: string;
  /** The field's accessible name. @default "Search the wiki" */
  label?: string;
  /** Escape on an empty field. Without it Escape is left to the page. */
  onDismiss?: () => void;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

/** Friday 16 October 2026, 13:20 UTC: every relative time is read from here. */
export const defaultPreviewPaletteNow = Date.UTC(2026, 9, 16, 13, 20);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T = defaultPreviewPaletteNow;

export const defaultPreviewPaletteGroups: PreviewPaletteGroup[] = [
  { id: "pages", label: "Pages" },
  { id: "people", label: "People" },
  { id: "files", label: "Files" },
];

export const defaultPreviewPaletteItems: PreviewPaletteItem[] = [
  {
    id: "release-checklist",
    kind: "page",
    title: "Release checklist",
    group: "pages",
    path: ["Engineering", "Runbooks"],
    author: "Tomas Reyes",
    updated: T - 2 * DAY,
    keywords: ["ship", "deploy", "launch"],
    excerpt: [
      "Every release goes out on a Tuesday morning, never on a Friday. Freeze the branch the evening before and post the cut in #releases.",
      "Run the smoke suite against staging, then roll out to five percent of workspaces and watch the error budget for an hour before going wider.",
    ],
    outline: ["Before the cut", "Freeze", "Roll out", "Verify"],
  },
  {
    id: "onboarding",
    kind: "page",
    title: "Onboarding: your first week",
    group: "pages",
    path: ["People Ops", "Guides"],
    author: "Ines Park",
    updated: T - 6 * DAY,
    keywords: ["new starter", "welcome"],
    excerpt: [
      "Welcome to Fernworks. Your first week is for meeting people, not shipping: you will pair with a buddy every afternoon.",
      "By Friday you should have read the field notes, set up your laptop and sat in on one planning session.",
    ],
    outline: ["Day one", "Your buddy", "Tools", "Friday"],
  },
  {
    id: "basin-notes",
    kind: "page",
    title: "Field notes: Basin survey",
    group: "pages",
    path: ["Research", "Field notes"],
    author: "Juno Vale",
    updated: T - 3 * HOUR,
    keywords: ["survey", "site", "research"],
    excerpt: [
      "Twelve plots across the north basin, sampled at dawn over four days. Soil moisture ran higher than last spring on every east-facing slope.",
      "Plot 7 was waterlogged on day two and has been dropped from the averages.",
    ],
    outline: ["Method", "Plots", "Findings", "Open questions"],
  },
  {
    id: "brand-voice",
    kind: "page",
    title: "Brand voice",
    group: "pages",
    path: ["Design", "Writing"],
    author: "Ines Park",
    updated: T - 11 * DAY,
    keywords: ["copy", "tone", "writing"],
    excerpt: [
      "We write like a good field guide: plain, specific and calm. Say what something does before you say how it feels.",
      "No exclamation marks in product copy. Numbers are digits, and dates say the day.",
    ],
    outline: ["Principles", "Words we avoid", "Examples"],
  },
  {
    id: "incident-template",
    kind: "page",
    title: "Incident review template",
    group: "pages",
    path: ["Engineering", "Templates"],
    author: "Tomas Reyes",
    updated: T - 24 * DAY,
    keywords: ["postmortem", "outage"],
    excerpt: [
      "Copy this page for every incident that paged someone. Write the timeline first, while it is fresh, then the causes.",
      "Blame the system, not the person; every action item has an owner and a date.",
    ],
    outline: ["Summary", "Timeline", "Causes", "Actions"],
  },
  {
    id: "ines",
    kind: "person",
    title: "Ines Park",
    group: "people",
    role: "Product designer",
    team: "Design",
    handle: "ines.park",
    utcOffset: 60,
    presence: "available",
    presenceNote: "Available · replies in about an hour",
    owns: 14,
    keywords: ["design", "writing"],
  },
  {
    id: "tomas",
    kind: "person",
    title: "Tomas Reyes",
    group: "people",
    role: "Staff engineer",
    team: "Platform",
    handle: "tomas",
    utcOffset: -300,
    presence: "busy",
    presenceNote: "In a release until 11:00",
    owns: 22,
    keywords: ["engineering", "releases"],
  },
  {
    id: "juno",
    kind: "person",
    title: "Juno Vale",
    group: "people",
    role: "Research lead",
    team: "Field research",
    handle: "juno.vale",
    utcOffset: 180,
    presence: "away",
    presenceNote: "In the field until 18:00",
    owns: 9,
    keywords: ["research", "survey"],
  },
  {
    id: "survey-map",
    kind: "file",
    title: "basin-survey-map.png",
    group: "files",
    fileType: "image",
    size: "2.4 MB",
    detail: "2400 × 1500",
    author: "Juno Vale",
    updated: T - 5 * HOUR,
    keywords: ["map", "survey", "image"],
  },
  {
    id: "budget",
    kind: "file",
    title: "field-budget-2026.sheet",
    group: "files",
    fileType: "sheet",
    size: "86 KB",
    detail: "4 sheets · 312 rows",
    author: "Ines Park",
    updated: T - 1 * DAY,
    keywords: ["budget", "money", "spreadsheet"],
  },
  {
    id: "field-guide",
    kind: "file",
    title: "field-guide-v4.pdf",
    group: "files",
    fileType: "doc",
    size: "1.1 MB",
    detail: "36 pages",
    author: "Juno Vale",
    updated: T - 9 * DAY,
    keywords: ["guide", "pdf", "handbook"],
  },
  {
    id: "kickoff",
    kind: "file",
    title: "q4-kickoff.slides",
    group: "files",
    fileType: "slides",
    size: "4.8 MB",
    detail: "18 slides",
    author: "Tomas Reyes",
    updated: T - 3 * DAY,
    keywords: ["deck", "planning", "presentation"],
  },
];

export const defaultPreviewPaletteRecent = [
  "release-checklist",
  "ines",
  "survey-map",
  "brand-voice",
];

const ACCENTS: Record<PreviewPaletteAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const ROW_H: Record<PreviewPaletteDensity, number> = {
  compact: 32,
  cozy: 40,
  roomy: 52,
};

/* The filmstrip's geometry. The active card sits EDGE below the pane's
   padding with the neighbours' edges showing above and below it, so the
   strip reads as a stack of cards rather than one card swapping. */
const BODY_H = 336;
const PAD = 12;
const EDGE = 16;
const CARD_H = BODY_H - 2 * (PAD + EDGE);
const GAP = 10;
const PITCH = CARD_H + GAP;
const TOP0 = PAD + EDGE;
const HEADER_H = 28;
const NOTE_H = 44;
const LIST_PAD = 6;
const NARROW = 544;
const EMPTY: string[] = [];

const KIND_LABEL: Record<PreviewPaletteKind, string> = {
  page: "page",
  person: "person",
  file: "file",
};

const FILE_LABEL: Record<PreviewPaletteFileType, string> = {
  image: "PNG",
  sheet: "Sheet",
  doc: "PDF",
  slides: "Slides",
};

const noop = () => () => {};
const yes = () => true;
const no = () => false;
const isMac = () =>
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

/* --------------------------------- helpers -------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

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

/** Relative time read from `now`, never from the wall clock. */
const ago = (now: number, at: number): string => {
  const minutes = Math.round((now - at) / MIN);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  const d = new Date(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

/** A fixed 24-hour clock; a locale lookup during render would not survive hydration. */
const clock = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

const offsetLabel = (minutes: number): string => {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
};

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** A stable hue offset per name, so an avatar keeps its colour everywhere. */
const hueOf = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 7) * 40 - 120;
};

type Match = { score: number; hits: number[] };

const BOUNDARY = /[\s\-_/.:]/;

/**
 * Contiguous matches beat scattered ones and word starts beat the middle of
 * a word, so "rel" finds Release checklist before Field notes.
 */
const fuzzy = (text: string, query: string): Match | null => {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return { score: 0, hits: [] };
  const at = t.indexOf(q);
  if (at !== -1) {
    const start = at === 0 || BOUNDARY.test(t[at - 1] ?? "");
    return {
      score: 200 - at + (start ? 60 : 0),
      hits: Array.from({ length: q.length }, (_, i) => at + i),
    };
  }
  const hits: number[] = [];
  let from = 0;
  let prev = -2;
  let score = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const j = t.indexOf(ch, from);
    if (j === -1) return null;
    hits.push(j);
    score +=
      j === prev + 1 ? 6 : j === 0 || BOUNDARY.test(t[j - 1] ?? "") ? 4 : 1;
    prev = j;
    from = j + 1;
  }
  return { score, hits };
};

const matchItem = (item: PreviewPaletteItem, query: string): Match | null => {
  const title = fuzzy(item.title, query);
  if (title) return title;
  const rest = [
    ...(item.keywords ?? []),
    ...(item.path ?? []),
    item.role ?? "",
    item.team ?? "",
  ].join(" ");
  const other = fuzzy(rest, query);
  return other ? { score: other.score / 4, hits: [] } : null;
};

type Option = {
  key: string;
  item?: PreviewPaletteItem;
  /** The query to create from, on the no-results row. */
  create?: string;
  hits: number[];
};

type Section = { id: string; label: string; note?: string; options: Option[] };

const buildSections = (
  items: PreviewPaletteItem[],
  groups: PreviewPaletteGroup[],
  recent: string[],
  query: string,
  max: number,
): Section[] => {
  const q = query.trim();
  if (!q) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const recentOptions = recent
      .map((id) => byId.get(id))
      .filter((item): item is PreviewPaletteItem => Boolean(item))
      .map((item) => ({ key: item.id, item, hits: [] }));
    const taken = new Set(recentOptions.map((o) => o.key));
    const sections: Section[] = recentOptions.length
      ? [{ id: "recent", label: "Recent", options: recentOptions }]
      : [];
    let budget = Math.max(0, max - recentOptions.length);
    for (const group of groups) {
      if (budget <= 0) break;
      const options = items
        .filter((item) => item.group === group.id && !taken.has(item.id))
        .slice(0, Math.min(2, budget))
        .map((item) => ({ key: item.id, item, hits: [] }));
      budget -= options.length;
      if (options.length)
        sections.push({ id: group.id, label: group.label, options });
    }
    return sections;
  }
  const scored = items
    .map((item) => ({ item, match: matchItem(item, q) }))
    .filter((entry): entry is { item: PreviewPaletteItem; match: Match } =>
      Boolean(entry.match),
    )
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, max);
  const sections: Section[] = [];
  for (const group of groups) {
    const options = scored
      .filter((entry) => entry.item.group === group.id)
      .map((entry) => ({
        key: entry.item.id,
        item: entry.item,
        hits: entry.match.hits,
      }));
    if (options.length)
      sections.push({ id: group.id, label: group.label, options });
  }
  if (!sections.length) {
    sections.push({
      id: "create",
      label: "",
      note: `Nothing in the wiki matches “${q}”.`,
      options: [{ key: "create", create: q, hits: [] }],
    });
  }
  return sections;
};

/** Where every option starts inside the list's content, from fixed row heights. */
const layoutOf = (sections: Section[], rowH: number) => {
  const tops: number[] = [];
  let y = LIST_PAD;
  for (const section of sections) {
    y += section.note ? NOTE_H : HEADER_H;
    for (let i = 0; i < section.options.length; i += 1) {
      tops.push(y);
      y += rowH;
    }
  }
  return { tops, height: y + LIST_PAD };
};

const subtitleOf = (item: PreviewPaletteItem): string => {
  if (item.kind === "page") return (item.path ?? []).join(" / ");
  if (item.kind === "person")
    return [item.role, item.team].filter(Boolean).join(" · ");
  return [item.fileType ? FILE_LABEL[item.fileType] : "", item.size ?? ""]
    .filter(Boolean)
    .join(" · ");
};

/* ------------------------------ preview cards ----------------------------- */

function Highlighted({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>;
  const set = new Set(hits);
  const runs: { on: boolean; text: string }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const on = set.has(i);
    const last = runs[runs.length - 1];
    if (last && last.on === on) last.text += text[i];
    else runs.push({ on, text: text[i] ?? "" });
  }
  return (
    <>
      {runs.map((run, i) =>
        run.on ? (
          <mark
            key={i}
            className="bg-transparent font-semibold text-[var(--pp-accent)]"
          >
            {run.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{run.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function Avatar({ name, size }: { name: string; size: number }) {
  const hue = hueOf(name);
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        // Pigment, not text colour: a fixed lightness reads the same in both themes.
        backgroundColor: `oklch(from var(--pp-accent) 0.82 0.07 calc(h + ${hue}))`,
        color: `oklch(from var(--pp-accent) 0.34 0.08 calc(h + ${hue}))`,
      }}
    >
      {initials(name)}
    </span>
  );
}

function PagePreview({ item, now }: { item: PreviewPaletteItem; now: number }) {
  const edited =
    item.updated !== undefined
      ? `Edited ${ago(now, item.updated)}${item.author ? ` by ${item.author}` : ""}`
      : item.author
        ? `By ${item.author}`
        : "";
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <p className="truncate text-[11px] text-ink-3">
        {(item.path ?? []).join(" / ")}
      </p>
      <p className="text-[15px] leading-snug font-semibold text-foreground">
        {item.title}
      </p>
      {edited ? <p className="text-[11px] text-ink-3">{edited}</p> : null}
      <span aria-hidden className="my-1 h-px shrink-0 bg-hairline" />
      <div
        className="flex flex-1 flex-col gap-2 overflow-hidden"
        style={{
          maskImage: "linear-gradient(to bottom, black 55%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent)",
        }}
      >
        {(item.excerpt ?? []).map((line, i) => (
          <p key={i} className="text-[12.5px] leading-relaxed text-ink-2">
            {line}
          </p>
        ))}
      </div>
      {item.outline?.length ? (
        <div className="flex flex-wrap gap-1">
          {item.outline.map((heading) => (
            <span
              key={heading}
              className="inline-flex h-5 items-center rounded-1 bg-surface-2 px-1.5 text-[10.5px] text-ink-2"
            >
              {heading}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const PRESENCE_DOT: Record<PreviewPalettePresence, string> = {
  available: "bg-success",
  busy: "bg-danger",
  away: "bg-warn",
  offline: "bg-ink-3",
};

function PersonPreview({
  item,
  now,
}: {
  item: PreviewPaletteItem;
  now: number;
}) {
  const offset = item.utcOffset ?? 0;
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={item.title} size={48} />
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-snug font-semibold text-foreground">
            {item.title}
          </p>
          <p className="truncate text-xs text-ink-2">
            {[item.role, item.team].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {item.presence ? (
        <p className="flex items-center gap-2 rounded-2 bg-surface-2 px-2.5 py-2 text-xs text-ink-2">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              PRESENCE_DOT[item.presence],
            )}
          />
          <span className="truncate">{item.presenceNote ?? item.presence}</span>
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
        <dt className="text-ink-3">Local time</dt>
        <dd className="font-mono text-foreground tabular-nums">
          {`${clock(now + offset * MIN)} · ${offsetLabel(offset)}`}
        </dd>
        {item.handle ? (
          <>
            <dt className="text-ink-3">Handle</dt>
            <dd className="truncate font-mono text-foreground">{`@${item.handle}`}</dd>
          </>
        ) : null}
        {item.owns !== undefined ? (
          <>
            <dt className="text-ink-3">Pages</dt>
            <dd className="text-foreground">{`${item.owns} owned`}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

/** Thumbnails are drawn, never fetched: tokens for paper, the accent for detail. */
function Thumb({ type }: { type: PreviewPaletteFileType }) {
  const wash = "fill-[color-mix(in_oklab,var(--pp-accent)_22%,var(--card))]";
  const deep = "fill-[color-mix(in_oklab,var(--pp-accent)_48%,var(--card))]";
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 100"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      {type === "image" ? (
        <>
          <rect width="160" height="100" className="fill-surface-1" />
          <circle
            cx="118"
            cy="30"
            r="11"
            className="fill-[var(--pp-accent)]"
            opacity={0.85}
          />
          <path
            d="M0 74 L34 46 L58 64 L88 34 L124 70 L160 52 L160 100 L0 100 Z"
            className={wash}
          />
          <path
            d="M0 86 L28 70 L60 82 L96 62 L130 84 L160 74 L160 100 L0 100 Z"
            className={deep}
          />
        </>
      ) : type === "sheet" ? (
        <>
          <rect width="160" height="100" className="fill-card" />
          <rect width="160" height="14" className={wash} />
          {Array.from({ length: 6 }, (_, i) => (
            <rect
              key={`r${i}`}
              x="0"
              y={14 + i * 14}
              width="160"
              height="1"
              className="fill-hairline-strong"
              shapeRendering="crispEdges"
            />
          ))}
          {Array.from({ length: 4 }, (_, i) => (
            <rect
              key={`c${i}`}
              x={32 + i * 32}
              y="0"
              width="1"
              height="100"
              className="fill-hairline-strong"
              shapeRendering="crispEdges"
            />
          ))}
          {[22, 40, 30, 52].map((h, i) => (
            <rect
              key={`b${i}`}
              x={104 + i * 12}
              y={92 - h * 0.6}
              width="8"
              height={h * 0.6}
              rx="1"
              className={i === 3 ? "fill-[var(--pp-accent)]" : deep}
            />
          ))}
          <rect x="34" y="30" width="28" height="11" className={deep} />
        </>
      ) : type === "doc" ? (
        <>
          <rect width="160" height="100" className="fill-surface-1" />
          <rect
            x="44"
            y="8"
            width="72"
            height="92"
            rx="2"
            className="fill-card stroke-hairline-strong"
            strokeWidth="1"
          />
          <rect
            x="54"
            y="18"
            width="38"
            height="5"
            rx="1"
            className="fill-[var(--pp-accent)]"
          />
          {[30, 37, 44, 51, 62, 69, 76].map((y, i) => (
            <rect
              key={y}
              x="54"
              y={y}
              width={i % 3 === 2 ? 34 : 52}
              height="3"
              rx="1"
              className="fill-hairline-strong"
            />
          ))}
        </>
      ) : (
        <>
          <rect width="160" height="100" className="fill-surface-1" />
          <rect
            x="16"
            y="12"
            width="128"
            height="76"
            rx="3"
            className="fill-card stroke-hairline-strong"
            strokeWidth="1"
          />
          <rect
            x="28"
            y="26"
            width="56"
            height="7"
            rx="1.5"
            className="fill-foreground"
            opacity={0.75}
          />
          {[42, 50, 58].map((y) => (
            <rect
              key={y}
              x="28"
              y={y}
              width="44"
              height="3"
              rx="1"
              className="fill-hairline-strong"
            />
          ))}
          <circle cx="112" cy="56" r="18" className={wash} />
          <path
            d="M112 38 A18 18 0 0 1 130 56 L112 56 Z"
            className="fill-[var(--pp-accent)]"
          />
        </>
      )}
    </svg>
  );
}

function FilePreview({ item, now }: { item: PreviewPaletteItem; now: number }) {
  const type = item.fileType ?? "doc";
  const facts = [
    FILE_LABEL[type],
    item.size,
    item.updated !== undefined ? `Updated ${ago(now, item.updated)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="h-[132px] shrink-0 overflow-hidden rounded-2 border border-hairline">
        <Thumb type={type} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[14px] leading-snug font-semibold text-foreground">
          {item.title}
        </p>
        <p className="truncate text-[11px] text-ink-3">{facts}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        {item.detail ? (
          <>
            <dt className="text-ink-3">Contents</dt>
            <dd className="truncate text-foreground">{item.detail}</dd>
          </>
        ) : null}
        {item.author ? (
          <>
            <dt className="text-ink-3">Owner</dt>
            <dd className="truncate text-foreground">{item.author}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function DraftPreview({ title, verb }: { title: string; verb: string }) {
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <p className="inline-flex items-center gap-1.5 text-[11px] text-[var(--pp-accent)]">
        <Plus aria-hidden className="size-3.5 shrink-0" />
        {verb}
      </p>
      <p className="truncate text-[15px] leading-snug font-semibold text-foreground">
        {title}
      </p>
      <p className="text-[11px] text-ink-3">Fernworks wiki · Drafts</p>
      <span aria-hidden className="my-1 h-px shrink-0 bg-hairline" />
      {[92, 80, 86, 54].map((w, i) => (
        <span
          key={i}
          aria-hidden
          className="h-2 shrink-0 rounded-full bg-surface-2"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

function SkeletonPreview({ pulse }: { pulse: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-full flex-col gap-2.5 p-4",
        pulse && "animate-pulse",
      )}
    >
      <span className="h-[96px] shrink-0 rounded-2 bg-surface-2" />
      <span className="h-3 w-2/3 shrink-0 rounded-full bg-surface-2" />
      <span className="h-2 w-1/3 shrink-0 rounded-full bg-surface-2" />
      <span className="h-2 w-11/12 shrink-0 rounded-full bg-surface-2" />
      <span className="h-2 w-4/5 shrink-0 rounded-full bg-surface-2" />
    </div>
  );
}

/* -------------------------------- filmstrip ------------------------------- */

const CARD_FRAME =
  "absolute inset-x-3 top-0 overflow-hidden rounded-3 border border-hairline bg-card shadow-[0_10px_28px_color-mix(in_oklab,black_14%,transparent)]";

/**
 * One card on the strip. Its place, size and fade are all read from the one
 * strip value, so a glide of the strip moves every card on the same frame
 * without a single re-render.
 */
function StripCard({
  index,
  strip,
  fade,
  children,
}: {
  index: number;
  strip: MotionValue<number>;
  /** Cards that arrive after the first paint fade in; the first frame is whole. */
  fade: boolean;
  children: React.ReactNode;
}) {
  const y = useTransform(strip, (s) => r2(index * PITCH + s));
  const away = useTransform(strip, (s) =>
    Math.min(1, Math.abs((index * PITCH + s - TOP0) / PITCH)),
  );
  const scale = useTransform(away, (a) => r3(1 - 0.06 * a));
  const opacity = useTransform(away, (a) => r3(1 - 0.55 * a));
  // Neighbours shrink toward the active card, so their edges tuck behind it.
  const originY = useTransform(strip, (s) =>
    index * PITCH + s - TOP0 > 0 ? 0 : 1,
  );
  return (
    <motion.div
      className={CARD_FRAME}
      style={{ y, scale, opacity, originY, height: CARD_H }}
    >
      <motion.div
        className="h-full"
        initial={fade ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: durations.fast, ease: easings.enter }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------- component ------------------------------- */

/**
 * A command menu whose right half previews the highlighted result. The
 * previews are cards on one vertical strip: Up and Down glide the highlight
 * pill down the list and the strip up the pane on the same spring, so going
 * down the list flips through the items themselves — the next card rises
 * into the window while the last tucks behind the top edge. The pane is also
 * a handle: drag it, flick it or wheel over it to flip.
 *
 * Results, groups, recents and the preview for each kind of result are props;
 * pending previews show a skeleton and an empty search offers to create.
 * Where the palette is narrower than 34rem the pane hides and a long press (or
 * → at the end of the field) peeks the strip over the list. The field is a
 * combobox, Enter opens, Cmd or Ctrl+Enter opens beside, Escape closes the
 * peek, then clears, then dismisses. Under reduced motion only the active
 * card shows and the next cross-fades in.
 */
export function PreviewPalette({
  previewWidth = 50,
  listDensity = "cozy",
  accent = "cobalt",
  items = defaultPreviewPaletteItems,
  groups = defaultPreviewPaletteGroups,
  recent = defaultPreviewPaletteRecent,
  renderers,
  query,
  defaultQuery = "",
  onQueryChange,
  highlighted,
  onHighlight,
  onSelect,
  onOpenBeside,
  onCreate,
  createLabel = "Create page",
  pendingIds = EMPTY,
  status = "ready",
  onRetry,
  now = defaultPreviewPaletteNow,
  maxResults = 12,
  peekDelay = 380,
  placeholder = "Search Fernworks…",
  label = "Search the wiki",
  onDismiss,
  className,
}: PreviewPaletteProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;
  const rowH = ROW_H[listDensity] ?? ROW_H.cozy;
  const width = clamp(previewWidth, 30, 70);

  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const q = query ?? ownQuery;

  const sections = React.useMemo(
    () =>
      status === "ready"
        ? buildSections(items, groups, recent, q, Math.max(1, maxResults))
        : [],
    [items, groups, recent, q, maxResults, status],
  );
  const options = React.useMemo(
    () => sections.flatMap((section) => section.options),
    [sections],
  );
  const { tops, height: listHeight } = layoutOf(sections, rowH);

  const [ownHi, setOwnHi] = React.useState<string | null>(null);
  const hiKey = highlighted ?? ownHi;
  const found = options.findIndex((o) => o.key === hiKey);
  const active = found === -1 ? 0 : found;
  const activeOption = options[active];

  const [narrow, setNarrow] = React.useState(false);
  const [peekState, setPeek] = React.useState<{ from: number } | null>(null);
  // The peek only exists where the pane is hidden.
  const peek = narrow ? peekState : null;
  const [beside, setBeside] = React.useState<string[]>([]);
  const [flash, setFlash] = React.useState<{ key: string; n: number } | null>(
    null,
  );
  const [ghost, setGhost] = React.useState(0);
  const [said, setSaid] = React.useState("");

  const strip = useMotionValue(TOP0);
  const pill = useMotionValue(tops[0] ?? LIST_PAD + HEADER_H);
  const press = useMotionValue(1);
  const stripRun = React.useRef<AnimationPlaybackControls | null>(null);
  const pillRun = React.useRef<AnimationPlaybackControls | null>(null);
  const pressRun = React.useRef<AnimationPlaybackControls | null>(null);
  const pendingVelocity = React.useRef<number | null>(null);
  const shown = React.useRef<{ index: number; sig: string } | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [listEl, setListEl] = React.useState<HTMLDivElement | null>(null);
  const [paneEl, setPaneEl] = React.useState<HTMLDivElement | null>(null);
  const [rootEl, setRootEl] = React.useState<HTMLDivElement | null>(null);

  // Which cards are mounted follows the strip as well as the highlight, so a
  // drag or a long glide never shows an empty slot.
  const [near, setNear] = React.useState(0);
  const nearRef = React.useRef(0);
  useMotionValueEvent(strip, "change", (v) => {
    const n = Math.round((TOP0 - v) / PITCH);
    if (n !== nearRef.current) {
      nearRef.current = n;
      setNear(n);
    }
  });

  const latest = React.useRef({ active, count: options.length });
  React.useEffect(() => {
    latest.current = { active, count: options.length };
  });

  const mac = React.useSyncExternalStore(noop, isMac, () => false);
  // False for the server render and hydration, true after: cards that mount
  // later fade in, the ones in the first frame are already whole.
  const painted = React.useSyncExternalStore(noop, yes, no);

  // The same breakpoint the container query uses, read from the same box.
  React.useEffect(() => {
    if (!rootEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < NARROW);
    });
    ro.observe(rootEl);
    return () => ro.disconnect();
  }, [rootEl]);

  // Reported once from the first commit too: a host's status line reads it.
  const reportedFirst = React.useRef(false);
  React.useEffect(() => {
    if (reportedFirst.current) return;
    reportedFirst.current = true;
    onHighlight?.(activeOption?.item ?? null);
    // Only the first highlight; later ones come from the gesture that moved it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The strip and the pill follow the highlight. A new list (another query,
  // density or status) jumps them; a move inside the same list glides, and a
  // jump of more than three cuts to two cards away so it still reads as a flip.
  const sig = `${q}|${status}|${rowH}|${options.length}`;
  const firstTop = tops[0] ?? 0;
  const activeTop = tops[active] ?? firstTop;
  React.useLayoutEffect(() => {
    const target = TOP0 - active * PITCH;
    const before = shown.current;
    shown.current = { index: active, sig };
    if (!before || before.sig !== sig || !motionSafe) {
      stripRun.current?.stop();
      pillRun.current?.stop();
      strip.jump(target);
      pill.jump(activeTop);
      return;
    }
    if (before.index === active) return;
    const velocity = pendingVelocity.current;
    pendingVelocity.current = null;
    if (Math.abs(active - before.index) > 3 && velocity === null) {
      strip.jump(target + Math.sign(active - before.index) * 2 * PITCH);
    }
    stripRun.current?.stop();
    stripRun.current = animate(
      strip,
      target,
      velocity === null ? springs.glide : { ...springs.glide, velocity },
    );
    pillRun.current?.stop();
    pillRun.current = animate(pill, activeTop, springs.glide);
  }, [active, sig, activeTop, motionSafe, pill, strip]);

  React.useEffect(
    () => () => {
      stripRun.current?.stop();
      pillRun.current?.stop();
      pressRun.current?.stop();
    },
    [],
  );

  // Counts are spoken once typing settles, not per keystroke.
  React.useEffect(() => {
    if (status !== "ready") return;
    const timer = window.setTimeout(() => {
      const realCount = options.filter((o) => o.item).length;
      setSaid(
        realCount
          ? `${realCount} ${realCount === 1 ? "result" : "results"}.`
          : `No results. ${createLabel} “${q.trim()}” is available.`,
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [q, status, options, createLabel]);

  const reveal = (index: number) => {
    const list = listRef.current;
    const top = tops[index];
    if (!list || top === undefined) return;
    const firstInSection = sections.some(
      (s) => s.options[0] && s.options[0] === options[index],
    );
    const head = firstInSection ? HEADER_H : 0;
    if (top - head - LIST_PAD < list.scrollTop) {
      list.scrollTop = Math.max(0, top - head - LIST_PAD);
    } else if (top + rowH + LIST_PAD > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + rowH + LIST_PAD - list.clientHeight;
    }
  };

  /** A velocity kick from rest: the strip leaves and comes back, never past it. */
  const bump = (direction: number) => {
    if (!motionSafe) return;
    stripRun.current?.stop();
    stripRun.current = animate(strip, TOP0 - active * PITCH, {
      ...springs.glide,
      velocity: -direction * 900,
    });
  };

  const move = (
    next: number,
    opts: { velocity?: number; scroll?: boolean; bump?: boolean } = {},
  ) => {
    const count = options.length;
    if (!count) return;
    const to = clamp(next, 0, count - 1);
    if (to === active) {
      if (opts.bump && next !== to) bump(Math.sign(next - active));
      else if (opts.velocity !== undefined) {
        // A drag released on the card it started from settles back with its throw.
        stripRun.current?.stop();
        stripRun.current = animate(strip, TOP0 - active * PITCH, {
          ...springs.glide,
          velocity: opts.velocity,
        });
      }
      return;
    }
    const option = options[to];
    if (!option) return;
    pendingVelocity.current = opts.velocity ?? null;
    if (highlighted === undefined) setOwnHi(option.key);
    onHighlight?.(option.item ?? null);
    if (opts.scroll !== false) reveal(to);
  };
  const moveRef = React.useRef(move);
  React.useEffect(() => {
    moveRef.current = move;
  });

  const pulse = (key: string) => {
    setFlash((f) => ({ key, n: (f?.n ?? 0) + 1 }));
    if (!motionSafe) return;
    // Starting at rest with a downward velocity is a press and release in one
    // spring: two keyframes on a spring would drop the middle one.
    pressRun.current?.stop();
    pressRun.current = animate(press, 1, { ...springs.snap, velocity: -2 });
  };

  const choose = (index: number, how: "open" | "beside") => {
    const option = options[index];
    if (!option) return;
    if (option.create !== undefined) {
      if (how === "open") {
        pulse(option.key);
        onCreate?.(option.create);
      }
      return;
    }
    const item = option.item;
    if (!item) return;
    if (how === "beside") {
      setBeside((list) => (list.includes(item.id) ? list : [...list, item.id]));
      setGhost((n) => n + 1);
      setSaid(`Opened ${item.title} beside.`);
      onOpenBeside?.(item);
      return;
    }
    pulse(option.key);
    onSelect?.(item);
  };

  const setQ = (value: string) => {
    if (query === undefined) setOwnQuery(value);
    onQueryChange?.(value);
    // Nothing is highlighted while the results are not there to show it.
    const next =
      status === "ready"
        ? buildSections(
            items,
            groups,
            recent,
            value,
            Math.max(1, maxResults),
          ).flatMap((section) => section.options)[0]
        : undefined;
    if (highlighted === undefined) setOwnHi(next?.key ?? null);
    onHighlight?.(next?.item ?? null);
    listRef.current?.scrollTo({ top: 0 });
  };

  const rowCentre = (index: number) => {
    const list = listRef.current;
    const top = tops[index] ?? 0;
    return top - (list?.scrollTop ?? 0) + rowH / 2 - BODY_H / 2;
  };

  const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    const atEnd =
      field.selectionStart === field.value.length &&
      field.selectionEnd === field.value.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(active + 1, { bump: true });
        break;
      case "ArrowUp":
        event.preventDefault();
        move(active - 1, { bump: true });
        break;
      case "PageDown":
        event.preventDefault();
        move(active + 5, { bump: true });
        break;
      case "PageUp":
        event.preventDefault();
        move(active - 5, { bump: true });
        break;
      case "ArrowRight":
        if (narrow && !peek && atEnd && options.length) {
          event.preventDefault();
          setPeek({ from: rowCentre(active) });
        }
        break;
      case "ArrowLeft":
        if (peek) {
          event.preventDefault();
          setPeek(null);
        }
        break;
      case "Enter":
        if (!options.length) return;
        event.preventDefault();
        choose(active, event.metaKey || event.ctrlKey ? "beside" : "open");
        break;
      case "Escape":
        if (peek) {
          event.preventDefault();
          setPeek(null);
        } else if (q) {
          event.preventDefault();
          setQ("");
        } else if (onDismiss) {
          event.preventDefault();
          onDismiss();
        }
        break;
      default:
        break;
    }
  };

  /* --------------------------- long press to peek -------------------------- */

  const pressRef = React.useRef<{
    id: number;
    x: number;
    y: number;
    index: number;
    timer: number;
    fired: boolean;
  } | null>(null);
  const suppressClick = React.useRef(false);
  const lastPointer = React.useRef({ x: -1, y: -1 });

  const endPress = () => {
    const p = pressRef.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (p.fired) setPeek(null);
    pressRef.current = null;
  };

  React.useEffect(
    () => () => {
      const p = pressRef.current;
      if (p) window.clearTimeout(p.timer);
      pressRef.current = null;
    },
    [],
  );

  const rowIndexFrom = (target: EventTarget | null): number => {
    const row =
      target instanceof Element ? target.closest("[data-pp-row]") : null;
    const raw = row?.getAttribute("data-pp-row");
    return raw === null || raw === undefined ? -1 : Number(raw);
  };

  const onListPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (!narrow || event.button !== 0) return;
    const index = rowIndexFrom(event.target);
    if (index < 0) return;
    endPress();
    const list = event.currentTarget;
    const pointerId = event.pointerId;
    pressRef.current = {
      id: pointerId,
      x: event.clientX,
      y: event.clientY,
      index,
      fired: false,
      timer: window.setTimeout(() => {
        const p = pressRef.current;
        if (!p) return;
        p.fired = true;
        suppressClick.current = true;
        // Captured only now that the press has become a peek, so a plain
        // tap is never swallowed.
        try {
          list.setPointerCapture(pointerId);
        } catch {
          // The pointer may already be gone; the peek still closes on up.
        }
        moveRef.current(index, { scroll: false });
        setPeek({ from: rowCentre(index) });
      }, peekDelay),
    };
  };

  const onListPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = pressRef.current;
    if (p && p.id === event.pointerId) {
      if (!p.fired) {
        if (Math.hypot(event.clientX - p.x, event.clientY - p.y) > 6) {
          endPress();
        }
      } else {
        // While peeking, the finger flips through the rows it slides over.
        const to = clamp(
          p.index + Math.round((event.clientY - p.y) / rowH),
          0,
          options.length - 1,
        );
        if (to !== active) move(to, { scroll: false });
      }
      return;
    }
    if (event.pointerType !== "mouse") return;
    // Only real movement moves the highlight: a list scrolling under a still
    // cursor must not steal it from the keyboard.
    if (
      lastPointer.current.x === event.clientX &&
      lastPointer.current.y === event.clientY
    ) {
      return;
    }
    lastPointer.current = { x: event.clientX, y: event.clientY };
    const index = rowIndexFrom(event.target);
    if (index >= 0 && index !== active) move(index, { scroll: false });
  };

  // While a press is peeking, the list must not scroll under the finger.
  React.useEffect(() => {
    if (!listEl) return;
    const stop = (e: TouchEvent) => {
      if (pressRef.current?.fired) e.preventDefault();
    };
    listEl.addEventListener("touchmove", stop, { passive: false });
    return () => listEl.removeEventListener("touchmove", stop);
  }, [listEl]);

  /* ------------------------- the pane as a handle -------------------------- */

  const dragFrom = React.useRef(TOP0);
  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: !options.length,
    onStart: () => {
      stripRun.current?.stop();
      dragFrom.current = strip.get();
    },
    onMove: ({ offset }) => {
      if (!motionSafe) return;
      const last = TOP0 - (options.length - 1) * PITCH;
      strip.set(
        r2(rubberClamp(dragFrom.current + offset.y, last, TOP0, PITCH)),
      );
    },
    onEnd: ({ offset, velocity }) => {
      if (!motionSafe) {
        // A swipe still flips one card; it just does not travel.
        move(active + (offset.y < -40 ? 1 : offset.y > 40 ? -1 : 0));
        return;
      }
      const landing = project(strip.get(), velocity.y, 0.99);
      move(Math.round((TOP0 - landing) / PITCH), { velocity: velocity.y });
    },
    onCancel: () => move(active, { velocity: 0 }),
    onTap: () => choose(active, "open"),
  });

  React.useEffect(() => {
    if (!paneEl) return;
    let acc = 0;
    const onWheel = (event: WheelEvent) => {
      const { y } = wheelPixels(event);
      const { active: a, count } = latest.current;
      // At either end the wheel goes back to the page.
      if ((y > 0 && a >= count - 1) || (y < 0 && a <= 0)) return;
      event.preventDefault();
      acc += y;
      if (Math.abs(acc) >= 48) {
        const step = Math.sign(acc);
        acc = 0;
        moveRef.current(a + step);
      }
    };
    paneEl.addEventListener("wheel", onWheel, { passive: false });
    return () => paneEl.removeEventListener("wheel", onWheel);
  }, [paneEl]);

  /* --------------------------------- render -------------------------------- */

  const pending = new Set(pendingIds);
  const lo = Math.max(0, Math.min(active, near) - 2);
  const hi = Math.min(options.length - 1, Math.max(active, near) + 2);

  const renderCard = (option: Option) => {
    if (option.create !== undefined) {
      return <DraftPreview title={option.create} verb={createLabel} />;
    }
    const item = option.item;
    if (!item) return null;
    if (pending.has(item.id)) return <SkeletonPreview pulse={motionSafe} />;
    const custom = renderers?.[item.kind];
    if (custom) return custom(item, { now });
    if (item.kind === "person") return <PersonPreview item={item} now={now} />;
    if (item.kind === "file") return <FilePreview item={item} now={now} />;
    return <PagePreview item={item} now={now} />;
  };

  const filmstrip = (
    <div className="absolute inset-0 overflow-clip">
      {status !== "ready" ? (
        <div className={CARD_FRAME} style={{ top: TOP0, height: CARD_H }}>
          {status === "loading" ? <SkeletonPreview pulse={motionSafe} /> : null}
        </div>
      ) : !motionSafe ? (
        <AnimatePresence initial={false}>
          {activeOption ? (
            <motion.div
              key={activeOption.key}
              className={CARD_FRAME}
              style={{ top: TOP0, height: CARD_H }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: durations.fast }}
            >
              {renderCard(activeOption)}
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : (
        <motion.div
          className="absolute inset-0"
          style={{ scale: press, originY: 0.5 }}
        >
          {options.map((option, index) =>
            index < lo || index > hi ? null : (
              <StripCard
                key={option.key}
                index={index}
                strip={strip}
                fade={painted}
              >
                {renderCard(option)}
              </StripCard>
            ),
          )}
          <AnimatePresence>
            {ghost > 0 ? (
              <motion.span
                key={ghost}
                aria-hidden
                className="pointer-events-none absolute inset-x-3 rounded-3 border border-[var(--pp-accent)]"
                style={{ top: TOP0, height: CARD_H }}
                initial={{ opacity: 0.9, x: 0 }}
                animate={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.32, ease: easings.exit }}
                onAnimationComplete={() =>
                  setGhost((n) => (n === ghost ? 0 : n))
                }
              />
            ) : null}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );

  const kbd = mac ? "⌘" : "Ctrl";
  const realCount = options.filter((o) => o.item).length;

  return (
    <div
      ref={setRootEl}
      className={cn("@container w-full", className)}
      style={
        {
          "--pp-accent": ACCENTS[accent as PreviewPaletteAccent] ?? accent,
        } as React.CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-[46rem] flex-col overflow-clip rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_50px_color-mix(in_oklab,black_22%,transparent)]">
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-hairline px-3">
          {status === "loading" ? (
            <LoaderCircle
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-ink-3",
                motionSafe && "animate-spin",
              )}
            />
          ) : (
            <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeOption && status === "ready"
                ? `${uid}-opt-${activeOption.key}`
                : undefined
            }
            aria-label={label}
            aria-describedby={hintId}
            placeholder={placeholder}
            value={q}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setQ(event.currentTarget.value)}
            onKeyDown={onFieldKeyDown}
            className="h-8 min-w-0 flex-1 rounded-2 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring/25 focus-visible:outline-solid"
          />
          <kbd
            aria-hidden
            className="hidden h-5 shrink-0 items-center rounded-1 border border-hairline px-1.5 font-mono text-[10px] text-ink-3 @min-[34rem]:inline-flex"
          >
            esc
          </kbd>
        </div>
        <p id={hintId} className="sr-only">
          {narrow
            ? "Up and Down move. Enter opens. Right arrow at the end of the field peeks the preview."
            : "Up and Down move and flip the preview. Enter opens. Command or Control Enter opens beside."}
        </p>

        <div className="relative flex" style={{ height: BODY_H }}>
          <div
            ref={(node) => {
              listRef.current = node;
              setListEl(node);
            }}
            onPointerDown={onListPointerDown}
            onPointerMove={onListPointerMove}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onContextMenu={(event) => {
              if (pressRef.current) event.preventDefault();
            }}
            // Focus stays in the field; the scroller is not a tab stop of its own.
            tabIndex={-1}
            className="relative flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            <div
              id={listId}
              role="listbox"
              aria-label={label}
              aria-busy={status === "loading" || undefined}
              className="relative"
              style={{ height: status === "ready" ? listHeight : undefined }}
            >
              {status === "ready" && options.length ? (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-1.5 top-0 rounded-2 bg-[color-mix(in_oklab,var(--pp-accent)_13%,transparent)]"
                  style={{ y: pill, height: rowH }}
                >
                  <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-[var(--pp-accent)]" />
                </motion.div>
              ) : null}

              {status === "loading" ? (
                <div aria-hidden className="flex flex-col gap-1 p-1.5">
                  {[70, 52, 64, 46, 58, 40].map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 px-1.5"
                      style={{ height: rowH }}
                    >
                      <span className="size-6 shrink-0 rounded-2 bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]" />
                      <span
                        className={cn(
                          "h-2.5 rounded-full bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]",
                          motionSafe && "animate-pulse",
                        )}
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="relative" style={{ paddingTop: LIST_PAD }}>
                  {sections.map((section) => {
                    const headId = `${uid}-g-${section.id}`;
                    return (
                      <div
                        key={section.id}
                        role="group"
                        aria-labelledby={headId}
                      >
                        {section.note ? (
                          <p
                            id={headId}
                            className="flex items-center px-3 text-xs text-ink-3"
                            style={{ height: NOTE_H }}
                          >
                            {section.note}
                          </p>
                        ) : (
                          <p
                            id={headId}
                            className="flex items-end px-3 pb-1.5 text-[10.5px] font-medium tracking-[0.06em] text-ink-3 uppercase"
                            style={{ height: HEADER_H }}
                          >
                            {section.label}
                          </p>
                        )}
                        {section.options.map((option) => {
                          const index = options.indexOf(option);
                          const on = index === active;
                          const item = option.item;
                          const isBeside = item
                            ? beside.includes(item.id)
                            : false;
                          const sub = item ? subtitleOf(item) : "";
                          const name = item
                            ? `${item.title}, ${KIND_LABEL[item.kind]}${sub ? `, ${sub}` : ""}${isBeside ? ", open beside" : ""}`
                            : `${createLabel} “${option.create ?? ""}”`;
                          return (
                            <div
                              key={option.key}
                              id={`${uid}-opt-${option.key}`}
                              role="option"
                              aria-selected={on}
                              aria-label={name}
                              data-pp-row={index}
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={() => {
                                if (suppressClick.current) {
                                  suppressClick.current = false;
                                  return;
                                }
                                inputRef.current?.focus();
                                choose(index, "open");
                              }}
                              className="relative z-10 flex cursor-pointer items-center gap-2.5 px-3 select-none [-webkit-touch-callout:none]"
                              style={{ height: rowH }}
                            >
                              {flash?.key === option.key ? (
                                <motion.span
                                  key={flash.n}
                                  aria-hidden
                                  className="pointer-events-none absolute inset-x-1.5 inset-y-0 rounded-2 bg-[color-mix(in_oklab,var(--pp-accent)_26%,transparent)]"
                                  initial={{ opacity: 1 }}
                                  animate={{ opacity: 0 }}
                                  transition={{
                                    duration: durations.slow,
                                    ease: easings.enter,
                                  }}
                                />
                              ) : null}
                              <RowIcon option={option} density={listDensity} />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span
                                  title={item?.title}
                                  className={cn(
                                    "truncate text-[13px] leading-tight",
                                    on ? "text-foreground" : "text-ink-2",
                                    !item && "text-[var(--pp-accent)]",
                                  )}
                                >
                                  {item ? (
                                    <Highlighted
                                      text={item.title}
                                      hits={option.hits}
                                    />
                                  ) : (
                                    `${createLabel} “${option.create ?? ""}”`
                                  )}
                                </span>
                                {listDensity === "roomy" && sub ? (
                                  <span className="truncate text-[11px] leading-tight text-ink-3">
                                    {sub}
                                  </span>
                                ) : null}
                              </span>
                              {listDensity !== "roomy" && sub ? (
                                <span className="hidden max-w-[42%] truncate text-[11px] text-ink-3 @min-[34rem]:block">
                                  {sub}
                                </span>
                              ) : null}
                              {isBeside ? (
                                <motion.span
                                  aria-hidden
                                  className="shrink-0 text-[var(--pp-accent)]"
                                  initial={
                                    motionSafe
                                      ? { scale: 0.5, opacity: 0 }
                                      : { opacity: 0 }
                                  }
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={
                                    motionSafe
                                      ? springs.snap
                                      : { duration: durations.fast }
                                  }
                                >
                                  <PanelRight className="size-3.5" />
                                </motion.span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {status === "error" ? (
              <div className="flex flex-col items-start gap-3 p-4">
                <p className="text-[13px] text-foreground">
                  The wiki didn’t answer.
                </p>
                <p className="text-xs text-ink-3">
                  Your recent pages are safe; the search will be back in a
                  moment.
                </p>
                <button
                  type="button"
                  onClick={() => onRetry?.()}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </button>
              </div>
            ) : null}
          </div>

          {!narrow ? (
            <div
              ref={setPaneEl}
              aria-hidden
              {...drag}
              className="relative hidden shrink-0 cursor-grab touch-pan-x border-l border-hairline bg-surface-1 select-none active:cursor-grabbing @min-[34rem]:block"
              style={{ width: `${width}%` }}
            >
              {filmstrip}
            </div>
          ) : null}

          <AnimatePresence>
            {narrow && peek ? (
              <motion.div
                key="peek"
                aria-hidden
                className="absolute inset-0 z-20 bg-popover"
                initial={
                  motionSafe
                    ? { opacity: 0, scale: 0.94, y: r2(peek.from * 0.2) }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? 0.98 : 1,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={{
                  scale: motionSafe ? springs.snap : { duration: 0 },
                  y: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast, ease: easings.enter },
                }}
              >
                {filmstrip}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-3 py-2 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <ArrowUp aria-hidden className="size-3" />
            <ArrowDown aria-hidden className="size-3" />
            {narrow ? "move" : "flip"}
          </span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft aria-hidden className="size-3" />
            open
          </span>
          {narrow ? (
            <span className="inline-flex items-center gap-1">
              <kbd className="font-mono text-[10px]">→</kbd>
              peek
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <kbd className="font-mono text-[10px]">{`${kbd} ↵`}</kbd>
              beside
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] tabular-nums">
            {status === "ready"
              ? `${realCount} ${realCount === 1 ? "result" : "results"}`
              : status === "loading"
                ? "loading"
                : "offline"}
          </span>
        </div>
      </div>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}

function RowIcon({
  option,
  density,
}: {
  option: Option;
  density: PreviewPaletteDensity;
}) {
  const box = density === "compact" ? 20 : 24;
  const item = option.item;
  if (!item) {
    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-2 border border-dashed border-[var(--pp-accent)] text-[var(--pp-accent)]"
        style={{ width: box, height: box }}
      >
        <Plus className="size-3.5" />
      </span>
    );
  }
  if (item.kind === "person") return <Avatar name={item.title} size={box} />;
  const Icon =
    item.kind === "page"
      ? FileText
      : item.fileType === "image"
        ? FileImage
        : item.fileType === "sheet"
          ? FileSpreadsheet
          : item.fileType === "slides"
            ? Presentation
            : FileText;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-2 bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] text-ink-2"
      style={{ width: box, height: box }}
    >
      <Icon className="size-3.5" />
    </span>
  );
}
