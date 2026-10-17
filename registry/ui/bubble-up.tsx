"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  BellOff,
  Bell,
  Check,
  CheckCheck,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BubbleUpAccent = "cobalt" | "plum" | "mint" | "ink";
export type BubbleUpDensity = "compact" | "cozy" | "roomy";
export type BubbleUpStatus = "ready" | "loading" | "error";
export type BubbleEventKind =
  "comment" | "upload" | "status" | "mention" | "approval";

export type BubbleGroup = { id: string; label: string };

export type BubbleProject = {
  id: string;
  name: string;
  client: string;
  /** The home group it lives in. */
  group: string;
  /** The monogram's colour, any CSS colour. Defaults to a pigment by position. */
  hue?: string;
};

export type BubbleEvent = {
  id: string;
  projectId: string;
  /** ms since the epoch. */
  at: number;
  /** Who did it. */
  by: string;
  kind: BubbleEventKind;
};

export type BubbleUpProps = {
  /** How long a row with new activity waits at home, its dot showing, before it rises, in ms. @default 500 */
  liftDelay?: number;
  /** Row height and what each row says: one line, a meta line, or meta and client. @default "cozy" */
  density?: BubbleUpDensity;
  /** Accent for counts, dots and the Updated group. A name or any CSS colour. @default "cobalt" */
  accent?: BubbleUpAccent | (string & {});
  /** The projects, in order within their groups. @default defaultBubbleProjects */
  projects?: BubbleProject[];
  /** The home groups, in order. @default defaultBubbleGroups */
  groups?: BubbleGroup[];
  /** Activity on the projects, any order. @default defaultBubbleEvents */
  events?: BubbleEvent[];
  /** Controlled read state: for each project, the time it was read up to. */
  readAt?: Record<string, number>;
  /** Initial read state when uncontrolled. @default defaultBubbleReadAt */
  defaultReadAt?: Record<string, number>;
  /** Projects were marked read (opened, or the whole group), up to these times. */
  onMarkRead?: (projectIds: string[], readAt: Record<string, number>) => void;
  /** Controlled muted project ids: they never rise. */
  muted?: string[];
  /** Initial muted ids when uncontrolled. @default [] */
  defaultMuted?: string[];
  /** A project was muted or unmuted. */
  onMute?: (projectId: string, muted: boolean) => void;
  /** A project was opened. */
  onOpen?: (projectId: string) => void;
  /** Controlled open project id. */
  current?: string | null;
  /** Initial open project when uncontrolled. @default null */
  defaultCurrent?: string | null;
  /** How long the dotted placeholder holds a risen row's place before it closes, in ms. @default 700 */
  placeholderBeat?: number;
  /** The moment relative times count from, in ms. @default defaultBubbleNow */
  now?: number;
  /** The studio's name in the header. @default "Fernworks" */
  title?: string;
  /** The line under it. @default "Client projects" */
  subtitle?: string;
  /** Whether the projects have arrived. @default "ready" */
  status?: BubbleUpStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The navigation's accessible name. @default "<title> projects" */
  label?: string;
  className?: string;
};

const MIN = 60_000;
/** A fixed late morning, so the list renders the same on every machine. */
export const defaultBubbleNow = Date.UTC(2026, 9, 16, 10, 24);
const N = defaultBubbleNow;

/** Filled squares are pigment: a token's hue at a fixed lightness, the same in both themes. */
const HUES = [
  "oklch(from var(--warn) 0.78 0.13 h)",
  "oklch(from var(--accent-bright) 0.68 0.14 h)",
  "oklch(from var(--success) 0.72 0.12 h)",
  "oklch(from var(--danger) 0.7 0.14 h)",
  "oklch(from var(--accent-bright) 0.66 0.13 320)",
  "oklch(from var(--success) 0.74 0.1 200)",
];

export const defaultBubbleGroups: BubbleGroup[] = [
  { id: "retainers", label: "Retainers" },
  { id: "launches", label: "Launches" },
  { id: "pitches", label: "Pitches" },
];

export const defaultBubbleProjects: BubbleProject[] = [
  {
    id: "halden",
    name: "Brand care",
    client: "Halden Bakery",
    group: "retainers",
  },
  {
    id: "ostra",
    name: "Ferry app",
    client: "Ostra Ferries",
    group: "retainers",
  },
  {
    id: "coldbrook",
    name: "Help centre",
    client: "Coldbrook Bank",
    group: "retainers",
  },
  {
    id: "moss",
    name: "Store launch",
    client: "Moss & Pine",
    group: "launches",
  },
  {
    id: "basin",
    name: "Onboarding flow",
    client: "Basinworks",
    group: "launches",
  },
  {
    id: "lumen",
    name: "Booking site",
    client: "Lumen Dental",
    group: "launches",
  },
  {
    id: "kestrel",
    name: "Spring campaign",
    client: "Kestrel Bikes",
    group: "pitches",
  },
  {
    id: "aldermoor",
    name: "Guest app",
    client: "Aldermoor Hotels",
    group: "pitches",
  },
];

export const defaultBubbleEvents: BubbleEvent[] = [
  {
    id: "e1",
    projectId: "halden",
    at: N - 190 * MIN,
    by: "Aiko",
    kind: "approval",
  },
  {
    id: "e2",
    projectId: "coldbrook",
    at: N - 150 * MIN,
    by: "Jonas",
    kind: "upload",
  },
  {
    id: "e3",
    projectId: "moss",
    at: N - 95 * MIN,
    by: "Priya",
    kind: "status",
  },
  {
    id: "e4",
    projectId: "basin",
    at: N - 70 * MIN,
    by: "Tomas",
    kind: "comment",
  },
  {
    id: "e5",
    projectId: "lumen",
    at: N - 48 * MIN,
    by: "Mara",
    kind: "upload",
  },
  {
    id: "e6",
    projectId: "kestrel",
    at: N - 62 * MIN,
    by: "Ines",
    kind: "comment",
  },
  {
    id: "e7",
    projectId: "aldermoor",
    at: N - 55 * MIN,
    by: "Priya",
    kind: "status",
  },
  {
    id: "e8",
    projectId: "ostra",
    at: N - 9 * MIN,
    by: "Mara",
    kind: "comment",
  },
  {
    id: "e9",
    projectId: "ostra",
    at: N - 4 * MIN,
    by: "Jonas",
    kind: "upload",
  },
];

/** Everything was read at 09:40 except the ferry app's two newest events. */
export const defaultBubbleReadAt: Record<string, number> = Object.fromEntries(
  defaultBubbleProjects.map((p) => [p.id, N - 44 * MIN]),
);

const DEFAULT_MUTED: string[] = [];

const VERB: Record<BubbleEventKind, string> = {
  comment: "commented",
  upload: "uploaded files",
  status: "moved it on",
  mention: "mentioned you",
  approval: "approved a round",
};

const ACCENTS: Record<BubbleUpAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

type Density = { row: number; mono: string; meta: boolean; client: boolean };
const DENSITY: Record<BubbleUpDensity, Density> = {
  compact: {
    row: 32,
    mono: "size-[18px] text-[8.5px]",
    meta: false,
    client: false,
  },
  cozy: { row: 40, mono: "size-6 text-[10px]", meta: true, client: false },
  roomy: { row: 54, mono: "size-7 text-[11px]", meta: true, client: true },
};

const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const HEAD = 30;
const QUIET = 34;
const GAP = 8;
/** Below this container width the Updated group folds into a chip. */
const NARROW = 296;

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "now";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** The same span as a phrase a screen reader can say. */
function spoken(at: number, now: number): string {
  const short = ago(at, now);
  return short === "now" ? "just now" : `${short} ago`;
}

/** Fixed 24-hour clock in UTC: a locale lookup in render would not hydrate. */
function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const initials = (name: string) =>
  name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;

/** A count whose digits roll toward the way it moved, on snap. */
function Count({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [prev, setPrev] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (prev !== value) {
    setPrev(value);
    setDir(value > prev ? 1 : -1);
  }
  const text = String(value);
  return (
    <span
      className="relative inline-flex h-4 overflow-clip tabular-nums"
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block leading-4"
          variants={{
            enter: (d: number | undefined) => ({
              opacity: 0,
              y: motionSafe ? (d ?? 1) * 8 : 0,
            }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number | undefined) => ({
              opacity: 0,
              y: motionSafe ? -(d ?? 1) * 8 : 0,
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

/* --------------------------------- sidebar -------------------------------- */

/**
 * A project sidebar where what changed floats to the top. A project with
 * new activity shows its count at home, popping in on snap; after
 * `liftDelay` the row lifts out (a shadow and 1.03× on flick) and glides up
 * on `glide` into an Updated group that opens a slot for it while the
 * group's count rolls, leaving a dotted placeholder that holds its home for
 * `placeholderBeat` and then closes, the rows below sliding up. Opening a
 * project marks it read and sends it back down to its home on glide, the
 * group re-opening its slot; Shift+R sends the whole group home in
 * `cascade()` order.
 *
 * Every row is absolutely placed from a pure layout of fixed heights, so
 * the server renders the positions the browser animates and the DOM order
 * never changes. Up and Down walk the rows as they appear, Enter opens, M
 * mutes (a muted project never rises), Shift+R marks the group read. Below
 * an 18.5rem container the Updated group folds into a count chip that opens
 * it. Under reduced motion rows move at once and the placeholder simply
 * closes; counts and order still change.
 */
export function BubbleUp({
  liftDelay = 500,
  density = "cozy",
  accent = "cobalt",
  projects = defaultBubbleProjects,
  groups = defaultBubbleGroups,
  events = defaultBubbleEvents,
  readAt,
  defaultReadAt = defaultBubbleReadAt,
  onMarkRead,
  muted,
  defaultMuted = DEFAULT_MUTED,
  onMute,
  onOpen,
  current,
  defaultCurrent = null,
  placeholderBeat = 700,
  now = defaultBubbleNow,
  title = "Fernworks",
  subtitle = "Client projects",
  status = "ready",
  onRetry,
  label,
  className,
}: BubbleUpProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const rowH = d.row;

  const [ownRead, setOwnRead] = React.useState(defaultReadAt);
  const read = readAt ?? ownRead;
  const [ownMuted, setOwnMuted] = React.useState(defaultMuted);
  const mutedIds = muted ?? ownMuted;
  const [ownCurrent, setOwnCurrent] = React.useState(defaultCurrent);
  const currentId = current !== undefined ? current : ownCurrent;

  /* -------------------------------- activity ------------------------------ */

  const activity = React.useMemo(() => {
    const out = new Map<
      string,
      { unread: BubbleEvent[]; latest?: BubbleEvent }
    >();
    for (const p of projects) out.set(p.id, { unread: [] });
    const sorted = [...events].sort((a, b) => b.at - a.at);
    for (const e of sorted) {
      const slot = out.get(e.projectId);
      if (!slot) continue;
      if (!slot.latest) slot.latest = e;
      if (e.at > (read[e.projectId] ?? 0)) slot.unread.push(e);
    }
    return out;
  }, [events, projects, read]);

  const updatedIds = React.useMemo(
    () =>
      projects
        .filter(
          (p) =>
            !mutedIds.includes(p.id) &&
            (activity.get(p.id)?.unread.length ?? 0) > 0,
        )
        .sort(
          (a, b) =>
            (activity.get(b.id)?.latest?.at ?? 0) -
            (activity.get(a.id)?.latest?.at ?? 0),
        )
        .map((p) => p.id),
    [activity, mutedIds, projects],
  );
  const updatedKey = updatedIds.join("|");

  // Risen rows, rows waiting to rise, and the placeholders holding homes.
  const [lifted, setLifted] = React.useState<string[]>(updatedIds);
  const [pending, setPending] = React.useState<string[]>([]);
  const [holes, setHoles] = React.useState<string[]>([]);
  const [flying, setFlying] = React.useState<string[]>([]);
  const [delays, setDelays] = React.useState<Record<string, number>>({});
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  // New activity is read in the render that sees it: fresh rows wait at
  // home, and rows that are no longer updated go home at once.
  const [seenKey, setSeenKey] = React.useState(updatedKey);
  if (seenKey !== updatedKey) {
    setSeenKey(updatedKey);
    const live = new Set(updatedIds);
    const fresh = updatedIds.filter(
      (id) => !lifted.includes(id) && !pending.includes(id),
    );
    const leaving = lifted.filter((id) => !live.has(id));
    if (leaving.length) {
      setLifted(lifted.filter((id) => live.has(id)));
      setFlying((f) => [...new Set([...f, ...leaving])]);
    }
    setPending([...pending.filter((id) => live.has(id)), ...fresh]);
    setHoles(holes.filter((id) => live.has(id)));
  }

  const pendingKey = pending.join("|");
  React.useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split("|");
    const t = window.setTimeout(
      () => {
        setPending([]);
        setLifted((l) => [...ids.filter((id) => !l.includes(id)), ...l]);
        setHoles((h) => [...h, ...ids.filter((id) => !h.includes(id))]);
        setFlying((f) => [...new Set([...f, ...ids])]);
        const names = ids
          .map((id) => projects.find((p) => p.id === id))
          .filter((p): p is BubbleProject => !!p)
          .map((p) => {
            const latest = activity.get(p.id)?.latest;
            return `${p.name}${latest ? `: ${latest.by} ${VERB[latest.kind]}` : ""}`;
          });
        setSaid((s) => ({
          n: s.n + 1,
          text: `Updated. ${names.join(". ")}.`,
        }));
      },
      Math.max(0, liftDelay),
    );
    return () => window.clearTimeout(t);
  }, [activity, liftDelay, pendingKey, projects]);

  const holesKey = holes.join("|");
  React.useEffect(() => {
    if (!holesKey) return;
    const t = window.setTimeout(
      () => setHoles([]),
      motionSafe ? Math.max(0, placeholderBeat) : 0,
    );
    return () => window.clearTimeout(t);
  }, [holesKey, motionSafe, placeholderBeat]);

  /* --------------------------------- width -------------------------------- */

  const [narrow, setNarrow] = React.useState(false);
  const [instant, setInstant] = React.useState(false);
  const [chipOpen, setChipOpen] = React.useState(false);
  const [wrap, setWrap] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!wrap || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? NARROW;
      const next = w < NARROW;
      setNarrow((was) => {
        if (was === next) return was;
        // A change of layout by width is a jump, not a journey.
        setInstant(true);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() =>
          requestAnimationFrame(() => setInstant(false)),
        );
        return next;
      });
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [wrap]);

  const collapsed = narrow && !chipOpen;

  /* --------------------------------- layout -------------------------------- */

  const risen = updatedIds.filter((id) => lifted.includes(id));
  const shownRisen = collapsed ? [] : risen;
  const layout = (() => {
    const rows = new Map<string, number>();
    const heads = new Map<string, number>();
    const gaps = new Map<string, number>();
    let y = 0;
    let updatedHead: number | null = null;
    let quiet: number | null = null;
    if (!collapsed) {
      updatedHead = y;
      y += HEAD;
      if (shownRisen.length === 0) {
        quiet = y;
        y += QUIET;
      }
      for (const id of shownRisen) {
        rows.set(id, y);
        y += rowH;
      }
      y += GAP;
    }
    for (const g of groups) {
      const members = projects.filter((p) => p.group === g.id);
      if (members.length === 0) continue;
      heads.set(g.id, y);
      y += HEAD;
      for (const p of members) {
        if (shownRisen.includes(p.id)) {
          if (holes.includes(p.id)) {
            gaps.set(p.id, y);
            y += rowH;
          }
          continue;
        }
        rows.set(p.id, y);
        y += rowH;
      }
      y += GAP / 2;
    }
    return { rows, heads, gaps, updatedHead, quiet, height: y };
  })();

  const visualOrder = projects
    .filter((p) => layout.rows.has(p.id))
    .sort((a, b) => (layout.rows.get(a.id) ?? 0) - (layout.rows.get(b.id) ?? 0))
    .map((p) => p.id);

  /* -------------------------------- actions ------------------------------- */

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const markRead = (ids: string[], stagger: boolean) => {
    const targets = ids.filter(
      (id) => (activity.get(id)?.unread.length ?? 0) > 0,
    );
    if (targets.length === 0) return;
    const next = { ...read };
    for (const id of targets) {
      next[id] = Math.max(read[id] ?? 0, activity.get(id)?.latest?.at ?? 0);
    }
    if (readAt === undefined) setOwnRead(next);
    if (stagger && motionSafe) {
      const step = cascade(targets.length);
      setDelays(
        Object.fromEntries(
          targets.map((id, i) => [id, Math.round(i * step * 1000) / 1000]),
        ),
      );
    }
    onMarkRead?.(targets, next);
  };

  const open = (id: string) => {
    if (current === undefined) setOwnCurrent(id);
    onOpen?.(id);
    const p = projects.find((x) => x.id === id);
    if ((activity.get(id)?.unread.length ?? 0) > 0) {
      markRead([id], false);
      say(`${p?.name ?? id} opened and marked read.`);
    }
  };

  const markAll = () => {
    if (risen.length === 0 && pending.length === 0) return;
    const ids = [...risen, ...pending];
    markRead(ids, true);
    say(`${plural(ids.length, "project")} marked read.`);
  };

  const toggleMute = (id: string) => {
    const was = mutedIds.includes(id);
    const next = was ? mutedIds.filter((m) => m !== id) : [...mutedIds, id];
    if (muted === undefined) setOwnMuted(next);
    onMute?.(id, !was);
    const p = projects.find((x) => x.id === id);
    say(`${p?.name ?? id} ${was ? "unmuted" : "muted; it won’t rise"}.`);
  };

  /* -------------------------------- keyboard ------------------------------ */

  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const tabId =
    focusId && visualOrder.includes(focusId)
      ? focusId
      : (visualOrder[0] ?? null);

  const go = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    rowRefs.current.get(id)?.focus();
  };

  const onNavKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (
      e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      e.code === "KeyR"
    ) {
      e.preventDefault();
      markAll();
    }
  };

  const onRowKey = (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
    const i = visualOrder.indexOf(id);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(visualOrder[Math.min(visualOrder.length - 1, i + 1)]);
        return;
      case "ArrowUp":
        e.preventDefault();
        go(visualOrder[Math.max(0, i - 1)]);
        return;
      case "Home":
        e.preventDefault();
        go(visualOrder[0]);
        return;
      case "End":
        e.preventDefault();
        go(visualOrder[visualOrder.length - 1]);
        return;
      default:
        if (
          (e.key === "m" || e.key === "M") &&
          !e.shiftKey &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
        ) {
          e.preventDefault();
          toggleMute(id);
        }
    }
  };

  /* --------------------------------- render -------------------------------- */

  const glide = (id: string) =>
    instant || !motionSafe
      ? { duration: 0 }
      : { ...springs.glide, delay: delays[id] ?? 0 };
  const settled = (id: string) => {
    if (flying.includes(id)) setFlying((f) => f.filter((x) => x !== id));
    if (delays[id] !== undefined) {
      setDelays((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    }
  };

  const name = label ?? `${title} projects`;
  const updatedCount = risen.length;
  const chipCount = risen.length + pending.length;
  const lastRead = Math.max(0, ...Object.values(read));
  const ready = status === "ready";

  const row = (p: BubbleProject, index: number) => {
    const y = layout.rows.get(p.id);
    if (y === undefined) return null;
    const act = activity.get(p.id);
    const unread = mutedIds.includes(p.id) ? 0 : (act?.unread.length ?? 0);
    const latest = act?.latest;
    const isMuted = mutedIds.includes(p.id);
    const isFlying = flying.includes(p.id) && motionSafe;
    const hue = p.hue ?? HUES[index % HUES.length] ?? HUES[0];
    const meta =
      unread > 0 && act?.unread[0]
        ? `${act.unread[0].by} ${VERB[act.unread[0].kind]} · ${ago(act.unread[0].at, now)}`
        : latest
          ? `${latest.by} ${VERB[latest.kind]} · ${ago(latest.at, now)}`
          : p.client;
    const sentence = [
      p.name,
      p.client,
      unread > 0 ? `${unread} new` : null,
      isMuted ? "muted" : null,
      unread > 0 && act?.unread[0]
        ? `${act.unread[0].by} ${VERB[act.unread[0].kind]} ${spoken(act.unread[0].at, now)}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <motion.li
        key={p.id}
        className={cn(
          "group/bu-row pointer-events-auto absolute inset-x-0 top-0",
          isFlying ? "z-10" : "z-0",
        )}
        style={{ height: rowH }}
        initial={false}
        animate={{ y, scale: isFlying ? 1.03 : 1 }}
        transition={{
          y: glide(p.id),
          scale: motionSafe && !instant ? springs.flick : { duration: 0 },
        }}
        onAnimationComplete={() => settled(p.id)}
      >
        <button
          ref={(node) => {
            if (node) rowRefs.current.set(p.id, node);
            else rowRefs.current.delete(p.id);
          }}
          type="button"
          data-bu-row={p.id}
          tabIndex={p.id === tabId ? 0 : -1}
          aria-current={p.id === currentId ? "page" : undefined}
          aria-label={sentence}
          aria-describedby={hintId}
          onFocus={() => setFocusId(p.id)}
          onKeyDown={(e) => onRowKey(e, p.id)}
          onClick={() => open(p.id)}
          className={cn(
            "flex h-full w-full items-center gap-2.5 rounded-2 border pr-9 pl-2 text-left transition-[background-color,border-color,box-shadow] duration-200",
            isFlying
              ? "border-hairline-strong bg-popover shadow-[0_10px_24px_color-mix(in_oklab,black_16%,transparent)]"
              : p.id === currentId
                ? "border-transparent bg-[var(--bu-wash)]"
                : "border-transparent hover:bg-surface-2",
            FOCUS_IN,
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex shrink-0 items-center justify-center rounded-[5px] font-semibold",
              d.mono,
            )}
            style={{
              backgroundColor: hue,
              color: `oklch(from ${hue} 0.25 0.05 h)`,
            }}
          >
            {initials(p.client)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn(
                "truncate text-[13px] leading-[18px]",
                unread > 0 ? "font-semibold text-foreground" : "text-ink-2",
                p.id === currentId && "text-foreground",
              )}
            >
              {p.name}
            </span>
            {d.meta ? (
              <span
                className={cn(
                  "truncate text-[11px] leading-[15px]",
                  unread > 0 ? "text-ink-2" : "text-ink-3",
                )}
              >
                {meta}
              </span>
            ) : null}
            {d.client ? (
              <span className="truncate text-[11px] leading-[15px] text-ink-3">
                {p.client}
              </span>
            ) : null}
          </span>
        </button>
        <span className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
          {isMuted ? (
            <BellOff
              aria-hidden
              className="size-3.5 text-ink-3 transition-opacity group-focus-within/bu-row:opacity-0 group-hover/bu-row:opacity-0"
            />
          ) : (
            <AnimatePresence initial={false}>
              {unread > 0 ? (
                <motion.span
                  key="count"
                  aria-hidden
                  className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--bu-ink)] px-1 font-mono text-[10px] font-medium text-background transition-opacity group-focus-within/bu-row:opacity-0 group-hover/bu-row:opacity-0"
                  initial={{ scale: motionSafe ? 0.5 : 1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{
                    scale: motionSafe ? 0.5 : 1,
                    opacity: 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? {
                          scale: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <Count value={unread} motionSafe={motionSafe} />
                </motion.span>
              ) : null}
            </AnimatePresence>
          )}
        </span>
        <button
          type="button"
          tabIndex={-1}
          aria-label={isMuted ? `Unmute ${p.name}` : `Mute ${p.name}`}
          aria-pressed={isMuted}
          title={isMuted ? "Unmute (M)" : "Mute (M)"}
          onClick={() => toggleMute(p.id)}
          className={cn(
            "absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-2 text-ink-3 opacity-0 transition-[opacity,color,background-color] group-focus-within/bu-row:opacity-100 group-hover/bu-row:opacity-100 hover:bg-surface-2 hover:text-foreground pointer-coarse:opacity-100",
            FOCUS_IN,
          )}
        >
          {isMuted ? (
            <Bell aria-hidden className="size-3.5" />
          ) : (
            <BellOff aria-hidden className="size-3.5" />
          )}
        </button>
      </motion.li>
    );
  };

  const indexOf = new Map(projects.map((p, i) => [p.id, i]));

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-busy="true" className="flex flex-col gap-2 px-3 py-3">
        <p className="sr-only">Loading projects.</p>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-2 bg-surface-2"
            style={{ height: rowH - 8 }}
          />
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center-safe justify-center-safe gap-3 px-4 py-12 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">Projects didn’t load.</p>
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
    body = (
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 pb-2">
        <motion.div
          className="relative"
          initial={false}
          animate={{ height: layout.height }}
          transition={instant || !motionSafe ? { duration: 0 } : springs.glide}
        >
          {layout.updatedHead !== null ? (
            <div
              className="absolute inset-x-0 top-0 flex items-center gap-2 px-2"
              style={{
                height: HEAD,
                transform: `translateY(${layout.updatedHead}px)`,
              }}
            >
              <p className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-[var(--bu-ink)] uppercase">
                Updated
                <span className="text-ink-3">
                  <Count value={updatedCount} motionSafe={motionSafe} />
                </span>
              </p>
              {updatedCount > 0 ? (
                <button
                  type="button"
                  onClick={markAll}
                  aria-keyshortcuts="Shift+R"
                  title="Mark all read (Shift R)"
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <CheckCheck aria-hidden className="size-3.5" />
                  Mark read
                </button>
              ) : null}
            </div>
          ) : null}
          <AnimatePresence initial={false}>
            {layout.quiet !== null ? (
              <motion.p
                key="quiet"
                className="absolute inset-x-0 top-0 flex items-center gap-2 px-2 text-[12px] text-ink-3"
                style={{ height: QUIET, y: layout.quiet }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                <Check aria-hidden className="size-3.5 shrink-0 text-success" />
                <span className="truncate">
                  {`All caught up · read at ${clock(lastRead)}`}
                </span>
              </motion.p>
            ) : null}
          </AnimatePresence>
          {groups.map((g) => {
            const y = layout.heads.get(g.id);
            if (y === undefined) return null;
            const count = projects.filter((p) => p.group === g.id).length;
            return (
              <motion.p
                key={g.id}
                aria-hidden
                className="absolute inset-x-0 top-0 flex items-end gap-1.5 px-2 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                style={{ height: HEAD }}
                initial={false}
                animate={{ y }}
                transition={
                  instant || !motionSafe ? { duration: 0 } : springs.glide
                }
              >
                {g.label}
                <span className="text-ink-3/70">{count}</span>
              </motion.p>
            );
          })}
          <AnimatePresence>
            {[...layout.gaps].map(([id, y]) => (
              <motion.div
                key={`hole-${id}`}
                aria-hidden
                className="absolute inset-x-1 top-0 rounded-2 border border-dashed border-hairline-strong"
                style={{ height: rowH - 6, y: y + 3 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.base) }}
                transition={{ duration: durations.fast }}
              />
            ))}
          </AnimatePresence>
          <ul
            aria-label="Projects"
            className="pointer-events-none absolute inset-0"
          >
            {projects.map((p) => row(p, indexOf.get(p.id) ?? 0))}
          </ul>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      ref={setWrap}
      className={cn("flex w-full justify-center", className)}
      style={
        {
          "--bu-ink": ACCENTS[accent as BubbleUpAccent] ?? accent,
          "--bu-wash": "color-mix(in oklab, var(--bu-ink) 12%, transparent)",
        } as React.CSSProperties
      }
    >
      <nav
        aria-label={name}
        onKeyDown={onNavKey}
        className="relative flex max-h-[34rem] w-full max-w-[18rem] flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground"
      >
        <header className="flex h-13 shrink-0 items-center gap-2.5 border-b border-hairline px-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--bu-wash)] text-sm font-semibold text-[var(--bu-ink)]"
          >
            {title.charAt(0)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm leading-5 font-semibold">
              {title}
            </span>
            <span className="truncate text-[11px] leading-4 text-ink-3">
              {subtitle}
            </span>
          </div>
          {narrow && ready && chipCount > 0 ? (
            <button
              type="button"
              aria-expanded={chipOpen}
              aria-label={`${plural(chipCount, "project")} updated. ${chipOpen ? "Put them back home" : "Show them at the top"}`}
              onClick={() => setChipOpen((o) => !o)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 font-mono text-[11px] font-medium transition-colors",
                chipOpen
                  ? "bg-[var(--bu-ink)] text-background"
                  : "bg-[var(--bu-wash)] text-[var(--bu-ink)]",
                FOCUS,
              )}
            >
              <Count value={chipCount} motionSafe={motionSafe} />
              <span>new</span>
            </button>
          ) : null}
        </header>

        {body}

        <p id={hintId} className="sr-only">
          Enter opens, M mutes, Shift R marks every update read.
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </nav>
    </div>
  );
}
