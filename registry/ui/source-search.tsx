"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  Check,
  Code,
  FileText,
  MessageSquare,
  RotateCcw,
  Search,
  Sparkles,
  Ticket,
  TriangleAlert,
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
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SearchKind = "doc" | "ticket" | "code" | "thread";
export type SearchRelevance = "bar" | "ring" | "off";
export type SearchFacets = "chips" | "rail" | "off";
export type SearchTray = "chips" | "stack" | "count";
export type SearchStatus = "ready" | "searching" | "error";

export type SourceSearchProps = {
  /** How each result's score is shown: a bar that fills, a ring gauge that sweeps, or not at all. @default "bar" */
  relevance?: SearchRelevance;
  /** How the filters are offered: toggle chips under the query, a column of checkboxes beside the results (chips below 40rem), or none. @default "chips" */
  facets?: SearchFacets;
  /** How the chosen sources sit in the tray: numbered chips with titles, a fanned stack of small cards, or one count. @default "chips" */
  tray?: SearchTray;
  /** Everything that can be found. @default defaultSearchSources */
  sources?: SearchSource[];
  /** Controlled query. */
  query?: string;
  /** Initial query when uncontrolled. @default defaultSearchQuery */
  defaultQuery?: string;
  /** Fires on every keystroke in the query. */
  onQueryChange?: (query: string) => void;
  /** Enter was pressed in the query. */
  onSearch?: (query: string) => void;
  /** Score and filter `sources` against the query here. Turn off when the host searches and passes ranked results. @default true */
  matching?: boolean;
  /** Controlled ids of the sources in the tray, in tray order. */
  selected?: string[];
  /** Initial tray when uncontrolled. @default [] */
  defaultSelected?: string[];
  /** Fires from the checkbox, the chip or the key that changed the tray. */
  onSelectedChange?: (ids: string[]) => void;
  /** Controlled facet filters: "kind:doc", "updated:week", "space:Payouts". */
  filters?: string[];
  /** Initial filters when uncontrolled. @default [] */
  defaultFilters?: string[];
  /** Fires from the chip or checkbox that changed the filters. */
  onFiltersChange?: (filters: string[]) => void;
  /** The most sources the tray holds. @default 6 */
  max?: number;
  /** Answer was pressed, with the tray's sources in order and the query. */
  onAnswer?: (sources: SearchSource[], query: string) => void;
  /** A result's title was pressed. Without it, titles are plain text. */
  onOpen?: (source: SearchSource) => void;
  /** The host is searching, or the search failed. @default "ready" */
  status?: SearchStatus;
  /** Retry was pressed after a failed search. */
  onRetry?: () => void;
  /** The moment "updated" times count from (Date or ms). @default the newest source's time */
  now?: number | Date;
  /** The query's placeholder. @default "Search docs, tickets and code" */
  placeholder?: string;
  /** The surface's accessible name. @default "Source search" */
  label?: string;
  /** Play the ticks and the landings. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be searched, filtered or chosen. */
  disabled?: boolean;
  /** Classes for the root. It is 540px tall by default; pass a height class to change it. */
  className?: string;
};

export type SearchSource = {
  /** Unique among the sources. */
  id: string;
  title: string;
  /** Where it lives, without the protocol: "fieldline.dev/docs/payouts/retries". */
  site: string;
  /** The passage that matched. */
  snippet: string;
  kind: SearchKind;
  /** The team or space it belongs to: a facet. */
  space?: string;
  /** When it last changed, in ms since the epoch. */
  updated: number;
  /** How well it answers, 0 to 1, before the query is applied. */
  relevance: number;
};

const H = 3_600_000;
const D = 24 * H;
/** A fixed noon, so the default results render the same everywhere. */
const T = Date.UTC(2026, 8, 30, 12, 0);

export const defaultSearchQuery = "payout retries after a timeout";

/** Fieldline's engineering knowledge base, as an on-call search sees it. */
export const defaultSearchSources: SearchSource[] = [
  {
    id: "doc-retry-policy",
    title: "Payout retry policy",
    site: "fieldline.dev/docs/payouts/retries",
    snippet:
      "Failed payouts are retried with backoff: 30 s, 2 min, 10 min, then hourly for a day. A timeout counts as a failure only after the bank's acknowledgement window closes.",
    kind: "doc",
    space: "Payouts",
    updated: T - 3 * D,
    relevance: 0.94,
  },
  {
    id: "pay-2184",
    title: "PAY-2184 · Retries pile up after bank timeouts",
    site: "fieldline.dev/tickets/PAY-2184",
    snippet:
      "Since Tuesday, payouts that time out at Basinworks are retried before the first attempt settles, so some customers see two pending transfers.",
    kind: "ticket",
    space: "Payouts",
    updated: T - 5 * H,
    relevance: 0.9,
  },
  {
    id: "code-retry-scheduler",
    title: "retry_scheduler.ts",
    site: "fieldline.dev/code/payouts/retry_scheduler.ts",
    snippet:
      "const delay = Math.min(base * 2 ** attempt, cap); // no jitter yet: every payout retry for one bank lands in the same second",
    kind: "code",
    space: "Payouts",
    updated: T - 2 * D,
    relevance: 0.84,
  },
  {
    id: "thread-oncall-0927",
    title: "On-call notes: Coldbrook timeouts",
    site: "fieldline.dev/threads/oncall-0927",
    snippet:
      "Coldbrook's sandbox timed out for eleven minutes. Retries resumed once the queue drained, and no payout was lost.",
    kind: "thread",
    space: "Platform",
    updated: T - 26 * H,
    relevance: 0.78,
  },
  {
    id: "doc-idempotency",
    title: "Idempotency keys for transfers",
    site: "fieldline.dev/docs/payouts/idempotency",
    snippet:
      "Every transfer carries an idempotency key, so a retry after a timeout can never pay twice. Keys expire after 24 hours.",
    kind: "doc",
    space: "Payouts",
    updated: T - 12 * D,
    relevance: 0.72,
  },
  {
    id: "doc-ack-windows",
    title: "Bank acknowledgement windows",
    site: "fieldline.dev/docs/banks/ack-windows",
    snippet:
      "Basinworks acknowledges within 90 s and Coldbrook within 4 min. Treat a payout as timed out only after its bank's window.",
    kind: "doc",
    space: "Banks",
    updated: T - 40 * D,
    relevance: 0.66,
  },
  {
    id: "pay-2131",
    title: "PAY-2131 · Add jitter to the retry schedule",
    site: "fieldline.dev/tickets/PAY-2131",
    snippet:
      "Spread retries with full jitter so a bank outage does not end in a stampede of payouts the moment it recovers.",
    kind: "ticket",
    space: "Payouts",
    updated: T - 9 * D,
    relevance: 0.6,
  },
  {
    id: "thread-release-412",
    title: "Release notes 4.12",
    site: "fieldline.dev/threads/release-4-12",
    snippet:
      "Payout timeouts now show in the dashboard as Waiting on bank instead of Failed.",
    kind: "thread",
    space: "Platform",
    updated: T - 20 * D,
    relevance: 0.42,
  },
  {
    id: "code-webhook-timeout",
    title: "webhook_timeout.ts",
    site: "fieldline.dev/code/webhooks/webhook_timeout.ts",
    snippet:
      "export const WEBHOOK_TIMEOUT_MS = 10_000; // raised from 5 s after the Fernworks integration timed out",
    kind: "code",
    space: "Platform",
    updated: T - 60 * D,
    relevance: 0.34,
  },
];

type Box = { x: number; y: number };
type Ghost = { key: number; id: string; n: number; title: string; from: Box };
type Hit = { source: SearchSource; score: number };

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());
const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const KINDS: { value: SearchKind; label: string; one: string }[] = [
  { value: "doc", label: "Docs", one: "Doc" },
  { value: "ticket", label: "Tickets", one: "Ticket" },
  { value: "code", label: "Code", one: "Code" },
  { value: "thread", label: "Threads", one: "Thread" },
];
const AGES = [
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "older", label: "Older" },
] as const;

const KIND_ICON: Record<SearchKind, typeof FileText> = {
  doc: FileText,
  ticket: Ticket,
  code: Code,
  thread: MessageSquare,
};
const KIND_TINT: Record<SearchKind, string> = {
  doc: "bg-cobalt-bright",
  ticket: "bg-warn",
  code: "bg-signal",
  thread: "bg-ink-2",
};

const STOP = new Set(
  "the and for after with from into what when that this why how are was our you a an of to in on at is it by".split(
    " ",
  ),
);

/** Crude stems, so "retries", "retry" and "retried" find each other. */
const stem = (w: string) => w.replace(/(ies|ied|ying|ing|es|ed|s|y)$/, "");

function termsOf(query: string): string[] {
  const out: string[] = [];
  for (const w of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 3 || STOP.has(w)) continue;
    const s = stem(w);
    if (s.length >= 3 && !out.includes(s)) out.push(s);
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The source's score for these terms: title words count double, misses drop out. */
function scoreOf(source: SearchSource, terms: string[]): number {
  if (terms.length === 0) return source.relevance;
  const title = source.title.toLowerCase();
  const body = `${source.snippet} ${source.site}`.toLowerCase();
  let points = 0;
  for (const t of terms) {
    if (title.includes(t)) points += 2;
    else if (body.includes(t)) points += 1;
  }
  if (points === 0) return 0;
  return r2(source.relevance * (0.4 + (0.6 * points) / (2 * terms.length)));
}

const ageOf = (updated: number, now: number) =>
  now - updated <= 7 * D ? "week" : now - updated <= 30 * D ? "month" : "older";

function ago(at: number, now: number): string {
  const h = Math.max(0, Math.round((now - at) / H));
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return `${Math.round(d / 30)} mo ago`;
}

/**
 * Which ids arrived in the latest change of the list. Ids present on the
 * first render count as already there, so nothing rises on page load, and an
 * id that was already shown is never new again while it stays.
 */
function useBirths(ids: string[]) {
  const key = ids.join(",");
  const [b, setB] = React.useState(() => ({
    gen: 0,
    key,
    born: new Map(ids.map((id) => [id, -1])),
  }));
  if (b.key !== key) {
    const gen = b.gen + 1;
    const born = new Map<string, number>();
    for (const id of ids) born.set(id, b.born.get(id) ?? gen);
    setB({ gen, key, born });
  }
  return (id: string) => b.born.get(id) === b.gen;
}

/** Text with the query's words marked. */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const re = new RegExp(
    `([A-Za-z0-9_]*(?:${terms.map(escape).join("|")})[A-Za-z0-9_]*)`,
    "gi",
  );
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-1 bg-cobalt-wash text-foreground">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

/**
 * A number that rolls: the old value leaves one way as the new one arrives
 * from the other, both stacked in one cell so the width never jumps.
 */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [prev, setPrev] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (prev !== value) {
    setDir(value >= prev ? 1 : -1);
    setPrev(value);
  }
  return (
    <span className="relative inline-grid overflow-clip tabular-nums">
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          className="[grid-area:1/1]"
          variants={{
            from: (d: number) => ({
              y: motionSafe ? d * distances.step : 0,
              opacity: 0,
            }),
            at: { y: 0, opacity: 1 },
            gone: (d: number) => ({
              y: motionSafe ? -d * distances.step : 0,
              opacity: 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="from"
          animate="at"
          exit="gone"
          transition={{
            y: motionSafe ? springs.snap : { duration: 0 },
            opacity: { duration: durations.fast, ease: easings.enter },
          }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * A relevance readout. Its fill lives in a motion value that starts empty
 * and eases to the score on glide, so it fills on arrival and moves when the
 * score does; a re-run of the effect only re-aims it at the same value.
 */
function Score({
  value,
  kind,
  delay,
  motionSafe,
}: {
  value: number;
  kind: SearchRelevance;
  delay: number;
  motionSafe: boolean;
}) {
  const fill = useMotionValue(0);
  React.useEffect(() => {
    if (!motionSafe) {
      fill.set(value);
      return;
    }
    const c = animate(fill, value, { ...springs.glide, delay });
    return () => c.stop();
  }, [value, motionSafe, delay, fill]);
  const scaleX = useTransform(fill, (f) => r2(clamp01(f)));
  const dash = useTransform(fill, (f) => r2(37.7 * (1 - clamp01(f))));
  const pct = Math.round(value * 100);
  if (kind === "off") return null;
  return (
    <span
      role="meter"
      aria-label="Relevance"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct} percent`}
      className="inline-flex shrink-0 items-center gap-1.5"
    >
      {kind === "bar" ? (
        <span className="relative h-1.5 w-12 overflow-clip rounded-full bg-surface-2">
          <motion.span
            className="absolute inset-0 origin-left rounded-full bg-cobalt-bright"
            style={{ scaleX }}
          />
        </span>
      ) : (
        <svg aria-hidden viewBox="0 0 16 16" className="size-4 -rotate-90">
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2"
            className="stroke-surface-2"
          />
          <motion.circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="37.7"
            className="stroke-cobalt-bright"
            style={{ strokeDashoffset: dash }}
          />
        </svg>
      )}
      <span className="w-7 text-right font-mono text-[11px] text-ink-2 tabular-nums">
        {pct}%
      </span>
    </span>
  );
}

/**
 * A chosen source on its way to the tray. Its x travels on glide and its y
 * on a slightly softer spring, so it takes a shallow curve, and both home on
 * the slot's live box every frame (the tray may still be making room).
 */
function Flight({
  ghost,
  target,
  onLand,
}: {
  ghost: Ghost;
  target: (id: string) => Box | null;
  onLand: (key: number) => void;
}) {
  const x = useMotionValue(ghost.from.x);
  const y = useMotionValue(ghost.from.y);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const land = React.useRef(onLand);
  React.useLayoutEffect(() => {
    land.current = onLand;
  });
  React.useEffect(() => {
    px.set(0);
    py.set(0);
    const place = () => {
      const to = target(ghost.id) ?? ghost.from;
      x.set(r2(ghost.from.x + (to.x - ghost.from.x) * px.get()));
      y.set(r2(ghost.from.y + (to.y - ghost.from.y) * py.get()));
    };
    const offX = px.on("change", place);
    const offY = py.on("change", place);
    const a = animate(px, 1, springs.glide);
    const b = animate(py, 1, {
      type: "spring",
      stiffness: 210,
      damping: 29,
      mass: 1,
      onComplete: () => land.current(ghost.key),
    });
    return () => {
      offX();
      offY();
      a.stop();
      b.stop();
    };
  }, [ghost, target, px, py, x, y]);
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-30 inline-flex h-7 max-w-[11rem] items-center gap-1.5 rounded-full border border-cobalt-bright/50 bg-popover pr-2.5 pl-1 text-[12px] whitespace-nowrap text-foreground shadow-[0_6px_18px_color-mix(in_oklab,black_22%,transparent)]"
      style={{ x, y }}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cobalt-bright font-mono text-[10px] text-primary-foreground">
        {ghost.n}
      </span>
      <span className="truncate">{ghost.title}</span>
    </motion.span>
  );
}

/** A result row: it rises in when it arrives and glides when the ranking moves it. */
function ResultRow({
  ref,
  hit,
  index,
  total,
  fresh,
  terms,
  checked,
  full,
  relevance,
  now,
  motionSafe,
  disabled,
  bindCheck,
  bindTitle,
  onToggle,
  onArrow,
  onOpen,
}: {
  ref?: React.Ref<HTMLLIElement>;
  hit: Hit;
  index: number;
  total: number;
  fresh: boolean;
  terms: string[];
  checked: boolean;
  full: boolean;
  relevance: SearchRelevance;
  now: number;
  motionSafe: boolean;
  disabled: boolean;
  bindCheck: (node: HTMLInputElement | null) => void;
  bindTitle: (node: HTMLElement | null) => void;
  onToggle: () => void;
  onArrow: (dir: 1 | -1) => void;
  onOpen?: () => void;
}) {
  const { source, score } = hit;
  // Entering rows start low and faint; rows already on the page never
  // restart, however often the list is re-ranked around them.
  const opacity = useMotionValue(fresh ? 0 : 1);
  const y = useMotionValue(fresh && motionSafe ? distances.step : 0);
  const delay = fresh ? Math.min(index, 8) * cascade(total) : 0;
  React.useEffect(() => {
    const a = animate(opacity, 1, {
      duration: durations.base,
      ease: easings.enter,
      delay,
    });
    const b = motionSafe
      ? animate(y, 0, { ...springs.snap, delay })
      : (y.set(0), null);
    return () => {
      a.stop();
      b?.stop();
    };
  }, [opacity, y, motionSafe, delay]);
  const Icon = KIND_ICON[source.kind];
  const kind = KINDS.find((k) => k.value === source.kind);
  const titleText = <Marked text={source.title} terms={terms} />;
  return (
    <motion.li
      ref={ref}
      layout={motionSafe ? "position" : false}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{ layout: springs.glide }}
      className={cn(
        "relative border-b border-hairline transition-colors",
        checked ? "bg-cobalt-wash" : "hover:bg-surface-2/60",
      )}
      style={{ opacity, y }}
    >
      <div className="flex gap-3 px-3 py-3">
        <span className="relative mt-0.5 inline-flex size-4 shrink-0">
          <input
            ref={bindCheck}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            aria-disabled={(!checked && full) || undefined}
            aria-label={`Use ${source.title} as a source`}
            onChange={onToggle}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                onArrow(event.key === "ArrowDown" ? 1 : -1);
              }
            }}
            className={cn(
              "peer size-4 cursor-pointer appearance-none rounded-1 border border-hairline-strong bg-card transition-colors",
              "checked:border-cobalt-bright checked:bg-cobalt-bright disabled:cursor-not-allowed aria-disabled:opacity-40",
              FOCUS,
            )}
          />
          <Check
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
            strokeWidth={3}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            {onOpen ? (
              <button
                ref={bindTitle}
                type="button"
                disabled={disabled}
                onClick={onOpen}
                title={source.title}
                className={cn(
                  "min-w-0 truncate rounded-1 text-left text-[13.5px] font-medium text-foreground enabled:hover:text-cobalt-bright",
                  FOCUS,
                )}
              >
                {titleText}
              </button>
            ) : (
              <span
                ref={bindTitle}
                title={source.title}
                className="min-w-0 truncate text-[13.5px] font-medium text-foreground"
              >
                {titleText}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
            {source.site}
          </p>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-ink-2">
            <Marked text={source.snippet} terms={terms} />
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
            <span>{kind?.one}</span>
            {source.space ? (
              <>
                <span aria-hidden>·</span>
                <span>{source.space}</span>
              </>
            ) : null}
            <span aria-hidden className="@min-[60rem]:hidden">
              ·
            </span>
            <span className="@min-[60rem]:hidden">
              {ago(source.updated, now)}
            </span>
            <span className="@min-[40rem]:hidden">
              <Score
                value={score}
                kind={relevance}
                delay={delay + 0.08}
                motionSafe={motionSafe}
              />
            </span>
          </p>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 pt-0.5 @min-[40rem]:flex">
          <Score
            value={score}
            kind={relevance}
            delay={delay + 0.08}
            motionSafe={motionSafe}
          />
          <span className="hidden text-[11px] text-ink-3 @min-[60rem]:block">
            {ago(source.updated, now)}
          </span>
        </div>
      </div>
    </motion.li>
  );
}

/**
 * Search, then choose what the answer stands on. The query scores the
 * sources as you type: rows that stay glide to their new rank, rows that
 * leave fade on the exit ease, new rows rise 8px on snap in a cascade, and
 * every relevance readout eases to its new value on glide. Facets narrow
 * the list (OR within a group, AND across groups), their counts rolling on
 * snap.
 *
 * Checking a result pulls it into the tray: a ghost chip leaves the title
 * and flies to its slot, x on glide and y on a softer spring so it travels
 * on a shallow curve, homing on the slot while the tray makes room; it
 * lands on recoil, and the tray's count and the Answer button's roll. The
 * Answer button counts the tray and hands the sources over in order.
 *
 * The checkboxes are native (Up and Down move between them), the tray's
 * remove buttons are a roving toolbar (Delete removes), and Escape clears
 * the query. Under reduced motion nothing flies or slides: chips fade into
 * the tray, rows re-rank at once and the scores are drawn at their values.
 */
export function SourceSearch({
  relevance = "bar",
  facets = "chips",
  tray = "chips",
  sources = defaultSearchSources,
  query,
  defaultQuery = defaultSearchQuery,
  onQueryChange,
  onSearch,
  matching = true,
  selected,
  defaultSelected = [],
  onSelectedChange,
  filters,
  defaultFilters = [],
  onFiltersChange,
  max = 6,
  onAnswer,
  onOpen,
  status = "ready",
  onRetry,
  now,
  placeholder = "Search docs, tickets and code",
  label = "Source search",
  sound = false,
  disabled = false,
  className,
}: SourceSearchProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const inputId = `${uid}-q`;
  const trayLabelId = `${uid}-tray`;
  const cap = Math.max(1, Math.round(max));

  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const q = query ?? ownQuery;
  const [ownSel, setOwnSel] = React.useState(defaultSelected);
  const chosen = selected ?? ownSel;
  const [ownFilters, setOwnFilters] = React.useState(defaultFilters);
  const active = filters ?? ownFilters;

  const nowMs =
    now !== undefined
      ? toMs(now)
      : sources.reduce((m, s) => Math.max(m, s.updated), 0);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------- ranking ------------------------------ */

  const terms = matching ? termsOf(q) : [];
  const matched: Hit[] = sources
    .map((source) => ({
      source,
      score: matching ? scoreOf(source, terms) : clamp01(source.relevance),
    }))
    .filter((h) => h.score > 0);

  const facetOf = (s: SearchSource, group: string) =>
    group === "kind"
      ? s.kind
      : group === "updated"
        ? ageOf(s.updated, nowMs)
        : (s.space ?? "");
  const groups = ["kind", "updated", "space"] as const;
  const picked = (group: string) =>
    active
      .filter((f) => f.startsWith(`${group}:`))
      .map((f) => f.slice(group.length + 1));
  const passes = (s: SearchSource, skip?: string) =>
    groups.every((g) => {
      if (g === skip) return true;
      const want = picked(g);
      return want.length === 0 || want.includes(facetOf(s, g));
    });
  const hits = matched
    .filter((h) => passes(h.source))
    .sort((a, b) => b.score - a.score);
  const countFor = (group: string, value: string) =>
    matched.filter(
      (h) => passes(h.source, group) && facetOf(h.source, group) === value,
    ).length;
  const spaces = [
    ...new Set(sources.map((s) => s.space).filter((s): s is string => !!s)),
  ];
  const facetGroups = [
    {
      key: "kind",
      label: "Type",
      options: KINDS.map((k) => ({ value: k.value, label: k.label })),
    },
    {
      key: "updated",
      label: "Updated",
      options: AGES.map((a) => ({ value: a.value, label: a.label })),
    },
    {
      key: "space",
      label: "Space",
      options: spaces.map((s) => ({ value: s, label: s })),
    },
  ].filter((g) => g.options.length > 0);

  // Rows born in this ranking rise in; rows that were already shown never
  // restart, however the ranking moves them.
  const fresh = useBirths(hits.map((h) => h.source.id));

  // The result count is announced once the query settles, not per key.
  const hitCount = hits.length;
  React.useEffect(() => {
    if (status !== "ready") return;
    const id = window.setTimeout(
      () =>
        setSaid((s) => ({
          n: s.n + 1,
          text: q.trim()
            ? `${plural(hitCount, "result")} for ${q.trim()}.`
            : `${plural(hitCount, "source")}.`,
        })),
      500,
    );
    return () => window.clearTimeout(id);
  }, [q, hitCount, status]);

  /* -------------------------------- tray -------------------------------- */

  const byId = new Map(sources.map((s) => [s.id, s]));
  const inTray = chosen
    .map((id) => byId.get(id))
    .filter((s): s is SearchSource => !!s);
  const full = inTray.length >= cap;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const trayRef = React.useRef<HTMLDivElement | null>(null);

  // The skeleton's shimmer only runs while the surface is on screen.
  const [inView, setInView] = React.useState(true);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setInView(entry.isIntersecting);
    });
    io.observe(root);
    return () => io.disconnect();
  }, []);
  const shimmer = motionSafe && inView;
  const checks = React.useRef(new Map<string, HTMLInputElement>());
  const titles = React.useRef(new Map<string, HTMLElement>());
  const chips = React.useRef(new Map<string, HTMLElement>());
  const removers = React.useRef(new Map<string, HTMLButtonElement>());
  const counter = React.useRef(0);

  const [ghosts, setGhosts] = React.useState<Ghost[]>([]);
  const [flying, setFlying] = React.useState<string[]>([]);
  const [bumped, setBumped] = React.useState<{ id: string; n: number }>({
    id: "",
    n: 0,
  });
  const [warn, setWarn] = React.useState(0);
  const focusChip = React.useRef<string | null>(null);

  const landedCount = inTray.filter((s) => !flying.includes(s.id)).length;
  const freshChip = useBirths(inTray.map((s) => s.id));

  const boxOf = React.useCallback((el: Element | null | undefined) => {
    const root = rootRef.current;
    if (!root || !el) return null;
    const a = root.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return {
      x: r2(b.left - a.left - root.clientLeft),
      y: r2(b.top - a.top - root.clientTop),
    };
  }, []);

  const targetOf = React.useCallback(
    (id: string) =>
      boxOf(tray === "count" ? trayRef.current : chips.current.get(id)) ??
      boxOf(trayRef.current),
    [boxOf, tray],
  );

  const setTray = (next: string[]) => {
    if (selected === undefined) setOwnSel(next);
    onSelectedChange?.(next);
  };

  const toggle = (source: SearchSource) => {
    if (disabled) return;
    const has = chosen.includes(source.id);
    if (!has && full) {
      setWarn((w) => w + 1);
      say(`The tray holds ${plural(cap, "source")}. Remove one first.`);
      return;
    }
    const next = has
      ? chosen.filter((id) => id !== source.id)
      : [...chosen, source.id];
    audio.play("tick", {
      pitch: has ? 0.85 : 1 + next.length * 0.06,
      gain: 0.45,
    });
    if (!has && motionSafe) {
      const from = boxOf(titles.current.get(source.id));
      if (from) {
        counter.current += 1;
        setGhosts((g) => [
          ...g,
          {
            key: counter.current,
            id: source.id,
            n: next.length,
            title: source.title,
            from: { x: from.x - 4, y: r2(from.y - 4) },
          },
        ]);
        setFlying((f) => [...f, source.id]);
      }
    }
    setTray(next);
    say(
      has
        ? `Removed ${source.title.replace(/[.\s]+$/, "")}. ${plural(next.length, "source")} in the tray.`
        : `Added ${source.title.replace(/[.\s]+$/, "")}. ${plural(next.length, "source")} in the tray.`,
    );
  };

  const land = (key: number) => {
    const g = ghosts.find((x) => x.key === key);
    setGhosts((list) => list.filter((x) => x.key !== key));
    if (!g) return;
    setFlying((f) => f.filter((id) => id !== g.id));
    setBumped((b) => ({ id: g.id, n: b.n + 1 }));
    audio.play("pop", { pitch: 0.9 + g.n * 0.05, gain: 0.5 });
  };

  const remove = (id: string, focusNext: boolean) => {
    if (disabled) return;
    const source = byId.get(id);
    const i = chosen.indexOf(id);
    const next = chosen.filter((x) => x !== id);
    audio.play("tick", { pitch: 0.85, gain: 0.45 });
    setTray(next);
    if (focusNext) {
      focusChip.current = next[Math.min(i, next.length - 1)] ?? "__answer";
    }
    if (source) {
      say(
        `Removed ${source.title.replace(/[.\s]+$/, "")}. ${plural(next.length, "source")} in the tray.`,
      );
    }
  };

  const answerRef = React.useRef<HTMLButtonElement | null>(null);
  // Focus moves on from a removed chip once the tray has re-rendered.
  React.useEffect(() => {
    const want = focusChip.current;
    if (!want) return;
    focusChip.current = null;
    if (want === "__answer") answerRef.current?.focus();
    else removers.current.get(want)?.focus();
  }, [chosen]);

  const answer = () => {
    if (disabled || inTray.length === 0) return;
    audio.play("tick", { pitch: 1.3, gain: 0.5 });
    say(`Answering from ${plural(inTray.length, "source")}.`);
    onAnswer?.(inTray, q);
  };

  /* ------------------------------- facets ------------------------------- */

  const toggleFacet = (group: string, value: string) => {
    if (disabled) return;
    const key = `${group}:${value}`;
    const on = active.includes(key);
    const next = on ? active.filter((f) => f !== key) : [...active, key];
    audio.play("tick", { pitch: on ? 0.9 : 1.1, gain: 0.35 });
    if (filters === undefined) setOwnFilters(next);
    onFiltersChange?.(next);
  };

  const setQuery = (next: string) => {
    if (query === undefined) setOwnQuery(next);
    onQueryChange?.(next);
  };

  const focusRow = (from: string, dir: 1 | -1) => {
    const i = hits.findIndex((h) => h.source.id === from);
    const to = hits[i + dir];
    if (to) checks.current.get(to.source.id)?.focus();
    else if (dir === -1) document.getElementById(inputId)?.focus();
  };

  const chipKeys = (event: React.KeyboardEvent, id: string) => {
    const i = inTray.findIndex((s) => s.id === id);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const to = inTray[i + (event.key === "ArrowRight" ? 1 : -1)];
      if (to) removers.current.get(to.id)?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const to = event.key === "Home" ? inTray[0] : inTray[inTray.length - 1];
      if (to) removers.current.get(to.id)?.focus();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(id, true);
    }
  };
  const [rover, setRover] = React.useState<string | null>(null);
  const roving = inTray.some((s) => s.id === rover) ? rover : inTray[0]?.id;

  const chipFacet = (
    <div
      className={cn(
        "relative shrink-0 border-b border-hairline",
        facets === "rail" && "@min-[40rem]:hidden",
      )}
    >
      <div className="flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-16px),transparent)] px-3 py-2">
        {facetGroups.map((g, gi) => (
          <div
            key={g.key}
            role="group"
            aria-label={`Filter by ${g.label.toLowerCase()}`}
            className="flex shrink-0 items-center gap-1.5"
          >
            {gi > 0 ? (
              <span aria-hidden className="mx-1 h-4 w-px bg-hairline-strong" />
            ) : null}
            {g.options.map((o) => {
              const on = active.includes(`${g.key}:${o.value}`);
              const n = countFor(g.key, o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => toggleFacet(g.key, o.value)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors",
                    on
                      ? "border-cobalt-bright/50 bg-cobalt-wash text-foreground"
                      : "border-hairline text-ink-2 enabled:hover:border-hairline-strong enabled:hover:text-foreground",
                    n === 0 && !on && "opacity-50",
                    FOCUS_IN,
                  )}
                >
                  {o.label}
                  <span className="font-mono text-[10px] text-ink-3">
                    <Roll value={n} motionSafe={motionSafe} />
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const railFacet = (
    <div className="hidden w-44 shrink-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain border-r border-hairline px-3 py-3 @min-[40rem]:block @min-[60rem]:w-52">
      {facetGroups.map((g) => (
        <fieldset key={g.key} className="mb-4 last:mb-0" disabled={disabled}>
          <legend className="mb-1.5 text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">
            {g.label}
          </legend>
          {g.options.map((o) => {
            const on = active.includes(`${g.key}:${o.value}`);
            const n = countFor(g.key, o.value);
            return (
              <label
                key={o.value}
                className={cn(
                  "flex h-7 cursor-pointer items-center gap-2 rounded-2 px-1 text-[12.5px] transition-colors hover:bg-surface-2",
                  on ? "text-foreground" : "text-ink-2",
                  n === 0 && !on && "opacity-50",
                )}
              >
                <span className="relative inline-flex size-3.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleFacet(g.key, o.value)}
                    className={cn(
                      "peer size-3.5 cursor-pointer appearance-none rounded-1 border border-hairline-strong bg-card checked:border-cobalt-bright checked:bg-cobalt-bright",
                      FOCUS,
                    )}
                  />
                  <Check
                    aria-hidden
                    strokeWidth={3}
                    className="pointer-events-none absolute inset-0 m-auto size-2.5 text-primary-foreground opacity-0 peer-checked:opacity-100"
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <span className="font-mono text-[10px] text-ink-3">
                  <Roll value={n} motionSafe={motionSafe} />
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      className={cn(
        "@container relative isolate flex h-[540px] w-full flex-col overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) onSearch?.(q);
        }}
        className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 py-2.5"
      >
        <label htmlFor={inputId} className="sr-only">
          Search sources
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3"
          />
          <input
            id={inputId}
            type="search"
            value={q}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && q) {
                // Ours while there is something to clear; the stage's after.
                event.preventDefault();
                setQuery("");
              } else if (event.key === "ArrowDown") {
                const first = hits[0];
                if (first) {
                  event.preventDefault();
                  checks.current.get(first.source.id)?.focus();
                }
              }
            }}
            className={cn(
              "h-9 w-full rounded-2 border border-hairline bg-surface-2 pr-8 pl-8 text-[13.5px] text-foreground placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden",
              FOCUS_IN,
            )}
          />
          {q ? (
            <button
              type="button"
              aria-label="Clear search"
              disabled={disabled}
              onClick={() => {
                setQuery("");
                document.getElementById(inputId)?.focus();
              }}
              className={cn(
                "absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-1 text-ink-3 enabled:hover:text-foreground",
                FOCUS_IN,
              )}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>
        <span className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-ink-3 @min-[30rem]:inline-flex">
          <Roll value={hits.length} motionSafe={motionSafe} />{" "}
          {hits.length === 1 ? "result" : "results"}
        </span>
      </form>

      {facets !== "off" ? chipFacet : null}

      <div className="flex flex-1 overflow-hidden">
        {facets === "rail" ? railFacet : null}
        <div className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          {status === "searching" ? (
            <ul aria-label="Searching" className="flex flex-col">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="flex gap-3 border-b border-hairline px-3 py-3"
                >
                  <span className="mt-0.5 size-4 shrink-0 rounded-1 bg-surface-2" />
                  <span className="flex flex-1 flex-col gap-2">
                    {[46, 30, 88, 72].map((w, j) => (
                      <motion.span
                        key={j}
                        className="h-2.5 rounded-full bg-surface-2"
                        style={{ width: `${w - i * 6}%` }}
                        initial={{ opacity: 0.5 }}
                        animate={shimmer ? { opacity: 1 } : { opacity: 0.8 }}
                        transition={
                          shimmer
                            ? {
                                duration: 0.7,
                                ease: easings.move,
                                repeat: Infinity,
                                repeatType: "reverse",
                                delay: (i + j) * 0.08,
                              }
                            : { duration: 0 }
                        }
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : status === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-[13px] text-foreground">
                Search did not complete.
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors enabled:hover:bg-surface-2",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Retry
              </button>
            </div>
          ) : hits.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-[13px] text-foreground">
                {q.trim()
                  ? `Nothing matches “${q.trim()}”.`
                  : "Nothing matches these filters."}
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setQuery("");
                  if (filters === undefined) setOwnFilters([]);
                  onFiltersChange?.([]);
                }}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors enabled:hover:bg-surface-2",
                  FOCUS,
                )}
              >
                Clear search
              </button>
            </div>
          ) : (
            <ol role="list" aria-label="Results" className="flex flex-col">
              <AnimatePresence initial={false} mode="popLayout">
                {hits.map((hit, i) => (
                  <ResultRow
                    key={hit.source.id}
                    hit={hit}
                    index={i}
                    total={hits.length}
                    fresh={fresh(hit.source.id)}
                    terms={terms}
                    checked={chosen.includes(hit.source.id)}
                    full={full}
                    relevance={relevance}
                    now={nowMs}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    bindCheck={(node) => {
                      if (node) checks.current.set(hit.source.id, node);
                      else checks.current.delete(hit.source.id);
                    }}
                    bindTitle={(node) => {
                      if (node) titles.current.set(hit.source.id, node);
                      else titles.current.delete(hit.source.id);
                    }}
                    onToggle={() => toggle(hit.source)}
                    onArrow={(dir) => focusRow(hit.source.id, dir)}
                    onOpen={
                      onOpen
                        ? () => {
                            if (!disabled) onOpen(hit.source);
                          }
                        : undefined
                    }
                  />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>
      </div>

      {/* The tray. */}
      <div
        ref={trayRef}
        role="group"
        aria-labelledby={trayLabelId}
        className="flex shrink-0 flex-col gap-2 border-t border-hairline bg-surface-1 px-3 pt-2.5 pb-3 @min-[40rem]:flex-row @min-[40rem]:items-end @min-[40rem]:gap-3"
      >
        <div className="min-w-0 flex-1">
          <motion.p
            key={warn}
            id={trayLabelId}
            className="mb-1.5 flex items-center gap-1.5 text-[11px] text-ink-3"
            initial={warn ? { x: motionSafe ? 4 : 0 } : false}
            animate={{ x: 0 }}
            transition={motionSafe ? springs.recoil : { duration: 0 }}
          >
            <Sparkles aria-hidden className="size-3 text-cobalt-bright" />
            <span className="inline-flex items-center gap-1 text-ink-2">
              Grounded on <Roll value={landedCount} motionSafe={motionSafe} />{" "}
              {landedCount === 1 ? "source" : "sources"}
            </span>
            <span className={cn(full ? "text-warn" : "text-ink-3")}>
              · {full ? `${cap} of ${cap} · full` : `up to ${cap}`}
            </span>
          </motion.p>
          {tray === "count" ? (
            <div className="flex h-8 items-center gap-2">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline-strong bg-card px-2.5 text-[12px]">
                <span className="inline-flex items-center gap-0.5">
                  {inTray.length === 0 ? (
                    <span className="size-1.5 rounded-full bg-hairline-strong" />
                  ) : (
                    inTray.map((s) => (
                      <span
                        key={s.id}
                        className={cn(
                          "size-1.5 rounded-full transition-opacity",
                          KIND_TINT[s.kind],
                          flying.includes(s.id) && "opacity-0",
                        )}
                      />
                    ))
                  )}
                </span>
                <Roll value={landedCount} motionSafe={motionSafe} />{" "}
                {landedCount === 1 ? "source" : "sources"}
              </span>
              {inTray.length > 0 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setTray([]);
                    say("The tray is empty.");
                  }}
                  className={cn(
                    "inline-flex h-7 items-center rounded-2 px-2 text-[12px] text-ink-3 enabled:hover:text-foreground",
                    FOCUS,
                  )}
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : inTray.length === 0 ? (
            <p className="flex h-8 items-center text-[12px] text-ink-3">
              Check results to ground the answer on them.
            </p>
          ) : (
            <div
              role="toolbar"
              aria-label="Sources in the tray"
              className={cn(
                "group/source-search flex items-center",
                tray === "stack"
                  ? "h-8 pl-1"
                  : "[scrollbar-width:none] gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)] @min-[40rem]:max-h-[4.25rem] @min-[40rem]:flex-wrap @min-[40rem]:overflow-y-auto @min-[40rem]:[mask-image:none] @min-[60rem]:max-h-none @min-[60rem]:flex-nowrap",
              )}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {inTray.map((s, i) => {
                  const airborne = flying.includes(s.id);
                  return (
                    <motion.div
                      key={s.id}
                      layout={motionSafe ? "position" : false}
                      className={cn(
                        "shrink-0",
                        tray === "stack" &&
                          "transition-[margin] duration-200 not-first:-ml-3 group-focus-within/source-search:not-first:ml-1 group-hover/source-search:not-first:ml-1",
                      )}
                      style={{ zIndex: inTray.length - i }}
                      exit={{
                        opacity: 0,
                        scale: motionSafe ? 0.9 : 1,
                        transition: exitFor(durations.base),
                      }}
                      transition={{ layout: springs.glide }}
                    >
                      <Chip
                        bind={(node) => {
                          if (node) chips.current.set(s.id, node);
                          else chips.current.delete(s.id);
                        }}
                        source={s}
                        n={i + 1}
                        stack={tray === "stack"}
                        fresh={freshChip(s.id)}
                        hidden={airborne}
                        bump={bumped.id === s.id ? bumped.n : 0}
                        motionSafe={motionSafe}
                      >
                        <button
                          ref={(node) => {
                            if (node) removers.current.set(s.id, node);
                            else removers.current.delete(s.id);
                          }}
                          type="button"
                          tabIndex={roving === s.id ? 0 : -1}
                          aria-label={`Remove ${s.title}`}
                          disabled={disabled}
                          onFocus={() => setRover(s.id)}
                          onClick={() => remove(s.id, true)}
                          onKeyDown={(event) => chipKeys(event, s.id)}
                          className={cn(
                            tray === "stack"
                              ? "absolute inset-0 rounded-2"
                              : "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                            FOCUS,
                          )}
                        >
                          {tray === "stack" ? null : (
                            <X aria-hidden className="size-3" />
                          )}
                        </button>
                      </Chip>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
        <button
          ref={answerRef}
          type="button"
          disabled={disabled || landedCount === 0}
          onClick={answer}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3.5 text-[13px] font-medium transition-colors",
            "enabled:bg-primary enabled:text-primary-foreground enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3",
            FOCUS,
          )}
        >
          {landedCount === 0 ? (
            "Pick sources to answer"
          ) : (
            <>
              <Sparkles aria-hidden className="size-4" />
              Answer from <Roll
                value={landedCount}
                motionSafe={motionSafe}
              />{" "}
              {landedCount === 1 ? "source" : "sources"}
            </>
          )}
        </button>
      </div>

      {ghosts.map((g) => (
        <Flight key={g.key} ghost={g} target={targetOf} onLand={land} />
      ))}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** A source in the tray. It lands on recoil when its flight ends. */
function Chip({
  bind,
  source,
  n,
  stack,
  fresh,
  hidden,
  bump,
  motionSafe,
  children,
}: {
  bind: (node: HTMLElement | null) => void;
  source: SearchSource;
  n: number;
  stack: boolean;
  /** Arrived after the first render: it fades in rather than being there. */
  fresh: boolean;
  hidden: boolean;
  bump: number;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const scale = useMotionValue(1);
  const opacity = useMotionValue(hidden || fresh ? 0 : 1);
  React.useEffect(() => {
    if (hidden) {
      opacity.set(0);
      return;
    }
    if (bump && motionSafe) {
      opacity.set(1);
      scale.set(0.9);
      const c = animate(scale, 1, springs.recoil);
      return () => c.stop();
    }
    const c = animate(opacity, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
    return () => c.stop();
  }, [hidden, bump, motionSafe, opacity, scale]);
  const Icon = KIND_ICON[source.kind];
  if (stack) {
    return (
      <motion.span
        ref={bind}
        title={source.title}
        className="relative flex size-8 items-center justify-center rounded-2 border border-hairline-strong bg-popover shadow-[0_2px_6px_color-mix(in_oklab,black_14%,transparent)]"
        style={{ scale, opacity }}
      >
        <span className="font-mono text-[11px] text-foreground">{n}</span>
        <Icon
          aria-hidden
          className="absolute right-0.5 bottom-0.5 size-2.5 text-ink-3"
        />
        {children}
      </motion.span>
    );
  }
  return (
    <motion.span
      ref={bind}
      className="inline-flex h-7 max-w-[13rem] items-center gap-1.5 rounded-full border border-hairline-strong bg-popover pr-1 pl-1 text-[12px] text-foreground"
      style={{ scale, opacity }}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cobalt-bright font-mono text-[10px] text-primary-foreground">
        {n}
      </span>
      <Icon aria-hidden className="size-3 shrink-0 text-ink-3" />
      <span className="min-w-0 truncate" title={source.title}>
        {source.title}
      </span>
      {children}
    </motion.span>
  );
}
