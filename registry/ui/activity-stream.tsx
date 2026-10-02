"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowUp,
  CreditCard,
  FileText,
  MessageSquare,
  RotateCcw,
  Rocket,
  TriangleAlert,
  UserPlus,
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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ActivityGroup = "actor" | "kind" | "none";
export type ActivityPill = "avatars" | "count" | "off";
export type ActivityStatus = "ready" | "loading" | "error";

export type ActivityActor = {
  id: string;
  name: string;
  /** A quieter word beside the name in a group header: "Ops lead". */
  role?: string;
  /** The avatar's pigment, any CSS colour. Defaults to a hue of the accent. */
  tint?: string;
};

export type ActivityKind = {
  id: string;
  /** Singular: "Comment". */
  label: string;
  /** Plural, for a grouped header: "Comments". @default label + "s" */
  plural?: string;
  /** 16px, drawn in currentColor. Defaults to a glyph for the built-in ids. */
  icon?: React.ReactNode;
};

export type ActivityEvent = {
  id: string;
  /** An actor's id. */
  actor: string;
  /** A kind's id. */
  kind: string;
  /** What happened, after the actor's name: "commented on". */
  action: string;
  /** What it happened to: "Q4 pricing". */
  target?: string;
  /** A second line: a quote, an amount, a version. */
  detail?: string;
  /** When it happened, as a Date or ms since the epoch. */
  at: number | Date;
};

/** An event still to arrive: the stream stamps it with its own clock. */
export type ActivityIncoming = Omit<ActivityEvent, "at">;

export type ActivityStreamProps = {
  /** How many new events arrive per minute from `incoming` while `live`; 0 stops arrivals. @default 12 */
  rate?: number;
  /** How the feed groups: consecutive events by one person, by one kind, or not at all. @default "actor" */
  group?: ActivityGroup;
  /** How new events wait: behind a pill of faces and a count, behind a plain count, or not at all (they slide in as they land). @default "avatars" */
  pill?: ActivityPill;
  /** The history, any order. New ids added later wait behind the pill like arrivals. @default defaultActivityEvents */
  events?: ActivityEvent[];
  /** Events still to come, released in order at `rate` and looped with fresh ids. @default defaultActivityIncoming */
  incoming?: ActivityIncoming[];
  /** Who can act. @default defaultActivityActors */
  actors?: ActivityActor[];
  /** What can happen: the filter chips, their glyphs and plurals. @default defaultActivityKinds */
  kinds?: ActivityKind[];
  /** The time the stream starts from (Date or ms). @default defaultActivityNow */
  now?: number | Date;
  /** The stream's clock runs on from `now` and `incoming` arrives. Off: the clock holds and nothing arrives. @default true */
  live?: boolean;
  /** Controlled filter: the kind ids shown; empty shows everything. */
  filter?: string[];
  /** Initial filter when uncontrolled. @default [] */
  defaultFilter?: string[];
  /** Fires from the chip that changed the filter, with the new kind ids. */
  onFilterChange?: (kinds: string[]) => void;
  /** The pill was pressed: fires with the events it brought into the feed, newest first. */
  onReveal?: (events: ActivityEvent[]) => void;
  /** An incoming event arrived, stamped with the stream's clock. */
  onArrive?: (event: ActivityEvent) => void;
  /** A line was pressed or opened with Enter. */
  onOpen?: (event: ActivityEvent) => void;
  /** Consecutive events further apart than this, in minutes, start a new group. @default 30 */
  groupWindow?: number;
  /** Lines a group shows before "Show N more". @default 3 */
  collapseAfter?: number;
  /** The panel's height in px; the feed scrolls inside it. @default 560 */
  height?: number;
  /** Whether the history has arrived. @default "ready" */
  status?: ActivityStatus;
  /** "Try again" was pressed after the history failed to load. */
  onRetry?: () => void;
  /** The panel's heading. @default "Activity" */
  title?: string;
  /** The panel's accessible name. @default the title */
  label?: string;
  /** What an empty feed says. @default "No activity yet." */
  emptyLabel?: string;
  /** The absolute time in a line's title. @default "30 Sep, 14:05 UTC" */
  formatTime?: (at: Date) => string;
  /** Play the chips and the reveal. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 30 September 2026, 14:05 UTC. */
export const defaultActivityNow = Date.UTC(2026, 8, 30, 14, 5, 0);

export const defaultActivityActors: ActivityActor[] = [
  { id: "mara", name: "Mara Lind", role: "Ops lead" },
  { id: "teo", name: "Teo Varga", role: "Engineer" },
  { id: "ilse", name: "Ilse Brandt", role: "Release captain" },
  { id: "ama", name: "Ama Okafor", role: "Finance" },
  { id: "rui", name: "Rui Santos", role: "Dispatch" },
  { id: "noor", name: "Noor Haddad", role: "Design" },
  { id: "kit", name: "Kit Morrow", role: "Support" },
  { id: "monitor", name: "Route monitor", role: "Automation" },
  { id: "sol", name: "Sol Arden", role: "Support" },
];

export const defaultActivityKinds: ActivityKind[] = [
  { id: "comment", label: "Comment" },
  { id: "release", label: "Release" },
  { id: "payment", label: "Payment" },
  { id: "alert", label: "Alert" },
  { id: "file", label: "File" },
  { id: "member", label: "Member" },
];

const ago = (minutes: number) => defaultActivityNow - minutes * MINUTE;

export const defaultActivityEvents: ActivityEvent[] = [
  {
    id: "e01",
    actor: "teo",
    kind: "comment",
    action: "commented on",
    target: "Route 14 handoff",
    detail: "Moved the 06:40 pickup to bay C so the second van can load first.",
    at: ago(2),
  },
  {
    id: "e02",
    actor: "teo",
    kind: "file",
    action: "uploaded",
    target: "bay-c-layout.pdf",
    detail: "2 pages · 340 KB",
    at: ago(3),
  },
  {
    id: "e03",
    actor: "mara",
    kind: "comment",
    action: "commented on",
    target: "Route 14 handoff",
    detail: "Works for me. Rui, can dispatch confirm the new bay?",
    at: ago(9),
  },
  {
    id: "e04",
    actor: "monitor",
    kind: "alert",
    action: "flagged",
    target: "Route 7 running 12 min late",
    detail: "Traffic on the coast road. New arrival 15:20.",
    at: ago(14),
  },
  {
    id: "e05",
    actor: "rui",
    kind: "comment",
    action: "commented on",
    target: "Route 7",
    detail: "Rerouting through Fernmoor. Customers have been told.",
    at: ago(16),
  },
  {
    id: "e06",
    actor: "ama",
    kind: "payment",
    action: "recorded a payout from",
    target: "Basinworks Freight",
    detail: "$4,120.00 · Waylight Pay",
    at: ago(31),
  },
  {
    id: "e07",
    actor: "ama",
    kind: "payment",
    action: "marked paid",
    target: "INV-2291",
    detail: "$12,480.00 · Coldbrook Bank",
    at: ago(34),
  },
  {
    id: "e07b",
    actor: "ama",
    kind: "payment",
    action: "reconciled",
    target: "September card fees",
    detail: "$1,204.18 · Waylight Pay",
    at: ago(38),
  },
  {
    id: "e07c",
    actor: "ama",
    kind: "file",
    action: "exported",
    target: "Q3 ledger",
    detail: "CSV for the auditors",
    at: ago(41),
  },
  {
    id: "e08",
    actor: "ilse",
    kind: "release",
    action: "shipped",
    target: "Dispatch 2.14.0",
    detail: "Faster route builder and offline manifests.",
    at: ago(58),
  },
  {
    id: "e09",
    actor: "ilse",
    kind: "comment",
    action: "commented on",
    target: "Dispatch 2.14.0",
    detail: "Rollout at 100%. Watching error rates for the next hour.",
    at: ago(61),
  },
  {
    id: "e10",
    actor: "noor",
    kind: "file",
    action: "uploaded",
    target: "Handoff screens",
    detail: "6 frames for the driver app",
    at: ago(100),
  },
  {
    id: "e11",
    actor: "kit",
    kind: "member",
    action: "invited",
    target: "Sol Arden",
    detail: "Support · viewer access",
    at: ago(130),
  },
  {
    id: "e12",
    actor: "kit",
    kind: "comment",
    action: "commented on",
    target: "Ticket 4471",
    detail: "Customer confirmed the replacement arrived.",
    at: ago(145),
  },
  {
    id: "e13",
    actor: "mara",
    kind: "comment",
    action: "commented on",
    target: "Q4 pricing",
    detail:
      "Can we hold the annual tier at last year's rate for current fleets?",
    at: ago(185),
  },
  {
    id: "e14",
    actor: "ama",
    kind: "comment",
    action: "commented on",
    target: "Q4 pricing",
    detail: "Yes, if the discount moves to the three-year term.",
    at: ago(200),
  },
  {
    id: "e15",
    actor: "monitor",
    kind: "alert",
    action: "cleared",
    target: "Depot sensor offline",
    detail: "Back online after 18 minutes.",
    at: ago(290),
  },
  {
    id: "e16",
    actor: "teo",
    kind: "release",
    action: "deployed",
    target: "Manifest export",
    detail: "Behind a flag for the Fernmoor depot.",
    at: ago(330),
  },
  {
    id: "e17",
    actor: "rui",
    kind: "file",
    action: "shared",
    target: "Weekend roster",
    detail: "Saturday and Sunday, both depots",
    at: ago(420),
  },
  {
    id: "e18",
    actor: "noor",
    kind: "comment",
    action: "commented on",
    target: "Handoff screens",
    detail: "Swapped the map pin for the bay number. Easier to read in sun.",
    at: ago(540),
  },
  {
    id: "e19",
    actor: "ama",
    kind: "payment",
    action: "issued a refund to",
    target: "Gaugeworks",
    detail: "$310.00 · damaged pallet",
    at: ago(660),
  },
  {
    id: "e20",
    actor: "sol",
    kind: "member",
    action: "joined",
    target: "Fieldline Ops",
    at: ago(26 * 60),
  },
  {
    id: "e21",
    actor: "ilse",
    kind: "release",
    action: "shipped",
    target: "Dispatch 2.13.2",
    detail: "Fixes the duplicate stop on resumed routes.",
    at: ago(29 * 60),
  },
  {
    id: "e22",
    actor: "kit",
    kind: "comment",
    action: "commented on",
    target: "Ticket 4459",
    detail: "Waiting on the depot for a photo of the seal.",
    at: ago(31 * 60),
  },
];

export const defaultActivityIncoming: ActivityIncoming[] = [
  {
    id: "n01",
    actor: "rui",
    kind: "comment",
    action: "commented on",
    target: "Route 14 handoff",
    detail: "Bay C confirmed. The second van loads at 06:25.",
  },
  {
    id: "n02",
    actor: "monitor",
    kind: "alert",
    action: "flagged",
    target: "Route 3 waiting at the depot gate",
    detail: "Gate scanner offline; manual check-in.",
  },
  {
    id: "n03",
    actor: "teo",
    kind: "comment",
    action: "commented on",
    target: "Route 14 handoff",
    detail: "Thanks. Updating the manifest now.",
  },
  {
    id: "n04",
    actor: "ama",
    kind: "payment",
    action: "recorded a payout from",
    target: "Fernworks Supply",
    detail: "$2,860.00 · Waylight Pay",
  },
  {
    id: "n05",
    actor: "ilse",
    kind: "release",
    action: "started rolling out",
    target: "Dispatch 2.14.1",
    detail: "Hotfix for duplicate stops · 10%",
  },
  {
    id: "n06",
    actor: "noor",
    kind: "comment",
    action: "commented on",
    target: "Handoff screens",
    detail: "Final frames are in the shared folder.",
  },
  {
    id: "n07",
    actor: "kit",
    kind: "member",
    action: "invited",
    target: "Bea Lund",
    detail: "Dispatch · editor access",
  },
  {
    id: "n08",
    actor: "monitor",
    kind: "alert",
    action: "cleared",
    target: "Route 7 running late",
    detail: "Arrived in Fernmoor at 15:02.",
  },
  {
    id: "n09",
    actor: "mara",
    kind: "comment",
    action: "commented on",
    target: "Q4 pricing",
    detail: "Booked a review with finance for Thursday.",
  },
  {
    id: "n10",
    actor: "teo",
    kind: "file",
    action: "uploaded",
    target: "manifest-2.14.1.csv",
    detail: "412 stops",
  },
  {
    id: "n11",
    actor: "ama",
    kind: "payment",
    action: "sent",
    target: "INV-2304",
    detail: "$8,940.00 · Coldbrook Bank",
  },
  {
    id: "n12",
    actor: "ilse",
    kind: "release",
    action: "finished rolling out",
    target: "Dispatch 2.14.1",
    detail: "100% · no new errors",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

/** Arrivals the stream keeps; older ones fall off the end. */
const KEEP = 80;
/** How long a revealed line stays washed, ms. */
const FRESH_MS = 2400;
/** The first arrival after a (re)start comes no later than this, ms. */
const FIRST_ARRIVAL = 2400;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const ICONS: Record<string, React.ReactNode> = {
  comment: <MessageSquare className="size-3.5" />,
  release: <Rocket className="size-3.5" />,
  payment: <CreditCard className="size-3.5" />,
  alert: <TriangleAlert className="size-3.5" />,
  file: <FileText className="size-3.5" />,
  member: <UserPlus className="size-3.5" />,
};

/** Small indicators keep plain text tokens: they need contrast, not pigment. */
const TONES: Record<string, string> = {
  comment: "text-ink-2",
  release: "text-signal",
  payment: "text-success",
  alert: "text-warn",
  file: "text-ink-2",
  member: "text-cobalt-bright",
};

const toMs = (at: number | Date) =>
  typeof at === "number" ? at : at.getTime();
const pad2 = (n: number) => String(n).padStart(2, "0");
const r2 = (v: number) => Math.round(v * 100) / 100;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** A fixed, locale-free form: a locale lookup during render would not hydrate. */
const absolute = (d: Date) =>
  `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;

/** The short reading a line shows. */
function shortAge(age: number, at: number): string {
  if (age < 10 * SECOND) return "now";
  if (age < MINUTE) return `${Math.floor(age / SECOND)}s`;
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h`;
  if (age < 7 * DAY) return `${Math.floor(age / DAY)}d`;
  const d = new Date(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
}

/** The same reading as a phrase, for a line's accessible name. */
function spokenAge(age: number, at: number): string {
  if (age < 10 * SECOND) return "just now";
  if (age < MINUTE)
    return `${plural(Math.floor(age / SECOND), "second", "seconds")} ago`;
  if (age < HOUR)
    return `${plural(Math.floor(age / MINUTE), "minute", "minutes")} ago`;
  if (age < DAY)
    return `${plural(Math.floor(age / HOUR), "hour", "hours")} ago`;
  if (age < 7 * DAY)
    return `${plural(Math.floor(age / DAY), "day", "days")} ago`;
  const d = new Date(at);
  return `on ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
}

/** Milliseconds until a line of this age reads differently. */
function untilChange(age: number): number {
  if (age < 0) return -age;
  if (age < 10 * SECOND) return 10 * SECOND - age;
  if (age < MINUTE) return SECOND - (age % SECOND);
  if (age < HOUR) return MINUTE - (age % MINUTE);
  if (age < DAY) return HOUR - (age % HOUR);
  if (age < 7 * DAY) return DAY - (age % DAY);
  return Infinity;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/** A face is pigment: a hue of the accent at a fixed lightness, the same in both themes. */
const tintFor = (index: number) =>
  `oklch(from var(--accent-bright) 0.82 0.08 calc(h + ${(index * 47) % 360}))`;

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

type Norm = ActivityEvent & {
  ms: number;
  /** The event as it was given, for callbacks. */
  source: ActivityEvent;
};

type Group = {
  key: string;
  actor: string;
  kind: string;
  lines: Norm[];
};

/** Consecutive events that share an actor (or a kind) inside the window. */
function groupEvents(
  list: Norm[],
  mode: ActivityGroup,
  windowMs: number,
): Group[] {
  const out: Group[] = [];
  for (const ev of list) {
    const last = out[out.length - 1];
    const older = last?.lines[last.lines.length - 1];
    const same =
      mode !== "none" &&
      last !== undefined &&
      older !== undefined &&
      (mode === "actor" ? last.actor === ev.actor : last.kind === ev.kind) &&
      older.ms - ev.ms <= windowMs;
    if (same && last) last.lines.push(ev);
    else out.push({ key: "", actor: ev.actor, kind: ev.kind, lines: [ev] });
  }
  // Keyed by the oldest line, which stays put as newer lines join on top.
  for (const g of out) {
    g.key = `${mode}:${g.lines[g.lines.length - 1]?.id ?? ""}`;
  }
  return out;
}

const subscribeVisibility = (on: () => void) => {
  document.addEventListener("visibilitychange", on);
  return () => document.removeEventListener("visibilitychange", on);
};
const pageShown = () => document.visibilityState !== "hidden";
const pageShownOnServer = () => true;

type Clock = { base: number; banked: number; since: number };
/** How long the stream has run past `now`, ms: banked time plus the current run. */
const readClock = (c: Clock) =>
  c.banked + (c.since < 0 ? 0 : performance.now() - c.since);

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function Avatar({
  actor,
  tint,
  size,
  className,
}: {
  actor: ActivityActor | undefined;
  tint: string;
  size: number;
  className?: string;
}) {
  const name = actor?.name ?? "Someone";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: tint,
        color: `oklch(from ${tint} 0.3 0.06 h)`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * One digit as a column of 0–9 behind a one-line window: a change slides the
 * column on snap, so a count rolls like an odometer instead of swapping.
 */
function Digit({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span className="relative inline-block h-[1em] overflow-clip">
      <motion.span
        className="flex flex-col"
        initial={false}
        animate={{ y: `${-value}em` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {Array.from({ length: 10 }, (_, d) => (
          <span key={d} className="block h-[1em] leading-none">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Roll({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex leading-none tabular-nums">
      {chars.map((ch, i) => {
        // Keyed from the right, so the units stay the units as the count grows.
        const place = chars.length - i;
        return ch >= "0" && ch <= "9" ? (
          <Digit key={`d${place}`} value={Number(ch)} motionSafe={motionSafe} />
        ) : (
          <span key={`c${place}${ch}`} className="inline-block h-[1em]">
            {ch}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The mark a revealed line carries: a wash and a dot that fade on a linear
 * tween. Run from an effect rather than an `initial`, so a line that arrives
 * inside a group that is itself arriving still gets it; a StrictMode re-run
 * starts it again and lets it finish. It is a colour change, so it runs
 * under reduced motion too.
 */
function Wash() {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FRESH_MS,
      easing: "linear",
      fill: "forwards",
    });
    return () => fade.cancel();
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-2 bg-[color-mix(in_oklab,var(--accent-bright)_14%,transparent)]"
    >
      <span className="absolute top-3.5 -left-0.5 size-1.5 rounded-full bg-cobalt-bright" />
    </span>
  );
}

/**
 * A region whose height glides to what its content measures, so a group
 * opening its hidden lines pushes the feed down instead of jumping.
 */
function Collapse({
  open,
  id,
  motionSafe,
  children,
}: {
  open: boolean;
  id: string;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const [h, setH] = React.useState(0);
  React.useEffect(() => {
    if (!inner) return;
    const ro = new ResizeObserver(() =>
      setH(Math.round(inner.getBoundingClientRect().height)),
    );
    ro.observe(inner);
    return () => ro.disconnect();
  }, [inner]);
  return (
    <motion.div
      id={id}
      aria-hidden={!open || undefined}
      inert={!open}
      className="overflow-clip"
      initial={false}
      animate={{ height: open ? h : 0, opacity: open ? 1 : 0 }}
      transition={
        motionSafe
          ? {
              height: springs.glide,
              opacity: { duration: durations.fast, ease: easings.enter },
            }
          : { duration: 0 }
      }
    >
      <div ref={setInner}>{children}</div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The stream                                */
/* ----------------------------------------------------------------------- */

type Feed = {
  /** Incoming events that have landed, oldest first. */
  arrived: ActivityEvent[];
  /** Ids waiting behind the pill, in arrival order. */
  pending: string[];
  /** Ids revealed in the last moment: they carry the wash. */
  fresh: string[];
};

type Latest = {
  arrive: () => void;
  wait: (elapsed: number) => number;
  afterScroll: () => void;
};

type ExitReason = "regroup" | "filter";

/**
 * A live activity feed. New events gather behind an "N new" pill — the
 * faces of the people behind them stacking onto it, the count rolling on
 * snap — instead of shoving the list under the reader's eyes. Pressing the
 * pill scrolls the feed to its top on glide and releases them: they arrive
 * from a step above in a cascade while everything under them glides down,
 * each carrying a wash that fades over a couple of seconds so what is new
 * stays readable after the motion is over.
 *
 * Events group by person or by kind, and changing the grouping relayouts the
 * feed with every line gliding to its new seat. Relative times update on a
 * timer set for the next boundary any line will cross, paused while the page
 * is hidden or the feed is off screen; the clock starts at `now` and never
 * reads the wall clock during render, so the server and the browser agree.
 *
 * The list is a real `role="feed"` of articles with one roving tab stop:
 * Up and Down move between lines, Page keys between articles, Enter opens.
 * Under reduced motion the feed simply lists — nothing slides or rolls —
 * and the fresh wash still fades, because what is new is information.
 */
export function ActivityStream({
  rate = 12,
  group = "actor",
  pill = "avatars",
  events = defaultActivityEvents,
  incoming = defaultActivityIncoming,
  actors = defaultActivityActors,
  kinds = defaultActivityKinds,
  now = defaultActivityNow,
  live = true,
  filter,
  defaultFilter,
  onFilterChange,
  onReveal,
  onArrive,
  onOpen,
  groupWindow = 30,
  collapseAfter = 3,
  height = 560,
  status = "ready",
  onRetry,
  title = "Activity",
  label,
  emptyLabel = "No activity yet.",
  formatTime = absolute,
  sound = false,
  disabled = false,
  className,
}: ActivityStreamProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const baseMs = toMs(now);
  const hold = pill !== "off";
  const windowMs = Math.max(0, groupWindow) * MINUTE;
  const showLines = Math.max(1, Math.round(collapseAfter));

  /* ------------------------------ the clock ------------------------------ */

  const [elapsed, setElapsed] = React.useState(0);
  const [seenBase, setSeenBase] = React.useState(baseMs);
  if (seenBase !== baseMs) {
    setSeenBase(baseMs);
    setElapsed(0);
  }
  /** Time banked while paused, and when the current run began (performance time). */
  const clock = React.useRef<Clock>({ base: baseMs, banked: 0, since: -1 });
  React.useEffect(() => {
    const c = clock.current;
    if (c.base !== baseMs) {
      c.base = baseMs;
      c.banked = 0;
      c.since = -1;
    }
    if (live && c.since < 0) c.since = performance.now();
    if (!live && c.since >= 0) {
      c.banked += performance.now() - c.since;
      c.since = -1;
    }
  }, [baseMs, live]);
  const clockMs = baseMs + elapsed;

  /* ------------------------------ the events ----------------------------- */

  const [feed, setFeed] = React.useState<Feed>({
    arrived: [],
    pending: [],
    fresh: [],
  });
  const cursor = React.useRef(0);

  // Ids a host adds to `events` after mount are news too: they wait like
  // arrivals. Worked out here, from the props, rather than in an effect.
  const [known, setKnown] = React.useState(() => ({
    source: events,
    ids: new Set(events.map((e) => e.id)),
  }));
  if (known.source !== events) {
    const added = events.filter((e) => !known.ids.has(e.id)).map((e) => e.id);
    setKnown({
      source: events,
      ids: new Set([...known.ids, ...events.map((e) => e.id)]),
    });
    if (added.length > 0) {
      setFeed((f) =>
        hold
          ? { ...f, pending: [...f.pending, ...added] }
          : { ...f, fresh: [...f.fresh, ...added] },
      );
    }
  }

  const actorById = new Map(actors.map((a, i) => [a.id, { a, i }]));
  const kindById = new Map(kinds.map((k) => [k.id, k]));
  const tintOf = (id: string) => {
    const hit = actorById.get(id);
    return hit?.a.tint ?? tintFor(hit ? hit.i : 0);
  };
  const nameOf = (id: string) => actorById.get(id)?.a.name ?? "Someone";
  const kindName = (id: string, n: number) => {
    const k = kindById.get(id);
    const one = (k?.label ?? id).toLowerCase();
    const many = (k?.plural ?? `${k?.label ?? id}s`).toLowerCase();
    return plural(n, one, many);
  };

  const byId = new Map<string, Norm>();
  for (const e of events) byId.set(e.id, { ...e, ms: toMs(e.at), source: e });
  for (const e of feed.arrived) {
    if (!byId.has(e.id)) byId.set(e.id, { ...e, ms: toMs(e.at), source: e });
  }
  const waiting = new Set(feed.pending);
  const freshSet = new Set(feed.fresh);
  const newestFirst = (a: Norm, b: Norm) =>
    b.ms - a.ms || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const shown = [...byId.values()]
    .filter((e) => !waiting.has(e.id))
    .sort(newestFirst);

  const [ownFilter, setOwnFilter] = React.useState<string[]>(
    () => defaultFilter ?? [],
  );
  const activeFilter = filter ?? ownFilter;
  const passes = (e: Norm) =>
    activeFilter.length === 0 || activeFilter.includes(e.kind);
  const visible = shown.filter(passes);
  const groups = groupEvents(visible, group, windowMs);

  const pendingEvents = feed.pending
    .map((id) => byId.get(id))
    .filter((e): e is Norm => e !== undefined)
    .sort(newestFirst);
  const pendingShown = pendingEvents.filter(passes);
  const waitingCount = pendingShown.length;

  const counts = new Map<string, number>();
  for (const e of shown) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const presentKinds = kinds.filter((k) => (counts.get(k.id) ?? 0) > 0);

  // A grouping change is a relayout, not a departure: the lines travel to
  // their new seats, so the groups they leave go at once. A filter change is
  // a departure, and fades.
  const [change, setChange] = React.useState<ExitReason>("filter");
  const [seenGroup, setSeenGroup] = React.useState(group);
  if (seenGroup !== group) {
    setSeenGroup(group);
    setChange("regroup");
  }

  // Switched to no pill: whatever was waiting simply joins the feed.
  if (!hold && feed.pending.length > 0) {
    setFeed((f) => ({ ...f, pending: [] }));
  }

  /* ----------------------------- live regions ---------------------------- */

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ visibility ----------------------------- */

  const [rootEl, setRootEl] = React.useState<HTMLDivElement | null>(null);
  const feedRef = React.useRef<HTMLDivElement | null>(null);
  const [onScreen, setOnScreen] = React.useState(true);
  const pageVisible = React.useSyncExternalStore(
    subscribeVisibility,
    pageShown,
    pageShownOnServer,
  );
  React.useEffect(() => {
    if (!rootEl || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setOnScreen(last.isIntersecting);
    });
    io.observe(rootEl);
    return () => io.disconnect();
  }, [rootEl]);
  const awake = pageVisible && onScreen;

  /* ------------------------------- timers -------------------------------- */

  const timers = React.useRef(new Set<number>());
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };
  const unwash = (ids: string[]) =>
    later(
      () =>
        setFeed((f) => ({
          ...f,
          fresh: f.fresh.filter((id) => !ids.includes(id)),
        })),
      FRESH_MS + 200,
    );

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const arrive = () => {
    const list = incoming;
    if (list.length === 0) return;
    const n = cursor.current;
    cursor.current += 1;
    const tmpl = list[n % list.length];
    if (!tmpl) return;
    const round = Math.floor(n / list.length);
    const id = round > 0 ? `${tmpl.id}~${round}` : tmpl.id;
    const e = Math.round(readClock(clock.current));
    const event: ActivityEvent = { ...tmpl, id, at: baseMs + e };
    setElapsed(e);
    setFeed((f) => ({
      arrived: [...f.arrived, event].slice(-KEEP),
      pending: hold ? [...f.pending, id] : f.pending,
      fresh: hold ? f.fresh : [...f.fresh, id],
    }));
    if (!hold) unwash([id]);
    else if (
      waitingCount === 0 &&
      (activeFilter.length === 0 || activeFilter.includes(event.kind))
    ) {
      say("New updates are waiting at the top of the feed.");
    }
    onArrive?.(event);
  };

  /** Milliseconds until any line on screen reads differently. */
  const wait = (e: number) => {
    const at = baseMs + e;
    let soonest = Infinity;
    for (const ev of visible)
      soonest = Math.min(soonest, untilChange(at - ev.ms));
    return Math.min(60 * SECOND, Math.max(250, Math.ceil(soonest) + 20));
  };

  /* ------------------------------- reveal -------------------------------- */

  const [activeStop, setActiveStop] = React.useState<string | null>(null);
  const revealing = React.useRef(false);
  const pillRef = React.useRef<HTMLButtonElement | null>(null);
  const wantFocus = React.useRef<string | null>(null);
  const handOff = React.useRef(false);

  const commitReveal = () => {
    revealing.current = false;
    const ids = feed.pending;
    if (ids.length === 0) return;
    const revealed = pendingEvents;
    setFeed((f) => ({ ...f, pending: [], fresh: [...f.fresh, ...ids] }));
    unwash(ids);
    const first = revealed.find(passes);
    if (handOff.current && first) {
      wantFocus.current = `line:${first.id}`;
      setActiveStop(`line:${first.id}`);
    }
    handOff.current = false;
    const hidden = revealed.length - revealed.filter(passes).length;
    say(
      `Showing ${plural(revealed.length - hidden, "new update", "new updates")}${
        hidden > 0 ? `, ${hidden} hidden by the filter` : ""
      }.`,
    );
    onReveal?.(revealed.map((e) => e.source));
  };

  const reveal = () => {
    if (disabled || revealing.current || feed.pending.length === 0) return;
    handOff.current =
      typeof document !== "undefined" &&
      document.activeElement === pillRef.current;
    const rect = pillRef.current?.getBoundingClientRect();
    audio.play("pop", {
      pitch: r2(1.25 - Math.min(0.35, waitingCount * 0.035)),
      gain: 0.6,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    const scroller = feedRef.current;
    if (scroller && scroller.scrollTop > 2) {
      revealing.current = true;
      if (!motionSafe) {
        scroller.scrollTop = 0;
        commitReveal();
        return;
      }
      // Up to the top first, then the news: inserting while the list is
      // still scrolling would measure the layout mid-flight.
      run(
        "scroll",
        animate(scroller.scrollTop, 0, {
          ...springs.glide,
          onUpdate: (v) => {
            scroller.scrollTop = v;
          },
          onComplete: () => latest.current?.afterScroll(),
        }),
      );
      return;
    }
    commitReveal();
  };

  const latest = React.useRef<Latest | null>(null);
  React.useEffect(() => {
    latest.current = { arrive, wait, afterScroll: commitReveal };
  });

  // The clock ticks for the next boundary a line will cross, and arrivals
  // land at `rate` — only while live, on screen and the page is shown.
  const incomingCount = incoming.length;
  React.useEffect(() => {
    if (!live || !awake) return;
    let tick = 0;
    let land = 0;
    const step = () => {
      const e = readClock(clock.current);
      setElapsed(Math.round(e));
      tick = window.setTimeout(step, latest.current?.wait(e) ?? SECOND);
    };
    tick = window.setTimeout(
      step,
      latest.current?.wait(readClock(clock.current)) ?? SECOND,
    );
    const every = rate > 0 ? (60 * SECOND) / rate : 0;
    if (every > 0 && incomingCount > 0) {
      const next = () => {
        latest.current?.arrive();
        land = window.setTimeout(next, every);
      };
      land = window.setTimeout(next, Math.min(every, FIRST_ARRIVAL));
    }
    return () => {
      window.clearTimeout(tick);
      window.clearTimeout(land);
    };
  }, [live, awake, rate, incomingCount]);

  React.useEffect(() => {
    const pending = timers.current;
    const running = anims.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ------------------------------- filters ------------------------------- */

  const setFilter = (next: string[], el: Element | null, on: boolean) => {
    if (disabled) return;
    const rect = el?.getBoundingClientRect();
    audio.play("plip", {
      pitch: on ? 1.15 : 0.85,
      gain: 0.45,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    setChange("filter");
    if (filter === undefined) setOwnFilter(next);
    onFilterChange?.(next);
    const n = shown.filter(
      (e) => next.length === 0 || next.includes(e.kind),
    ).length;
    const names = next
      .map(
        (id) => kindById.get(id)?.plural ?? `${kindById.get(id)?.label ?? id}s`,
      )
      .join(", ")
      .toLowerCase();
    say(
      next.length === 0
        ? `Showing everything, ${plural(n, "update", "updates")}.`
        : `Showing ${names}, ${plural(n, "update", "updates")}.`,
    );
  };

  const toggleKind = (id: string, el: Element | null) => {
    const on = !activeFilter.includes(id);
    let next = on
      ? [...activeFilter, id]
      : activeFilter.filter((k) => k !== id);
    // Every kind chosen is the same as none chosen: say so with All.
    if (presentKinds.every((k) => next.includes(k.id))) next = [];
    setFilter(next, el, on);
  };

  /* ---------------------------- show more/less --------------------------- */

  const [expanded, setExpanded] = React.useState<string[]>([]);
  const toggleMore = (key: string, el: Element | null) => {
    const open = !expanded.includes(key);
    const rect = el?.getBoundingClientRect();
    audio.play("plip", {
      pitch: open ? 1 : 0.88,
      gain: 0.4,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    setExpanded((list) =>
      open ? [...list, key] : list.filter((k) => k !== key),
    );
  };

  /* ---------------------------- roving focus ----------------------------- */

  type Stop = { key: string; article: number };
  const stops: Stop[] = [];
  groups.forEach((g, gi) => {
    const open = expanded.includes(g.key);
    g.lines.forEach((ev, li) => {
      if (li < showLines || open)
        stops.push({ key: `line:${ev.id}`, article: gi });
    });
    if (g.lines.length > showLines)
      stops.push({ key: `more:${g.key}`, article: gi });
  });
  const tabStop = stops.some((s) => s.key === activeStop)
    ? activeStop
    : (stops[0]?.key ?? null);
  const stopNodes = React.useRef(new Map<string, HTMLElement>());
  const [focusNode, setFocusNode] = React.useState<HTMLElement | null>(null);
  const bindStop = (key: string) => (node: HTMLElement | null) => {
    if (node) {
      stopNodes.current.set(key, node);
      if (wantFocus.current === key) {
        wantFocus.current = null;
        setFocusNode(node);
      }
    } else if (stopNodes.current.get(key)) {
      stopNodes.current.delete(key);
    }
  };
  // Focus that follows a reveal lands on the line once it has arrived.
  React.useEffect(() => {
    focusNode?.focus({ preventScroll: true });
  }, [focusNode]);

  const moveTo = (key: string | undefined) => {
    if (!key) return;
    setActiveStop(key);
    stopNodes.current.get(key)?.focus();
  };

  const onFeedKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const key = target.closest<HTMLElement>("[data-stop]")?.dataset.stop;
    const i = stops.findIndex((s) => s.key === key);
    if (i === -1) return;
    const here = stops[i];
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(stops[Math.min(stops.length - 1, i + 1)]?.key);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveTo(stops[Math.max(0, i - 1)]?.key);
        return;
      case "Home":
        event.preventDefault();
        moveTo(stops[0]?.key);
        return;
      case "End":
        event.preventDefault();
        moveTo(stops[stops.length - 1]?.key);
        return;
      case "PageDown": {
        event.preventDefault();
        const next = stops.find((s) => here && s.article > here.article);
        moveTo((next ?? stops[stops.length - 1])?.key);
        return;
      }
      case "PageUp": {
        event.preventDefault();
        const prev = here
          ? stops.find((s) => s.article === here.article - 1)
          : undefined;
        moveTo((prev ?? stops[0])?.key);
        return;
      }
    }
  };

  /* ------------------------------- render -------------------------------- */

  const lineName = (ev: Norm) =>
    `${nameOf(ev.actor)} ${ev.action}${ev.target ? ` ${ev.target}` : ""}, ${spokenAge(clockMs - ev.ms, ev.ms)}`;

  const faces = [...new Set(pendingShown.map((e) => e.actor))].slice(0, 3);
  const showPill = hold && waitingCount > 0 && status === "ready";

  const hours = Array.from({ length: 12 }, (_, j) => {
    const to = clockMs - (11 - j) * HOUR;
    const from = to - HOUR;
    return shown.filter((e) => e.ms > from && e.ms <= to).length;
  });
  const busiest = Math.max(1, ...hours);
  const people = [...new Set(shown.map((e) => e.actor))]
    .map((id) => ({ id, n: shown.filter((e) => e.actor === id).length }))
    .sort((a, b) => b.n - a.n || (nameOf(a.id) < nameOf(b.id) ? -1 : 1))
    .slice(0, 4);

  const chip = (pressed: boolean) =>
    cn(
      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
      FOCUS_RING,
      pressed
        ? "border-transparent bg-cobalt-wash text-foreground"
        : "border-hairline text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
      "disabled:cursor-not-allowed disabled:opacity-60",
    );
  const sideRow = (pressed: boolean) =>
    cn(
      "flex h-7 w-full items-center gap-2 rounded-2 px-2 text-left text-[13px] transition-colors",
      FOCUS_IN,
      pressed
        ? "bg-cobalt-wash text-foreground"
        : "text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
      "disabled:cursor-not-allowed disabled:opacity-60",
    );

  // Revealed lines arrive top to bottom, one cascade step apart, the whole
  // batch inside the choreography budget.
  const revealOrder = new Map(
    visible.filter((e) => freshSet.has(e.id)).map((e, i) => [e.id, i]),
  );
  const pendingOrder = (id: string) => revealOrder.get(id) ?? 0;
  const step = cascade(Math.max(2, revealOrder.size));

  const renderLine = (ev: Norm, delayIndex: number) => {
    const isFresh = freshSet.has(ev.id);
    const stopKey = `line:${ev.id}`;
    const age = clockMs - ev.ms;
    const detailId = `${uid}-d-${ev.id}`;
    const lead =
      group === "actor" ? (
        <span
          className={cn(
            "row-span-2 flex size-5 items-center",
            TONES[ev.kind] ?? "text-ink-2",
          )}
        >
          {kindById.get(ev.kind)?.icon ?? ICONS[ev.kind] ?? ICONS.comment}
        </span>
      ) : group === "kind" ? (
        <span className="row-span-2 flex h-5 items-center">
          <Avatar
            actor={actorById.get(ev.actor)?.a}
            tint={tintOf(ev.actor)}
            size={18}
          />
        </span>
      ) : (
        <span className="relative row-span-2 flex h-7 items-start">
          <Avatar
            actor={actorById.get(ev.actor)?.a}
            tint={tintOf(ev.actor)}
            size={28}
          />
          <span
            className={cn(
              "absolute -right-1 -bottom-1.5 flex size-4 items-center justify-center rounded-full bg-card [&_svg]:size-3",
              TONES[ev.kind] ?? "text-ink-2",
            )}
          >
            {kindById.get(ev.kind)?.icon ?? ICONS[ev.kind] ?? ICONS.comment}
          </span>
        </span>
      );
    const sentence =
      group === "actor" ? (
        <>
          {capitalise(ev.action)}
          {ev.target ? (
            <>
              {" "}
              <span className="font-medium text-foreground">{ev.target}</span>
            </>
          ) : null}
        </>
      ) : (
        <>
          <span className="font-medium text-foreground">
            {nameOf(ev.actor)}
          </span>{" "}
          {ev.action}
          {ev.target ? (
            <>
              {" "}
              <span className="font-medium text-foreground">{ev.target}</span>
            </>
          ) : null}
        </>
      );
    return (
      <motion.li
        key={ev.id}
        layoutId={motionSafe ? `${uid}-${ev.id}` : undefined}
        layout={motionSafe ? "position" : false}
        initial={
          motionSafe && isFresh ? { opacity: 0, y: -distances.step } : false
        }
        animate={{ opacity: 1, y: 0 }}
        exit={{
          opacity: 0,
          transition:
            change === "regroup" ? { duration: 0 } : exitFor(durations.base),
        }}
        transition={{
          layout: springs.glide,
          y: { ...springs.glide, delay: delayIndex * step },
          opacity: {
            duration: durations.base,
            ease: easings.enter,
            delay: delayIndex * step,
          },
        }}
        className="relative"
      >
        {isFresh ? <Wash /> : null}
        <button
          ref={bindStop(stopKey)}
          type="button"
          data-stop={stopKey}
          tabIndex={tabStop === stopKey ? 0 : -1}
          disabled={disabled}
          aria-label={lineName(ev)}
          aria-describedby={ev.detail ? detailId : undefined}
          onFocus={() => setActiveStop(stopKey)}
          onClick={() => onOpen?.(ev.source)}
          title={formatTime(new Date(ev.ms))}
          className={cn(
            "relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-2 px-2 py-1.5 text-left transition-colors",
            "@min-[68rem]:grid-cols-[auto_minmax(0,1fr)_minmax(0,15rem)_auto]",
            FOCUS_IN,
            "enabled:hover:bg-surface-2 disabled:cursor-not-allowed",
          )}
        >
          {lead}
          <span className="text-[13px] leading-5 text-ink-2">{sentence}</span>
          {ev.detail ? (
            <span
              id={detailId}
              title={ev.detail}
              className={cn(
                "col-start-2 row-start-2 line-clamp-2 text-[12px] leading-[18px] text-ink-3",
                "@min-[68rem]:col-start-3 @min-[68rem]:row-start-1 @min-[68rem]:line-clamp-1 @min-[68rem]:leading-5",
              )}
            >
              {ev.detail}
            </span>
          ) : null}
          <time
            dateTime={new Date(ev.ms).toISOString()}
            className="col-start-3 row-start-1 w-11 text-right font-mono text-[11px] leading-5 text-ink-3 tabular-nums @min-[68rem]:col-start-4"
          >
            {shortAge(age, ev.ms)}
          </time>
        </button>
      </motion.li>
    );
  };

  const renderGroup = (g: Group, gi: number) => {
    const headId = `${uid}-h-${g.key}`;
    const moreId = `${uid}-m-${g.key}`;
    const open = expanded.includes(g.key);
    const first = g.lines.slice(0, showLines);
    const rest = g.lines.slice(showLines);
    const allFresh = g.lines.every((e) => freshSet.has(e.id));
    const actor = actorById.get(g.actor)?.a;
    const header =
      group === "actor" ? (
        <div id={headId} className="flex h-8 items-center gap-2.5 px-2">
          <Avatar actor={actor} tint={tintOf(g.actor)} size={24} />
          <span className="truncate text-[13px] font-medium text-foreground">
            {nameOf(g.actor)}
          </span>
          {actor?.role ? (
            <span className="hidden truncate text-[11px] text-ink-3 @min-[22rem]:inline">
              {actor.role}
            </span>
          ) : null}
        </div>
      ) : group === "kind" ? (
        <div id={headId} className="flex h-8 items-center gap-2.5 px-2">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-2 bg-surface-2",
              TONES[g.kind] ?? "text-ink-2",
            )}
          >
            {kindById.get(g.kind)?.icon ?? ICONS[g.kind] ?? ICONS.comment}
          </span>
          <span className="truncate text-[13px] font-medium text-foreground">
            {kindName(g.kind, g.lines.length)}
          </span>
          <span className="ml-auto flex shrink-0 -space-x-1.5" aria-hidden>
            {[...new Set(g.lines.map((e) => e.actor))].slice(0, 3).map((id) => (
              <Avatar
                key={id}
                actor={actorById.get(id)?.a}
                tint={tintOf(id)}
                size={18}
                className="ring-2 ring-card"
              />
            ))}
          </span>
        </div>
      ) : null;
    return (
      <motion.article
        key={g.key}
        aria-posinset={gi + 1}
        aria-setsize={groups.length}
        aria-labelledby={header ? headId : undefined}
        aria-label={
          header ? undefined : g.lines[0] ? lineName(g.lines[0]) : undefined
        }
        layout={motionSafe ? "position" : false}
        initial={motionSafe && allFresh ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{
          layout: springs.glide,
          opacity: { duration: durations.base, ease: easings.enter },
        }}
        variants={{
          gone: (reason: ExitReason) => ({
            opacity: 0,
            transition:
              reason === "regroup" ? { duration: 0 } : exitFor(durations.base),
          }),
        }}
        exit="gone"
        className="border-t border-hairline py-1.5 first:border-t-0"
      >
        {header ? (
          <motion.div
            initial={motionSafe && !allFresh ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            {header}
          </motion.div>
        ) : null}
        <ul role="list" className={cn("relative", header && "pl-[34px]")}>
          <AnimatePresence initial={allFresh} mode="popLayout">
            {first.map((ev) => renderLine(ev, pendingOrder(ev.id)))}
          </AnimatePresence>
        </ul>
        {rest.length > 0 ? (
          <>
            <Collapse id={moreId} open={open} motionSafe={motionSafe}>
              <ul role="list" className={cn("relative", header && "pl-[34px]")}>
                {rest.map((ev) => renderLine(ev, pendingOrder(ev.id)))}
              </ul>
            </Collapse>
            <div className={cn("flex", header ? "pl-[66px]" : "pl-[40px]")}>
              <button
                ref={bindStop(`more:${g.key}`)}
                type="button"
                data-stop={`more:${g.key}`}
                tabIndex={tabStop === `more:${g.key}` ? 0 : -1}
                disabled={disabled}
                aria-expanded={open}
                aria-controls={moreId}
                onFocus={() => setActiveStop(`more:${g.key}`)}
                onClick={(event) => toggleMore(g.key, event.currentTarget)}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 px-1.5 text-xs text-cobalt-bright transition-colors enabled:hover:bg-surface-2",
                  FOCUS_RING,
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {open ? "Show less" : `Show ${rest.length} more`}
              </button>
            </div>
          </>
        ) : null}
      </motion.article>
    );
  };

  const allChips = (
    <>
      <button
        type="button"
        aria-pressed={activeFilter.length === 0}
        disabled={disabled}
        onClick={(event) => setFilter([], event.currentTarget, true)}
        className={chip(activeFilter.length === 0)}
      >
        All
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {shown.length}
        </span>
      </button>
      {presentKinds.map((k) => {
        const pressed = activeFilter.includes(k.id);
        return (
          <button
            key={k.id}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={(event) => toggleKind(k.id, event.currentTarget)}
            className={chip(pressed)}
          >
            {k.plural ?? `${k.label}s`}
            <span className="font-mono text-[10px] text-ink-3 tabular-nums">
              {counts.get(k.id) ?? 0}
            </span>
          </button>
        );
      })}
    </>
  );

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div className="flex flex-col gap-3 p-3" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="size-6 shrink-0 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            <span className="flex flex-1 flex-col gap-1.5 pt-1">
              <span
                className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${[72, 58, 80, 46, 66, 54][i] ?? 60}%` }}
              />
              <span
                className="h-2 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${[40, 62, 34, 52, 44, 30][i] ?? 40}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2 px-4 py-6">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-warn" />
          Activity didn&apos;t load.
        </p>
        <p className="text-xs text-ink-3">
          The feed will pick up from where it stopped.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className={cn(
            "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors enabled:hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    );
  } else if (groups.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-2 px-4 py-6">
        <p className="text-sm text-ink-2">
          {shown.length === 0 ? emptyLabel : "Nothing matches these filters."}
        </p>
        {shown.length > 0 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => setFilter([], event.currentTarget, true)}
            className={cn(
              "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors enabled:hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            Show everything
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <AnimatePresence initial={false} mode="popLayout" custom={change}>
        {groups.map((g, gi) => renderGroup(g, gi))}
      </AnimatePresence>
    );
  }

  return (
    <div
      ref={setRootEl}
      role="region"
      aria-label={label ?? title}
      className={cn(
        "@container relative flex w-full flex-col overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex shrink-0 flex-col gap-2.5 border-b border-hairline px-3 pt-3 pb-2.5 @min-[40rem]:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{title}</h3>
            <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  live ? "bg-signal" : "bg-ink-3",
                )}
              />
              {live ? "Live" : "Paused"}
            </span>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {plural(visible.length, "update", "updates")}
          </span>
        </div>
        <div
          role="group"
          aria-label="Filter by type"
          className="-mx-3 flex [scrollbar-width:none] gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)] px-3 @min-[40rem]:hidden"
        >
          {allChips}
        </div>
      </header>

      <div className="grid flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden @min-[40rem]:grid-cols-[13rem_minmax(0,1fr)] @min-[68rem]:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden [scrollbar-width:thin] flex-col gap-4 overflow-y-auto overscroll-contain border-r border-hairline p-3 @min-[40rem]:flex">
          <div
            role="group"
            aria-label="Filter by type"
            className="flex flex-col gap-0.5"
          >
            <p className="px-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Show
            </p>
            <button
              type="button"
              aria-pressed={activeFilter.length === 0}
              disabled={disabled}
              onClick={(event) => setFilter([], event.currentTarget, true)}
              className={sideRow(activeFilter.length === 0)}
            >
              <span className="min-w-0 flex-1 truncate">Everything</span>
              <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                {shown.length}
              </span>
            </button>
            {presentKinds.map((k) => {
              const pressed = activeFilter.includes(k.id);
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={pressed}
                  disabled={disabled}
                  onClick={(event) => toggleKind(k.id, event.currentTarget)}
                  className={sideRow(pressed)}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center",
                      TONES[k.id] ?? "text-ink-2",
                    )}
                  >
                    {k.icon ?? ICONS[k.id] ?? ICONS.comment}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {k.plural ?? `${k.label}s`}
                  </span>
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {counts.get(k.id) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1">
            <p className="px-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              People
            </p>
            <ul role="list" className="flex flex-col">
              {people.map((p) => (
                <li key={p.id} className="flex h-7 items-center gap-2 px-2">
                  <Avatar
                    actor={actorById.get(p.id)?.a}
                    tint={tintOf(p.id)}
                    size={18}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                    {nameOf(p.id)}
                  </span>
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {p.n}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden flex-col gap-2 px-2 @min-[68rem]:flex">
            <p className="flex items-center justify-between font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <span>Last 12 hours</span>
              <span className="tabular-nums">
                {hours.reduce((a, b) => a + b, 0)}
              </span>
            </p>
            <div
              role="img"
              aria-label={`Updates per hour over the last 12 hours, oldest first: ${hours.join(", ")}.`}
              className="flex h-12 items-end gap-1"
            >
              {hours.map((n, j) => (
                <span
                  key={j}
                  className={cn(
                    "flex-1 rounded-t-1",
                    n > 0 ? "bg-cobalt-bright/60" : "bg-surface-2",
                    motionSafe && "transition-[height] duration-300",
                  )}
                  style={{
                    height: `${n > 0 ? Math.max(12, Math.round((n / busiest) * 100)) : 6}%`,
                  }}
                />
              ))}
            </div>
          </div>
        </aside>

        <div className="relative flex flex-col overflow-hidden">
          <motion.div
            ref={feedRef}
            role="feed"
            aria-busy={status === "loading" || undefined}
            aria-label={`${title}, newest first`}
            layoutScroll
            onKeyDown={onFeedKeyDown}
            className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-1.5 py-1.5 @min-[40rem]:px-2.5"
          >
            {body}
          </motion.div>

          <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-3">
            <AnimatePresence>
              {showPill ? (
                <motion.button
                  ref={pillRef}
                  key="pill"
                  type="button"
                  disabled={disabled}
                  aria-label={`Show ${plural(waitingCount, "new update", "new updates")}`}
                  onClick={reveal}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: -distances.step, scale: 0.96 }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    y: motionSafe ? -distances.nudge : 0,
                    transition: exitFor(durations.base),
                  }}
                  transition={{
                    y: springs.snap,
                    scale: springs.snap,
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }}
                  className={cn(
                    "pointer-events-auto inline-flex h-8 items-center gap-2 rounded-full border border-hairline-strong bg-popover text-xs font-medium text-foreground",
                    "shadow-[0_6px_18px_color-mix(in_oklab,black_16%,transparent)] transition-colors enabled:hover:bg-surface-2",
                    pill === "avatars" ? "pr-3 pl-1" : "px-3",
                    FOCUS_RING,
                  )}
                >
                  {pill === "avatars" ? (
                    <span className="flex -space-x-1.5" aria-hidden>
                      <AnimatePresence initial={false}>
                        {faces.map((id) => (
                          <motion.span
                            key={id}
                            layout={motionSafe ? "position" : false}
                            initial={
                              motionSafe
                                ? { scale: 0.4, opacity: 0 }
                                : { opacity: 0 }
                            }
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={{
                              scale: springs.recoil,
                              layout: springs.glide,
                              opacity: { duration: durations.fast },
                            }}
                            className="flex rounded-full ring-2 ring-popover"
                          >
                            <Avatar
                              actor={actorById.get(id)?.a}
                              tint={tintOf(id)}
                              size={22}
                            />
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </span>
                  ) : (
                    <ArrowUp
                      aria-hidden
                      className="size-3.5 shrink-0 text-cobalt-bright"
                    />
                  )}
                  <span className="inline-flex items-center gap-1 leading-none">
                    <Roll
                      text={waitingCount > 99 ? "99+" : String(waitingCount)}
                      motionSafe={motionSafe}
                    />
                    <span aria-hidden>
                      {pill === "avatars"
                        ? "new"
                        : waitingCount === 1
                          ? "new update"
                          : "new updates"}
                    </span>
                  </span>
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
