"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  CircleCheck,
  Gauge,
  MessageSquarePlus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
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

export type BridgeSeverity = 1 | 2 | 3 | 4;
export type BridgeState =
  "investigating" | "identified" | "monitoring" | "resolved";
export type BridgeRole = "commander" | "scribe" | "comms";
export type BridgeHealth = "down" | "degraded" | "recovering" | "ok";

export type BridgePerson = { id: string; name: string };

export type BridgeService = { id: string; name: string; health: BridgeHealth };

export type BridgeUpdate = {
  id: string;
  /** When it was posted, in ms. */
  at: number;
  /** A person's id. */
  author: string;
  text: string;
  /** Plain updates are posts; the rest are the bridge's own record of a change. @default "update" */
  kind?: "update" | "severity" | "state" | "role";
};

export type BridgeCheck = { id: string; label: string; done: boolean };

export type BridgeIncident = {
  /** Shown in the band, e.g. "INC-2417". */
  id: string;
  title: string;
  /** 1 is the most severe. */
  severity: BridgeSeverity;
  state: BridgeState;
  /** When it was opened, in ms. */
  openedAt: number;
  /** When the bridge last heard from the source, in ms. Older than `staleAfter` and it is flagged. */
  updatedAt: number;
  /** Who holds each role, by person id. */
  roles: Partial<Record<BridgeRole, string>>;
  services: BridgeService[];
  updates: BridgeUpdate[];
  checklist: BridgeCheck[];
};

export type BridgeStatus = "ready" | "loading" | "error";
export type BridgePalette = "heat" | "cool" | "ink";
export type BridgeDensity = "compact" | "cozy" | "roomy";
export type BridgeSide = "left" | "right";

export type IncidentBridgeProps = {
  /** Controlled incident; null reads all clear. */
  incident?: BridgeIncident | null;
  /** Initial incident when uncontrolled. @default defaultBridgeIncident */
  defaultIncident?: BridgeIncident | null;
  /** Fires with the whole incident after every change made on the bridge. */
  onIncidentChange?: (incident: BridgeIncident) => void;
  /** Severity was raised or lowered, from a press or an arrow key. */
  onSeverityChange?: (
    severity: BridgeSeverity,
    previous: BridgeSeverity,
  ) => void;
  /** An update was posted from the composer. It is already on the timeline. */
  onPostUpdate?: (update: BridgeUpdate) => void;
  /** Resolve was pressed. */
  onResolve?: (incident: BridgeIncident) => void;
  /** A role was handed to a person. */
  onAssignRole?: (role: BridgeRole, personId: string) => void;
  /** Refresh (stale data) or Retry (error) was pressed. */
  onRefresh?: () => void;
  /** Everyone who can hold a role or post. @default defaultBridgePeople */
  people?: BridgePerson[];
  /** Shown in the all-clear state: the last incident and when it was resolved. */
  lastIncident?: { id: string; resolvedAt: number };
  /** Whether the bridge's data has arrived. @default "ready" */
  status?: BridgeStatus;
  /** The moment ages count from, in ms — never read from the clock. @default defaultBridgeNow */
  now?: number;
  /** How old `updatedAt` may get before the data is flagged stale, in ms. @default 300000 */
  staleAfter?: number;
  /** The person posting from this bridge, by id. @default the first person */
  author?: string;
  /** The colours severity is drawn in: red to blue, violet to teal, or one ink whose weight carries it. @default "heat" */
  severityPalette?: BridgePalette;
  /** Entry padding, type size and row heights. @default "cozy" */
  density?: BridgeDensity;
  /** Which column the timeline takes at tablet width, and the side of the entries its rail runs on. @default "left" */
  timelineSide?: BridgeSide;
  /** Height of the bridge in px; its columns scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be posted, assigned or changed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Friday 9 October 2026, 14:42 UTC — forty-two minutes into the incident. */
export const defaultBridgeNow = Date.UTC(2026, 9, 9, 14, 42);
const OPEN = defaultBridgeNow - 42 * MIN;

export const defaultBridgePeople: BridgePerson[] = [
  { id: "ines", name: "Ines Varga" },
  { id: "tomas", name: "Tomas Reyes" },
  { id: "mara", name: "Mara Lind" },
  { id: "kenji", name: "Kenji Aoki" },
  { id: "priya", name: "Priya Nair" },
];

/** Checkout latency on Gaugeworks Pay, traced to the ledger's connection pool. */
export const defaultBridgeIncident: BridgeIncident = {
  id: "INC-2417",
  title: "Checkout latency on Gaugeworks Pay",
  severity: 2,
  state: "identified",
  openedAt: OPEN,
  updatedAt: defaultBridgeNow - MIN,
  roles: { commander: "ines", scribe: "tomas" },
  services: [
    { id: "ledger", name: "Ledger", health: "down" },
    { id: "pay", name: "Pay API", health: "degraded" },
    { id: "hooks", name: "Webhooks", health: "degraded" },
    { id: "checkout", name: "Checkout", health: "recovering" },
  ],
  updates: [
    {
      id: "u1",
      at: OPEN,
      author: "ines",
      text: "Paged on-call: checkout p95 above 4 s in two regions.",
    },
    {
      id: "u2",
      at: OPEN + 4 * MIN,
      author: "ines",
      text: "Severity set to SEV 2.",
      kind: "severity",
    },
    {
      id: "u3",
      at: OPEN + 9 * MIN,
      author: "tomas",
      text: "Ledger write latency has climbed since the 13:52 deploy.",
    },
    {
      id: "u4",
      at: OPEN + 17 * MIN,
      author: "ines",
      text: "Identified: the ledger primary's connection pool is exhausted.",
      kind: "state",
    },
    {
      id: "u5",
      at: OPEN + 28 * MIN,
      author: "mara",
      text: "Status page posted. Support has the reply macro.",
    },
    {
      id: "u6",
      at: OPEN + 39 * MIN,
      author: "tomas",
      text: "Rolled the ledger back to 2026.10.08-2; the pool is draining.",
    },
  ],
  checklist: [
    { id: "page", label: "Page on-call", done: true },
    { id: "status", label: "Open the status page", done: true },
    { id: "freeze", label: "Freeze deploys", done: true },
    { id: "support", label: "Brief support", done: false },
    { id: "confirm", label: "Confirm recovery", done: false },
    { id: "postmortem", label: "Write the postmortem", done: false },
  ],
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

type BandKey = BridgeSeverity | "quiet";

/**
 * Severity fills a band, so it is pigment: a hue at a fixed lightness that
 * reads the same in both themes. `wash` is how much of it tints the band.
 */
const PALETTES: Record<
  BridgePalette,
  Record<BandKey, { pigment: string; wash: number }>
> = {
  heat: {
    1: { pigment: "oklch(from var(--danger) 0.62 0.2 h)", wash: 18 },
    2: { pigment: "oklch(from var(--danger) 0.68 0.17 48)", wash: 16 },
    3: { pigment: "oklch(from var(--warn) 0.78 0.14 h)", wash: 16 },
    4: { pigment: "oklch(from var(--accent-bright) 0.64 0.16 h)", wash: 14 },
    quiet: { pigment: "oklch(from var(--success) 0.7 0.13 h)", wash: 12 },
  },
  cool: {
    1: { pigment: "oklch(from var(--accent-bright) 0.56 0.2 300)", wash: 18 },
    2: { pigment: "oklch(from var(--accent-bright) 0.62 0.16 335)", wash: 16 },
    3: { pigment: "oklch(from var(--accent-bright) 0.64 0.16 h)", wash: 15 },
    4: { pigment: "oklch(from var(--success) 0.7 0.1 195)", wash: 14 },
    quiet: { pigment: "oklch(from var(--success) 0.72 0.12 h)", wash: 12 },
  },
  ink: {
    1: { pigment: "oklch(from var(--ink-2) 0.5 0.02 h)", wash: 26 },
    2: { pigment: "oklch(from var(--ink-2) 0.56 0.02 h)", wash: 19 },
    3: { pigment: "oklch(from var(--ink-2) 0.62 0.02 h)", wash: 13 },
    4: { pigment: "oklch(from var(--ink-2) 0.68 0.02 h)", wash: 8 },
    quiet: { pigment: "oklch(from var(--success) 0.7 0.1 h)", wash: 10 },
  },
};

const SEV_WORD: Record<BridgeSeverity, string> = {
  1: "critical",
  2: "major",
  3: "minor",
  4: "low",
};

const STATE_WORD: Record<BridgeState, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const ROLE_WORD: Record<BridgeRole, string> = {
  commander: "Commander",
  scribe: "Scribe",
  comms: "Comms",
};

const ROLES: BridgeRole[] = ["commander", "scribe", "comms"];

const HEALTH: Record<
  BridgeHealth,
  { word: string; dot: string; text: string }
> = {
  down: {
    word: "Down",
    dot: "oklch(from var(--danger) 0.64 0.2 h)",
    text: "text-danger",
  },
  degraded: {
    word: "Degraded",
    dot: "oklch(from var(--warn) 0.78 0.14 h)",
    text: "text-warn",
  },
  recovering: {
    word: "Recovering",
    dot: "oklch(from var(--accent-bright) 0.64 0.16 h)",
    text: "text-cobalt-bright",
  },
  ok: {
    word: "Healthy",
    dot: "oklch(from var(--success) 0.7 0.13 h)",
    text: "text-success",
  },
};

const DENSITY: Record<
  BridgeDensity,
  { entry: string; text: string; row: string; gap: string; section: string }
> = {
  compact: {
    entry: "py-1.5",
    text: "text-[12px] leading-[17px]",
    row: "h-8",
    gap: "gap-3",
    section: "py-2.5",
  },
  cozy: {
    entry: "py-2.5",
    text: "text-[13px] leading-[19px]",
    row: "h-9",
    gap: "gap-4",
    section: "py-3",
  },
  roomy: {
    entry: "py-3.5",
    text: "text-[13px] leading-5",
    row: "h-10",
    gap: "gap-5",
    section: "py-4",
  },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const r3 = (v: number) => Math.round(v * 1000) / 1000;

const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

function ago(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** The severity a severity entry speaks of, so its pin keeps its colour. */
const sevIn = (text: string): BridgeSeverity | null => {
  const m = /SEV ([1-4])/.exec(text);
  return m ? (Number(m[1]) as BridgeSeverity) : null;
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2);

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function Tick({ on, motionSafe }: { on: boolean; motionSafe: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors duration-150",
        on
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-hairline-strong bg-card text-transparent",
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3">
        <motion.path
          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={
            motionSafe ? springs.flick : { duration: durations.blink }
          }
        />
      </svg>
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-2"
    >
      {initials(name)}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The bridge                                */
/* ----------------------------------------------------------------------- */

type Sweep = {
  key: BandKey;
  x: number;
  y: number;
  r: number;
  n: number;
  raise: boolean;
};

/**
 * One room for an incident. A band carries the severity as colour; under it
 * a toolbar, then the timeline — a slim time axis with a pin per update over
 * the updates themselves — beside the roles, the affected services and the
 * response checklist.
 *
 * Changing severity floods the band with the new colour outward from the
 * segment that was pressed: a circle clip opening to the band's far corner
 * on an enter tween, quicker when the incident is escalated than when it is
 * calmed. Every update drops in: its pin lands on the axis on recoil — a
 * landing — while the entry slides in at the top on glide and the rest glide
 * down to make room. Resolve sweeps the band to the quiet colour from the
 * button that resolved it and lights the postmortem.
 *
 * U posts an update, R hands out a role, S goes to severity (arrows then
 * change it); every change is announced. Data older than `staleAfter` is
 * flagged with its age, a null incident reads all clear, and below a 44rem
 * container the timeline moves under the band as one column. Under reduced
 * motion the band cross-fades, pins and entries fade in place, and every
 * colour, count and entry still changes.
 */
export function IncidentBridge({
  incident,
  defaultIncident = defaultBridgeIncident,
  onIncidentChange,
  onSeverityChange,
  onPostUpdate,
  onResolve,
  onAssignRole,
  onRefresh,
  people = defaultBridgePeople,
  lastIncident,
  status = "ready",
  now = defaultBridgeNow,
  staleAfter = 5 * MIN,
  author,
  severityPalette = "heat",
  density = "cozy",
  timelineSide = "left",
  height = 540,
  disabled = false,
  className,
}: IncidentBridgeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const composerId = `${uid}-composer`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const palette = PALETTES[severityPalette] ?? PALETTES.heat;

  const [own, setOwn] = React.useState<BridgeIncident | null>(defaultIncident);
  const inc = incident !== undefined ? incident : own;
  const me = author ?? people[0]?.id ?? "you";
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const resolved = inc?.state === "resolved";
  const bandKey: BandKey = !inc || resolved ? "quiet" : inc.severity;
  const stale = !!inc && !resolved && now - inc.updatedAt > staleAfter;
  const ready = status === "ready";
  const locked = disabled || !inc || !ready;

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // Stale data is spoken once, from the render that sees it go stale.
  const [spokenStale, setSpokenStale] = React.useState(stale);
  if (spokenStale !== stale) {
    setSpokenStale(stale);
    if (stale && inc) {
      setSaid((s) => ({
        n: s.n + 1,
        text: `Data is ${ago(now - inc.updatedAt).replace(" ago", "")} old.`,
      }));
    }
  }

  /* ------------------------------- the band ------------------------------ */

  const [base, setBase] = React.useState<BandKey>(bandKey);
  const [sweep, setSweep] = React.useState<Sweep | null>(null);
  const bandRef = React.useRef<HTMLDivElement | null>(null);
  const sevNodes = React.useRef(new Map<BridgeSeverity, HTMLElement>());
  const resolveRef = React.useRef<HTMLButtonElement | null>(null);
  const shownKey = sweep ? sweep.key : base;

  const startSweep = (
    key: BandKey,
    from: HTMLElement | null,
    raise: boolean,
  ) => {
    const band = bandRef.current;
    if (!band) {
      setBase(key);
      return;
    }
    const b = band.getBoundingClientRect();
    const f = from?.getBoundingClientRect();
    const x = f ? f.left + f.width / 2 - b.left : b.width;
    const y = f ? f.top + f.height / 2 - b.top : b.height / 2;
    const r = Math.max(
      Math.hypot(x, y),
      Math.hypot(b.width - x, y),
      Math.hypot(x, b.height - y),
      Math.hypot(b.width - x, b.height - y),
    );
    setSweep((s) => ({
      key,
      x: Math.round(x),
      y: Math.round(y),
      r: Math.ceil(r),
      n: (s?.n ?? 0) + 1,
      raise,
    }));
  };

  // A host that changes severity (or resolves) gets the same sweep, from the
  // matching segment; changes made here start their own sweep as they happen.
  const sweepTo = React.useRef(startSweep);
  React.useEffect(() => {
    sweepTo.current = startSweep;
  });
  React.useEffect(() => {
    if (bandKey === shownKey) return;
    const from =
      bandKey === "quiet" ? null : (sevNodes.current.get(bandKey) ?? null);
    sweepTo.current(
      bandKey,
      from,
      bandKey !== "quiet" && (shownKey === "quiet" || bandKey < shownKey),
    );
  }, [bandKey, shownKey]);

  /* ------------------------------ timeline ------------------------------- */

  const [mountIds] = React.useState(
    () => new Set((inc?.updates ?? []).map((u) => u.id)),
  );
  const [composing, setComposing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [nextState, setNextState] = React.useState<BridgeState | "">("");
  const [hovered, setHovered] = React.useState<string | null>(null);
  const counter = React.useRef(0);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [focusComposer, setFocusComposer] = React.useState(0);
  React.useEffect(() => {
    if (focusComposer) composerRef.current?.focus();
  }, [focusComposer]);

  const stamp = () =>
    Math.max(now, ...(inc?.updates ?? []).map((u) => u.at)) + 1000;
  const newId = () => {
    counter.current += 1;
    return `${idBase}-u${counter.current}`;
  };

  const commit = (next: BridgeIncident) => {
    if (incident === undefined) setOwn(next);
    onIncidentChange?.(next);
  };

  const entry = (
    text: string,
    kind: BridgeUpdate["kind"] = "update",
  ): BridgeUpdate => ({ id: newId(), at: stamp(), author: me, text, kind });

  /* ------------------------------- actions ------------------------------- */

  const setSeverity = (sev: BridgeSeverity) => {
    if (!inc || locked || resolved || sev === inc.severity) return;
    const previous = inc.severity;
    const raise = sev < previous;
    const words = `Severity ${raise ? "raised" : "lowered"} to SEV ${sev}.`;
    commit({
      ...inc,
      severity: sev,
      updatedAt: Math.max(inc.updatedAt, now),
      updates: [...inc.updates, entry(words, "severity")],
    });
    startSweep(sev, sevNodes.current.get(sev) ?? null, raise);
    say(`${words} ${SEV_WORD[sev]}.`);
    onSeverityChange?.(sev, previous);
  };

  const post = () => {
    const text = draft.trim();
    if (!inc || locked || !text) return;
    const update = entry(text);
    const extra: BridgeUpdate[] = [];
    let state = inc.state;
    if (nextState && nextState !== inc.state && nextState !== "resolved") {
      state = nextState;
      extra.push({
        ...entry(`${STATE_WORD[nextState]}.`, "state"),
        at: update.at + 1,
      });
    }
    commit({
      ...inc,
      state,
      updatedAt: Math.max(inc.updatedAt, now),
      updates: [...inc.updates, update, ...extra],
    });
    setDraft("");
    setNextState("");
    setComposing(false);
    say(
      `Update posted${extra.length ? `, now ${STATE_WORD[state].toLowerCase()}` : ""}.`,
    );
    onPostUpdate?.(update);
  };

  const resolve = () => {
    if (!inc || locked || resolved) return;
    const next: BridgeIncident = {
      ...inc,
      state: "resolved",
      updatedAt: Math.max(inc.updatedAt, now),
      updates: [
        ...inc.updates,
        entry(`Resolved after ${span(stamp() - inc.openedAt)}.`, "state"),
      ],
    };
    commit(next);
    startSweep("quiet", resolveRef.current, false);
    say(
      `Resolved after ${span(now - inc.openedAt)}. Next: write the postmortem.`,
    );
    onResolve?.(next);
  };

  const toggleCheck = (id: string) => {
    if (!inc || disabled) return;
    const item = inc.checklist.find((c) => c.id === id);
    if (!item) return;
    commit({
      ...inc,
      checklist: inc.checklist.map((c) =>
        c.id === id ? { ...c, done: !c.done } : c,
      ),
    });
    say(`${item.label}: ${item.done ? "not done" : "done"}.`);
  };

  /* ------------------------------ role menu ------------------------------ */

  const [menu, setMenu] = React.useState<BridgeRole | null>(null);
  const roleButtons = React.useRef(new Map<BridgeRole, HTMLButtonElement>());
  const [menuNode, setMenuNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!menuNode) return;
    const first =
      menuNode.querySelector<HTMLElement>('[aria-checked="true"]') ??
      menuNode.querySelector<HTMLElement>('[role="menuitemradio"]');
    first?.focus();
  }, [menuNode]);

  // A press anywhere outside the menu and its button closes it.
  React.useEffect(() => {
    if (!menu) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuNode?.contains(target)) return;
      if (roleButtons.current.get(menu)?.contains(target)) return;
      setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu, menuNode]);

  const closeMenu = (refocus: boolean) => {
    const role = menu;
    setMenu(null);
    if (refocus && role) {
      const node = roleButtons.current.get(role);
      if (node?.isConnected) node.focus();
    }
  };

  const assign = (role: BridgeRole, personId: string) => {
    if (!inc || locked) return;
    closeMenu(true);
    if (inc.roles[role] === personId) return;
    const words = `${nameOf(personId)} is ${ROLE_WORD[role].toLowerCase()}.`;
    commit({
      ...inc,
      roles: { ...inc.roles, [role]: personId },
      updates: [...inc.updates, entry(words, "role")],
    });
    say(words);
    onAssignRole?.(role, personId);
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"]',
      ),
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      go(at + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      go(at - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      go(0);
    } else if (event.key === "End") {
      event.preventDefault();
      go(items.length - 1);
    } else if (event.key === "Escape") {
      // Ours: the menu closes and focus goes back to its button.
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  };

  /* ------------------------------ shortcuts ------------------------------ */

  const onRootKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || locked) return;
    const target = event.target as HTMLElement;
    if (
      target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.closest('[role="menu"]')
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "u") {
      event.preventDefault();
      setComposing(true);
      setFocusComposer((n) => n + 1);
    } else if (key === "r") {
      event.preventDefault();
      const role = ROLES.find((r) => !inc?.roles[r]) ?? "commander";
      setMenu(role);
    } else if (key === "s" && !resolved) {
      event.preventDefault();
      if (inc) sevNodes.current.get(inc.severity)?.focus();
    }
  };

  const onSevKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!inc || locked || resolved) return;
    const order: BridgeSeverity[] = [1, 2, 3, 4];
    const at = order.indexOf(inc.severity);
    let to: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = at + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = at - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = 3;
    if (to === null) return;
    event.preventDefault();
    const sev = order[Math.min(3, Math.max(0, to))];
    if (!sev) return;
    setSeverity(sev);
    sevNodes.current.get(sev)?.focus();
  };

  /* -------------------------------- render ------------------------------- */

  const bandStyle = (key: BandKey) => {
    const p = palette[key];
    return {
      backgroundColor: `color-mix(in oklab, ${p.pigment} ${p.wash}%, var(--card))`,
      boxShadow: `inset 0 3px 0 ${p.pigment}`,
    };
  };

  const updates = inc ? [...inc.updates].sort((a, b) => b.at - a.at) : [];
  const start = inc?.openedAt ?? now;
  const end = Math.max(now, ...updates.map((u) => u.at), start + MIN);
  const total = end - start;
  const step =
    total > 3 * 60 * MIN ? 60 * MIN : total > 90 * MIN ? 30 * MIN : 10 * MIN;
  const ticks: number[] = [];
  for (let t = Math.ceil(start / step) * step; t <= end; t += step)
    ticks.push(t);
  const pct = (t: number) => r3(((t - start) / total) * 100);
  const resolvedAt = resolved
    ? (updates.find((u) => u.kind === "state" && /^Resolved/.test(u.text))
        ?.at ?? now)
    : null;
  const rightRail = timelineSide === "right";

  const pinColour = (u: BridgeUpdate) =>
    u.kind === "severity"
      ? palette[sevIn(u.text) ?? inc?.severity ?? 2].pigment
      : u.kind === "state"
        ? "oklch(from var(--accent-bright) 0.64 0.16 h)"
        : u.kind === "role"
          ? "oklch(from var(--ink-3) 0.66 0.02 h)"
          : "oklch(from var(--ink-2) 0.55 0.02 h)";

  const toolButton = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-45 aria-disabled:hover:bg-card @min-[24rem]:px-2.5",
    FOCUS_RING,
  );
  const kbd =
    "hidden rounded-1 border border-hairline px-1 font-mono text-[10px] text-ink-3 @min-[34rem]:inline";

  const timeline = (
    <section
      aria-label="Timeline"
      className={cn(
        "flex flex-col @min-[44rem]:overflow-hidden",
        rightRail ? "@min-[44rem]:order-2" : "@min-[44rem]:order-1",
      )}
    >
      <div className="shrink-0 border-b border-hairline px-4 pt-3 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Timeline
          </p>
          <p className="font-mono text-[10px] text-ink-3 tabular-nums">
            {updates.length} {updates.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div aria-hidden className="relative mt-2 h-7">
          <span className="absolute inset-x-0 top-4 h-px bg-hairline-strong" />
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-3.5 h-1.5 w-px bg-ink-3/60"
              style={{ left: `${pct(t)}%` }}
            />
          ))}
          {updates.map((u) => {
            const fresh = !mountIds.has(u.id);
            return (
              <motion.span
                key={u.id}
                className={cn(
                  "absolute top-1 -ml-[3px] h-3 w-1.5 rounded-full transition-[box-shadow] duration-150",
                  hovered === u.id && "shadow-[0_0_0_3px_var(--ib-halo)]",
                )}
                style={{ left: `${pct(u.at)}%`, backgroundColor: pinColour(u) }}
                initial={
                  fresh ? { y: motionSafe ? -12 : 0, opacity: 0 } : false
                }
                animate={{ y: 0, opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        y: springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              />
            );
          })}
          <span className="absolute -bottom-1 left-0 font-mono text-[9px] text-ink-3">
            {clock(start)}
          </span>
          <span className="absolute right-0 -bottom-1 font-mono text-[9px] text-ink-3">
            {resolved ? clock(resolvedAt ?? end) : "now"}
          </span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {composing && inc ? (
          <motion.form
            key="composer"
            onSubmit={(event) => {
              event.preventDefault();
              post();
            }}
            className="shrink-0 overflow-hidden border-b border-hairline"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitFor() }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: durations.fast }
            }
          >
            <div className="flex flex-col gap-2 px-4 py-3">
              <label htmlFor={composerId} className="sr-only">
                Update
              </label>
              <textarea
                id={composerId}
                ref={composerRef}
                rows={2}
                value={draft}
                placeholder="What changed?"
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  setDraft(text);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    // Ours: the composer closes, and nothing around it.
                    event.preventDefault();
                    event.stopPropagation();
                    setComposing(false);
                  } else if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    post();
                  }
                }}
                className={cn(
                  "w-full resize-none rounded-2 border border-hairline-strong bg-surface-1 px-2.5 py-2 text-[13px] text-foreground placeholder:text-ink-3",
                  FOCUS_RING,
                )}
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
                  State
                  <select
                    value={nextState}
                    onChange={(event) => {
                      const v = event.currentTarget.value as BridgeState | "";
                      setNextState(v);
                    }}
                    className={cn(
                      "h-8 rounded-2 border border-hairline bg-card px-2 text-[12px] text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <option value="">No change</option>
                    <option value="investigating">Investigating</option>
                    <option value="identified">Identified</option>
                    <option value="monitoring">Monitoring</option>
                  </select>
                </label>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-2 px-2.5 text-xs text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  aria-disabled={!draft.trim() || undefined}
                  className={cn(
                    "inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground aria-disabled:opacity-50",
                    FOCUS_RING,
                  )}
                >
                  Post
                </button>
              </div>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <ol
        role="log"
        aria-label="Updates, newest first"
        className={cn(
          "relative flex-1 px-4 py-1 @min-[44rem]:[scrollbar-width:thin] @min-[44rem]:overflow-y-auto @min-[44rem]:overscroll-contain",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0 bottom-0 w-0.5 bg-hairline",
            rightRail ? "right-[21px]" : "left-[21px]",
          )}
        />
        {updates.map((u) => {
          const fresh = !mountIds.has(u.id);
          const quiet = (u.kind ?? "update") !== "update";
          return (
            <motion.li
              key={u.id}
              layout={motionSafe ? "position" : false}
              onPointerEnter={() => setHovered(u.id)}
              onPointerLeave={() => setHovered((h) => (h === u.id ? null : h))}
              initial={
                fresh
                  ? { opacity: 0, y: motionSafe ? -distances.step : 0 }
                  : false
              }
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? {
                      layout: springs.glide,
                      y: springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
              className={cn(
                "relative flex gap-3",
                rightRail ? "flex-row-reverse" : "flex-row",
                d.entry,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "relative z-[1] mt-1.5 flex size-3 shrink-0 items-center justify-center rounded-full border-2 border-card",
                )}
                style={{ backgroundColor: pinColour(u) }}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-ink-3">
                  <time className="font-mono tabular-nums">{clock(u.at)}</time>
                  <span>{nameOf(u.author)}</span>
                </p>
                <p
                  className={cn(
                    d.text,
                    quiet ? "text-ink-2 italic" : "text-foreground",
                  )}
                >
                  {u.text}
                </p>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );

  const side = inc ? (
    <aside
      aria-label="Response"
      className={cn(
        "flex flex-col border-t border-hairline px-4 @min-[44rem]:[scrollbar-width:thin] @min-[44rem]:overflow-y-auto @min-[44rem]:overscroll-contain @min-[44rem]:border-t-0",
        rightRail
          ? "@min-[44rem]:order-1 @min-[44rem]:border-r @min-[44rem]:border-hairline"
          : "@min-[44rem]:order-2 @min-[44rem]:border-l @min-[44rem]:border-hairline",
        d.section,
        d.gap,
      )}
    >
      <section aria-label="Roles">
        <p className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Roles
        </p>
        <ul className="flex flex-col">
          {ROLES.map((role) => {
            const holder = inc.roles[role];
            const open = menu === role;
            return (
              <li
                key={role}
                className={cn("relative flex items-center gap-2", d.row)}
              >
                <span className="w-[4.5rem] shrink-0 text-[11px] text-ink-3">
                  {ROLE_WORD[role]}
                </span>
                <button
                  ref={(node) => {
                    if (node) roleButtons.current.set(role, node);
                    else roleButtons.current.delete(role);
                  }}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-label={`${ROLE_WORD[role]}: ${holder ? nameOf(holder) : "unassigned"}. Change`}
                  aria-disabled={locked || undefined}
                  onClick={() => {
                    if (!locked) setMenu(open ? null : role);
                  }}
                  className={cn(
                    "inline-flex h-7 min-w-0 flex-1 items-center gap-2 rounded-2 px-1.5 text-left text-[12px] transition-colors hover:bg-surface-2",
                    holder ? "text-foreground" : "text-ink-3",
                    FOCUS_RING,
                  )}
                >
                  {holder ? (
                    <Avatar name={nameOf(holder)} />
                  ) : (
                    <UserPlus aria-hidden className="size-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {holder ? nameOf(holder) : "Assign"}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="ml-auto size-3.5 shrink-0 text-ink-3"
                  />
                </button>
                <AnimatePresence>
                  {open ? (
                    <motion.div
                      key="menu"
                      ref={setMenuNode}
                      role="menu"
                      aria-label={`Choose the ${ROLE_WORD[role].toLowerCase()}`}
                      onKeyDown={onMenuKey}
                      className="absolute top-full right-0 z-[20] mt-1 w-48 rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]"
                      initial={{
                        opacity: 0,
                        y: motionSafe ? -distances.nudge : 0,
                        scale: motionSafe ? 0.98 : 1,
                      }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              y: springs.snap,
                              scale: springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                      style={{ originX: 1, originY: 0 }}
                    >
                      {people.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={holder === p.id}
                          tabIndex={-1}
                          onClick={() => assign(role, p.id)}
                          className={cn(
                            "flex h-8 w-full items-center gap-2 rounded-2 px-2 text-left text-[12px] text-foreground hover:bg-surface-2 aria-checked:bg-surface-2",
                            FOCUS_IN,
                          )}
                        >
                          <Avatar name={p.name} />
                          <span className="truncate">{p.name}</span>
                        </button>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Affected services">
        <p className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Affected · Gaugeworks
        </p>
        <ul className="flex flex-col">
          {inc.services.map((s) => {
            const h = HEALTH[s.health] ?? HEALTH.ok;
            return (
              <li
                key={s.id}
                className={cn("flex items-center gap-2 text-[12px]", d.row)}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: h.dot }}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {s.name}
                </span>
                <span className={cn("shrink-0 text-[11px]", h.text)}>
                  {h.word}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Checklist">
        <p className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Checklist ·{" "}
          <span className="tabular-nums">
            {inc.checklist.filter((c) => c.done).length}/{inc.checklist.length}
          </span>
        </p>
        <ul className="flex flex-col">
          {inc.checklist.map((c) => {
            const next = resolved && c.id === "postmortem" && !c.done;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={c.done}
                  aria-disabled={disabled || undefined}
                  onClick={() => toggleCheck(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-2 px-1 text-left text-[12px] transition-colors hover:bg-surface-2",
                    d.row,
                    c.done
                      ? "text-ink-3 line-through decoration-ink-3/60"
                      : "text-foreground",
                    next &&
                      "bg-[color-mix(in_oklab,var(--accent-bright)_10%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)]",
                    FOCUS_IN,
                  )}
                >
                  <Tick on={c.done} motionSafe={motionSafe} />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {next ? (
                    <span className="shrink-0 rounded-full bg-cobalt-wash px-1.5 text-[10px] text-cobalt-bright no-underline">
                      Next
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  ) : null;

  const quietCard = (
    <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success">
        <ShieldCheck aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">All clear</p>
      <p className="max-w-xs text-[12px] text-ink-3">
        Nothing on Gaugeworks is paging.
        {lastIncident ? (
          <>
            {" "}
            The last incident,{" "}
            <span className="whitespace-nowrap">{lastIncident.id}</span>, was
            resolved {ago(now - lastIncident.resolvedAt)}.
          </>
        ) : null}
      </p>
    </div>
  );

  const sweepLayer = sweep ? (
    <motion.div
      key={sweep.n}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={bandStyle(sweep.key)}
      initial={
        motionSafe
          ? { clipPath: `circle(0px at ${sweep.x}px ${sweep.y}px)` }
          : { opacity: 0 }
      }
      animate={
        motionSafe
          ? { clipPath: `circle(${sweep.r}px at ${sweep.x}px ${sweep.y}px)` }
          : { opacity: 1 }
      }
      transition={
        motionSafe
          ? // Escalating is urgent; calming down is unhurried.
            { duration: sweep.raise ? 0.42 : 0.56, ease: easings.enter }
          : { duration: durations.fast }
      }
      onAnimationComplete={() => {
        setBase(sweep.key);
        setSweep((s) => (s && s.n === sweep.n ? null : s));
      }}
    />
  ) : null;

  return (
    <div
      role="region"
      aria-labelledby={inc ? titleId : undefined}
      aria-label={inc ? undefined : "Incident bridge"}
      aria-describedby={hintId}
      onKeyDown={onRootKey}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--ib-halo" as string]: `color-mix(in oklab, ${palette[bandKey].pigment} 35%, transparent)`,
      }}
    >
      <p id={hintId} className="sr-only">
        U posts an update, R assigns a role, S goes to severity; arrows then
        change it.
      </p>

      {/* ------------------------------- band ------------------------------- */}
      <div
        ref={bandRef}
        className="relative shrink-0 overflow-hidden border-b border-hairline transition-[background-color,box-shadow] duration-200"
        style={bandStyle(base)}
      >
        {sweepLayer}
        {status === "loading" ? (
          <div
            aria-busy="true"
            className="relative flex flex-col gap-2 px-4 py-3.5"
          >
            <span className="sr-only">Loading the incident</span>
            <span className="h-3 w-32 rounded-full bg-surface-2" />
            <span className="h-4 w-3/5 rounded-full bg-surface-2" />
          </div>
        ) : (
          <div className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 px-4 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-2">
                {inc ? (
                  <>
                    <span className="font-mono font-medium text-foreground">
                      {inc.id}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium",
                        resolved
                          ? "border-[color-mix(in_oklab,var(--success)_40%,transparent)] text-success"
                          : "border-hairline-strong text-foreground",
                      )}
                    >
                      {STATE_WORD[inc.state]}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      {resolved
                        ? `Resolved after ${span((resolvedAt ?? now) - inc.openedAt)}`
                        : `Open ${span(now - inc.openedAt)}`}
                    </span>
                    {stale ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] px-2 text-[10px] font-medium text-warn">
                          <TriangleAlert aria-hidden className="size-3" />
                          Data {ago(now - inc.updatedAt).replace(
                            " ago",
                            "",
                          )}{" "}
                          old
                        </span>
                        {onRefresh ? (
                          <button
                            type="button"
                            aria-label="Refresh"
                            onClick={onRefresh}
                            className={cn(
                              "inline-flex size-5 items-center justify-center rounded-1 text-ink-2 hover:text-foreground",
                              FOCUS_RING,
                            )}
                          >
                            <RefreshCw aria-hidden className="size-3" />
                          </button>
                        ) : null}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="font-mono">Gaugeworks</span>
                )}
              </p>
              <p
                id={titleId}
                className="mt-1 text-[15px] leading-5 font-semibold text-foreground"
              >
                {inc ? inc.title : "No open incidents"}
              </p>
            </div>
            {inc ? (
              <div
                role="radiogroup"
                aria-label="Severity"
                aria-disabled={locked || resolved || undefined}
                className="relative flex shrink-0 items-center gap-0.5 rounded-3 border border-hairline-strong bg-card/70 p-0.5"
              >
                {([1, 2, 3, 4] as BridgeSeverity[]).map((sev) => {
                  const on = inc.severity === sev;
                  return (
                    <button
                      key={sev}
                      ref={(node) => {
                        if (node) sevNodes.current.set(sev, node);
                        else sevNodes.current.delete(sev);
                      }}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={`SEV ${sev}, ${SEV_WORD[sev]}`}
                      aria-disabled={locked || resolved || undefined}
                      tabIndex={on ? 0 : -1}
                      onClick={() => setSeverity(sev)}
                      onKeyDown={onSevKey}
                      className={cn(
                        "relative inline-flex h-7 min-w-9 items-center justify-center rounded-2 px-1.5 font-mono text-[11px] font-medium transition-colors",
                        on
                          ? "text-foreground"
                          : "text-ink-3 hover:text-foreground",
                        (locked || resolved) && "cursor-not-allowed",
                        FOCUS_RING,
                      )}
                    >
                      {on ? (
                        <motion.span
                          layoutId={`${uid}-sev`}
                          aria-hidden
                          className="absolute inset-0 rounded-2 bg-card shadow-sm"
                          style={{
                            boxShadow: `inset 0 -2px 0 ${palette[sev].pigment}`,
                          }}
                          transition={
                            motionSafe ? springs.snap : { duration: 0 }
                          }
                        />
                      ) : null}
                      <span className="relative">S{sev}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {status === "error" ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline bg-[color-mix(in_oklab,var(--warn)_8%,var(--card))] px-4 py-2 text-[12px]">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warn" />
          <span className="min-w-0 flex-1 text-ink-2">
            Couldn&apos;t reach the bridge
            {inc ? ` · showing data from ${ago(now - inc.updatedAt)}` : ""}.
          </span>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline bg-card px-2 text-[11px] text-foreground hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RefreshCw aria-hidden className="size-3" />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------ toolbar ----------------------------- */}
      {inc && status !== "loading" ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-hairline px-4 py-2">
          <button
            type="button"
            aria-label="Post update"
            aria-keyshortcuts="U"
            aria-disabled={locked || undefined}
            onClick={() => {
              if (locked) return;
              setComposing(true);
              setFocusComposer((n) => n + 1);
            }}
            className={toolButton}
          >
            <MessageSquarePlus aria-hidden className="size-3.5" />
            <span aria-hidden className="hidden @min-[24rem]:inline">
              Update
            </span>
            <kbd aria-hidden className={kbd}>
              U
            </kbd>
          </button>
          <button
            type="button"
            aria-label="Assign roles"
            aria-keyshortcuts="R"
            aria-disabled={locked || undefined}
            onClick={() => {
              if (!locked)
                setMenu(ROLES.find((r) => !inc.roles[r]) ?? "commander");
            }}
            className={toolButton}
          >
            <UserPlus aria-hidden className="size-3.5" />
            <span aria-hidden className="hidden @min-[24rem]:inline">
              Roles
            </span>
            <kbd aria-hidden className={kbd}>
              R
            </kbd>
          </button>
          <button
            type="button"
            aria-label="Severity"
            aria-keyshortcuts="S"
            aria-disabled={locked || resolved || undefined}
            onClick={() => {
              if (!locked && !resolved)
                sevNodes.current.get(inc.severity)?.focus();
            }}
            className={toolButton}
          >
            <Gauge aria-hidden className="size-3.5" />
            <span aria-hidden className="hidden @min-[24rem]:inline">
              Severity
            </span>
            <kbd aria-hidden className={kbd}>
              S
            </kbd>
          </button>
          <span className="flex-1" />
          <button
            ref={resolveRef}
            type="button"
            aria-disabled={locked || resolved || undefined}
            onClick={resolve}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-2.5 text-xs font-medium transition-opacity aria-disabled:opacity-50",
              resolved
                ? "border border-hairline text-success"
                : "bg-primary text-primary-foreground hover:opacity-90",
              FOCUS_RING,
            )}
          >
            <CircleCheck aria-hidden className="size-3.5" />
            {resolved ? "Resolved" : "Resolve"}
          </button>
        </div>
      ) : null}

      {/* -------------------------------- body ------------------------------ */}
      {status === "loading" ? (
        <div aria-hidden className="flex flex-col gap-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <span className="mt-1 size-3 rounded-full bg-surface-2" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="h-2 w-16 rounded-full bg-surface-2" />
                <span
                  className="h-3 rounded-full bg-surface-2"
                  style={{ width: `${60 + ((i * 23) % 30)}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      ) : !inc ? (
        quietCard
      ) : (
        <div className="flex flex-1 [scrollbar-width:thin] flex-col overflow-y-auto overscroll-contain @min-[44rem]:grid @min-[44rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[44rem]:grid-rows-[minmax(0,1fr)] @min-[44rem]:overflow-hidden">
          {timeline}
          {side}
        </div>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
