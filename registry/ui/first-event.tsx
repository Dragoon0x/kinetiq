"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Copy, KeyRound, RotateCcw, TriangleAlert } from "lucide-react";

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

export type FirstEventPlatform = "web" | "ios" | "android";
export type FirstEventRingStyle = "ring" | "dots" | "bar";
export type FirstEventDensity = "compact" | "cozy" | "roomy";
export type FirstEventStatus = "ready" | "loading" | "error";

export type FirstEventProject = {
  id: string;
  /** Shown under the heading, e.g. "Gaugeworks Analytics". */
  name: string;
  /** The write key the snippets carry: `{{KEY}}` in a snippet becomes it. */
  key: string;
  /** Where events are expected from, e.g. "production". */
  environment?: string;
};

export type FirstEventSnippet = {
  platform: FirstEventPlatform;
  /** The tab's label, e.g. "Web". */
  label: string;
  /** Shown beside the code, e.g. "swift". */
  language: string;
  /** The code, with `{{KEY}}` where the project's key goes. */
  code: string;
};

export type FirstEventCheck = {
  id: string;
  label: string;
  done: boolean;
  /** Ticks itself once any event has arrived, whatever `done` says. @default false */
  onFirstEvent?: boolean;
};

export type FirstEventPropertyValue = string | number | boolean;

export type FirstEventRecord = {
  id: string;
  /** The event's name, e.g. "page_view". */
  name: string;
  /** When it was received, in ms. */
  at: number;
  platform?: FirstEventPlatform;
  /** Who sent it; distinct values count as active users. */
  user?: string;
  properties?: Record<string, FirstEventPropertyValue>;
};

export type FirstEventProps = {
  /** The platform tab shown first. @default "web" */
  defaultPlatform?: FirstEventPlatform;
  /** Controlled platform tab. */
  platform?: FirstEventPlatform;
  /** The tab changed, from a press or an arrow key. */
  onPlatformChange?: (platform: FirstEventPlatform) => void;
  /** The listening indicator: a breathing ring, three dots in turn, or a swelling bar. @default "ring" */
  ringStyle?: FirstEventRingStyle;
  /** Padding, type size and tile height. @default "cozy" */
  density?: FirstEventDensity;
  /** The project waiting for its first event. @default defaultFirstEventProject */
  project?: FirstEventProject;
  /** One install snippet per platform tab, in tab order. @default defaultFirstEventSnippets */
  snippets?: FirstEventSnippet[];
  /** Setup steps the host reports; `onFirstEvent` items tick themselves. @default defaultFirstEventChecklist */
  checklist?: FirstEventCheck[];
  /** Controlled events, oldest first. Empty is the listening state. */
  events?: FirstEventRecord[];
  /** Initial events when uncontrolled. @default [] */
  defaultEvents?: FirstEventRecord[];
  /** Fires once per event that lands after mount, with its index. */
  onEvent?: (event: FirstEventRecord, index: number) => void;
  /** Reset was pressed: the surface is listening again. */
  onReset?: () => void;
  /** Copy was pressed on a snippet, and whether the clipboard took it. */
  onCopy?: (snippet: FirstEventSnippet, ok: boolean) => void;
  /** A feed row was opened: it is now the receipt. */
  onOpenEvent?: (event: FirstEventRecord) => void;
  /** The moment ages and the sparkline count from, in ms — never read from the clock. @default defaultFirstEventNow */
  now?: number;
  /** Whether the project has arrived. @default "ready" */
  status?: FirstEventStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "First event" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; its body scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be copied, switched or reset. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const SEC = 1_000;
const MIN = 60 * SEC;

/** Monday 12 October 2026, 09:14 UTC — the project was created a minute ago. */
export const defaultFirstEventNow = Date.UTC(2026, 9, 12, 9, 14);

export const defaultFirstEventProject: FirstEventProject = {
  id: "proj_2291",
  name: "Gaugeworks Analytics",
  key: "gw_live_7f3a9c2e41",
  environment: "production",
};

export const defaultFirstEventSnippets: FirstEventSnippet[] = [
  {
    platform: "web",
    label: "Web",
    language: "typescript",
    code: [
      'import { Gaugeworks } from "@gaugeworks/web";',
      "",
      "const gw = Gaugeworks.init({",
      '  key: "{{KEY}}",',
      "});",
      "",
      'gw.track("page_view", { path: "/" });',
    ].join("\n"),
  },
  {
    platform: "ios",
    label: "iOS",
    language: "swift",
    code: [
      "import Gaugeworks",
      "",
      'let gw = Gaugeworks(key: "{{KEY}}")',
      "",
      'gw.track("app_open", [',
      '  "screen": "Home"',
      "])",
    ].join("\n"),
  },
  {
    platform: "android",
    label: "Android",
    language: "kotlin",
    code: [
      "val gw = Gaugeworks.init(",
      '  context, "{{KEY}}"',
      ")",
      "",
      'gw.track("app_open", mapOf(',
      '  "screen" to "Home"',
      "))",
    ].join("\n"),
  },
];

export const defaultFirstEventChecklist: FirstEventCheck[] = [
  { id: "sdk", label: "SDK installed", done: true },
  { id: "key", label: "Write key set", done: true },
  {
    id: "event",
    label: "First event received",
    done: false,
    onFirstEvent: true,
  },
];

/**
 * Events a host or demo can send, in order: one visitor finds the pricing
 * page and signs up, a second lands, and the iOS app opens.
 */
export const defaultFirstEventSamples: FirstEventRecord[] = [
  {
    id: "ev_01",
    name: "page_view",
    at: defaultFirstEventNow + 7 * SEC,
    platform: "web",
    user: "anon_4k2",
    properties: { path: "/pricing", referrer: "search", viewport: "1440x900" },
  },
  {
    id: "ev_02",
    name: "signup_started",
    at: defaultFirstEventNow + 55 * SEC,
    platform: "web",
    user: "anon_4k2",
    properties: { path: "/signup", plan: "team" },
  },
  {
    id: "ev_03",
    name: "page_view",
    at: defaultFirstEventNow + 2 * MIN + 10 * SEC,
    platform: "web",
    user: "anon_9ff",
    properties: { path: "/", referrer: "direct" },
  },
  {
    id: "ev_04",
    name: "app_open",
    at: defaultFirstEventNow + 3 * MIN + 40 * SEC,
    platform: "ios",
    user: "u_mara",
    properties: { screen: "Home", version: "2.4.0", cold: true },
  },
  {
    id: "ev_05",
    name: "signup_completed",
    at: defaultFirstEventNow + 4 * MIN + 5 * SEC,
    platform: "web",
    user: "anon_4k2",
    properties: { plan: "team", seats: 5 },
  },
  {
    id: "ev_06",
    name: "page_view",
    at: defaultFirstEventNow + 5 * MIN + 20 * SEC,
    platform: "web",
    user: "anon_c17",
    properties: { path: "/docs/install", referrer: "search" },
  },
  {
    id: "ev_07",
    name: "app_open",
    at: defaultFirstEventNow + 6 * MIN + 2 * SEC,
    platform: "android",
    user: "u_tomas",
    properties: { screen: "Home", version: "2.3.9", cold: false },
  },
  {
    id: "ev_08",
    name: "report_viewed",
    at: defaultFirstEventNow + 7 * MIN + 30 * SEC,
    platform: "web",
    user: "u_mara",
    properties: { report: "Weekly funnel", range: "7d" },
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.15;
const BUCKETS = 12;
const BUCKET_MS = 5 * MIN;
const FEED_LIMIT = 6;
const COPY_MS = 1600;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

type DensityStyle = {
  pad: string;
  gap: string;
  tile: string;
  text: string;
  num: string;
  row: string;
};

const DENSITY: Record<FirstEventDensity, DensityStyle> = {
  compact: {
    pad: "p-2.5",
    gap: "gap-2",
    tile: "min-h-[62px]",
    text: "text-[12px]",
    num: "text-[20px]",
    row: "h-7",
  },
  cozy: {
    pad: "p-3",
    gap: "gap-2.5",
    tile: "min-h-[74px]",
    text: "text-[13px]",
    num: "text-[24px]",
    row: "h-8",
  },
  roomy: {
    pad: "p-4",
    gap: "gap-3",
    tile: "min-h-[88px]",
    text: "text-[14px]",
    num: "text-[28px]",
    row: "h-9",
  },
};

const PLATFORM_WORD: Record<FirstEventPlatform, string> = {
  web: "Web",
  ios: "iOS",
  android: "Android",
};

/** "09:14:07", read from the ms value, never from the viewer's clock. */
const clock = (ms: number) => new Date(ms).toISOString().slice(11, 19);

const ago = (now: number, at: number) => {
  const d = Math.max(0, now - at);
  if (d < 5 * SEC) return "just now";
  if (d < MIN) return `${Math.round(d / SEC)} s ago`;
  if (d < 60 * MIN) return `${Math.round(d / MIN)} min ago`;
  return `${Math.round(d / (60 * MIN))} h ago`;
};

const formatValue = (v: FirstEventPropertyValue) =>
  typeof v === "boolean" ? (v ? "true" : "false") : String(v);

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

type Metrics = {
  today: number;
  users: number;
  top: { name: string; count: number } | null;
  buckets: number[];
  end: number;
};

const measure = (events: FirstEventRecord[], now: number): Metrics => {
  const end = events.reduce((m, e) => Math.max(m, e.at), now);
  const today = events.filter((e) => end - e.at < 24 * 60 * MIN).length;
  const users = new Set(events.map((e) => e.user ?? `~${e.id}`)).size;
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  let top: Metrics["top"] = null;
  for (const [name, count] of counts) {
    if (!top || count > top.count) top = { name, count };
  }
  const buckets = Array.from({ length: BUCKETS }, () => 0);
  const start = end - BUCKETS * BUCKET_MS;
  for (const e of events) {
    if (e.at <= start || e.at > end) continue;
    const i = Math.min(BUCKETS - 1, Math.floor((e.at - start) / BUCKET_MS));
    buckets[i] = (buckets[i] ?? 0) + 1;
  }
  return { today, users, top, buckets, end };
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  rollIn,
  className,
}: {
  value: number;
  motionSafe: boolean;
  /** Start every digit at 0 and roll up to the value on mount. */
  rollIn: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={rollIn && motionSafe ? { y: "0em" } : false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={
              motionSafe
                ? { ...springs.glide, delay: rollIn ? durations.fast : 0 }
                : { duration: 0 }
            }
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                             Listening indicator                          */
/* ----------------------------------------------------------------------- */

const breathe = (
  awake: boolean,
  motionSafe: boolean,
  from: Record<string, number>,
  to: Record<string, number>,
  delay = 0,
) => ({
  animate: !motionSafe ? to : awake ? to : from,
  transition: !motionSafe
    ? { duration: 0 }
    : awake
      ? {
          ...springs.drift,
          delay,
          repeat: Infinity,
          repeatType: "reverse" as const,
        }
      : springs.drift,
});

function Listener({
  style,
  awake,
  motionSafe,
}: {
  style: FirstEventRingStyle;
  awake: boolean;
  motionSafe: boolean;
}) {
  if (style === "dots") {
    return (
      <span className="flex size-12 items-center justify-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block size-2 rounded-full bg-cobalt-bright"
            initial={false}
            {...breathe(
              awake,
              motionSafe,
              { opacity: 0.3, y: 0 },
              { opacity: 1, y: -3 },
              i * 0.22,
            )}
          />
        ))}
      </span>
    );
  }
  if (style === "bar") {
    return (
      <span className="flex size-12 items-center justify-center">
        <span className="relative block h-1.5 w-11 overflow-hidden rounded-full bg-surface-2">
          <motion.span
            className="absolute inset-0 block rounded-full bg-cobalt-bright"
            style={{ originX: 0.5 }}
            initial={false}
            {...breathe(
              awake,
              motionSafe,
              { scaleX: 0.18, opacity: 0.45 },
              { scaleX: 1, opacity: 1 },
            )}
          />
        </span>
      </span>
    );
  }
  return (
    <span className="relative flex size-12 items-center justify-center">
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full border-2 border-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)]"
        initial={false}
        {...breathe(
          awake,
          motionSafe,
          { scale: 0.72, opacity: 0.2 },
          { scale: 1, opacity: 0.9 },
        )}
      />
      <motion.span
        aria-hidden
        className="absolute inset-[9px] rounded-full bg-cobalt-wash"
        initial={false}
        {...breathe(
          awake,
          motionSafe,
          { scale: 0.9, opacity: 0.6 },
          { scale: 1.08, opacity: 1 },
        )}
      />
      <span className="relative block size-2.5 rounded-full bg-cobalt-bright" />
    </span>
  );
}

function Landed({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.span
      className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success"
      initial={motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? { ...springs.recoil, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-6">
        <motion.path
          d="M5 12.5 10 17.5 19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={motionSafe ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={
            motionSafe
              ? { ...springs.flick, delay: durations.fast }
              : { duration: 0 }
          }
        />
      </svg>
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Tiles                                  */
/* ----------------------------------------------------------------------- */

function Tile({
  label,
  filled,
  density,
  children,
}: {
  label: string;
  filled: boolean;
  density: DensityStyle;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-1 rounded-3 border px-3 py-2 transition-colors duration-300",
        density.tile,
        filled
          ? "border-hairline bg-surface-1"
          : "border-dashed border-hairline-strong bg-transparent",
      )}
    >
      <span className={LABEL}>{label}</span>
      {children}
    </div>
  );
}

function Spark({
  counts,
  filled,
  motionSafe,
}: {
  counts: number[];
  filled: boolean;
  motionSafe: boolean;
}) {
  const max = Math.max(1, ...counts);
  const n = Math.max(2, counts.length);
  const pts: [number, number][] = counts.map((c, i) => [
    r3((i / (n - 1)) * 100),
    r3(29 - (c / max) * 24),
  ]);
  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`)
    .join(" ");
  const area = `${line} L100 32 L0 32 Z`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className="h-7 w-full"
    >
      {filled ? (
        <>
          <motion.path
            d={area}
            fill="var(--accent-bright)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.14 }}
            transition={{
              duration: durations.slow,
              delay: durations.base,
              ease: easings.enter,
            }}
          />
          <motion.path
            d={line}
            fill="none"
            stroke="var(--accent-bright)"
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={motionSafe ? { pathLength: 0 } : { opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={
              motionSafe
                ? { ...springs.glide, delay: durations.fast }
                : { duration: durations.fast }
            }
          />
        </>
      ) : (
        <line
          x1={0}
          x2={100}
          y1={29}
          y2={29}
          stroke="var(--hairline-strong)"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Checklist                                */
/* ----------------------------------------------------------------------- */

function CheckRow({
  check,
  done,
  draw,
  motionSafe,
  density,
}: {
  check: FirstEventCheck;
  done: boolean;
  draw: boolean;
  motionSafe: boolean;
  density: DensityStyle;
}) {
  return (
    <li className={cn("flex items-center gap-2.5", density.row, density.text)}>
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
          done
            ? "border-transparent bg-success text-primary-foreground"
            : "border-hairline-strong bg-transparent",
        )}
      >
        {done ? (
          <svg aria-hidden viewBox="0 0 14 14" className="size-2.5">
            <motion.path
              d="M3 7.4 5.8 10 11 4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={draw && motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        ) : null}
      </span>
      <span
        className={cn(
          "min-w-0 truncate",
          done ? "text-ink-2" : "text-foreground",
        )}
      >
        {check.label}
      </span>
      <span className="sr-only">{done ? ", done" : ", not yet"}</span>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type CopyState = "idle" | "done" | "failed";

/**
 * An analytics project before its first event. Four tiles — events today,
 * active users, top event, the last hour — sit empty as dashed outlines
 * beside a listening indicator: a soft ring that breathes on `springs.drift`,
 * and only while the tab is shown and the root is on screen. Next to them an
 * install card: a Web / iOS / Android tablist whose indicator slides on
 * `springs.snap`, the snippet with the project's key in it, and a Copy button
 * whose tick draws on `springs.flick`; under it a checklist the host ticks as
 * setup progresses.
 *
 * When the host passes the first event, the ring collapses and a tick lands
 * in its place on `springs.recoil`, a receipt card rises on `springs.glide`
 * with the event's name, platform, time and properties cascading in, and
 * each tile fills as its first number rolls up from zero and the sparkline
 * draws. Later events append to a live feed at the top, the rest gliding
 * down. Reset returns the surface to listening.
 *
 * The tabs are a tablist (Left/Right, Home/End, selection follows focus),
 * the checklist is a list, the feed is a list of rows with Up/Down and
 * Home/End where Enter opens a row as the receipt, and Copy announces its
 * result. Under reduced motion the ring is still, nothing travels and every
 * state — tick, receipt, numbers — appears in place and is announced.
 */
export function FirstEvent({
  defaultPlatform = "web",
  platform,
  onPlatformChange,
  ringStyle = "ring",
  density = "cozy",
  project = defaultFirstEventProject,
  snippets = defaultFirstEventSnippets,
  checklist = defaultFirstEventChecklist,
  events,
  defaultEvents,
  onEvent,
  onReset,
  onCopy,
  onOpenEvent,
  now = defaultFirstEventNow,
  status = "ready",
  onRetry,
  title = "First event",
  label,
  height = 540,
  disabled = false,
  className,
}: FirstEventProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const panelId = `${uid}-panel`;
  const tabId = (p: FirstEventPlatform) => `${uid}-tab-${p}`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const ready = status === "ready";
  const inert = disabled || !ready;

  /* ------------------------------- state ------------------------------- */

  const [ownPlatform, setOwnPlatform] = React.useState(defaultPlatform);
  // A new default from the host (a tweak panel, a saved preference) shows
  // that tab, the way a fresh mount would.
  const [seenDefault, setSeenDefault] = React.useState(defaultPlatform);
  if (seenDefault !== defaultPlatform) {
    setSeenDefault(defaultPlatform);
    setOwnPlatform(defaultPlatform);
  }
  const [ownEvents, setOwnEvents] = React.useState<FirstEventRecord[]>(
    () => defaultEvents ?? [],
  );
  const list = events ?? ownEvents;

  const [shownId, setShownId] = React.useState<string | null>(null);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [copy, setCopy] = React.useState<CopyState>("idle");
  const [announcement, setAnnouncement] = React.useState("");
  const [visible, setVisible] = React.useState(true);
  const [hidden, setHidden] = React.useState(false);

  // False for the server render and hydration, so ticks already drawn on
  // the page never redraw; true for anything that mounts later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const tabNodes = React.useRef(
    new Map<FirstEventPlatform, HTMLButtonElement>(),
  );
  const rowNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const copyTimer = React.useRef<number | null>(null);
  const seenIds = React.useRef<Set<string> | null>(null);
  const onEventRef = React.useRef(onEvent);

  /* -------------------------------- data ------------------------------- */

  const current: FirstEventPlatform =
    platform ??
    (snippets.some((s) => s.platform === ownPlatform)
      ? ownPlatform
      : (snippets[0]?.platform ?? ownPlatform));
  const snippet = snippets.find((s) => s.platform === current) ?? null;

  const landed = list.length > 0;
  const first = list[0] ?? null;
  const shown =
    (shownId ? list.find((e) => e.id === shownId) : undefined) ?? first;
  const shownIndex = shown ? list.indexOf(shown) : -1;
  const metrics = measure(list, now);
  const feed = [...list].reverse();
  const feedShown = feed.slice(0, FEED_LIMIT);
  const feedMore = feed.length - feedShown.length;
  const activeFeed =
    activeRow && feedShown.some((e) => e.id === activeRow)
      ? activeRow
      : (feedShown[0]?.id ?? null);
  const checks = checklist.map((c) => ({
    check: c,
    done: c.done || (c.onFirstEvent === true && landed),
  }));
  const doneCount = checks.filter((c) => c.done).length;

  const awake = visible && !hidden && motionSafe && ready && !landed;

  // Each arrival is announced once, from the render that first shows it.
  const [seenCount, setSeenCount] = React.useState(list.length);
  if (seenCount !== list.length) {
    setSeenCount(list.length);
    const last = list[list.length - 1];
    if (list.length > seenCount && last) {
      const where = last.platform
        ? ` from ${PLATFORM_WORD[last.platform]}`
        : "";
      setAnnouncement(
        list.length === 1
          ? `First event received: ${last.name}${where}, ${clock(last.at)}.`
          : `Event ${list.length}: ${last.name}${where}, ${clock(last.at)}. ${plural(metrics.users, "active user", "active users")}.`,
      );
    } else if (list.length === 0) {
      setAnnouncement("Listening for the first event.");
    }
  }

  /* ------------------------------- effects ----------------------------- */

  React.useEffect(() => {
    onEventRef.current = onEvent;
  });

  // The host is told about each event that lands after mount, once.
  React.useEffect(() => {
    if (seenIds.current === null) {
      seenIds.current = new Set(list.map((e) => e.id));
      return;
    }
    const seen = seenIds.current;
    list.forEach((e, i) => {
      if (seen.has(e.id)) return;
      seen.add(e.id);
      onEventRef.current?.(e, i);
    });
    for (const id of Array.from(seen)) {
      if (!list.some((e) => e.id === id)) seen.delete(id);
    }
  }, [list]);

  // The ring only breathes while someone can see it.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    let watcher: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        setVisible(Boolean(entry?.isIntersecting));
      });
      watcher.observe(node);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      watcher?.disconnect();
    };
  }, []);

  React.useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  /* ------------------------------- actions ----------------------------- */

  const choose = (next: FirstEventPlatform) => {
    if (inert || next === current) return;
    if (platform === undefined) setOwnPlatform(next);
    onPlatformChange?.(next);
    const s = snippets.find((x) => x.platform === next);
    setAnnouncement(`${s?.label ?? PLATFORM_WORD[next]} snippet shown.`);
  };

  const onTabKey = (event: React.KeyboardEvent) => {
    const order = snippets.map((s) => s.platform);
    const i = order.indexOf(current);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      to = (i + 1) % order.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      to = (i - 1 + order.length) % order.length;
    } else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = order.length - 1;
    else return;
    event.preventDefault();
    const target = order[to];
    if (!target) return;
    choose(target);
    tabNodes.current.get(target)?.focus();
  };

  const runCopy = () => {
    if (inert || !snippet) return;
    const text = snippet.code.split("{{KEY}}").join(project.key);
    const done = (ok: boolean) => {
      setCopy(ok ? "done" : "failed");
      setAnnouncement(
        ok
          ? `Copied the ${snippet.label} snippet.`
          : "Copy unavailable. Select the snippet to copy it.",
      );
      onCopy?.(snippet, ok);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => {
        copyTimer.current = null;
        setCopy("idle");
      }, COPY_MS);
    };
    const clipboard =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      done(false);
      return;
    }
    clipboard.writeText(text).then(
      () => done(true),
      () => done(false),
    );
  };

  const reset = () => {
    if (inert || !landed) return;
    if (events === undefined) setOwnEvents([]);
    setShownId(null);
    setActiveRow(null);
    onReset?.();
  };

  const open = (event: FirstEventRecord) => {
    if (disabled) return;
    setShownId(event.id);
    const i = list.indexOf(event);
    setAnnouncement(
      `${i === 0 ? "First event" : `Event ${i + 1}`} shown: ${event.name}, ${clock(event.at)}.`,
    );
    onOpenEvent?.(event);
  };

  const onRowKey = (event: React.KeyboardEvent, i: number) => {
    const to =
      event.key === "ArrowDown"
        ? i + 1
        : event.key === "ArrowUp"
          ? i - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? feedShown.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    const target = feedShown[clamp(to, 0, feedShown.length - 1)];
    if (target) rowNodes.current.get(target.id)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const keyParts = (line: string) => {
    const parts = line.split("{{KEY}}");
    return parts.map((part, i) => (
      <React.Fragment key={i}>
        {part}
        {i < parts.length - 1 ? (
          <span className="text-cobalt-bright">{project.key}</span>
        ) : null}
      </React.Fragment>
    ));
  };

  const propertyRows = shown
    ? Object.entries(shown.properties ?? {}).slice(0, 8)
    : [];
  const propStep = cascade(propertyRows.length + 2);

  const header = (
    <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2.5">
      <div className="min-w-0">
        <p id={titleId} className="truncate text-sm font-semibold">
          {title}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
          <span className="truncate">{project.name}</span>
          {project.environment ? (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0 font-mono">{project.environment}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {ready ? (
          <p
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors duration-300",
              landed
                ? "border-[color-mix(in_oklab,var(--success)_35%,transparent)] text-success"
                : "border-hairline text-ink-2",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                landed ? "bg-success" : "bg-cobalt-bright",
              )}
            />
            {landed ? (
              <>
                Live
                <span className="hidden @min-[24rem]:inline">
                  {" "}
                  · {plural(list.length, "event", "events")}
                </span>
              </>
            ) : (
              "Listening"
            )}
          </p>
        ) : null}
        <AnimatePresence initial={false}>
          {landed && ready ? (
            <motion.button
              key="reset"
              type="button"
              onClick={reset}
              aria-disabled={inert || undefined}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
                inert
                  ? "cursor-default text-ink-3"
                  : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Reset
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );

  const tiles = (
    <div className="grid grid-cols-2 gap-2 @min-[56rem]:grid-cols-4">
      <Tile label="Events today" filled={landed} density={d}>
        {landed ? (
          <span className={cn("font-mono font-medium text-foreground", d.num)}>
            <span className="sr-only">{metrics.today}</span>
            <Roll value={metrics.today} motionSafe={motionSafe} rollIn />
          </span>
        ) : (
          <span className={cn("font-mono text-ink-3", d.num)}>0</span>
        )}
      </Tile>
      <Tile label="Active users" filled={landed} density={d}>
        {landed ? (
          <span className={cn("font-mono font-medium text-foreground", d.num)}>
            <span className="sr-only">{metrics.users}</span>
            <Roll value={metrics.users} motionSafe={motionSafe} rollIn />
          </span>
        ) : (
          <span className={cn("font-mono text-ink-3", d.num)}>0</span>
        )}
      </Tile>
      <Tile label="Top event" filled={landed} density={d}>
        {landed && metrics.top ? (
          <motion.span
            key={metrics.top.name}
            className="flex min-w-0 items-baseline gap-1.5"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? {
                    ...springs.glide,
                    delay: durations.fast,
                    opacity: { duration: durations.base },
                  }
                : { duration: durations.fast }
            }
          >
            <span
              className={cn(
                "min-w-0 truncate font-mono text-foreground",
                d.text,
              )}
            >
              {metrics.top.name}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
              x{metrics.top.count}
            </span>
          </motion.span>
        ) : (
          <span className={cn("text-ink-3", d.text)}>none yet</span>
        )}
      </Tile>
      <Tile label="Last hour" filled={landed} density={d}>
        <Spark
          counts={metrics.buckets}
          filled={landed}
          motionSafe={motionSafe}
        />
      </Tile>
    </div>
  );

  const strip = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-3 border px-3 py-2 transition-colors duration-300",
        landed
          ? "border-hairline bg-surface-1"
          : "border-dashed border-hairline-strong",
      )}
    >
      <span className="relative size-12 shrink-0">
        <AnimatePresence initial={false}>
          {landed ? (
            <motion.span
              key="tick"
              className="absolute inset-0"
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              <Landed motionSafe={motionSafe} />
            </motion.span>
          ) : (
            <motion.span
              key="ring"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                scale: motionSafe ? 0.6 : 1,
                transition: exitFor(durations.fast),
              }}
              transition={{ duration: durations.fast }}
            >
              <Listener
                style={ringStyle}
                awake={awake}
                motionSafe={motionSafe}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium text-foreground", d.text)}>
          {landed && first
            ? `First event received at ${clock(first.at)}`
            : "Listening for your first event"}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
          {landed ? (
            <span className="truncate">
              {plural(list.length, "event", "events")} from{" "}
              {plural(metrics.users, "user", "users")} so far
            </span>
          ) : (
            <>
              <KeyRound aria-hidden className="size-3 shrink-0" />
              <span className="truncate font-mono">{project.key}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );

  const receipt = shown ? (
    <motion.section
      key={shown.id}
      aria-label={`${shownIndex === 0 ? "First event" : `Event ${shownIndex + 1}`}: ${shown.name}`}
      className={cn(
        "rounded-3 border border-hairline bg-surface-1 shadow-[0_10px_28px_-18px_color-mix(in_oklab,black_55%,transparent)]",
        d.pad,
      )}
      initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? {
              ...springs.glide,
              delay: durations.fast,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={LABEL}>
            {shownIndex === 0 ? "First event" : `Event ${shownIndex + 1}`}
          </p>
          <p
            className={cn(
              "mt-0.5 truncate font-mono font-medium text-foreground",
              d.text,
            )}
          >
            {shown.name}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[11px] text-foreground tabular-nums">
            {clock(shown.at)}
          </p>
          <p className="text-[11px] text-ink-3">
            {[
              shown.platform ? PLATFORM_WORD[shown.platform] : null,
              ago(metrics.end, shown.at),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <dl className="mt-2.5 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-hairline pt-2.5">
        {[
          ...(shown.user ? [["user", shown.user] as const] : []),
          ...propertyRows,
        ].map(([k, v], i) => {
          const fade = {
            duration: durations.base,
            delay: motionSafe ? durations.base + r3(i * propStep) : 0,
            ease: easings.enter,
          };
          return (
            <React.Fragment key={k}>
              <motion.dt
                className="truncate font-mono text-[11px] text-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={fade}
              >
                {k}
              </motion.dt>
              <motion.dd
                className="truncate font-mono text-[12px] text-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={fade}
              >
                {formatValue(v)}
              </motion.dd>
            </React.Fragment>
          );
        })}
        {propertyRows.length === 0 && !shown.user ? (
          <dd className="col-span-2 text-[11px] text-ink-3">No properties.</dd>
        ) : null}
      </dl>
    </motion.section>
  ) : null;

  const feedList = landed ? (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={cn(LABEL, "px-1")}>Live feed</p>
      <ul
        role="list"
        aria-label="Live feed, newest first"
        className="flex flex-col"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {feedShown.map((e, i) => {
            const index = list.indexOf(e);
            const isShown = shown?.id === e.id;
            return (
              <motion.li
                key={e.id}
                layout={motionSafe ? "position" : false}
                initial={{
                  opacity: 0,
                  y: motionSafe ? -distances.step : 0,
                }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  layout: springs.glide,
                  y: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.base, ease: easings.enter },
                }}
              >
                <button
                  ref={(node) => {
                    if (node) rowNodes.current.set(e.id, node);
                    else rowNodes.current.delete(e.id);
                  }}
                  type="button"
                  tabIndex={activeFeed === e.id ? 0 : -1}
                  aria-current={isShown ? "true" : undefined}
                  onFocus={() => setActiveRow(e.id)}
                  onClick={() => open(e)}
                  onKeyDown={(event) => onRowKey(event, i)}
                  className={cn(
                    "grid w-full grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2 px-2 text-left transition-colors",
                    d.row,
                    isShown ? "bg-surface-2" : "hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {clock(e.at).slice(0, 5)}
                    <span className="sr-only">
                      , {index === 0 ? "first event" : `event ${index + 1}`}
                    </span>
                  </span>
                  <span className={cn("truncate font-mono", d.text)}>
                    {e.name}
                  </span>
                  <span className="max-w-[40%] truncate text-right text-[11px] text-ink-3">
                    {[e.platform ? PLATFORM_WORD[e.platform] : null, e.user]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {feedMore > 0 ? (
          <li className="px-2 py-1 text-[11px] text-ink-3">
            and {feedMore} more
          </li>
        ) : null}
      </ul>
    </div>
  ) : null;

  const install = (
    <section
      aria-label="Install"
      className={cn(
        "flex min-w-0 flex-col rounded-3 border border-hairline",
        d.pad,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={LABEL}>Install</p>
        {snippet ? (
          <span className="font-mono text-[10px] text-ink-3">
            {snippet.language}
          </span>
        ) : null}
      </div>
      {snippets.length === 0 ? (
        <p className={cn("mt-2 text-ink-3", d.text)}>
          No install snippets for this project yet.
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Platform"
            className="mt-2 flex items-center gap-1 border-b border-hairline"
          >
            {snippets.map((s) => {
              const active = s.platform === current;
              return (
                <button
                  key={s.platform}
                  ref={(node) => {
                    if (node) tabNodes.current.set(s.platform, node);
                    else tabNodes.current.delete(s.platform);
                  }}
                  id={tabId(s.platform)}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={panelId}
                  tabIndex={active ? 0 : -1}
                  aria-disabled={inert || undefined}
                  onClick={() => choose(s.platform)}
                  onKeyDown={onTabKey}
                  className={cn(
                    "relative -mb-px h-8 rounded-2 px-2.5 text-xs transition-colors",
                    active ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                    inert && "cursor-default",
                    FOCUS_RING,
                  )}
                >
                  {s.label}
                  {active ? (
                    <motion.span
                      aria-hidden
                      layoutId={`${uid}-tab-indicator`}
                      className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-cobalt-bright"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={snippet ? tabId(snippet.platform) : undefined}
            className="relative mt-2.5 min-w-0"
          >
            <AnimatePresence initial={false} mode="wait">
              {snippet ? (
                <motion.pre
                  key={snippet.platform}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                  className="overflow-x-auto rounded-2 bg-surface-1 py-2.5 pr-20 pl-3 font-mono text-[11px] leading-[1.6] whitespace-pre text-ink"
                >
                  <code>
                    {snippet.code.split("\n").map((line, i, all) => (
                      <React.Fragment key={i}>
                        <span
                          aria-hidden
                          className="mr-3 inline-block w-3 text-right text-ink-3 select-none"
                        >
                          {i + 1}
                        </span>
                        {keyParts(line)}
                        {i < all.length - 1 ? "\n" : null}
                      </React.Fragment>
                    ))}
                  </code>
                </motion.pre>
              ) : null}
            </AnimatePresence>
            <button
              type="button"
              onClick={runCopy}
              aria-disabled={inert || undefined}
              aria-label={
                copy === "done"
                  ? "Copied"
                  : copy === "failed"
                    ? "Copy unavailable"
                    : `Copy the ${snippet?.label ?? ""} snippet`
              }
              className={cn(
                "absolute top-1.5 right-1.5 inline-flex h-7 items-center gap-1 rounded-2 border px-2 text-[11px] transition-colors",
                copy === "done"
                  ? "border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-card text-success"
                  : copy === "failed"
                    ? "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-card text-warn"
                    : "border-hairline bg-card text-ink-2 hover:bg-surface-2 hover:text-foreground",
                inert && "cursor-default",
                FOCUS_RING,
              )}
            >
              {copy === "done" ? (
                <svg aria-hidden viewBox="0 0 14 14" className="size-3.5">
                  <motion.path
                    d="M3 7.4 5.8 10 11 4.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </svg>
              ) : copy === "failed" ? (
                <TriangleAlert aria-hidden className="size-3.5" />
              ) : (
                <Copy aria-hidden className="size-3.5" />
              )}
              <span aria-hidden>
                {copy === "done"
                  ? "Copied"
                  : copy === "failed"
                    ? "Select to copy"
                    : "Copy"}
              </span>
            </button>
          </div>
        </>
      )}
    </section>
  );

  const checksCard = (
    <section
      aria-label="Setup"
      className={cn(
        "flex min-w-0 flex-col rounded-3 border border-hairline",
        d.pad,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={LABEL}>Setup</p>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {doneCount}/{checks.length}
        </span>
      </div>
      {checks.length === 0 ? (
        <p className={cn("mt-2 text-ink-3", d.text)}>Nothing to set up.</p>
      ) : (
        <ul role="list" aria-label="Setup steps" className="mt-1 flex flex-col">
          {checks.map(({ check, done }) => (
            <CheckRow
              key={check.id}
              check={check}
              done={done}
              draw={live}
              motionSafe={motionSafe}
              density={d}
            />
          ))}
        </ul>
      )}
    </section>
  );

  const skeleton = (
    <div
      aria-hidden
      className={cn(
        "grid gap-3 p-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]",
      )}
    >
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2 @min-[56rem]:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className={cn(
                "rounded-3 bg-surface-2 motion-safe:animate-pulse",
                d.tile,
              )}
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
        <span
          className="h-16 rounded-3 bg-surface-2 motion-safe:animate-pulse"
          style={{ animationDelay: "360ms" }}
        />
      </div>
      <div className="flex flex-col gap-2.5">
        <span
          className="h-44 rounded-3 bg-surface-2 motion-safe:animate-pulse"
          style={{ animationDelay: "450ms" }}
        />
        <span
          className="h-24 rounded-3 bg-surface-2 motion-safe:animate-pulse"
          style={{ animationDelay: "540ms" }}
        />
      </div>
    </div>
  );

  const failed = (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <TriangleAlert aria-hidden className="size-5 text-danger" />
      <p className="text-sm text-foreground">The project didn&apos;t load.</p>
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

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      {header}
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "loading" ? (
          skeleton
        ) : status === "error" ? (
          failed
        ) : (
          <div
            className={cn(
              "grid gap-3 p-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] @min-[56rem]:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]",
            )}
          >
            <div className="flex min-w-0 flex-col gap-2.5">
              {tiles}
              {strip}
              <AnimatePresence initial={false} mode="wait">
                {receipt}
              </AnimatePresence>
              {feedList}
            </div>
            <div className="flex min-w-0 flex-col gap-2.5">
              {install}
              {checksCard}
            </div>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
