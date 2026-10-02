"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  SearchX,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type IntegrationGrid = "cards" | "compact" | "list";
export type IntegrationSheet = "side" | "bottom" | "center";
export type IntegrationStatusStyle = "dot" | "pill" | "bar";
export type IntegrationSyncState = "synced" | "syncing" | "paused" | "error";

export type IntegrationScope = {
  id: string;
  /** What the integration may do, as a short clause: "Read files in shared folders". */
  label: string;
  /** A second, quieter line. */
  description?: string;
  /** Required scopes are locked on; the rest are a choice. */
  required?: boolean;
};

export type IntegrationSync = {
  state: IntegrationSyncState;
  /** When it last finished syncing: ms, a Date or an ISO string. */
  lastSync?: number | Date | string;
  /** What went wrong, for the error state: "Token expired". */
  message?: string;
};

export type Integration = {
  id: string;
  name: string;
  /** The directory's grouping: "Storage", "Messaging". */
  category: string;
  /** One line on what connecting it does. */
  description: string;
  /** Who makes it. */
  maker?: string;
  /** What it asks for on the permissions step. */
  scopes: IntegrationScope[];
  /** Any CSS colour for its glyph — pass a token, never a hex. Kept at a fixed lightness. */
  tint?: string;
  /** Which procedural mark its glyph draws, 0 to 5. @default seeded from the id */
  mark?: number;
  /** Its sync while connected. */
  sync?: IntegrationSync;
};

export type IntegrationHubProps = {
  /** The directory. @default defaultIntegrations */
  integrations?: Integration[];
  /** Controlled: the ids that are connected. */
  connected?: string[];
  /** Initial connected ids when uncontrolled. @default defaultIntegrationConnected */
  defaultConnected?: string[];
  /** Fires when a connect or disconnect lands, with every connected id. */
  onConnectedChange?: (ids: string[]) => void;
  /** Allow and connect was pressed, with the scopes granted. Return a promise to hold the sheet in "Connecting…". */
  onConnect?: (id: string, scopes: string[]) => void | Promise<unknown>;
  /** Disconnect was confirmed. Return a promise to hold the sheet until it lands. */
  onDisconnect?: (id: string) => void | Promise<unknown>;
  /** Sync now was pressed on a connected card. A promise keeps it syncing until it lands. */
  onSync?: (id: string) => void | Promise<unknown>;
  /** Controlled search text. */
  query?: string;
  /** Initial search text when uncontrolled. @default "" */
  defaultQuery?: string;
  /** Fires on every keystroke in the search, and on Clear. */
  onQueryChange?: (query: string) => void;
  /** Controlled category: "all", "connected" or a category name. */
  category?: string;
  /** Initial category when uncontrolled. @default "all" */
  defaultCategory?: string;
  /** Fires when a category is chosen. */
  onCategoryChange?: (category: string) => void;
  /** The directory's layout: cards with a description, compact tiles, or a list of rows. @default "cards" */
  grid?: IntegrationGrid;
  /** Where the permissions step comes from: a side sheet, a bottom sheet, or a dialog in the centre. @default "side" */
  sheet?: IntegrationSheet;
  /** How a connected card reads its sync: a dot, a tinted pill, or a stripe down its edge. @default "pill" */
  status?: IntegrationStatusStyle;
  /** Now (Date or ms), for "4 min ago". @default defaultIntegrationNow */
  now?: number | Date;
  /** How long ago, from a span in ms. @default "just now", "4 min ago", "2 h ago", "yesterday" */
  formatAgo?: (ms: number) => string;
  /** The account the permissions step says it signs in as. @default "dana@fieldline.app" */
  account?: string;
  /** Your product's name in the permissions step: "Fieldline will be able to". @default "Fieldline" */
  appName?: string;
  /** The directory has not arrived yet. @default false */
  loading?: boolean;
  /** The directory failed to load: the message to show. */
  error?: string | null;
  /** Try again was pressed after an error. */
  onRetry?: () => void;
  /** The panel's heading. @default "Integrations" */
  title?: string;
  /** A line under the heading. @default "Connect the tools you already use." */
  description?: string;
  /** The panel's accessible name. @default the title */
  label?: string;
  /** A clack for switches and categories, a pop for Allow, Disconnect and Sync now. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* -------------------------------- defaults -------------------------------- */

const MIN = 60_000;
const HOUR = 3_600_000;

/** 2 October 2026, 09:30 UTC. */
export const defaultIntegrationNow = Date.UTC(2026, 9, 2, 9, 30);

const TINT = {
  basinworks: "oklch(from var(--accent) 0.6 0.12 calc(h - 62))",
  waylight: "var(--warn)",
  gaugeworks: "var(--accent)",
  fernworks: "var(--success)",
  coldbrook: "var(--danger)",
};

const read = (what: string): IntegrationScope => ({
  id: `read-${what.split(" ")[0]}`,
  label: `Read ${what}`,
  required: true,
});

export const defaultIntegrations: Integration[] = [
  {
    id: "basin-drive",
    name: "Basinworks Drive",
    maker: "Basinworks",
    category: "Storage",
    description: "Sync shared folders and attach files to routes and depots.",
    tint: TINT.basinworks,
    mark: 0,
    scopes: [
      read("files in shared folders"),
      { id: "write-files", label: "Create and update files" },
      {
        id: "read-sharing",
        label: "See who files are shared with",
        description: "Shows owners on attached files.",
      },
    ],
    sync: { state: "synced", lastSync: defaultIntegrationNow - 4 * MIN },
  },
  {
    id: "waylight-chat",
    name: "Waylight Chat",
    maker: "Waylight",
    category: "Messaging",
    description: "Post route alerts and the daily digest to team channels.",
    tint: TINT.waylight,
    mark: 3,
    scopes: [
      read("channel names"),
      { id: "post", label: "Post messages as Fieldline", required: true },
      { id: "dm", label: "Send direct messages to people" },
    ],
    sync: { state: "paused", lastSync: defaultIntegrationNow - 38 * MIN },
  },
  {
    id: "gauge-metrics",
    name: "Gaugeworks Metrics",
    maker: "Gaugeworks",
    category: "Analytics",
    description: "Send product events and pin live dashboards to projects.",
    tint: TINT.gaugeworks,
    mark: 2,
    scopes: [
      read("dashboards and saved views"),
      { id: "events", label: "Send events from Fieldline", required: true },
    ],
    sync: {
      state: "error",
      lastSync: defaultIntegrationNow - 2 * HOUR - 12 * MIN,
      message: "Token expired",
    },
  },
  {
    id: "fern-ci",
    name: "Fernworks CI",
    maker: "Fernworks",
    category: "Developer",
    description: "Run checks on every change and report status on the route.",
    tint: TINT.fernworks,
    mark: 5,
    scopes: [
      read("repositories and pipelines"),
      { id: "status", label: "Report check status", required: true },
      { id: "trigger", label: "Start and cancel pipelines" },
    ],
  },
  {
    id: "coldbrook-ledger",
    name: "Coldbrook Ledger",
    maker: "Coldbrook",
    category: "Finance",
    description: "Reconcile depot invoices and payouts every night.",
    tint: TINT.coldbrook,
    mark: 4,
    scopes: [
      read("invoices and payouts"),
      { id: "export", label: "Export reports to Coldbrook" },
    ],
  },
  {
    id: "waylight-mail",
    name: "Waylight Mail",
    maker: "Waylight",
    category: "Messaging",
    description: "Send delivery updates from your own domain.",
    tint: TINT.waylight,
    mark: 1,
    scopes: [
      { id: "send", label: "Send email on your behalf", required: true },
      { id: "bounces", label: "Read bounces and replies" },
    ],
  },
  {
    id: "fern-deploy",
    name: "Fernworks Deploy",
    maker: "Fernworks",
    category: "Developer",
    description: "Promote builds and roll back from the release view.",
    tint: TINT.fernworks,
    mark: 1,
    scopes: [
      read("environments"),
      { id: "deploy", label: "Promote and roll back builds", required: true },
    ],
  },
  {
    id: "basin-calendar",
    name: "Basinworks Calendar",
    maker: "Basinworks",
    category: "Productivity",
    description: "Show shift schedules and book loading bays.",
    tint: TINT.basinworks,
    mark: 4,
    scopes: [
      read("calendars you share"),
      { id: "book", label: "Create and move events" },
    ],
  },
  {
    id: "gauge-warehouse",
    name: "Gaugeworks Warehouse",
    maker: "Gaugeworks",
    category: "Analytics",
    description: "Stream route and fleet tables to your warehouse hourly.",
    tint: TINT.gaugeworks,
    mark: 0,
    scopes: [
      {
        id: "write-tables",
        label: "Write tables to a dataset",
        required: true,
      },
      { id: "schema", label: "Create datasets and schemas" },
    ],
  },
  {
    id: "coldbrook-payroll",
    name: "Coldbrook Payroll",
    maker: "Coldbrook",
    category: "Finance",
    description: "Export driver hours at the end of each pay period.",
    tint: TINT.coldbrook,
    mark: 2,
    scopes: [
      read("pay periods"),
      { id: "hours", label: "Send approved hours", required: true },
    ],
  },
  {
    id: "basin-notes",
    name: "Basinworks Notes",
    maker: "Basinworks",
    category: "Productivity",
    description: "Link specs and depot notes to the routes they describe.",
    tint: TINT.basinworks,
    mark: 3,
    scopes: [
      read("notes in linked spaces"),
      { id: "link", label: "Add backlinks to notes" },
    ],
  },
  {
    id: "fern-tickets",
    name: "Fernworks Tickets",
    maker: "Fernworks",
    category: "Productivity",
    description: "Turn driver feedback into tracked tickets.",
    tint: TINT.fernworks,
    mark: 2,
    scopes: [
      { id: "create", label: "Create tickets", required: true },
      read("ticket status"),
      { id: "comment", label: "Comment as Fieldline" },
    ],
  },
];

export const defaultIntegrationConnected = [
  "basin-drive",
  "waylight-chat",
  "gauge-metrics",
];

/* --------------------------------- helpers -------------------------------- */

const toMs = (t: number | Date | string | undefined): number | null => {
  if (t === undefined) return null;
  if (typeof t === "number") return t;
  if (typeof t === "string") {
    const ms = Date.parse(t);
    return Number.isNaN(ms) ? null : ms;
  }
  return t.getTime();
};

const agoDefault = (ms: number) => {
  if (ms < 45_000) return "just now";
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))} min ago`;
  if (ms < 24 * HOUR) return `${Math.round(ms / HOUR)} h ago`;
  if (ms < 48 * HOUR) return "yesterday";
  return `${Math.round(ms / (24 * HOUR))} days ago`;
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid";

const STATE: Record<
  IntegrationSyncState,
  { label: string; text: string; bg: string; pill: string }
> = {
  synced: {
    label: "Synced",
    text: "text-success",
    bg: "bg-success",
    pill: "bg-success/12 text-success",
  },
  syncing: {
    label: "Syncing",
    text: "text-cobalt-bright",
    bg: "bg-cobalt-bright",
    pill: "bg-cobalt-wash text-cobalt-bright",
  },
  paused: {
    label: "Paused",
    text: "text-ink-3",
    bg: "bg-ink-3",
    pill: "bg-surface-2 text-ink-3",
  },
  error: {
    label: "Needs attention",
    text: "text-danger",
    bg: "bg-danger",
    pill: "bg-danger/12 text-danger",
  },
};

/* --------------------------------- pieces --------------------------------- */

/** A seeded mark on a pigment tile: the same glyph on the server and the browser. */
function Glyph({ item, size = 32 }: { item: Integration; size?: number }) {
  const mark = (item.mark ?? hash(item.id)) % 6;
  const tint = item.tint ?? "var(--accent)";
  return (
    <svg
      aria-hidden
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className="shrink-0"
    >
      <rect
        width="32"
        height="32"
        rx="8"
        style={{ fill: `oklch(from ${tint} 0.6 0.13 h)` }}
      />
      <rect
        width="32"
        height="32"
        rx="8"
        fill="none"
        strokeWidth="1"
        style={{ stroke: "color-mix(in oklab, white 22%, transparent)" }}
      />
      <g
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {mark === 0 ? <circle cx="16" cy="16" r="6.5" /> : null}
        {mark === 1 ? <path d="M16 9.5 22.5 21.5H9.5Z" /> : null}
        {mark === 2 ? <path d="M10.5 22v-5M16 22V10M21.5 22v-8" /> : null}
        {mark === 3 ? <path d="M8.5 18c2.5-5 5-5 7.5 0s5 5 7.5 0" /> : null}
        {mark === 4 ? <path d="M16 8.5 23.5 16 16 23.5 8.5 16Z" /> : null}
        {mark === 5 ? (
          <path d="M9.5 13.5 16 9l6.5 4.5M9.5 21 16 16.5l6.5 4.5" />
        ) : null}
      </g>
    </svg>
  );
}

/** The name with the searched part marked. */
function Marked({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-1 bg-cobalt-wash text-foreground">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  );
}

/**
 * The connect switch. While its permissions step is open the knob waits
 * halfway on snap; Allow carries it on, Cancel sends it home.
 */
function ConnectSwitch({
  on,
  waiting,
  name,
  disabled,
  motionSafe,
  bind,
  onPress,
  hintId,
}: {
  hintId: string;
  on: boolean;
  waiting: boolean;
  name: string;
  disabled: boolean;
  motionSafe: boolean;
  bind: (node: HTMLButtonElement | null) => void;
  onPress: (el: HTMLButtonElement) => void;
}) {
  return (
    <button
      ref={bind}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Connect ${name}`}
      aria-describedby={hintId}
      disabled={disabled}
      onClick={(event) => onPress(event.currentTarget)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        on
          ? waiting
            ? "bg-cobalt-bright/60"
            : "bg-cobalt-bright"
          : waiting
            ? "bg-cobalt-bright/45"
            : "bg-ink-3/35",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className="block size-4 rounded-full bg-white shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)]"
        initial={false}
        animate={{ x: waiting ? 8 : on ? 16 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    </button>
  );
}

type SheetState = {
  id: string;
  kind: "connect" | "disconnect";
  /** The optional scopes ticked. */
  picked: string[];
  pending: boolean;
  error: string | null;
};

type Sync = {
  state: IntegrationSyncState;
  at: number | null;
  message?: string;
};

type Said = { n: number; text: string };

/**
 * A directory of integrations. Each card's switch connects or disconnects it
 * — but not at once: pressing it sends the knob halfway on snap and slides in
 * the permissions step as a sheet (from the side or the bottom on glide, or a
 * dialog rising in the centre on snap). The sheet lists what the integration
 * asks for, required scopes locked and the rest as checkboxes; Allow and
 * connect waits on `onConnect`'s promise, then the sheet leaves and the knob
 * completes its travel. Connected cards read their sync — synced, syncing,
 * paused or needing attention — with the time since the last sync, and Sync
 * now waits on `onSync`.
 *
 * The search filters by name, maker, category and description as you type:
 * cards that stay glide to their new cells, cards that go fade and shrink on
 * the exit ease while the rest close ranks, and cards that come back rise
 * from 0.96 on snap; the categories filter the same way.
 *
 * The sheet is a modal dialog: focus moves in, Tab stays inside, Escape and
 * the backdrop cancel, and focus returns to the switch. Categories are a
 * radiogroup; "/" jumps to the search and Escape clears it. Under reduced
 * motion cards swap places and fade, the sheet fades in place and the knob
 * moves without a spring — the connected state and its words still change.
 */
export function IntegrationHub({
  integrations = defaultIntegrations,
  connected,
  defaultConnected = defaultIntegrationConnected,
  onConnectedChange,
  onConnect,
  onDisconnect,
  onSync,
  query,
  defaultQuery = "",
  onQueryChange,
  category,
  defaultCategory = "all",
  onCategoryChange,
  grid = "cards",
  sheet = "side",
  status = "pill",
  now = defaultIntegrationNow,
  formatAgo = agoDefault,
  account = "dana@fieldline.app",
  appName = "Fieldline",
  loading = false,
  error = null,
  onRetry,
  title = "Integrations",
  description = "Connect the tools you already use.",
  label,
  sound = false,
  disabled = false,
  className,
}: IntegrationHubProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const today =
    typeof now === "number" ? now : (toMs(now) ?? defaultIntegrationNow);

  const [ownConnected, setOwnConnected] = React.useState(defaultConnected);
  const linked = connected ?? ownConnected;
  const isOn = (id: string) => linked.includes(id);

  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const text = query ?? ownQuery;
  const [ownCategory, setOwnCategory] = React.useState(defaultCategory);
  const chosen = category ?? ownCategory;

  const [syncs, setSyncs] = React.useState<Record<string, Sync>>({});
  const [open, setOpen] = React.useState<SheetState | null>(null);
  const [sheetNode, setSheetNode] = React.useState<HTMLDivElement | null>(null);
  const [returnTo, setReturnTo] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });

  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const switches = React.useRef(new Map<string, HTMLButtonElement>());
  const chips = React.useRef(new Map<string, HTMLButtonElement>());
  const timers = React.useRef(new Set<number>());
  const typing = React.useRef(0);
  /** What opened the sheet, so focus goes back to it (or to the switch). */
  const opener = React.useRef<HTMLElement | null>(null);
  const alive = React.useRef(true);

  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  };
  const panOf = (el?: Element | null) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /* ------------------------------ the catalog ----------------------------- */

  const categories = React.useMemo(() => {
    const seen: string[] = [];
    for (const it of integrations) {
      if (!seen.includes(it.category)) seen.push(it.category);
    }
    return seen;
  }, [integrations]);

  const options = [
    { id: "all", label: "All", count: integrations.length },
    { id: "connected", label: "Connected", count: linked.length },
    ...categories.map((c) => ({
      id: slug(c),
      label: c,
      count: integrations.filter((it) => it.category === c).length,
    })),
  ];
  const picked = options.some((o) => o.id === chosen) ? chosen : "all";

  const matches = (it: Integration, q: string, cat: string) => {
    if (cat === "connected" && !isOn(it.id)) return false;
    if (cat !== "all" && cat !== "connected" && slug(it.category) !== cat) {
      return false;
    }
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [it.name, it.maker ?? "", it.category, it.description].some((s) =>
      s.toLowerCase().includes(needle),
    );
  };
  const shown = integrations.filter((it) => matches(it, text, picked));

  const syncOf = (it: Integration): Sync => {
    const own = syncs[it.id];
    if (own) return own;
    if (it.sync) {
      return {
        state: it.sync.state,
        at: toMs(it.sync.lastSync),
        message: it.sync.message,
      };
    }
    return { state: "synced", at: null };
  };

  const attention = integrations.filter(
    (it) => isOn(it.id) && syncOf(it).state === "error",
  );

  /* -------------------------------- search -------------------------------- */

  const announceMatches = (q: string, cat: string) => {
    const n = integrations.filter((it) => matches(it, q, cat)).length;
    const where =
      cat === "all"
        ? ""
        : ` in ${options.find((o) => o.id === cat)?.label ?? cat}`;
    say(
      q.trim()
        ? n === 0
          ? `No integrations match “${q.trim()}”${where}.`
          : `${n} ${n === 1 ? "integration matches" : "integrations match"} “${q.trim()}”${where}.`
        : `${n} ${n === 1 ? "integration" : "integrations"}${where}.`,
    );
  };

  const setText = (q: string) => {
    if (query === undefined) setOwnQuery(q);
    onQueryChange?.(q);
    // Spoken once the typing pauses, never per keystroke.
    window.clearTimeout(typing.current);
    typing.current = later(450, () => announceMatches(q, picked));
  };

  const choose = (id: string, el?: Element | null) => {
    if (disabled || id === picked) return;
    audio.play("clack", { pitch: 1.2, gain: 0.32, pan: panOf(el) });
    if (category === undefined) setOwnCategory(id);
    onCategoryChange?.(id);
    announceMatches(text, id);
  };

  const onChipKeyDown = (event: React.KeyboardEvent, i: number) => {
    const n = options.length;
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (i + 1) % n
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (i - 1 + n) % n
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? n - 1
              : -1;
    const next = options[to];
    if (!next) return;
    event.preventDefault();
    const node = chips.current.get(next.id);
    node?.focus();
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
    choose(next.id, node);
  };

  /* ------------------------------ the sheet ------------------------------- */

  const optionalOf = (it: Integration) =>
    it.scopes.filter((s) => !s.required).map((s) => s.id);

  const press = (it: Integration, el: HTMLButtonElement) => {
    if (disabled || open) return;
    const on = isOn(it.id);
    audio.play("clack", {
      pitch: on ? 0.85 : 1.1,
      gain: 0.45,
      pan: panOf(el),
    });
    opener.current = el;
    setOpen({
      id: it.id,
      kind: on ? "disconnect" : "connect",
      picked: optionalOf(it),
      pending: false,
      error: null,
    });
  };

  const reconnect = (it: Integration, el: HTMLButtonElement) => {
    if (disabled || open) return;
    audio.play("clack", { pitch: 1.1, gain: 0.4, pan: panOf(el) });
    opener.current = el;
    setOpen({
      id: it.id,
      kind: "connect",
      picked: optionalOf(it),
      pending: false,
      error: null,
    });
  };

  const close = () => {
    if (!open || open.pending) return;
    setReturnTo(open.id);
    setOpen(null);
  };

  const confirm = (el: HTMLButtonElement) => {
    if (!open || open.pending) return;
    const it = integrations.find((x) => x.id === open.id);
    if (!it) return;
    audio.play("pop", {
      pitch: open.kind === "connect" ? 1.15 : 0.8,
      gain: 0.55,
      pan: panOf(el),
    });
    const id = it.id;
    const kind = open.kind;
    const again = kind === "connect" && linked.includes(id);
    const scopes = [
      ...it.scopes.filter((s) => s.required).map((s) => s.id),
      ...open.picked,
    ];
    const land = () => {
      if (!alive.current) return;
      const next =
        kind === "connect"
          ? linked.includes(id)
            ? linked
            : [...linked, id]
          : linked.filter((x) => x !== id);
      if (connected === undefined) setOwnConnected(next);
      if (next !== linked) onConnectedChange?.(next);
      setSyncs((s) => ({
        ...s,
        [id]:
          kind === "connect"
            ? { state: "synced", at: today }
            : { state: "paused", at: s[id]?.at ?? null },
      }));
      setReturnTo(id);
      setOpen(null);
      say(
        kind === "connect"
          ? `${it.name} ${again ? "reconnected" : "connected"} with ${scopes.length} ${scopes.length === 1 ? "permission" : "permissions"}.`
          : `${it.name} disconnected.`,
      );
    };
    const fail = () => {
      if (!alive.current) return;
      setOpen((o) =>
        o && o.id === id
          ? {
              ...o,
              pending: false,
              error:
                kind === "connect"
                  ? `${it.name} did not connect. Try again.`
                  : `${it.name} is still connected. Try again.`,
            }
          : o,
      );
      say(
        kind === "connect"
          ? `${it.name} did not connect.`
          : `${it.name} did not disconnect.`,
      );
    };
    let result: unknown;
    try {
      result =
        kind === "connect" ? onConnect?.(id, scopes) : onDisconnect?.(id);
    } catch {
      fail();
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setOpen((o) => (o ? { ...o, pending: true, error: null } : o));
      say(
        kind === "connect"
          ? `Connecting ${it.name}.`
          : `Disconnecting ${it.name}.`,
      );
      (result as Promise<unknown>).then(land, fail);
    } else {
      land();
    }
  };

  const syncNow = (it: Integration, el: HTMLButtonElement) => {
    if (disabled || syncOf(it).state === "syncing") return;
    audio.play("pop", { pitch: 1.3, gain: 0.4, pan: panOf(el) });
    const before = syncOf(it);
    const done = (ok: boolean) => {
      if (!alive.current) return;
      setSyncs((s) => ({
        ...s,
        [it.id]: ok
          ? { state: "synced", at: today }
          : { state: "error", at: before.at, message: "Sync failed" },
      }));
      say(ok ? `${it.name} synced.` : `${it.name} did not sync.`);
    };
    let result: unknown;
    try {
      result = onSync?.(it.id);
    } catch {
      done(false);
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSyncs((s) => ({ ...s, [it.id]: { state: "syncing", at: before.at } }));
      say(`Syncing ${it.name}.`);
      (result as Promise<unknown>).then(
        () => done(true),
        () => done(false),
      );
    } else {
      done(true);
    }
  };

  const onSheetKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Handled here, where focus is; the stage must not also close.
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), [tabindex='0']",
      ),
    ];
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
  };

  /* -------------------------------- effects ------------------------------- */

  // Focus moves into the sheet once it has arrived.
  React.useEffect(() => {
    if (!sheetNode) return;
    sheetNode
      .querySelector<HTMLElement>("[data-sheet-focus]")
      ?.focus({ preventScroll: true });
  }, [sheetNode]);

  // And back to the switch that opened it once the directory is live again.
  React.useEffect(() => {
    if (!returnTo || open) return;
    const back = opener.current;
    opener.current = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    else switches.current.get(returnTo)?.focus({ preventScroll: true });
    const t = window.setTimeout(() => setReturnTo(null), 0);
    return () => window.clearTimeout(t);
  }, [returnTo, open]);

  React.useEffect(() => {
    alive.current = true;
    const running = timers.current;
    return () => {
      alive.current = false;
      for (const t of running) window.clearTimeout(t);
      running.clear();
    };
  }, []);

  /* -------------------------------- render -------------------------------- */

  const current = open
    ? integrations.find((it) => it.id === open.id)
    : undefined;

  const statusLine = (it: Integration, compact: boolean) => {
    const sy = syncOf(it);
    const look = STATE[sy.state];
    const when =
      sy.state === "syncing"
        ? "now"
        : sy.at === null
          ? ""
          : formatAgo(Math.max(0, today - sy.at));
    const words =
      sy.state === "error"
        ? (sy.message ?? look.label)
        : sy.state === "syncing"
          ? "Syncing…"
          : `${look.label}${when ? ` · ${when}` : ""}`;
    if (compact) {
      return <span className="sr-only">{words}.</span>;
    }
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
        {status === "pill" ? (
          <span
            className={cn(
              "inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[10px] font-medium",
              look.pill,
            )}
          >
            {sy.state === "error" ? (sy.message ?? look.label) : look.label}
          </span>
        ) : status === "dot" ? (
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              look.bg,
              sy.state === "syncing" && motionSafe && "animate-pulse",
            )}
          />
        ) : null}
        <span
          className={cn(
            "min-w-0 truncate",
            status === "pill"
              ? "text-ink-3"
              : sy.state === "error"
                ? "text-danger"
                : "text-ink-2",
          )}
        >
          {status === "pill"
            ? sy.state === "syncing"
              ? "Syncing now"
              : when
                ? `Last sync ${when}`
                : ""
            : words}
        </span>
      </span>
    );
  };

  /** Sync now, or Reconnect for a card in error; icon-only where room is short. */
  const actions = (it: Integration, iconOnly = false) => {
    const sy = syncOf(it);
    if (sy.state === "error") {
      return (
        <button
          type="button"
          aria-label={iconOnly ? `Reconnect ${it.name}` : undefined}
          disabled={disabled}
          onClick={(event) => reconnect(it, event.currentTarget)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-1 rounded-2 text-[11px] font-medium text-cobalt-bright transition-colors hover:bg-cobalt-wash disabled:opacity-50",
            iconOnly ? "size-6" : "h-6 px-1.5",
            FOCUS_RING,
          )}
        >
          {iconOnly ? (
            <RotateCcw aria-hidden className="size-3.5 text-danger" />
          ) : (
            "Reconnect"
          )}
        </button>
      );
    }
    const spinning = sy.state === "syncing";
    return (
      <button
        type="button"
        aria-label={spinning ? `${it.name} is syncing` : `Sync ${it.name} now`}
        aria-disabled={spinning || disabled || undefined}
        onClick={(event) => syncNow(it, event.currentTarget)}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors",
          spinning || disabled
            ? "cursor-default"
            : "hover:bg-surface-2 hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <RefreshCw
          aria-hidden
          className={cn(
            "size-3.5",
            spinning && "text-cobalt-bright",
            spinning && motionSafe && "animate-spin",
          )}
        />
      </button>
    );
  };

  const stripe = (it: Integration) => {
    if (status !== "bar" || !isOn(it.id)) return null;
    const sy = syncOf(it);
    return (
      <span
        aria-hidden
        className={cn(
          "absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full",
          STATE[sy.state].bg,
          sy.state === "syncing" && motionSafe && "animate-pulse",
        )}
      />
    );
  };

  const card = (it: Integration) => {
    const on = isOn(it.id);
    const nameId = `${uid}-${it.id}-name`;
    const sw = (
      <ConnectSwitch
        on={on}
        waiting={open?.id === it.id}
        name={it.name}
        hintId={`${uid}-switch-hint`}
        disabled={disabled}
        motionSafe={motionSafe}
        bind={(node) => {
          if (node) switches.current.set(it.id, node);
          else switches.current.delete(it.id);
        }}
        onPress={(el) => press(it, el)}
      />
    );
    const optional = it.scopes.filter((s) => !s.required).length;
    const asks = `Asks for ${it.scopes.length} ${it.scopes.length === 1 ? "permission" : "permissions"}${optional ? `, ${optional} optional` : ""}`;

    if (grid === "list") {
      return (
        <article
          aria-labelledby={nameId}
          className="relative flex items-center gap-3 px-3 py-2.5"
        >
          {stripe(it)}
          <Glyph item={it} size={28} />
          <div className="min-w-0 flex-1">
            <h3
              id={nameId}
              className="truncate text-[13px] font-medium text-foreground"
            >
              <Marked text={it.name} query={text} />
            </h3>
            <p className="truncate text-[12px] text-ink-3">{it.description}</p>
          </div>
          {on ? (
            <>
              <span className="hidden shrink-0 @min-[36rem]/hub:flex">
                {statusLine(it, false)}
              </span>
              <span className="@min-[36rem]/hub:hidden">
                {statusLine(it, true)}
              </span>
              <span className="hidden @min-[36rem]/hub:flex">
                {actions(it)}
              </span>
              <span className="flex @min-[36rem]/hub:hidden">
                {actions(it, true)}
              </span>
            </>
          ) : (
            <span className="hidden shrink-0 text-[11px] text-ink-3 @min-[36rem]/hub:inline">
              {it.category}
            </span>
          )}
          {sw}
        </article>
      );
    }

    if (grid === "compact") {
      const sy = syncOf(it);
      return (
        <article
          aria-labelledby={nameId}
          className="relative flex h-full items-center gap-2.5 rounded-3 border border-hairline bg-surface-1 py-2.5 pr-2.5 pl-3"
        >
          {stripe(it)}
          <span className="relative shrink-0">
            <Glyph item={it} size={28} />
            {on && status !== "bar" ? (
              <span
                aria-hidden
                className={cn(
                  "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-[var(--color-surface-1)]",
                  STATE[sy.state].bg,
                )}
              />
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id={nameId}
              className="truncate text-[13px] font-medium text-foreground"
            >
              <Marked text={it.name} query={text} />
            </h3>
            <p className="truncate text-[11px] text-ink-3">{it.category}</p>
          </div>
          {on ? (
            <>
              {statusLine(it, true)}
              {actions(it, true)}
            </>
          ) : null}
          {sw}
        </article>
      );
    }

    return (
      <article
        aria-labelledby={nameId}
        className="relative flex h-full flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3.5"
      >
        {stripe(it)}
        <div className="flex items-start gap-3">
          <Glyph item={it} />
          <div className="min-w-0 flex-1">
            <h3
              id={nameId}
              className="truncate text-[13px] leading-5 font-medium text-foreground"
            >
              <Marked text={it.name} query={text} />
            </h3>
            <p className="truncate text-[11px] text-ink-3">
              {it.category}
              {it.maker ? ` · ${it.maker}` : ""}
            </p>
          </div>
          {sw}
        </div>
        <p className="line-clamp-2 text-[12px] leading-4 text-ink-2">
          {it.description}
        </p>
        <AnimatePresence initial={false}>
          {on ? (
            <motion.div
              key="sync"
              className="mt-auto overflow-clip"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: durations.fast }
              }
            >
              <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2">
                {statusLine(it, false)}
                {actions(it)}
              </div>
            </motion.div>
          ) : (
            <motion.p
              key="asks"
              className="mt-auto truncate border-t border-hairline pt-2 text-[11px] text-ink-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {asks}
            </motion.p>
          )}
        </AnimatePresence>
      </article>
    );
  };

  const directory = (
    <div className="@container/hub min-w-0 @min-[68rem]:col-start-2 @min-[68rem]:row-start-2">
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3 border border-dashed border-hairline-strong px-6 py-12 text-center">
          <SearchX aria-hidden className="size-5 text-ink-3" />
          <p className="text-[13px] text-foreground">
            {text.trim()
              ? `No integrations match “${text.trim()}”.`
              : "Nothing here yet."}
          </p>
          {text.trim() ? (
            <button
              type="button"
              onClick={() => {
                setText("");
                searchRef.current?.focus();
              }}
              className={cn(
                "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              Clear search
            </button>
          ) : null}
        </div>
      ) : (
        <ul
          role="list"
          aria-label={`${title}, ${shown.length} shown`}
          className={cn(
            "relative",
            grid === "list"
              ? "flex flex-col divide-y divide-hairline overflow-clip rounded-3 border border-hairline bg-surface-1"
              : grid === "compact"
                ? "grid grid-cols-1 gap-2 @min-[30rem]/hub:grid-cols-2 @min-[52rem]/hub:grid-cols-3"
                : "grid grid-cols-1 gap-3 @min-[34rem]/hub:grid-cols-2 @min-[52rem]/hub:grid-cols-3",
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((it) => (
              <motion.li
                key={it.id}
                layout={motionSafe ? "position" : false}
                initial={
                  motionSafe ? { opacity: 0, scale: 0.96 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        scale: 0.96,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: durations.fast } }
                }
                transition={
                  motionSafe
                    ? {
                        layout: springs.glide,
                        scale: springs.snap,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
                className="min-w-0"
              >
                {card(it)}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );

  const searchBox = (
    <div className="flex items-center gap-3 @min-[68rem]:col-start-2 @min-[68rem]:row-start-1">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
        />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search integrations"
          placeholder="Search integrations"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Escape clears a search with text in it; an empty one is not
            // ours to handle.
            if (event.key === "Escape" && text) {
              event.preventDefault();
              setText("");
            }
          }}
          className={cn(
            "h-9 w-full rounded-2 border border-hairline-strong bg-background pr-9 pl-9 text-[13px] text-foreground placeholder:text-ink-3 disabled:opacity-60 [&::-webkit-search-cancel-button]:appearance-none",
            FOCUS_RING,
          )}
        />
        {text ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setText("");
              searchRef.current?.focus();
            }}
            className={cn(
              "absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-1 text-ink-3 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : (
          <kbd
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-1 border border-hairline px-1.5 font-mono text-[10px] text-ink-3 @min-[40rem]:inline"
          >
            /
          </kbd>
        )}
      </div>
      <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 tabular-nums @min-[30rem]:inline">
        {shown.length} of {integrations.length}
      </span>
    </div>
  );

  const categoryGroup = (
    <div className="relative min-w-0 @min-[68rem]:sticky @min-[68rem]:top-0 @min-[68rem]:col-start-1 @min-[68rem]:row-span-2 @min-[68rem]:row-start-1 @min-[68rem]:self-start">
      <div
        role="radiogroup"
        aria-label="Category"
        className="-mx-3 flex [scrollbar-width:none] gap-1.5 overflow-x-auto [mask-image:linear-gradient(90deg,transparent,black_12px,black_calc(100%-12px),transparent)] px-3 @min-[40rem]:-mx-4 @min-[40rem]:px-4 @min-[68rem]:mx-0 @min-[68rem]:flex-col @min-[68rem]:gap-0.5 @min-[68rem]:overflow-visible @min-[68rem]:[mask-image:none] @min-[68rem]:px-0"
      >
        {options.map((o, i) => {
          const on = o.id === picked;
          return (
            <button
              key={o.id}
              ref={(node) => {
                if (node) chips.current.set(o.id, node);
                else chips.current.delete(o.id);
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={(event) => choose(o.id, event.currentTarget)}
              onKeyDown={(event) => onChipKeyDown(event, i)}
              className={cn(
                "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] whitespace-nowrap transition-colors @min-[68rem]:w-full @min-[68rem]:justify-between @min-[68rem]:rounded-2 @min-[68rem]:border-transparent @min-[68rem]:px-2.5",
                on
                  ? "border-transparent text-foreground"
                  : "border-hairline text-ink-2 hover:text-foreground",
                FOCUS_RING_IN,
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${uid}-category`}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-surface-2 @min-[68rem]:rounded-2"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span className="relative">{o.label}</span>
              <span className="relative font-mono text-[10px] text-ink-3 tabular-nums">
                {o.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const scopeRows = (it: Integration) =>
    it.scopes.map((s) => {
      const box = `${uid}-scope-${s.id}`;
      const on = !!s.required || !!open?.picked.includes(s.id);
      return (
        <li key={s.id} className="flex items-start gap-2.5 py-2">
          {s.required ? (
            <span className="flex size-4 shrink-0 translate-y-0.5 items-center justify-center rounded-1 bg-surface-2 text-ink-3">
              <Lock aria-hidden className="size-2.5" />
            </span>
          ) : (
            <input
              id={box}
              type="checkbox"
              checked={on}
              disabled={open?.pending}
              onChange={(event) => {
                const keep = event.currentTarget.checked;
                setOpen((o) =>
                  o
                    ? {
                        ...o,
                        picked: keep
                          ? [...o.picked, s.id]
                          : o.picked.filter((x) => x !== s.id),
                      }
                    : o,
                );
              }}
              className={cn(
                "mt-0.5 size-4 shrink-0 cursor-pointer rounded-1 accent-[var(--accent-bright)]",
                FOCUS_RING,
              )}
            />
          )}
          <span className="min-w-0 flex-1">
            {s.required ? (
              <span className="block text-[13px] text-foreground">
                {s.label}
                <span className="ml-1.5 text-[11px] text-ink-3">Required</span>
              </span>
            ) : (
              <label
                htmlFor={box}
                className="block cursor-pointer text-[13px] text-foreground"
              >
                {s.label}
              </label>
            )}
            {s.description ? (
              <span className="block text-[11px] text-ink-3">
                {s.description}
              </span>
            ) : null}
          </span>
        </li>
      );
    });

  const sheetPlace: Record<IntegrationSheet, string> = {
    side: "inset-y-0 right-0 w-full max-w-[22rem] border-l",
    bottom: "inset-x-0 bottom-0 max-h-[85%] rounded-t-4 border-t",
    center:
      "inset-x-4 top-1/2 mx-auto max-h-[calc(100%-2rem)] max-w-[24rem] -translate-y-1/2 rounded-4 border",
  };
  const sheetMotion = motionSafe
    ? sheet === "side"
      ? { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } }
      : sheet === "bottom"
        ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } }
        : {
            initial: { y: 16, scale: 0.97, opacity: 0 },
            animate: { y: 0, scale: 1, opacity: 1 },
            exit: { y: 16, scale: 0.97, opacity: 0 },
          }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };

  const sheetLayer = (
    <AnimatePresence>
      {open && current ? (
        <React.Fragment key="sheet">
          <motion.div
            aria-hidden
            onClick={close}
            className="absolute inset-0 z-30 bg-background/85 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          />
          <motion.div
            ref={setSheetNode}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${uid}-sheet-title`}
            aria-describedby={`${uid}-sheet-lede`}
            onKeyDown={onSheetKeyDown}
            className={cn(
              "absolute z-40 flex flex-col overflow-y-auto overscroll-contain border-hairline-strong bg-popover text-foreground shadow-[0_16px_40px_color-mix(in_oklab,black_22%,transparent)]",
              sheetPlace[sheet],
            )}
            initial={sheetMotion.initial}
            animate={sheetMotion.animate}
            exit={{
              ...sheetMotion.exit,
              transition: {
                duration: durations.base * 0.6,
                ease: easings.exit,
              },
            }}
            transition={
              !motionSafe
                ? { duration: durations.fast }
                : sheet === "center"
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : springs.glide
            }
          >
            <div className="flex items-start gap-3 border-b border-hairline p-4">
              <Glyph item={current} />
              <div className="min-w-0 flex-1">
                <h2
                  id={`${uid}-sheet-title`}
                  className="truncate text-sm font-semibold"
                >
                  {open.kind === "connect"
                    ? `Connect ${current.name}`
                    : `Disconnect ${current.name}?`}
                </h2>
                <p className="truncate text-[11px] text-ink-3">
                  {current.category}
                  {current.maker ? ` · by ${current.maker}` : ""}
                </p>
              </div>
              <button
                type="button"
                data-sheet-focus=""
                aria-label="Close"
                disabled={open.pending}
                onClick={close}
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              {open.kind === "connect" ? (
                <>
                  <p
                    id={`${uid}-sheet-lede`}
                    className="text-[12px] text-ink-2"
                  >
                    {appName} will be able to:
                  </p>
                  <ul role="list" className="divide-y divide-hairline">
                    {scopeRows(current)}
                  </ul>
                  <p className="text-[11px] leading-4 text-ink-3">
                    Signs in as {account}. Change permissions or disconnect at
                    any time.
                  </p>
                </>
              ) : (
                <p id={`${uid}-sheet-lede`} className="text-[13px] text-ink-2">
                  Syncing stops and {current.name} loses access to {appName}.
                  Anything already synced stays where it is, and you can
                  reconnect at any time.
                </p>
              )}
              {open.error ? (
                <p
                  role="alert"
                  className="flex items-center gap-1.5 text-[12px] text-danger"
                >
                  <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                  {open.error}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-hairline p-3">
              <button
                type="button"
                aria-disabled={open.pending || undefined}
                onClick={close}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  open.pending && "cursor-default opacity-50",
                  FOCUS_RING,
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                aria-disabled={open.pending || undefined}
                onClick={(event) => confirm(event.currentTarget)}
                className={cn(
                  "relative inline-flex h-8 items-center justify-center rounded-2 px-3.5 text-xs font-medium transition-colors",
                  open.kind === "connect"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  open.pending && "cursor-default",
                  FOCUS_RING,
                )}
              >
                <span className="grid">
                  <span
                    className={cn(
                      "col-start-1 row-start-1",
                      open.pending && "invisible",
                    )}
                  >
                    {open.kind === "connect"
                      ? "Allow and connect"
                      : "Disconnect"}
                  </span>
                  <span
                    aria-hidden={!open.pending}
                    className={cn(
                      "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
                      !open.pending && "invisible",
                    )}
                  >
                    <RefreshCw
                      aria-hidden
                      className={cn("size-3.5", motionSafe && "animate-spin")}
                    />
                    {open.kind === "connect" ? "Connecting…" : "Disconnecting…"}
                  </span>
                </span>
              </button>
            </div>
          </motion.div>
        </React.Fragment>
      ) : null}
    </AnimatePresence>
  );

  const body = () => {
    if (loading) {
      return (
        <div
          aria-busy="true"
          className="grid gap-3 p-3 @min-[40rem]:grid-cols-2 @min-[40rem]:p-4 @min-[68rem]:grid-cols-3"
        >
          <p className="sr-only">Loading integrations.</p>
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3.5"
            >
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-2 bg-surface-2" />
                <div className="h-3 w-28 rounded-1 bg-surface-2" />
              </div>
              <div className="h-3 rounded-1 bg-surface-2" />
              <div className="h-3 w-2/3 rounded-1 bg-surface-2" />
            </div>
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">{error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div className="grid gap-3 p-3 @min-[40rem]:p-4 @min-[68rem]:grid-cols-[11.5rem_minmax(0,1fr)] @min-[68rem]:gap-x-5">
        {searchBox}
        {categoryGroup}
        {directory}
      </div>
    );
  };

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          event.key === "/" &&
          !open &&
          target.tagName !== "INPUT" &&
          target.tagName !== "TEXTAREA"
        ) {
          event.preventDefault();
          searchRef.current?.focus();
        }
      }}
      className={cn(
        "@container relative isolate h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <div
        inert={!!open}
        className="absolute inset-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-semibold">
              {title}
            </h2>
            {description ? (
              <p className="truncate text-[11px] text-ink-3">{description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] uppercase">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-surface-2 px-2 text-ink-2">
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              {linked.length} connected
            </span>
            {attention.length > 0 ? (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-danger/12 px-2 text-danger">
                {attention.length} need{attention.length === 1 ? "s" : ""}{" "}
                attention
              </span>
            ) : null}
          </div>
        </header>
        {body()}
      </div>
      {sheetLayer}
      <span id={`${uid}-switch-hint`} className="sr-only">
        Opens a step to confirm.
      </span>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
